import { Address, Hex, keccak256, toHex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  createAuthRequestMessage,
  createAuthVerifyMessageFromChallenge,
  createPingMessageV2,
  createGetLedgerBalancesMessage,
  type MessageSigner,
} from '@erc7824/nitrolite';
import type {
  YellowConnectionState,
  YellowConfig,
  YellowBalance,
  YellowChannel,
  YellowSession,
} from './types';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface RpcResponse {
  method: string;
  data: unknown;
  raw: unknown;
}

type StateChangeHandler = (state: YellowConnectionState) => void;
type MessageHandler = (method: string, data: unknown) => void;
type ErrorHandler = (error: Error) => void;

// Auth params stored for EIP-712 signing
export interface AuthParams {
  address: Address;
  session_key: Address;
  application: string;
  scope: string;
  expires_at: bigint;
  allowances: readonly { asset: string; amount: string }[];
}

/**
 * Yellow Network Client for Frontend
 * Uses @erc7824/nitrolite SDK for proper message formatting
 */
export class YellowNetworkClient {
  private ws: WebSocket | null = null;
  private config: YellowConfig;
  private state: YellowConnectionState = 'disconnected';
  private requestId = 1;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private pendingRequests: Map<number, PendingRequest> = new Map();

  // Session key (ephemeral, generated locally)
  private sessionKeyPrivateKey: Hex;
  private sessionKeyAccount: ReturnType<typeof privateKeyToAccount>;

  // Event handlers
  private onStateChange?: StateChangeHandler;
  private onMessage?: MessageHandler;
  private onError?: ErrorHandler;

  // Auth state
  private mainWalletAddress: Address | null = null;
  private authExpiresAt: number = 0;
  private pendingAuthParams: AuthParams | null = null;

  constructor(config: YellowConfig) {
    this.config = config;

    // Generate ephemeral session key
    this.sessionKeyPrivateKey = generatePrivateKey();
    this.sessionKeyAccount = privateKeyToAccount(this.sessionKeyPrivateKey);

    console.log('[Yellow] Session key generated:', this.sessionKeyAccount.address);
  }

  // Getters
  get connectionState(): YellowConnectionState {
    return this.state;
  }

  get isConnected(): boolean {
    return this.state === 'connected' || this.state === 'authenticated' || this.state === 'authenticating';
  }

  get isAuthenticated(): boolean {
    return this.state === 'authenticated';
  }

  get sessionKeyAddress(): Address {
    return this.sessionKeyAccount.address;
  }

  get walletAddress(): Address | null {
    return this.mainWalletAddress;
  }

  // Event handlers
  setOnStateChange(handler: StateChangeHandler): void {
    this.onStateChange = handler;
  }

  setOnMessage(handler: MessageHandler): void {
    this.onMessage = handler;
  }

  setOnError(handler: ErrorHandler): void {
    this.onError = handler;
  }

  private setState(newState: YellowConnectionState): void {
    console.log(`[Yellow] State: ${this.state} → ${newState}`);
    this.state = newState;
    this.onStateChange?.(newState);
  }

  private getNextRequestId(): number {
    return this.requestId++;
  }

