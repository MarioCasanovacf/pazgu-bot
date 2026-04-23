/**
 * Pazgu sleep state, persisted to disk so it survives restarts.
 *
 * When asleep, Pazgu ignores every incoming message except `/despertar`
 * (or `/wake`) from an admin. When awake, normal flow resumes. Useful
 * when the operator wants to silence the bot temporarily without
 * redeploying or nuking the Railway service.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const STATE_FILE =
  process.env.SLEEP_STATE_FILE ??
  (existsSync("/data") ? "/data/sleep-state.json" : "./sleep-state.json");

interface SleepState {
  asleep: boolean;
  since: string;
}

export function isAsleep(): boolean {
  if (!existsSync(STATE_FILE)) return false;
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, "utf-8")) as SleepState;
    return !!data.asleep;
  } catch {
    return false;
  }
}

export function setAsleep(asleep: boolean): void {
  const dir = dirname(STATE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const state: SleepState = { asleep, since: new Date().toISOString() };
  writeFileSync(STATE_FILE, JSON.stringify(state), "utf-8");
}
