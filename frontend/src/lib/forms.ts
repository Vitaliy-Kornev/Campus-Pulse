import type { FieldValues, Path, UseFormSetError } from "react-hook-form"

import { ApiError } from "@/lib/api"

/**
 * Show API validation errors on the form: field errors under their fields, anything else
 * (non_field_errors, detail, network failures) as the returned message for an Alert.
 */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: readonly Path<T>[]): string | null {
  if (!(error instanceof ApiError) || !error.data) {
    return error instanceof ApiError && error.status >= 500 ? "Something went wrong on our end. Try again." : "Couldn't reach Campus Pulse. Check your connection and try again."
  }
  const general: string[] = []
  for (const [key, value] of Object.entries(error.data)) {
    const message = Array.isArray(value) ? value.join(" ") : String(value)
    if ((fields as readonly string[]).includes(key)) setError(key as Path<T>, { type: "server", message })
    else general.push(message)
  }
  return general.length ? general.join(" ") : null
}
