import { createClient } from 'npm:@supabase/supabase-js@2';
import { MEAL_RESPONSE_SCHEMA, parseImageDataUrl, parseModelContent } from '../_shared/meal-schema.mjs';
import { sha256Hex, verifyPlaySubscription } from '../_shared/google-play-billing.ts';

const MAX_REQUEST_BYTES = 6 * 1024 * 1024;
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

// Allow only the two local origins used by the documented development server.
// Production HTTPS domains must still be explicitly listed in GROWTHER_ALLOWED_ORIGINS.
const localDevelopmentOrigins = new Set(['http://localhost:8000', 'http://127.0.0.1:8000']);
function allowedOrigin(origin: string) {
  const configured = (Deno.env.get('GROWTHER_ALLOWED_ORIGINS') || '').split(',').map(x => x.trim()).filter(Boolean);
  return configured.includes(origin) || localDevelopmentOrigins.has(origin);
}

const systemPrompt = `You are a careful, globally informed food-recognition and nutrition-estimation assistant. Analyze one meal photo and return only JSON matching the supplied schema.

Recognize foods across cuisines worldwide; do not default to Thai or Asian food. This includes Thai, Japanese, Korean, Chinese, Vietnamese, Indian, American, British/English, Mexican, Italian, French, Spanish, Mediterranean, Middle Eastern, European, Southeast Asian, Western fast food, and packaged foods. Examples include pad kra pao, pad Thai, tom yum, sushi, ramen, bibimbap, bulgogi, fish and chips, shepherd's pie, chicken tikka masala, hamburgers, pizza, pasta, tacos, burritos, and packaged snacks. These examples are not an exhaustive list.

Identify the cuisine and dish only when visual evidence supports them. Use the most reliable level of detail: an exact dish when clear, a broad name such as "chicken rice bowl" when uncertain, or visible components such as "cooked chicken + white rice" when that is all that can be established. Never invent a specific dish because it resembles one. Use a clear English name; give localized_name in the dish's relevant language/script only when confident, otherwise null. Report visible food items, not hidden ingredients. Estimate edible grams and nutrition per item, with lower confidence when size, ingredients, sauces, oil, or recipe are obscured. Calories and macronutrients are approximate, not exact. Do not infer medical or dietary advice.

If this is not recognizable food or a meal, set success false, error to NO_FOOD_DETECTED or UNRECOGNIZABLE_FOOD, leave items empty, use null dish/cuisine names, zero confidence and zero total values. Never invent foods. Put uncertainty and image-dependent caveats in notes. Return the full JSON object only, with no markdown or extra prose.`;

