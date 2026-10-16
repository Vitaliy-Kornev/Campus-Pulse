import type { ReactNode } from "react"
import { Link } from "react-router"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type AuthLayoutProps = { title: string; description: ReactNode; children: ReactNode; footer?: ReactNode }

/** The logged-out pages (log in, sign up, password reset): a maroon sign panel over the form. */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="bg-panel px-4 pt-10 pb-24 text-panel-foreground">
        <Link to="/login" className="mx-auto flex w-fit items-center gap-3 rounded-md" aria-label="Campus Pulse">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="size-10 rounded-md ring-2 ring-white/90" />
          <span className="leading-none">
            <span className="block text-xl font-extrabold tracking-tight">Campus Pulse</span>
            <span className="mt-1.5 block text-sm text-white/85">See which boards get your flyers scanned</span>
          </span>
        </Link>
      </div>
      <div className="-mt-16 flex flex-1 flex-col items-center px-4 pb-10">
        <Card className="w-full max-w-sm shadow-[0_12px_32px_rgb(46_44_42/0.16)]">
          <CardHeader>
            <CardTitle className="text-xl font-bold">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        {footer && <p className="mt-5 text-center text-sm text-muted-foreground">{footer}</p>}
      </div>
    </div>
  )
}
