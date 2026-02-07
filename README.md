# Optix

> **ETHGlobal HackMoney 2026 Submission**

A gasless options trading protocol built on Yellow Network state channels for Ethereum. Trade ETH options with zero gas fees using off-chain state channel technology.

## Overview

Optix enables traders to buy and write ETH options without paying gas fees for each trade. By leveraging Yellow Network's state channel infrastructure, all trading activity happens off-chain while maintaining the security guarantees of Ethereum.

### Key Features

- **Gasless Trading**: Execute unlimited trades with zero gas fees
- **Real-Time Pricing**: Live ETH/USD prices from Pyth Network oracle
- **Black-Scholes Pricing**: Theoretical option pricing with full Greeks (Delta, Gamma, Theta, Vega, Rho)
- **Strategy Builder**: Pre-built multi-leg strategies (Bull Call Spread, Bear Put Spread, Straddle, Strangle, Iron Condor, Butterfly)
- **Portfolio Analytics**: Real-time P&L tracking, position management, and risk metrics
- **On-Chain Settlement**: Final settlement secured by Ethereum smart contracts

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Trading   │  │  Portfolio  │  │     Analytics       │  │
│  │   Interface │  │  Management │  │  & Strategy Builder │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend API (Express)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Options   │  │   Market    │  │   Yellow Network    │  │
│  │   Engine    │  │   Data      │  │   State Channels    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
      │   Pyth      │  │  Supabase   │  │  Ethereum   │
      │   Oracle    │  │  Database   │  │  Sepolia    │
      └─────────────┘  └─────────────┘  └─────────────┘
```

## Technology Stack

### Frontend
- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Component library
- **Wagmi + Viem** - Ethereum interactions
- **RainbowKit** - Wallet connection
- **React Query** - Server state management
- **Recharts** - Data visualization

### Backend
- **Express.js 5** - REST API server
- **TypeScript** - Type-safe development
- **Viem** - Ethereum client library
- **@erc7824/nitrolite** - Yellow Network state channels

### Infrastructure
- **Supabase** - PostgreSQL database + real-time subscriptions
- **Pyth Network** - Real-time price oracles
- **Ethereum Sepolia** - Testnet deployment
- **Circle USDC** - Testnet stablecoin

## Smart Contracts

| Contract | Address (Sepolia) |
|----------|-------------------|
| Optix | `0x7779c5E338e52Be395A2A5386f8CFBf6629f67CB` |
| USDC (Circle Testnet) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Pyth Oracle | `0xDd24F84d36BF92C65F92307595335bdFab5Bbd21` |

## How It Works

### 1. Deposit Collateral
Users deposit USDC to the smart contract, which opens a state channel with Yellow Network.

### 2. Off-Chain Trading
All option trades (buying, writing, exercising) happen off-chain through signed state updates:
- No gas fees per trade
- Instant execution
- Full order book depth

### 3. Settlement
When positions are closed or expire, final balances are settled on-chain with cryptographic proofs.

## Options Pricing

Options are priced using the Black-Scholes model with the following parameters:

```typescript
interface OptionGreeks {
  delta: number;   // Price sensitivity to underlying
  gamma: number;   // Rate of change of delta
  theta: number;   // Time decay per day
  vega: number;    // Volatility sensitivity
  rho: number;     // Interest rate sensitivity
}
```

### Implied Volatility
- Default IV: 80% (calibrated to ETH historical volatility)
- Risk-free rate: 5% APY

## API Endpoints

### Price Data
- `GET /api/price` - Current ETH/USD price from Pyth

### Options Trading
- `GET /api/options` - List available options
- `POST /api/options` - Create new option (write)
- `POST /api/options/:id/buy` - Buy an option
- `POST /api/options/:id/exercise` - Exercise option

### Portfolio
- `GET /api/portfolio` - Portfolio summary with Greeks
- `GET /api/portfolio/positions` - Open positions
- `GET /api/portfolio/trading-balance` - Virtual trading balance

### Market Data
- `GET /api/market/volume` - 24h trading volume
- `GET /api/market/open-interest` - Open interest by strike
- `GET /api/market/trades` - Recent trade history

### Strategy Builder
- `GET /api/strategies/templates` - Available strategy templates
- `POST /api/strategies/build` - Build multi-leg strategy

### Yellow Network
- `POST /api/yellow/connect` - Connect to state channel network
- `POST /api/yellow/session/init` - Initialize trading session
- `GET /api/yellow/balances` - Ledger balances

## Database Schema

| Table | Description |
|-------|-------------|
| `users` | Wallet addresses and balances |
| `options` | Option contracts (strike, expiry, type) |
| `trades` | Trade execution history |
| `positions` | Open position tracking |
| `deposits` | On-chain deposit records |
| `withdrawals` | On-chain withdrawal records |
| `settlements` | Option settlement records |
| `price_history` | Historical price snapshots |

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Ethereum wallet with Sepolia ETH

### Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/optix.git
cd optix

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
```

### Environment Variables

Create a `.env` file in the root:

```env
PRIVATE_KEY=0x...
SEPOLIA_RPC_URL=https://...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
```

Create a `.env.local` file in the frontend:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
```

### Running the Application

```bash
# Terminal 1: Start the backend
npm run server

# Terminal 2: Start the frontend
cd frontend
npm run dev
```

Visit `http://localhost:3000` to access the application.

## Testing

```bash
# Run API flow tests
npm run test:api-flow

# Test database connection
npm run test:db

# Test options engine
npm run test:options

# Full integration test
npm run test:flow
```

## Strategy Templates

| Strategy | Description | Risk Profile |
|----------|-------------|--------------|
| **Bull Call Spread** | Buy lower strike call, sell higher strike call | Limited risk, limited profit |
| **Bear Put Spread** | Buy higher strike put, sell lower strike put | Limited risk, limited profit |
| **Long Straddle** | Buy ATM call + ATM put | Unlimited profit on large moves |
| **Long Strangle** | Buy OTM call + OTM put | Lower cost, needs bigger move |
| **Iron Condor** | Sell strangle, buy wider strangle | Limited risk, profit from low volatility |
| **Butterfly Spread** | Buy 1 ITM, sell 2 ATM, buy 1 OTM | Low cost, profit at specific price |

## Security Considerations

- All state channel updates are cryptographically signed
- Smart contract audited for common vulnerabilities
- Collateral locked in escrow until settlement
- Dispute resolution via on-chain verification

## Future Roadmap

- [ ] Mainnet deployment
- [ ] Additional underlying assets (BTC, SOL)
- [ ] American-style options
- [ ] Automated market making
- [ ] Cross-chain settlement

## Team

Built by Aayush for ETHGlobal HackMoney 2026

## License

MIT License - see [LICENSE](LICENSE) for details

---

**Disclaimer**: This is a hackathon project for educational purposes. Use at your own risk on testnet only.
