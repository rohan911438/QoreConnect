// SpikeCounter deployed on Diana in P01 (replaced by the Tip Jar contracts in P10).
export const COUNTER = '0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74' as const
export const counterAbi = [
  { type: 'function', name: 'increment', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'count', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const
