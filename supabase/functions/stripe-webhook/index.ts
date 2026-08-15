// Supabase Edge Function: stripe-webhook
// Listens for Stripe webhooks and updates profile.pass_holder status on payment success

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

// Exported as a factory (rather than only the `serve(async (req) => {...})` this used to be)
// so index.test.ts can build a handler against fake stripe/supabase clients instead of real
// network calls and real secrets — TD-11 in the tech-debt backlog. Behavior for the real
// deployed function is unchanged: `stripe` and `createClient` below are the same real ones as
// before, and `serve(handler)` still runs exactly like it did, just gated behind
// `import.meta.main` so importing this module for a test doesn't also bind a listener.
export function createHandler(
  stripe: Stripe,
  createSupabaseClient: (url: string, key: string) => ReturnType<typeof createClient>
) {
  return async function handler(req: Request): Promise<Response> {
    try {
      const signature = req.headers.get("Stripe-Signature");
      if (!signature) {
        return new Response("Missing Stripe-Signature header", { status: 400 });
      }

      const body = await req.text();
      const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

      // Verify webhook signature
      let event;
      try {
        event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
      }

      console.log(`Received Stripe Webhook event: ${event.type}`);

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const userId = session.client_reference_id;

        if (!userId) {
          console.error("Missing client_reference_id (userId) in checkout session");
          return new Response("Webhook received but no client_reference_id found", { status: 200 });
        }

        // Initialize Supabase Client with Service Role Key to bypass RLS policies
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        const supabase = createSupabaseClient(supabaseUrl, supabaseServiceKey);

        const isSubscription = session.mode === "subscription";

        // 1. Update user profile to pass_holder = true — SUBSCRIPTION only. This previously
        //    ran unconditionally for every completed checkout, which meant a DEPOSIT_TEST
        //    payment (MVP1 spec-8 "rezervuj si místo v další sezóně" willingness-to-pay
        //    signal, a deliberately smaller/separate commitment — 49/99 Kč, refundable) also
        //    silently granted full Founder Pass access. Not currently reachable from the
        //    shipped UI (nothing calls stripe-checkout with type: "DEPOSIT_TEST" yet), but
        //    worth closing now rather than leaving a live grant-Pass-for-a-deposit bug for
        //    whoever wires that flow up next.
        let displayName: string | null = null;
        if (isSubscription) {
          const { data: updatedProfile, error: profileError } = await supabase
            .from("profiles")
            .update({ pass_holder: true })
            .eq("id", userId)
            .select("display_name")
            .single();

          if (profileError) {
            console.error(`Failed to update profile for user ${userId}:`, profileError);
            return new Response("Database update failed", { status: 500 });
          }

          displayName = updatedProfile?.display_name ?? null;
          console.log(`Successfully activated Founder Pass for user ${userId}`);
        }

        // 2. Insert transactional record into payments
        const amountCzk = Math.round((session.amount_total || 0) / 100);
        const paymentIntentId = session.payment_intent as string || null;

        const { error: paymentError } = await supabase
          .from("payments")
          .insert({
            user_id: userId,
            stripe_payment_intent_id: paymentIntentId,
            type: isSubscription ? "SUBSCRIPTION" : "DEPOSIT_TEST",
            amount_czk: amountCzk,
            status: "SUCCEEDED"
          });

        if (paymentError) {
          console.warn(`Failed to log payment transaction for user ${userId}:`, paymentError);
        }

        // 3. Status feed post (spec-6 §8 "Founder Pass aktivace" trigger) — announces the
        //    upgrade publicly the same way a badge/title unlock does.
        if (isSubscription && displayName) {
          const { error: statusPostError } = await supabase
            .from("feed_posts")
            .insert({
              user_id: userId,
              user_name: displayName,
              type: "STATUS",
              content: `${displayName} se stal/a Founder hráčem.`,
              is_public: true
            });

          if (statusPostError) {
            console.warn(`Failed to insert Founder Pass status feed post for user ${userId}:`, statusPostError);
          }
        }
      }

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    } catch (error) {
      console.error("Stripe Webhook handler crashed:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  };
}

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const handler = createHandler(stripe, createClient);

if (import.meta.main) {
  serve(handler);
}

export { handler };
