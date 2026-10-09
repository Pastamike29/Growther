/* The photo stays in memory in this browser. Only its compressed data URL is sent to the authenticated Edge Function. */
let gaMealScanFile = null;
let gaMealScanPreviewUrl = null;
let gaMealScanResult = null;
let gaMealScanBusy = false;

const gaMealScanBaseFuel = window.fuel;
window.fuel = function () {
  let html = gaMealScanBaseFuel();
  const heading = html.indexOf('<div class="section-head"><h2>Scan a meal photo</h2>');
  const start = html.indexOf('<section class="scanner-box">', heading);
  const end = html.indexOf('</section>', start);
  if (heading < 0 || start < 0 || end < 0) return html;
  const scanner = `<section class="scanner-box ga-meal-scanner" aria-label="AI meal photo scanner">
    <label class="scanner-button ga-scan-picker" onclick="return gaMealScanRequestPhoto(event)">📷 Take or choose one clear photo
      <input id="gaMealScanInput" type="file" accept="image/*" onchange="gaMealScanPhotoSelected(this)">
    </label>
    <div class="ga-meal-preview" id="gaMealPreview" hidden><img id="gaMealPreviewImage" alt="Preview of the selected meal photo"><span>Preview stays on this device until you analyze.</span></div>
    <p class="ga-meal-scan-notice">Available to signed-in adult cloud accounts. You can make up to 7 AI food requests per day across photo scans and typed meal estimates. Analysis sends this photo to Growther’s AI provider for a one-time estimate. Growther does not save the photo. Avoid photos containing faces, labels with personal details, or other private information.</p>
    <label class="ga-meal-consent"><input id="gaMealScanConsent" type="checkbox" onchange="gaMealScanEnableAnalyze()"><span>I understand this meal photo will be sent for AI analysis.</span></label>
    <div class="ga-meal-auth" id="gaMealScanAuth" hidden onclick="if(event.target===this)gaMealScanCloseAuth()"><section class="ga-meal-auth-card" role="dialog" aria-modal="true" aria-labelledby="gaMealAuthTitle"><button class="ga-meal-auth-close" type="button" aria-label="Close sign in" onclick="gaMealScanCloseAuth()">×</button><strong id="gaMealAuthTitle">Sign in to scan a meal</strong><p>Continue with Google to use meal scanning. Your photo is sent for analysis only after you confirm sharing and tap Analyze Meal.</p><button type="button" class="ga-meal-google" id="gaCloudGoogle" onclick="gaCloudSignInWithGoogle()">Continue with Google</button><p class="ga-meal-auth-message" id="gaCloudMessage" role="status" aria-live="polite"></p></section></div>
    <div class="ga-meal-scan-actions"><button class="cta secondary" type="button" onclick="gaMealScanClearPhoto()">Remove photo</button><button class="cta" id="gaMealAnalyzeButton" type="button" onclick="gaAnalyzeMealPhoto()" disabled>Analyze Meal</button></div>
    <div id="gaMealScanStatus" class="ga-meal-scan-status" role="status" aria-live="polite" hidden></div>
    <section id="gaMealScanResult" class="ga-meal-scan-result" aria-label="Meal analysis result" hidden></section>
  </section>`;
  setTimeout(() => gaMealScanUpdateAuthUI(!!gaCloudUser), 0);
  return html.slice(0, start) + scanner + html.slice(end + '</section>'.length);
};

