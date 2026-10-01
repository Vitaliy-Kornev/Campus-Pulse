import { useQueryClient } from "@tanstack/react-query"
import { ExternalLinkIcon, KeyRoundIcon, LayoutListIcon, LogOutIcon, MenuIcon, UserIcon } from "lucide-react"
import { Suspense, useState } from "react"
import { Link, NavLink, Outlet, useNavigate } from "react-router"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { PageSkeleton } from "@/components/query-state"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useConfig, useUser } from "@/hooks/use-session"
import { post } from "@/lib/api"
import { cn } from "@/lib/utils"

type NavItem = { to: string; label: string; end?: boolean; staff?: boolean }

const NAV: NavItem[] = [
  { to: "/map", label: "Map" },
  { to: "/campaigns", label: "Campaigns" },
  { to: "/boards", label: "Boards", end: true },
  { to: "/boards/manage", label: "Manage boards", staff: true },
  { to: "/flyers/new", label: "Post flyer" },
]

export function Brand() {
  const config = useConfig()
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded-md" aria-label="Campus Pulse home">
      <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="size-8" />
      <span className="leading-tight">
        <span className="block font-semibold">Campus Pulse</span>
        <span className="block text-[11px] font-medium tracking-wide text-brand">{config.campus_short_name}</span>
      </span>
    </Link>
  )
}

function NavLinks({ vertical, onNavigate }: { vertical?: boolean; onNavigate?: () => void }) {
  const user = useUser()
  return (
    <nav className={cn("flex gap-1 text-sm", vertical ? "flex-col" : "items-center")} aria-label="Main">
      {NAV.filter((item) => !item.staff || user.is_staff).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "rounded-md px-3 py-2 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
              isActive && "bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground",
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

function ProfileMenu() {
  const user = useUser()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

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
        <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="Profile menu">
          <Avatar>
            <AvatarFallback className="bg-accent text-accent-foreground">
              <UserIcon />
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-1.5 py-2">
          <span className="truncate font-semibold text-foreground">{user.full_name || user.username}</span>
          {user.email && <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>}
          <Badge variant={user.is_staff ? "default" : "secondary"} className="w-fit">
            {user.is_staff ? "Administrator" : "Advertiser"}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/campaigns">
              <LayoutListIcon />
              {user.is_staff ? "All campaigns" : "Your campaigns"}
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
          <DropdownMenuItem variant="destructive" onSelect={logOut}>
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
        <Button variant="ghost" size="icon-lg" className="md:hidden" aria-label="Open menu">
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
      <header className="sticky top-0 z-40 border-b bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <MobileNav />
          <Brand />
          <Separator orientation="vertical" className="hidden h-6 md:block" />
          <div className="hidden md:block">
            <NavLinks />
          </div>
          <div className="ml-auto">
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
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      )}
    </div>
  )
}
