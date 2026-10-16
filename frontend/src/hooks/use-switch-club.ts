import { useQueryClient } from "@tanstack/react-query"
import { useLocation, useNavigate } from "react-router"
import { toast } from "sonner"

import { post } from "@/lib/api"

// Pages about one event or flyer belong to the club that made it, so they don't survive a switch.
const CLUB_OWNED = /^\/(events|flyers)\/[^/]+/

/**
 * Switch the club every screen is about. Club data cached for the old club is thrown away, so
 * nothing from one club ever shows up while working in another.
 */
export function useSwitchClub() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()

  return async function switchClub(clubId: number, { to, quiet = false }: { to?: string; quiet?: boolean } = {}) {
    try {
      await post(`clubs/${clubId}/open/`)
    } catch {
      toast.error("Couldn't switch clubs. Try again.")
      return false
    }
    await queryClient.invalidateQueries({ queryKey: ["session"] })
    await queryClient.resetQueries({ predicate: (q) => !["session", "taxonomy"].includes(String(q.queryKey[0])) })
    const stay = !CLUB_OWNED.test(location.pathname) && !location.pathname.startsWith("/print")
    navigate(to ?? (stay ? location.pathname + location.search : "/events"))
    if (!quiet) {
      const user = queryClient.getQueryData<{ user: { club: { name: string } | null } }>(["session"])?.user
      if (user?.club) toast.success(`Now working in ${user.club.name}.`)
    }
    return true
  }
}
