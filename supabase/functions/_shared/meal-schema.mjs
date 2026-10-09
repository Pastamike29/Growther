export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export const MEAL_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['success', 'error', 'message', 'meal_name', 'localized_name', 'cuisine', 'confidence', 'items', 'total', 'notes'],
  properties: {
    success: { type: 'boolean' },
    error: { type: ['string', 'null'], enum: ['NO_FOOD_DETECTED', 'UNRECOGNIZABLE_FOOD', null] },
    message: { type: 'string' },
    meal_name: { type: ['string', 'null'] },
    localized_name: { type: ['string', 'null'] },
    cuisine: { type: ['string', 'null'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    items: {
      type: 'array', maxItems: 12,
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'localized_name', 'cuisine', 'estimated_grams', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'confidence'],
        properties: {
          name: { type: 'string' }, localized_name: { type: ['string', 'null'] }, cuisine: { type: ['string', 'null'] },
          estimated_grams: { type: 'number' }, calories: { type: 'number' }, protein_g: { type: 'number' },
          carbs_g: { type: 'number' }, fat_g: { type: 'number' }, confidence: { type: 'number' },
        },
      },
    },
    total: {
      type: 'object', additionalProperties: false,
      required: ['calories', 'protein_g', 'carbs_g', 'fat_g'],
      properties: { calories: { type: 'number' }, protein_g: { type: 'number' }, carbs_g: { type: 'number' }, fat_g: { type: 'number' } },
    },
    notes: { type: 'array', maxItems: 8, items: { type: 'string' } },
  },
};

function finiteRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function optionalLabel(value, maxLength = 80) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) throw new Error('INVALID_MODEL_RESPONSE');
  return value.trim();
}

export function parseImageDataUrl(value) {
  const match = typeof value === 'string' && value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match || match[2].length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4) throw new Error('INVALID_IMAGE');
  let binary;
  try { binary = atob(match[2]); } catch { throw new Error('INVALID_IMAGE'); }
  if (!binary.length || binary.length > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  const mime = match[1];
  const jpeg = mime === 'image/jpeg' && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = mime === 'image/png' && bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  const webp = mime === 'image/webp' && bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  if (!jpeg && !png && !webp) throw new Error('INVALID_IMAGE');
  return { mime, bytes };
}

function noFoodResult(error = 'NO_FOOD_DETECTED', message = 'No recognizable food was detected in this image.') {
  return { success: false, error, message, meal_name: null, localized_name: null, cuisine: null, confidence: 0, items: [], total: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, notes: [] };
}

export function normalizeMealResponse(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.success !== 'boolean' || typeof raw.message !== 'string' || raw.message.length > 500 || !Array.isArray(raw.notes) || raw.notes.length > 8 || !raw.total || typeof raw.total !== 'object') throw new Error('INVALID_MODEL_RESPONSE');
  for (const key of ['calories', 'protein_g', 'carbs_g', 'fat_g']) {
    const max = key === 'calories' ? 120000 : key === 'carbs_g' ? 24000 : 12000;
    if (!finiteRange(raw.total[key], 0, max)) throw new Error('INVALID_MODEL_RESPONSE');
  }
  const notes = raw.notes.map(note => {
    if (typeof note !== 'string' || note.length > 1000) throw new Error('INVALID_MODEL_RESPONSE');
    return note.trim().slice(0, 240);
  });
  if (!raw.success) {
    if (!['NO_FOOD_DETECTED', 'UNRECOGNIZABLE_FOOD'].includes(raw.error) || raw.items?.length !== 0 || raw.meal_name !== null || raw.localized_name !== null || raw.cuisine !== null || raw.confidence !== 0 || Object.values(raw.total).some(value => value !== 0)) throw new Error('INVALID_MODEL_RESPONSE');
    return noFoodResult(raw.error, 'The image did not contain a meal that could be identified reliably.');
  }
  if (raw.error !== null || typeof raw.meal_name !== 'string' || !raw.meal_name.trim() || raw.meal_name.trim().length > 120 ||
      !finiteRange(raw.confidence, 0, 1) || !Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 12) {
    throw new Error('INVALID_MODEL_RESPONSE');
  }
  const items = raw.items.map(item => {
    if (!item || typeof item !== 'object' || typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 100 ||
        !finiteRange(item.estimated_grams, 0.1, 5000) || !finiteRange(item.calories, 0, 10000) ||
        !finiteRange(item.protein_g, 0, 1000) || !finiteRange(item.carbs_g, 0, 2000) || !finiteRange(item.fat_g, 0, 1000) ||
        !finiteRange(item.confidence, 0, 1)) throw new Error('INVALID_MODEL_RESPONSE');
    return {
      name: item.name.trim(), localized_name: optionalLabel(item.localized_name), cuisine: optionalLabel(item.cuisine),
      estimated_grams: Math.round(item.estimated_grams), calories: Math.round(item.calories),
      protein_g: Math.round(item.protein_g * 10) / 10, carbs_g: Math.round(item.carbs_g * 10) / 10,
      fat_g: Math.round(item.fat_g * 10) / 10, confidence: Math.round(item.confidence * 100) / 100,
    };
  });
  const sum = key => items.reduce((n, item) => n + item[key], 0);
  const total = { calories: Math.round(sum('calories')), protein_g: Math.round(sum('protein_g') * 10) / 10, carbs_g: Math.round(sum('carbs_g') * 10) / 10, fat_g: Math.round(sum('fat_g') * 10) / 10 };
  return {
    success: true, error: null, message: '', meal_name: raw.meal_name.trim(),
    localized_name: optionalLabel(raw.localized_name, 120), cuisine: optionalLabel(raw.cuisine),
    confidence: Math.round(raw.confidence * 100) / 100, items, total, notes,
  };
}

export function parseModelContent(content) {
  if (typeof content !== 'string' || content.length > 24000) throw new Error('INVALID_MODEL_RESPONSE');
  let decoded;
  try { decoded = JSON.parse(content); } catch { throw new Error('INVALID_MODEL_RESPONSE'); }
  return normalizeMealResponse(decoded);
}
