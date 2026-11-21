# QoreConnect contracts (Foundry)

Demo contracts used by the QoreConnect demo dApp and attack demo (see `prompts/P10`).

## Setup

```bash
# Foundry: https://book.getfoundry.sh/getting-started/installation
# Windows: download foundry_stable_win32_amd64.zip from the foundry-rs/foundry "stable" release
forge install foundry-rs/forge-std --no-git   # lib/ is not committed
forge test -vv
```

Network: Diana testnet, EVM chain id 9800, RPC `https://evm-testnet.qore.host`. `evm_version = paris` (verified in P01).
