import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '../../../components/PageHeader'
import { ExposureView } from '../../../components/exposure/ExposureView'
import { getExposure, short } from '../../../lib/exposure'
import { ExposureForm } from '../ExposureForm'

type Props = { params: Promise<{ address: string }> }

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params
  const { report } = await getExposure(address)
  const title = report?.grade
    ? `Grade ${report.grade}: Q-Day exposure of ${short(report.account)}`
    : 'Q-Day exposure check'
  return {
    title: `${title} · QoreConnect`,
    description: report?.headline ?? 'A live, read-only check on QoreChain Diana testnet.',
  }
}

export default async function ExposureReportPage({ params }: Props) {
  const { address } = await params
  const { report, error } = await getExposure(address)
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Q-Day exposure · Diana testnet"
        title={<>Exposure report</>}
        actions={
          <Link href="/exposure" className="qw-btn">
            Check another address
          </Link>
        }
      />
      {report ? (
        <ExposureView report={report} shareUrl={`${SITE}/exposure/${report.account}`} />
      ) : (
        <>
          <p
            role="alert"
            className="rounded-2xl border border-bad/30 bg-bad-bg px-4 py-3 text-sm text-bad"
            data-testid="exposure-error"
          >
            {error}
          </p>
          <ExposureForm initial={address} />
        </>
      )}
    </div>
  )
}
