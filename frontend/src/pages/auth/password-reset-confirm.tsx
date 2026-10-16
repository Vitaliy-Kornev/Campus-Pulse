import { zodResolver } from "@hookform/resolvers/zod"
import { CircleCheckIcon } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Link, useParams } from "react-router"
import { z } from "zod"

import { FormAlert, SubmitButton } from "@/components/form-alert"
import { FormField } from "@/components/form-field"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { post } from "@/lib/api"
import { applyServerErrors } from "@/lib/forms"
import { AuthLayout } from "@/pages/auth/auth-layout"

const schema = z
  .object({
    new_password1: z.string().min(8, "Use at least 8 characters."),
    new_password2: z.string().min(1, "Enter the same password again."),
  })
  .refine((v) => v.new_password1 === v.new_password2, { path: ["new_password2"], message: "The two passwords don't match." })
type Values = z.infer<typeof schema>

/** Opened from the reset email: /reset/<uid>/<token>. */
export function PasswordResetConfirmPage() {
  const { uid = "", token = "" } = useParams()
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { new_password1: "", new_password2: "" } })

  async function onSubmit(values: Values) {
    setFormError(null)
    try {
      await post("auth/password/reset/confirm/", { uid, token, ...values })
      setDone(true)
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, ["new_password1", "new_password2"]))
    }
  }

  return (
    <AuthLayout title="Choose a new password" description="Pick something you don't use on other sites.">
      {done ? (
        <div className="flex flex-col gap-4">
          <Alert>
            <CircleCheckIcon />
            <AlertTitle>Password changed</AlertTitle>
            <AlertDescription>You can now log in with your new password.</AlertDescription>
          </Alert>
          <Button asChild>
            <Link to="/login">Log in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <FormAlert message={formError} />
            {formError && (
              <Link to="/password-reset" className="text-sm text-primary underline-offset-4 hover:underline">
                Request a new reset link
              </Link>
            )}
            <FormField
              control={form.control}
              name="new_password1"
              label="New password"
              render={(field) => <Input {...field} type="password" autoComplete="new-password" autoFocus />}
            />
            <FormField
              control={form.control}
              name="new_password2"
              label="Confirm new password"
              render={(field) => <Input {...field} type="password" autoComplete="new-password" />}
            />
            <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Saving…" className="w-full">
              Set new password
            </SubmitButton>
          </FieldGroup>
        </form>
      )}
    </AuthLayout>
  )
}
