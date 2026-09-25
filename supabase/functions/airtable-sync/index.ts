import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized access" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { cardKey } = await req.json();

    if (!cardKey || typeof cardKey !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing cardKey parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The Discord id comes from the caller's own profile (set server-side from the verified
    // Discord identity by sync_discord_identity()), never from the request body — otherwise
    // any logged-in player could write cards into someone else's Airtable record.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("discord_user_id")
      .eq("id", user.id)
      .maybeSingle();
    const discordUserId = profile?.discord_user_id;
    if (profileError || !discordUserId) {
      return new Response(
        JSON.stringify({ error: "No Discord account linked" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only cards the player actually owns. 'doer-mvp1' is the starter card every account has
    // (alwaysUnlocked in src/lib/cards.js) and has no user_cards row.
    if (cardKey !== "doer-mvp1") {
      const { data: owned, error: ownedError } = await supabase
        .from("user_cards")
        .select("card_key")
        .eq("user_id", user.id)
        .eq("card_key", cardKey)
        .maybeSingle();
      if (ownedError || !owned) {
        return new Response(
          JSON.stringify({ error: "Card not owned" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const airtablePat = Deno.env.get("AIRTABLE_PAT") || "";
    const airtableBaseId = Deno.env.get("AIRTABLE_BASE_ID") || "";
    const tableName = Deno.env.get("AIRTABLE_TABLE_NAME") || "owned_cards";

    if (!airtablePat || !airtableBaseId) {
      return new Response(
        JSON.stringify({ error: "Airtable configuration missing on backend" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verified against the real base schema (read-only Airtable Meta API check, 2026-08-14):
    // owned_cards has NO Linked Record fields at all — discord_id/card_id/obtained_at/
    // obtained_via are all plain single-line text. The previous version of this function
    // sent fields named "users"/"cards" as Linked Record arrays, which don't exist on this
    // table under any name — every sync call would have failed on Airtable's side (422,
    // unknown field) even once deployed and even with discord_user_id populated correctly.
    //
    // OPEN QUESTION, not resolved by this fix: whether `cardKey` (this app's internal id —
    // 'doer-mvp1', 'c-node-1-card', etc., see src/lib/cards.js) is the same id scheme the
    // `cards` table (which also backs the hrareality.cz collection page) expects in its own
    // card_id field. If not, rows land in owned_cards fine, but won't visibly line up with
    // anything in the cards catalog on the website. Needs a real answer, not a guess.
    const response = await fetch(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableName}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${airtablePat}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          records: [
            {
              fields: {
                discord_id: discordUserId,
                card_id: cardKey,
                obtained_at: new Date().toISOString(),
                obtained_via: "hra_reality_app"
              }
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Airtable API error: ${errText}`);
      return new Response(
        JSON.stringify({ error: "Airtable sync failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resData = await response.json();
    const recordId = resData.records?.[0]?.id || null;

    return new Response(
      JSON.stringify({ success: true, airtableRecordId: recordId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Airtable Sync crash:", error);
    return new Response(
      JSON.stringify({ error: "Airtable sync failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
