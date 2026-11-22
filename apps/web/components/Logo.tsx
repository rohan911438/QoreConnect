/** QoreConnect mark: a shield (the quantum-safe root) holding a ring (the capped session key). */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 96 96">
      <defs>
        <linearGradient id="qc-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <path d="M48 10 78 22v23c0 20-13 33-30 40-17-7-30-20-30-40V22z" fill="none" stroke="url(#qc-logo-g)" strokeWidth="7" strokeLinejoin="round" />
      <circle cx="48" cy="46" r="12" fill="none" stroke="currentColor" strokeWidth="7" />
      <circle cx="48" cy="46" r="3.5" fill="currentColor" />
    </svg>
  )
}