function gaMealScanText(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function gaMealScanGetStatus() { return document.getElementById('gaMealScanStatus'); }
function gaMealScanSetStatus(message, kind = '') {
  const status = gaMealScanGetStatus();
  if (!status) return;
  status.hidden = !message;
  status.className = `ga-meal-scan-status ${kind}`.trim();
  status.textContent = message;
}

function gaMealScanEnableAnalyze() {
  const button = document.getElementById('gaMealAnalyzeButton');
  const consent = document.getElementById('gaMealScanConsent');
  if (button) button.disabled = gaMealScanBusy || !gaMealScanFile || !consent?.checked;
}

function gaMealScanRequestPhoto(event) {
  if (typeof gaCloudUser !== 'undefined' && gaCloudUser) return true;
  event?.preventDefault();
  gaMealScanOpenAuth();
  return false;
}

function gaMealScanOpenAuth() {
  const modal = document.getElementById('gaMealScanAuth');
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  gaCloudShow(secure ? 'Continue with Google to sign in.' : 'Open Growther over HTTPS or localhost to continue with Google.', !secure);
  setTimeout(() => document.getElementById('gaCloudGoogle')?.focus(), 20);
}

function gaMealScanCloseAuth() {
  const modal = document.getElementById('gaMealScanAuth');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

function gaMealScanUpdateAuthUI(signedIn) {
  const modal = document.getElementById('gaMealScanAuth');
  if (signedIn && modal && !modal.hidden) {
    gaMealScanCloseAuth();
    gaMealScanSetStatus('Signed in. Tap Take or choose one clear photo to continue.', 'success');
  }
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.getElementById('gaMealScanAuth')?.hidden) gaMealScanCloseAuth();
});

function gaMealScanToJpeg(blob, maxEdge = 1800, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const finish = (image, bitmap = null) => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('IMAGE_DECODE_FAILED');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(output => {
          URL.revokeObjectURL(url);
          bitmap?.close?.();
          if (!output) reject(new Error('IMAGE_DECODE_FAILED'));
          else resolve(output);
        }, 'image/jpeg', quality);
      } catch (error) {
        URL.revokeObjectURL(url);
        bitmap?.close?.();
        reject(error);
      }
    };
    if (window.createImageBitmap) {
      createImageBitmap(blob).then(bitmap => finish(bitmap, bitmap)).catch(() => {
        const image = new Image();
        image.onload = () => finish(image);
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('IMAGE_DECODE_FAILED')); };
        image.src = url;
      });
    } else {
      const image = new Image();
      image.onload = () => finish(image);
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('IMAGE_DECODE_FAILED')); };
      image.src = url;
    }
  });
}

