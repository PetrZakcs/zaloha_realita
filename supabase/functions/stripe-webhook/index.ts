// Supabase Edge Function: stripe-webhook
// Listens for Stripe webhooks and keeps profile.pass_holder in sync with the player's
// Founder Pass subscription (granted on checkout, revoked when the subscription ends).
//
// Stripe dashboard → Webhooks must send: checkout.session.completed, invoice.paid,
// customer.subscription.updated, customer.subscription.deleted.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

// Plans that grant the Founder Pass. Set by stripe-checkout in session/subscription metadata —
// a checkout session created any other way (e.g. a stray dashboard Payment Link) doesn't grant it.
const PASS_PLANS = new Set(["monthly", "yearly"]);

// Subscription states in which the player keeps the Pass. past_due keeps it while Stripe is
// still retrying the card; the subscription moves to canceled/unpaid if retries run out.
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Exported as a factory (rather than only the `serve(async (req) => {...})` this used to be)
// so index.test.ts can build a handler against fake stripe/supabase clients instead of real
// network calls and real secrets — TD-11 in the tech-debt backlog. `serve(handler)` is gated
// behind `import.meta.main` so importing this module for a test doesn't also bind a listener.
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
        console.error(`Webhook signature verification failed: ${errorMessage(err)}`);
        return new Response("Webhook signature verification failed", { status: 400 });
      }

      console.log(`Received Stripe Webhook event: ${event.type}`);

      const handled = new Set([
        "checkout.session.completed",
        "invoice.paid",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ]);
      if (!handled.has(event.type)) {
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      // Initialize Supabase Client with Service Role Key to bypass RLS policies
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const supabase = createSupabaseClient(supabaseUrl, supabaseServiceKey);

      // Idempotency: Stripe delivers at-least-once. Claim the event id first; a duplicate
      // delivery hits the primary key and is acknowledged without re-running side effects
      // (duplicate payments rows / duplicate Founder feed posts). If processing fails below,
      // the claim is released so Stripe's retry can process it again.
      const { error: claimError } = await supabase
        .from("stripe_events")
        .insert({ id: event.id, type: event.type });
      if (claimError) {
        if ((claimError as { code?: string }).code === "23505") {
          console.log(`Duplicate Stripe event ${event.id}, skipping`);
          return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
        }
        console.error(`Failed to record Stripe event ${event.id}:`, claimError);
        return new Response("Database update failed", { status: 500 });
      }

      const releaseClaim = async () => {
        await supabase.from("stripe_events").delete().eq("id", event.id);
      };

      const result = event.type === "checkout.session.completed"
        ? await handleCheckoutCompleted(supabase, event.data.object)
        : event.type === "invoice.paid"
        ? await handleInvoicePaid(supabase, event.data.object)
        : await handleSubscriptionChange(supabase, event.data.object);

      if (!result.ok) {
        await releaseClaim();
        return new Response("Database update failed", { status: 500 });
      }

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    } catch (error) {
      console.error("Stripe Webhook handler crashed:", error);
      return new Response(JSON.stringify({ error: "Webhook handler failed" }), { status: 500 });
    }
  };
}

// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type StripeObject = any;

async function handleCheckoutCompleted(supabase: Db, session: StripeObject): Promise<{ ok: boolean }> {
  const userId = session.client_reference_id;
  if (!userId) {
    console.error("Missing client_reference_id (userId) in checkout session");
    return { ok: true };
  }

  // Only a settled payment grants anything ('no_payment_required' covers 100 % coupons/trials).
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    console.warn(`Checkout ${session.id} completed with payment_status=${session.payment_status}, ignoring`);
    return { ok: true };
  }

  const plan = session.metadata?.plan;
  const isSubscription = session.mode === "subscription";
  const grantsPass = isSubscription && PASS_PLANS.has(plan);

  if (isSubscription && !grantsPass) {
    console.warn(`Subscription checkout ${session.id} has no Founder Pass plan metadata (plan=${plan}), not granting`);
  }

  // 1. pass_holder = true — only for a Founder Pass subscription, never for a DEPOSIT_TEST
  //    payment (spec-8 "rezervuj si místo", 49/99 Kč refundable) or an unknown price.
  let displayName: string | null = null;
  if (grantsPass) {
    const { data: updatedProfile, error: profileError } = await supabase
      .from("profiles")
      .update({ pass_holder: true })
      .eq("id", userId)
      .select("display_name")
      .single();

    if (profileError) {
      console.error(`Failed to update profile for user ${userId}:`, profileError);
      return { ok: false };
    }

    displayName = updatedProfile?.display_name ?? null;
    console.log(`Successfully activated Founder Pass for user ${userId}`);

    // Remember which user owns this subscription, so customer.subscription.deleted can revoke it.
    if (session.subscription) {
      const { error: subError } = await supabase
        .from("subscriptions")
        .upsert({
          stripe_subscription_id: session.subscription as string,
          user_id: userId,
          stripe_customer_id: (session.customer as string) || null,
          status: "active",
          updated_at: new Date().toISOString(),
        });
      if (subError) {
        console.error(`Failed to record subscription for user ${userId}:`, subError);
        return { ok: false };
      }
    }
  }

  // 2. Insert transactional record into payments
  const amountCzk = Math.round((session.amount_total || 0) / 100);
  const paymentIntentId = (session.payment_intent as string) || null;

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
  if (grantsPass && displayName) {
    const { error: statusPostError } = await supabase
      .from("feed_posts")
      .insert({
        user_id: userId,
        user_name: displayName,
        type: "STATUS",
        content: `${displayName} se stal/a Founder hráčem.`,
        is_public: true,
        author_pass_holder: true
      });

    if (statusPostError) {
      console.warn(`Failed to insert Founder Pass status feed post for user ${userId}:`, statusPostError);
    }
  }

  return { ok: true };
}

