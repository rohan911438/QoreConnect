import { parseEther } from 'viem'
import { useAccount, useWriteContract } from 'wagmi'
import { DRAINER, EXPLORER, drainerAbi, short } from './contracts'
import { refusalOf } from './errors'

/** Recorded with `pnpm demo:attack` on Diana (P10 G4): the attacker's own relayer broadcast the stolen-key call. */
const EVIDENCE = {
  tx: '125E638C8670B49394EDF8F10BCE9DAC7C993A508D57833F9EAFC8B179B5EFF6',
  reason: 'authenticator not permitted for this action (contract not in allowed_evm_calls)',
}

export function AttackDemo() {
  const { isConnected } = useAccount()
  const { writeContract, isPending, error, reset } = useWriteContract()
  const r = error ? refusalOf(error) : undefined

  const claim = () => {
    reset()
    writeContract({ address: DRAINER, abi: drainerAbi, functionName: 'claimAirdrop', value: parseEther('2') })
  }

  return (
    <>
      <p className="banner warn" role="note">
        <strong>Attack demonstration.</strong> The card below imitates a phishing page. It calls a Drainer contract that forwards everything to an
        attacker. Diana testnet only.
      </p>
      <section className="grid">
        <div className="card phish" aria-labelledby="airdrop">
          <span className="pill bad">Fake</span>
          <h2 id="airdrop">Claim your 500 QAI airdrop</h2>
          <p className="muted">"Verify your wallet by sending 2 QOR. It is returned with your airdrop." This is what a drainer page looks like.</p>
          {isConnected ? (
            <button className="btn danger wide" onClick={claim} disabled={isPending} data-testid="claim">
              {isPending ? 'Waiting…' : 'Claim airdrop (send 2 QOR)'}
            </button>
          ) : (
            <p className="banner">Connect first to try it with your own account.</p>
          )}
          {r && (
            <div className={`banner ${r.rejected ? '' : 'ok'}`} role="status" data-testid="attack-result">
              {r.rejected ? (
                <>You closed the preview. Nothing was signed.</>
              ) : (
                <>
                  <strong>Refused{r.chainCode ? ` (chain code ${r.chainCode})` : ''}.</strong> {r.code === 'NOT_APPROVED' ? 'This contract is not approved for your account.' : r.message}
                  {r.txHash && (
                    <>
                      {' '}
                      <a className="mono" href={`${EXPLORER}/tx/${r.txHash}`} target="_blank" rel="noreferrer">
                        {short(r.txHash, 10)}
                      </a>
                    </>
                  )}
                </>
              )}
            </div>
          )}
          <p className="muted small mono">Drainer {short(DRAINER, 8)}</p>
        </div>

        <div className="card" aria-labelledby="why">
          <h2 id="why">What protects you</h2>
          <ol className="steps">
            <li>
              <strong>Before you sign:</strong> the preview says <em>Blocked by chain</em> and explains why: the contract is not on your allow-list and 2 QOR is over
              your 1 QOR per-transaction limit. MetaMask is never opened.
            </li>
            <li>
              <strong>If the MetaMask key is stolen:</strong> the attacker can sign, and can even run their own relayer. The chain still refuses, because
              your quantum-safe root set the rules.
            </li>
            <li>
              <strong>On Q-Day:</strong> one tap on the kill switch revokes every classical key. Only the quantum-safe root can act.
            </li>
          </ol>
          <h3>Recorded on Diana</h3>
          <p className="small">
            Stolen key + attacker's own relayer, broadcast straight to the chain:
            <br />
            <a className="mono" href={`${EXPLORER}/tx/${EVIDENCE.tx}`} target="_blank" rel="noreferrer">
              {short(EVIDENCE.tx, 12)}
            </a>{' '}
            refused with code 10: {EVIDENCE.reason}.
          </p>
          <p className="muted small">
            Reproduce: <code>pnpm demo:attack</code>
          </p>
        </div>
      </section>
    </>
  )
}
