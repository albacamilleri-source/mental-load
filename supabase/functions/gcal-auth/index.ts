import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_ORIGIN = "https://mental-load.app";
const ALLOWED_REDIRECT_URIS = new Set([
  APP_ORIGIN,
  "https://albacamilleri-source.github.io/mental-load",
]);

const CORS = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "Content-Type": "application/json" },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const body = await req.json();
    const APP_SECRET = Deno.env.get("APP_SECRET");
    if (APP_SECRET && body.secret !== APP_SECRET) return json({ error: "Unauthorized" }, 401);

    const CLIENT_ID = Deno.env.get("GCAL_CLIENT_ID")!;
    const CLIENT_SECRET = Deno.env.get("GCAL_CLIENT_SECRET")!;
    const SB_URL = Deno.env.get("SUPABASE_URL")!;
    const SB_SERVICE = Deno.env.get("SB_SERVICE_KEY")!;
    const sb = createClient(SB_URL, SB_SERVICE);

    if (body.action === "exchange") {
      // The redirect URI must exactly match both the authorization request and
      // the Google OAuth client. Accept only known Mental Load deployments.
      const redirectUri = body.redirect_uri || Deno.env.get("GCAL_REDIRECT_URI");
      if (!redirectUri || !ALLOWED_REDIRECT_URIS.has(redirectUri)) {
        return json({ error: "Invalid OAuth redirect URI" }, 400);
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: body.code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokens = await tokenRes.json();
      if (tokens.error) return json({ error: tokens.error_description }, 400);

      if (tokens.refresh_token) {
        await sb.from("gcal_tokens").upsert({
          id: "alba",
          refresh_token: tokens.refresh_token,
          updated_at: new Date().toISOString(),
        });
      }
      return json({ access_token: tokens.access_token, expires_in: tokens.expires_in });
    }

    if (body.action === "refresh") {
      const { data, error } = await sb
        .from("gcal_tokens")
        .select("refresh_token")
        .eq("id", "alba")
        .single();
      if (error || !data?.refresh_token) return json({ error: "No refresh token stored. Please reconnect." }, 401);

      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: data.refresh_token,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "refresh_token",
        }),
      });
      const refreshed = await refreshRes.json();
      if (refreshed.error) return json({ error: refreshed.error_description }, 400);
      return json({ access_token: refreshed.access_token, expires_in: refreshed.expires_in });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
