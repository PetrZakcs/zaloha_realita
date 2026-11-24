// Run with: deno test --allow-env --allow-net --no-check --node-modules-dir=none supabase/functions/announce-top-doers/index.test.ts

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createHandler, formatAnnouncement } from "./index.ts";

Deno.env.set("CRON_SECRET", "secret");
Deno.env.set("DISCORD_WEBHOOK_URL", "https://discord.test/hook");

function run(opts: { secret?: string; doers?: unknown[]; status?: number } = {}) {
  const sent: string[] = [];
  const handler = createHandler({
    createSupabaseClient: () => ({ rpc: () => Promise.resolve({ data: opts.doers ?? [], error: null }) }),
    send: (_url, content) => {
      sent.push(content);
      return Promise.resolve(new Response(null, { status: opts.status ?? 204 }));
    },
  });
  const res = handler(new Request("https://x", { method: "POST", headers: { "x-cron-secret": opts.secret ?? "secret" } }));
  return { res, sent };
}

Deno.test("a wrong secret is refused", async () => {
  const { res, sent } = run({ secret: "guess" });
  assertEquals((await res).status, 401);
  assertEquals(sent.length, 0);
});

Deno.test("an empty week posts nothing", async () => {
  const { res, sent } = run();
  assertEquals((await res).status, 200);
  assertEquals(sent.length, 0);
});

Deno.test("the announcement lists players in order", async () => {
  const { res, sent } = run({ doers: [{ display_name: "Anna", week_xp: 120 }, { display_name: null, week_xp: 50 }] });
  assertEquals((await res).status, 200);
  assertEquals(sent[0], "**Top Doers tohoto týdne**\n1. Anna · 120 XP\n2. Hráč · 50 XP");
});

Deno.test("a Discord failure is reported", async () => {
  const { res } = run({ doers: [{ display_name: "Anna", week_xp: 1 }], status: 500 });
  assertEquals((await res).status, 502);
});

Deno.test("no players means no message", () => {
  assertEquals(formatAnnouncement([]), null);
});
