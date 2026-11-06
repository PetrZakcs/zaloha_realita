import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

// The browser only chooses a plan name — never a raw Stripe price id. Previously the client
// sent `priceId` itself, so any price in the Stripe account (e.g. the cheap deposit price) could
// be bought in subscription mode and stripe-webhook would grant the full Founder Pass for it.
const PLANS: Record<string, { priceEnv: string; mode: "subscription" | "payment" }> = {
  monthly: { priceEnv: "STRIPE_PRICE_ID_MONTHLY", mode: "subscription" },
  yearly: { priceEnv: "STRIPE_PRICE_ID_YEARLY", mode: "subscription" },
  deposit: { priceEnv: "STRIPE_PRICE_ID_DEPOSIT", mode: "payment" },
};

// Where Stripe may redirect after checkout (required secret, e.g. the production app origin).
// Client-supplied URLs are ignored — they made the hosted checkout page an open redirect.
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
  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ error: "Unauthorized access" }, 401);
    }

    const { plan } = await req.json();
    const planConfig = PLANS[plan as string];
    if (!planConfig) {
      return json({ error: "Unknown plan" }, 400);
    }

    if (!APP_URL) {
      console.error("stripe-checkout: APP_URL is not configured");
      return json({ error: "Checkout is not configured" }, 500);
    }

    let priceId = Deno.env.get(planConfig.priceEnv) || "";

    // spec-13: 149 Kč holds until the player cancels; coming back costs 199 Kč. Applies once the
    // returning price is configured. RLS limits this query to the caller's own subscriptions.
    const returningPriceId = Deno.env.get("STRIPE_PRICE_ID_MONTHLY_RETURNING") || "";
    if (plan === "monthly" && returningPriceId) {
      const { count } = await supabase
        .from("subscriptions")
        .select("stripe_subscription_id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if ((count ?? 0) > 0) priceId = returningPriceId;
    }

    if (!priceId) {
      console.error(`stripe-checkout: ${planConfig.priceEnv} is not configured`);
      return json({ error: "Plan is not available" }, 400);
    }

    // client_reference_id and metadata come from the verified JWT, not the request body.
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      client_reference_id: user.id,
      customer_email: user.email || undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: planConfig.mode,
      metadata: { user_id: user.id, plan },
      ...(planConfig.mode === "subscription"
        ? { subscription_data: { metadata: { user_id: user.id, plan } } }
        : {}),
      success_url: `${APP_URL}/?payment=success`,
      cancel_url: `${APP_URL}/?payment=cancel`,
    });

    return json({ sessionId: session.id, sessionUrl: session.url }, 200);
  } catch (error) {
    console.error("stripe-checkout failed:", error);
    return json({ error: "Checkout could not be created" }, 500);
  }
});
