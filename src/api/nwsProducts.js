import { API_BASE, PRODUCT_FETCH_LIMIT } from '../config/constants.js';
import { fetchWithErrorHandling } from './client.js';

/**
 * Fetch a list of NWS products by type and optional office.
 * @param {Object} params
 * @param {string} params.type - Product type code (e.g. 'PNS', 'TOR')
 * @param {string} [params.office] - WFO office code (e.g. 'KBMX')
 * @param {number} [params.limit] - Max results
 * @returns {Promise<{data: Array|null, error: import('./client.js').ApiError|null}>}
 */
export async function fetchProductList({ type, office = '', limit = PRODUCT_FETCH_LIMIT }) {
  let url = `${API_BASE}/products?type=${encodeURIComponent(type)}&limit=${limit}`;
  if (office) {
    url += `&office=${encodeURIComponent(office)}`;
  }

  const { data, error } = await fetchWithErrorHandling(url);
  if (error) return { data: null, error };

  // NWS returns products in @graph array
  const products = data?.['@graph'] || [];
  return { data: products, error: null };
}

/**
 * Fetch full detail for a single product by ID.
 * @param {string} id - Product UUID
 * @returns {Promise<{data: Object|null, error: import('./client.js').ApiError|null}>}
 */
export async function fetchProductDetail(id) {
  const url = `${API_BASE}/products/${encodeURIComponent(id)}`;
  return fetchWithErrorHandling(url);
}

/**
 * Fetch multiple product types in parallel, merge and sort by issuanceTime desc.
 * @param {string[]} types - Array of product type codes
 * @param {string} [office] - Optional office filter
 * @returns {Promise<{products: Array, errors: Array}>}
 */
export async function fetchMultipleProductTypes(types, office = '') {
  const results = await Promise.allSettled(
    types.map(type => fetchProductList({ type, office }))
  );

  const products = [];
  const errors = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      if (result.value.error) {
        errors.push({ type: types[i], error: result.value.error });
      } else if (result.value.data) {
        products.push(...result.value.data);
      }
    } else {
      errors.push({ type: types[i], error: result.reason });
    }
  });

  // Sort by issuanceTime descending
  products.sort((a, b) => new Date(b.issuanceTime) - new Date(a.issuanceTime));

  return { products, errors };
}
