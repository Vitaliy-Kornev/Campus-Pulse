import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { startErrorReporting } from "@/lib/error-reporting"
import type { AppConfig, Session, User } from "@/lib/types"

export const sessionQuery = {
  queryKey: ["session"],
  queryFn: async () => {
    const session = await api<Session>("session/")
    startErrorReporting()
    return session
  },
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
