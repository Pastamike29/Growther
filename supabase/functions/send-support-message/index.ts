const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
  'Vary': 'Origin',
});

const recentRequests = new Map<string, number[]>();
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 3;
const MAX_BODY_BYTES = 8_000;

function response(origin: string, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function isAllowedOrigin(origin: string) {
  return (Deno.env.get('GROWTHER_ALLOWED_ORIGINS') || '')
    .split(',').map(value => value.trim()).filter(Boolean).includes(origin);
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function consumeLimit(key: string, now: number) {
  const active = (recentRequests.get(key) || []).filter(time => now - time < RATE_WINDOW_MS);
  if (active.length >= RATE_LIMIT) {
    recentRequests.set(key, active);
    return false;
  }
  active.push(now);
  recentRequests.set(key, active);
  return true;
}

function pruneRateLimits(now: number) {
  if (recentRequests.size < 2_000) return;
  for (const [key, requests] of recentRequests) {
    if (!requests.some(time => now - time < RATE_WINDOW_MS)) recentRequests.delete(key);
  }
}

async function readLimitedBody(request: Request) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, character => entities[character] || character);
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin') || '';
  if (!origin || !isAllowedOrigin(origin)) return new Response('Origin not allowed', { status: 403 });
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return response(origin, 405, { error: 'Use POST to send a support message.' });

  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) return response(origin, 413, { error: 'Your note is too long.' });

  try {
    const rawBody = await readLimitedBody(request);
    if (rawBody === null) return response(origin, 413, { error: 'Your note is too long.' });

    let payload: unknown;
    try { payload = JSON.parse(rawBody); } catch { return response(origin, 400, { error: 'The support request was not valid.' }); }
    if (!payload || typeof payload !== 'object') return response(origin, 400, { error: 'The support request was not valid.' });
    const data = payload as Record<string, unknown>;
    const kind = typeof data.kind === 'string' ? data.kind : '';
    const name = typeof data.name === 'string' ? data.name.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const email = typeof data.email === 'string' ? data.email.trim() : '';
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    const website = typeof data.website === 'string' ? data.website.trim() : '';
    const consent = data.consent === true;
    const rating = typeof data.rating === 'number' ? data.rating : NaN;
    const scanLog = typeof data.scanLog === 'string'
      ? data.scanLog.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
      : '';
    const isMealScanFeedback = kind === 'meal-scan-feedback';

    // Hidden honeypot field: humans leave it empty; basic bots often fill every field.
    if (website) return response(origin, 200, { ok: true });
    if (!['support', 'feedback', 'bug', 'meal-scan-feedback'].includes(kind)) return response(origin, 400, { error: 'Choose a valid message type.' });
    if (name.length < 2 || name.length > 80) return response(origin, 400, { error: 'Enter a name between 2 and 80 characters.' });
    if (!validEmail(email)) return response(origin, 400, { error: 'Enter a valid reply email address.' });
    if (isMealScanFeedback) {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return response(origin, 400, { error: 'Choose an accuracy score from 1 to 5.' });
      if (scanLog.length < 10 || scanLog.length > 5_000) return response(origin, 400, { error: 'The meal scan details were missing or too long.' });
      if (message.length > 1_000) return response(origin, 400, { error: 'Keep the optional feedback note under 1,000 characters.' });
    } else if (message.length < 10 || message.length > 1500) return response(origin, 400, { error: 'Write a note between 10 and 1,500 characters.' });
    if (!consent) return response(origin, 400, { error: 'Confirm that your contact details and note can be emailed to support.' });

    const supportEmail = Deno.env.get('GROWTHER_SUPPORT_EMAIL') || '';
    const from = Deno.env.get('RESEND_FROM_EMAIL') || '';
    const apiKey = Deno.env.get('RESEND_API_KEY') || '';
    if (!validEmail(supportEmail) || !from || !apiKey) return response(origin, 503, { error: 'Email support is not configured yet. Please try again later.' });

    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const [ipKey, emailKey] = await Promise.all([digest(`ip:${ip}`), digest(`email:${email.toLowerCase()}`)]);
    const now = Date.now();
    pruneRateLimits(now);
    if ((ip !== 'unknown' && !consumeLimit(ipKey, now)) || !consumeLimit(emailKey, now)) return response(origin, 429, { error: 'Too many messages were sent. Please wait 15 minutes and try again.' });

    const labels: Record<string, string> = { support: 'Contact support', feedback: 'Product feedback', bug: 'Bug report', 'meal-scan-feedback': 'Meal scan accuracy feedback' };
    const label = labels[kind];
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message).replace(/\r?\n/g, '<br>');
    const safeScanLog = escapeHtml(scanLog);
    const textBody = isMealScanFeedback
      ? `${label}\nFrom: ${name}\nReply email: ${email}\nAccuracy rating: ${rating}/5\n\nScan log:\n${scanLog}\n\nAdditional note:\n${message || '(none)'}\n\nThe user confirmed this text feedback may be emailed. The uploaded photo was not attached.`
      : `${label}\nFrom: ${name}\nReply email: ${email}\n\n${message}`;
    const htmlBody = isMealScanFeedback
      ? `<h2>${label}</h2><p><strong>Name:</strong> ${safeName}<br><strong>Reply email:</strong> ${safeEmail}<br><strong>Accuracy rating:</strong> ${rating}/5</p><h3>Scan log</h3><pre style="white-space:pre-wrap;font:inherit">${safeScanLog}</pre><h3>Additional note</h3><p>${safeMessage || '(none)'}</p><p>The uploaded photo was not attached.</p>`
      : `<h2>${label}</h2><p><strong>Name:</strong> ${safeName}<br><strong>Reply email:</strong> ${safeEmail}</p><hr><p>${safeMessage}</p>`;
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(12_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [supportEmail],
        reply_to: email,
        subject: `[Growther ${label}] ${name}`,
        text: textBody,
        html: htmlBody,
      }),
    });
    if (!sent.ok) return response(origin, 502, { error: 'Support email could not be sent. Please try again later.' });
    return response(origin, 200, { ok: true });
  } catch {
    return response(origin, 502, { error: 'Support email could not be sent. Please try again later.' });
  }
});
