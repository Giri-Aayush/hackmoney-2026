# OptiChannel Smart Contracts

Settlement contracts for OptiChannel - gasless options trading via Yellow Network state channels.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    OptiChannelSettlement.sol                     │
├─────────────────────────────────────────────────────────────────┤
│  DEPOSITS/WITHDRAWALS                                           │
│  ├── deposit(amount)           - Deposit USDC                   │
│  ├── withdraw(amount, sig)     - Withdraw with signature        │
│  └── withdrawDirect(amount)    - Simple withdrawal              │
├─────────────────────────────────────────────────────────────────┤
│  OPTIONS LIFECYCLE                                              │
│  ├── createOption(...)         - Writer lists option            │
│  ├── purchaseOption(id)        - Buyer purchases                │
│  ├── exerciseOption(id, pyth)  - Exercise at expiry             │
│  ├── finalizeSettlement(id)    - Finalize after challenge       │
│  ├── disputeSettlement(id)     - Dispute with new price         │
│  ├── expireOption(id)          - Mark as expired worthless      │
│  └── cancelOption(id)          - Cancel unsold option           │
├─────────────────────────────────────────────────────────────────┤
│  STATE CHANNELS (Yellow Network)                                │
│  ├── openChannel(partyB, ...)  - Open channel between parties   │
│  ├── updateChannelState(...)   - Submit signed state update     │
│  ├── challengeChannel(id)      - Start dispute                  │
│  └── finalizeChannel(id)       - Finalize after challenge       │
└─────────────────────────────────────────────────────────────────┘
```

## Dependencies

- OpenZeppelin Contracts v5.0
- Pyth SDK Solidity

## Setup

### Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Install Dependencies

```bash
forge install OpenZeppelin/openzeppelin-contracts
forge install pyth-network/pyth-sdk-solidity
forge install foundry-rs/forge-std
```

### Build

```bash
forge build
```

### Test

```bash
forge test
```

## Deployment

### Environment Variables

Create `.env` file:

```bash
PRIVATE_KEY=your_private_key_here
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### Deploy to Ethereum Sepolia (Testnet)

```bash
source .env
forge script script/Deploy.s.sol:DeployOptiChannelSepolia \
  --rpc-url sepolia \
  --broadcast \
  --verify
```

### Deploy to Ethereum Mainnet

```bash
source .env
forge script script/Deploy.s.sol:DeployOptiChannelMainnet \
  --rpc-url mainnet \
  --broadcast \
  --verify
```

## Contract Addresses

### Ethereum Sepolia (Testnet)

| Contract | Address |
|----------|---------|
| OptiChannelSettlement | `0x7779c5E338e52Be395A2A5386f8CFBf6629f67CB` |
| USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Pyth Oracle | `0xDd24F84d36BF92C65F92307595335bdFab5Bbd21` |

### Ethereum Mainnet

| Contract | Address |
|----------|---------|
| OptiChannelSettlement | `TBD - Deploy` |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Pyth Oracle | `0x4305FB66699C3B2702D4d05CF36551390A4c69C6` |

## Key Features

### 1. Option Settlement with Pyth Oracle

Options are settled using real-time ETH/USD prices from Pyth Network:

```solidity
function exerciseOption(bytes32 optionId, bytes[] calldata pythPriceUpdate) external payable
```

### 2. Challenge Period (Dispute Resolution)

All settlements have a 24-hour challenge period:

1. Holder exercises option → settlement initiated
2. 24-hour challenge period starts
3. Either party can dispute with new price data
4. After challenge period → settlement finalized

### 3. State Channel Integration

For Yellow Network integration:

1. Open channel between writer and holder
2. Trade options off-chain via Yellow ClearNode
3. Submit final state when closing channel
4. Challenge period for disputes

### 4. Collateral Management

- **Calls**: Writer collateral = `amount × strikePrice`
- **Puts**: Writer collateral = `amount × strikePrice`
- Collateral locked on option creation
- Released on exercise, expiry, or cancellation

## Gas Estimates

| Function | Gas (approx) |
|----------|--------------|
| deposit | ~50,000 |
| createOption | ~150,000 |
| purchaseOption | ~100,000 |
| exerciseOption | ~200,000 |
| finalizeSettlement | ~80,000 |

## Security Considerations

1. **Reentrancy**: All state-changing functions use `nonReentrant`
2. **Signatures**: ECDSA verification for withdrawals and state updates
3. **Price Staleness**: Pyth prices rejected if older than 5 minutes
4. **Challenge Period**: 24-hour window for dispute resolution

## License

MIT
