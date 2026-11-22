'use client'
import { useState } from 'react'

/** Copy the report link, or post it on X (the link unfurls into the report card). */
export function ShareBar({ url, grade }: { url: string; grade?: string }) {
  const [copied, setCopied] = useState(false)
  const text = grade
    ? `My QoreChain account scores ${grade} on the Q-Day exposure check by QoreConnect (Diana testnet).`
    : 'Q-Day exposure check by QoreConnect (QoreChain Diana testnet).'
  return (
    <>
      <button
        type="button"
        className="qw-btn"
        data-testid="exposure-copy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            /* clipboard blocked: the link is in the address bar */
          }
        }}
      >
        {copied ? 'Link copied' : 'Copy share link'}
      </button>
      <a
        className="qw-btn"
        href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noreferrer"
      >
        Post on X
      </a>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Link copied' : ''}
      </span>
    </>
  )
}