  /**
   * Connect to ClearNode WebSocket
   */
  async connect(): Promise<void> {
    if (this.ws && this.isConnected) {
      console.log('[Yellow] Already connected');
      return;
    }

    return new Promise((resolve, reject) => {
      this.setState('connecting');
      console.log(`[Yellow] Connecting to ${this.config.clearNodeUrl}...`);

      this.ws = new WebSocket(this.config.clearNodeUrl);

      this.ws.onopen = () => {
        console.log('[Yellow] WebSocket connected');
        this.setState('connected');
        resolve();
      };

      this.ws.onclose = (event) => {
        console.log(`[Yellow] WebSocket closed: ${event.code} ${event.reason}`);
        this.cleanup();
        this.setState('disconnected');
      };

      this.ws.onerror = () => {
        const err = new Error('WebSocket connection failed');
        this.onError?.(err);
        this.setState('error');
        reject(err);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data.toString());
      };
    });
  }

  /**
   * Disconnect from ClearNode
   */
  async disconnect(): Promise<void> {
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.mainWalletAddress = null;
    this.setState('disconnected');
  }

  /**
   * Request authentication challenge from ClearNode using SDK
   */
  async requestAuthChallenge(walletAddress: Address): Promise<{ challenge: string; authParams: AuthParams }> {
    if (!this.isConnected) {
      throw new Error('Not connected to ClearNode');
    }

    this.mainWalletAddress = walletAddress;
    this.setState('authenticating');

    const requestId = this.getNextRequestId();
    // expires_at in SECONDS per SDK reference
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 3600);

    // Store auth params for EIP-712 signing
    this.pendingAuthParams = {
      address: walletAddress,
      session_key: this.sessionKeyAccount.address,
      application: this.config.applicationName,
      scope: 'console',
      expires_at: expiresAt,
      allowances: [],
    };

    // Use SDK to create properly formatted auth request
    const authRequest = await createAuthRequestMessage(
      {
        address: walletAddress,
        session_key: this.sessionKeyAccount.address,
        application: this.config.applicationName,
        scope: 'console',
        expires_at: expiresAt,
        allowances: [],
      },
      requestId
    );

    console.log('[Yellow] Auth request (SDK):', authRequest);

    const response = await this.sendAndWait<RpcResponse>(authRequest, requestId);

    if (response.method === 'error') {
      this.pendingAuthParams = null;
      this.setState('connected');
      throw new Error(`Auth request failed: ${JSON.stringify(response.data)}`);
    }

    const challengeData = response.data as { challenge_message: string };

    return {
      challenge: challengeData.challenge_message,
      authParams: this.pendingAuthParams,
    };
  }

  /**
   * Complete authentication with EIP-712 signer
   * The signer should be created by the caller (React context) using wagmi's signTypedDataAsync
   */
  async verifyAuth(eip712Signer: MessageSigner, challenge: string): Promise<void> {
    if (this.state !== 'authenticating') {
      throw new Error('Not in authenticating state');
    }

    if (!this.pendingAuthParams) {
      throw new Error('No pending auth params');
    }

    const requestId = this.getNextRequestId();

    // Use SDK to create properly formatted auth verify message
    // The SDK's createAuthVerifyMessageFromChallenge uses the signer to sign the challenge
    const verifyRequest = await createAuthVerifyMessageFromChallenge(
      eip712Signer,
      challenge,
      requestId
    );

    console.log('[Yellow] Auth verify request (SDK):', verifyRequest);

    const response = await this.sendAndWait<RpcResponse>(verifyRequest, requestId);

    if (response.method === 'error') {
      this.pendingAuthParams = null;
      this.setState('connected');
      throw new Error(`Authentication failed: ${JSON.stringify(response.data)}`);
    }

    console.log('[Yellow] Authentication successful!');
    this.pendingAuthParams = null;
    this.authExpiresAt = Date.now() + 3600 * 1000;
    this.setState('authenticated');
    this.startPingInterval();
  }

  /**
   * Get the pending auth params for EIP-712 signing
   */
  getPendingAuthParams(): AuthParams | null {
    return this.pendingAuthParams;
  }

  /**
   * Get ledger balances
   */
  async getBalances(): Promise<YellowBalance[]> {
    this.ensureAuthenticated();

    const requestId = this.getNextRequestId();
    const message = await createGetLedgerBalancesMessage(
      this.createSessionKeySigner(),
      undefined,
      requestId
    );
    const response = await this.sendAndWait<RpcResponse>(message, requestId);

    if (response.method === 'error') {
      throw new Error(`Failed to get balances: ${JSON.stringify(response.data)}`);
    }

    const data = response.data as { balances?: YellowBalance[] };
    return data.balances || [];
  }

  /**
   * Get channels
   */
  async getChannels(): Promise<YellowChannel[]> {
    this.ensureAuthenticated();

    const requestId = this.getNextRequestId();
    const message = JSON.stringify({
      req: [requestId, 'get_channels', { participant: this.mainWalletAddress }, Date.now()],
    });
    const response = await this.sendAndWait<RpcResponse>(message, requestId);

    if (response.method === 'error') {
      throw new Error(`Failed to get channels: ${JSON.stringify(response.data)}`);
    }

    const data = response.data as { channels?: YellowChannel[] };
    return data.channels || [];
  }

  /**
   * Create a trading session
   */
  async createSession(counterparty: Address, initialAllocation: string): Promise<YellowSession> {
    this.ensureAuthenticated();

    const requestId = this.getNextRequestId();
    const params = {
      definition: {
        participants: [this.mainWalletAddress, counterparty],
        weights: [1, 1],
        quorum: 2,
        challenge_duration: 86400,
        nonce: Date.now(),
      },
      allocations: [
        {
          participant: this.mainWalletAddress,
          asset: 'usdc',
          amount: initialAllocation,
        },
        {
          participant: counterparty,
          asset: 'usdc',
          amount: '0',
        },
      ],
    };

    const message = await this.createSignedMessage('create_app_session', params, requestId);
    const response = await this.sendAndWait<RpcResponse>(message, requestId);

    if (response.method === 'error') {
      throw new Error(`Failed to create session: ${JSON.stringify(response.data)}`);
    }

    const data = response.data as { session_id: Hex };
    return {
      sessionId: data.session_id,
      status: 'active',
      createdAt: Date.now(),
      expiresAt: this.authExpiresAt,
    };
  }

  /**
   * Close a trading session
   */
  async closeSession(sessionId: Hex, finalAllocations: unknown[]): Promise<void> {
    this.ensureAuthenticated();

    const requestId = this.getNextRequestId();
    const params = {
      session_id: sessionId,
      allocations: finalAllocations,
    };

    const message = await this.createSignedMessage('close_app_session', params, requestId);
    const response = await this.sendAndWait<RpcResponse>(message, requestId);

    if (response.method === 'error') {
      throw new Error(`Failed to close session: ${JSON.stringify(response.data)}`);
    }
  }

  // Private methods

  /**
   * Create a session key signer for RPC messages (internal use)
   */
  private async signPayload(payload: unknown): Promise<Hex> {
    const message = toHex(
      JSON.stringify(payload, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
    );
    const hash = keccak256(message);
    return this.sessionKeyAccount.sign({ hash });
  }

  /**
   * Create a session key signer that conforms to SDK's MessageSigner type
   */
  private createSessionKeySigner(): MessageSigner {
    return async (payload: unknown): Promise<Hex> => {
      return this.signPayload(payload);
    };
  }

  private async createSignedMessage(method: string, params: unknown, requestId: number): Promise<string> {
    const payload = [requestId, method, params, Date.now()];
    const signature = await this.signPayload(payload);

    return JSON.stringify({
      req: payload,
      sig: signature,
    });
  }

  private handleMessage(rawMessage: string): void {
    console.log('[Yellow] Received message:', rawMessage);

    try {
      const parsed = JSON.parse(rawMessage);
      const reqId = parsed?.res?.[0];
      const method = parsed?.res?.[1];
      const data = parsed?.res?.[2];

      console.log('[Yellow] Parsed response - reqId:', reqId, 'method:', method, 'data:', data);

      // Check if this is a response to a pending request
      if (reqId !== undefined && this.pendingRequests.has(reqId)) {
        const pending = this.pendingRequests.get(reqId)!;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(reqId);

        if (method === 'error') {
          const errorMsg = typeof data === 'object' && data !== null && 'error' in data
            ? String(data.error)
            : (typeof data === 'string' ? data : 'Unknown error');
          console.error('[Yellow] Error response:', errorMsg);
          pending.reject(new Error(errorMsg));
        } else {
          pending.resolve({ method, data, raw: parsed });
        }
        return;
      }

      // Handle broadcast messages
      this.onMessage?.(method, data);
    } catch (error) {
      console.error('[Yellow] Error parsing message:', error, 'Raw:', rawMessage);
    }
  }

  private sendAndWait<T = RpcResponse>(message: string, requestId: number, timeout = 30000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request ${requestId} timed out`));
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timeoutHandle,
      });

      this.send(message);
    });
  }

  private send(message: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(message);
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.isAuthenticated && this.ws?.readyState === WebSocket.OPEN) {
        try {
          const pingMsg = createPingMessageV2();
          this.send(pingMsg);
        } catch (error) {
          console.error('[Yellow] Ping failed:', error);
        }
      }
    }, 30000);
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
  }

  private ensureAuthenticated(): void {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated. Please authenticate first.');
    }
  }
}
