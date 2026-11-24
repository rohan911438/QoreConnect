import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { CodeWindow, CopyCommand, Recipes, type Recipe } from '../../components/dev/DevCode'

export const metadata: Metadata = {
  title: 'Developers · QoreConnect',
  description:
    'Four npm packages that give every MetaMask user a post-quantum account on QoreChain: a wagmi connector, React UI, the core engine and a self-hostable relayer.',
}

const REPO = 'https://github.com/rohan911438/QoreConnect'
const NPM = 'https://www.npmjs.com/package/'
const SCOPE = '@rohankumar4179'

interface Pkg {
  name: string
  role: string
  tagline: string
  body: string
  gives: string[]
  exports: string[]
  size: string
  needs: string
  start?: boolean
  icon: ReactNode
}

const svg = (d: string) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const PACKAGES: Pkg[] = [
  {
    name: 'wagmi',
    role: 'Connector',
    start: true,
    tagline: 'Add QoreConnect to an existing dApp.',
    body: 'A wagmi connector and transport. MetaMask users get a quantum-safe QoreChain account; your hooks do not change.',
    gives: ['9-line integration', 'useWriteContract and receipts work as before', 'Listed in EIP-6963 wallet pickers'],
    exports: ['qoreConnect', 'qoreTransport', 'qorechainDiana'],
    size: '12.4 kB',
    needs: 'wagmi v2 · viem',
    icon: svg('M9 7V4M15 7V4M7 7h10v4a5 5 0 0 1-10 0zM12 16v4'),
  },
  {
    name: 'react',
    role: 'Interface',
    start: true,
    tagline: 'The screens users trust.',
    body: 'Onboarding, the signing preview, contract approval and unlock, as React components. One provider, no CSS to import.',
    gives: ['~20 s onboarding with a passkey', 'Decoded, simulated preview before MetaMask', 'Honesty labels on every signature'],
    exports: ['createQoreConnectUI', 'QoreConnectProvider', 'SigningPreview', 'OnboardingModal', 'ApproveSheet'],
    size: '67.8 kB',
    needs: 'React 18+',
    icon: svg('M4 5h16v14H4zM4 9h16M8 13h5M8 16h8'),
  },
  {
    name: 'core',
    role: 'Engine',
    tagline: 'Keys, limits and the provider.',
    body: 'The post-quantum root vault, session keys with chain-enforced limits, the EIP-1193 provider, previews and agents.',
    gives: ['ML-DSA-87 root, passkey-encrypted', 'Per-tx, daily and allow-list limits', 'Q-Day kill switch in one transaction'],
    exports: ['RootVault', 'onboardAndLink', 'QoreConnectProvider', 'buildPreview', 'revokeKeys', 'createAgent'],
    size: '223.8 kB',
    needs: 'Browser or Node',
    icon: svg('M12 3 20 7v5c0 5-3.5 8-8 9.5C7.5 20 4 17 4 12V7zM12 9v3M12 15h.01'),
  },
  {
    name: 'relayer',
    role: 'Backend',
    tagline: 'Pay your users’ gas. Self-hosted.',
    body: 'Relays MetaMask-signed calls, sponsors new accounts, runs gas tanks, and serves the Meter, Doctor and exposure report.',
    gives: ['Non-custodial: only relays what users signed', 'Pre-checks before paying gas', 'Gas tanks with per-user daily caps'],
    exports: ['createRelayerApp', 'RelayService', 'SponsorService', 'RelayerStore', 'MeterIndexer', 'runDoctor'],
    size: '81.5 kB',
    needs: 'Node 22.5+',
    icon: svg('M4 6h16v5H4zM4 13h16v5H4zM8 8.5h.01M8 15.5h.01'),
  },
]

const CHOOSE: { want: string; use: string[] }[] = [
  { want: 'I have a wagmi dApp and want MetaMask users on QoreChain', use: ['wagmi', 'react'] },
  { want: 'I am building a wallet, a dashboard or a non-wagmi app', use: ['core', 'react'] },
  { want: 'I want to pay gas for my users, on my own server', use: ['relayer'] },
  { want: 'I am giving an AI agent a capped budget', use: ['core'] },
]

