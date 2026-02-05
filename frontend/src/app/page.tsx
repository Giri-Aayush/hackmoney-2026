'use client';

import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useApiWallet, usePrice, useVolume, useOptionStats } from '@/hooks/use-api';
import { useYellow } from '@/lib/yellow';
import { YellowConnectButton } from '@/components/yellow';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  Zap,
  ArrowRight,
  Shield,
  TrendingUp,
  Wallet,
  RefreshCcw,
  ChevronRight,
  BarChart3,
  Lock,
  Clock,
  ArrowUpRight,
  Layers,
} from 'lucide-react';

// Floating Dashboard Card Component
function FloatingDashboardCard({ className = '' }: { className?: string }) {
  const { data: price } = usePrice();

  return (
    <div className={`glass-card rounded-2xl p-5 w-[280px] ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-muted-foreground">Portfolio Value</span>
        <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-[10px]">
          <span className="relative flex h-1.5 w-1.5 mr-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
          </span>
          Live
        </Badge>
      </div>
      <div className="text-3xl font-bold mb-1">
        $<span className="gradient-text">12,450</span>.00
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-emerald-500 flex items-center">
          <ArrowUpRight className="h-3 w-3 mr-1" />
          +12.5%
        </span>
        <span className="text-muted-foreground">24h</span>
      </div>

      <div className="mt-5 pt-4 border-t border-white/5">
        <div className="text-xs text-muted-foreground mb-2">Active Positions</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                <TrendingUp className="h-3 w-3 text-amber-500" />
              </div>
              <span className="text-sm">ETH Call</span>
            </div>
            <span className="text-sm text-emerald-500">+$245</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                <TrendingUp className="h-3 w-3 text-red-500 rotate-180" />
              </div>
              <span className="text-sm">ETH Put</span>
            </div>
            <span className="text-sm text-red-500">-$82</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Price Card Component
function FloatingPriceCard({ className = '' }: { className?: string }) {
  const { data: price } = usePrice();

  return (
    <div className={`glass-card rounded-2xl p-5 w-[240px] ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center">
          <span className="text-lg">Ξ</span>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">ETH/USD</div>
          <div className="text-xl font-bold">
            {price?.price ? `$${price.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '---'}
          </div>
        </div>
      </div>
      <div className="h-16 flex items-end gap-1">
        {[40, 55, 45, 60, 50, 70, 65, 80, 75, 85, 78, 90].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-gradient-to-t from-amber-500/40 to-amber-500/10"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Pyth Oracle</span>
        <span className="text-amber-500">Real-time</span>
      </div>
    </div>
  );
}

// Feature Step Component
function FeatureStep({
  number,
  title,
  description,
  icon: Icon,
  highlight
}: {
  number: string;
  title: string;
  description: string;
  icon: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <div className={`relative p-6 rounded-2xl transition-all duration-300 ${
      highlight
        ? 'glass-card border-amber-500/20'
        : 'bg-white/[0.02] border border-white/5 hover:border-amber-500/20'
    }`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
          highlight
            ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-black'
            : 'bg-white/5 text-amber-500'
        }`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-amber-500 mb-1">Step {number}</div>
          <h3 className="text-lg font-semibold mb-2">{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

// Stats Counter Component
function StatCounter({ value, label, suffix = '' }: { value: string; label: string; suffix?: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl md:text-4xl font-bold mb-2">
        <span className="gradient-text">{value}</span>
        <span className="text-muted-foreground">{suffix}</span>
      </div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

export default function LandingPage() {
  useApiWallet();
  const { isConnected } = useAccount();
  const { isAuthenticated } = useYellow();
  const { data: price } = usePrice();
  const { data: volume } = useVolume();
  const { data: stats } = useOptionStats();

  return (
    <div className="relative">
      {/* Ambient Glow Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-amber-500/10 rounded-full blur-[120px] animate-pulse-glow" />
        <div className="absolute top-40 left-1/4 w-[400px] h-[400px] bg-amber-600/5 rounded-full blur-[100px]" />
        <div className="absolute top-60 right-1/4 w-[300px] h-[300px] bg-orange-500/5 rounded-full blur-[80px]" />
      </div>

      {/* Hero Section */}
      <section className="relative pt-8 pb-32 overflow-hidden">
        <div className="container relative">
          {/* Badge */}
          <div className="flex justify-center mb-8 animate-fade-in-up">
            <Badge
              variant="outline"
              className="px-4 py-2 text-sm bg-amber-500/5 border-amber-500/20 text-amber-500 backdrop-blur-sm"
            >
              <Zap className="h-3.5 w-3.5 mr-2" />
              Built on Yellow Network State Channels
            </Badge>
          </div>

          {/* Main Headline */}
          <div className="text-center max-w-4xl mx-auto mb-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-serif tracking-tight mb-6 animate-fade-in-up delay-100">
              Trade ETH Options
              <br />
              <span className="gradient-text">with Zero Gas</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto animate-fade-in-up delay-200">
              Optix brings gasless options trading to Ethereum.
              Deposit once, trade unlimited times through state channels.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-fade-in-up delay-300">
            {!isConnected ? (
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <Button
                    size="lg"
                    onClick={openConnectModal}
                    className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold px-8 h-12 rounded-xl"
                  >
                    Connect Wallet
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </ConnectButton.Custom>
            ) : !isAuthenticated ? (
              <YellowConnectButton />
            ) : (
              <Link href="/trade">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold px-8 h-12 rounded-xl"
                >
                  Start Trading
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            )}
            <Link href="#how-it-works">
              <Button
                variant="outline"
                size="lg"
                className="border-white/10 hover:border-amber-500/30 hover:bg-amber-500/5 px-8 h-12 rounded-xl"
              >
                Learn More
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>

          {/* Floating Cards Display */}
          <div className="relative h-[400px] md:h-[350px] hidden md:block">
            {/* Center decorative element */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-white/[0.03]" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full border border-white/[0.05]" />

            {/* Dashboard Card - Left */}
            <div className="absolute left-[5%] lg:left-[15%] top-0 animate-float">
              <FloatingDashboardCard />
            </div>

            {/* Price Card - Right */}
            <div className="absolute right-[5%] lg:right-[15%] top-16 animate-float-delayed">
              <FloatingPriceCard />
            </div>

            {/* Small Stats Card - Center Bottom */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 glass-card rounded-xl px-6 py-3 animate-float">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm text-muted-foreground">Gasless</span>
                </div>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-muted-foreground">Secured by Ethereum</span>
                </div>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-muted-foreground">Instant Settlement</span>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-4">
            <FloatingPriceCard className="mx-auto" />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative py-16 border-y border-white/5">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatCounter value="$0" suffix="" label="Gas Fees Per Trade" />
            <StatCounter
              value={price ? `$${Math.round(price.price).toLocaleString()}` : '$--'}
              label="ETH/USD Price"
            />
            <StatCounter
              value={stats?.totalOptions?.toString() || '0'}
              label="Options Created"
            />
            <StatCounter value="<1s" label="Settlement Time" />
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="relative py-24">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4 text-amber-500 border-amber-500/20">
              How It Works
            </Badge>
            <h2 className="text-3xl md:text-4xl font-serif mb-4">
              Three Steps to
              <span className="gradient-text"> Gasless Trading</span>
            </h2>
            <p className="text-muted-foreground">
              Trade options without paying gas on every transaction.
              Yellow Network state channels make it possible.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <FeatureStep
              number="01"
              title="Deposit USDC"
              description="Make a single on-chain deposit to open your state channel. This is the only gas you'll pay."
              icon={Wallet}
            />
            <FeatureStep
              number="02"
              title="Trade Options"
              description="Create, buy, and sell ETH options instantly. Every trade is gasless and settles in milliseconds."
              icon={RefreshCcw}
              highlight
            />
            <FeatureStep
              number="03"
              title="Withdraw Anytime"
              description="Close your channel and withdraw funds to your wallet whenever you want. Full custody, always."
              icon={ArrowUpRight}
            />
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative py-24 bg-gradient-to-b from-transparent via-amber-500/[0.02] to-transparent">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4 text-amber-500 border-amber-500/20">
              Features
            </Badge>
            <h2 className="text-3xl md:text-4xl font-serif mb-4">
              Professional-Grade
              <span className="gradient-text"> Options Trading</span>
            </h2>
            <p className="text-muted-foreground">
              Everything you need to trade ETH options with confidence.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {/* Feature Cards */}
            {[
              {
                icon: Zap,
                title: 'Zero Gas Fees',
                description: 'Trade as much as you want without worrying about gas costs eating into your profits.',
              },
              {
                icon: Shield,
                title: 'On-Chain Security',
                description: 'Funds secured by Ethereum smart contracts. Non-custodial and fully transparent.',
              },
              {
                icon: BarChart3,
                title: 'Pyth Oracle Pricing',
                description: 'Real-time ETH/USD prices from Pyth Network for accurate options pricing.',
              },
              {
                icon: Clock,
                title: 'Instant Settlement',
                description: 'Trades settle in milliseconds through state channels. No waiting for block confirmations.',
              },
              {
                icon: Layers,
                title: 'Calls & Puts',
                description: 'Trade both call and put options on ETH with customizable strike prices and expiries.',
              },
              {
                icon: Lock,
                title: 'Self Custody',
                description: 'Your keys, your coins. Withdraw to your wallet at any time with full control.',
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="group p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-amber-500/20 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition-colors">
                  <feature.icon className="h-5 w-5 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24">
        <div className="container">
          <div className="relative max-w-4xl mx-auto">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 via-amber-600/10 to-amber-500/20 blur-3xl opacity-50" />

            <div className="relative glass-card rounded-3xl p-8 md:p-12 text-center overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute top-0 left-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl" />
              <div className="absolute bottom-0 right-0 w-40 h-40 bg-amber-600/10 rounded-full blur-2xl" />

              <div className="relative">
                <h2 className="text-3xl md:text-4xl font-serif mb-4">
                  Ready to Trade
                  <span className="gradient-text"> Gas-Free?</span>
                </h2>
                <p className="text-muted-foreground max-w-xl mx-auto mb-8">
                  Join the future of options trading. Connect your wallet and start trading
                  ETH options with zero gas fees on every trade.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  {!isConnected ? (
                    <ConnectButton.Custom>
                      {({ openConnectModal }) => (
                        <Button
                          size="lg"
                          onClick={openConnectModal}
                          className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold px-8 h-12 rounded-xl"
                        >
                          Connect Wallet
                          <Wallet className="h-4 w-4 ml-2" />
                        </Button>
                      )}
                    </ConnectButton.Custom>
                  ) : (
                    <Link href="/trade">
                      <Button
                        size="lg"
                        className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold px-8 h-12 rounded-xl"
                      >
                        Launch App
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  )}
                </div>

                {/* Trust badges */}
                <div className="flex items-center justify-center gap-6 mt-8 pt-8 border-t border-white/5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Shield className="h-4 w-4 text-amber-500" />
                    <span>Audited Contracts</span>
                  </div>
                  <div className="w-px h-4 bg-white/10" />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Lock className="h-4 w-4 text-amber-500" />
                    <span>Non-Custodial</span>
                  </div>
                  <div className="w-px h-4 bg-white/10" />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Zap className="h-4 w-4 text-amber-500" />
                    <span>Yellow Network</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-12 border-t border-white/5">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center">
                <Zap className="h-4 w-4 text-black" />
              </div>
              <span className="font-semibold">Optix</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <span>Built for HackMoney 2026</span>
              <div className="w-px h-4 bg-white/10" />
              <span>Powered by Yellow Network</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
