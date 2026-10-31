import { api } from './api';

export function getProducts(filters) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined));
  return api(`/api/products?${params}`);
}
export function getProduct(slug) { return api(`/api/products/${encodeURIComponent(slug)}`); }
export function getCategories() { return api('/api/categories'); }
