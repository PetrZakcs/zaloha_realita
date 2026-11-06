import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { allowedToSend, isQuietHour } from "./prefs.ts";

Deno.test("isQuietHour handles plain and overnight windows", () => {
  assertEquals(isQuietHour(23, 22, 7), true);
  assertEquals(isQuietHour(6, 22, 7), true);
  assertEquals(isQuietHour(7, 22, 7), false);
  assertEquals(isQuietHour(13, 12, 14), true);
  assertEquals(isQuietHour(14, 12, 14), false);
  assertEquals(isQuietHour(3, null, 7), false);
});

Deno.test("allowedToSend respects category opt-outs and quiet hours", () => {
  const noon = new Date("2026-10-13T10:00:00Z"); // 12:00 in Prague (CEST)
  assertEquals(allowedToSend("morning", undefined, noon), true);
  assertEquals(allowedToSend("morning", { categories_off: ["action"] }, noon), false);
  assertEquals(allowedToSend("inactive_48h", { categories_off: ["action"] }, noon), true);
  assertEquals(allowedToSend("evening", { quiet_start: 11, quiet_end: 13, timezone: "Europe/Prague" }, noon), false);
  assertEquals(allowedToSend("evening", { quiet_start: 22, quiet_end: 7, timezone: "Europe/Prague" }, noon), true);
});
