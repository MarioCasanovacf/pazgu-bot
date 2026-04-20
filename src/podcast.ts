/**
 * Podcast narration generator.
 *
 * Reads transcripts of every group for a given date, asks Claude to produce
 * an audio-optimized narration (no markdown, no emojis, spoken transitions),
 * and returns the final text ready for TTS.
 *
 * This is independent of the conversational agent — it does NOT touch
 * session history, and it uses its own system prompt tuned for audio.
 */

import Anthropic from "@anthropic-ai/sdk";
import { runGroupMessages } from "./tools/group-messages.js";

const MODEL = "claude-sonnet-4-6";
// Adaptive thinking shares this budget with the final narration text.
// 16k matches the conversational agent and leaves plenty of headroom for
// both a long internal reasoning pass over the full day's transcript and a
// ~1500-character spoken narration.
const MAX_TOKENS = 16_000;

const OUTRO = "Este recap viene powered by HAI — Hugo Artificial Intelligence.";

const AUDIO_SYSTEM_PROMPT = `Eres el narrador del podcast diario de la comunidad Cortos y Largos — el grupo de WhatsApp del podcast homónimo de Francisco "Paco" Vázquez Ahued y Walter Buchanan, ambos CFAs. La comunidad es de profesionales e interesados serios en finanzas, macro, geopolítica y sesgos conductuales. El día a día en el chat es casual, con banter mexicano crudo (gatuseo) entre amigos, mezclado con discusión financiera a ratos.

Tu tarea: escribir la narración de un podcast recap que será convertido a AUDIO por TTS y enviado como nota de voz al grupo General. El narrador es neutral (no reveles género). Tú no eres Pazgu — Pazgu es el oso perezoso del grupo, pero el podcast tiene voz propia.

REGLAS DE FORMATO (críticas para TTS):
- Texto plano. NUNCA asteriscos, NUNCA bullets, NUNCA "---", NUNCA emojis, NUNCA headers.
- NUNCA digas la palabra "emoji", ni leas emojis del transcript ("corazón", "risa", etc.).
- Transiciones habladas entre temas: "Después de ese tema", "Por otro lado", "Ya más tarde", "En otra conversación del día", "Pasando a", "Mientras tanto en el grupo de X".
- Nombra los grupos en prosa cuando sea relevante: "En el grupo general", "En el de macro", "En showcase".
- Nombres: primer nombre. Si hay homónimos (dos Gabriel, dos Jaime), usa nombre completo.
- Si una persona aparece en el transcript sólo como "…1234" sin nombre, NO leas los cuatro dígitos. Di "alguien", "un miembro", o redacta sin sujeto ("se comentó", "se preguntó").
- Jerga financiera intacta: duration, carry, BEI, curva, Sharpe, DXY, drawdown, etc. No traduzcas.
- Comillas sólo para citas verbatim. Parafrasea sin comillas si no es textual.
- NO moralices sobre el tono del chat. Si hubo gatuseo, lo mencionas como parte del día sin juzgar.
- NO des view direccional ni consejo de inversión. Reportas qué piensan los miembros, no tu opinión.
- No inventes. Si algo no está en el transcript, no está en el recap.

ESTRUCTURA DEL GUION (1200–1800 caracteres):
1. Intro dinámica de 1–2 frases que refleje el MOOD del día — nunca "Bienvenidos a otro episodio del recap" genérico. Arranca con algo específico:
   - "Ayer el grupo se puso denso con lo de la curva en Estados Unidos."
   - "Día tranquilo en Cortos y Largos, casi todo fue gatuseo."
   - "Hubo un debate largo sobre Banxico, les cuento."
2. Tres a cinco bloques temáticos con transiciones habladas. Organiza por tema, no cronológicamente.
3. Cierre breve: "Eso fue todo de ayer", "Y así cerró el día", "Nos vemos mañana".

NO añadas la firma "powered by HAI" — el sistema la añade automáticamente después.

Devuelve SÓLO la narración lista para ser leída en voz alta. Nada de preámbulos, nada de notas al margen.`;

/**
 * Generate the podcast narration text for a given date (YYYY-MM-DD).
 * The outro is appended deterministically after Claude's output.
 *
 * Throws if there are no messages for the date.
 */
export async function generatePodcastNarration(date: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const transcript = await runGroupMessages({ group: "all", date });
  if (!transcript || transcript.startsWith("No messages")) {
    throw new Error(`No hay mensajes registrados para ${date}.`);
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: AUDIO_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Transcripciones de todos los grupos de Cortos y Largos del día ${date}:\n\n${transcript}\n\nEscribe la narración del podcast recap.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    // Log the shape of what we got so next failure is diagnosable.
    const blockTypes = response.content.map((b) => b.type).join(",");
    console.error(
      `[podcast] No text block. stop_reason=${response.stop_reason} blocks=[${blockTypes}] ` +
      `usage=in:${response.usage.input_tokens} out:${response.usage.output_tokens}`,
    );
    throw new Error("Claude devolvió una narración vacía.");
  }

  const narration = textBlock.text.trim();
  if (!narration) {
    console.error(`[podcast] Empty text block. stop_reason=${response.stop_reason}`);
    throw new Error("Claude devolvió una narración vacía.");
  }
  return `${narration}\n\n${OUTRO}`;
}
