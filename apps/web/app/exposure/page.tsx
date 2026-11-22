import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isAddress } from '../../lib/exposure'
import { PageHeader } from '../../components/PageHeader'
import { ExposureForm } from './ExposureForm'

export const metadata: Metadata = {
  title: 'Q-Day exposure check · QoreConnect',
  description:
    'How much of a QoreChain account could a quantum computer take? A live, read-only check on Diana testnet.',
}

const STEPS: [string, string][] = [
  [
    'Quantum-safe root?',
    'Is an ML-DSA-87 key registered? Diana then refuses classical-only signatures for the account.',
  ],
  [
    'Classical key revealed?',
    'Signing a transaction publishes the classical public key, which is what a quantum attack needs.',
  ],
  [
    'What can MetaMask still move?',
    'Capped keys can spend only up to their daily limit, and only until they expire or are revoked.',
  ],
]

export default async function ExposurePage({ searchParams }: { searchParams: Promise<{ address?: string }> }) {
  // Without JavaScript the form submits ?address=…: send it to the report page.
  const address = (await searchParams).address?.trim()
  if (address && isAddress(address)) redirect(`/exposure/${address}`)
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Q-Day exposure · reads the chain, never signs"
        title={<>How much could a quantum computer take?</>}
        intro={
          <>
            Enter any address. In a few seconds you get a grade, the worst-case amount at risk, the reasons, and a link
            you can share. Works for accounts that do not use QoreConnect yet.
          </>
        }
      />
      <ExposureForm initial={address ?? ''} />
      <ol className="grid gap-3 md:grid-cols-3">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="qw-surface p-5">
            <p className="font-mono text-xs text-muted">0{i + 1}</p>
            <p className="mt-2 font-medium">{t}</p>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
