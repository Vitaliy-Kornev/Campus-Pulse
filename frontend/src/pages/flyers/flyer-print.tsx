import { useQueries } from "@tanstack/react-query"
import { ArrowLeftIcon, PrinterIcon } from "lucide-react"
import { Link, useParams, useSearchParams } from "react-router"

import { BoardTag } from "@/components/board-tag"
import { ErrorState, FullPageSpinner } from "@/components/query-state"
import { Button } from "@/components/ui/button"
import { flyerQuery, isUnreachableUrl, UnreachableUrlAlert } from "@/pages/flyers/flyer-detail"

/**
 * 2 × 2 inch codes with the event name and short URL underneath, as a fallback for cameras
 * that fail. One label (/flyers/:slug/print) or a sheet of them (/print?flyers=a,b,c) after
 * posting on several boards. No app chrome, so it prints cleanly at 100% scale.
 */
export function FlyerPrintPage() {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const slugs = slug ? [slug] : (params.get("flyers") ?? "").split(",").filter(Boolean)
  const flyers = useQueries({ queries: slugs.map((s) => flyerQuery(s)) })

  if (!slugs.length) return <ErrorState title="No labels to print" description="Open this page from a flyer's Print button." className="m-6" />
  if (flyers.some((f) => f.isPending)) return <FullPageSpinner />
  const failed = flyers.find((f) => f.isError)
  if (failed) return <ErrorState error={failed.error} className="m-6" />
  const data = flyers.map((f) => f.data!)
  const first = data[0]
  const unreachable = data.find((f) => isUnreachableUrl(f.scan_url))
  const back = data.length === 1 ? { to: `/flyers/${first.slug}`, label: "Back to flyer" } : { to: `/events/${first.event.id}`, label: `Back to ${first.event.name}` }

  return (
    <div className="min-h-dvh bg-white p-[0.5in] text-[#2e2c2a] print:p-0">
      <title>{`Print · ${first.event.name} · Campus Pulse`}</title>
      <style>{"@page { margin: 0.5in; }"}</style>
      <div className="mb-[0.4in] flex max-w-3xl flex-col gap-4 print:hidden">
        <Link to={back.to} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-3.5" aria-hidden />
          {back.label}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => window.print()}>
            <PrinterIcon data-icon="inline-start" />
            {data.length === 1 ? "Print label" : `Print ${data.length} labels`}
          </Button>
          <span className="text-sm text-muted-foreground">Each code prints at 2 × 2 inches. Set your print dialog's scale to 100%.</span>
        </div>
        {unreachable && <UnreachableUrlAlert url={unreachable.scan_url} />}
      </div>
      <div className="flex flex-wrap gap-[0.25in]">
        {data.map((f) => (
          <figure
            key={f.slug}
            className="inline-flex break-inside-avoid flex-col items-center p-[0.15in] text-center outline-1 outline-[#c9c4be] outline-dashed print:outline-none"
          >
            <img src={`/api/flyers/${encodeURIComponent(f.slug)}/qr.svg?background=white`} alt={`QR code for ${f.board.name}`} className="block size-[2in]" />
            <figcaption className="flex flex-col items-center">
              <span className="mt-[0.08in] max-w-[2.4in] text-[12pt] leading-tight font-bold">{f.event.name}</span>
              <span className="mt-[0.04in] font-mono text-[7.5pt] text-[#4a4643]">{f.short_url}</span>
              {data.length > 1 && (
                <span className="mt-[0.08in] flex items-center gap-1.5 text-[8pt] print:hidden">
                  <BoardTag code={f.board.tag} state="idle" className="h-5 text-[10px]" />
                  {f.board.name}
                </span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
