import { buttonVariants } from "@/components/ui/button"
import { tagCount, tagHtml, type TagState } from "@/lib/board-tag"
import { escapeHtml as e } from "@/lib/map"
import type { BoardProperties } from "@/lib/types"

/** The popup for a board on a map. Links carry data-nav so they route inside the app. */
export function popupHtml(p: BoardProperties, isStaff: boolean, state: TagState): string {
  const place = [p.building, p.floor ? `Floor ${p.floor}` : "", p.area].filter(Boolean).join(" · ")
  const count = state === "empty" || state === "retired" ? null : tagCount(p.total_scans)
  const note = (text: string) => `<p class="mt-1.5 text-xs text-muted-foreground">${text}</p>`

  let html = '<div class="flex flex-col gap-3">'
  html += `<div class="flex items-start gap-2.5">${tagHtml(p.tag, count, state)}<div class="min-w-0"><div class="text-sm leading-snug font-bold">${e(p.name)}</div><div class="text-xs text-muted-foreground">${e(place)}</div></div></div>`
  if (p.description) html += note(e(p.description))
  if (!p.is_active) html += note("Retired: visible to admins only.")
  if (p.board_count) html += note(`About ${p.board_count} physical boards in this building share one QR code.`)
  html += `<div class="flex gap-6 border-t pt-2.5">
    <div><div class="text-xl leading-none font-extrabold">${p.total_scans}</div><div class="mt-1 text-xs text-muted-foreground">scans</div></div>
    <div><div class="text-xl leading-none font-extrabold">${p.unique_scans}</div><div class="mt-1 text-xs text-muted-foreground">unique people</div></div>
  </div>`
  if (p.flyers.length) {
    html += '<div class="border-t pt-2.5"><div class="mb-1.5 text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">Flyers here</div><ul class="flex flex-col gap-1.5">'
    for (const fl of p.flyers) {
      const href = `/flyers/${encodeURIComponent(fl.slug)}`
      html += `<li class="flex justify-between gap-3"><a class="font-semibold text-primary underline-offset-4 hover:underline" href="${href}" data-nav="${href}">${e(fl.event)}${
        fl.label ? ` <span class="font-normal text-muted-foreground">(${e(fl.label)})</span>` : ""
      }</a><span class="font-bold">${fl.scans}</span></li>`
    }
    html += "</ul></div>"
  } else if (p.is_active) {
    html += '<p class="text-xs text-muted-foreground">No flyers on this board right now.</p>'
  }
  if (p.is_active) {
    const href = `/flyers/new?board=${p.id}`
    html += `<a class="${buttonVariants({ size: "sm" })} w-full text-primary-foreground" href="${href}" data-nav="${href}">Post a flyer here</a>`
  } else if (isStaff) {
    html += `<a class="${buttonVariants({ size: "sm", variant: "outline" })} w-full" href="/boards/manage" data-nav="/boards/manage">Reactivate on Manage boards</a>`
  }
  return html + "</div>"
}
