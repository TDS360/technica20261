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
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  // Handle browser preflight requests.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // Require an authenticated Supabase user.
    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Sign in required" }, 401);
    }

    // Read server-side configuration.
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const plaidClientId = Deno.env.get("PLAID_CLIENT_ID");
    const plaidSecret = Deno.env.get("PLAID_SECRET");
    const plaidEnv = Deno.env.get("PLAID_ENV") ?? "sandbox";

    if (
      !supabaseUrl ||
      !supabaseAnonKey ||
      !serviceRoleKey ||
      !plaidClientId ||
      !plaidSecret
    ) {
      console.error("Required environment configuration is missing.");
      return json({ error: "Server configuration is incomplete" }, 500);
    }

    // Select the correct Plaid API host.
    const hosts: Record<string, string> = {
      sandbox: "https://sandbox.plaid.com",
      development: "https://development.plaid.com",
      production: "https://production.plaid.com",
    };

    const plaidHost = hosts[plaidEnv];

    if (!plaidHost) {
      return json({ error: "Invalid Plaid environment" }, 500);
    }

    // Validate the user's Supabase session.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authorization },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return json({ error: "Invalid session" }, 401);
    }

    // Read the public token returned by Plaid Link.
    let body: { public_token?: unknown };

    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON request body" }, 400);
    }

    const publicToken = body.public_token;

    if (typeof publicToken !== "string" || !publicToken) {
      return json({ error: "Missing public_token" }, 400);
    }

    // Exchange the short-lived public token for an access token.
    const exchangeResponse = await fetch(
      `${plaidHost}/item/public_token/exchange`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: plaidClientId,
          secret: plaidSecret,
          public_token: publicToken,
        }),
      },
    );

    const exchanged = await exchangeResponse.json();

    if (!exchangeResponse.ok) {
      console.error(
        "Plaid token exchange error:",
        exchanged.error_code ?? "UNKNOWN",
      );

      return json(
        {
          error: "Plaid could not exchange the connection token",
          code: exchanged.error_code ?? "UNKNOWN",
        },
        502,
      );
    }

    const accessToken = exchanged.access_token;

    if (typeof accessToken !== "string" || !accessToken) {
      return json({ error: "Plaid did not return an access token" }, 502);
    }

    // Retrieve the Plaid item details.
    const itemResponse = await fetch(`${plaidHost}/item/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: plaidClientId,
        secret: plaidSecret,
        access_token: accessToken,
      }),
    });

    const itemData = await itemResponse.json();

    if (!itemResponse.ok || !itemData.item?.item_id) {
      console.error(
        "Plaid item lookup error:",
        itemData.error_code ?? "UNKNOWN",
      );

      return json(
        { error: "Could not retrieve Plaid connection details" },
        502,
      );
    }

    // Use the service-role client only on the server to save the secret token.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { error: saveError } = await admin
      .from("plaid_items")
      .upsert(
        {
          user_id: user.id,
          item_id: itemData.item.item_id,
          access_token: accessToken,
          institution_id: itemData.item.institution_id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "item_id" },
      );

    if (saveError) {
      console.error("Plaid connection save failed:", saveError.message);
      return json({ error: "Could not save bank connection" }, 500);
    }

    return json({ success: true });
  } catch (error) {
    console.error("Token exchange function failed:", error);
    return json({ error: "Could not complete bank connection" }, 500);
  }
});