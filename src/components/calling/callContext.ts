import { createContext, useContext } from 'react';
import { CallSession } from '@/lib/callTypes';
import { CallManager } from '@/hooks/useCallManager';
import { CallerProfile, QueuedCall } from '@/hooks/useIncomingCalls';

export interface FloatingReaction {
  id: number;
  emoji: string;
  mine: boolean;
}

export interface CallContextValue extends CallManager {
  // ---- reactions ----
  reactions: FloatingReaction[];
  sendLocalReaction: (emoji: string) => void;

  // ---- provider extras ----
  minimized: boolean;
  minimize: () => void;
  restore: () => void;
  navigateToConversation: () => void;

  // ---- incoming calls ----
  incomingCall: CallSession | null;
  incomingCaller: CallerProfile | null;
  callQueue: QueuedCall[];
  clearIncomingCall: () => void;
  declineQueuedCall: (sessionId: string) => Promise<void>;
}

export const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return ctx;
}