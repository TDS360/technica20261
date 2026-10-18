const apiBase = "https://api.nessieisreal.com";
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
]);

function corsFor(req: Request): Headers {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) || origin === configuredAppOrigin();
  const headers = new Headers({
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  });
  if (origin && allowed) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function configuredAppOrigin(): string {
  const configured = Deno.env.get("APP_ORIGIN")?.trim();
  if (!configured) return "";
  try {
    return new URL(configured).origin === configured.replace(/\/$/, "")
      ? new URL(configured).origin
      : "";
  } catch {
    return "";
  }
}

function json(body: unknown, status: number, headers: Headers) {
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

class ProviderTimeoutError extends Error {}
class ProviderResponseError extends Error {}

async function fetchProviderJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new ProviderResponseError();
    try {
      return await response.json();
    } catch {
      throw new ProviderResponseError();
    }
  } catch (error) {
    if (error instanceof ProviderResponseError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ProviderTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req: Request) => {
  const headers = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers });
  if (req.method !== "POST") {
    headers.set("Allow", "POST, OPTIONS");
    return json({ error: "Only POST requests are supported.", code: "method_not_allowed" }, 405, headers);
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Sign in required.", code: "unauthorized" }, 401, headers);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !supabaseAnon) {
      return json({ error: "Auth verification is not configured.", code: "auth_misconfigured" }, 500, headers);
    }
    let me: Response;
    try {
      me = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: supabaseAnon, Authorization: authHeader },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return json({ error: "Authentication service is unavailable.", code: "auth_unavailable" }, 503, headers);
    }
    if (!me.ok) {
      return json({ error: "Sign in required.", code: "unauthorized" }, 401, headers);
    }

    const apiKey = Deno.env.get("NESSIE_API_KEY");
    if (!apiKey) {
      return json({ error: "Nessie sandbox is not configured.", code: "not_configured" }, 503, headers);
    }

    let body: { action?: unknown; accountId?: unknown };
    try {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid request body.");
      }
      body = parsed as { action?: unknown; accountId?: unknown };
    } catch {
      return json({ error: "Invalid request body.", code: "bad_request" }, 400, headers);
    }
    const action = body.action ?? "accounts";
    if (action !== "accounts" && action !== "purchases") {
      return json({ error: "Unknown action.", code: "bad_request" }, 400, headers);
    }

    const accountsUrl = new URL(`${apiBase}/accounts`);
    accountsUrl.searchParams.set("key", apiKey);
    const rawAccounts = await fetchProviderJson(accountsUrl.toString());
    if (!Array.isArray(rawAccounts)) throw new ProviderResponseError();
    const accounts = rawAccounts
      .filter((a): a is Record<string, unknown> =>
        Boolean(a) && typeof a === "object" && !Array.isArray(a))
      .slice(0, 50).map((a) => ({
      id: String(a._id ?? a.id ?? ""),
      nickname: typeof a.nickname === "string" ? a.nickname : "Sandbox account",
      type: typeof a.type === "string" ? a.type : "unknown",
      balance: Number.isFinite(Number(a.balance)) ? Number(a.balance) : 0,
    })).filter((a) => a.id);
    if (action === "accounts") {
      return json({ provider: "nessie_sandbox", accounts }, 200, headers);
    }

    const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(accountId)) {
      return json({ error: "A valid account must be selected.", code: "bad_request" }, 400, headers);
    }
    if (!accounts.some((a) => a.id === accountId)) {
      return json({ error: "That account is not available in this sandbox.", code: "unknown_account" }, 404, headers);
    }
    const purchasesUrl = new URL(`${apiBase}/accounts/${encodeURIComponent(accountId)}/purchases`);
    purchasesUrl.searchParams.set("key", apiKey);
    const rawPurchases = await fetchProviderJson(purchasesUrl.toString());
    if (!Array.isArray(rawPurchases)) throw new ProviderResponseError();
    const purchases = rawPurchases
      .filter((p): p is Record<string, unknown> =>
        Boolean(p) && typeof p === "object" && !Array.isArray(p))
      .slice(0, 200).map((p) => {
      const amount = typeof p.amount === "number" ? p.amount
        : typeof p.amount === "string" && p.amount.trim()
          ? Number(p.amount)
          : Number.NaN;
      const date = typeof p.purchase_date === "string"
        ? p.purchase_date
        : typeof p.date === "string" ? p.date : null;
      return {
        id: String(p._id ?? p.id ?? ""),
        amount: Number.isFinite(amount) ? Math.abs(amount) : null,
        date: date && !Number.isNaN(Date.parse(date))
          ? new Date(date).toISOString()
          : null,
        description: typeof p.description === "string" ? p.description : null,
        merchantId: typeof p.merchant_id === "string" ? p.merchant_id : null,
        accountId,
        type: typeof p.type === "string" ? p.type : "purchase",
        status: typeof p.status === "string" ? p.status : "completed",
      };
    }).filter((p) => p.id && p.date && p.amount !== null);
    return json({ provider: "nessie_sandbox", accountId, purchases }, 200, headers);
  } catch (error) {
    if (error instanceof ProviderTimeoutError
      || (error instanceof DOMException && error.name === "TimeoutError")) {
      return json({ error: "Sandbox request timed out. Try again.", code: "timeout" }, 504, headers);
    }
    if (error instanceof ProviderResponseError) {
      return json({ error: "Sandbox provider returned an invalid response.", code: "provider_error" }, 502, headers);
    }
    return json({ error: "Sandbox data could not be loaded.", code: "provider_error" }, 502, headers);
  }
});
