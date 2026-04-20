/**
 * Text-to-speech + transcode to WhatsApp-native voice note format.
 *
 * Pipeline: text → ElevenLabs (MP3) → ffmpeg (OGG/Opus) → Baileys sendMessage(ptt:true)
 */

import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "";
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";

export function isTTSConfigured(): boolean {
  return !!(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID);
}

/**
 * Call ElevenLabs TTS. Returns an MP3 buffer.
 */
export async function synthesize(text: string): Promise<Buffer> {
  if (!ELEVENLABS_API_KEY) throw new Error("Missing ELEVENLABS_API_KEY");
  if (!ELEVENLABS_VOICE_ID) throw new Error("Missing ELEVENLABS_VOICE_ID");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.75,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs TTS ${res.status}: ${errText.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Transcode MP3 → OGG/Opus, the native format for WhatsApp voice notes.
 * Uses the bundled ffmpeg-static binary — no system ffmpeg required.
 */
export async function mp3ToOggOpus(mp3: Buffer): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not found");

  return await new Promise((resolve, reject) => {
    const ff = spawn(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel", "error",
        "-i", "pipe:0",
        "-c:a", "libopus",
        "-b:a", "64k",
        "-ar", "48000",
        "-ac", "1",
        "-f", "ogg",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    ff.stdout.on("data", (c) => stdoutChunks.push(c));
    ff.stderr.on("data", (c) => stderrChunks.push(c));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code !== 0) {
        const err = Buffer.concat(stderrChunks).toString();
        return reject(new Error(`ffmpeg exited ${code}: ${err.slice(0, 300)}`));
      }
      resolve(Buffer.concat(stdoutChunks));
    });

    ff.stdin.write(mp3);
    ff.stdin.end();
  });
}

/**
 * Convenience: text → OGG/Opus buffer ready for `sock.sendMessage(..., { audio, ptt: true })`.
 */
export async function textToVoiceNoteBuffer(text: string): Promise<Buffer> {
  const mp3 = await synthesize(text);
  return mp3ToOggOpus(mp3);
}