// Every paid Pass invoice (first payment and renewals): logs it for the renewal KPI and gives
// the inviter their recurring in-game reward. record_pass_payment() is idempotent per invoice.
async function handleInvoicePaid(supabase: Db, invoice: StripeObject): Promise<{ ok: boolean }> {
  const subscriptionId = invoice.subscription as string | null;
  if (!subscriptionId) return { ok: true };

  const { data: row, error: lookupError } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (lookupError) {
    console.error(`Failed to look up subscription ${subscriptionId}:`, lookupError);
    return { ok: false };
  }

  // Stripe doesn't order events: the first invoice can arrive before checkout.session.completed
  // has written the subscriptions row, so the metadata copied onto the invoice is the fallback.
  const userId: string | undefined = row?.user_id ??
    invoice.subscription_details?.metadata?.user_id ?? invoice.metadata?.user_id;
  if (!userId) {
    // Not ok on purpose: the claim is released and Stripe retries once checkout has linked it.
    console.warn(`Invoice ${invoice.id} is not linked to a player yet, asking Stripe to retry`);
    return { ok: false };
  }

  const { error } = await supabase.rpc("record_pass_payment", {
    p_user_id: userId,
    p_invoice_id: invoice.id,
    p_amount_czk: Math.round((invoice.amount_paid || 0) / 100),
    p_billing_reason: invoice.billing_reason ?? null,
  });
  if (error) {
    console.error(`Failed to record payment for invoice ${invoice.id}:`, error);
    return { ok: false };
  }
  return { ok: true };
}

async function handleSubscriptionChange(supabase: Db, subscription: StripeObject): Promise<{ ok: boolean }> {
  const subscriptionId = subscription.id as string;
  const status = subscription.status as string;

  const { data: row, error: lookupError } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (lookupError) {
    console.error(`Failed to look up subscription ${subscriptionId}:`, lookupError);
    return { ok: false };
  }

  const userId: string | undefined = row?.user_id ?? subscription.metadata?.user_id;
  if (!userId) {
    console.warn(`Subscription ${subscriptionId} is not linked to any player, ignoring`);
    return { ok: true };
  }

  const { error: statusError } = await supabase
    .from("subscriptions")
    .upsert({
      stripe_subscription_id: subscriptionId,
      user_id: userId,
      stripe_customer_id: (subscription.customer as string) || null,
      status,
      updated_at: new Date().toISOString(),
    });
  if (statusError) {
    console.error(`Failed to update subscription ${subscriptionId}:`, statusError);
    return { ok: false };
  }

  // Pass follows "does the player have at least one live subscription" — a player who
  // re-subscribed before the old one ended mustn't lose the Pass when the old one is deleted.
  const { data: liveSubs, error: liveError } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .in("status", [...ACTIVE_SUBSCRIPTION_STATUSES]);
  if (liveError) {
    console.error(`Failed to check live subscriptions for user ${userId}:`, liveError);
    return { ok: false };
  }

  const passHolder = (liveSubs ?? []).length > 0;
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ pass_holder: passHolder })
    .eq("id", userId);
  if (profileError) {
    console.error(`Failed to set pass_holder=${passHolder} for user ${userId}:`, profileError);
    return { ok: false };
  }

  console.log(`Subscription ${subscriptionId} is ${status}; pass_holder=${passHolder} for user ${userId}`);
  return { ok: true };
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
