/** Token approval helpers shared by the relayer's scanner and the web app (no network access here). */

export type ApprovalKind = 'erc20' | 'operator'

const word = (a: string) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0')

/** Calldata for approve(spender, 0) or setApprovalForAll(operator, false): the revoke transaction. */
export function revokeCalldata(a: { kind: ApprovalKind; spender: string }): string {
  return a.kind === 'erc20'
    ? `0x095ea7b3${word(a.spender)}${'0'.repeat(64)}`
    : `0xa22cb465${word(a.spender)}${'0'.repeat(64)}`
}

/** If this calldata grants an approval (approve with a non-zero amount, or setApprovalForAll true), return it. */
export function approvalInCalldata(data: string): { kind: ApprovalKind; spender: string } | undefined {
  const d = (data ?? '').toLowerCase()
  if (d.length < 138) return undefined
  const spender = '0x' + d.slice(34, 74)
  const arg = BigInt('0x' + d.slice(74, 138))
  if (d.startsWith('0x095ea7b3') && arg > 0n) return { kind: 'erc20', spender }
  if (d.startsWith('0xa22cb465') && arg > 0n) return { kind: 'operator', spender }
  return undefined
}

/** Base units → decimal string with at most 4 fraction digits ("1.5", "0.0001", "<0.0001"). */
export function formatUnits(amount: bigint, decimals: number): string {
  if (decimals <= 0) return amount.toString()
  const base = 10n ** BigInt(decimals)
  const whole = amount / base
  const frac = (amount % base).toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '')
  if (whole === 0n && !frac && amount > 0n) return '<0.0001'
  return `${whole.toLocaleString('en-US')}${frac ? '.' + frac : ''}`
}
