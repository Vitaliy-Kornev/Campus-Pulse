import { zodResolver } from "@hookform/resolvers/zod"
import { MailCheckIcon } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Link } from "react-router"
import { z } from "zod"

import { FormAlert, SubmitButton } from "@/components/form-alert"
import { FormField } from "@/components/form-field"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { post } from "@/lib/api"
import { applyServerErrors } from "@/lib/forms"
import { AuthLayout } from "@/pages/auth/auth-layout"

const schema = z.object({ email: z.email("Enter a valid email address.") })
type Values = z.infer<typeof schema>

export function PasswordResetPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } })

  async function onSubmit(values: Values) {
    setFormError(null)
    try {
      await post("auth/password/reset/", values)
      setSentTo(values.email)
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, ["email"]))
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="We'll email you a link to choose a new password."
      footer={
        <Link className="font-medium text-primary underline-offset-4 hover:underline" to="/login">
          Back to log in
        </Link>
      }
    >
      {sentTo ? (
        <Alert>
          <MailCheckIcon />
          <AlertTitle>Check your email</AlertTitle>
          <AlertDescription>
            If an account uses {sentTo}, a reset link is on its way. It can take a few minutes; check your spam folder too.
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <FormAlert message={formError} />
            <FormField control={form.control} name="email" label="Email" render={(field) => <Input {...field} type="email" autoComplete="email" autoFocus />} />
            <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Sending…" className="w-full">
              Send reset link
            </SubmitButton>
          </FieldGroup>
        </form>
      )}
    </AuthLayout>
  )
}
