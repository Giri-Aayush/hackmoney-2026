'use client';

import { useAccount, useBalance } from 'wagmi';
import { useApiWallet, usePositions, usePrice, useTradingBalance, useExerciseOption } from '@/hooks/use-api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Wallet, TrendingUp, TrendingDown, AlertCircle, Briefcase, Clock, Zap } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// Helper to format time remaining
function formatTimeRemaining(expiryTimestamp: number): { text: string; isExpired: boolean; isUrgent: boolean } {
  const now = Date.now();
  const expiry = expiryTimestamp * 1000; // Convert to milliseconds
  const diff = expiry - now;

  if (diff <= 0) {
    return { text: 'Expired', isExpired: true, isUrgent: false };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const isUrgent = hours < 1;

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return { text: `${days}d ${hours % 24}h`, isExpired: false, isUrgent: false };
  } else if (hours > 0) {
    return { text: `${hours}h ${minutes}m`, isExpired: false, isUrgent };
  } else {
    return { text: `${minutes}m ${seconds}s`, isExpired: false, isUrgent: true };
  }
}

const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

export default function PortfolioPage() {
  useApiWallet();
  const { address, isConnected } = useAccount();
  const { data: ethBalance } = useBalance({ address });
  const { data: usdcBalance } = useBalance({
    address,
    token: USDC_ADDRESS,
  });
  const { data: positions } = usePositions();
  const { data: price } = usePrice();
  const { data: tradingBalance } = useTradingBalance();
  const exerciseOption = useExerciseOption();
  const queryClient = useQueryClient();
  const [exercisingId, setExercisingId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Update timer every second
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Get positions from the dedicated endpoint
  const myPositions = positions?.bought || [];
  const myWrittenOptions = positions?.written || [];

  // Handle exercise option
  const handleExercise = async (optionId: string) => {
    setExercisingId(optionId);
    try {
      await exerciseOption.mutateAsync(optionId);
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['trading-balance'] });
    } catch (error) {
      console.error('Exercise failed:', error);
    } finally {
      setExercisingId(null);
    }
  };

  if (!isConnected) {
    return (
      <div className="container py-8">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-serif tracking-tight">Portfolio</h1>
            <p className="text-muted-foreground">
              View your positions and account balance
            </p>
          </div>

          <Card className="glass-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="p-4 rounded-full bg-amber-500/10 mb-4">
                <AlertCircle className="h-8 w-8 text-amber-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Connect Your Wallet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Connect your wallet to view your portfolio and positions
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Calculate portfolio value using market value (theoretical price) not just intrinsic
  const currentPrice = price?.price ?? 0;
  const hasPriceData = price && currentPrice > 0;

  // Total market value of positions (using theoretical price which includes time value)
  const totalPositionValue = myPositions.reduce((sum, o) => {
    const amount = o.amount ?? 1;
    // Use theoretical price if available, otherwise fall back to premium paid
    const marketValuePerUnit = o.theoreticalPrice ?? o.premium ?? 0;
    return sum + marketValuePerUnit * amount;
  }, 0);

  // Calculate total P&L across all positions
  // Premium paid must also be multiplied by amount for total cost basis
  const totalPremiumPaid = myPositions.reduce((sum, o) => {
    const amount = o.amount ?? 1;
    const premium = o.premium ?? 0;
    return sum + premium * amount;
  }, 0);
  const totalPnL = totalPositionValue - totalPremiumPaid;
  const isPnLPositive = totalPnL >= 0;

  return (
    <div className="container py-8">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-serif tracking-tight">Portfolio</h1>
          <p className="text-muted-foreground">
            View your positions and account balance
          </p>
        </div>

        {/* Balance Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">ETH Balance</CardTitle>
              <Wallet className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {ethBalance
                  ? parseFloat(ethBalance.formatted).toFixed(4)
                  : '0.0000'}{' '}
                <span className="text-muted-foreground text-lg">ETH</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                For gas fees (state channels are gasless!)
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Trading Balance</CardTitle>
              <Wallet className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <span className="gradient-text">$</span>
                {tradingBalance?.available !== undefined
                  ? tradingBalance.available.toFixed(2)
                  : '0.00'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Available for gasless trading
              </p>
              {(tradingBalance?.available ?? 0) === 0 && (
                <p className="text-xs text-amber-500 mt-2">
                  Deposit USDC on the Trade page to start trading
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Positions Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${totalPositionValue.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {myPositions.length} active position{myPositions.length !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total P&L</CardTitle>
              {isPnLPositive ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${isPnLPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                {isPnLPositive ? '+' : '-'}${Math.abs(totalPnL).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {totalPremiumPaid > 0 ? (
                  <>Cost basis: ${totalPremiumPaid.toFixed(2)}</>
                ) : (
                  'Unrealized gains/losses'
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* My Positions */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-amber-500" />
              <CardTitle>My Positions</CardTitle>
            </div>
            <CardDescription>Options you own</CardDescription>
          </CardHeader>
          <CardContent>
            {myPositions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 rounded-full bg-amber-500/10 mb-4">
                  <Briefcase className="h-8 w-8 text-amber-500" />
                </div>
                <h3 className="font-semibold mb-2">No Positions Yet</h3>
                <p className="text-muted-foreground mb-4 max-w-sm">
                  You don&apos;t have any open positions yet. Start trading to build your portfolio.
                </p>
                <Link href="/trade">
                  <Button className="bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black">
                    Start Trading
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="rounded-lg border border-white/5 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-white/5">
                      <TableHead className="text-muted-foreground">Type</TableHead>
                      <TableHead className="text-muted-foreground">Strike</TableHead>
                      <TableHead className="text-muted-foreground">Expiry</TableHead>
                      <TableHead className="text-muted-foreground">Premium Paid</TableHead>
                      <TableHead className="text-muted-foreground">Current Value</TableHead>
                      <TableHead className="text-muted-foreground">P&L</TableHead>
                      <TableHead className="text-muted-foreground">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myPositions.map((option) => {
                      const strike = option.strike ?? 0;
                      const premiumPerUnit = option.premium ?? 0;
                      const amount = option.amount ?? 1;
                      const timeRemaining = formatTimeRemaining(option.expiry);

                      // Use theoretical price (market value with time value) if available
                      const marketValuePerUnit = option.theoreticalPrice ?? premiumPerUnit;

                      // Calculate total values (multiplied by amount/quantity)
                      const totalPremiumPaid = premiumPerUnit * amount;
                      const totalMarketValue = marketValuePerUnit * amount;
                      const pnl = totalMarketValue - totalPremiumPaid;
                      const isProfit = pnl >= 0;

                      // Intrinsic value for exercise decision
                      const intrinsicValue = hasPriceData
                        ? option.type === 'call'
                          ? Math.max(0, currentPrice - strike)
                          : Math.max(0, strike - currentPrice)
                        : 0;
                      const isInTheMoney = intrinsicValue > 0;
                      const canExercise = isInTheMoney && !timeRemaining.isExpired && option.status === 'filled';

                      return (
                        <TableRow key={option.id} className="hover:bg-white/[0.02] border-white/5">
                          <TableCell>
                            <Badge
                              className={
                                option.type === 'call'
                                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                  : 'bg-red-500/10 text-red-500 border-red-500/20'
                              }
                            >
                              {option.type.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            ${strike.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm">
                                {new Date(option.expiry * 1000).toLocaleDateString()}
                              </span>
                              <div className={`flex items-center gap-1 text-xs opacity-60 ${
                                timeRemaining.isExpired
                                  ? 'text-muted-foreground'
                                  : timeRemaining.isUrgent
                                    ? 'text-red-400'
                                    : 'text-amber-400'
                              }`}>
                                <Clock className="h-2.5 w-2.5" />
                                <span className="font-mono">{timeRemaining.text}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            ${totalPremiumPaid.toFixed(2)}
                            {amount !== 1 && (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({amount}x)
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={isProfit ? 'text-emerald-500 font-medium' : ''}>
                              ${totalMarketValue.toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div
                              className={`flex items-center gap-1 ${
                                isProfit ? 'text-emerald-500' : 'text-red-500'
                              }`}
                            >
                              {isProfit ? (
                                <TrendingUp className="h-4 w-4" />
                              ) : (
                                <TrendingDown className="h-4 w-4" />
                              )}
                              {isProfit ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {timeRemaining.isExpired ? (
                              <Badge variant="outline" className="text-muted-foreground">
                                Expired
                              </Badge>
                            ) : canExercise ? (
                              <Button
                                size="sm"
                                className="bg-emerald-500 hover:bg-emerald-600 text-black h-7 px-2"
                                onClick={() => handleExercise(option.id)}
                                disabled={exercisingId === option.id}
                              >
                                {exercisingId === option.id ? (
                                  'Exercising...'
                                ) : (
                                  <>
                                    <Zap className="h-3 w-3 mr-1" />
                                    Exercise
                                  </>
                                )}
                              </Button>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground border-white/10">
                                {isInTheMoney ? 'Hold' : 'OTM'}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Written Options */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-amber-500" />
              <CardTitle>Written Options</CardTitle>
            </div>
            <CardDescription>Options you&apos;ve created</CardDescription>
          </CardHeader>
          <CardContent>
            {myWrittenOptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 rounded-full bg-muted/50 mb-4">
                  <TrendingUp className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2">No Written Options</h3>
                <p className="text-muted-foreground mb-4 max-w-sm">
                  You haven&apos;t written any options yet. Write options to earn premiums.
                </p>
                <Link href="/trade">
                  <Button variant="outline" className="border-white/10 hover:bg-white/5">
                    Write an Option
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="rounded-lg border border-white/5 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-white/5">
                      <TableHead className="text-muted-foreground">Type</TableHead>
                      <TableHead className="text-muted-foreground">Strike</TableHead>
                      <TableHead className="text-muted-foreground">Expiry</TableHead>
                      <TableHead className="text-muted-foreground">Premium Earned</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myWrittenOptions.map((option) => {
                      const timeRemaining = formatTimeRemaining(option.expiry);
                      return (
                        <TableRow key={option.id} className="hover:bg-white/[0.02] border-white/5">
                          <TableCell>
                            <Badge
                              className={
                                option.type === 'call'
                                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                  : 'bg-red-500/10 text-red-500 border-red-500/20'
                              }
                            >
                              {option.type.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            ${option.strike.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm">
                                {new Date(option.expiry * 1000).toLocaleDateString()}
                              </span>
                              <div className={`flex items-center gap-1 text-xs opacity-60 ${
                                timeRemaining.isExpired
                                  ? 'text-muted-foreground'
                                  : timeRemaining.isUrgent
                                    ? 'text-red-400'
                                    : 'text-amber-400'
                              }`}>
                                <Clock className="h-2.5 w-2.5" />
                                <span className="font-mono">{timeRemaining.text}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-emerald-500">${option.premium.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              option.status === 'open'
                                ? 'border-amber-500/30 text-amber-500'
                                : option.status === 'filled'
                                  ? 'border-emerald-500/30 text-emerald-500'
                                  : 'border-white/10 text-muted-foreground'
                            }>
                              {option.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
