import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { lazy, Suspense, type ReactNode } from "react"
import { createBrowserRouter, Navigate, RouterProvider } from "react-router"

import { AppShell } from "@/components/app-shell"
import { FullPageSpinner, NotFoundPage } from "@/components/query-state"
import { PublicOnly, RequireAuth } from "@/components/route-guards"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ApiError } from "@/lib/api"

// Pages load on demand, so the map and chart libraries only download where they are used.
const LoginPage = lazy(() => import("@/pages/auth/login").then((m) => ({ default: m.LoginPage })))
const PasswordChangePage = lazy(() => import("@/pages/auth/password-change").then((m) => ({ default: m.PasswordChangePage })))
const PasswordResetPage = lazy(() => import("@/pages/auth/password-reset").then((m) => ({ default: m.PasswordResetPage })))
const PasswordResetConfirmPage = lazy(() => import("@/pages/auth/password-reset-confirm").then((m) => ({ default: m.PasswordResetConfirmPage })))
const SignupPage = lazy(() => import("@/pages/auth/signup").then((m) => ({ default: m.SignupPage })))
const BoardFormPage = lazy(() => import("@/pages/boards/board-form").then((m) => ({ default: m.BoardFormPage })))
const LeaderboardPage = lazy(() => import("@/pages/boards/leaderboard").then((m) => ({ default: m.LeaderboardPage })))
const ManageBoardsPage = lazy(() => import("@/pages/boards/manage-boards").then((m) => ({ default: m.ManageBoardsPage })))
const CampaignDashboardPage = lazy(() => import("@/pages/campaigns/campaign-dashboard").then((m) => ({ default: m.CampaignDashboardPage })))
const CampaignFormPage = lazy(() => import("@/pages/campaigns/campaign-form").then((m) => ({ default: m.CampaignFormPage })))
const CampaignListPage = lazy(() => import("@/pages/campaigns/campaign-list").then((m) => ({ default: m.CampaignListPage })))
const FlyerDetailPage = lazy(() => import("@/pages/flyers/flyer-detail").then((m) => ({ default: m.FlyerDetailPage })))
const FlyerFormPage = lazy(() => import("@/pages/flyers/flyer-form").then((m) => ({ default: m.FlyerFormPage })))
const FlyerPrintPage = lazy(() => import("@/pages/flyers/flyer-print").then((m) => ({ default: m.FlyerPrintPage })))
const FlyerRepostPage = lazy(() => import("@/pages/flyers/flyer-repost").then((m) => ({ default: m.FlyerRepostPage })))
const MapPage = lazy(() => import("@/pages/map/map-page").then((m) => ({ default: m.MapPage })))

// A 401 anywhere means the session ended: refetch it, and <RequireAuth> sends the user to log in.
const onError = (error: unknown) => {
  if (error instanceof ApiError && error.status === 401) queryClient.invalidateQueries({ queryKey: ["session"] })
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Don't retry "not found" or "not allowed"; do retry flaky networks once.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
    },
  },
})

const authed = (element: ReactNode, staff = false) => <RequireAuth staff={staff}>{element}</RequireAuth>
const publicOnly = (element: ReactNode) => <PublicOnly>{element}</PublicOnly>

const router = createBrowserRouter([
  { path: "/login", element: publicOnly(<LoginPage />) },
  { path: "/signup", element: publicOnly(<SignupPage />) },
  { path: "/password-reset", element: <PasswordResetPage /> },
  { path: "/reset/:uid/:token", element: <PasswordResetConfirmPage /> },
  { path: "/flyers/:slug/print", element: authed(<FlyerPrintPage />) },
  {
    // Map pages fill the window under the header.
    element: authed(<AppShell fullBleed />),
    children: [
      { path: "/map", element: <MapPage /> },
      { path: "/boards/manage", element: authed(<ManageBoardsPage />, true) },
    ],
  },
  {
    element: authed(<AppShell />),
    children: [
      { path: "/", element: <Navigate to="/map" replace /> },
      { path: "/campaigns", element: <CampaignListPage /> },
      { path: "/campaigns/new", element: <CampaignFormPage /> },
      { path: "/campaigns/:id", element: <CampaignDashboardPage /> },
      { path: "/campaigns/:id/edit", element: <CampaignFormPage /> },
      { path: "/flyers/new", element: <FlyerFormPage /> },
      { path: "/flyers/:slug", element: <FlyerDetailPage /> },
      { path: "/flyers/:slug/repost", element: <FlyerRepostPage /> },
      { path: "/boards", element: <LeaderboardPage /> },
      { path: "/boards/new", element: <BoardFormPage /> },
      { path: "/boards/:id/edit", element: authed(<BoardFormPage />, true) },
      { path: "/account/password", element: <PasswordChangePage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  // Old server-rendered auth URLs, in case anyone bookmarked them.
  { path: "/accounts/login", element: <Navigate to="/login" replace /> },
  { path: "/accounts/signup", element: <Navigate to="/signup" replace /> },
  { path: "/accounts/password_reset", element: <Navigate to="/password-reset" replace /> },
])

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Suspense fallback={<FullPageSpinner />}>
          <RouterProvider router={router} />
        </Suspense>
        <Toaster position="top-center" richColors closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
