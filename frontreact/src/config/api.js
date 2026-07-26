/**
 * Central API configuration.
 *
 * VITE_API_URL — set in .env to override the base URL for all API calls.
 *   • Leave blank (default) to use Vite's dev-server proxy → requests go to /api
 *     and Vite forwards them to VITE_API_PROXY_TARGET (see vite.config.js).
 *   • Set to a full URL (e.g. https://api.myapp.com) for production or when
 *     the backend is on a different origin.
 */
export const API_BASE = import.meta.env.VITE_API_URL || '/api'
