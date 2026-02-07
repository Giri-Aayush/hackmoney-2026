// Yellow Network SDK wrapper for Optix
export * from './client.js';
export * from './session.js';
export * from './trading.js';

// Re-export commonly used types and helpers from nitrolite
export {
  createECDSAMessageSigner,
  RPCProtocolVersion,
  type MessageSigner,
  type RPCAppDefinition,
  type RPCAppSessionAllocation,
  type CreateAppSessionRequestParams,
  type CloseAppSessionRequestParams,
} from '@erc7824/nitrolite';
