import { useQueryClient } from "@tanstack/react-query"
import { ExternalLinkIcon, KeyRoundIcon, LayoutListIcon, LogOutIcon, MenuIcon, PlusIcon, UsersIcon } from "lucide-react"
import { Suspense, useState } from "react"
import { Link, NavLink, Outlet, useNavigate } from "react-router"
import { toast } from "sonner"

import { ClubMenuItems, ClubSwitcher } from "@/components/club-switcher"
import { NotificationBell } from "@/components/notification-bell"
import { PageSkeleton } from "@/components/query-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useConfig, useUser } from "@/hooks/use-session"
import { post } from "@/lib/api"
import { cn } from "@/lib/utils"

type NavItem = { to: string; label: string; end?: boolean; staff?: boolean }

const NAV: NavItem[] = [
  { to: "/map", label: "Map" },
  { to: "/events", label: "Events" },
  { to: "/boards", label: "Boards", end: true },
  { to: "/boards/manage", label: "Manage boards", staff: true },
  { to: "/flyers/new", label: "Post flyer" },
]

/** The logo on a white keyline, so the maroon tile still reads on the maroon header. */
export function Brand({ onPanel = true }: { onPanel?: boolean }) {
  const config = useConfig()
  return (
    <Link to="/" className="flex shrink-0 items-center gap-3 rounded-md" aria-label="Campus Pulse home">
      <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className={cn("size-8 rounded-md", onPanel && "ring-2 ring-white/90")} />
      <span className="leading-none">
        <span className="block text-base font-extrabold tracking-tight">Campus Pulse</span>
        <span className={cn("mt-1 block text-[11px] font-semibold tracking-[0.08em] uppercase", onPanel ? "text-white/80" : "text-primary")}>
          {config.campus_short_name}
        </span>
      </span>
    </Link>
  )
}

function NavLinks({ vertical, onNavigate }: { vertical?: boolean; onNavigate?: () => void }) {
  const user = useUser()
  return (
    <nav className={cn("flex text-sm font-semibold", vertical ? "flex-col gap-1" : "h-full items-stretch")} aria-label="Main">
      {NAV.filter((item) => !item.staff || user.is_staff).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            vertical
              ? cn(
                  "rounded-md px-3 py-2.5 text-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                )
              : cn(
                  "flex items-center border-y-[3px] border-transparent px-3.5 pt-0.5 text-white/80 transition-colors duration-150 hover:text-white",
                  isActive && "border-b-highlight text-white",
                )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase()
}

function ProfileMenu() {
  const user = useUser()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const displayName = user.full_name || user.username

  async function logOut() {
    try {
      await post("auth/logout/")
    } catch {
      toast.error("Couldn't log out. Try again.")
      return
    }
    queryClient.clear()
    navigate("/login")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Profile menu"
          className="grid size-9 place-items-center rounded-full bg-white pt-0.5 text-xs font-extrabold text-primary transition-shadow duration-150 hover:ring-2 hover:ring-highlight focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none"
        >
          {initials(displayName)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-1.5 py-2">
          <span className="truncate font-bold text-foreground">{displayName}</span>
          {user.email && <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>}
          <Badge variant={user.is_staff ? "default" : "secondary"} className="w-fit">
            {user.is_staff ? "Administrator" : `Officer · ${user.club?.name ?? ""}`}
          </Badge>
        </DropdownMenuLabel>
        {user.club && (
          <div className="lg:hidden">
            <DropdownMenuSeparator />
            <ClubMenuItems />
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {user.club && (
            <DropdownMenuItem asChild>
              <Link to="/club">
                <UsersIcon />
                Club profile & officers
              </Link>
            </DropdownMenuItem>
          )}
          {!user.is_staff && (
            <DropdownMenuItem asChild>
              <Link to="/club/setup">
                <PlusIcon />
                Join or start another club
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link to="/events">
              <LayoutListIcon />
              {user.is_staff ? "All events" : "Your club's events"}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/account/password">
              <KeyRoundIcon />
              Change password
            </Link>
          </DropdownMenuItem>
          {user.is_staff && (
            <DropdownMenuItem asChild>
              <a href="/admin/">
                <ExternalLinkIcon />
                Django admin
              </a>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={logOut}>
            <LogOutIcon />
            Log out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileNav() {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="-ml-2 text-white hover:bg-white/10 hover:text-white md:hidden" aria-label="Open menu">
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <div className="px-2">
          <NavLinks vertical onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** Header and navigation around every logged-in page. Full-bleed pages (maps) pass `fullBleed`. */
export function AppShell({ fullBleed = false }: { fullBleed?: boolean }) {
  return (
    <div className={cn("flex min-h-dvh flex-col", fullBleed && "h-dvh")}>
      <header className="sticky top-0 z-40 bg-panel text-panel-foreground shadow-[0_1px_0_rgb(0_0_0/0.15)]">
        <div className={cn("flex h-14 items-stretch gap-4 px-4 md:px-6", !fullBleed && "mx-auto max-w-7xl")}>
          <div className="flex items-center gap-2">
            <MobileNav />
            <Brand />
          </div>
          <div className="ml-6 hidden md:block">
            <NavLinks />
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            <ClubSwitcher className="mr-1.5 hidden max-w-56 lg:flex" />
            <NotificationBell />
            <ProfileMenu />
          </div>
        </div>
      </header>
      {fullBleed ? (
        <main className="relative flex min-h-0 flex-1 flex-col">
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </main>
      ) : (
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 md:py-8">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      )}
    </div>
  )
}
