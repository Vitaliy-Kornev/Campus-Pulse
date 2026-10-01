import type { ReactNode } from "react"
import { Controller, type Control, type ControllerRenderProps, type FieldValues, type Path } from "react-hook-form"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"

type FormFieldProps<T extends FieldValues, N extends Path<T>> = {
  control: Control<T>
  name: N
  label: string
  description?: ReactNode
  className?: string
  render: (field: ControllerRenderProps<T, N> & { id: string; "aria-invalid": boolean }) => ReactNode
}

/** A labelled form control wired to react-hook-form, with its description and error message. */
export function FormField<T extends FieldValues, N extends Path<T>>({ control, name, label, description, className, render }: FormFieldProps<T, N>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined} className={className}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          {render({ ...field, id: name, "aria-invalid": fieldState.invalid })}
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}