async function gaMealScanPhotoSelected(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  gaMealScanFile = null;
  gaMealScanEnableAnalyze();
  if (gaMealScanPreviewUrl) URL.revokeObjectURL(gaMealScanPreviewUrl);
  gaMealScanPreviewUrl = null;
  const oldPreview = document.getElementById('gaMealPreview');
  const oldPreviewImage = document.getElementById('gaMealPreviewImage');
  if (oldPreviewImage) oldPreviewImage.removeAttribute('src');
  if (oldPreview) oldPreview.hidden = true;
  const oldConsent = document.getElementById('gaMealScanConsent');
  if (oldConsent) oldConsent.checked = false;
  gaMealScanEnableAnalyze();
  if (file.type && !file.type.startsWith('image/')) {
    gaMealScanSetStatus('Choose an image file from your gallery or camera.', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    gaMealScanSetStatus('That image is over 10 MB. Choose a smaller photo.', 'error');
    return;
  }
  try {
    const compressed = await gaMealScanToJpeg(file);
    if (compressed.size > 4 * 1024 * 1024) {
      const smaller = await gaMealScanToJpeg(file, 1280, 0.72);
      if (smaller.size > 4 * 1024 * 1024) throw new Error('IMAGE_TOO_LARGE');
      gaMealScanFile = smaller;
    } else gaMealScanFile = compressed;
    if (gaMealScanPreviewUrl) URL.revokeObjectURL(gaMealScanPreviewUrl);
    gaMealScanPreviewUrl = URL.createObjectURL(file);
    const preview = document.getElementById('gaMealPreview');
    const image = document.getElementById('gaMealPreviewImage');
    if (image) image.src = gaMealScanPreviewUrl;
    if (preview) preview.hidden = false;
    const consent = document.getElementById('gaMealScanConsent');
    if (consent) consent.checked = false;
    gaMealScanResult = null;
    document.getElementById('gaMealScanResult').hidden = true;
    gaMealScanSetStatus('Photo ready. Check the sharing box to enable Analyze Meal.', 'success');
  } catch (error) {
    gaMealScanFile = null;
    gaMealScanSetStatus(error?.message === 'IMAGE_TOO_LARGE' ? 'This photo is still too large after compression. Try a smaller or lower-resolution image.' : 'This image could not be decoded. Choose another photo.', 'error');
  }
  gaMealScanEnableAnalyze();
}

function gaMealScanClearPhoto() {
  gaMealScanFile = null;
  gaMealScanResult = null;
  if (gaMealScanPreviewUrl) URL.revokeObjectURL(gaMealScanPreviewUrl);
  gaMealScanPreviewUrl = null;
  const preview = document.getElementById('gaMealPreview');
  const image = document.getElementById('gaMealPreviewImage');
  if (image) image.removeAttribute('src');
  if (preview) preview.hidden = true;
  const consent = document.getElementById('gaMealScanConsent');
  if (consent) consent.checked = false;
  const result = document.getElementById('gaMealScanResult');
  if (result) { result.hidden = true; result.replaceChildren(); }
  gaMealScanSetStatus('Photo removed. Choose or take another photo to scan.', '');
  gaMealScanEnableAnalyze();
}

function gaMealScanErrorText(code, status, detail = '') {
  if (code === 'NO_FOOD_DETECTED' || code === 'UNRECOGNIZABLE_FOOD') return 'No meal could be identified reliably. Try a clearer photo that shows the whole plate.';
  if (code === 'SIGN_IN_REQUIRED' || code === 'ADULT_ACCOUNT_REQUIRED') return 'Meal scanning currently requires a signed-in adult cloud account. Open Profile → Cloud Backup to sign in.';
  if (code === 'PREMIUM_REQUIRED' || status === 403) return 'An active Growther Premium subscription is required for AI meal scans and AI meal logs. Choose a plan to subscribe.';
  if (code === 'PREMIUM_STATUS_UNAVAILABLE') return 'Premium access could not be checked right now. Try again shortly.';
  if (code === 'RATE_LIMITED' || status === 429) return /daily scan limit reached/i.test(detail)
    ? 'Daily scan limit reached. Try again tomorrow.'
    : 'The meal analysis service is busy. Please wait and try again.';
  if (code === 'IMAGE_TOO_LARGE' || status === 413) return 'The compressed photo is too large. Choose a smaller image.';
  if (code === 'INVALID_IMAGE') return 'That image could not be read. Choose a JPEG, PNG, or WebP photo.';
  if (code === 'AI_TIMEOUT' || status === 504) return 'Analysis took too long. Try again with a clearer, smaller photo.';
  if (code === 'INVALID_MODEL_RESPONSE') return 'The scan returned an incomplete result. Try again with a clearer photo.';
  if (code === 'SCANNER_NOT_CONFIGURED') return 'The secure meal-scanning service is not configured for this site yet. The site owner needs to deploy it before photo analysis can work.';
  if (code === 'SCANNER_CONNECTION_FAILED') return 'Could not reach the meal scanner. Check your connection. If it keeps happening, the site owner must deploy scan-meal and allow this site origin in GROWTHER_ALLOWED_ORIGINS.';
  if (code === 'PROFILE_UNAVAILABLE' || code === 'AI_UNAVAILABLE' || status >= 500) return 'Meal scanning is temporarily unavailable. Try again later.';
  return 'Could not connect to the meal scanner. Check your connection and try again.';
}

async function gaAnalyzeMealPhoto() {
  const consent = document.getElementById('gaMealScanConsent');
  if (!gaMealScanFile) { gaMealScanSetStatus('Choose a meal photo first.', 'error'); return; }
  if (!consent?.checked) { gaMealScanSetStatus('Confirm the photo-sharing notice before analysis.', 'error'); return; }
  if (typeof gaCloudClient === 'undefined' || !gaCloudClient) {
    gaMealScanSetStatus('Cloud meal scanning is not configured for this site yet. The site owner must connect the secure scanner service.', 'error');
    return;
  }
  if (!gaCloudUser) {
    gaMealScanOpenAuth();
    return;
  }
  gaMealScanBusy = true;
  gaMealScanEnableAnalyze();
  const status = gaMealScanGetStatus();
  const steps = ['🔍 Identifying food across global cuisines…', '⚖️ Estimating visible portions…', '🧮 Checking nutrition estimates…'];
  let step = 0;
  gaMealScanSetStatus(steps[step]);
  const progress = setInterval(() => { step = Math.min(step + 1, steps.length - 1); gaMealScanSetStatus(steps[step]); }, 2200);
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'));
      reader.readAsDataURL(gaMealScanFile);
    });
    const purchaseToken = await window.gaGetActivePurchaseToken?.();
    if (!purchaseToken) { window.gaOpenPremiumOffer?.(); throw Object.assign(new Error('PREMIUM_REQUIRED'), { code: 'PREMIUM_REQUIRED', status: 403 }); }
    const { data, error } = await gaCloudClient.functions.invoke('scan-meal', { body: { image_data_url: dataUrl, purchase_token: purchaseToken } });
    if (error) {
      if (error.name === 'FunctionsFetchError' || /failed to send a request/i.test(error.message || '')) throw Object.assign(new Error('SCANNER_CONNECTION_FAILED'), { code: 'SCANNER_CONNECTION_FAILED' });
      let apiError = null;
      try { apiError = await error.context?.clone?.().json(); } catch { /* Use the safe local message below. */ }
      throw Object.assign(new Error(apiError?.message || 'SCAN_REQUEST_FAILED'), { code: apiError?.error, status: error.context?.status });
    }
    if (!data || typeof data.success !== 'boolean') throw Object.assign(new Error('INVALID_MODEL_RESPONSE'), { code: 'INVALID_MODEL_RESPONSE' });
    if (!data.success) throw Object.assign(new Error(data.message || 'No meal detected.'), { code: data.error });
    gaMealScanResult = data;
    gaMealScanRenderResult();
    gaMealScanSetStatus('Review and edit the estimate before saving. Nothing has been added to your log yet.', 'success');
  } catch (error) {
    const message = error.code === 'IMAGE_DECODE_FAILED' ? 'The photo could not be prepared. Choose another image.' : gaMealScanErrorText(error.code, error.status, error.message);
    gaMealScanSetStatus(message, 'error');
  } finally {
    clearInterval(progress);
    gaMealScanBusy = false;
    gaMealScanEnableAnalyze();
  }
}

