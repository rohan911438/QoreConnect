// A stand-in for MetaMask: an EIP-1193 provider whose personal_sign is exactly MetaMask's (EIP-191) signature.
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export function standInMetaMask(file = 'results/.metamask-secret.json') {
  const pk = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).pk : generatePrivateKey()
  if (!existsSync(file)) writeFileSync(file, JSON.stringify({ pk }))
  const acct = privateKeyToAccount(pk)
  const provider = {
    async request({ method, params }: { method: string; params: unknown[] }): Promise<string> {
      if (method === 'personal_sign') {
        const [data] = params as [string, string]
        const msg = typeof data === 'string' && data.startsWith('0x') ? { raw: data as `0x${string}` } : (data as string)
        return acct.signMessage({ message: msg as any })
      }
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return acct.address as any
      throw new Error('stand-in MetaMask: unsupported ' + method)
    },
  }
  return { address: acct.address, pk, provider }
}
