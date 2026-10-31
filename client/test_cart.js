import assert from 'node:assert';
import { cartSubtotal, cartTotalCount } from './src/store/cartStore.js';

console.log('Running Cart Store Unit Tests...');

// 1. cartTotalCount
const emptyItems = [];
assert.strictEqual(cartTotalCount(emptyItems), 0, 'Empty cart count should be 0');

const sampleItems = [
  { key: '1-M', productId: 1, quantity: 2, price: 48.0 },
  { key: '2-L', productId: 2, quantity: 1, price: 120.0 },
  { key: '3', productId: 3, quantity: 3, price: 95.0 },
];
assert.strictEqual(cartTotalCount(sampleItems), 6, 'Total count should be 2 + 1 + 3 = 6');

// 2. cartSubtotal
assert.strictEqual(cartSubtotal(emptyItems), 0, 'Empty cart subtotal should be 0');

const expectedTotal = 2 * 48.0 + 1 * 120.0 + 3 * 95.0; // 96 + 120 + 285 = 501.0
assert.strictEqual(cartSubtotal(sampleItems), 501.0, 'Subtotal should be exactly $501.00');

// 3. Price string handling (robustness against string numbers from API)
const stringPricedItems = [
  { key: '10', productId: 10, quantity: 2, price: '142.50' },
];
assert.strictEqual(cartSubtotal(stringPricedItems), 285.0, 'Subtotal should parse numeric strings');

console.log('✓ All 4 Cart Store Unit Tests Passed!');
