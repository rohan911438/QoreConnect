'use client'
import { useState } from 'react'

/** One-series trend line (single hue, 2px, recessive baseline) with a hover crosshair and tooltip. */
export function Sparkline({ points, label, format = (v) => v.toLocaleString('en-US') }: { points: { ts: number; v: number }[]; label: string; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number>()
  const W = 240
  const H = 56
  const P = 4
  if (points.length < 2) return <p className="h-14 pt-5 text-xs text-muted">The series starts with the next snapshot.</p>
  const t0 = points[0]!.ts
  const t1 = points.at(-1)!.ts
  const max = Math.max(1, ...points.map((p) => p.v))
  const x = (t: number) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * P)
  const y = (v: number) => H - P - (v / max) * (H - 2 * P)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.ts).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
  const h = hover === undefined ? undefined : points[hover]
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0)
    let best = 0
    points.forEach((p, i) => Math.abs(p.ts - t) < Math.abs(points[best]!.ts - t) && (best = i))
    setHover(best)
  }
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full touch-none" role="img" aria-label={`${label}: trend over ${points.length} snapshots`} onPointerMove={onMove} onPointerLeave={() => setHover(undefined)} preserveAspectRatio="none">
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {h && <line x1={x(h.ts)} x2={x(h.ts)} y1={P} y2={H - P} stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      {h && (
        <div className="pointer-events-none absolute -top-8 rounded-md border border-line bg-panel px-2 py-1 text-xs shadow-sm" style={{ left: `clamp(0px, calc(${(x(h.ts) / W) * 100}% - 60px), calc(100% - 120px))` }}>
          <span className="font-semibold">{format(h.v)}</span> <span className="text-muted">{new Date(h.ts).toISOString().slice(5, 16).replace('T', ' ')} UTC</span>
        </div>
      )}
    </div>
  )
}
