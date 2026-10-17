const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:5173",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
  "Vary": "Origin",
};

// Hardened Nessie sandbox bridge below. NESSIE_API_KEY stays server-side.
const apiBase = "https://api.nessieisreal.com";
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
]);

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const appOrigin = Deno.env.get("APP_ORIGIN") ?? "";
  const allow = ALLOWED_ORIGINS.has(origin)
    ? origin
    : (appOrigin && origin === appOrigin ? origin : "");
  const base = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
  return { ...base, "Access-Control-Allow-Origin": allow || "http://localhost:5173" };
}

function json(body: unknown, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(headers as Record<string, string>), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const headers = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers });

  try {
    const apiKey = Deno.env.get("NESSIE_API_KEY");
    if (!apiKey) {
      return json({ error: "Nessie sandbox is not configured.", code: "not_configured" }, 503, headers);
    }
    // Require authenticated Supabase session.
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Sign in required.", code: "unauthorized" }, 401, headers);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !supabaseAnon) {
      return json({ error: "Auth verification is not configured.", code: "auth_misconfigured" }, 500, headers);
    }
    const me = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnon, Authorization: authHeader },
    });
    if (!me.ok) {
      return json({ error: "Sign in required.", code: "unauthorized" }, 401, headers);
    }

    let body: { action?: string; accountId?: string } = {};
    try {
      body = req.method === "POST" ? await req.json() : {};
    } catch {
      return json({ error: "Invalid request body.", code: "bad_request" }, 400, headers);
    }
    const action = body.action ?? "accounts";
    if (action !== "accounts" && action !== "purchases") {
      return json({ error: "Unknown action.", code: "bad_request" }, 400, headers);
    }

    const withTimeout = async (url: string) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      try {
        return await fetch(url, { signal: ctrl.signal });
      } finally {
        clearTimeout(t);
      }
    };
    const accountsResponse = await withTimeout(`${apiBase}/accounts?key=${encodeURIComponent(apiKey)}`);
    if (!accountsResponse.ok) {
      return json({ error: "Sandbox provider is unavailable. Try again later.", code: "provider_error" }, 502, headers);
    }
    const rawAccounts = await accountsResponse.json();
    const accounts = (Array.isArray(rawAccounts) ? rawAccounts : []).slice(0, 50).map((a: Record<string, unknown>) => ({
      id: String(a._id ?? a.id ?? ""),
      nickname: typeof a.nickname === "string" ? a.nickname : "Sandbox account",
      type: typeof a.type === "string" ? a.type : "unknown",
      balance: Number.isFinite(Number(a.balance)) ? Number(a.balance) : 0,
    })).filter((a: { id: string }) => a.id);
    if (action === "accounts") {
      return json({ provider: "nessie_sandbox", accounts }, 200, headers);
    }

    const accountId = String(body.accountId ?? "").trim();
    if (!accountId || accountId.length > 128) {
      return json({ error: "A valid account must be selected.", code: "bad_request" }, 400, headers);
    }
    if (!accounts.some((a: { id: string }) => a.id === accountId)) {
      return json({ error: "That account is not available in this sandbox.", code: "unknown_account" }, 404, headers);
    }
    const purchasesResponse = await withTimeout(
      `${apiBase}/accounts/${encodeURIComponent(accountId)}/purchases?key=${encodeURIComponent(apiKey)}`,
    );
    if (!purchasesResponse.ok) {
      return json({ error: "Sandbox purchases are unavailable. Try again later.", code: "provider_error" }, 502, headers);
    }
    const rawPurchases = await purchasesResponse.json();
    const purchases = (Array.isArray(rawPurchases) ? rawPurchases : []).slice(0, 200).map((p: Record<string, unknown>) => {
      const amount = Number(p.amount);
      const date = typeof p.purchase_date === "string"
        ? p.purchase_date
        : typeof p.date === "string" ? p.date : null;
      return {
        id: String(p._id ?? p.id ?? ""),
        amount: Number.isFinite(amount) ? amount : 0,
        date,
        description: typeof p.description === "string" ? p.description : null,
        merchantId: typeof p.merchant_id === "string" ? p.merchant_id : null,
        accountId,
        type: typeof p.type === "string" ? p.type : "purchase",
        status: typeof p.status === "string" ? p.status : "completed",
      };
    }).filter((p: { id: string; date: string | null }) => p.id && p.date);
    return json({ provider: "nessie_sandbox", accountId, purchases }, 200, headers);
  } catch {
    return json({ error: "Sandbox data could not be loaded.", code: "provider_error" }, 502, headers);
  }
});
