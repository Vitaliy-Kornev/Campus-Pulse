import { CircleAlertIcon, SearchXIcon } from "lucide-react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  )
}

/** Placeholder while a page's data loads: a heading line and a few blocks, so the layout doesn't jump. */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  )
}

type ErrorStateProps = {
  error?: unknown
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}

/** A failed load. A 404 reads as "not found" (other people's objects are 404 by design). */
export function ErrorState({ error, title, description, onRetry, className }: ErrorStateProps) {
  const notFound = error instanceof ApiError && error.status === 404
  return (
    <Empty className={cn("border", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{notFound ? <SearchXIcon /> : <CircleAlertIcon />}</EmptyMedia>
        <EmptyTitle>{title ?? (notFound ? "We couldn't find that" : "Couldn't load this page")}</EmptyTitle>
        <EmptyDescription>
          {description ?? (notFound ? "It may have been moved, or you may not have access to it." : "Check your connection and try again.")}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        {onRetry && !notFound && <Button onClick={onRetry}>Try again</Button>}
        <Button variant="outline" asChild>
          <Link to="/map">Go to the map</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}

export function NotFoundPage() {
  return <ErrorState error={new ApiError(404, null)} title="We couldn't find that page" className="mx-auto mt-10 max-w-lg" />
}
