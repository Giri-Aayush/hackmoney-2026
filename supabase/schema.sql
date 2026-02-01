-- OptiChannel Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE
-- Tracks user wallets and balances
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT UNIQUE NOT NULL,
  balance DECIMAL(20, 8) DEFAULT 0,
  total_deposited DECIMAL(20, 8) DEFAULT 0,
  total_withdrawn DECIMAL(20, 8) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for wallet lookups
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);

-- ============================================================================
-- OPTIONS TABLE
-- All options written on the platform
-- ============================================================================
CREATE TABLE IF NOT EXISTS options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  writer_address TEXT NOT NULL,
  holder_address TEXT,
  underlying TEXT NOT NULL DEFAULT 'ETH',
  strike_price DECIMAL(20, 8) NOT NULL,
  premium DECIMAL(20, 8) NOT NULL,
  amount DECIMAL(20, 18) NOT NULL,
  option_type TEXT NOT NULL CHECK (option_type IN ('call', 'put')),
  expiry TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'exercised', 'expired', 'cancelled')),
  settlement_price DECIMAL(20, 8),
  settlement_tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  exercised_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_options_writer ON options(writer_address);
CREATE INDEX IF NOT EXISTS idx_options_holder ON options(holder_address);
CREATE INDEX IF NOT EXISTS idx_options_status ON options(status);
CREATE INDEX IF NOT EXISTS idx_options_expiry ON options(expiry);
CREATE INDEX IF NOT EXISTS idx_options_type ON options(option_type);

-- ============================================================================
-- TRADES TABLE
-- Record of all trades (buys)
-- ============================================================================
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  option_id UUID REFERENCES options(id),
  buyer_address TEXT NOT NULL,
  seller_address TEXT NOT NULL,
  premium DECIMAL(20, 8) NOT NULL,
  size DECIMAL(20, 18) NOT NULL,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trades_option ON trades(option_id);
CREATE INDEX IF NOT EXISTS idx_trades_buyer ON trades(buyer_address);
CREATE INDEX IF NOT EXISTS idx_trades_seller ON trades(seller_address);

-- ============================================================================
-- POSITIONS TABLE
-- User positions (long/short options)
-- ============================================================================
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_address TEXT NOT NULL,
  option_id UUID REFERENCES options(id),
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  size DECIMAL(20, 18) NOT NULL,
  entry_price DECIMAL(20, 8) NOT NULL,
  exit_price DECIMAL(20, 8),
  realized_pnl DECIMAL(20, 8),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_address);
CREATE INDEX IF NOT EXISTS idx_positions_option ON positions(option_id);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);

-- ============================================================================
-- DEPOSITS TABLE
-- On-chain deposit records
-- ============================================================================
CREATE TABLE IF NOT EXISTS deposits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_address TEXT NOT NULL,
  amount DECIMAL(20, 8) NOT NULL,
  token TEXT NOT NULL DEFAULT 'USDC',
  tx_hash TEXT NOT NULL,
  block_number BIGINT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_address);
CREATE INDEX IF NOT EXISTS idx_deposits_tx ON deposits(tx_hash);

-- ============================================================================
-- WITHDRAWALS TABLE
-- On-chain withdrawal records
-- ============================================================================
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_address TEXT NOT NULL,
  amount DECIMAL(20, 8) NOT NULL,
  token TEXT NOT NULL DEFAULT 'USDC',
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_address);

-- ============================================================================
-- SETTLEMENTS TABLE
-- On-chain option settlement records
-- ============================================================================
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  option_id UUID REFERENCES options(id),
  settlement_price DECIMAL(20, 8) NOT NULL,
  payout DECIMAL(20, 8) NOT NULL,
  winner_address TEXT NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_settlements_option ON settlements(option_id);

-- ============================================================================
-- PRICE HISTORY TABLE
-- Historical price snapshots for charts
-- ============================================================================
CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol TEXT NOT NULL DEFAULT 'ETH/USD',
  price DECIMAL(20, 8) NOT NULL,
  confidence DECIMAL(20, 8),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_symbol_time ON price_history(symbol, timestamp DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_options_updated_at BEFORE UPDATE ON options
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE options ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

-- Public read access for options (marketplace)
CREATE POLICY "Options are viewable by everyone" ON options
  FOR SELECT USING (true);

-- Public read access for trades
CREATE POLICY "Trades are viewable by everyone" ON trades
  FOR SELECT USING (true);

-- Service role can do everything (for API server)
CREATE POLICY "Service role full access users" ON users
  FOR ALL USING (true);

CREATE POLICY "Service role full access options" ON options
  FOR ALL USING (true);

CREATE POLICY "Service role full access trades" ON trades
  FOR ALL USING (true);

CREATE POLICY "Service role full access positions" ON positions
  FOR ALL USING (true);

CREATE POLICY "Service role full access deposits" ON deposits
  FOR ALL USING (true);

CREATE POLICY "Service role full access withdrawals" ON withdrawals
  FOR ALL USING (true);

CREATE POLICY "Service role full access settlements" ON settlements
  FOR ALL USING (true);
