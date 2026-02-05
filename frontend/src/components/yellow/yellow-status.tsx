'use client';

import { useYellow } from '@/lib/yellow';
import { cn } from '@/lib/utils';
import { Zap, ZapOff, Loader2 } from 'lucide-react';

interface YellowStatusProps {
  className?: string;
  showLabel?: boolean;
}

export function YellowStatus({ className, showLabel = true }: YellowStatusProps) {
  const { connectionState, isAuthenticated, isConnecting } = useYellow();

  const getStatusColor = () => {
    switch (connectionState) {
      case 'authenticated':
        return 'text-emerald-500';
      case 'connected':
      case 'authenticating':
        return 'text-yellow-500';
      case 'connecting':
        return 'text-blue-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case 'authenticated':
        return 'Gasless Active';
      case 'connected':
        return 'Connected';
      case 'authenticating':
        return 'Signing...';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Error';
      default:
        return 'Offline';
    }
  };

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {isConnecting ? (
        <Loader2 className={cn('h-4 w-4 animate-spin', getStatusColor())} />
      ) : isAuthenticated ? (
        <Zap className={cn('h-4 w-4', getStatusColor())} />
      ) : (
        <ZapOff className={cn('h-4 w-4', getStatusColor())} />
      )}
      {showLabel && (
        <span className={cn('text-xs font-medium', getStatusColor())}>
          {getStatusText()}
        </span>
      )}
    </div>
  );
}
