import { createClient } from 'npm:@supabase/supabase-js@2';
import { sha256Hex, verifyPlaySubscription } from '../_shared/google-play-billing.ts';

const allowedOrigins = new Set((Deno.env.get('GROWTHER_ALLOWED_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean));
allowedOrigins.add('http://localhost:8000');
allowedOrigins.add('http://127.0.0.1:8000');
const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
});
function reply(origin: string, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  if (!origin || !allowedOrigins.has(origin)) return new Response('Origin not allowed', { status: 403 });
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return reply(origin, 405, { error: 'METHOD_NOT_ALLOWED' });
  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!accessToken || !url || !anonKey) return reply(origin, 401, { error: 'SIGN_IN_REQUIRED' });

  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } } });
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) return reply(origin, 401, { error: 'SIGN_IN_REQUIRED' });
  const { data: profile, error: profileError } = await supabase.from('profiles').select('age_band').eq('id', authData.user.id).maybeSingle();
  if (profileError) return reply(origin, 503, { error: 'PROFILE_UNAVAILABLE' });
  if (!profile || !['18–24', '25+'].includes(profile.age_band)) return reply(origin, 403, { error: 'ADULT_ACCOUNT_REQUIRED' });

  let purchaseToken = '';
  try {
    const body = await request.json();
    purchaseToken = typeof body?.purchase_token === 'string' ? body.purchase_token : '';
  } catch { return reply(origin, 400, { error: 'INVALID_PURCHASE_TOKEN' }); }
  if (!purchaseToken || purchaseToken.length > 4096) return reply(origin, 400, { error: 'INVALID_PURCHASE_TOKEN' });

  try {
    const verified = await verifyPlaySubscription(purchaseToken);
    if (!verified.active) return reply(origin, 200, { active: false });
    const { data: claimed, error: claimError } = await supabase.rpc('claim_google_play_purchase_token', { p_token_hash: await sha256Hex(purchaseToken) });
    if (claimError) return reply(origin, 503, { error: 'PURCHASE_CLAIM_UNAVAILABLE' });
    if (claimed !== true) return reply(origin, 403, { error: 'PURCHASE_ALREADY_LINKED', message: 'This Google Play purchase is linked to another Growther account.' });
    return reply(origin, 200, { active: true, productId: verified.productId, expiresAt: verified.expiresAt });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'INVALID_PURCHASE_TOKEN') return reply(origin, 400, { error: code });
    console.error('Google Play subscription verification failed:', code);
    return reply(origin, 503, { error: code === 'GOOGLE_PLAY_BILLING_NOT_CONFIGURED' ? code : 'PURCHASE_VERIFICATION_UNAVAILABLE', message: 'Google Play could not verify the subscription right now. Please try again.' });
  }
});
