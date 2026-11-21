// Step 1: operator verifies its PQC key, opens a scoped EVM window, deploys two SpikeCounter contracts.
import { openEvmWindowMsg, fetchEvmWindow } from '@qorechain/sdk'
import { qorechainTestnet } from '@qorechain/evm'
import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { operator, REST, EVM_RPC, log, pqc, sendTx, brief } from './common.js'
import { compile } from './compile.js'
import { save } from './state.js'

const op = await operator(0)

const reg = await pqc(op.cosmos)
log("operator pqc registered", { registered: reg.registered, possessionProven: (reg as any).possessionProven })

let win = await fetchEvmWindow({ rest: REST, address: op.cosmos })
log('window before', win)
const t0 = Date.now()
const r = await sendTx(op, [openEvmWindowMsg({ sender: op.cosmos, blocks: 2000, maxTxs: 10, maxValue: '20000000' })], 300_000)
log("open window tx", brief(r))
await new Promise(res => setTimeout(res, 10_000))
win = await fetchEvmWindow({ rest: REST, address: op.cosmos })
log('window after', win)

const { abi, bytecode } = compile('contracts/SpikeCounter.sol', 'SpikeCounter')
const account = privateKeyToAccount(op.privateKey as `0x${string}`)
const chain = { ...qorechainTestnet, rpcUrls: { default: { http: [EVM_RPC] } } } as any
const wallet = createWalletClient({ account, chain, transport: http(EVM_RPC) })
const pub = createPublicClient({ chain, transport: http(EVM_RPC) })
const out: Record<string, string> = {}
for (const name of ['allowed', 'other']) {
  const hash = await wallet.deployContract({ abi, bytecode })
  const rc = await pub.waitForTransactionReceipt({ hash })
  log(`deploy ${name}`, { hash, address: rc.contractAddress, status: rc.status, gasUsed: rc.gasUsed })
  out[name] = rc.contractAddress!
}
save({ counterAllowed: out.allowed, counterOther: out.other, abi })
