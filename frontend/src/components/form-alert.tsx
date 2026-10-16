import { CircleAlertIcon } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** A form-level error (wrong password, network failure) shown above the fields. */
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

/** Submit button that shows a spinner and disables itself while the form is submitting. */
export function SubmitButton({ pending, children, pendingLabel, className }: { pending: boolean; children: string; pendingLabel?: string; className?: string }) {
  return (
    <Button type="submit" disabled={pending} className={className}>
      {pending && <Spinner data-icon="inline-start" />}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  )
}
