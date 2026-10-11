import { ChevronsUpDownIcon, XIcon } from "lucide-react"
import { useState } from "react"
import type { UseFormReturn } from "react-hook-form"
import { z } from "zod"

import { FormField } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useTaxonomy } from "@/hooks/use-taxonomy"

export const clubSchema = z.object({
  name: z.string().trim().min(2, "Enter your club's name.").max(150),
  club_type: z.string().min(1, "Choose what kind of club this is."),
  fields: z.array(z.string()).min(1, "Pick at least one field your members study.").max(8, "Pick up to 8."),
  description: z.string().max(1000),
})
export type ClubValues = z.infer<typeof clubSchema>
export const CLUB_FIELDS = ["name", "club_type", "fields", "description"] as const
export const emptyClub: ClubValues = { name: "", club_type: "", fields: [], description: "" }

/** Searchable multi-select of fields of study, grouped by UMN college. Picks show as removable chips. */
function FieldsPicker({ value, onChange, id, invalid }: { value: string[]; onChange: (v: string[]) => void; id?: string; invalid?: boolean }) {
  const [open, setOpen] = useState(false)
  const taxonomy = useTaxonomy()
  const toggle = (field: string) => onChange(value.includes(field) ? value.filter((f) => f !== field) : [...value, field])
  return (
    <div className="flex flex-col gap-2.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            className="h-10 w-full justify-between font-normal text-muted-foreground aria-invalid:border-destructive"
          >
            {value.length ? `${value.length} selected; add more` : "Search fields, like computer science or finance"}
            <ChevronsUpDownIcon data-icon="inline-end" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Computer science, nursing, finance…" />
            <CommandList className="max-h-80">
              <CommandEmpty>No field matches. Try "Open to all majors".</CommandEmpty>
              {taxonomy.data?.field_groups.map((group) => (
                <CommandGroup key={group.label} heading={group.label}>
                  {group.fields.map((f) => (
                    <CommandItem key={f.value} value={`${f.label} ${group.label}`} data-checked={value.includes(f.value)} onSelect={() => toggle(f.value)}>
                      {f.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Selected fields">
          {value.map((f) => (
            <li key={f} className="flex items-center gap-1 rounded-full border bg-secondary py-0.5 pr-0.5 pl-3 text-sm font-semibold">
              {taxonomy.fieldLabel(f)}
              <Button type="button" variant="ghost" size="icon-xs" className="rounded-full" aria-label={`Remove ${taxonomy.fieldLabel(f)}`} onClick={() => toggle(f)}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Name, club type, fields of study, and description. Recommendations match clubs on type and fields. */
export function ClubProfileFields({ form }: { form: UseFormReturn<ClubValues> }) {
  const taxonomy = useTaxonomy()
  return (
    <>
      <FormField control={form.control} name="name" label="Club name" render={(field) => <Input {...field} className="h-10" autoComplete="organization" />} />
      <FormField
        control={form.control}
        name="club_type"
        label="Kind of club"
        render={(field) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={field.id} aria-invalid={field["aria-invalid"]} className="h-10 w-full">
              <SelectValue placeholder="Choose one" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {taxonomy.data?.club_types.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      />
      <FormField
        control={form.control}
        name="fields"
        label="What your members study"
        description="We recommend boards where clubs in the same fields got scans. Other clubs never see your club or its numbers."
        render={(field) => <FieldsPicker value={field.value} onChange={field.onChange} id={field.id} invalid={field["aria-invalid"]} />}
      />
      <FormField
        control={form.control}
        name="description"
        label="Description (optional)"
        render={(field) => <Textarea {...field} rows={2} placeholder="What your club does, in a sentence." />}
      />
    </>
  )
}
