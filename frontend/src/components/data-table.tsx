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
}

/** A table with click-to-sort headers. Numeric columns are right-aligned with tabular figures. */
export function DataTable<T extends RowData>({ columns, data, initialSorting = [], rowClassName, empty = "Nothing here yet." }: DataTableProps<T>) {
  const table = useTable({ features, columns, data, initialState: { sorting: initialSorting } })

  return (
    <Table>
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
                      className={cn(
                        "inline-flex items-center gap-1 rounded-sm font-semibold transition-colors hover:text-foreground",
                        meta?.numeric && "flex-row-reverse",
                      )}
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
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} className={rowClassName?.(row.original)}>
              {row.getAllCells().map((cell) => {
                const meta = cell.column.columnDef.meta
                return (
                  <TableCell key={cell.id} className={cn(meta?.numeric && "text-right font-mono tabular-nums", meta?.className)}>
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
}
