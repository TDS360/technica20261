const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const apiBase = "https://api.nessieisreal.com";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("NESSIE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Nessie connection is not configured." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = new URL(req.url);
    const accountId = url.searchParams.get("accountId");
    const accountsUrl = `${apiBase}/accounts?key=${encodeURIComponent(apiKey)}`;
    const accountsResponse = await fetch(accountsUrl);
    if (!accountsResponse.ok) throw new Error(`Nessie accounts request failed (${accountsResponse.status})`);
    const accounts = await accountsResponse.json();
    const selectedAccountId = accountId ?? accounts[0]?._id;
    const purchasesResponse = selectedAccountId ? await fetch(`${apiBase}/accounts/${encodeURIComponent(selectedAccountId)}/purchases?key=${encodeURIComponent(apiKey)}`) : null;
    if (purchasesResponse && !purchasesResponse.ok) throw new Error(`Nessie transactions request failed (${purchasesResponse.status})`);
    const purchases = purchasesResponse ? await purchasesResponse.json() : [];

    return new Response(JSON.stringify({ accounts, purchases }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nessie data could not be loaded.";
    return new Response(JSON.stringify({ error: message }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
