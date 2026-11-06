// Supabase Edge Function: send-retention-push
// Fired twice daily by pg_cron (see supabase_migration_push_notifications.sql, SECTION 3) —
// sends Web Push retention nudges (MVP1 spec-3 §14A "D1 NOTIFIKACE"):
//   kind: 'morning'  -> "Včera jsi začal. Dnes můžeš pokračovat."      (active yesterday, not yet today)
//   kind: 'evening'  -> "Zastavil ses. Teď pokračuj."                  (active yesterday, not yet today — same
//                        population as morning, this is the evening follow-up for whoever the morning ping
//                        didn't bring back) + the 48h+ variant below in the same run:
//                     -> "Tvůj progres čeká. Founder hráči pokračují bez omezení." (2–7 days inactive)
//
// CAVEAT (read before relying on this): this imports `web-push` from esm.sh targeting Deno —
// the same import pattern already used successfully by supabase/functions/stripe-webhook in
// this repo (`stripe@12.0.0?target=deno`), which is why this approach was chosen over an
// unfamiliar JSR-only alternative. But unlike every other change made in this session, this
// specific file could NOT be execution-tested (no Deno runtime available) — do a manual
// `supabase functions invoke send-retention-push --no-verify-jwt` test against a real
// subscription before trusting the cron schedule.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
// @ts-ignore: esm.sh serves a CJS-interop default export at runtime; @types/web-push declares none.
import webpush from "https://esm.sh/web-push@3.6.7?target=deno";
import { allowedToSend, type NotificationPrefs } from "./prefs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

const COPY = {
  morning: { title: "Hra Reality", body: "Včera jsi začal/a. Dnes můžeš pokračovat.", url: "/story" },
  evening: { title: "Hra Reality", body: "Zastavil/a ses. Teď pokračuj.", url: "/story" },
  inactive_48h: { title: "Hra Reality", body: "Tvůj progres čeká. Founder hráči pokračují bez omezení.", url: "/" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
    const cronSecretHeader = req.headers.get("x-cron-secret") || "";
    const expectedServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const expectedCronSecret = Deno.env.get("CRON_SECRET") || "";

    // Exact match only (was a substring `includes()` check), and fail closed when no secret
    // is configured at all instead of letting every request through.
    const isAuthorized =
      (expectedServiceKey !== "" && bearer === expectedServiceKey) ||
      (expectedCronSecret !== "" && (bearer === expectedCronSecret || cronSecretHeader === expectedCronSecret));

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized cron/service invocation" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const { kind } = await req.json();
    if (kind !== "morning" && kind !== "evening") {
      return new Response(JSON.stringify({ error: "kind must be 'morning' or 'evening'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date();
    const dateStr = (d: Date) => d.toISOString().slice(0, 10);
    const daysAgo = (n: number) => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - n);
      return dateStr(d);
    };
    // "Exactly N days ago" as a calendar day, expressed as a [start, end) timestamptz range —
    // last_active_at::date isn't filterable directly as a PostgREST column-filter key, so this
    // is the range-based equivalent of `WHERE last_active_at::date = today - N`.
    const startOfDay = (isoDateStr: string) => `${isoDateStr}T00:00:00.000Z`;

    // Batches to send this run: [{ userIds, notificationKind }]
    const batches: { userIds: string[]; notificationKind: keyof typeof COPY }[] = [];

    if (kind === "morning") {
      // Active exactly yesterday, not yet today — "keep the streak going" nudge.
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .gte("last_active_at", startOfDay(daysAgo(1)))
        .lt("last_active_at", startOfDay(daysAgo(0)));
      batches.push({ userIds: (data || []).map((p: { id: string }) => p.id), notificationKind: "morning" });
    } else {
      const { data: d1 } = await supabase
        .from("profiles")
        .select("id")
        .gte("last_active_at", startOfDay(daysAgo(1)))
        .lt("last_active_at", startOfDay(daysAgo(0)));
      batches.push({ userIds: (d1 || []).map((p: { id: string }) => p.id), notificationKind: "evening" });

      // 2–7 days inactive — tapers off after a week rather than pinging long-dormant
      // accounts forever every single evening.
      const { data: d48 } = await supabase
        .from("profiles")
        .select("id")
        .gte("last_active_at", startOfDay(daysAgo(7)))
        .lt("last_active_at", startOfDay(daysAgo(1)));
      batches.push({ userIds: (d48 || []).map((p: { id: string }) => p.id), notificationKind: "inactive_48h" });
    }

    let sent = 0;
    let failed = 0;
    let skippedByPrefs = 0;

    // Player preferences (category opt-outs, quiet hours) — notification_preferences.
    const allIds = [...new Set(batches.flatMap(b => b.userIds))];
    const prefsByUser = new Map<string, NotificationPrefs>();
    if (allIds.length > 0) {
      const { data: prefRows } = await supabase
        .from("notification_preferences")
        .select("user_id, categories_off, quiet_start, quiet_end, timezone")
        .in("user_id", allIds);
      for (const row of prefRows || []) prefsByUser.set(row.user_id, row);
    }

    for (const batch of batches) {
      for (const userId of batch.userIds) {
        if (!allowedToSend(batch.notificationKind, prefsByUser.get(userId), today)) {
          skippedByPrefs++;
          continue;
        }
        // Dedup guard: only proceed if this (user, kind, today) hasn't already been logged —
        // protects against a cron overlap/retry double-sending, not just a courtesy.
        const { error: logError } = await supabase
          .from("push_notification_log")
          .insert({ user_id: userId, kind: batch.notificationKind });
        if (logError) continue; // unique_violation = already sent today, skip silently

        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("*")
          .eq("user_id", userId);

        for (const sub of subs || []) {
          try {
            const payload = JSON.stringify(COPY[batch.notificationKind]);
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            );
            sent++;
          } catch (err) {
            failed++;
            // 404/410 = subscription expired/revoked on the browser's end — clean it up so
            // future runs don't keep retrying a dead endpoint.
            const statusCode = (err as { statusCode?: number } | null)?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
              await supabase.from("push_subscriptions").delete().eq("id", sub.id);
            } else {
              console.warn(`Push send failed for subscription ${sub.id}:`, err);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ sent, failed, skippedByPrefs }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-retention-push crashed:", error);
    return new Response(JSON.stringify({ error: "send-retention-push failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
