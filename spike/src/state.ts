import { readFileSync, writeFileSync, existsSync } from 'node:fs'
const F = 'results/state.json'
export function load(): Record<string, any> { return existsSync(F) ? JSON.parse(readFileSync(F, 'utf8')) : {} }
export function save(patch: Record<string, any>) { const s = { ...load(), ...patch }; writeFileSync(F, JSON.stringify(s, null, 2)); return s }