function gaMealScanFormatConfidence(value) { return `${Math.round((Number(value) || 0) * 100)}% confidence`; }

function gaMealScanRenderResult() {
  const root = document.getElementById('gaMealScanResult');
  if (!root || !gaMealScanResult) return;
  const result = gaMealScanResult;
  root.replaceChildren();
  root.hidden = false;
  const head = document.createElement('div');
  head.className = 'ga-meal-result-head';
  const title = gaMealScanText('h3', '', 'Meal estimate');
  const cuisine = [result.cuisine, result.localized_name].filter(Boolean).join(' · ');
  head.append(title, gaMealScanText('span', 'ga-meal-confidence', gaMealScanFormatConfidence(result.confidence)));
  root.append(head);
  if (cuisine) root.append(gaMealScanText('p', 'ga-meal-cuisine', cuisine));
  const nameLabel = gaMealScanText('label', 'ga-meal-name-label', 'Meal name');
  const mealName = document.createElement('input');
  mealName.type = 'text'; mealName.maxLength = 120; mealName.value = result.meal_name; mealName.setAttribute('aria-label', 'Edit meal name');
  mealName.addEventListener('input', () => { result.meal_name = mealName.value; });
  nameLabel.append(mealName); root.append(nameLabel);
  const listHead = document.createElement('div'); listHead.className = 'ga-meal-items-head';
  listHead.append(gaMealScanText('strong', '', 'Detected foods'), gaMealScanText('small', '', 'Edit estimates or remove anything incorrect'));
  root.append(listHead);
  const list = document.createElement('div'); list.className = 'ga-meal-item-list';
  result.items.forEach((item, index) => list.append(gaMealScanCreateItem(item, index)));
  root.append(list);
  const add = document.createElement('button'); add.type = 'button'; add.className = 'cta secondary ga-meal-add-item'; add.textContent = '＋ Add food';
  add.addEventListener('click', () => { result.items.push({ name: 'New food item', localized_name: null, cuisine: result.cuisine, estimated_grams: 100, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, confidence: 0.5 }); gaMealScanRenderResult(); });
  root.append(add);
  const totals = document.createElement('section'); totals.className = 'ga-meal-totals'; totals.setAttribute('aria-label', 'Estimated meal totals');
  root.append(totals);
  const notes = document.createElement('ul'); notes.className = 'ga-meal-notes';
  (result.notes || []).forEach(note => notes.append(gaMealScanText('li', '', note)));
  root.append(notes, gaMealScanText('p', 'ga-meal-disclaimer', 'Nutrition values are estimates. Actual calories may vary with portion size, ingredients, cooking method, sauces, and oil. Use package labels or a trusted nutrition source when available.'));
  const save = document.createElement('button'); save.type = 'button'; save.className = 'cta ga-meal-save'; save.textContent = 'Save detected foods to today’s log'; save.addEventListener('click', gaMealScanSaveResult);
  root.append(save);
  gaMealScanRenderTotals(totals);
}

