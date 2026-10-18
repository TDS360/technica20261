
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Sign in required" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const clientId = Deno.env.get("PLAID_CLIENT_ID");
    const secret = Deno.env.get("PLAID_SECRET");
    const env = Deno.env.get("PLAID_ENV") ?? "sandbox";

    if (!url || !anonKey || !clientId || !secret) {
      return json({ error: "Server configuration is incomplete" }, 500);
    }

    const hosts: Record<string, string> = {
      sandbox: "https://sandbox.plaid.com",
      development: "https://development.plaid.com",
      production: "https://production.plaid.com",
    };
    const host = hosts[env];
    if (!host) return json({ error: "Invalid Plaid environment" }, 500);

    const supabase = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return json({ error: "Invalid session" }, 401);

    const response = await fetch(`${host}/link/token/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        secret,
        user: { client_user_id: user.id },
        client_name: "SignalZero",
        products: ["transactions"],
        country_codes: ["US"],
        language: "en",
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Plaid Link token error:", result.error_code);
      return json({
        error: "Plaid could not start the bank connection",
        code: result.error_code ?? "UNKNOWN",
      }, 502);
    }

    return json({ link_token: result.link_token });
  } catch (error) {
    console.error("Link token function failed:", error);
    return json({ error: "Could not start Plaid Link" }, 500);
  }
});
