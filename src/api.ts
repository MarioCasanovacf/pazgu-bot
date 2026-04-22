/**
 * Health check endpoint for Railway.
 */

import express from "express";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { getSocket } from "./whatsapp.js";

const MESSAGES_DIR = process.env.MESSAGES_DIR ?? "/data/messages";
const API_KEY = process.env.API_KEY ?? "";

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!API_KEY) return next();
  const key = req.headers["x-api-key"] ?? req.query.key;
  if (key !== API_KEY) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

export function startHealthServer(port: number): void {
  const app = express();

  app.get("/health", (_req, res) => {
    const sock = getSocket();
    const connected = sock?.user ? true : false;

    res.json({
      status: connected ? "ok" : "waiting",
      bot: "pazgu-bot",
      connected,
      user: sock?.user?.id ?? null,
      uptime: Math.floor(process.uptime()),
    });
  });

  // List available message files
  app.get("/messages", authMiddleware, (_req, res) => {
    if (!existsSync(MESSAGES_DIR)) return res.json({ files: [] });
    const files = readdirSync(MESSAGES_DIR).filter(f => f.endsWith(".jsonl")).sort();
    res.json({ files });
  });

  // Get messages for a specific file (e.g. 2026-03-27_general)
  app.get("/messages/:file", authMiddleware, (req, res) => {
    const param = req.params.file as string;
    const name = param.endsWith(".jsonl") ? param : `${param}.jsonl`;
    const file = join(MESSAGES_DIR, name);
    if (!existsSync(file)) return res.status(404).json({ error: "No messages for this file" });
    const lines = readFileSync(file, "utf-8").trim().split("\n").map(l => JSON.parse(l));
    res.json({ file: name, count: lines.length, messages: lines });
  });

  // Resolve a phone number to a WhatsApp JID via Baileys. Useful to whitelist
  // personal contacts who aren't in any group (so their JID never appears in
  // logs naturally). Phone must be international format, with or without `+`.
  app.get("/resolve-jid", authMiddleware, async (req, res) => {
    const phone = (req.query.phone as string ?? "").replace(/\D/g, "");
    if (!phone) return res.status(400).json({ error: "Missing phone query param" });
    const sock = getSocket();
    if (!sock) return res.status(503).json({ error: "WhatsApp socket not connected" });
    try {
      const result = await sock.onWhatsApp(phone);
      res.json({ phone, result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Send a proactive WhatsApp message as Pazgu to any JID. Operator-only
  // (gated by API_KEY). Body: { jid: string, text: string }.
  app.post("/send", express.json(), authMiddleware, async (req, res) => {
    const { jid, text } = req.body ?? {};
    if (!jid || !text) return res.status(400).json({ error: "Missing jid or text" });
    const sock = getSocket();
    if (!sock) return res.status(503).json({ error: "WhatsApp socket not connected" });
    try {
      const result = await sock.sendMessage(jid, { text });
      res.json({ ok: true, id: result?.key?.id ?? null });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.listen(port, () => {
    console.log(`[api] Health check on :${port}/health`);
  });
}
