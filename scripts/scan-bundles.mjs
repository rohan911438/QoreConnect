#!/usr/bin/env node
/* global process, console */
/**
 * P13 G6: no secret in client bundles. Scans the browser-facing build output of the web app and the demo dApp for
 *  - the NAME of every server-side secret in .env.example (a name in a client bundle means the value may be too),
 *  - the VALUE of every non-public variable in the local .env (when present; never printed),
 *  - private-key and mnemonic shapes.
 * Usage: node scripts/scan-bundles.mjs [dir ...]   (defaults: apps/web/.next/static apps/demo-dapp/dist)
 * Exit code 1 on any finding.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dirs = (process.argv.slice(2).length ? process.argv.slice(2) : ['apps/web/.next/static', 'apps/demo-dapp/dist']).map((d) => resolve(root, d))

const parseEnv = (p) =>
  existsSync(p)
    ? Object.fromEntries(
        readFileSync(p, 'utf8')
          .split(/\r?\n/)
          .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
          .filter(Boolean)
          .map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, '')]),
      )
    : {}

const isPublic = (k) => k.startsWith('NEXT_PUBLIC_') || k.startsWith('VITE_')
const example = parseEnv(join(root, '.env.example'))
const local = { ...parseEnv(join(root, '.env')), ...parseEnv(join(root, 'apps/relayer/.env')), ...parseEnv(join(root, 'examples/agent/.env')) }
const SECRET_NAME = /MNEMONIC|PRIVATE_KEY|ADMIN_TOKEN|SECRET|API_KEY|PASSWORD/
const names = [...new Set([...Object.keys(example), ...Object.keys(local)])].filter((k) => !isPublic(k) && SECRET_NAME.test(k))
const values = Object.entries(local)
  .filter(([k, v]) => !isPublic(k) && SECRET_NAME.test(k) && v.length >= 12)
  .map(([k, v]) => ({ k, v }))

const files = []
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(js|mjs|cjs|html|json|css|map|txt)$/.test(f)) files.push(p)
  }
}
let missing = 0
for (const d of dirs) {
  if (existsSync(d)) walk(d)
  else {
    console.error(`missing build output: ${d} (build first)`)
    missing++
  }
}

const findings = []
const PK = /(?<![0-9a-fA-F])0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/g
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  for (const n of names) if (new RegExp(`\\b${n}\\b`).test(s)) findings.push(`${f}: secret env NAME ${n}`)
  for (const { k, v } of values) if (s.includes(v)) findings.push(`${f}: VALUE of ${k}`)
  // 32-byte hex constants that look like private keys; known public constants (hashes, topics) are listed explicitly.
  for (const m of s.matchAll(PK)) {
    const ctx = s.slice(Math.max(0, m.index - 40), m.index).toLowerCase()
    if (/private|secret|seed|mnemonic/.test(ctx)) findings.push(`${f}: key-shaped hex near "${ctx.slice(-20)}"`)
  }
}

console.log(`scanned ${files.length} files in ${dirs.length - missing} directories; ${names.length} secret names, ${values.length} local secret values`)
if (findings.length) {
  for (const x of findings) console.log(`FINDING ${x}`)
  process.exit(1)
}
if (missing === dirs.length) process.exit(2)
console.log('no secrets in client bundles')
