import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/api"
import type { Board } from "@/lib/types"

export const boardsQuery = { queryKey: ["boards"], queryFn: () => api<Board[]>("boards/") }

type BoardSelectProps = {
  boards: Board[]
  value: string
  onChange: (value: string) => void
  id?: string
  invalid?: boolean
  excludeId?: number
}

/** Active boards grouped by campus area. */
export function BoardSelect({ boards, value, onChange, id, invalid, excludeId }: BoardSelectProps) {
  const groups = new Map<string, Board[]>()
  for (const board of boards) {
    if (!board.is_active || board.id === excludeId) continue
    groups.set(board.area, [...(groups.get(board.area) ?? []), board])
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
        <SelectValue placeholder="Choose a board" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {[...groups.entries()].map(([area, items]) => (
          <SelectGroup key={area}>
            <SelectLabel>{area}</SelectLabel>
            {items.map((board) => (
              <SelectItem key={board.id} value={String(board.id)}>
                {board.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
