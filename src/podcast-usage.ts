/**
 * Anti-abuse for /podcast: daily cap per group + cooldown between runs.
 * Persisted as a single JSON file on the volume so it survives restarts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { cdmxDateString } from "./time.js";

const USAGE_FILE = process.env.PODCAST_USAGE_FILE ?? "/data/podcast-usage.json";
const MAX_PER_DAY = parseInt(process.env.PODCAST_MAX_PER_DAY ?? "2", 10);
const COOLDOWN_MS = parseInt(process.env.PODCAST_COOLDOWN_MS ?? "1800000", 10); // 30 min

interface UsageEntry {
  date: string;
  count: number;
  lastRunAt: number;
}

type UsageStore = Record<string, UsageEntry>; // key = JID

function load(): UsageStore {
  if (!existsSync(USAGE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(USAGE_FILE, "utf-8")) as UsageStore;
  } catch {
    return {};
  }
}

function save(store: UsageStore): void {
  const dir = dirname(USAGE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(USAGE_FILE, JSON.stringify(store, null, 2));
}

export type PodcastCheck =
  | { ok: true }
  | { ok: false; reason: string };

export function canRunPodcast(jid: string): PodcastCheck {
  const today = cdmxDateString();
  const store = load();
  const entry = store[jid];

  if (!entry || entry.date !== today) return { ok: true };

  if (entry.count >= MAX_PER_DAY) {
    return {
      ok: false,
      reason: `Ya se hicieron ${MAX_PER_DAY} podcasts hoy en este grupo. Mañana hacemos otro 🦥`,
    };
  }

  const sinceLast = Date.now() - entry.lastRunAt;
  if (sinceLast < COOLDOWN_MS) {
    const minutesLeft = Math.ceil((COOLDOWN_MS - sinceLast) / 60000);
    return {
      ok: false,
      reason: `Espérate unos ${minutesLeft} min antes del próximo podcast 🦥`,
    };
  }

  return { ok: true };
}

/**
 * Call after a successful podcast delivery to register the run against the cap.
 * Failed podcasts should NOT call this (graceful — don't punish TTS errors).
 */
export function recordPodcastRun(jid: string): void {
  const today = cdmxDateString();
  const store = load();
  const entry = store[jid];
  const now = Date.now();

  if (!entry || entry.date !== today) {
    store[jid] = { date: today, count: 1, lastRunAt: now };
  } else {
    entry.count += 1;
    entry.lastRunAt = now;
  }
  save(store);
}