function gaMealScanCreateItem(item, index) {
  const card = document.createElement('article'); card.className = 'ga-meal-item';
  const top = document.createElement('div'); top.className = 'ga-meal-item-top';
  const name = document.createElement('input'); name.type = 'text'; name.maxLength = 100; name.value = item.name; name.setAttribute('aria-label', `Food ${index + 1} name`);
  name.addEventListener('input', () => { item.name = name.value; });
  const confidence = gaMealScanText('small', '', gaMealScanFormatConfidence(item.confidence));
  top.append(name, confidence);
  const fields = document.createElement('div'); fields.className = 'ga-meal-item-fields';
  const definitions = [['estimated_grams','Amount (g)',0.1,5000,1],['calories','Calories (kcal)',0,10000,1],['protein_g','Protein (g)',0,1000,0.1],['carbs_g','Carbs (g)',0,2000,0.1],['fat_g','Fat (g)',0,1000,0.1]];
  for (const [key, label, min, max, step] of definitions) {
    const wrap = gaMealScanText('label', 'ga-meal-edit-field', label);
    const input = document.createElement('input'); input.type = 'number'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(item[key] ?? 0); input.setAttribute('aria-label', `${label} for ${item.name}`);
    input.style.cssText = 'position:static;display:block;visibility:visible;width:100%;height:36px;min-height:36px;box-sizing:border-box;opacity:1;color:#fbf6ff;-webkit-text-fill-color:#fbf6ff;background:#111018;border:1px solid #50435e;border-radius:8px;padding:7px 8px;font-size:12px;';
    input.addEventListener('input', () => { item[key] = input.value === '' ? 0 : Number(input.value); gaMealScanRenderTotals(document.querySelector('.ga-meal-totals')); });
    wrap.append(input); fields.append(wrap);
  }
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'ga-meal-remove'; remove.textContent = 'Remove food'; remove.addEventListener('click', () => { gaMealScanResult.items.splice(index, 1); gaMealScanRenderResult(); });
  card.append(top, fields, remove);
  if (item.localized_name || item.cuisine) card.append(gaMealScanText('small', 'ga-meal-item-localized', [item.localized_name, item.cuisine].filter(Boolean).join(' · ')));
  return card;
}

