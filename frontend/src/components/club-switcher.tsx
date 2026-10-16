import {
  CheckIcon,
  ChevronsUpDownIcon,
  ClockIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import { Link } from "react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUser } from "@/hooks/use-session";
import { useSwitchClub } from "@/hooks/use-switch-club";
import { cn } from "@/lib/utils";

/**
 * The club every screen is about, and the officer's other clubs to switch to. Each club's events
 * and numbers stay inside that club; switching changes the whole app, never mixes them.
 */
export function ClubSwitcher({ className }: { className?: string }) {
  const user = useUser();
  if (!user.club) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Club: ${user.club.name}. Switch club`}
          className={cn(
            "flex h-9 min-w-0 items-center gap-2 rounded-md border border-white/30 px-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-highlight focus-visible:outline-none",
            className,
          )}
        >
          <UsersIcon className="size-4 shrink-0 text-highlight" aria-hidden />
          <span className="truncate">{user.club.name}</span>
          <ChevronsUpDownIcon
            className="size-3.5 shrink-0 text-white/70"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <ClubMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/club">
              <UsersIcon />
              {user.club.name} profile & officers
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/club/setup">
              <PlusIcon />
              Join or start another club
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The officer's clubs as menu items: the current one checked, pending requests greyed out. */
export function ClubMenuItems() {
  const user = useUser();
  const switchClub = useSwitchClub();
  if (!user.club) return null;
  const active = user.clubs.filter((c) => c.status === "active");
  const pending = user.clubs.filter((c) => c.status === "pending");
  return (
    <>
      <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
        Your clubs
      </DropdownMenuLabel>
      <DropdownMenuGroup>
        {active.map((club) => {
          const current = club.id === user.club!.id;
          return (
            <DropdownMenuItem
              key={club.id}
              onSelect={() => !current && switchClub(club.id)}
              aria-current={current || undefined}
            >
              <span className="min-w-0 flex-1 truncate">{club.name}</span>
              {current && (
                <CheckIcon className="text-primary" aria-label="Current club" />
              )}
            </DropdownMenuItem>
          );
        })}
        {pending.map((club) => (
          <DropdownMenuItem key={club.id} disabled>
            <ClockIcon />
            <span className="min-w-0 flex-1 truncate">{club.name}</span>
            <span className="text-xs">Waiting</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </>
  );
}
