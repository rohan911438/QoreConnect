import { describe, expect, it } from 'vitest'
import { PACKAGE } from '../src/index'
describe('relayer', () => { it('loads', () => { expect(PACKAGE).toBe('@qoreconnect/relayer') }) })
