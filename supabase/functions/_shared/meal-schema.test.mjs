import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMealResponse, parseImageDataUrl, parseModelContent } from './meal-schema.mjs';

const item = (overrides = {}) => ({ name: 'Pork cutlet', localized_name: 'とんかつ', cuisine: 'Japanese', estimated_grams: 150, calories: 420, protein_g: 28.5, carbs_g: 18, fat_g: 25, confidence: 0.89, ...overrides });
const meal = (overrides = {}) => ({ success: true, error: null, message: '', meal_name: 'Tonkatsu', localized_name: 'とんかつ', cuisine: 'Japanese', confidence: 0.87, items: [item()], total: { calories: 420, protein_g: 28.5, carbs_g: 18, fat_g: 25 }, notes: ['Nutrition is estimated from the image.'], ...overrides });

test('normalizes an international dish and computes totals from item estimates', () => {
  const result = normalizeMealResponse(meal({ total: { calories: 1, protein_g: 0, carbs_g: 0, fat_g: 0 } }));
  assert.equal(result.meal_name, 'Tonkatsu');
  assert.equal(result.localized_name, 'とんかつ');
  assert.equal(result.cuisine, 'Japanese');
  assert.deepEqual(result.total, { calories: 420, protein_g: 28.5, carbs_g: 18, fat_g: 25 });
});

test('returns a safe no-food result without inventing a dish', () => {
  const result = normalizeMealResponse({ success: false, error: 'NO_FOOD_DETECTED', message: 'No food found', meal_name: null, localized_name: null, cuisine: null, confidence: 0, items: [], total: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, notes: [] });
  assert.equal(result.success, false);
  assert.equal(result.meal_name, null);
  assert.deepEqual(result.items, []);
});

test('rejects malformed or out-of-range nutrition estimates', () => {
  assert.throws(() => normalizeMealResponse(meal({ items: [] })), /INVALID_MODEL_RESPONSE/);
  assert.throws(() => normalizeMealResponse(meal({ items: [item({ confidence: 4 })] })), /INVALID_MODEL_RESPONSE/);
  assert.throws(() => parseModelContent('```json\n{}\n```'), /INVALID_MODEL_RESPONSE/);
  assert.throws(() => normalizeMealResponse(meal({ total: undefined })), /INVALID_MODEL_RESPONSE/);
  assert.throws(() => normalizeMealResponse(meal({ total: { calories: -1, protein_g: 0, carbs_g: 0, fat_g: 0 } })), /INVALID_MODEL_RESPONSE/);
  assert.throws(() => normalizeMealResponse(meal({ notes: undefined })), /INVALID_MODEL_RESPONSE/);
  assert.throws(() => normalizeMealResponse(meal({ error: 'UNRECOGNIZABLE_FOOD' })), /INVALID_MODEL_RESPONSE/);
});

test('rejects unsupported or spoofed image data URLs', () => {
  assert.throws(() => parseImageDataUrl('data:image/svg+xml;base64,PHN2Zz4='), /INVALID_IMAGE/);
  assert.throws(() => parseImageDataUrl('data:image/jpeg;base64,PHN2Zz4='), /INVALID_IMAGE/);
});

test('accepts valid PNG magic bytes', () => {
  const pngSignature = 'iVBORw0KGgo=';
  assert.equal(parseImageDataUrl(`data:image/png;base64,${pngSignature}`).mime, 'image/png');
});
