import type { ReactNode } from "react"
import { Link } from "react-router"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type AuthLayoutProps = { title: string; description: ReactNode; children: ReactNode; footer?: ReactNode }

/** Centered card for the logged-out pages (log in, sign up, password reset). */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-background px-4 py-10 sm:justify-center">
      <Link to="/login" className="mb-6 flex items-center gap-2.5 rounded-md" aria-label="Campus Pulse">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="size-9" />
        <span className="text-lg font-semibold">Campus Pulse</span>
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {footer && <p className="mt-4 text-center text-sm text-muted-foreground">{footer}</p>}
    </div>
  )
}
