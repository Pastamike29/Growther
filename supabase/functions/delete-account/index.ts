import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigins = (Deno.env.get('GROWTHER_ALLOWED_ORIGINS') || '')
  .split(',').map(value => value.trim()).filter(Boolean);

function reply(origin: string, status: number, message: string) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
    },
  });
}

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  if (!allowedOrigins.includes(origin)) return new Response('Origin not allowed', { status: 403 });
  if (request.method === 'OPTIONS') return reply(origin, 200, 'ok');
  if (request.method !== 'POST') return reply(origin, 405, 'Use POST.');
  if (Number(request.headers.get('content-length') || 0) > 100) return reply(origin, 413, 'Request too large.');

  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return reply(origin, 401, 'Sign in to delete your account.');
  const url = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !anon || !serviceRole) return reply(origin, 503, 'Account deletion is unavailable. Contact support.');

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 100) return reply(origin, 413, 'Request too large.');
    body = JSON.parse(raw);
  } catch { return reply(origin, 400, 'Invalid request.'); }
  if (!body || typeof body !== 'object' || (body as { confirmation?: unknown }).confirmation !== 'DELETE ACCOUNT')
    return reply(origin, 400, 'Type DELETE ACCOUNT to confirm.');

  const authClient = createClient(url, anon, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return reply(origin, 401, 'Your sign-in expired. Sign in again.');
  const userId = authData.user.id;
  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

  try {
    // Stored photos, if any, must be removed through Storage before deleting auth.users.
    const bucket = admin.storage.from('meal-photos');
    const files: string[] = [];
    const walk = async (prefix: string, depth: number): Promise<void> => {
      if (depth > 10 || files.length > 10_000) throw new Error('Too many photo files; contact support.');
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await bucket.list(prefix, { limit: 100, offset });
        if (error) throw error;
        for (const item of data || []) {
          const path = `${prefix}/${item.name}`;
          if (item.id) {
            files.push(path);
            if (files.length > 10_000) throw new Error('Too many photo files; contact support.');
          }
          else await walk(path, depth + 1);
        }
        if (!data || data.length < 100) break;
      }
    };
    await walk(userId, 0);
    for (let offset = 0; offset < files.length; offset += 100) {
      const { error } = await bucket.remove(files.slice(offset, offset + 100));
      if (error) throw error;
    }
    // User-owned tables reference auth.users with ON DELETE CASCADE.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
    return reply(origin, 200, 'Your cloud account and data were deleted.');
  } catch (error) {
    console.error('Account deletion failed', error);
    return reply(origin, 500, 'Account deletion could not finish. Contact support before creating another account.');
  }
});
