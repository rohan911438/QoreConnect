import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { EXTRA_STYLES, STYLES } from './styles'

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  )
}

export interface ModalProps {
  title: ReactNode
  eyebrow?: ReactNode
  /** Short description announced with the title. */
  description?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  /** Escape / backdrop. Omit to make the modal non-dismissable (e.g. while a transaction is in flight). */
  onClose?: () => void
  initialFocus?: RefObject<HTMLElement | null>
  testId?: string
}

/** Accessible modal shell: labelled, focus-trapped, restores focus, Escape closes. Light/dark via the --qc-* tokens. */
export function Modal({ title, eyebrow, description, children, actions, onClose, initialFocus, testId }: ModalProps) {
  const titleId = useId()
  const descId = useId()
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const target = initialFocus?.current ?? (dialog.current ? focusables(dialog.current)[0] : undefined) ?? dialog.current
    target?.focus()
    return () => previous?.focus?.()
  }, [initialFocus])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && onClose) {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !dialog.current) return
    const els = focusables(dialog.current)
    if (!els.length) {
      e.preventDefault()
      return
    }
    const first = els[0]!
    const last = els[els.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="qc-root qc-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <style>{STYLES + EXTRA_STYLES}</style>
      <div
        ref={dialog}
        className="qc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-testid={testId}
      >
        <header className="qc-head">
          {eyebrow && <p className="qc-eyebrow">{eyebrow}</p>}
          <h2 id={titleId} className="qc-title">
            {title}
          </h2>
          {description && (
            <div id={descId} className="qc-summary">
              {description}
            </div>
          )}
        </header>
        {children}
        {actions && <footer className="qc-actions">{actions}</footer>}
      </div>
    </div>
  )
}
