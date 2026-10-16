import {
  createColumnHelper,
  createSortedRowModel,
  metaHelper,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

type ColumnMeta = {
  /** Right-aligned, tabular figures. */
  numeric?: boolean
  className?: string
}

// Client-side sorting is the only table feature the app uses.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, datetime: sortFn_datetime, text: sortFn_text },
  columnMeta: metaHelper<ColumnMeta>(),
})

type Features = typeof features

/** Column helper bound to the app's table features: `const col = columnHelper<Row>()`. */
export const columnHelper = <T extends RowData>() => createColumnHelper<Features, T>()

type DataTableProps<T extends RowData> = {
  columns: ColumnDef<Features, T, any>[] // eslint-disable-line @typescript-eslint/no-explicit-any
  data: T[]
  initialSorting?: SortingState
  rowClassName?: (row: T) => string | undefined
  empty?: string
  /**
   * How one row reads on a phone. When given, narrow screens get a stacked list (with a sort
   * control) instead of a table whose number columns would scroll out of view.
   */
  mobileRow?: (row: T) => ReactNode
  /** Accessible name for the table and list. */
  label?: string
}

/** A table with click-to-sort headers. Numeric columns are right-aligned with tabular figures. */
export function DataTable<T extends RowData>({
  columns,
  data,
  initialSorting = [],
  rowClassName,
  empty = "Nothing here yet.",
  mobileRow,
  label,
}: DataTableProps<T>) {
  const table = useTable({ features, columns, data, initialState: { sorting: initialSorting } })
  const rows = table.getRowModel().rows

  const sortable = table.getAllLeafColumns().filter((c) => c.getCanSort() && typeof c.columnDef.header === "string")
  const current = table.state.sorting[0]
  const sortValue = current ? `${current.id}:${current.desc ? "desc" : "asc"}` : "none"

  const desktop = (
    <Table aria-label={label}>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id} className="hover:bg-transparent">
            {group.headers.map((header) => {
              const meta = header.column.columnDef.meta
              const sorted = header.column.getIsSorted()
              const SortIcon = sorted === "asc" ? ArrowUpIcon : sorted === "desc" ? ArrowDownIcon : ArrowUpDownIcon
              return (
                <TableHead
                  key={header.id}
                  className={cn("bg-muted/50", meta?.numeric && "text-right", meta?.className)}
                  aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                >
                  {header.column.getCanSort() ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="inline-flex items-center gap-1 rounded-sm font-semibold transition-colors hover:text-foreground"
                    >
                      <table.FlexRender header={header} />
                      <SortIcon className={cn("size-3.5", sorted ? "text-primary" : "text-muted-foreground/60")} aria-hidden />
                    </button>
                  ) : (
                    <table.FlexRender header={header} />
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((row) => (
            <TableRow key={row.id} className={rowClassName?.(row.original)}>
              {row.getAllCells().map((cell) => {
                const meta = cell.column.columnDef.meta
                return (
                  <TableCell key={cell.id} className={cn(meta?.numeric && "text-right tabular-nums", meta?.className)}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                )
              })}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
              {empty}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )

  if (!mobileRow) return desktop

  return (
    <>
      <div className="md:hidden">
        {sortable.length > 0 && rows.length > 1 && (
          <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
            <span className="text-sm text-muted-foreground" id="mobile-sort-label">
              Sort by
            </span>
            <Select
              value={sortValue}
              onValueChange={(value) => {
                if (value === "none") return table.setSorting([])
                const [id, dir] = value.split(":")
                table.setSorting([{ id, desc: dir === "desc" }])
              }}
            >
              <SelectTrigger size="sm" className="min-w-44" aria-labelledby="mobile-sort-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  <SelectItem value="none">Default order</SelectItem>
                  {sortable.map((c) => {
                    const meta = c.columnDef.meta
                    const name = c.columnDef.header as string
                    return [
                      <SelectItem key={`${c.id}:desc`} value={`${c.id}:desc`}>
                        {name}, {meta?.numeric ? "highest first" : "Z to A"}
                      </SelectItem>,
                      <SelectItem key={`${c.id}:asc`} value={`${c.id}:asc`}>
                        {name}, {meta?.numeric ? "lowest first" : "A to Z"}
                      </SelectItem>,
                    ]
                  })}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}
        {rows.length ? (
          <ul className="divide-y" aria-label={label}>
            {rows.map((row) => (
              <li key={row.id} className={cn("px-4 py-3", rowClassName?.(row.original))}>
                {mobileRow(row.original)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
        )}
      </div>
      <div className="hidden md:block">{desktop}</div>
    </>
  )
}