const COMPARE: { row: string; without: string; diy: string; qc: string }[] = [
  { row: 'MetaMask user can transact on QoreChain', without: 'No: no ML-DSA key', diy: 'After weeks of work', qc: 'Yes' },
  { row: 'Steps for a first transaction', without: 'Not possible', diy: 'Many', qc: '1 passkey tap + 1 signature' },
  { row: 'User needs QOR for gas', without: 'Yes', diy: 'Build a faucet', qc: 'No: sponsored' },
  { row: 'Loss if the MetaMask key leaks', without: 'Everything', diy: 'Depends', qc: 'At most the daily limit' },
  { row: 'Limits enforced by', without: 'Nobody', diy: 'Your code', qc: 'The chain' },
  { row: 'What the user reads before signing', without: 'A hex digest', diy: 'Build it', qc: 'Decoded, simulated preview' },
  { row: 'Q-Day response', without: 'None', diy: 'Build it', qc: 'Revoke all classical keys, 1 tx' },
  { row: 'Integration', without: '–', diy: 'Thousands of lines', qc: '9 lines' },
]

const INSTALL = `npm install ${SCOPE}/wagmi ${SCOPE}/react wagmi@2 viem @tanstack/react-query`

const WAGMI_TS = `import { createConfig } from 'wagmi'
import { qoreConnect, qoreTransport, qorechainDiana } from '${SCOPE}/wagmi'
import { createQoreConnectUI } from '${SCOPE}/react'

export const ui = createQoreConnectUI()

export const config = createConfig({
  chains: [qorechainDiana],
  connectors: [
    qoreConnect({
      appName: 'My dApp',
      contracts: ['0xYourContract'],      // what users approve for your dApp
      relayerUrl: 'https://your-relayer',  // a ${SCOPE}/relayer server
      gasTankId: 'my-dapp',                // pays your users' fees
      ui: ui.hooks,
    }),
  ],
  transports: { [qorechainDiana.id]: qoreTransport() },
})`

const MAIN_TSX = `import { QoreConnectProvider } from '${SCOPE}/react'
import { config, ui } from './wagmi'

<WagmiProvider config={config}>
  <QueryClientProvider client={queryClient}>
    <QoreConnectProvider ui={ui}>
      <App />
    </QoreConnectProvider>
  </QueryClientProvider>
</WagmiProvider>`

const HOOKS_TSX = `// Unchanged wagmi code. QoreConnect adds the preview, the limits and the gas.
const { writeContract, data: hash } = useWriteContract()
const { isSuccess } = useWaitForTransactionReceipt({ hash })

writeContract({ address: TIPJAR, abi, functionName: 'tip', args: [creator, 'gm'], value: parseEther('0.1') })`

