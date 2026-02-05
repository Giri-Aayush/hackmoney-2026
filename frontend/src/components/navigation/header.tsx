'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Zap, BarChart3, Wallet, LineChart, Menu, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { YellowConnectButton, YellowStatus } from '@/components/yellow';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

const navItems = [
  { href: '/', label: 'Home', icon: Zap },
  { href: '/trade', label: 'Trade', icon: TrendingUp },
  { href: '/portfolio', label: 'Portfolio', icon: Wallet },
  { href: '/analytics', label: 'Analytics', icon: LineChart },
];

export function Header() {
  const pathname = usePathname();
  const { isConnected } = useAccount();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-amber-500 to-amber-600 shadow-lg shadow-amber-500/20 transition-shadow group-hover:shadow-amber-500/30">
              <Zap className="h-4 w-4 text-black" />
            </div>
            <span className="text-lg font-semibold hidden sm:inline tracking-tight">Optix</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-amber-500/10 text-amber-500'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Yellow Network Status - Desktop */}
          {isConnected && (
            <div className="hidden lg:flex items-center gap-3">
              <YellowStatus />
              <Separator orientation="vertical" className="h-6 bg-white/10" />
            </div>
          )}

          {/* Yellow Connect Button - Desktop */}
          {isConnected && (
            <div className="hidden sm:block">
              <YellowConnectButton variant="compact" />
            </div>
          )}

          {/* Wallet Connect */}
          <ConnectButton
            chainStatus="icon"
            accountStatus={{
              smallScreen: 'avatar',
              largeScreen: 'full',
            }}
            showBalance={{
              smallScreen: false,
              largeScreen: true,
            }}
          />

          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="hover:bg-white/5">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 bg-background/95 backdrop-blur-xl border-white/5">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-amber-500 to-amber-600">
                    <Zap className="h-4 w-4 text-black" />
                  </div>
                  Optix
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-4">
                {/* Yellow Network Status - Mobile */}
                {isConnected && (
                  <>
                    <div className="flex items-center justify-between px-2">
                      <span className="text-sm text-muted-foreground">State Channel</span>
                      <YellowStatus />
                    </div>
                    <YellowConnectButton />
                    <Separator className="bg-white/5" />
                  </>
                )}

                {/* Navigation - Mobile */}
                <nav className="flex flex-col gap-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-amber-500/10 text-amber-500'
                            : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
