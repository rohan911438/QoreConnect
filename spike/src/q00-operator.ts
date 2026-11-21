import { operator, balance, pqc, log, REST } from './common.js'
for (const i of [0, 1]) {
  const op = await operator(i)
  log(`index ${i} cosmos`, op.cosmos)
  log(`index ${i} evm`, op.evm)
  log('balance', await balance(op.cosmos))
  try { log('pqc', await pqc(op.cosmos)) } catch (e: any) { log('pqc error', e.message) }
}
const feat = await fetch(`${REST}/qorechain/pqc/v1/protocol_features`).then(r => r.json()).catch(e => e.message)
log('protocol_features', feat)
const aa = await fetch(`${REST}/qorechain/abstractaccount/v1/config`).then(r => r.json()).catch(e => e.message)
log('aa config', aa)
