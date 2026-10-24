/**
 * delete-account — the account-deletion Edge Function.
 *
 * Purpose:  Delete the calling player's account from the server. The anon key that
 *           ships in the app can never delete a user, and the service-role key must
 *           never ship inside an app, so this is the only place deletion may happen.
 *           It is the backend half of the promise in the in-app Privacy Policy:
 *           "You can also delete your account in-app through the Account screen,
 *           which triggers deletion via our Supabase backend."
 *
 * Notes:    The user id is taken from the caller's OWN JWT — the Authorization
 *           header that the Supabase JS client attaches to `functions.invoke` —
 *           never from the request body. Accepting a body-supplied id would let any
 *           signed-in player delete anyone. Deleting the auth user cascades through
 *           every synced table (`profiles`, `level_records`, `challenge_records`,
 *           and `league_scores` all reference auth.users ON DELETE CASCADE), so no
 *           rows are orphaned. The app revokes Google sign-in access itself, after
 *           this function returns.
 *
 * Env:      SUPABASE_URL and SERVICE_ROLE_KEY, set as a function secret (never
 *           committed). JWT verification stays ON: the gateway checks the token and
 *           `auth.getUser` re-validates it before acting on the uid.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return respond({ error: 'method not allowed' }, 405);
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return respond({ error: 'missing authorization token' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    return respond({ error: 'server is not configured to delete accounts' }, 500);
  }

  const admin = createClient(url, serviceKey);

  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return respond({ error: 'invalid or expired token' }, 401);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return respond({ error: error.message }, 500);

  return respond({ ok: true }, 200);
});