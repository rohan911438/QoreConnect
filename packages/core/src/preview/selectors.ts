/**
 * Offline function-signature list (fallback when no ABI is configured and 4byte.directory is unreachable).
 * selector → canonical signature. Selectors are keccak256(signature)[0..4]; verified by unit test.
 */
export const KNOWN_SIGNATURES: Record<string, string> = {
  '0xa9059cbb': 'transfer(address,uint256)',
  '0x095ea7b3': 'approve(address,uint256)',
  '0x23b872dd': 'transferFrom(address,address,uint256)',
  '0x40c10f19': 'mint(address,uint256)',
  '0x42966c68': 'burn(uint256)',
  '0xd0e30db0': 'deposit()',
  '0x2e1a7d4d': 'withdraw(uint256)',
  '0x3ccfd60b': 'withdraw()',
  '0xa22cb465': 'setApprovalForAll(address,bool)',
  '0x42842e0e': 'safeTransferFrom(address,address,uint256)',
  '0xb88d4fde': 'safeTransferFrom(address,address,uint256,bytes)',
  '0xac9650d8': 'multicall(bytes[])',
  '0xd09de08a': 'increment()',
  '0x2755cd2d': 'tip()',
  '0x6a627842': 'mint(address)',
  '0x1249c58b': 'mint()',
  '0xa0712d68': 'mint(uint256)',
  '0x8da5cb5b': 'owner()',
  '0xf2fde38b': 'transferOwnership(address)',
  '0x715018a6': 'renounceOwnership()',
  '0xe2bbb158': 'deposit(uint256,uint256)',
  '0xb6b55f25': 'deposit(uint256)',
  '0x7ff36ab5': 'swapExactETHForTokens(uint256,address[],address,uint256)',
  '0x38ed1739': 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
}