const RECIPES: Recipe[] = [
  {
    id: 'onboard',
    label: 'Onboard a user',
    pkg: `${SCOPE}/core`,
    title: 'The whole first run, in one call',
    body: 'Create the root with a passkey, take one MetaMask signature, get the fee sponsored, register the ML-DSA-87 key and link MetaMask with limits. Idempotent: a failed attempt can simply be retried.',
    file: 'onboard.ts',
    code: `import { DIANA, RootVault, WebAuthnPasskeyProvider, onboardAndLink, presetLimits, presetById } from '${SCOPE}/core'

const result = await onboardAndLink({
  net: DIANA,
  vault: new RootVault(),
  protection: { kind: 'passkey', passkey: new WebAuthnPasskeyProvider({ name: 'My dApp' }) },
  metamask: window.ethereum,
  relayerUrl: 'https://your-relayer',
  contracts: ['0xYourContract'],
  limits: presetLimits(presetById('everyday')!),   // 1 QOR per tx, 5 QOR per day
  onEvent: (e) => console.log(e.step),             // creating → signing → sponsoring → registering → linking
})

console.log(result.root.qorAddress, result.ms + ' ms')`,
  },
  {
    id: 'killswitch',
    label: 'Q-Day kill switch',
    pkg: `${SCOPE}/core`,
    title: 'Revoke every classical key at once',
    body: 'One transaction signed by the post-quantum root removes every MetaMask key from the account. Limits and allow-lists are changed the same way.',
    file: 'account.ts',
    code: `import { DIANA, RootVault, getSessionState, setLimits, revokeKeys, parseQor } from '${SCOPE}/core'

const root = await new RootVault().unlock({ kind: 'password', password })
const ctx = { net: DIANA, root }

const state = await getSessionState(ctx, root.qorAddress)    // keys, rules, approved contracts
await setLimits({ ...ctx, limits: { perTxUqor: parseQor('0.5'), dailyUqor: parseQor('2') } })

// Q-Day: only the quantum-safe root can act after this.
await revokeKeys({ ...ctx, keys: 'all-classical' })`,
  },
  {
    id: 'preview',
    label: 'Signing preview',
    pkg: `${SCOPE}/core`,
    title: 'Know the outcome before you sign',
    body: 'Every call is decoded, simulated and checked against the chain’s rules. Calls the chain would refuse never reach MetaMask.',
    file: 'preview.ts',
    code: `import { buildPreview } from '${SCOPE}/core'

const preview = await buildPreview(call, { net: DIANA, rootEvm, rule, approved })

preview.label      // 'Quantum-safe' | 'Classical, capped' | 'Agent, capped' | 'Blocked by chain'
preview.summary    // one plain sentence
preview.checks     // per-tx limit, daily limit, allow-list, expiry
preview.blocked    // the chain would refuse it: do not ask MetaMask
preview.willFail   // the call would revert`,
  },
  {
    id: 'agent',
    label: 'AI agent',
    pkg: `${SCOPE}/core`,
    title: 'Give an agent a budget, not your keys',
    body: 'The agent gets its own funded, capped sub-account and acts only on instructions the root signed with ML-DSA-87. A prompt injection cannot add a call or raise a limit.',
    file: 'agent.ts',
    code: `import { createAgent, verifyInstruction } from '${SCOPE}/core'

// Owner: fund a sub-account and sign the agent's instructions with the post-quantum root.
const agent = await createAgent({
  net: DIANA, root, index: 1,
  name: 'Tipper', task: 'Tip creators I follow, max 0.1 QOR each',
  calls: [{ to: TIPJAR, signature: 'function tip(address creator, string note) payable' }],
  limits: { perTxUqor: 100_000n, dailyUqor: 500_000n },
  fundUqor: 1_000_000n,
  agentProof,
})

// Agent: refuse anything the owner's root did not sign.
const check = verifyInstruction(agent.signed, { rootPublicKey, chainId: DIANA.chainId, agent: me, owner })`,
  },
  {
    id: 'relayer',
    label: 'Run a relayer',
    pkg: `${SCOPE}/relayer`,
    title: 'Your own relayer in one file',
    body: 'A Hono app on Node’s built-in SQLite. It relays only what users signed, inside the limits their root set, and pays gas from your tanks.',
    file: 'server.ts',
    code: `import { serve } from '@hono/node-server'
import { DIANA, QoreClient } from '${SCOPE}/core'
import { RelayerStore, SponsorService, RelayService, ChainRelay, ChainFundsSender,
  DEFAULT_SPONSOR, operatorAccount, ensurePqcRegistered, createRelayerApp } from '${SCOPE}/relayer'

const sponsorAcc = await operatorAccount(process.env.SPONSOR_MNEMONIC, 0)
const relayerAcc = await operatorAccount(process.env.RELAYER_MNEMONIC, 1)
for (const a of [sponsorAcc, relayerAcc]) await ensurePqcRegistered(DIANA, a)

const store = new RelayerStore('./data/relayer.db')
const client = new QoreClient(DIANA)
const sponsor = new SponsorService(DIANA, store, new ChainFundsSender(DIANA, sponsorAcc), DEFAULT_SPONSOR,
  async (root) => (await client.getPqcKey(root)).registered)
const relay = new RelayService(DIANA, store, new ChainRelay(DIANA, relayerAcc))

serve({ fetch: createRelayerApp({ net: DIANA, store, sponsor, relay, adminToken: process.env.ADMIN_TOKEN }).fetch, port: 8787 })`,
  },
  {
    id: 'tank',
    label: 'Fund a gas tank',
    pkg: `${SCOPE}/relayer`,
    title: 'A budget for your dApp’s users',
    body: 'Each dApp gets a tank with a total budget, a per-user daily cap and an optional contract allow-list. Point the connector at it with gasTankId.',
    file: 'seed.ts',
    code: `store.createTank({
  id: 'my-dapp',
  name: 'My dApp',
  owner: 'me',
  balanceUqor: 50_000_000n,          // 50 QOR budget
  perUserDailyCapUqor: 2_000_000n,   // 2 QOR per user per day
  allowedContracts: ['0xYourContract'],
})

// dApp side
qoreConnect({ relayerUrl: 'https://your-relayer', gasTankId: 'my-dapp', /* … */ })`,
  },
]

