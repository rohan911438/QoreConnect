import { describe, expect, it } from 'vitest'
import { isProxyPathAllowed } from '../src/index'

describe('REST proxy allow-list', () => {
  it('allows read paths the client needs', () => {
    expect(isProxyPathAllowed('/qorechain/pqc/v1/account/qor1abc')).toBe(true)
    expect(isProxyPathAllowed('/cosmos/bank/v1beta1/balances/qor1abc/by_denom')).toBe(true)
    expect(isProxyPathAllowed('/qorechain/abstractaccount/v1/accounts/qor1abc/authenticators')).toBe(true)
  })
  it('blocks everything else', () => {
    expect(isProxyPathAllowed('/cosmos/gov/v1/proposals')).toBe(false)
    expect(isProxyPathAllowed('/qorechain/pqc/v1/account/../../x')).toBe(false)
    expect(isProxyPathAllowed('/cosmos/tx/v1beta1/txs', 'GET')).toBe(false)
    expect(isProxyPathAllowed('/cosmos/tx/v1beta1/txs', 'POST')).toBe(true)
    expect(isProxyPathAllowed('/cosmos/bank/v1beta1/balances/x', 'POST')).toBe(false)
  })
})
