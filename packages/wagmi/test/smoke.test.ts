import { describe, expect, it } from 'vitest'
import { PACKAGE } from '../src/index'
describe('wagmi', () => { it('loads', () => { expect(PACKAGE).toBe('@rohankumar4179/wagmi') }) })
