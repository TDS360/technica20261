
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

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Sign in required." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const plaidClientId = Deno.env.get("PLAID_CLIENT_ID");
    const plaidSecret = Deno.env.get("PLAID_SECRET");
    const plaidEnv = Deno.env.get("PLAID_ENV") ?? "sandbox";

    if (
      !supabaseUrl || !anonKey || !serviceRoleKey ||
      !plaidClientId || !plaidSecret
    ) {
      console.error("Required server configuration is missing.");
      return json({ error: "Server configuration is incomplete." }, 500);
    }

    const plaidHosts: Record<string, string> = {
      sandbox: "https://sandbox.plaid.com",
      development: "https://development.plaid.com",
      production: "https://production.plaid.com",
    };

    const plaidHost = plaidHosts[plaidEnv];

    if (!plaidHost) {
      return json({ error: "Invalid Plaid environment." }, 500);
    }

    // Validate the caller's Supabase session.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
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
      return json({ error: "Your session is invalid or expired." }, 401);
    }

    // This privileged client is server-only. Never send its key to the browser.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Only retrieve Plaid Items belonging to the signed-in user.
    const { data: items, error: itemsError } = await admin
      .from("plaid_items")
      .select("item_id, access_token")
      .eq("user_id", user.id);

    if (itemsError) {
      console.error("Could not read Plaid connections:", itemsError.message);
      return json({ error: "Could not load your bank connections." }, 500);
    }

    if (!items?.length) {
      return json({
        transactions: [],
        added: 0,
        modified: 0,
        removed: 0,
        message: "Connect a bank account first.",
      });
    }

    const transactions: Record<string, unknown>[] = [];
    const removedIds: string[] = [];
    let added = 0;
    let modified = 0;

    for (const item of items) {
      // Keep the cursor local for this request. Persist it in the database
      // before using this function for ongoing incremental synchronization.
      let cursor: string | undefined;
      let hasMore = true;
      let pages = 0;

      while (hasMore) {
        pages++;

        // Avoid an unbounded request if the provider returns many pages.
        if (pages > 100) {
          throw new Error("Too many transaction pages. Please retry.");
        }

        const plaidResponse = await fetch(
          `${plaidHost}/transactions/sync`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: plaidClientId,
              secret: plaidSecret,
              access_token: item.access_token,
              ...(cursor ? { cursor } : {}),
              count: 250,
            }),
          },
        );

        const result = await plaidResponse.json();

        if (!plaidResponse.ok) {
          console.error(
            "Plaid transaction request failed:",
            result.error_code ?? "UNKNOWN_ERROR",
          );

          return json({
            error:
              result.error_code === "PRODUCT_NOT_READY"
                ? "Transactions are not ready yet. Please try again later."
                : "Plaid could not retrieve transactions. Please try again.",
          }, 502);
        }

        for (const txn of result.added ?? []) {
          added++;
          transactions.push({
            id: txn.transaction_id,
            accountId: txn.account_id,
            amount: Number(txn.amount),
            currency: txn.iso_currency_code ?? "USD",
            date: txn.date,
            merchant: txn.merchant_name ?? txn.name ?? "Unknown merchant",
            description: txn.name ?? "",
            pending: Boolean(txn.pending),
            provider: "plaid",
            providerTransactionId: txn.transaction_id,
            connectionId: item.item_id,
          });
        }

        for (const txn of result.modified ?? []) {
          modified++;
          transactions.push({
            id: txn.transaction_id,
            accountId: txn.account_id,
            amount: Number(txn.amount),
            currency: txn.iso_currency_code ?? "USD",
            date: txn.date,
            merchant: txn.merchant_name ?? txn.name ?? "Unknown merchant",
            description: txn.name ?? "",
            pending: Boolean(txn.pending),
            provider: "plaid",
            providerTransactionId: txn.transaction_id,
            connectionId: item.item_id,
          });
        }

        for (const txn of result.removed ?? []) {
          if (txn.transaction_id) {
            removedIds.push(txn.transaction_id);
          }
        }

        cursor = result.next_cursor;
        hasMore = Boolean(result.has_more);
      }
    }

    return json({
      transactions,
      removedIds,
      added,
      modified,
      removed: removedIds.length,
      message:
        "Transaction updates retrieved. Persist them before treating sync as complete.",
    });
  } catch (error) {
    console.error(
      "Plaid transaction function failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return json({ error: "Unable to retrieve transactions." }, 500);
  }
});
