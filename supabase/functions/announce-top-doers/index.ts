// Supabase Edge Function: announce-top-doers
// spec-12 §5.3: posts the weekly Top Doers to Discord. A cron job calls it once a week.
//
// Secrets: DISCORD_WEBHOOK_URL (channel webhook from the client), CRON_SECRET.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

type Doer = { display_name: string | null; week_xp: number };

export function formatAnnouncement(doers: Doer[]): string | null {
  if (doers.length === 0) return null;
  const lines = doers.map((d, i) => `${i + 1}. ${d.display_name || "Hráč"} · ${d.week_xp} XP`);
  return ["**Top Doers tohoto týdne**", ...lines].join("\n");
}

export function createHandler(deps: {
  // deno-lint-ignore no-explicit-any
  createSupabaseClient: (url: string, key: string) => any;
  send: (url: string, content: string) => Promise<Response>;
}) {
  return async function handler(req: Request): Promise<Response> {
    const secret = Deno.env.get("CRON_SECRET") || "";
    if (!secret || req.headers.get("x-cron-secret") !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }

    const webhook = Deno.env.get("DISCORD_WEBHOOK_URL") || "";
    if (!webhook) {
      console.error("announce-top-doers: DISCORD_WEBHOOK_URL is not configured");
      return new Response("Not configured", { status: 503 });
    }

    const supabase = deps.createSupabaseClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );
    const { data, error } = await supabase.rpc("get_weekly_top_doers", { p_limit: 5 });
    if (error) {
      console.error("announce-top-doers: loading failed:", error);
      return new Response("Failed", { status: 500 });
    }

    const content = formatAnnouncement(data || []);
    if (!content) return new Response(JSON.stringify({ sent: false }), { status: 200 });

    const res = await deps.send(webhook, content);
    if (!res.ok) {
      console.error(`announce-top-doers: Discord answered ${res.status}`);
      return new Response("Failed", { status: 502 });
    }
    return new Response(JSON.stringify({ sent: true }), { status: 200 });
  };
}

if (import.meta.main) {
  serve(createHandler({
    createSupabaseClient: createClient as never,
    send: (url, content) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Display names are player text: no @everyone or role pings from them.
        body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      }),
  }));
}
