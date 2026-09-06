import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export const TOKEN_KEY = 'allha_access_token';
export const REFRESH_KEY = 'allha_refresh_token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setTokens = (access, refresh) => {
  try {
    if (access) localStorage.setItem(TOKEN_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    /* private mode, or storage disabled */
  }
};

export const clearTokens = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* nothing to clear */
  }
};

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

// Django's routers all end in a slash, and a 301 to the slashed URL drops the
// body of a POST. Adding it here means callers never have to remember.
const withTrailingSlash = (url) => {
  if (!url) return url;
  const [path, query] = url.split('?');
  if (path.endsWith('/')) return url;
  return query ? `${path}/?${query}` : `${path}/`;
};

apiClient.interceptors.request.use(
  (config) => {
    config.url = withTrailingSlash(config.url);
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (config.headers?.delete) {
        config.headers.delete('Content-Type');
      } else if (config.headers) {
        delete config.headers['Content-Type'];
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let refreshing = null;

const refreshAccessToken = async () => {
  let refresh = null;
  try {
    refresh = localStorage.getItem(REFRESH_KEY);
  } catch {
    refresh = null;
  }
  if (!refresh) return null;

  // Bare axios: the instance's interceptor would attach the dead access token.
  const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh });
  setTokens(data.access, data.refresh);
  return data.access;
};

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    // One silent retry on an expired access token, then give up and let the
    // caller decide. `_retried` stops a refresh loop if the refresh is dead too.
    if (status === 401 && original && !original._retried) {
      original._retried = true;
      try {
        refreshing = refreshing || refreshAccessToken();
        const token = await refreshing;
        refreshing = null;
        if (token) {
          original.headers.Authorization = `Bearer ${token}`;
          return apiClient(original);
        }
      } catch {
        refreshing = null;
      }
      clearTokens();
    }

    return Promise.reject(error);
  }
);

/** Pull a human-readable message out of a DRF error response. */
export const errorMessage = (error, fallback = 'Something went wrong.') => {
  const data = error?.response?.data;
  if (!data) {
    if (error?.code === 'ECONNABORTED') return 'The server took too long to respond.';
    if (error?.request) return 'Cannot reach the server. Is the backend running?';
    return error?.message || fallback;
  }
  if (typeof data === 'string') return data;
  if (data.error) return data.error;
  if (data.detail) return data.detail;

  const first = Object.entries(data)[0];
  if (!first) return fallback;
  const [field, value] = first;
  const text = String(Array.isArray(value) ? value[0] : value);

  // Name the field only when the message alone would not say enough. A written
  // sentence already reads well on its own, and "id: Product ID or Barcode
  // '10007' already exists." just gets in the reader's way.
  const readsAsSentence = text.length > 30 && /[.!?]$/.test(text);
  if (field === 'non_field_errors' || readsAsSentence) return text;
  return `${field}: ${text}`;
};

export default apiClient;
