import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { AppConfig, Session, User } from "@/lib/types"

export const sessionQuery = {
  queryKey: ["session"],
  queryFn: () => api<Session>("session/"),
  staleTime: Infinity,
}

export function useSession() {
  return useQuery(sessionQuery)
}

/** The logged-in user. Only use under <RequireAuth>, which guarantees one. */
export function useUser(): User {
  return useSession().data!.user!
}

export function useConfig(): AppConfig {
  return useSession().data!.config
}
