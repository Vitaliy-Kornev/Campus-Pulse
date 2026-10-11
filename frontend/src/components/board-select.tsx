import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/api"
import type { Board, BoardRecommendation } from "@/lib/types"

export const boardsQuery = { queryKey: ["boards"], queryFn: () => api<Board[]>("boards/") }

type BoardSelectProps = {
  boards: Board[]
  value: string
  onChange: (value: string) => void
  id?: string
  invalid?: boolean
  excludeId?: number
  /** Listed first, under "Recommended", with their reasons. */
  recommendations?: BoardRecommendation[]
}

/** Active boards grouped by campus area, with recommended boards first. */
export function BoardSelect({ boards, value, onChange, id, invalid, excludeId, recommendations = [] }: BoardSelectProps) {
  const byId = new Map(boards.map((b) => [b.id, b]))
  const recommended = recommendations.filter((r) => r.board_id !== excludeId && byId.get(r.board_id)?.is_active)
  // Each board appears once: recommended ones only under "Recommended".
  const shownAbove = new Set(recommended.map((r) => r.board_id))
  const groups = new Map<string, Board[]>()
  for (const board of boards) {
    if (!board.is_active || board.id === excludeId || shownAbove.has(board.id)) continue
    groups.set(board.area, [...(groups.get(board.area) ?? []), board])
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
        <SelectValue placeholder="Choose a board" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {recommended.length > 0 && (
          <SelectGroup>
            <SelectLabel>Recommended</SelectLabel>
            {recommended.map((r) => (
              <SelectItem key={`rec-${r.board_id}`} value={String(r.board_id)}>
                {byId.get(r.board_id)!.name}
                <span className="text-muted-foreground">· {r.reason}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
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
