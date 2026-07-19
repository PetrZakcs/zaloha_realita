// Supabase Edge Function: stripe-webhook
// Listens for Stripe webhooks and updates profile.pass_holder status on payment success

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
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
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // 1. Update user profile to pass_holder = true
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ pass_holder: true })
        .eq("id", userId);

      if (profileError) {
        console.error(`Failed to update profile for user ${userId}:`, profileError);
        return new Response("Database update failed", { status: 500 });
      }

      console.log(`Successfully activated Founder Pass for user ${userId}`);

      // 2. Insert transactional record into payments
      const amountCzk = Math.round((session.amount_total || 0) / 100);
      const paymentIntentId = session.payment_intent as string || null;

      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          user_id: userId,
          stripe_payment_intent_id: paymentIntentId,
          type: session.mode === "subscription" ? "SUBSCRIPTION" : "DEPOSIT_TEST",
          amount_czk: amountCzk,
          status: "SUCCEEDED"
        });

      if (paymentError) {
        console.warn(`Failed to log payment transaction for user ${userId}:`, paymentError);
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error("Stripe Webhook handler crashed:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
