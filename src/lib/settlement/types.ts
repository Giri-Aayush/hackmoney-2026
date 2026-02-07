import { Address, Hex } from 'viem';

/**
 * Settlement Types
 * Defines the interface between off-chain state channels and on-chain settlement
 */

export interface DepositRequest {
  user: Address;
  amount: bigint;
  token: Address;
}

export interface WithdrawalRequest {
  user: Address;
  amount: bigint;
  token: Address;
  nonce: bigint;
  signature: Hex;
}

export interface SettlementRequest {
  optionId: Hex;
  holder: Address;
  writer: Address;
  payout: bigint;
  settlementPrice: bigint;
  pythPriceUpdate: Hex; // Pyth price update data for verification
  signatures: {
    holder: Hex;
    writer: Hex;
  };
}

export interface SettlementResult {
  success: boolean;
  txHash?: Hex;
  error?: string;
}

export interface ContractAddresses {
  optix: Address;            // Main settlement contract
  usdc: Address;             // USDC token
  pyth: Address;             // Pyth oracle contract
}

// Events emitted by the settlement contract
export interface DepositEvent {
  user: Address;
  amount: bigint;
  token: Address;
  timestamp: number;
}

export interface WithdrawalEvent {
  user: Address;
  amount: bigint;
  token: Address;
  timestamp: number;
}

export interface SettlementEvent {
  optionId: Hex;
  holder: Address;
  writer: Address;
  payout: bigint;
  settlementPrice: bigint;
  timestamp: number;
}
