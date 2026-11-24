/**
 * Tools come ONLY from the root-signed instruction: one tool per allowed contract function. The model can never
 * name a contract or function the owner did not sign for.
 */
import { encodeFunctionData, parseAbiItem, parseEther, type AbiFunction, type Hex } from 'viem'
import type { AgentCall, AgentInstruction } from '@rohankumar4179/core'

export interface ToolSpec {
  name: string
  description: string
  call: AgentCall
  fn: AbiFunction
  input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false }
}

export interface PlannedCall {
  /** Tool name, or "raw" when a (compromised) planner proposes an arbitrary call. */
  tool: string
  to: string
  data: Hex
  valueWei: bigint
  summary: string
}

function schemaFor(type: string): Record<string, unknown> {
  if (type === 'address') return { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', description: '0x address' }
  if (type === 'bool') return { type: 'boolean' }
  if (/^u?int\d*$/.test(type)) return { type: 'string', pattern: '^[0-9]+$', description: `${type} as a decimal string` }
  if (/^bytes\d*$/.test(type)) return { type: 'string', pattern: '^0x[0-9a-fA-F]*$' }
  return { type: 'string' }
}

export function toolsFor(i: AgentInstruction): ToolSpec[] {
  return i.calls.map((call, idx) => {
    const fn = parseAbiItem(call.signature.startsWith('function') ? call.signature : `function ${call.signature}`) as AbiFunction
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    fn.inputs.forEach((p, n) => {
      const key = p.name || `arg${n}`
      properties[key] = schemaFor(p.type)
      required.push(key)
    })
    if (fn.stateMutability === 'payable') {
      properties.value_qor = { type: 'string', pattern: '^[0-9]+(\\.[0-9]{1,18})?$', description: 'QOR to send with the call, e.g. "0.1"' }
      required.push('value_qor')
    }
    return {
      name: `${fn.name}_${idx}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
      description: `${call.description ?? `Call ${fn.name} on ${call.to}`}. Signature: ${call.signature}. Contract ${call.to}.`,
      call,
      fn,
      input_schema: { type: 'object', properties, required, additionalProperties: false },
    }
  })
}

/** Turn a tool call into calldata + value. Throws on bad input (returned to the model as a tool error). */
export function encodeToolCall(tool: ToolSpec, input: Record<string, unknown>): PlannedCall {
  const args = tool.fn.inputs.map((p, n) => {
    const v = input[p.name || `arg${n}`]
    if (v === undefined) throw new Error(`missing argument ${p.name || n}`)
    if (/^u?int\d*$/.test(p.type)) return BigInt(String(v))
    return v
  })
  const data = encodeFunctionData({ abi: [tool.fn], functionName: tool.fn.name, args })
  const valueWei = tool.fn.stateMutability === 'payable' ? parseEther(String(input.value_qor ?? '0')) : 0n
  return { tool: tool.name, to: tool.call.to, data, valueWei, summary: `${tool.fn.name}(${args.map(String).join(', ')})${valueWei ? ` with ${input.value_qor} QOR` : ''}` }
}
