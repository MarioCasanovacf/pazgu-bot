/**
 * Date helpers pinned to America/Mexico_City so daily ranges (logs,
 * summaries, "today"/"yesterday") match the community's actual clock
 * instead of the server's UTC wall time.
 */

const CDMX_TZ = "America/Mexico_City";

const cdmxFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CDMX_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Returns YYYY-MM-DD for the given instant in CDMX time (defaults to now). */
export function cdmxDateString(date: Date = new Date()): string {
  return cdmxFormatter.format(date);
}

/** YYYY-MM-DD of the CDMX day N days before the given instant. */
export function cdmxDateStringOffset(days: number, from: Date = new Date()): string {
  const shifted = new Date(from.getTime() + days * 86_400_000);
  return cdmxDateString(shifted);
}
