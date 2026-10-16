import { RotateCwIcon, TriangleAlertIcon } from "lucide-react"
import { useEffect } from "react"
import { isRouteErrorResponse, Link, useRouteError } from "react-router"

import { Button } from "@/components/ui/button"
import { reportError } from "@/lib/error-reporting"

/** A page that failed to load: lazy-loaded code gone after a deploy. */
function isStaleBuild(error: unknown) {
  return error instanceof Error && /dynamically imported module|Importing a module script failed|Loading chunk/i.test(error.message)
}

/** Shown instead of a page that crashed, so a bug never leaves a blank screen. */
export function RouteError() {
  const error = useRouteError()
  const stale = isStaleBuild(error)
  useEffect(() => {
    if (!stale && !isRouteErrorResponse(error)) reportError(error)
  }, [error, stale])

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-accent text-primary">
          <TriangleAlertIcon className="size-6" aria-hidden />
        </span>
        <h1 className="text-xl font-extrabold">{stale ? "Campus Pulse was updated" : "Something went wrong on this page"}</h1>
        <p className="text-sm text-muted-foreground">
          {stale
            ? "Reload to get the latest version. Nothing you saved is lost."
            : "Reload to try again. If it keeps happening, the problem has been reported and your saved work is safe."}
        </p>
        <div className="mt-2 flex gap-2">
          <Button onClick={() => window.location.reload()}>
            <RotateCwIcon />
            Reload
          </Button>
          <Button asChild variant="outline">
            <Link to="/map" reloadDocument>
              Go to the map
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
