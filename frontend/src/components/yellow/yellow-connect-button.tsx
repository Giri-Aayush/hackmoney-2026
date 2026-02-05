'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useYellow } from '@/lib/yellow';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { YellowStatus } from './yellow-status';
import {
  Zap,
  Loader2,
  CheckCircle2,
  XCircle,
  Wallet,
  Key,
  Shield,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface YellowConnectButtonProps {
  className?: string;
  variant?: 'default' | 'compact';
}

export function YellowConnectButton({ className, variant = 'default' }: YellowConnectButtonProps) {
  const { isConnected: isWalletConnected } = useAccount();
  const {
    isAuthenticated,
    isConnecting,
    connectionState,
    error,
    authenticate,
    disconnect,
    sessionKeyAddress,
  } = useYellow();

  const [showDialog, setShowDialog] = useState(false);
  const [step, setStep] = useState<'idle' | 'connecting' | 'signing' | 'success' | 'error'>('idle');

  const handleConnect = async () => {
    if (!isWalletConnected) {
      // Wallet not connected, show dialog
      setShowDialog(true);
      return;
    }

    if (isAuthenticated) {
      setShowDialog(true);
      return;
    }

    // Start authentication flow
    setShowDialog(true);
    setStep('connecting');

    try {
      setStep('signing');
      await authenticate();
      setStep('success');

      // Auto-close after success
      setTimeout(() => {
        setShowDialog(false);
        setStep('idle');
      }, 2000);
    } catch (err) {
      console.error('Yellow auth failed:', err);
      setStep('error');
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setShowDialog(false);
    setStep('idle');
  };

  const handleRetry = () => {
    setStep('idle');
    handleConnect();
  };

  if (variant === 'compact') {
    return (
      <Button
        variant={isAuthenticated ? 'outline' : 'default'}
        size="sm"
        onClick={handleConnect}
        disabled={isConnecting}
        className={cn(
          isAuthenticated && 'border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10',
          className
        )}
      >
        {isConnecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isAuthenticated ? (
          <>
            <Zap className="h-4 w-4 mr-1" />
            Gasless
          </>
        ) : (
          <>
            <Zap className="h-4 w-4 mr-1" />
            Enable Gasless
          </>
        )}
      </Button>
    );
  }

  return (
    <>
      <Button
        variant={isAuthenticated ? 'outline' : 'default'}
        onClick={handleConnect}
        disabled={isConnecting}
        className={cn(
          isAuthenticated && 'border-emerald-500/50',
          className
        )}
      >
        {isConnecting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Connecting...
          </>
        ) : isAuthenticated ? (
          <>
            <YellowStatus showLabel={false} />
            <span className="ml-2">Gasless Trading Active</span>
          </>
        ) : (
          <>
            <Zap className="h-4 w-4 mr-2" />
            Enable Gasless Trading
          </>
        )}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-500" />
              Yellow Network State Channels
            </DialogTitle>
            <DialogDescription>
              Trade options with zero gas fees using state channels
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {!isWalletConnected ? (
              <div className="text-center py-8">
                <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  Please connect your wallet first to enable gasless trading.
                </p>
              </div>
            ) : isAuthenticated ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center py-4">
                  <div className="p-3 rounded-full bg-emerald-500/10">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  </div>
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-lg">Gasless Trading Active</h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    You can now trade without paying gas fees
                  </p>
                </div>

                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <Badge className="bg-emerald-500/10 text-emerald-500">
                      Connected
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Session Key</span>
                    <span className="font-mono text-xs">
                      {sessionKeyAddress?.slice(0, 6)}...{sessionKeyAddress?.slice(-4)}
                    </span>
                  </div>
                </div>

                <Button variant="outline" onClick={handleDisconnect} className="w-full">
                  Disconnect
                </Button>
              </div>
            ) : step === 'idle' ? (
              <div className="space-y-6">
                <div className="space-y-4">
                  <StepItem
                    number={1}
                    title="Connect to ClearNode"
                    description="Establish secure WebSocket connection"
                    icon={<Zap className="h-4 w-4" />}
                  />
                  <StepItem
                    number={2}
                    title="Sign Authorization"
                    description="Approve session key with your wallet (EIP-712)"
                    icon={<Key className="h-4 w-4" />}
                  />
                  <StepItem
                    number={3}
                    title="Start Trading"
                    description="Trade gaslessly using state channels"
                    icon={<Shield className="h-4 w-4" />}
                  />
                </div>

                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-emerald-500" />
                    Why State Channels?
                  </h4>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <li>• Zero gas fees for trading</li>
                    <li>• Instant transaction finality</li>
                    <li>• On-chain security guarantees</li>
                    <li>• Settle on-chain anytime</li>
                  </ul>
                </div>

                <Button onClick={handleConnect} className="w-full">
                  <Zap className="h-4 w-4 mr-2" />
                  Enable Gasless Trading
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            ) : step === 'connecting' || step === 'signing' ? (
              <div className="py-8 text-center">
                <Loader2 className="h-12 w-12 mx-auto text-emerald-500 animate-spin mb-4" />
                <h3 className="font-semibold text-lg">
                  {step === 'connecting' ? 'Connecting...' : 'Waiting for Signature...'}
                </h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {step === 'connecting'
                    ? 'Establishing connection to Yellow Network'
                    : 'Please sign the message in your wallet'}
                </p>

                {step === 'signing' && (
                  <div className="mt-6 bg-muted/50 rounded-lg p-4 text-left">
                    <p className="text-xs text-muted-foreground">
                      You&apos;re signing an EIP-712 message to authorize a session key.
                      This does NOT transfer any funds.
                    </p>
                  </div>
                )}
              </div>
            ) : step === 'success' ? (
              <div className="py-8 text-center">
                <div className="p-3 rounded-full bg-emerald-500/10 w-fit mx-auto mb-4">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                </div>
                <h3 className="font-semibold text-lg">Connected!</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Gasless trading is now enabled
                </p>
              </div>
            ) : step === 'error' ? (
              <div className="py-8 text-center">
                <div className="p-3 rounded-full bg-red-500/10 w-fit mx-auto mb-4">
                  <XCircle className="h-12 w-12 text-red-500" />
                </div>
                <h3 className="font-semibold text-lg">Connection Failed</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {error?.message || 'Unable to connect to Yellow Network'}
                </p>
                <Button onClick={handleRetry} className="mt-4">
                  Try Again
                </Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StepItem({
  number,
  title,
  description,
  icon,
}: {
  number: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
        {number}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{title}</span>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
