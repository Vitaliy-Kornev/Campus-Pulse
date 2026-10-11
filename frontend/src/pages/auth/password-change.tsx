import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { FormAlert, SubmitButton } from "@/components/form-alert"
import { FormField } from "@/components/form-field"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { post } from "@/lib/api"
import { applyServerErrors } from "@/lib/forms"

const schema = z
  .object({
    old_password: z.string().min(1, "Enter your current password."),
    new_password1: z.string().min(8, "Use at least 8 characters."),
    new_password2: z.string().min(1, "Enter the same password again."),
  })
  .refine((v) => v.new_password1 === v.new_password2, { path: ["new_password2"], message: "The two passwords don't match." })
type Values = z.infer<typeof schema>
const FIELDS = ["old_password", "new_password1", "new_password2"] as const

export function PasswordChangePage() {
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { old_password: "", new_password1: "", new_password2: "" } })

  async function onSubmit(values: Values) {
    setFormError(null)
    try {
      await post("auth/password/change/", values)
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, FIELDS))
      return
    }
    form.reset()
    toast.success("Password changed.")
  }

  return (
    <div className="max-w-xl">
      <PageHeader title="Change password" back={{ to: "/events", label: "Events" }} />
      <Card>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <FormAlert message={formError} />
              <FormField
                control={form.control}
                name="old_password"
                label="Current password"
                render={(field) => <Input {...field} type="password" autoComplete="current-password" autoFocus />}
              />
              <FormField
                control={form.control}
                name="new_password1"
                label="New password"
                render={(field) => <Input {...field} type="password" autoComplete="new-password" />}
              />
              <FormField
                control={form.control}
                name="new_password2"
                label="Confirm new password"
                render={(field) => <Input {...field} type="password" autoComplete="new-password" />}
              />
              <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Saving…" className="w-fit">
                Change password
              </SubmitButton>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
