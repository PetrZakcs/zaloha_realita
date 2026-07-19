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

    // Prepare Airtable insert request
    // Junction table links cards to users via linked records (arrays)
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
                users: [discordUserId], // Linked Record array to registered users table
                cards: [cardKey], // Linked Record array to cards catalog
                obtained_at: new Date().toISOString()
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
