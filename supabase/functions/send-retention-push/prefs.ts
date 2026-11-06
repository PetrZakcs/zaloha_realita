// Game Bible · Retention "NOTIFICATION FREQUENCY": category opt-outs + quiet hours, set by the
// player (notification_preferences). Pure helpers so they can be unit-tested.

export type NotificationPrefs = {
  categories_off?: string[] | null;
  quiet_start?: number | null;
  quiet_end?: number | null;
  timezone?: string | null;
};

// Which Retention taxonomy category each push kind belongs to.
export const KIND_CATEGORY: Record<string, string> = {
  morning: "action",
  evening: "action",
  inactive_48h: "comeback",
};

export function hourIn(timezone: string, now: Date): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: timezone }).format(now);
    return parseInt(formatted, 10) % 24;
  } catch {
    return now.getUTCHours();
  }
}

// Quiet window [start, end) in local hours; wraps over midnight (22 → 7).
export function isQuietHour(hour: number, start?: number | null, end?: number | null): boolean {
  if (start == null || end == null || start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function allowedToSend(kind: string, prefs: NotificationPrefs | undefined, now: Date): boolean {
  if (!prefs) return true;
  const category = KIND_CATEGORY[kind];
  if (category && (prefs.categories_off || []).includes(category)) return false;
  return !isQuietHour(hourIn(prefs.timezone || "Europe/Prague", now), prefs.quiet_start, prefs.quiet_end);
}
