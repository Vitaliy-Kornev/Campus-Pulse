import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Link, useNavigate, useSearchParams } from "react-router"
import { z } from "zod"

import { FormAlert, SubmitButton } from "@/components/form-alert"
import { FormField } from "@/components/form-field"
import { safeNext } from "@/components/route-guards"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { post } from "@/lib/api"
import { applyServerErrors } from "@/lib/forms"
import type { User } from "@/lib/types"
import { AuthLayout } from "@/pages/auth/auth-layout"

const schema = z.object({
  username: z.string().trim().min(1, "Enter your username."),
  password: z.string().min(1, "Enter your password."),
})
type Values = z.infer<typeof schema>

export function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { username: "", password: "" } })

  async function onSubmit(values: Values) {
    setFormError(null)
    try {
      await post<{ user: User }>("auth/login/", values)
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, ["username", "password"]))
      return
    }
    await queryClient.invalidateQueries({ queryKey: ["session"] })
    navigate(safeNext(params.get("next"), "/map"), { replace: true })
  }

  return (
    <AuthLayout
      title="Log in"
      description="See where on campus your flyers are actually seen."
      footer={
        <>
          New advertiser?{" "}
          <Link className="font-medium text-primary underline-offset-4 hover:underline" to="/signup">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <FormAlert message={formError} />
          <FormField control={form.control} name="username" label="Username" render={(field) => <Input {...field} autoComplete="username" autoFocus />} />
          <FormField
            control={form.control}
            name="password"
            label="Password"
            render={(field) => <Input {...field} type="password" autoComplete="current-password" />}
          />
          <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Logging in…" className="w-full">
            Log in
          </SubmitButton>
          <Link to="/password-reset" className="mx-auto text-sm text-primary underline-offset-4 hover:underline">
            Forgot your password?
          </Link>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