function gaMealScanRenderTotals(root) {
  if (!root || !gaMealScanResult) return;
  const items = gaMealScanResult.items;
  const totals = {
    calories: items.reduce((n, x) => n + (Number(x.calories) || 0), 0),
    protein_g: items.reduce((n, x) => n + (Number(x.protein_g) || 0), 0),
    carbs_g: items.reduce((n, x) => n + (Number(x.carbs_g) || 0), 0),
    fat_g: items.reduce((n, x) => n + (Number(x.fat_g) || 0), 0),
  };
  gaMealScanResult.total = totals;
  root.replaceChildren();
  root.append(gaMealScanText('strong', 'ga-meal-totals-title', 'Estimated meal totals'));
  const grid = document.createElement('div'); grid.className = 'ga-meal-total-grid';
  for (const [key, label, unit, digits] of [['calories','Calories','kcal',0],['protein_g','Protein','g',1],['carbs_g','Carbohydrates','g',1],['fat_g','Fat','g',1]]) {
    const cell = document.createElement('div'); cell.append(gaMealScanText('strong','',`${Number(totals[key]).toFixed(digits)} ${unit}`),gaMealScanText('small','',label)); grid.append(cell);
  }
  root.append(grid);
}

function gaMealScanSaveResult() {
  const result = gaMealScanResult;
  if (!result || !result.items.length) { gaMealScanSetStatus('Add at least one food item before saving.', 'error'); return; }
  if (!result.meal_name.trim() || result.items.some(x => !String(x.name).trim() || !Number.isFinite(Number(x.estimated_grams)) || Number(x.estimated_grams) <= 0 || !['calories','protein_g','carbs_g','fat_g'].every(k => Number.isFinite(Number(x[k])) && Number(x[k]) >= 0))) {
    gaMealScanSetStatus('Check the meal and food names, portions, and nutrition fields before saving.', 'error'); return;
  }
  const date = new Date(gaNutritionDate); const today = new Date(); today.setHours(0,0,0,0); date.setHours(0,0,0,0);
  if (date > today) { gaMealScanSetStatus('Choose today or an earlier day before saving this meal.', 'error'); return; }
  const before = new Set(gaAchievementList().filter(x => x.earned).map(x => x.id));
  const key = gaNDateKey(gaNutritionDate);
  gaNutritionLogs[key] = Array.isArray(gaNutritionLogs[key]) ? gaNutritionLogs[key] : [];
  const items = result.items.map(item => ({
    name: item.name.trim(), estimatedGrams: Math.round(Number(item.estimated_grams)),
    calories: Math.round(Number(item.calories)), protein: Math.round(Number(item.protein_g) * 10) / 10,
    carbs: Math.round(Number(item.carbs_g) * 10) / 10, fat: Math.round(Number(item.fat_g) * 10) / 10,
    cuisine: item.cuisine || result.cuisine || null, confidence: item.confidence ?? null,
  }));
  const total = items.reduce((sum, item) => ({
    estimatedGrams: sum.estimatedGrams + item.estimatedGrams, calories: sum.calories + item.calories,
    protein: sum.protein + item.protein, carbs: sum.carbs + item.carbs, fat: sum.fat + item.fat,
  }), { estimatedGrams: 0, calories: 0, protein: 0, carbs: 0, fat: 0 });
  gaNutritionLogs[key].push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    name: result.meal_name.trim(), mealName: result.meal_name.trim(), slot: 'snack', ...total,
    calcium: null, vitaminD: null, cuisine: result.cuisine || null, confidence: result.confidence ?? null,
    items, itemCount: items.length, nutritionSource: 'ai_photo_estimate', loggedAt: new Date().toISOString(),
  });
  localStorage.setItem('ga-nutrition-logs', JSON.stringify(gaNutritionLogs));
  save();
  const scans = JSON.parse(localStorage.getItem('ga-scan-followups') || '[]');
  scans.unshift({ name: result.meal_name.trim(), cuisine: result.cuisine || null, savedAt: new Date().toISOString(), itemCount: result.items.length });
  localStorage.setItem('ga-scan-followups', JSON.stringify(scans.slice(0, 30)));
  gaNotifyNewAchievements(before);
  gaMealScanClearPhoto();
  gaCloseFoodModal('gaScanFoodModal');
  showScreen('fuel');
  toast('Estimated foods saved to today’s log');
}

