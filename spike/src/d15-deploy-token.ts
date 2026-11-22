// P15: deploy the testnet-only QoreConnect Test Token (QCT) used by the approval scanner demo and tests.
// Usage: (cd contracts && forge build) && (cd spike && pnpm q src/d15-deploy-token.ts)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openEvmWindowMsg } from '@qorechain/sdk'
import { qorechainTestnet } from '@qorechain/evm'
import { createWalletClient, createPublicClient, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { operator, EVM_RPC, log, sendTx, brief } from './common.js'

const here = dirname(fileURLToPath(import.meta.url))
const j = JSON.parse(readFileSync(join(here, '..', '..', 'contracts', 'out', 'TestToken.sol', 'TestToken.json'), 'utf8'))

const op = await operator(0)
const r = await sendTx(op, [openEvmWindowMsg({ sender: op.cosmos, blocks: 500, maxTxs: 2, maxValue: '5000000' })], 300_000)
log('open window tx', brief(r))
await new Promise((res) => setTimeout(res, 10_000))

const account = privateKeyToAccount(op.privateKey as Hex)
const chain = { ...qorechainTestnet, rpcUrls: { default: { http: [EVM_RPC] } } } as any
const wallet = createWalletClient({ account, chain, transport: http(EVM_RPC) })
const pub = createPublicClient({ chain, transport: http(EVM_RPC) })
const hash = await wallet.deployContract({ abi: j.abi, bytecode: j.bytecode.object as Hex, args: [] })
const rc = await pub.waitForTransactionReceipt({ hash })
if (rc.status !== 'success' || !rc.contractAddress) throw new Error(`deploy failed: ${hash}`)
const code = await pub.getCode({ address: rc.contractAddress })
const symbol = await pub.readContract({ address: rc.contractAddress, abi: j.abi, functionName: 'symbol' })
const out = { address: rc.contractAddress.toLowerCase(), tx: hash, block: Number(rc.blockNumber), codeBytes: code ? (code.length - 2) / 2 : 0, symbol }
log('deployed TestToken', out)

const file = join(here, '..', '..', 'apps', 'demo-dapp', 'src', 'deployments.json')
const d = JSON.parse(readFileSync(file, 'utf8'))
d.contracts.TestToken = out
writeFileSync(file, JSON.stringify(d, null, 2) + '\n')
log('wrote', file)
