'use client'
import { useState, type ReactNode } from 'react'

/* ---------- A tiny TS/shell highlighter: comments, strings, keywords, calls, numbers. Same colours as the landing page. ---------- */

const KEYWORDS = new Set([
  'import', 'from', 'export', 'const', 'let', 'await', 'async', 'new', 'return', 'for', 'of', 'if', 'function',
  'true', 'false', 'undefined', 'type', 'interface', 'default',
])
const TOKEN = /(\/\/[^\n]*|#[^\n]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(\d[\d_]*n?)\b|\b([A-Za-z_$][\w$]*)\b(?=\s*\()|\b([A-Za-z_$][\w$]*)\b/g

function highlight(code: string, lang: 'ts' | 'sh'): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of code.matchAll(TOKEN)) {
    const [text, comment, str, num, call, word] = m
    const at = m.index ?? 0
    if (at > last) out.push(code.slice(last, at))
    last = at + text.length
    const k = i++
    if (comment && (lang === 'sh' ? comment.startsWith('#') : comment.startsWith('//')))
      out.push(<span key={k} className="text-muted">{comment}</span>)
    else if (comment) out.push(comment)
    else if (str) out.push(<span key={k} className="text-ok">{str}</span>)
    else if (num) out.push(<span key={k} className="text-accent">{num}</span>)
    else if (call) out.push(<span key={k} className={lang === 'sh' ? 'text-accent-2' : 'text-warn'}>{call}</span>)
    else if (word && lang === 'ts' && KEYWORDS.has(word)) out.push(<span key={k} className="text-accent-2">{word}</span>)
    else if (word && lang === 'sh' && (word === 'npm' || word === 'pnpm')) out.push(<span key={k} className="text-accent-2">{word}</span>)
    else out.push(text)
  }
  if (last < code.length) out.push(code.slice(last))
  return out
}

function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable: the text is still selectable */
    }
  }
  return { copied, copy }
}

function CopyIcon({ done }: { done: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {done ? <path d="M5 12.5l4.2 4.2L19 7" /> : <><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>}
    </svg>
  )
}

/** A code window with a title bar, highlighted code and a copy button. */
export function CodeWindow({ title, code, lang = 'ts', className = '' }: { title: string; code: string; lang?: 'ts' | 'sh'; className?: string }) {
  const { copied, copy } = useCopy()
  return (
    <div className={`qw-window ${className}`}>
      <div className="qw-window-bar">
        <i />
        <i />
        <i />
        <span className="ml-3 font-mono text-[11px] text-muted">{title}</span>
        <button
          type="button"
          onClick={() => copy(code)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[11px] text-muted transition hover:bg-panel-2 hover:text-fg"
          aria-label={`Copy ${title}`}
        >
          <CopyIcon done={copied} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-[1.7]">
        <code>{highlight(code, lang)}</code>
      </pre>
    </div>
  )
}

/** One-line install command with a copy button. */
export function CopyCommand({ command, className = '' }: { command: string; className?: string }) {
  const { copied, copy } = useCopy()
  return (
    <button
      type="button"
      onClick={() => copy(command)}
      className={`group flex w-full min-w-0 items-center gap-3 rounded-xl border border-line bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] px-3.5 py-2.5 text-left font-mono text-[12.5px] transition hover:border-[color-mix(in_srgb,var(--accent)_50%,var(--line))] ${className}`}
      aria-label={`Copy: ${command}`}
    >
      <span className="select-none text-accent" aria-hidden="true">$</span>
      <span className="min-w-0 flex-1 truncate">{command}</span>
      <span className={`shrink-0 transition ${copied ? 'text-ok' : 'text-muted group-hover:text-fg'}`}>
        <CopyIcon done={copied} />
      </span>
      <span className="sr-only" aria-live="polite">{copied ? 'Copied' : ''}</span>
    </button>
  )
}

export interface Recipe {
  id: string
  label: string
  pkg: string
  title: string
  body: string
  file: string
  code: string
}

/** Tabbed code recipes. */
export function Recipes({ recipes }: { recipes: Recipe[] }) {
  const [active, setActive] = useState(recipes[0]?.id)
  const r = recipes.find((x) => x.id === active) ?? recipes[0]
  if (!r) return null
  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <div role="tablist" aria-label="Recipes" aria-orientation="vertical" className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {recipes.map((x) => {
          const on = x.id === r.id
          return (
            <button
              key={x.id}
              type="button"
              role="tab"
              id={`tab-${x.id}`}
              aria-selected={on}
              aria-controls={`panel-${x.id}`}
              onClick={() => setActive(x.id)}
              className={`shrink-0 rounded-xl border px-3.5 py-2.5 text-left text-sm transition ${
                on ? 'border-line bg-panel font-medium text-fg shadow-[var(--shadow)]' : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              <span className="block">{x.label}</span>
              <span className="hidden font-mono text-[10.5px] text-muted lg:block">{x.pkg}</span>
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={`panel-${r.id}`} aria-labelledby={`tab-${r.id}`} className="min-w-0 space-y-4">
        <div className="space-y-1.5">
          <h3 className="font-display text-2xl font-semibold tracking-tight">{r.title}</h3>
          <p className="max-w-2xl text-muted">{r.body}</p>
        </div>
        <CodeWindow key={r.id} title={r.file} code={r.code} />
      </div>
    </div>
  )
}
