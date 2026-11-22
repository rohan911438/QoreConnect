import type { ReactNode } from 'react'

/** Shared header for inner pages: eyebrow, large title, intro, optional actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  intro,
  actions,
}: {
  eyebrow: string
  title: ReactNode
  intro?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="qw-rise flex flex-wrap items-end justify-between gap-6 pb-2 pt-8 sm:pt-12">
      <div className="max-w-3xl space-y-4">
        <p className="qw-eyebrow">{eyebrow}</p>
        <h1 className="font-display text-[clamp(2.3rem,5vw,3.8rem)] font-semibold leading-[1] tracking-[-0.04em]">
          {title}
        </h1>
        {intro && <div className="max-w-2xl text-lg leading-relaxed text-muted">{intro}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
