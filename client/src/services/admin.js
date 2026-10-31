import { api } from './api';

export async function getAdminSummary() {
  return api('/api/admin/summary');
}

export async function getAdminOrders({ status, query, page = 0, size = 20 } = {}) {
  const params = new URLSearchParams();
  if (status && status !== 'ALL') params.set('status', status);
  if (query) params.set('query', query);
  params.set('page', page);
  params.set('size', size);
  return api(`/api/admin/orders?${params.toString()}`);
}

export async function updateAdminOrderStatus(orderId, { status, trackingNumber }) {
  return api(`/api/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, trackingNumber }),
  });
}

export async function getAdminProducts({ search, categoryId, page = 0, size = 50 } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (categoryId) params.set('categoryId', categoryId);
  params.set('page', page);
  params.set('size', size);
  return api(`/api/admin/products?${params.toString()}`);
}

export async function createAdminProduct(productData) {
  return api('/api/admin/products', {
    method: 'POST',
    body: JSON.stringify(productData),
  });
}

export async function updateAdminProduct(productId, productData) {
  return api(`/api/admin/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(productData),
  });
}

export async function deleteAdminProduct(productId) {
  return api(`/api/admin/products/${productId}`, {
    method: 'DELETE',
  });
}

export async function uploadAdminImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  return api('/api/admin/uploads/image', {
    method: 'POST',
    body: formData,
  });
}
