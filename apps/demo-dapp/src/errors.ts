/** Pull QoreConnect's typed refusal (code, chain code, tx hash) out of a wagmi/viem error chain. */
export function refusalOf(e: unknown): { code?: string; chainCode?: number; txHash?: string; message: string; rejected: boolean } {
  let cur: any = e
  let code: string | undefined
  let chainCode: number | undefined
  let txHash: string | undefined
  let rejected = false
  for (let i = 0; cur && i < 8; i++) {
    const q = cur?.data?.qoreconnect ?? cur?.qoreconnect
    if (q) {
      code ??= q.code
      chainCode ??= q.chainCode
      txHash ??= q.txHash
    }
    if (cur?.code === 4001 || cur?.name === 'UserRejectedRequestError') rejected = true
    cur = cur.cause
  }
  const first = String((e as any)?.shortMessage ?? (e as any)?.message ?? e).split('\n')[0]!
  return { code, chainCode, txHash, rejected, message: first }
}
