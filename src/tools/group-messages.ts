/**
 * Tool: get_group_messages
 *
 * Admin-only tool to read logged messages from a specific WhatsApp group.
 * Only wired into DM sessions (see agent.ts), so only Ricardo's DM can call it.
 */

import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { cdmxDateString, cdmxDateStringOffset } from "../time.js";

type Details = Record<string, unknown>;

const MESSAGES_DIR = process.env.MESSAGES_DIR ?? "/data/messages";

function loadGroupNames(): Record<string, string> {
  return Object.fromEntries(
    (process.env.GROUP_NAMES ?? "")
      .split(",")
      .filter(Boolean)
      .map((entry) => {
        const [jid, name] = entry.split(":");
        return [jid.trim(), name.trim()];
      }),
  );
}

function resolveDate(input: string | undefined): string {
  if (!input || input === "today" || input === "hoy") return cdmxDateString();
  if (input === "yesterday" || input === "ayer") return cdmxDateStringOffset(-1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  throw new Error(`Invalid date "${input}". Use YYYY-MM-DD, "today", or "yesterday".`);
}

interface LoggedMessage {
  ts: string;
  sender: string;
  text: string;
  group?: string;
}

function readJsonl(file: string): LoggedMessage[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LoggedMessage];
      } catch {
        return [];
      }
    });
}

function formatMessages(msgs: LoggedMessage[]): string {
  return msgs
    .map((m) => {
      const time = new Date(m.ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });
      const sender = m.sender.split("@")[0].slice(-6);
      return `[${time}] ${sender}: ${m.text}`;
    })
    .join("\n");
}

const parameters = Type.Object({
  group: Type.String({
    description:
      'Group alias as configured in GROUP_NAMES env. Use "list" to see available aliases, or "all" to read every group for the given date.',
  }),
  date: Type.Optional(
    Type.String({
      description: 'Date in YYYY-MM-DD format. Also accepts "today" (default), "yesterday", "hoy", "ayer".',
    }),
  ),
});

export const groupMessagesTool = defineTool<typeof parameters, Details>({
  name: "get_group_messages",
  label: "Read group messages",
  description:
    "Reads logged messages from a WhatsApp group the bot is in. Use this when the user asks for a summary, report, or analysis of what happened in a specific group. Returns messages in chronological order with [HH:MM] sender: text format. Senders are anonymized to the last 6 chars of their phone.",
  promptSnippet:
    "get_group_messages: read logged messages from a specific WhatsApp group by alias (for admin summaries).",
  parameters,
  async execute(_toolCallId, params) {
    const groupNames = loadGroupNames();
    const aliasToJid: Record<string, string> = {};
    for (const [jid, name] of Object.entries(groupNames)) aliasToJid[name] = jid;

    if (params.group === "list") {
      const aliases = Object.values(groupNames);
      const text = aliases.length
        ? `Available group aliases:\n${aliases.map((a) => `- ${a}`).join("\n")}`
        : "No groups configured in GROUP_NAMES env.";
      return { content: [{ type: "text", text }], details: { aliases } };
    }

    const date = resolveDate(params.date);

    if (params.group === "all") {
      if (!existsSync(MESSAGES_DIR)) {
        return { content: [{ type: "text", text: "No messages directory." }], details: {} };
      }
      const files = readdirSync(MESSAGES_DIR).filter((f) => f.startsWith(`${date}_`) && f.endsWith(".jsonl"));
      if (files.length === 0) {
        return {
          content: [{ type: "text", text: `No messages logged for ${date}.` }],
          details: { date, groups: [] },
        };
      }
      const sections = files.map((f) => {
        const alias = f.slice(date.length + 1, -".jsonl".length);
        const msgs = readJsonl(join(MESSAGES_DIR, f));
        return `=== ${alias} (${msgs.length} messages) ===\n${formatMessages(msgs) || "(empty)"}`;
      });
      return {
        content: [{ type: "text", text: sections.join("\n\n") }],
        details: { date, groups: files.length },
      };
    }

    const jid = aliasToJid[params.group];
    if (!jid) {
      const available = Object.values(groupNames).join(", ") || "(none)";
      throw new Error(`Unknown group alias "${params.group}". Available: ${available}`);
    }

    const alias = groupNames[jid];
    const files = [
      join(MESSAGES_DIR, `${date}_${alias}.jsonl`),
      join(MESSAGES_DIR, `${date}.jsonl`),
    ];

    const collected: LoggedMessage[] = [];
    for (const f of files) {
      for (const m of readJsonl(f)) {
        if (m.group && m.group !== jid) continue;
        collected.push(m);
      }
    }

    if (collected.length === 0) {
      return {
        content: [{ type: "text", text: `No messages logged for "${params.group}" on ${date}.` }],
        details: { group: params.group, date, count: 0 },
      };
    }

    const header = `Messages from "${params.group}" on ${date} (${collected.length} total):\n`;
    return {
      content: [{ type: "text", text: header + formatMessages(collected) }],
      details: { group: params.group, date, count: collected.length },
    };
  },
});
