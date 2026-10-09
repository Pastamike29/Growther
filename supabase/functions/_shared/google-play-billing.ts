const PACKAGE_NAME = 'com.wongwaiyut.growther';
export const PLAY_PLANS = new Map([
  ['growther_premium_monthly', 'monthly'],
  ['growther_premium_annual', 'annual'],
]);

type VerifiedSubscription = {
  active: boolean;
  productId?: string;
  expiresAt?: string;
};

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeJson(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemBytes(pem: string) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(body);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function getAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value;
  const rawCredentials = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!rawCredentials) throw new Error('GOOGLE_PLAY_BILLING_NOT_CONFIGURED');
  let credentials: { client_email?: string; private_key?: string };
  try { credentials = JSON.parse(rawCredentials); } catch { throw new Error('GOOGLE_PLAY_BILLING_NOT_CONFIGURED'); }
  if (!credentials.client_email || !credentials.private_key) throw new Error('GOOGLE_PLAY_BILLING_NOT_CONFIGURED');

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(credentials.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error('GOOGLE_PLAY_AUTH_FAILED');
  const token = await response.json();
  if (typeof token.access_token !== 'string') throw new Error('GOOGLE_PLAY_AUTH_FAILED');
  cachedAccessToken = { value: token.access_token, expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000 };
  return cachedAccessToken.value;
}

export async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyPlaySubscription(purchaseToken: string): Promise<VerifiedSubscription> {
  if (!purchaseToken || purchaseToken.length > 4096) throw new Error('INVALID_PURCHASE_TOKEN');
  const accessToken = await getAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 404 || response.status === 400) return { active: false };
  if (!response.ok) throw new Error('GOOGLE_PLAY_VERIFY_FAILED');
  const subscription = await response.json();
  const state = subscription.subscriptionState;
  if (!['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(state)) return { active: false };

  const now = Date.now();
  const lineItem = (subscription.lineItems || []).find((item: Record<string, unknown>) => {
    const productId = String(item.productId || '');
    const expiry = Date.parse(String(item.expiryTime || ''));
    const basePlanId = String((item.offerDetails as Record<string, unknown> | undefined)?.basePlanId || '');
    return PLAY_PLANS.get(productId) === basePlanId && Number.isFinite(expiry) && expiry > now;
  });
  if (!lineItem) return { active: false };

  if (subscription.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
    const productId = String(lineItem.productId);
    const ackUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
    const ackResponse = await fetch(ackUrl, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (!ackResponse.ok) throw new Error('GOOGLE_PLAY_ACKNOWLEDGE_FAILED');
  }
  return { active: true, productId: String(lineItem.productId), expiresAt: String(lineItem.expiryTime) };
}
