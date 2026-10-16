// Fetch wrapper for the Django API. Same origin, session cookie, CSRF token from the csrftoken cookie.

export type FieldErrors = Record<string, string[] | string>

/** Requests that take longer than this give up with a clear message instead of spinning forever. */
const TIMEOUT_MS = 20_000

/** A failed request. `status` is 0 when the server was never reached (offline, timed out). */
export class ApiError extends Error {
  status: number
  data: FieldErrors | null

  constructor(status: number, data: FieldErrors | null) {
    super(errorSummary(data) || fallbackMessage(status))
    this.status = status
    this.data = data
  }
}

function fallbackMessage(status: number): string {
  if (status === 429) return "Too many requests. Wait a minute and try again."
  if (status >= 500) return "Campus Pulse had a problem on its end. Try again in a moment."
  return `Request failed (${status})`
}

/** Whether trying the same request again might work (a network blip or a server hiccup). */
export function isRetryable(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500
}

function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  if (!signal) return timeout
  return typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : signal
}

function errorSummary(data: FieldErrors | null): string {
  if (!data) return ""
  const detail = data.detail ?? data.non_field_errors
  if (detail) return Array.isArray(detail) ? detail.join(" ") : detail
  return ""
}

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ""
}

type Method = "GET" | "POST" | "PATCH"

export async function api<T>(path: string, options: { method?: Method; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = options.method ?? "GET"
  const headers: Record<string, string> = { Accept: "application/json" }
  if (options.body !== undefined) headers["Content-Type"] = "application/json"
  if (method !== "GET") headers["X-CSRFToken"] = csrfToken()

  let response: Response
  try {
    response = await fetch(`/api/${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: withTimeout(options.signal),
    })
  } catch (error) {
    if (options.signal?.aborted) throw error // cancelled on purpose (e.g. the page changed)
    const timedOut = error instanceof DOMException && error.name === "TimeoutError"
    throw new ApiError(0, {
      detail: timedOut
        ? "Campus Pulse is taking too long to answer. Check your connection and try again."
        : "Couldn't reach Campus Pulse. Check your internet connection and try again.",
    })
  }
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, data)
  return data as T
}

export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body })
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body })

/** Build "path?query" from a record, skipping empty values. */
export function withQuery(path: string, params: Record<string, string | number | undefined | null>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value))
  }
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}
