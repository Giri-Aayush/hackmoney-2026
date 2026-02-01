// Yellow Network SDK wrapper for OptiChannel
export * from './client.js';
export * from './session.js';

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
