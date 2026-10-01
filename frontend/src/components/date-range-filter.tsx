import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RANGE_CHOICES, type DateRange, type RangeKey } from "@/lib/range"

/** Preset range picker; "Custom" reveals From/To date inputs. */
export function DateRangeFilter({ value, onChange, idPrefix = "range" }: { value: DateRange; onChange: (next: DateRange) => void; idPrefix?: string }) {
  return (
    <>
      <Field className="w-full sm:w-40">
        <FieldLabel htmlFor={`${idPrefix}-select`} className="text-xs text-muted-foreground">
          Date range
        </FieldLabel>
        <Select value={value.range} onValueChange={(range) => onChange({ ...value, range: range as RangeKey })}>
          <SelectTrigger id={`${idPrefix}-select`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {RANGE_CHOICES.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {value.range === "custom" && (
        <>
          <Field className="w-full sm:w-auto">
            <FieldLabel htmlFor={`${idPrefix}-start`} className="text-xs text-muted-foreground">
              From
            </FieldLabel>
            <Input id={`${idPrefix}-start`} type="date" value={value.start} max={value.end || undefined} onChange={(e) => onChange({ ...value, start: e.target.value })} />
          </Field>
          <Field className="w-full sm:w-auto">
            <FieldLabel htmlFor={`${idPrefix}-end`} className="text-xs text-muted-foreground">
              To
            </FieldLabel>
            <Input id={`${idPrefix}-end`} type="date" value={value.end} min={value.start || undefined} onChange={(e) => onChange({ ...value, end: e.target.value })} />
          </Field>
        </>
      )}
    </>
  )
}
