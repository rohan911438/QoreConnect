import { describe, expect, it } from 'vitest'
import { PACKAGE } from '../src/index'
describe('react', () => {
  it('loads', () => {
    expect(PACKAGE).toBe('@qoreconnect/react')
  })
})
