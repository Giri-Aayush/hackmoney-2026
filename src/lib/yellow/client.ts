import WebSocket from 'ws';
import { Hex, Address, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createAuthRequestMessage,
  createAuthVerifyMessageFromChallenge,
  createPingMessageV2,
  createGetConfigMessageV2,
  createGetLedgerBalancesMessage,
  createAppSessionMessage,
  createCloseAppSessionMessage,
  createApplicationMessage,
  createGetChannelsMessageV2,
  type MessageSigner,
  type CreateAppSessionRequestParams,
  type CloseAppSessionRequestParams,
  type RPCAppSessionAllocation,
} from '@erc7824/nitrolite';
import { config } from '../../config/index.js';

// EIP-712 types for Yellow Network authentication - SDK format
// Must match what ClearNode expects for signature verification
const AUTH_TYPES = {
  Policy: [
    { name: 'challenge', type: 'string' },
    { name: 'scope', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'session_key', type: 'address' },
    { name: 'expires_at', type: 'uint64' },
    { name: 'allowances', type: 'Allowance[]' },
  ],
  Allowance: [
    { name: 'asset', type: 'string' },
    { name: 'amount', type: 'string' },
  ],
} as const;

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'authenticated';

export interface YellowClientConfig {
  clearNodeUrl?: string;
  privateKey: Hex;
  address: Address;
  application?: string;
  onStateChange?: (state: ConnectionState) => void;
  onMessage?: (method: string, data: unknown) => void;
  onError?: (error: Error) => void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface RpcResponse {
  method: string;
  data: unknown;
  raw: unknown;
}

export class YellowClient {
  private ws: WebSocket | null = null;
  private clientConfig: YellowClientConfig;
  private state: ConnectionState = 'disconnected';
  private requestId = 1;
  private pingInterval: NodeJS.Timeout | null = null;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private messageSigner: MessageSigner;
  private account: ReturnType<typeof privateKeyToAccount>;
  private sessionKeyAccount: ReturnType<typeof privateKeyToAccount>;
  private sessionKeyPrivateKey: Hex;

  constructor(clientConfig: YellowClientConfig) {
    this.clientConfig = {
      clearNodeUrl: clientConfig.clearNodeUrl || 'wss://clearnet-sandbox.yellow.com/ws',
      // Using "clearnode" gives root access per Yellow Network docs
      application: clientConfig.application || 'clearnode',
      ...clientConfig,
    };

    // Create main account from private key for EIP-712 signing
    this.account = privateKeyToAccount(clientConfig.privateKey);

    // Generate a random session key (ephemeral key for RPC messages)
    this.sessionKeyPrivateKey = this.generateRandomPrivateKey();
    this.sessionKeyAccount = privateKeyToAccount(this.sessionKeyPrivateKey);

    // Create message signer using session key for regular RPC messages
    this.messageSigner = this.createMessageSigner(this.sessionKeyPrivateKey);

    console.log(`[Yellow] Main wallet: ${this.account.address}`);
    console.log(`[Yellow] Session key: ${this.sessionKeyAccount.address}`);
  }

