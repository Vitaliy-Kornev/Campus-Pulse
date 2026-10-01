import { useQuery } from "@tanstack/react-query"
import { PrinterIcon } from "lucide-react"
import { useParams } from "react-router"

import { ErrorState, FullPageSpinner } from "@/components/query-state"
import { Button } from "@/components/ui/button"
import { flyerQuery } from "@/pages/flyers/flyer-detail"

/**
 * A 2 × 2 inch code with the campaign name and short URL underneath, as a fallback for cameras
 * that fail. No app chrome, so it prints cleanly at 100% scale.
 */
export function FlyerPrintPage() {
  const { slug = "" } = useParams()
  const flyer = useQuery(flyerQuery(slug))
  if (flyer.isPending) return <FullPageSpinner />
  if (flyer.isError) return <ErrorState error={flyer.error} className="m-6" />
  const f = flyer.data

  return (
    <div className="min-h-dvh bg-white p-[0.5in] text-slate-900 print:p-0">
      <title>{`Print · ${f.campaign.name} · Campus Pulse`}</title>
      <style>{"@page { margin: 0.5in; }"}</style>
      <div className="mb-[0.4in] flex flex-wrap items-center gap-3 text-sm text-slate-600 print:hidden">
        <Button onClick={() => window.print()}>
          <PrinterIcon data-icon="inline-start" />
          Print
        </Button>
        <span>Prints at 2 × 2 inches. Make sure your print dialog's scale is 100%.</span>
      </div>
      <div className="inline-flex flex-col items-center p-[0.15in] text-center outline-1 outline-slate-300 outline-dashed print:outline-none">
        <img src={`/api/flyers/${encodeURIComponent(f.slug)}/qr.svg?background=white`} alt="QR code" className="block size-[2in]" />
        <div className="mt-[0.08in] max-w-[2.4in] text-[12pt] font-semibold">{f.campaign.name}</div>
        <div className="mt-[0.04in] font-mono text-[7.5pt] text-slate-700">{f.short_url}</div>
      </div>
    </div>
  )
}