function gaMealScanNormalizeLegacyPlates() {
  const migrationKey = 'ga-meal-scan-plate-grouping-v3';
  if (localStorage.getItem(migrationKey) === '1') return false;
  let changed = false;
  for (const [key, records] of Object.entries(gaNutritionLogs || {})) {
    if (!Array.isArray(records)) continue;
    const grouped = [];
    for (const record of records) {
      if (record?.nutritionSource !== 'ai_photo_estimate' || !record.mealName) { grouped.push(record); continue; }
      // Older saves wrote each ingredient as a row. A previous version could
      // also have wrapped each ingredient in a one-item `items` array.
      if (Array.isArray(record.items) && record.items.length > 1) { grouped.push(record); continue; }
      const previous = grouped[grouped.length - 1];
      const samePlate = previous?._legacyScanGroup === true && previous.mealName === record.mealName;
      const child = record.items?.[0] || { name: record.name, estimatedGrams: record.estimatedGrams, calories: record.calories, protein: record.protein, carbs: record.carbs, fat: record.fat, cuisine: record.cuisine || null };
      for (const field of ['estimatedGrams','calories','protein','carbs','fat']) child[field] = Number(child[field]) || 0;
      if (samePlate) {
        previous.items.push(child); previous.itemCount = previous.items.length;
        for (const field of ['estimatedGrams','calories','protein','carbs','fat']) previous[field] = (Number(previous[field]) || 0) + child[field];
      } else grouped.push({ ...record, name: record.mealName, items: [child], itemCount: 1, _legacyScanGroup: true });
    }
    for (const record of grouped) if (record?._legacyScanGroup) delete record._legacyScanGroup;
    if (grouped.length !== records.length || grouped.some((record,index) => record !== records[index])) {
      gaNutritionLogs[key] = grouped; changed = true;
    }
  }
  if (changed) localStorage.setItem('ga-nutrition-logs', JSON.stringify(gaNutritionLogs));
  localStorage.setItem(migrationKey, '1');
  return changed;
}

function gaMealScanAppendSavedMacros() {
  if (state.screen !== 'fuel') return;
  if (gaMealScanNormalizeLegacyPlates()) { window.showScreen('fuel'); return; }
  const key = gaNDateKey(gaNutritionDate);
  document.querySelectorAll('.nutrition-meal-row').forEach(row => {
    const onclick = row.querySelector('button[onclick]')?.getAttribute('onclick') || '';
    const id = onclick.match(/gaNRemove\('[^']*','([^']+)'\)/)?.[1];
    const record = (gaNutritionLogs[key] || []).find(x => x.id === id && x.nutritionSource === 'ai_photo_estimate');
    if (!record) return;
    const detail = row.querySelector('.nutrition-meal-copy small');
    if (detail) detail.textContent = `${record.estimatedGrams} g · ${record.calories} kcal · ${record.protein} g protein · ${record.carbs} g carbs · ${record.fat} g fat · image-based estimate`;
    if (record.items?.length && !row.querySelector('.nutrition-meal-ingredients')) {
      const disclosure = document.createElement('details'); disclosure.className = 'nutrition-meal-ingredients';
      const summary = document.createElement('summary'); summary.textContent = `${record.items.length} ingredients · Show details`; disclosure.append(summary);
      const list = document.createElement('div'); list.className = 'nutrition-meal-ingredient-list';
      for (const item of record.items) {
        const line = document.createElement('p');
        line.textContent = `${item.name} · ${item.estimatedGrams} g · ${item.calories} kcal · ${item.protein} g protein · ${item.carbs} g carbs · ${item.fat} g fat`;
        list.append(line);
      }
      disclosure.append(list); row.querySelector('.nutrition-meal-copy')?.append(disclosure);
    }
  });
}

const gaMealScanShowScreenBase = window.showScreen;
window.showScreen = function (screen) {
  const result = gaMealScanShowScreenBase(screen);
  if (screen === 'fuel') gaMealScanAppendSavedMacros();
  return result;
};
showScreen = window.showScreen;
