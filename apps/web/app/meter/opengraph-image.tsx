import { ImageResponse } from 'next/og'
import { daysToQ3_2027, getMeter } from '../../lib/meter'

export const revalidate = 300
export const alt = 'QoreConnect Migration Meter: post-quantum adoption on QoreChain Diana testnet'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage() {
  const m = await getMeter()
  const stats: [string, string][] = m
    ? [
        [m.metrics.onboarded.value.toLocaleString('en-US'), 'accounts with a post-quantum root'],
        [m.metrics.classicalKeys.value.toLocaleString('en-US'), 'classical keys under PQ control'],
        [m.metrics.relayed.value.toLocaleString('en-US'), 'relayed executions'],
      ]
    : []
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 64, background: '#0b0f14', color: '#e8edf2', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 26, color: '#8b97a3', letterSpacing: 2 }}>QORECONNECT · MIGRATION METER · DIANA TESTNET</div>
          <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.1 }}>How much of QoreChain is already quantum-rooted?</div>
        </div>
        <div style={{ display: 'flex', gap: 48 }}>
          {stats.map(([v, l]) => (
            <div key={l} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 84, fontWeight: 700, color: '#3fd0a0' }}>{v}</div>
              <div style={{ fontSize: 24, color: '#8b97a3', maxWidth: 300 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: '#8b97a3' }}>
          <div>{`${daysToQ3_2027().toLocaleString('en-US')} days to Q3 2027 (QoreChain's roadmap target)`}</div>
          <div>Every number links to its source</div>
        </div>
      </div>
    ),
    size,
  )
}
