import { buttonVariants } from "@/components/ui/button"
import { escapeHtml as e } from "@/lib/map"
import type { BoardProperties } from "@/lib/types"

export function tooltipText(p: BoardProperties): string {
  const status = !p.is_active ? "retired" : p.total_scans ? `${p.total_scans} scans` : p.active_flyer_count ? "no scans yet" : "no flyers yet"
  return `${e(p.name)} · ${status}`
}

/** The popup for a board on the campus map. Links carry data-nav so they route inside the app. */
export function popupHtml(p: BoardProperties, isStaff: boolean): string {
  const place = [p.building, p.floor ? `Floor ${p.floor}` : ""].filter(Boolean).join(" · ")
  const badge = (text: string) => `<span class="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">${text}</span>`
  let html = '<div class="flex flex-col gap-2.5">'
  html += `<div><div class="text-sm font-semibold">${e(p.name)}</div><div class="text-muted-foreground">${e(place)}</div>`
  if (p.description) html += `<div class="mt-1 text-xs text-muted-foreground">${e(p.description)}</div>`
  if (!p.is_active) html += `<div class="mt-1">${badge("Retired · visible to admins only")}</div>`
  if (p.board_count) html += `<div class="mt-1">${badge(`~${p.board_count} physical boards, one shared QR code`)}</div>`
  html += "</div>"
  html += `<div class="flex gap-5">
    <div><div class="font-mono text-lg font-semibold">${p.total_scans}</div><div class="text-xs text-muted-foreground">total scans</div></div>
    <div><div class="font-mono text-lg font-semibold">${p.unique_scans}</div><div class="text-xs text-muted-foreground">unique</div></div>
  </div>`
  if (p.flyers.length) {
    html += '<div class="border-t pt-2"><div class="mb-1 text-xs font-medium text-muted-foreground">Flyers on this board</div><ul class="flex flex-col gap-1">'
    for (const fl of p.flyers) {
      const href = `/flyers/${encodeURIComponent(fl.slug)}`
      html += `<li class="flex justify-between gap-2"><a class="text-primary underline-offset-4 hover:underline" href="${href}" data-nav="${href}">${e(fl.campaign)}${
        fl.label ? ` <span class="text-muted-foreground">(${e(fl.label)})</span>` : ""
      }</a><span class="font-mono text-muted-foreground tabular-nums">${fl.scans}</span></li>`
    }
    html += "</ul></div>"
  } else {
    html += '<div class="text-xs text-muted-foreground">No flyers on this board right now.</div>'
  }
  if (p.is_active) {
    const href = `/flyers/new?board=${p.id}`
    html += `<a class="${buttonVariants({ size: "sm" })} w-full" href="${href}" data-nav="${href}">Add flyer here</a>`
  } else if (isStaff) {
    html += `<a class="${buttonVariants({ size: "sm", variant: "outline" })} w-full" href="/boards/manage" data-nav="/boards/manage">Reactivate on Manage boards</a>`
  }
  return html + "</div>"
}
