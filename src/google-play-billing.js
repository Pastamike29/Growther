import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';

const plans = {
  monthly: { productIdentifier: 'growther_premium_monthly', basePlanId: 'monthly' },
  annual: { productIdentifier: 'growther_premium_annual', basePlanId: 'annual' },
};
let signedInAdult = false;
let productsByPlan = {};
let verifiedPurchaseToken = null;

function isAndroidApp() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function setPremium(active) {
  window.gaPremiumSubscriptionActive = active === true;
  try {
    if (active) localStorage.setItem('ga-premium-subscription-status', 'active');
    else localStorage.removeItem('ga-premium-subscription-status');
  } catch (_) {}
  const manage = document.querySelector('#gaPremiumOfferBackdrop [data-premium-manage]');
  if (manage) {
    manage.hidden = !active;
    const actions = manage.closest('[data-premium-actions]');
    if (actions) actions.hidden = !active;
  }
  window.dispatchEvent(new CustomEvent('growther-premium-changed', { detail: { active: active === true } }));
}

function errorMessage(error) {
  return error?.message || 'Google Play could not complete that action. Please try again.';
}

async function fetchStoreProducts() {
  if (!isAndroidApp() || !signedInAdult) return;
  try {
    const { isBillingSupported } = await NativePurchases.isBillingSupported();
    if (!isBillingSupported) throw new Error('Google Play Billing is not available on this device.');
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: Object.values(plans).map(plan => plan.productIdentifier),
      productType: PURCHASE_TYPE.SUBS,
    });
    productsByPlan = {};
    for (const [planName, plan] of Object.entries(plans)) {
      const product = products.find(item => item.planIdentifier === plan.productIdentifier && item.identifier === plan.basePlanId);
      if (product) productsByPlan[planName] = product;
    }
    renderStorePrices();
  } catch (error) {
    console.warn('Google Play product query failed:', error);
  }
}

function formatWeekly(product, planName) {
  const weeks = planName === 'annual' ? 52 : 52 / 12;
  const weekly = product.price / weeks;
  const amount = new Intl.NumberFormat(undefined, {
    style: 'currency', currency: product.currencyCode, maximumFractionDigits: 2,
  }).format(weekly);
  return `≈ ${amount} / week`;
}

function renderStorePrices() {
  const monthly = productsByPlan.monthly;
  const annual = productsByPlan.annual;
  const setText = (selector, value) => {
    const node = document.querySelector(`#gaPremiumOfferBackdrop ${selector}`);
    if (node) { node.textContent = value; node.hidden = false; }
  };
  if (monthly) {
    setText('[data-premium-monthly-cost]', `${monthly.priceString} / month`);
    setText('[data-premium-weekly-monthly]', formatWeekly(monthly, 'monthly'));
  }
  if (annual) {
    setText('[data-premium-yearly-cost]', `${annual.priceString} / year`);
    setText('[data-premium-weekly-yearly]', formatWeekly(annual, 'annual'));
  }
}

async function verifyToken(purchaseToken) {
  if (!window.gaBillingVerifyPurchase) throw new Error('Secure purchase verification is not configured.');
  const result = await window.gaBillingVerifyPurchase(purchaseToken);
  if (!result?.active) return false;
  verifiedPurchaseToken = purchaseToken;
  setPremium(true);
  return true;
}

async function refreshSubscription() {
  if (!isAndroidApp() || !signedInAdult) { setPremium(false); verifiedPurchaseToken = null; return null; }
  try {
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS });
    for (const purchase of purchases || []) {
      if (purchase.purchaseState !== '1' || !purchase.purchaseToken) continue;
      if (await verifyToken(purchase.purchaseToken)) return purchase.purchaseToken;
    }
  } catch (error) {
    console.warn('Subscription status could not be refreshed:', error);
  }
  verifiedPurchaseToken = null;
  setPremium(false);
  return null;
}

async function activePurchaseToken() {
  if (!isAndroidApp() || !signedInAdult) return null;
  // The Edge Function revalidates the token with Play before every AI request.
  if (verifiedPurchaseToken) return verifiedPurchaseToken;
  return await refreshSubscription();
}

async function choosePlan(planName) {
  if (!isAndroidApp()) { window.alert('Google Play subscriptions are available in the Android app.'); return; }
  if (!signedInAdult) { window.alert('Sign in with your adult account before subscribing.'); return; }
  const plan = plans[planName];
  const product = productsByPlan[planName];
  if (!plan || !product) {
    window.alert('This plan is not available yet. Create and activate its Google Play subscription and base plan first.');
    return;
  }
  try {
    const purchase = await NativePurchases.purchaseProduct({
      productIdentifier: plan.productIdentifier,
      planIdentifier: plan.basePlanId,
      offerToken: product.offerToken,
      productType: PURCHASE_TYPE.SUBS,
      autoAcknowledgePurchases: false,
    });
    if (purchase.purchaseState !== '1' || !purchase.purchaseToken) {
      window.alert('Google Play has not completed the payment yet. Premium access will start after payment completes.');
      return;
    }
    if (await verifyToken(purchase.purchaseToken)) window.alert('Growther Premium is active.');
    else window.alert('Google Play has not confirmed an active Premium subscription yet.');
  } catch (error) {
    if (error?.userCancelled || /cancel/i.test(error?.message || '')) return;
    window.alert(errorMessage(error));
  }
}

async function restorePurchases() {
  if (!isAndroidApp() || !signedInAdult) { window.alert('Sign in to your adult account first.'); return; }
  try {
    await NativePurchases.restorePurchases();
    const token = await refreshSubscription();
    window.alert(token ? 'Your Growther Premium subscription was restored.' : 'No active Growther Premium subscription was found.');
  } catch (error) { window.alert(errorMessage(error)); }
}

async function manageSubscription() {
  try { await NativePurchases.manageSubscriptions(); }
  catch (error) { window.alert(errorMessage(error)); }
}

function ensureSubscriptionActions() {
  if (!isAndroidApp()) return;
  const panel = document.querySelector('#gaPremiumOfferBackdrop .ga-premium-offer');
  if (!panel || panel.querySelector('[data-premium-actions]')) return;
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;justify-content:center;gap:16px;align-items:center;margin:8px auto 0;position:relative;z-index:8';
  actions.dataset.premiumActions = 'true';
  actions.hidden = !window.gaPremiumSubscriptionActive;
  const style = 'border:0;background:transparent;color:#f3ddff;text-decoration:underline;font:600 12px system-ui;cursor:pointer;padding:5px 8px';
  const manage = document.createElement('button');
  manage.type = 'button'; manage.textContent = 'Manage subscription'; manage.dataset.premiumManage = 'true';
  manage.hidden = !window.gaPremiumSubscriptionActive; manage.style.cssText = style;
  manage.addEventListener('click', manageSubscription);
  actions.append(manage);
  panel.append(actions);
}

window.gaPremiumChoosePlan = choosePlan;
window.gaPremiumRestorePurchases = restorePurchases;
window.gaGetActivePurchaseToken = activePurchaseToken;
window.addEventListener('growther-auth-changed', event => {
  signedInAdult = event.detail?.signedIn === true && event.detail?.isAdult === true;
  if (signedInAdult) { fetchStoreProducts(); refreshSubscription(); }
  else { verifiedPurchaseToken = null; setPremium(false); }
});
window.gaBillingGetIdentity?.().then(identity => {
  signedInAdult = identity?.signedIn === true && identity?.isAdult === true;
  if (signedInAdult) { fetchStoreProducts(); refreshSubscription(); }
});
new MutationObserver(ensureSubscriptionActions).observe(document.documentElement, { childList: true, subtree: true });
