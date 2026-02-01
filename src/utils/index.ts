import { Hex } from 'viem';

/**
 * Generates a unique ID for options and orders.
 */
export function generateId(): Hex {
  const timestamp = Date.now().toString(16);
  const random = Math.random().toString(16).slice(2, 10);
  return `0x${timestamp}${random}`.padEnd(66, '0') as Hex;
}

/**
 * Formats a bigint amount to a human-readable string.
 * @param amount - The amount in base units
 * @param decimals - Number of decimals (default: 18 for ETH)
 * @param precision - Display precision (default: 4)
 */
export function formatAmount(amount: bigint, decimals = 18, precision = 4): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;

  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, precision);
  return `${whole}.${fractionStr}`;
}

/**
 * Parses a human-readable amount to bigint.
 * @param amount - The amount as a string (e.g., "1.5")
 * @param decimals - Number of decimals (default: 18 for ETH)
 */
export function parseAmount(amount: string, decimals = 18): bigint {
  const [whole, fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFraction);
}

/**
 * Formats a USD price (scaled by 1e8) to a human-readable string.
 */
export function formatUsdPrice(price: bigint, precision = 2): string {
  return formatAmount(price, 8, precision);
}

/**
 * Converts a timestamp to a human-readable expiry string.
 */
export function formatExpiry(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString().split('T')[0];
}

/**
 * Calculates the time until expiry.
 */
export function timeUntilExpiry(expiryTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = expiryTimestamp - now;

  if (diff <= 0) return 'Expired';

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Checks if an option has expired.
 */
export function isExpired(expiryTimestamp: number): boolean {
  return Math.floor(Date.now() / 1000) >= expiryTimestamp;
}

/**
 * Truncates an address for display.
 */
export function truncateAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Sleep utility for async operations.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
