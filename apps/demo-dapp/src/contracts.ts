import deployments from './deployments.json'

/** Contracts deployed on Diana testnet in P10 (see contracts/ and docs/testnet-evidence.md). */
export const TIPJAR = deployments.contracts.QoreTipJar.address as `0x${string}`
export const DRAINER = deployments.contracts.Drainer.address as `0x${string}`
export const EXPLORER = 'https://explore.qore.network'

export const tipJarAbi = [
  {
    type: 'function',
    name: 'tip',
    stateMutability: 'payable',
    inputs: [
      { name: 'creator', type: 'address' },
      { name: 'note', type: 'string' },
    ],
    outputs: [],
  },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalReceived', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'tipCount', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalTipped', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'event',
    name: 'Tipped',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'note', type: 'string', indexed: false },
    ],
  },
] as const

export const drainerAbi = [{ type: 'function', name: 'claimAirdrop', stateMutability: 'payable', inputs: [], outputs: [] }] as const

/** Demo creators. Addresses are testnet-only. */
export const CREATORS = [
  { id: 'lattice', name: 'Lattice Lab', handle: 'lattice.qor', blurb: 'Explainers on post-quantum signatures, one diagram at a time.', address: deployments.deployer as `0x${string}`, hue: 262 },
  { id: 'nodeops', name: 'Diana Node Ops', handle: 'nodeops.qor', blurb: 'Keeps a public Diana RPC up for everyone building this month.', address: '0x8d5a0b6c0bd7b07c74b6f1f7cd5c3e1d6b3f8a21' as `0x${string}`, hue: 168 },
  { id: 'campus', name: 'Quantum Campus Club', handle: 'campus.qor', blurb: 'Student workshops: build your first QoreChain dApp in an afternoon.', address: '0x3c7f1b2e9a4d6c8e0f2a4b6d8c0e2f4a6b8d0c2e' as `0x${string}`, hue: 24 },
] as const

export const short = (a?: string, n = 6) => (a ? `${a.slice(0, n)}…${a.slice(-4)}` : '')
