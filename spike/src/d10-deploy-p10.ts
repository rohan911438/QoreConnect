// P10: deploy QoreTipJar, Drainer and QoreConnectGuard to Diana from the operator key (scoped EVM window), verify with eth_getCode.
// Usage: (cd contracts && forge build) && (cd spike && pnpm q src/d10-deploy-p10.ts)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openEvmWindowMsg, fetchEvmWindow, deriveUnifiedAccount } from '@qorechain/sdk'
import { qorechainTestnet } from '@qorechain/evm'
import { createWalletClient, createPublicClient, http, parseEther, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { operator, REST, EVM_RPC, log, sendTx, brief } from './common.js'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', '..', 'contracts', 'out')
const artifact = (file: string, name: string) => {
  const j = JSON.parse(readFileSync(join(out, file, `${name}.json`), 'utf8'))
  return { abi: j.abi, bytecode: j.bytecode.object as Hex }
}

const op = await operator(0)
// Attacker for the demo Drainer: a throwaway testnet address derived from the operator phrase (index 7).
const attacker = (await deriveUnifiedAccount(process.env.OPERATOR_MNEMONIC!, 7)).evm as Hex
// Guard owner: the spike user root (a registered ML-DSA-87 account) unless GUARD_OWNER is set.
const guardOwner = (process.env.GUARD_OWNER ?? '0x789F00F2F6705ed10DF035477fc72d3C4470E4E4') as Hex

let win = await fetchEvmWindow({ rest: REST, address: op.cosmos })
log('window before', win)
const r = await sendTx(op, [openEvmWindowMsg({ sender: op.cosmos, blocks: 2000, maxTxs: 10, maxValue: '20000000' })], 300_000)
log('open window tx', brief(r))
await new Promise((res) => setTimeout(res, 10_000))
win = await fetchEvmWindow({ rest: REST, address: op.cosmos })
log('window after', win)

const account = privateKeyToAccount(op.privateKey as Hex)
const chain = { ...qorechainTestnet, rpcUrls: { default: { http: [EVM_RPC] } } } as any
const wallet = createWalletClient({ account, chain, transport: http(EVM_RPC) })
const pub = createPublicClient({ chain, transport: http(EVM_RPC) })

const plan = [
  { key: 'QoreTipJar', file: 'QoreTipJar.sol', name: 'QoreTipJar', args: [] as unknown[] },
  { key: 'Drainer', file: 'Drainer.sol', name: 'Drainer', args: [attacker] },
  { key: 'QoreConnectGuard', file: 'QoreConnectGuard.sol', name: 'QoreConnectGuard', args: [guardOwner, parseEther('1')] },
]
const deployed: Record<string, { address: string; tx: string; codeBytes: number }> = {}
for (const p of plan) {
  const { abi, bytecode } = artifact(p.file, p.name)
  const hash = await wallet.deployContract({ abi, bytecode, args: p.args as any })
  const rc = await pub.waitForTransactionReceipt({ hash })
  if (rc.status !== 'success' || !rc.contractAddress) throw new Error(`${p.key} deploy failed: ${hash}`)
  const code = await pub.getCode({ address: rc.contractAddress })
  const codeBytes = code ? (code.length - 2) / 2 : 0
  if (!codeBytes) throw new Error(`${p.key}: eth_getCode is empty at ${rc.contractAddress}`)
  deployed[p.key] = { address: rc.contractAddress.toLowerCase(), tx: hash, codeBytes }
  log(`deployed ${p.key}`, deployed[p.key])
}

const file = join(here, '..', '..', 'apps', 'demo-dapp', 'src', 'deployments.json')
mkdirSync(dirname(file), { recursive: true })
writeFileSync(
  file,
  JSON.stringify(
    {
      network: 'qorechain-diana',
      chainId: 9800,
      deployedAt: new Date().toISOString(),
      deployer: account.address,
      attacker,
      guardOwner,
      contracts: deployed,
    },
    null,
    2,
  ) + '\n',
)
log('wrote', file)
