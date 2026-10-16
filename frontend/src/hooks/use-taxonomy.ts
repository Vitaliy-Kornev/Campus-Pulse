import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { Taxonomy } from "@/lib/types"

/** Club types, fields of study, and event types (pulse/taxonomy.py), with label lookups. */
export function useTaxonomy() {
  const query = useQuery({ queryKey: ["taxonomy"], queryFn: () => api<Taxonomy>("taxonomy/"), staleTime: Infinity })
  const data = query.data
  const label = (list: { value: string; label: string }[] | undefined, value: string) => list?.find((o) => o.value === value)?.label ?? value
  return {
    ...query,
    clubTypeLabel: (value: string) => label(data?.club_types, value),
    eventTypeLabel: (value: string) => label(data?.event_types, value),
    fieldLabel: (value: string) => label(data?.field_groups.flatMap((g) => g.fields), value),
  }
}
