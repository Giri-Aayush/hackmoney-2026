'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useApiWallet, usePrice } from '@/hooks/use-api';
import { useYellow } from '@/lib/yellow';
import { CreateOptionForm } from '@/components/trade/create-option-form';
import { OptionsTable } from '@/components/trade/options-table';
import { OptionsChain } from '@/components/trade/options-chain';
import { YellowConnectButton, YellowBalance, DepositWithdrawDialog } from '@/components/yellow';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Zap, AlertCircle, ArrowRight, Layers, Users } from 'lucide-react';

export default function TradePage() {
  useApiWallet();
  const { data: price } = usePrice();
  const { isConnected } = useAccount();
  const { isAuthenticated } = useYellow();
  const [showDepositDialog, setShowDepositDialog] = useState(false);
  const [depositTab, setDepositTab] = useState<'deposit' | 'withdraw'>('deposit');

  const handleDeposit = () => {
    setDepositTab('deposit');
    setShowDepositDialog(true);
  };

  const handleWithdraw = () => {
    setDepositTab('withdraw');
    setShowDepositDialog(true);
  };

  return (
    <div className="container py-8">
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">Trade Options</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Create and trade ETH options with zero gas fees
            </p>
          </div>
          {price?.price && (
            <Card className="w-fit glass-card">
              <CardContent className="py-2.5 sm:py-3 px-3 sm:px-4 flex items-center gap-2 sm:gap-3">
                <span className="text-xs sm:text-sm text-muted-foreground">ETH/USD</span>
                <span className="text-lg sm:text-xl font-bold">
                  ${price.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <Badge variant="outline" className="text-[10px] sm:text-xs text-amber-500 border-amber-500/30">
                  Live
                </Badge>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Gasless Trading Banner */}
        {isConnected && !isAuthenticated && (
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-full bg-amber-500/10">
                    <Zap className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Enable Gasless Trading</h3>
                    <p className="text-sm text-muted-foreground">
                      Connect to Yellow Network state channels to trade without gas fees.
                      Sign once, trade unlimited times.
                    </p>
                  </div>
                </div>
                <YellowConnectButton variant="compact" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Authenticated Trading Panel */}
        {isConnected && isAuthenticated && (
          <Card className="border-amber-500/30 bg-linear-to-r from-amber-500/5 to-transparent">
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-amber-500/10">
                    <Zap className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Gasless Trading Active</h3>
                      <Badge className="bg-amber-500/10 text-amber-500 text-xs">
                        State Channel
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      All trades are instant and gas-free. Settle on-chain anytime.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleDeposit} className="border-amber-500/30 hover:bg-amber-500/10">
                    Deposit
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleWithdraw} className="border-white/10 hover:bg-white/5">
                    Withdraw
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Not Connected Warning */}
        {!isConnected && (
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-amber-500">Connect Your Wallet</h3>
                  <p className="text-sm text-muted-foreground">
                    Connect your wallet to start trading options with zero gas fees.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Trading Grid */}
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6 order-2 lg:order-1">
            <Tabs defaultValue="protocol" className="space-y-4">
              <TabsList className="bg-white/5 border border-white/10">
                <TabsTrigger value="protocol" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-500">
                  <Layers className="h-4 w-4 mr-2" />
                  Protocol Options
                </TabsTrigger>
                <TabsTrigger value="user" className="data-[state=active]:bg-white/10">
                  <Users className="h-4 w-4 mr-2" />
                  User Options
                </TabsTrigger>
              </TabsList>
              <TabsContent value="protocol" className="mt-4">
                <OptionsChain />
              </TabsContent>
              <TabsContent value="user" className="mt-4">
                <OptionsTable />
              </TabsContent>
            </Tabs>
          </div>
          <div className="space-y-4 sm:space-y-6 order-1 lg:order-2">
            {/* Yellow Balance Card - Show for all connected wallets */}
            {isConnected && (
              <YellowBalance
                onDeposit={handleDeposit}
                onWithdraw={handleWithdraw}
              />
            )}

            {/* Create Option Form */}
            <CreateOptionForm />

            {/* How It Works Card */}
            <Card className="glass-card">
              <CardContent className="py-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm sm:text-base">
                  <Zap className="h-4 w-4 text-amber-500" />
                  How Gasless Trading Works
                </h3>
                <ol className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="font-medium text-amber-500">1.</span>
                    <span>Deposit USDC to state channel (one-time gas)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-medium text-amber-500">2.</span>
                    <span>Trade unlimited times with zero gas</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-medium text-amber-500">3.</span>
                    <span>Withdraw anytime to settle on-chain</span>
                  </li>
                </ol>
                <div className="mt-4 pt-4 border-t border-white/5">
                  <a
                    href="https://docs.yellow.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs sm:text-sm text-amber-500 hover:text-amber-400 flex items-center gap-1"
                  >
                    Learn more about Yellow Network
                    <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Deposit/Withdraw Dialog */}
        <DepositWithdrawDialog
          open={showDepositDialog}
          onOpenChange={setShowDepositDialog}
          defaultTab={depositTab}
        />
      </div>
    </div>
  );
}
