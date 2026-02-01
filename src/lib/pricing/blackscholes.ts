/**
 * Black-Scholes Option Pricing Model
 *
 * Industry-standard model for European option pricing.
 * Calculates fair value and Greeks (Delta, Gamma, Theta, Vega, Rho).
 */

export interface BlackScholesInput {
  spot: number;           // Current price of underlying (S)
  strike: number;         // Strike price (K)
  timeToExpiry: number;   // Time to expiry in years (T)
  volatility: number;     // Annualized volatility (σ) as decimal (e.g., 0.5 for 50%)
  riskFreeRate: number;   // Risk-free interest rate as decimal (e.g., 0.05 for 5%)
  optionType: 'call' | 'put';
}

export interface Greeks {
  delta: number;    // Price sensitivity to underlying (∂V/∂S)
  gamma: number;    // Delta sensitivity to underlying (∂²V/∂S²)
  theta: number;    // Time decay per day (∂V/∂t)
  vega: number;     // Volatility sensitivity (∂V/∂σ) per 1% vol change
  rho: number;      // Interest rate sensitivity (∂V/∂r) per 1% rate change
}

export interface BlackScholesResult {
  price: number;
  greeks: Greeks;
  intrinsicValue: number;
  timeValue: number;
  breakeven: number;
}

// Standard normal cumulative distribution function
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

// Standard normal probability density function
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Calculate d1 and d2 parameters
function calculateD1D2(
  S: number,
  K: number,
  T: number,
  sigma: number,
  r: number
): { d1: number; d2: number } {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return { d1, d2 };
}

export function blackScholes(input: BlackScholesInput): BlackScholesResult {
  const { spot: S, strike: K, timeToExpiry: T, volatility: sigma, riskFreeRate: r, optionType } = input;

  // Handle edge cases
  if (T <= 0) {
    // At expiry - only intrinsic value
    const intrinsic = optionType === 'call'
      ? Math.max(0, S - K)
      : Math.max(0, K - S);
    return {
      price: intrinsic,
      greeks: {
        delta: optionType === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
        gamma: 0,
        theta: 0,
        vega: 0,
        rho: 0,
      },
      intrinsicValue: intrinsic,
      timeValue: 0,
      breakeven: optionType === 'call' ? K : K,
    };
  }

  const { d1, d2 } = calculateD1D2(S, K, T, sigma, r);
  const sqrtT = Math.sqrt(T);

  let price: number;
  let delta: number;
  let rho: number;

  if (optionType === 'call') {
    price = S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
    delta = normalCDF(d1);
    rho = K * T * Math.exp(-r * T) * normalCDF(d2) / 100; // Per 1% change
  } else {
    price = K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
    delta = normalCDF(d1) - 1;
    rho = -K * T * Math.exp(-r * T) * normalCDF(-d2) / 100; // Per 1% change
  }

  // Greeks (same for calls and puts except delta and rho)
  const gamma = normalPDF(d1) / (S * sigma * sqrtT);

  // Theta: daily decay (divide annual by 365)
  const thetaAnnual = optionType === 'call'
    ? -(S * normalPDF(d1) * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * normalCDF(d2)
    : -(S * normalPDF(d1) * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * normalCDF(-d2);
  const theta = thetaAnnual / 365;

  // Vega: per 1% volatility change
  const vega = S * sqrtT * normalPDF(d1) / 100;

  // Intrinsic and time value
  const intrinsicValue = optionType === 'call'
    ? Math.max(0, S - K)
    : Math.max(0, K - S);
  const timeValue = Math.max(0, price - intrinsicValue);

  // Breakeven
  const breakeven = optionType === 'call' ? K + price : K - price;

  return {
    price: Math.max(0, price),
    greeks: {
      delta,
      gamma,
      theta,
      vega,
      rho,
    },
    intrinsicValue,
    timeValue,
    breakeven,
  };
}

/**
 * Calculate implied volatility using Newton-Raphson method
 */
export function impliedVolatility(
  marketPrice: number,
  spot: number,
  strike: number,
  timeToExpiry: number,
  riskFreeRate: number,
  optionType: 'call' | 'put',
  maxIterations = 100,
  tolerance = 0.0001
): number {
  let sigma = 0.5; // Initial guess: 50% volatility

  for (let i = 0; i < maxIterations; i++) {
    const result = blackScholes({
      spot,
      strike,
      timeToExpiry,
      volatility: sigma,
      riskFreeRate,
      optionType,
    });

    const diff = result.price - marketPrice;

    if (Math.abs(diff) < tolerance) {
      return sigma;
    }

    // Vega in absolute terms (not per 1%)
    const vegaAbs = result.greeks.vega * 100;

    if (vegaAbs < 0.0001) {
      // Vega too small, can't converge
      break;
    }

    sigma = sigma - diff / vegaAbs;

    // Bound sigma to reasonable range
    sigma = Math.max(0.01, Math.min(5.0, sigma));
  }

  return sigma;
}

/**
 * Get historical volatility estimate from price data
 */
export function historicalVolatility(prices: number[], periodsPerYear = 365): number {
  if (prices.length < 2) return 0.5; // Default to 50%

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const dailyStdDev = Math.sqrt(variance);

  // Annualize
  return dailyStdDev * Math.sqrt(periodsPerYear);
}

/**
 * Calculate probability of profit at expiry
 */
export function probabilityOfProfit(
  spot: number,
  strike: number,
  timeToExpiry: number,
  volatility: number,
  riskFreeRate: number,
  premium: number,
  optionType: 'call' | 'put'
): number {
  const breakeven = optionType === 'call' ? strike + premium : strike - premium;
  const { d2 } = calculateD1D2(spot, breakeven, timeToExpiry, volatility, riskFreeRate);

  return optionType === 'call' ? normalCDF(d2) : normalCDF(-d2);
}