  /**
   * Generates a random private key for the session key.
   */
  private generateRandomPrivateKey(): Hex {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    return ('0x' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')) as Hex;
  }

  get sessionKeyAddress(): Address {
    return this.sessionKeyAccount.address;
  }

  /**
   * Creates an ECDSA message signer for signing RPC messages.
   */
  private createMessageSigner(privateKey: Hex): MessageSigner {
    const account = privateKeyToAccount(privateKey);
    return async (payload: unknown): Promise<Hex> => {
      const message = toHex(
        JSON.stringify(payload, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      const hash = keccak256(message);
      return account.sign({ hash });
    };
  }

  /**
   * Extracts the challenge UUID from the signer payload.
   * The payload is [requestId, method, params, timestamp] where params.challenge contains the UUID.
   */
  private extractChallengeFromPayload(payload: unknown): string {
    if (Array.isArray(payload) && payload.length >= 3) {
      const params = payload[2];
      if (params && typeof params === 'object' && 'challenge' in params) {
        return (params as { challenge: string }).challenge;
      }
    }
    throw new Error('Could not extract challenge from payload');
  }

  /**
   * Creates an EIP-712 message signer for auth verification.
   * The signer receives the request payload and extracts the challenge to sign with EIP-712.
   * Important: EIP-712 signature MUST be signed by main wallet, not session key.
   */
  private createEIP712AuthSigner(expiresAt: bigint): MessageSigner {
    const mainAccount = this.account;
    const mainWalletAddress = this.clientConfig.address;
    const sessionKeyAddress = this.sessionKeyAccount.address;
    const application = this.clientConfig.application!;

    return async (payload: unknown): Promise<Hex> => {
      // Extract challenge UUID from payload
      const challenge = this.extractChallengeFromPayload(payload);

      // Create EIP-712 message matching SDK format
      // Uses: challenge, scope, wallet, session_key, expires_at, allowances
      const message = {
        challenge,
        scope: 'console',
        wallet: mainWalletAddress,
        session_key: sessionKeyAddress,
        expires_at: expiresAt,
        allowances: [] as readonly { asset: string; amount: string }[],
      };

      const domain = { name: application };

      if (config.isDev) {
        console.log('[Yellow] EIP-712 signing:', {
          domain,
          message,
          signer: mainAccount.address,
        });
      }

      // Sign with EIP-712 using main wallet (NOT session key)
      const signature = await mainAccount.signTypedData({
        domain,
        types: AUTH_TYPES,
        primaryType: 'Policy',
        message,
      });

      return signature;
    };
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  get isConnected(): boolean {
    return this.state === 'connected' || this.state === 'authenticated';
  }

  get isAuthenticated(): boolean {
    return this.state === 'authenticated';
  }

  get address(): Address {
    return this.clientConfig.address;
  }

  private setState(newState: ConnectionState): void {
    this.state = newState;
    this.clientConfig.onStateChange?.(newState);
  }

  private getNextRequestId(): number {
    return this.requestId++;
  }

  async connect(): Promise<void> {
    if (this.ws && this.isConnected) {
      console.log('[Yellow] Already connected');
      return;
    }

    return new Promise((resolve, reject) => {
      this.setState('connecting');
      console.log(`[Yellow] Connecting to ${this.clientConfig.clearNodeUrl}...`);

      this.ws = new WebSocket(this.clientConfig.clearNodeUrl!);

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

      this.ws.onerror = (error) => {
        console.error('[Yellow] WebSocket error:', error);
        const err = new Error('WebSocket connection failed');
        this.clientConfig.onError?.(err);
        reject(err);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data.toString());
      };
    });
  }

  private handleMessage(rawMessage: string): void {
    try {
      const parsed = JSON.parse(rawMessage);

      // Extract request ID and method from response
      const reqId = parsed?.res?.[0];
      const method = parsed?.res?.[1];
      const data = parsed?.res?.[2];

      if (config.isDev) {
        console.log(`[Yellow] Received: ${method}`, typeof data === 'object' ? JSON.stringify(data).substring(0, 100) : data);
      }

      // Check if this is a response to a pending request
      if (reqId !== undefined && this.pendingRequests.has(reqId)) {
        const pending = this.pendingRequests.get(reqId)!;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(reqId);

        if (method === 'error') {
          pending.reject(new Error(typeof data === 'object' && data !== null && 'error' in data ? String(data.error) : 'Unknown error'));
        } else {
          pending.resolve({ method, data, raw: parsed });
        }
        return;
      }

      // Handle broadcast messages (assets, balance updates, etc.)
      this.clientConfig.onMessage?.(method, data);
    } catch (error) {
      console.error('[Yellow] Error parsing message:', error);
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
    if (config.isDev) {
      console.log('[Yellow] Sending:', message.substring(0, 150) + '...');
    }
    this.ws.send(message);
  }

  async authenticate(): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Must be connected before authenticating');
    }

    console.log('[Yellow] Starting authentication...');

    // Step 1: Send auth request
    const authRequestId = this.getNextRequestId();
    // expires_at must be in SECONDS (Unix timestamp) per Yellow Network docs
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now in seconds

    // Auth request params - using SDK format
    // address = main wallet, session_key = ephemeral session key
    const authParams = {
      address: this.clientConfig.address,
      session_key: this.sessionKeyAccount.address,
      application: this.clientConfig.application!,
      scope: 'console',
      expires_at: expiresAt,
      allowances: [],
    } as unknown as Parameters<typeof createAuthRequestMessage>[0];

    const authRequest = await createAuthRequestMessage(authParams, authRequestId);

    console.log('[Yellow] Sending auth request...');
    const challengeResponse = await this.sendAndWait<RpcResponse>(authRequest, authRequestId);

    if (challengeResponse.method === 'error') {
      throw new Error(`Auth request failed: ${JSON.stringify(challengeResponse.data)}`);
    }

    console.log('[Yellow] Received challenge, sending auth verify...');

    // Step 2: Extract challenge from response
    const challengeData = challengeResponse.data as { challenge_message: string };
    const challengeMessage = challengeData.challenge_message;

    console.log(`[Yellow] Challenge: ${challengeMessage}`);

    // Step 3: Create EIP-712 signer for auth verification
    const eip712Signer = this.createEIP712AuthSigner(expiresAt);

    // Step 4: Verify with EIP-712 signed challenge using createAuthVerifyMessageFromChallenge
    const verifyRequestId = this.getNextRequestId();
    const verifyMessage = await createAuthVerifyMessageFromChallenge(
      eip712Signer,
      challengeMessage,
      verifyRequestId
    );

    const verifyResponse = await this.sendAndWait<RpcResponse>(verifyMessage, verifyRequestId);

    if (verifyResponse.method === 'error') {
      throw new Error(`Authentication failed: ${JSON.stringify(verifyResponse.data)}`);
    }

    console.log('[Yellow] Authentication successful!');
    this.setState('authenticated');
    this.startPingInterval();
  }

  async connectAndAuthenticate(): Promise<void> {
    await this.connect();
    await this.authenticate();
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.isAuthenticated) {
        try {
          const pingMsg = createPingMessageV2();
          this.send(pingMsg);
        } catch (error) {
          console.error('[Yellow] Ping failed:', error);
        }
      }
    }, 30000); // Ping every 30 seconds
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
  }

