import {
  createWalletClient,
  http,
  keccak256,
  toBytes,
  serializeSignature,
  type WalletClient,
  type Account,
  type Chain,
  type Transport,
  type Hex,
  type Address,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount, sign } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import type { MessageSigner } from '@erc7824/nitrolite';
import { config } from '../../config/index.js';

export interface SignerConfig {
  privateKey: Hex;
  chain?: Chain;
  rpcUrl?: string;
}

export interface WalletInfo {
  address: Address;
  signer: MessageSigner;
  account: PrivateKeyAccount;
  walletClient: WalletClient<Transport, Chain, Account>;
}

/**
 * Creates a message signer from a private key.
 * The signer is used to sign messages for Yellow Network RPC communication.
 *
 * IMPORTANT: This signs plain JSON payloads (not EIP-191) for cross-chain compatibility.
 * The ClearNode expects raw ECDSA signatures over keccak256(JSON.stringify(payload)).
 */
export function createMessageSignerFromPrivateKey(privateKey: Hex): MessageSigner {
  return async (payload) => {
    // Serialize the payload to a deterministic JSON string
    const message = JSON.stringify(payload);

    // Hash the message using keccak256 (same as ethers.id)
    const messageHash = keccak256(toBytes(message));

    // Sign the raw hash without EIP-191 prefix
    // This is required for ClearNode compatibility and cross-chain support
    const signatureObj = await sign({
      hash: messageHash,
      privateKey,
    });

    // Serialize the signature to a hex string (r + s + v format)
    const signature = serializeSignature(signatureObj);

    return signature;
  };
}

/**
 * Creates a wallet client and message signer from a private key.
 */
export function createWalletFromPrivateKey(cfg?: Partial<SignerConfig>): WalletInfo {
  const privateKey = (cfg?.privateKey || config.wallet.privateKey) as Hex;

  if (!privateKey) {
    throw new Error('Private key is required. Set PRIVATE_KEY in .env file.');
  }

  const chain = cfg?.chain || arbitrumSepolia;
  const rpcUrl = cfg?.rpcUrl || config.chain.rpcUrl;

  // Create account from private key
  const account = privateKeyToAccount(privateKey);

  // Create wallet client
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  // Create message signer with the private key
  const signer = createMessageSignerFromPrivateKey(privateKey);

  return {
    address: account.address,
    signer,
    account,
    walletClient,
  };
}

/**
 * Creates a wallet info object from an existing account with private key.
 * Use this when you have both the account and the original private key.
 */
export function createWalletFromAccountWithKey(
  account: PrivateKeyAccount,
  privateKey: Hex,
  chain?: Chain,
  rpcUrl?: string
): WalletInfo {
  const walletClient = createWalletClient({
    account,
    chain: chain || arbitrumSepolia,
    transport: http(rpcUrl || config.chain.rpcUrl),
  });

  const signer = createMessageSignerFromPrivateKey(privateKey);

  return {
    address: account.address,
    signer,
    account,
    walletClient,
  };
}

// Alias for backwards compatibility
export const createMessageSigner = createMessageSignerFromPrivateKey;

/**
 * Validates that a private key is in the correct format.
 */
export function isValidPrivateKey(key: string): boolean {
  // Private key should be 64 hex characters (32 bytes) with optional 0x prefix
  const hexRegex = /^(0x)?[0-9a-fA-F]{64}$/;
  return hexRegex.test(key);
}

/**
 * Formats a private key to ensure it has the 0x prefix.
 */
export function formatPrivateKey(key: string): Hex {
  if (!isValidPrivateKey(key)) {
    throw new Error('Invalid private key format');
  }
  return (key.startsWith('0x') ? key : `0x${key}`) as Hex;
}