const textSystemPrompt = `You are a careful, globally informed nutrition-estimation assistant. Estimate nutrition for a meal described by the user and return only JSON matching the supplied schema.

Recognize foods across world cuisines. Use the most reliable dish name supported by the text; do not invent hidden ingredients or a precise recipe. Estimate one typical serving unless the user supplies a portion size. Return visible/mentioned components as separate items when useful, with estimated edible grams, calories, protein, carbohydrates, and fat. Nutrition estimates are approximate; recipes, oil, sauces, and portion sizes vary. State uncertainty in notes. Do not give medical or dietary advice. If the text does not describe recognizable food, set success false, use NO_FOOD_DETECTED or UNRECOGNIZABLE_FOOD, leave items empty, set zero confidence and zero totals. Return the full JSON object only, with no markdown or extra prose.`;

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin') || '';
  if (!origin || !allowedOrigin(origin)) return new Response('Origin not allowed', { status: 403 });
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return reply(origin, 405, { success: false, error: 'METHOD_NOT_ALLOWED', message: 'Use POST to analyze a meal photo.' });

  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_REQUEST_BYTES) return reply(origin, 413, { success: false, error: 'IMAGE_TOO_LARGE', message: 'Choose an image under 4 MB after compression.' });
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply(origin, 401, { success: false, error: 'SIGN_IN_REQUIRED', message: 'Sign in with an adult account to analyze a meal.' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    const model = Deno.env.get('OPENROUTER_MODEL');
    if (!supabaseUrl || !anonKey || !openRouterKey || !model) return reply(origin, 503, { success: false, error: 'SCANNER_NOT_CONFIGURED', message: 'Meal scanning is temporarily unavailable.' });

    const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) return reply(origin, 401, { success: false, error: 'SIGN_IN_REQUIRED', message: 'Sign in to analyze a meal.' });
    const { data: profile, error: profileError } = await supabase.from('profiles').select('age_band').eq('id', userData.user.id).maybeSingle();
    if (profileError) return reply(origin, 503, { success: false, error: 'PROFILE_UNAVAILABLE', message: 'Your cloud profile could not be checked. Try again later.' });
    if (!profile || !['18–24', '25+'].includes(profile.age_band)) return reply(origin, 403, { success: false, error: 'ADULT_ACCOUNT_REQUIRED', message: 'Meal photo analysis is currently available to signed-in adult accounts only.' });

    let rawBody: string;
    try { rawBody = await request.text(); } catch { return reply(origin, 400, { success: false, error: 'INVALID_REQUEST', message: 'Enter a meal name or choose a photo.' }); }
    if (rawBody.length > MAX_REQUEST_BYTES) return reply(origin, 413, { success: false, error: 'REQUEST_TOO_LARGE', message: 'That request is too large. Try a shorter meal description or smaller photo.' });
    let body: unknown;
    try { body = JSON.parse(rawBody); } catch { return reply(origin, 400, { success: false, error: 'INVALID_REQUEST', message: 'Enter a meal name or choose a photo.' }); }
    if (!body || typeof body !== 'object') return reply(origin, 400, { success: false, error: 'INVALID_REQUEST', message: 'Enter a meal name or choose a photo.' });
    const input = body as { image_data_url?: unknown; meal_name?: unknown; portion?: unknown; purchase_token?: unknown };
    const purchaseToken = typeof input.purchase_token === 'string' ? input.purchase_token : '';
    if (!purchaseToken) return reply(origin, 403, { success: false, error: 'PREMIUM_REQUIRED', message: 'An active Growther Premium subscription is required to use AI features.' });
    let verifiedPurchase;
    try { verifiedPurchase = await verifyPlaySubscription(purchaseToken); }
    catch (error) {
      console.error('Google Play subscription check failed:', error instanceof Error ? error.message : 'unknown error');
      return reply(origin, 503, { success: false, error: 'PREMIUM_STATUS_UNAVAILABLE', message: 'Premium access could not be checked. Please try again later.' });
    }
    if (!verifiedPurchase.active) return reply(origin, 403, { success: false, error: 'PREMIUM_REQUIRED', message: 'An active Growther Premium subscription is required to use AI features.' });
    const { data: claimed, error: claimError } = await supabase.rpc('claim_google_play_purchase_token', { p_token_hash: await sha256Hex(purchaseToken) });
    if (claimError) return reply(origin, 503, { success: false, error: 'PREMIUM_STATUS_UNAVAILABLE', message: 'Premium access could not be checked. Please try again later.' });
    if (claimed !== true) return reply(origin, 403, { success: false, error: 'PURCHASE_ALREADY_LINKED', message: 'This Google Play purchase is linked to another Growther account.' });
    const hasImage = typeof input.image_data_url === 'string';
    const mealName = typeof input.meal_name === 'string' ? input.meal_name.trim() : '';
    const hasText = mealName.length > 0;
    if (hasImage === hasText) return reply(origin, 400, { success: false, error: 'INVALID_REQUEST', message: 'Send either a meal name or one meal photo.' });
    if (hasText && (mealName.length < 2 || mealName.length > 120)) return reply(origin, 400, { success: false, error: 'INVALID_MEAL_NAME', message: 'Enter a meal name between 2 and 120 characters.' });
    const portion = ['small', 'usual', 'large', 'unsure'].includes(String(input.portion)) ? String(input.portion) : 'unsure';
    let image: { mime: string; bytes: Uint8Array } | null = null;
    if (hasImage) {
      try { image = parseImageDataUrl(input.image_data_url as string); }
      catch (error) {
        const code = error instanceof Error ? error.message : '';
        return reply(origin, code === 'IMAGE_TOO_LARGE' ? 413 : 400, { success: false, error: code === 'IMAGE_TOO_LARGE' ? code : 'INVALID_IMAGE', message: code === 'IMAGE_TOO_LARGE' ? 'Choose an image under 4 MB after compression.' : 'That image could not be read. Choose a JPEG, PNG, or WebP photo.' });
      }
    }

    const { data: quotaAvailable, error: quotaError } = await supabase.rpc('consume_meal_scan_quota');
    if (quotaError) return reply(origin, 503, { success: false, error: 'SCANNER_NOT_CONFIGURED', message: 'Meal scanning is temporarily unavailable.' });
    if (!quotaAvailable) return reply(origin, 429, { success: false, error: 'RATE_LIMITED', message: 'Daily scan limit reached. Please try again tomorrow.' });

    let upstream: Response;
    try {
      upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(50000),
        headers: { Authorization: `Bearer ${openRouterKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': origin, 'X-Title': 'Growther Meal Scanner' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: hasText ? textSystemPrompt : systemPrompt },
            { role: 'user', content: hasText
              ? `Estimate nutrition for this meal name: "${mealName}". Portion size: ${portion}. Return the required JSON. Use typical ingredients and a typical serving when details are missing; mention uncertainty instead of guessing exact recipes.`
              : [
                { type: 'text', text: 'Identify this complete meal and estimate each visible food item. Return the required JSON. If the exact dish is uncertain, use a broader food name rather than guessing.' },
                { type: 'image_url', image_url: { url: `data:${image!.mime};base64,${(input.image_data_url as string).split(',')[1]}` } },
              ] },
          ],
          response_format: { type: 'json_schema', json_schema: { name: 'meal_photo_analysis', strict: true, schema: MEAL_RESPONSE_SCHEMA } },
          provider: { require_parameters: true }, temperature: 0.1, max_tokens: 1800, stream: false,
        }),
      });
    } catch (error) {
      const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      return reply(origin, timeout ? 504 : 502, { success: false, error: timeout ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE', message: timeout ? 'Meal analysis took too long. Try again with a clearer, smaller photo.' : 'The meal analysis service could not be reached. Try again later.' });
    }
    if (upstream.status === 429) return reply(origin, 429, { success: false, error: 'RATE_LIMITED', message: 'The meal analysis service is busy. Please wait and try again.' });
    if (!upstream.ok) return reply(origin, 502, { success: false, error: 'AI_UNAVAILABLE', message: 'The meal analysis service could not complete this scan. Try again later.' });

    let envelope: { choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }> };
    try { envelope = await upstream.json(); } catch { return reply(origin, 502, { success: false, error: 'INVALID_MODEL_RESPONSE', message: 'The scan result could not be read. Please try again.' }); }
    const choice = envelope.choices?.[0];
    if (!choice || choice.finish_reason === 'content_filter' || typeof choice.message?.content !== 'string') return reply(origin, 502, { success: false, error: 'INVALID_MODEL_RESPONSE', message: 'The scan result could not be read. Please try again.' });
    let result;
    try { result = parseModelContent(choice.message.content); }
    catch { return reply(origin, 502, { success: false, error: 'INVALID_MODEL_RESPONSE', message: 'The scan result was incomplete. Try again with a clearer photo.' }); }
    return reply(origin, 200, result);
  } catch {
    return reply(origin, 500, { success: false, error: 'INTERNAL_ERROR', message: 'Meal analysis failed. Please try again later.' });
  }
});
