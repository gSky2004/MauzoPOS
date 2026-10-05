import api from '../services/api';

export const auth = {
  login: (data) => api.post('/auth/login', data).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  updateProfile: (data) => api.put('/auth/profile', data).then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
};

export const productsApi = {
  list: (params) => api.get('/products', { params }).then((r) => r.data),
  get: (slug) => api.get(`/products/${slug}`).then((r) => r.data),
  getById: (id) => api.get(`/products/id/${id}`).then((r) => r.data),
  create: (data) => api.post('/products', data).then((r) => r.data),
  update: (id, data) => api.put(`/products/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/products/${id}`).then((r) => r.data),
};

export const categoriesApi = {
  list: () => api.get('/categories').then((r) => r.data),
  create: (data) => api.post('/categories', data).then((r) => r.data),
  update: (id, data) => api.put(`/categories/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/categories/${id}`).then((r) => r.data),
};

export const adminApi = {
  customers: () => api.get('/admin/customers').then((r) => r.data),
  shopkeepers: () => api.get('/admin/shopkeepers').then((r) => r.data),
};

export const inventoryApi = {
  alerts: () => api.get('/inventory/alerts').then((r) => r.data),
  movements: (product_id) => api.get('/inventory/movements', { params: { product_id, limit: 100 } }).then((r) => r.data),
  receipts: () => api.get('/inventory/receipts').then((r) => r.data),
  replenishment: (params) => api.get('/inventory/replenishment', { params }).then((r) => r.data),
  adjust: (data) => api.post('/inventory/adjust', data).then((r) => r.data),
  receive: (data) => {
    const isForm = data instanceof FormData;
    return api.post('/inventory/receive', data, isForm ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined).then((r) => r.data);
  },
};

export const suppliersApi = {
  list: () => api.get('/inventory/suppliers').then((r) => r.data),
  create: (data) => api.post('/inventory/suppliers', data).then((r) => r.data),
  update: (id, data) => api.put(`/inventory/suppliers/${id}`, data).then((r) => r.data),
  history: (id) => api.get(`/inventory/suppliers/${id}/history`).then((r) => r.data),
};

export const salesApi = {
  create: (data) => {
    const isForm = data instanceof FormData;
    return api.post('/sales', data, isForm ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined).then((r) => r.data);
  },
  today: () => api.get('/sales/today').then((r) => r.data),
  mine: () => api.get('/sales/mine').then((r) => r.data),
  all: () => api.get('/sales').then((r) => r.data),
  detail: (id) => api.get(`/sales/${id}`).then((r) => r.data),
};

export const expensesApi = {
  list: (params) => api.get('/expenses', { params }).then((r) => r.data),
  create: (data) => {
    const isForm = data instanceof FormData;
    return api.post('/expenses', data, isForm ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined).then((r) => r.data);
  },
  update: (id, data) => api.put(`/expenses/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/expenses/${id}`).then((r) => r.data),
  summary: () => api.get('/expenses/summary').then((r) => r.data),
  categories: () => api.get('/expenses/categories').then((r) => r.data),
  createCategory: (name) => api.post('/expenses/categories', { name }).then((r) => r.data),
};

export const restockApi = {
  list: () => api.get('/restock').then((r) => r.data),
  request: (product_id) => api.post('/restock', { product_id }).then((r) => r.data),
  resolve: (id) => api.put(`/restock/${id}/resolve`).then((r) => r.data),
};

export const damageApi = {
  list: () => api.get('/damage').then((r) => r.data),
  report: (data) => api.post('/damage', data, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  review: (id) => api.put(`/damage/${id}/review`).then((r) => r.data),
};

export const closingsApi = {
  expected: () => api.get('/closings/expected').then((r) => r.data),
  submit: (data) => api.post('/closings', data).then((r) => r.data),
  mine: () => api.get('/closings/mine').then((r) => r.data),
  all: () => api.get('/closings').then((r) => r.data),
  review: (id) => api.put(`/closings/${id}/review`).then((r) => r.data),
};

export const aiApi = {
  ask: (question) => api.post('/ai/ask', { question }).then((r) => r.data),
};

export const posApi = {
  activity: () => api.get('/pos/activity').then((r) => r.data),
  customers: () => api.get('/pos/customers').then((r) => r.data),
  customerAging: () => api.get('/pos/customers/aging').then((r) => r.data),
  createCustomer: (data) => api.post('/pos/customers', data).then((r) => r.data),
  payCustomer: (id, amount, method, note) => api.post(`/pos/customers/${id}/pay`, { amount, method, note }).then((r) => r.data),
  reversePayment: (customerId, paymentId) => api.post(`/pos/customers/${customerId}/payments/${paymentId}/reverse`).then((r) => r.data),
  customerHistory: (id) => api.get(`/pos/customers/${id}/history`).then((r) => r.data),
  report: (name) => api.get(`/pos/reports/${name}`).then((r) => r.data),
  rangePdf: (params) => api.get('/pos/reports/range.pdf', { params, responseType: 'blob' }).then((r) => r.data),
};
