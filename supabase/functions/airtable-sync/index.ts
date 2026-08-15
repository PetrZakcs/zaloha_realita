// Supabase Edge Function: airtable-sync
// Asynchronously synchronizes unlocked card records from iWAU to Airtable database

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { discordUserId, cardKey } = await req.json();

    if (!discordUserId || !cardKey) {
      return new Response(
        JSON.stringify({ error: "Missing discordUserId or cardKey parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
        JSON.stringify({ error: `Airtable API error: ${errText}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
