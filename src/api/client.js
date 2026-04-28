/**
 * API client with error handling — adapted from Birding Weather Dashboard.
 * Adds NWS-required User-Agent header.
 */

export class ApiError extends Error {
  constructor(message, status = 0, response = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.response = response;
  }
}

/**
 * Fetch wrapper with consistent error handling
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<{data: any, error: ApiError|null}>}
 */
export async function fetchWithErrorHandling(url, options = {}) {
  const defaultOptions = {
    headers: {
      'Accept': 'application/geo+json',
      // Browsers strip User-Agent on fetch from web pages, but we leave a real
      // identifier here for completeness (matches NWS guidance).
      'User-Agent': '(TornadoTracker, https://github.com/chrispt/TornadoTracker)'
    }
  };

  const mergedOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers
    }
  };

  try {
    const response = await fetch(url, mergedOptions);

    if (!response.ok) {
      throw new ApiError(
        `API error: ${response.status} ${response.statusText}`,
        response.status,
        response
      );
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    if (error instanceof ApiError) {
      console.error('API Error:', error.message);
      return { data: null, error };
    }
    console.error('Network Error:', error.message);
    return { data: null, error: new ApiError(error.message, 0, null) };
  }
}

export function sanitizeErrorMessage(message) {
  if (typeof message !== 'string') return 'An unknown error occurred';
  return message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
