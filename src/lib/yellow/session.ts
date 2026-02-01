import { Hex, Address } from 'viem';
import type {
  RPCAppDefinition,
  RPCAppSessionAllocation,
  CreateAppSessionRequestParams,
  CloseAppSessionRequestParams,
  RPCProtocolVersion,
} from '@erc7824/nitrolite';
import { YellowClient } from './client.js';

export const OPTICHANNEL_PROTOCOL = 'optichannel-v1';

export interface AppSessionConfig {
  participants: [Address, Address]; // [writer, buyer] or [user, clearnode]
  initialAllocations: RPCAppSessionAllocation[];
  challengePeriod?: number;
}

export interface AppSession {
  sessionId: Hex;
  definition: RPCAppDefinition;
  allocations: RPCAppSessionAllocation[];
  createdAt: number;
  status: 'active' | 'closing' | 'closed';
}

interface RpcResponse {
  method: string;
  data: unknown;
  raw: unknown;
}

/**
 * Manages app sessions for OptiChannel.
 * An app session represents a trading relationship between two parties.
 */
export class SessionManager {
  private client: YellowClient;
  private sessions: Map<Hex, AppSession> = new Map();

  constructor(client: YellowClient) {
    this.client = client;
  }

  /**
   * Creates a new options trading app session.
   */
  async createOptionsSession(config: AppSessionConfig): Promise<AppSession> {
    const { participants, initialAllocations, challengePeriod = 0 } = config;

    // Define the options application
    const definition: RPCAppDefinition = {
      application: OPTICHANNEL_PROTOCOL,
      protocol: 'NitroRPC/0.2' as RPCProtocolVersion,
      participants: participants as Hex[],
      weights: [50, 50], // Equal participation
      quorum: 100, // Both parties must agree
      challenge: challengePeriod,
      nonce: Date.now(),
    };

    const request: CreateAppSessionRequestParams = {
      definition,
      allocations: initialAllocations,
    };

    console.log('[Session] Creating options session...');
    const response = await this.client.createAppSession(request) as RpcResponse;

    if (response.method === 'error') {
      throw new Error(`Failed to create session: ${JSON.stringify(response.data)}`);
    }

    // Extract session ID from response
    const sessionId = this.extractSessionId(response);

    const session: AppSession = {
      sessionId,
      definition,
      allocations: initialAllocations,
      createdAt: Date.now(),
      status: 'active',
    };

    this.sessions.set(sessionId, session);
    console.log(`[Session] Created session: ${sessionId}`);

    return session;
  }

  /**
   * Sends an application message within a session.
   */
  async sendMessage(sessionId: Hex, messageType: string, data: unknown): Promise<RpcResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'active') {
      throw new Error(`Session is not active: ${session.status}`);
    }

    const messageParams = [messageType, data];
    return this.client.sendApplicationMessage(sessionId, messageParams) as Promise<RpcResponse>;
  }

  /**
   * Closes an app session with final allocations.
   */
  async closeSession(sessionId: Hex, finalAllocations: RPCAppSessionAllocation[]): Promise<RpcResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.status = 'closing';

    const request: CloseAppSessionRequestParams = {
      app_session_id: sessionId,
      allocations: finalAllocations,
    };

    console.log(`[Session] Closing session: ${sessionId}...`);
    const response = await this.client.closeAppSession(request) as RpcResponse;

    if (response.method !== 'error') {
      session.status = 'closed';
      console.log(`[Session] Session closed: ${sessionId}`);
    }

    return response;
  }

  /**
   * Gets all active sessions.
   */
  getActiveSessions(): AppSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === 'active');
  }

  /**
   * Gets a session by ID.
   */
  getSession(sessionId: Hex): AppSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Updates session allocations locally (after receiving state update).
   */
  updateSessionAllocations(sessionId: Hex, allocations: RPCAppSessionAllocation[]): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.allocations = allocations;
    }
  }

  private extractSessionId(response: RpcResponse): Hex {
    // The session ID should be in the response data
    const data = response.data;
    if (data && typeof data === 'object' && 'app_session_id' in data) {
      return (data as { app_session_id: string }).app_session_id as Hex;
    }
    if (Array.isArray(data) && data.length > 0) {
      const sessionData = data[0];
      if (typeof sessionData === 'object' && sessionData !== null && 'app_session_id' in sessionData) {
        return sessionData.app_session_id as Hex;
      }
      if (typeof sessionData === 'string' && sessionData.startsWith('0x')) {
        return sessionData as Hex;
      }
    }

    // Generate a temporary ID if not found (shouldn't happen in production)
    console.warn('[Session] Could not extract session ID from response, using timestamp');
    return `0x${Date.now().toString(16).padStart(64, '0')}` as Hex;
  }
}

/**
 * Helper to create allocation objects.
 */
export function createAllocation(
  participant: Address,
  asset: string,
  amount: string | bigint
): RPCAppSessionAllocation {
  return {
    participant,
    asset,
    amount: typeof amount === 'bigint' ? amount.toString() : amount,
  };
}

/**
 * Helper to create USDC allocations (6 decimals).
 */
export function createUsdcAllocation(participant: Address, amount: number): RPCAppSessionAllocation {
  // USDC has 6 decimals, so 1 USDC = 1_000_000
  const amountInUnits = Math.floor(amount * 1_000_000).toString();
  return createAllocation(participant, 'usdc', amountInUnits);
}

/**
 * Helper to create ETH allocations (18 decimals).
 */
export function createEthAllocation(participant: Address, amount: number): RPCAppSessionAllocation {
  // ETH has 18 decimals
  const amountInWei = BigInt(Math.floor(amount * 1e18)).toString();
  return createAllocation(participant, 'eth', amountInWei);
}
