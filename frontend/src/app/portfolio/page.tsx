'use client';

import { useAccount, useBalance } from 'wagmi';
import { useApiWallet, useOptions, usePrice } from '@/hooks/use-api';
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
import { Wallet, TrendingUp, TrendingDown, AlertCircle, Briefcase } from 'lucide-react';
import Link from 'next/link';

const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

export default function PortfolioPage() {
  useApiWallet();
  const { address, isConnected } = useAccount();
  const { data: ethBalance } = useBalance({ address });
  const { data: usdcBalance } = useBalance({
    address,
    token: USDC_ADDRESS,
  });
  const { data: options } = useOptions();
  const { data: price } = usePrice();

  // Filter options owned by the user
  const myPositions = options?.filter(
    (o) => o.buyer?.toLowerCase() === address?.toLowerCase() &&
    (o.status === 'filled' || o.status === 'open')
  ) || [];

  const myWrittenOptions = options?.filter(
    (o) => o.writer.toLowerCase() === address?.toLowerCase() && o.status === 'open'
  ) || [];

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

  // Calculate portfolio value
  const totalPositionValue = myPositions.reduce((sum, o) => {
    if (!price) return sum;
    const intrinsicValue =
      o.type === 'call'
        ? Math.max(0, price.price - o.strike)
        : Math.max(0, o.strike - price.price);
    return sum + intrinsicValue * o.amount;
  }, 0);

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
        <div className="grid gap-4 md:grid-cols-3">
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
              <CardTitle className="text-sm font-medium text-muted-foreground">USDC Balance</CardTitle>
              <Wallet className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <span className="gradient-text">$</span>
                {usdcBalance
                  ? parseFloat(usdcBalance.formatted).toFixed(2)
                  : '0.00'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Available for trading
              </p>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myPositions.map((option) => {
                      const currentPrice = price?.price || 0;
                      const intrinsicValue =
                        option.type === 'call'
                          ? Math.max(0, currentPrice - option.strike)
                          : Math.max(0, option.strike - currentPrice);
                      const pnl = intrinsicValue - option.premium;
                      const isProfit = pnl > 0;

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
                          <TableCell className="text-muted-foreground">
                            {new Date(option.expiry).toLocaleDateString()}
                          </TableCell>
                          <TableCell>${option.premium.toFixed(2)}</TableCell>
                          <TableCell>${intrinsicValue.toFixed(2)}</TableCell>
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
                              ${Math.abs(pnl).toFixed(2)}
                            </div>
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
                      <TableHead className="text-muted-foreground">Premium</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myWrittenOptions.map((option) => (
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
                        <TableCell className="text-muted-foreground">
                          {new Date(option.expiry).toLocaleDateString()}
                        </TableCell>
                        <TableCell>${option.premium.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-amber-500/30 text-amber-500">
                            {option.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
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
