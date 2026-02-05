import type { Address, Hex } from 'viem';

export type YellowConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'authenticating'
  | 'authenticated'
  | 'error';

export interface YellowSession {
  sessionId: Hex;
  status: 'active' | 'closing' | 'closed';
  createdAt: number;
  expiresAt: number;
}

export interface YellowBalance {
  asset: string;
  symbol: string;
  available: string;
  locked: string;
  total: string;
}

export interface YellowChannel {
  channelId: Hex;
  participants: Address[];
  status: string;
  balance: string;
}

export interface YellowConfig {
  clearNodeUrl: string;
  applicationName: string;
  chainId: number;
}

export const DEFAULT_YELLOW_CONFIG: YellowConfig = {
  clearNodeUrl: process.env.NEXT_PUBLIC_YELLOW_CLEARNODE_URL || 'wss://clearnet-sandbox.yellow.com/ws',
  applicationName: 'Optix',
  chainId: 11155111, // Sepolia
};
