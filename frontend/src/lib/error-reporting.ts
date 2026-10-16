// Sends unexpected errors from the browser to our own server, which logs them; on the live site
// those logs go to CloudWatch, which emails an alert. Only the message, stack, and page are sent.

import { post } from "@/lib/api"

let sent = 0

export function reportError(error: unknown) {
  // A page stuck in an error loop shouldn't send hundreds of reports.
  if (sent >= 10) return
  sent += 1
  const err = error instanceof Error ? error : new Error(String(error))
  post("client-errors/", { message: err.message, stack: err.stack ?? "", page: window.location.pathname }).catch(() => undefined)
}

let listening = false

/** Report crashes that happen outside React (event handlers, promises nobody awaited). */
export function startErrorReporting() {
  if (listening) return
  listening = true
  window.addEventListener("error", (event) => reportError(event.error ?? event.message))
  window.addEventListener("unhandledrejection", (event) => reportError(event.reason))
}
