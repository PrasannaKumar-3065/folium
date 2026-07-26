/**
 * Shared API helpers — used by all components that talk to the backend.
 *
 * All helpers return { response, data } so callers can check r.ok and
 * inspect the parsed JSON body without repeating boilerplate.
 */
import { API_BASE } from '../config/api.js'

/** Build a full API URL from a path (e.g. "/documents"). */
export function apiUrl(path) {
  return `${API_BASE}${path}`
}

/**
 * Parse JSON only when the response body actually is JSON.
 * Prevents crashes when a non-JSON response (e.g. Vite's HTML 404 fallback)
 * is returned for an unknown /api/* route during development.
 */
export async function safeJson(response) {
  const ct = response.headers.get('content-type') || ''
  if (!ct.includes('application/json')) return null
  try { return await response.json() } catch { return null }
}

/** GET /api{path} */
export async function apiGet(path) {
  const response = await fetch(apiUrl(path))
  const data = await safeJson(response)
  return { response, data }
}

/** POST /api{path} with a JSON body */
export async function apiPost(path, body) {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await safeJson(response)
  return { response, data }
}

/** PATCH /api{path} with a JSON body */
export async function apiPatch(path, body) {
  const response = await fetch(apiUrl(path), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await safeJson(response)
  return { response, data }
}

/** DELETE /api{path} */
export async function apiDelete(path) {
  const response = await fetch(apiUrl(path), { method: 'DELETE' })
  const data = await safeJson(response)
  return { response, data }
}

/** POST /api{path} with a FormData body (file uploads) */
export async function apiUpload(path, formData) {
  const response = await fetch(apiUrl(path), { method: 'POST', body: formData })
  const data = await safeJson(response)
  return { response, data }
}
