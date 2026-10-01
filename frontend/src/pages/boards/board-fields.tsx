import type { UseFormReturn } from "react-hook-form"
import { z } from "zod"

import { FormField } from "@/components/form-field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const coordinate = (min: number, max: number, name: string) =>
  z
    .string()
    .trim()
    .min(1, `Click the map or enter a ${name}.`)
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= min && Number(v) <= max, `${name[0].toUpperCase() + name.slice(1)} must be between ${min} and ${max}.`)

export const boardSchema = z.object({
  name: z.string().trim().min(1, "Give the board a name.").max(150),
  area: z.string().trim().min(1, "Enter the campus area, such as East Bank.").max(50),
  building: z.string().trim().min(1, "Enter the building.").max(150),
  floor: z.string().max(20),
  description: z.string(),
  latitude: coordinate(-90, 90, "latitude"),
  longitude: coordinate(-180, 180, "longitude"),
})
export type BoardValues = z.infer<typeof boardSchema>
export const BOARD_FIELDS = ["name", "area", "building", "floor", "description", "latitude", "longitude"] as const

export const emptyBoard: BoardValues = { name: "", area: "", building: "", floor: "", description: "", latitude: "", longitude: "" }

/** Six decimal places, the precision the database stores. */
export const toCoordinate = (n: number) => n.toFixed(6)

export function boardBody(values: BoardValues) {
  return { ...values, latitude: Number(values.latitude).toFixed(6), longitude: Number(values.longitude).toFixed(6) }
}

/** The board form's inputs. Areas already in use are offered as suggestions. */
export function BoardFields({ form, areas, autoFocus }: { form: UseFormReturn<BoardValues>; areas: string[]; autoFocus?: boolean }) {
  return (
    <>
      <FormField control={form.control} name="name" label="Name" render={(field) => <Input {...field} autoFocus={autoFocus} />} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField control={form.control} name="area" label="Area" render={(field) => <Input {...field} list="area-options" autoComplete="off" />} />
        <FormField control={form.control} name="floor" label="Floor (optional)" render={(field) => <Input {...field} />} />
      </div>
      <datalist id="area-options">
        {areas.map((area) => (
          <option key={area} value={area} />
        ))}
      </datalist>
      <FormField control={form.control} name="building" label="Building" render={(field) => <Input {...field} />} />
      <FormField
        control={form.control}
        name="description"
        label="Description (optional)"
        description="For residence halls, note the number of physical boards, such as “(about 15)”."
        render={(field) => <Textarea {...field} rows={2} />}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField control={form.control} name="latitude" label="Latitude" render={(field) => <Input {...field} inputMode="decimal" className="font-mono" />} />
        <FormField control={form.control} name="longitude" label="Longitude" render={(field) => <Input {...field} inputMode="decimal" className="font-mono" />} />
      </div>
    </>
  )
}
