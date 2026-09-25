// Supabase Edge Function: stripe-portal
// Opens the Stripe Customer Portal for the caller, so a Founder Pass holder can cancel or
// change their subscription themselves (spec-13 "Zruší kdykoliv"). Cancellation then reaches
// stripe-webhook as customer.subscription.updated/deleted, which revokes pass_holder.
//
// Requires the Customer Portal to be enabled in the Stripe dashboard (Settings → Billing →
// Customer portal) and the APP_URL secret (return address).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const APP_URL = (Deno.env.get("APP_URL") || "").replace(/\/+$/, "");

// Wildcard is fine here: the endpoint is authorized by the Bearer JWT, not by cookies.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ error: "Unauthorized access" }, 401);
    }

    if (!APP_URL) {
      console.error("stripe-portal: APP_URL is not configured");
      return json({ error: "Portal is not configured" }, 500);
    }

    // RLS limits this to the caller's own subscriptions.
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .not("stripe_customer_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError || !subscription?.stripe_customer_id) {
      return json({ error: "No subscription found" }, 404);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${APP_URL}/profile`,
    });

    return json({ url: session.url }, 200);
  } catch (error) {
    console.error("stripe-portal failed:", error);
    return json({ error: "Portal session could not be created" }, 500);
  }
});