function Section({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 space-y-10">
      <div className="max-w-3xl space-y-4">
        <p className="qw-eyebrow">{eyebrow}</p>
        <h2 id={`${id}-h`} className="qw-h2">
          {title}
        </h2>
        {intro && <p className="text-lg leading-relaxed text-muted">{intro}</p>}
      </div>
      {children}
    </section>
  )
}

const Ext = ({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) => (
  <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
    {children}
  </a>
)

/** How the four packages fit together: browser on top, your server in the middle, the chain underneath. */
function StackDiagram() {
  const box = 'rounded-2xl border border-line bg-panel px-4 py-3 shadow-[var(--shadow)]'
  const pill = (n: string, accent = false) => (
    <a
      href={`#pkg-${n}`}
      className={`${box} qw-lift block font-mono text-[13px] ${accent ? 'border-[color-mix(in_srgb,var(--accent)_45%,var(--line))]' : ''}`}
    >
      <span className="text-muted">{SCOPE}/</span>
      <span className="font-semibold text-fg">{n}</span>
    </a>
  )
  const Arrow = ({ label }: { label: string }) => (
    <div className="flex items-center justify-center gap-2 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
      <svg aria-hidden="true" width="12" height="22" viewBox="0 0 12 22">
        <path className="qw-flow" d="M6 0v19" stroke="var(--accent)" strokeWidth="1.5" fill="none" />
        <path d="M2 16l4 5 4-5" stroke="var(--accent)" strokeWidth="1.5" fill="none" />
      </svg>
      {label}
    </div>
  )
  return (
    <div className="qw-surface qw-ring p-5 sm:p-8">
      <div className="grid gap-3 sm:grid-cols-[110px_1fr] sm:items-center">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">Browser</p>
        <div className="space-y-3">
          <div className={`${box} flex items-center justify-between text-sm`}>
            <span className="font-medium">Your dApp</span>
            <span className="font-mono text-[11px] text-muted">useWriteContract · useReadContract</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {pill('wagmi', true)}
            {pill('react', true)}
          </div>
          {pill('core')}
        </div>
      </div>
      <Arrow label="MetaMask-signed call" />
      <div className="grid gap-3 sm:grid-cols-[110px_1fr] sm:items-center">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">Your server</p>
        {pill('relayer')}
      </div>
      <Arrow label="hybrid envelope, gas paid" />
      <div className="grid gap-3 sm:grid-cols-[110px_1fr] sm:items-center">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">QoreChain</p>
        <div className={`${box} flex flex-wrap items-center justify-between gap-2 text-sm`}>
          <span className="font-medium">Diana testnet</span>
          <span className="font-mono text-[11px] text-muted">x/pqc · x/abstractaccount · EVM 9800</span>
        </div>
      </div>
    </div>
  )
}

function PackageCard({ p }: { p: Pkg }) {
  const full = `${SCOPE}/${p.name}`
  return (
    <article id={`pkg-${p.name}`} className="qw-surface qw-ring qw-reveal flex scroll-mt-24 flex-col gap-5 p-6 sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-panel-2 text-accent">{p.icon}</span>
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">{p.role}</p>
            <h3 className="font-mono text-[15px] font-semibold">
              <span className="text-muted">{SCOPE}/</span>
              {p.name}
            </h3>
          </div>
        </div>
        {p.start && <span className="qw-chip border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-ok-bg text-ok">Start here</span>}
      </div>
      <div className="space-y-2">
        <p className="font-display text-xl font-semibold tracking-tight">{p.tagline}</p>
        <p className="text-sm leading-relaxed text-muted">{p.body}</p>
      </div>
      <ul className="space-y-2 text-sm">
        {p.gives.map((g) => (
          <li key={g} className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-ok-bg text-[10px] text-ok">✓</span>
            {g}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        {p.exports.map((e) => (
          <code key={e} className="rounded-md border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
            {e}
          </code>
        ))}
      </div>
      <div className="mt-auto space-y-3">
        <CopyCommand command={`npm i ${full}`} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span className="font-mono">
            v0.1.0 · {p.size} · {p.needs}
          </span>
          <span className="flex gap-3">
            <Ext href={`${NPM}${full}`} className="underline-offset-4 hover:text-fg hover:underline">
              npm ↗
            </Ext>
            <Ext href={`${REPO}/tree/main/packages/${p.name}`} className="underline-offset-4 hover:text-fg hover:underline">
              Source ↗
            </Ext>
          </span>
        </div>
      </div>
    </article>
  )
}

const STATS = [
  { v: '9', u: 'lines', l: 'to integrate with wagmi' },
  { v: '1', u: 'signature', l: 'for a new MetaMask user' },
  { v: '0', u: 'QOR', l: 'needed to start: sponsored' },
  { v: '4', u: 'packages', l: 'Apache-2.0, typed, ESM + CJS' },
]

export default function DevelopersPage() {
  return (
    <div className="space-y-28">
      <div className="space-y-10">
        <PageHeader
          eyebrow="Developers · on npm"
          title={
            <>
              Post-quantum accounts for <span className="qw-gradient-text">every EVM dApp.</span>
            </>
          }
          intro={
            <>
              Four packages that let any MetaMask user use your dApp on QoreChain, with an ML-DSA-87 root in control and
              MetaMask capped, scoped and revocable. Your wagmi code stays the same.
            </>
          }
        />
        <div className="qw-rise-2 grid max-w-3xl gap-3">
          <CopyCommand command={INSTALL} className="!py-3.5 !text-[13px]" />
          <div className="flex flex-wrap gap-2">
            <a href="#quickstart" className="qw-btn qw-btn-primary">
              Quick start ↓
            </a>
            <Ext href={`${NPM}${SCOPE}/wagmi`} className="qw-btn">
              View on npm ↗
            </Ext>
            <Ext href={REPO} className="qw-btn">
              GitHub ↗
            </Ext>
            <Ext href="https://qoreconnect-demo.vercel.app" className="qw-btn">
              Live demo dApp ↗
            </Ext>
          </div>
        </div>
        <dl className="qw-rise-3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.l} className="bg-panel p-5">
              <dt className="sr-only">{s.l}</dt>
              <dd>
                <p className="font-display text-4xl font-semibold tracking-[-0.04em] tabular-nums">
                  {s.v}
                  <span className="ml-1.5 text-base text-muted">{s.u}</span>
                </p>
                <p className="mt-1 text-sm text-muted">{s.l}</p>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <Section
        id="stack"
        eyebrow="How it fits"
        title="Four layers. Use one, or all of them."
        intro="The connector and the UI sit on the core engine in the browser. The relayer runs on your server and pays gas. The chain enforces every limit, so none of these layers has to be trusted with your users' funds."
      >
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <StackDiagram />
          <div className="space-y-3">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">Which do I need?</p>
            {CHOOSE.map((c) => (
              <div key={c.want} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-[var(--glass)] p-4">
                <p className="text-sm">{c.want}</p>
                <span className="flex gap-1.5">
                  {c.use.map((u) => (
                    <a key={u} href={`#pkg-${u}`} className="qw-chip border border-line bg-panel font-mono text-fg hover:border-accent">
                      {u}
                    </a>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section id="packages" eyebrow="The packages" title={`${SCOPE}/*`}>
        <div className="grid gap-5 md:grid-cols-2">
          {PACKAGES.map((p) => (
            <PackageCard key={p.name} p={p} />
          ))}
        </div>
      </Section>

      <Section
        id="quickstart"
        eyebrow="Quick start"
        title="From zero to a quantum-rooted dApp."
        intro="Three steps. After them, a MetaMask user who has never touched QoreChain can connect, onboard in about twenty seconds and transact, with no QOR in their wallet."
      >
        <ol className="space-y-12">
          {[
            { n: '01', t: 'Install', d: 'The connector, the UI and wagmi v2.', w: <CodeWindow title="terminal" lang="sh" code={INSTALL} /> },
            { n: '02', t: 'Add the connector', d: 'Point it at your contracts, your relayer and your gas tank.', w: <CodeWindow title="wagmi.ts" code={WAGMI_TS} /> },
            { n: '03', t: 'Render the provider once', d: 'Onboarding, approval and preview screens appear when they are needed.', w: <CodeWindow title="main.tsx" code={MAIN_TSX} /> },
            { n: '✓', t: 'Keep your code', d: 'Every wagmi hook works as before. On chain, msg.sender is the user’s quantum-safe root.', w: <CodeWindow title="TipButton.tsx" code={HOOKS_TSX} /> },
          ].map((s) => (
            <li key={s.n} className="qw-reveal grid gap-5 lg:grid-cols-[280px_1fr]">
              <div className="flex gap-4 lg:block lg:space-y-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-panel font-mono text-sm text-accent shadow-[var(--shadow)]">
                  {s.n}
                </span>
                <div className="space-y-1">
                  <h3 className="font-display text-xl font-semibold tracking-tight">{s.t}</h3>
                  <p className="text-sm text-muted">{s.d}</p>
                </div>
              </div>
              <div className="min-w-0">{s.w}</div>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="recipes"
        eyebrow="Recipes"
        title="Beyond the connector."
        intro="The same packages power wallets, dashboards, agents and your own backend."
      >
        <Recipes recipes={RECIPES} />
      </Section>

      <Section
        id="compare"
        eyebrow="Why QoreConnect"
        title="What you would otherwise build."
        intro="QoreChain only accepts EVM transactions from accounts with a registered post-quantum key, and MetaMask cannot hold one."
      >
        <div className="qw-surface overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
                <th className="p-4 font-medium sm:px-5" scope="col">
                  <span className="sr-only">Capability</span>
                </th>
                <th className="p-4 font-medium" scope="col">MetaMask alone</th>
                <th className="p-4 font-medium" scope="col">Build it yourself</th>
                <th className="p-4 font-medium text-accent" scope="col">QoreConnect</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((r) => (
                <tr key={r.row} className="border-b border-line last:border-0">
                  <th scope="row" className="p-4 font-medium sm:px-5">{r.row}</th>
                  <td className="p-4 text-muted">{r.without}</td>
                  <td className="p-4 text-muted">{r.diy}</td>
                  <td className="bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] p-4 font-medium text-fg">{r.qc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <section aria-labelledby="honest-h" className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="qw-surface p-7">
          <p className="qw-eyebrow">Honest notes</p>
          <h2 id="honest-h" className="mt-3 font-display text-2xl font-semibold tracking-tight">
            What these packages do not claim
          </h2>
          <ul className="mt-5 space-y-3 text-sm text-muted">
            <li>
              <span className="text-fg">Testnet only.</span> QoreChain Diana (EVM 9800); abstract accounts are off on mainnet.
            </li>
            <li>
              <span className="text-fg">MetaMask stays classical.</span> Its key is capped, scoped and revocable, not quantum-safe. The root is.
            </li>
            <li>
              <span className="text-fg">wagmi v2.</span> v3 builds a config with the connector but is not tested end to end yet.
            </li>
            <li>
              <span className="text-fg">Not audited.</span> Use small amounts.{' '}
              <Ext href={`${REPO}/blob/main/docs/security.md`} className="underline underline-offset-4 hover:text-fg">
                Threat model ↗
              </Ext>
            </li>
          </ul>
        </div>
        <div className="qw-surface qw-ring flex flex-col justify-between gap-6 p-7">
          <div className="space-y-3">
            <p className="qw-eyebrow">See it running</p>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Every package is live on Diana right now.</h2>
            <p className="text-sm text-muted">
              The demo dApp uses the connector and the UI, this site uses the core engine, and the public relayer is built on the relayer package.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Ext href="https://qoreconnect-demo.vercel.app" className="qw-btn qw-btn-primary">
              Quantum Tip Jar ↗
            </Ext>
            <Ext href="https://qoreconnect-relayer.onrender.com/health" className="qw-btn">
              Relayer health ↗
            </Ext>
            <Ext href={`${REPO}/blob/main/apps/demo-dapp/src/wagmi.ts`} className="qw-btn">
              The 9 lines ↗
            </Ext>
          </div>
        </div>
      </section>
    </div>
  )
}
