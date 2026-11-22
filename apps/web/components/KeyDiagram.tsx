/**
 * Hero visual: the quantum-safe root (centre) holds MetaMask as a capped session key (inner orbit); approved dApps are
 * reachable, a drainer is blocked by the chain. Pure SVG + CSS; motion is disabled under prefers-reduced-motion.
 */
export function KeyDiagram() {
  return (
    <figure className="relative mx-auto aspect-square w-full max-w-[440px]" aria-labelledby="qc-diagram-caption">
      <svg viewBox="0 0 400 400" className="h-full w-full" role="img" aria-hidden="true">
        <defs>
          <radialGradient id="qc-core" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="qc-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>

        {/* Outer ring: dApps */}
        <circle cx="200" cy="200" r="168" fill="none" stroke="var(--line)" strokeDasharray="2 6" />
        {/* Inner ring: the capped session key's reach */}
        <circle cx="200" cy="200" r="104" fill="none" stroke="url(#qc-ring)" strokeOpacity="0.55" strokeWidth="1.5" />

        {/* Flows from the root, through the session key, to approved dApps */}
        <path className="qw-flow" d="M200 200 L 292 124" stroke="var(--accent)" strokeWidth="1.6" fill="none" />
        <path className="qw-flow" d="M200 200 L 84 300" stroke="var(--accent)" strokeWidth="1.6" fill="none" />
        {/* Blocked path to the drainer */}
        <path
          d="M200 200 L 330 290"
          stroke="var(--bad)"
          strokeOpacity="0.6"
          strokeWidth="1.4"
          strokeDasharray="3 5"
          fill="none"
        />

        {/* Root glow + shield */}
        <circle className="qw-pulse" cx="200" cy="200" r="78" fill="url(#qc-core)" />
        <g transform="translate(168 160)">
          <path
            d="M32 2 60 13v22c0 19-12 31-28 38C16 66 4 54 4 35V13z"
            fill="var(--panel)"
            stroke="url(#qc-ring)"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <text
            x="32"
            y="42"
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="var(--fg)"
            fontFamily="var(--font-code)"
          >
            ML-DSA
          </text>
          <text x="32" y="55" textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--font-code)">
            87
          </text>
        </g>

        {/* Orbiting session key */}
        <g className="qw-orbit">
          <g transform="translate(200 96)">
            <circle r="17" fill="var(--panel)" stroke="var(--warn)" strokeWidth="2" />
            <path
              d="M-6 3a5 5 0 1 1 4-8l9 0 0 4-3 0 0 3-3 0 0-3-3 0a5 5 0 0 1-4 4z"
              fill="var(--warn)"
              transform="translate(-1 1)"
            />
          </g>
        </g>

        {/* Approved dApps */}
        <g transform="translate(292 124)">
          <circle r="20" fill="var(--panel)" stroke="var(--accent)" strokeWidth="2" />
          <path
            d="M-7 0l5 5 9-10"
            stroke="var(--accent)"
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g transform="translate(84 300)">
          <circle r="20" fill="var(--panel)" stroke="var(--accent)" strokeWidth="2" />
          <path
            d="M-7 0l5 5 9-10"
            stroke="var(--accent)"
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        {/* Drainer: blocked */}
        <g transform="translate(330 290)">
          <circle r="20" fill="var(--bad-bg)" stroke="var(--bad)" strokeWidth="2" />
          <path d="M-6-6 6 6M6-6-6 6" stroke="var(--bad)" strokeWidth="2.6" strokeLinecap="round" />
        </g>

        {/* Labels */}
        <g fontFamily="var(--font-code)" fontSize="11">
          <text x="324" y="100" textAnchor="middle" fill="var(--muted)">
            Tip Jar
          </text>
          <text x="84" y="338" textAnchor="middle" fill="var(--muted)">
            your dApp
          </text>
          <text x="330" y="328" textAnchor="middle" fill="var(--bad)">
            drainer: code 10
          </text>
        </g>
      </svg>
      <div
        aria-hidden="true"
        className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent" />
          quantum-safe root
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-warn" />
          MetaMask: capped session key
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-bad" />
          refused by chain
        </span>
      </div>
      <figcaption id="qc-diagram-caption" className="sr-only">
        A quantum-safe ML-DSA-87 root key in the centre holds MetaMask as a capped session key. Approved dApps are
        reachable; a drainer contract is refused by the chain with code 10.
      </figcaption>
    </figure>
  )
}
