import { ImageResponse } from 'next/og'
import { GRADE_TONE, STATUS_LABEL, fmtQor, getExposure, short } from '../../../lib/exposure'

export const alt = 'QoreConnect Q-Day exposure report (QoreChain Diana testnet)'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Card({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  const { report: r } = await getExposure(address)
  const tone = r?.grade ? GRADE_TONE[r.grade]!.hex : '#8b97a3'
  const footer = r?.score !== undefined ? `${r.score} / 100` : ''
  const sub = r ? `Worst case ${fmtQor(r.atRiskUqor)} of ${fmtQor(r.balanceUqor)} · ${short(r.account)}` : ''
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 64,
        background: '#05070b',
        color: '#e8edf2',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', fontSize: 26, color: '#8b97a3', letterSpacing: 2 }}>
        QORECONNECT · Q-DAY EXPOSURE · DIANA TESTNET
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 56 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 230,
            height: 230,
            borderRadius: 999,
            border: `16px solid ${tone}`,
            fontSize: 130,
            fontWeight: 700,
            color: tone,
          }}
        >
          {r?.grade ?? '–'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 760 }}>
          <div style={{ display: 'flex', fontSize: 28, color: tone }}>
            {r ? STATUS_LABEL[r.status] : 'Exposure check'}
          </div>
          <div style={{ display: 'flex', fontSize: 50, fontWeight: 700, lineHeight: 1.12 }}>
            {r?.headline ?? 'How much could a quantum computer take?'}
          </div>
          {sub && <div style={{ display: 'flex', fontSize: 26, color: '#8b97a3' }}>{sub}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, color: '#8b97a3' }}>
        <div style={{ display: 'flex' }}>Live, read-only check of QoreChain Diana testnet</div>
        <div style={{ display: 'flex' }}>{footer}</div>
      </div>
    </div>,
    size,
  )
}
