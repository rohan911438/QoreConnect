import solc from 'solc'
import { readFileSync } from 'node:fs'

export function compile(file: string, name: string): { abi: any[]; bytecode: `0x${string}` } {
  const input = {
    language: 'Solidity',
    sources: { [file]: { content: readFileSync(file, 'utf8') } },
    settings: { evmVersion: 'paris', optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
  }
  const out = JSON.parse(solc.compile(JSON.stringify(input)))
  const errs = (out.errors ?? []).filter((e: any) => e.severity === 'error')
  if (errs.length) throw new Error(errs.map((e: any) => e.formattedMessage).join('\n'))
  const c = out.contracts[file][name]
  return { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` }
}
