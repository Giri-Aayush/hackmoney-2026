'use client';

import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import type { Address, Hex } from 'viem';
import { createEIP712AuthMessageSigner } from '@erc7824/nitrolite';
import { YellowNetworkClient, type AuthParams } from './client';
import {
  DEFAULT_YELLOW_CONFIG,
  type YellowConnectionState,
  type YellowBalance,
  type YellowChannel,
  type YellowSession,
} from './types';

interface YellowContextValue {
  // Connection state
  connectionState: YellowConnectionState;
  isConnecting: boolean;
  isConnected: boolean;
  isAuthenticated: boolean;
  error: Error | null;

  // Session info
  sessionKeyAddress: Address | null;
  sessions: YellowSession[];
  balances: YellowBalance[];
  channels: YellowChannel[];

  // Actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  authenticate: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  refreshChannels: () => Promise<void>;
  createSession: (counterparty: Address, amount: string) => Promise<YellowSession>;
  closeSession: (sessionId: Hex) => Promise<void>;
}

const YellowContext = createContext<YellowContextValue | null>(null);

export function YellowProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected: isWalletConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Client instance
  const clientRef = useRef<YellowNetworkClient | null>(null);

  // State
  const [connectionState, setConnectionState] = useState<YellowConnectionState>('disconnected');
  const [error, setError] = useState<Error | null>(null);
  const [sessionKeyAddress, setSessionKeyAddress] = useState<Address | null>(null);
  const [sessions, setSessions] = useState<YellowSession[]>([]);
  const [balances, setBalances] = useState<YellowBalance[]>([]);
  const [channels, setChannels] = useState<YellowChannel[]>([]);

  // Pending auth state
  const pendingAuthRef = useRef<{
    challenge: string;
    authParams: AuthParams;
  } | null>(null);

  // Initialize client
  useEffect(() => {
    if (!clientRef.current) {
      const client = new YellowNetworkClient(DEFAULT_YELLOW_CONFIG);

      client.setOnStateChange((state) => {
        setConnectionState(state);
        if (state === 'error') {
          setError(new Error('Connection error'));
        }
      });

      client.setOnMessage((method, data) => {
        console.log('[Yellow] Broadcast:', method, data);
        // Handle balance updates, etc.
        if (method === 'balance_update') {
          refreshBalances();
        }
      });

      client.setOnError((err) => {
        setError(err);
      });

      clientRef.current = client;
      setSessionKeyAddress(client.sessionKeyAddress);
    }

    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  // Connect to ClearNode
  const connect = useCallback(async () => {
    if (!clientRef.current) return;

    try {
      setError(null);
      await clientRef.current.connect();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Connection failed'));
      throw err;
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(async () => {
    if (!clientRef.current) return;

    try {
      await clientRef.current.disconnect();
      setSessions([]);
      setBalances([]);
      setChannels([]);
      pendingAuthRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Disconnect failed'));
    }
  }, []);

  // Authenticate with EIP-712 signature using SDK
  const authenticate = useCallback(async () => {
    if (!clientRef.current || !address || !isWalletConnected) {
      throw new Error('Wallet not connected');
    }

    if (!walletClient) {
      throw new Error('Wallet client not available');
    }

    const client = clientRef.current;

    try {
      setError(null);

      // Step 1: Connect if not connected
      if (!client.isConnected) {
        await client.connect();
      }

      // Step 2: Request challenge (returns { challenge, authParams })
      const { challenge, authParams } = await client.requestAuthChallenge(address);
      pendingAuthRef.current = { challenge, authParams };

      console.log('[Yellow] Got challenge, creating EIP-712 signer...', { challenge, authParams });

      // Step 3: Create EIP-712 signer using SDK
      // The SDK's createEIP712AuthMessageSigner creates a signer that signs the challenge
      const eip712Signer = createEIP712AuthMessageSigner(
        walletClient,
        {
          scope: authParams.scope,
          session_key: authParams.session_key,
          expires_at: authParams.expires_at,
          allowances: authParams.allowances as { asset: string; amount: string }[],
        },
        {
          name: DEFAULT_YELLOW_CONFIG.applicationName,
        }
      );

      console.log('[Yellow] EIP-712 signer created, verifying...');

      // Step 4: Verify with ClearNode using the signer
      await client.verifyAuth(eip712Signer, challenge);

      pendingAuthRef.current = null;

      // Step 5: Load initial data
      await Promise.all([refreshBalances(), refreshChannels()]);
    } catch (err) {
      pendingAuthRef.current = null;
      const error = err instanceof Error ? err : new Error('Authentication failed');
      setError(error);
      throw error;
    }
  }, [address, isWalletConnected, walletClient]);

  // Refresh balances
  const refreshBalances = useCallback(async () => {
    if (!clientRef.current?.isAuthenticated) return;

    try {
      const newBalances = await clientRef.current.getBalances();
      setBalances(newBalances);
    } catch (err) {
      console.error('[Yellow] Failed to refresh balances:', err);
    }
  }, []);

  // Refresh channels
  const refreshChannels = useCallback(async () => {
    if (!clientRef.current?.isAuthenticated) return;

    try {
      const newChannels = await clientRef.current.getChannels();
      setChannels(newChannels);
    } catch (err) {
      console.error('[Yellow] Failed to refresh channels:', err);
    }
  }, []);

  // Create trading session
  const createSession = useCallback(async (counterparty: Address, amount: string): Promise<YellowSession> => {
    if (!clientRef.current?.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    const session = await clientRef.current.createSession(counterparty, amount);
    setSessions((prev) => [...prev, session]);
    return session;
  }, []);

  // Close session
  const closeSession = useCallback(async (sessionId: Hex): Promise<void> => {
    if (!clientRef.current?.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    // For now, close with empty final allocations
    // In production, this would calculate final balances
    await clientRef.current.closeSession(sessionId, []);
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
  }, []);

  const value: YellowContextValue = {
    connectionState,
    isConnecting: connectionState === 'connecting' || connectionState === 'authenticating',
    isConnected: connectionState === 'connected' || connectionState === 'authenticated' || connectionState === 'authenticating',
    isAuthenticated: connectionState === 'authenticated',
    error,
    sessionKeyAddress,
    sessions,
    balances,
    channels,
    connect,
    disconnect,
    authenticate,
    refreshBalances,
    refreshChannels,
    createSession,
    closeSession,
  };

  return <YellowContext.Provider value={value}>{children}</YellowContext.Provider>;
}

export function useYellow(): YellowContextValue {
  const context = useContext(YellowContext);
  if (!context) {
    throw new Error('useYellow must be used within a YellowProvider');
  }
  return context;
}