  async disconnect(): Promise<void> {
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  // ============================================
  // API Methods
  // ============================================

  async getConfig(): Promise<RpcResponse> {
    this.ensureAuthenticated();
    const requestId = this.getNextRequestId();
    const message = createGetConfigMessageV2(requestId);
    return this.sendAndWait(message, requestId);
  }

  async getChannels(): Promise<RpcResponse> {
    this.ensureAuthenticated();
    const requestId = this.getNextRequestId();
    const message = createGetChannelsMessageV2(this.clientConfig.address, undefined, requestId);
    return this.sendAndWait(message, requestId);
  }

  async getLedgerBalances(accountId?: string): Promise<RpcResponse> {
    this.ensureAuthenticated();
    const requestId = this.getNextRequestId();
    const message = await createGetLedgerBalancesMessage(
      this.messageSigner,
      accountId,
      requestId
    );
    return this.sendAndWait(message, requestId);
  }

  async createAppSession(params: CreateAppSessionRequestParams): Promise<RpcResponse> {
    this.ensureAuthenticated();
    const requestId = this.getNextRequestId();
    const message = await createAppSessionMessage(this.messageSigner, params, requestId);
    return this.sendAndWait(message, requestId);
  }

  async closeAppSession(params: CloseAppSessionRequestParams): Promise<RpcResponse> {
    this.ensureAuthenticated();
    const requestId = this.getNextRequestId();
    const message = await createCloseAppSessionMessage(this.messageSigner, params, requestId);
    return this.sendAndWait(message, requestId);
  }

  async sendApplicationMessage(appSessionId: Hex, messageParams: unknown): Promise<RpcResponse> {
    this.ensureAuthenticated();
    const requestId = this.getNextRequestId();
    const message = await createApplicationMessage(
      this.messageSigner,
      appSessionId,
      messageParams,
      requestId
    );
    return this.sendAndWait(message, requestId);
  }

  private ensureAuthenticated(): void {
    if (!this.isAuthenticated) {
      throw new Error('Client is not authenticated. Call authenticate() first.');
    }
  }
}

// Re-export types for convenience
export type {
  MessageSigner,
  CreateAppSessionRequestParams,
  CloseAppSessionRequestParams,
  RPCAppSessionAllocation,
};
