import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { Link, useNavigate } from "react-router"
import { z } from "zod"

import { FormAlert, SubmitButton } from "@/components/form-alert"
import { FormField } from "@/components/form-field"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { post } from "@/lib/api"
import { applyServerErrors } from "@/lib/forms"
import { AuthLayout } from "@/pages/auth/auth-layout"

const schema = z
  .object({
    username: z.string().trim().min(1, "Choose a username."),
    email: z.email("Enter a valid email address."),
    password1: z.string().min(8, "Use at least 8 characters."),
    password2: z.string().min(1, "Enter the same password again."),
  })
  .refine((v) => v.password1 === v.password2, { path: ["password2"], message: "The two passwords don't match." })
type Values = z.infer<typeof schema>
const FIELDS = ["username", "email", "password1", "password2"] as const

export function SignupPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { username: "", email: "", password1: "", password2: "" } })

  async function onSubmit(values: Values) {
    setFormError(null)
    try {
      await post("auth/signup/", values)
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, FIELDS))
      return
    }
    await queryClient.invalidateQueries({ queryKey: ["session"] })
    navigate("/events/new", { replace: true })
  }

  return (
    <AuthLayout
      title="Create an account for your student org"
      description="Track scans of your campus flyers, board by board."
      footer={
        <>
          Already have an account?{" "}
          <Link className="font-medium text-primary underline-offset-4 hover:underline" to="/login">
            Log in
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
            name="email"
            label="Email"
            description="Used for password resets."
            render={(field) => <Input {...field} type="email" autoComplete="email" />}
          />
          <FormField
            control={form.control}
            name="password1"
            label="Password"
            description="At least 8 characters, not entirely numbers, and not a common password."
            render={(field) => <Input {...field} type="password" autoComplete="new-password" />}
          />
          <FormField
            control={form.control}
            name="password2"
            label="Confirm password"
            render={(field) => <Input {...field} type="password" autoComplete="new-password" />}
          />
          <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Creating account…" className="w-full">
            Create account
          </SubmitButton>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
