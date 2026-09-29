import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBusinessApi } from '@/hooks/useBusinessApi';
import type { BusinessAccount, BusinessRole } from '@/lib/business';
import { ROLE_CAN } from '@/lib/business';
import { friendlyErrorMessage } from '@/lib/errors';

export type ActiveMode = 'personal' | 'business';

interface BusinessContextType {
  accounts: BusinessAccount[];
  accountsLoading: boolean;
  accountsError: string | null;
  mode: ActiveMode;
  activeBusiness: BusinessAccount | null;
  role: BusinessRole | null;
  isOwner: boolean;
  canManage: boolean;
  canCreateCampaigns: boolean;
  switchToPersonal: () => void;
  switchToBusiness: (businessId: string) => void;
  refresh: () => Promise<void>;
  /**
   * Applies a partial update to a business account in place, so an edit made in
   * one surface (profile editor, settings, avatar change) is reflected by every
   * other consumer of `accounts` / `activeBusiness` without a refetch.
   */
  patchAccount: (businessId: string, patch: Partial<BusinessAccount>) => void;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

const storageKey = (userId: string) => `twibs-active-identity-${userId}`;

function readStoredIdentity(userId: string): ActiveMode | string {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw?.startsWith('{')) {
      const stored = JSON.parse(raw);
      return stored.type === 'business' && stored.businessId ? stored.businessId : 'personal';
    }
    if (raw) return raw;
  } catch {
    // ignore
  }
  return 'personal';
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const api = useBusinessApi();
  const currentUserId = useRef(user?.id); currentUserId.current = user?.id;
  const [accountsUserId, setAccountsUserId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<BusinessAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [mode, setMode] = useState<ActiveMode>('personal');
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  // Distinguishes "we have not asked yet / are asking" from "the server told us
  // this user genuinely has no business accounts". Without this, the reconcile
  // effect below sees an empty `accounts` array during the initial load and
  // concludes the stored business no longer exists, silently switching the user
  // back to personal on every page refresh.
  const [accountsSettled, setAccountsSettled] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setAccounts([]);
      setAccountsLoading(false);
      setAccountsSettled(true);
      return;
    }
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const list = await api.listBusinessAccounts();
      if (currentUserId.current !== user.id) return;
      setAccountsUserId(user.id);
      setAccounts(list);
    } catch (err: unknown) {
      if (currentUserId.current === user.id) setAccountsError(friendlyErrorMessage(err, 'Failed to load business accounts'));
    } finally {
      if (currentUserId.current === user.id) { setAccountsLoading(false); setAccountsSettled(true); }
    }
  }, [user, api]);

  // Load accounts whenever the authenticated user changes.
  useEffect(() => {
    setMode('personal');
    setActiveBusinessId(null);
    setAccountsSettled(false);
    // Drop the previous user's accounts immediately. `activeBusiness`, `role`
    // and `isOwner` are all derived from `accounts` without waiting for
    // `accountsSettled`, so leaving the old list in place would surface the
    // previous user's business (and their role) to the newly signed-in user
    // until their own request resolved.
    setAccounts([]);
    if (!user) {
      setAccountsSettled(true);
      return;
    }
    refresh();
    const stored = readStoredIdentity(user.id);
    if (stored === 'personal') {
      setMode('personal');
    } else {
      setActiveBusinessId(stored);
      setMode('business');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const switchToPersonal = useCallback(() => {
    if (!user) return;
    try {
      localStorage.setItem(storageKey(user.id), 'personal');
    } catch {
      // ignore
    }
    setMode('personal');
    setActiveBusinessId(null);
  }, [user]);

  const switchToBusiness = useCallback(
    (businessId: string) => {
      if (!user || !accounts.some(account => account.id === businessId)) return;
      try {
        localStorage.setItem(storageKey(user.id), businessId);
      } catch {
        // ignore
      }
      setActiveBusinessId(businessId);
      setMode('business');
    },
    [user, accounts]
  );

  // Resolve the active business. If the stored id no longer matches a
  // business the user belongs to, fall back to (a) the first available
  // account or (b) personal mode.
  const activeBusiness = mode === 'business' && accountsUserId === user?.id ? accounts.find((a) => a.id === activeBusinessId) ?? null : null;

  useEffect(() => {
    if (mode !== 'business') return;
    // Never reconcile while the account list is still in flight: `accounts` is
    // empty until it resolves, and treating that as "no such business" is what
    // used to throw the user back to personal on every refresh.
    if (!accountsSettled || accountsLoading || accountsError) return;
    if (activeBusinessId && !accounts.some((a) => a.id === activeBusinessId)) {
      switchToPersonal();
    }
  }, [mode, accounts, accountsSettled, accountsLoading, accountsError, activeBusinessId, switchToBusiness, switchToPersonal]);

  const role = activeBusiness?.role ?? null;
  const isOwner = role === 'owner';

  const patchAccount = useCallback((businessId: string, patch: Partial<BusinessAccount>) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === businessId ? { ...a, ...patch } : a))
    );
  }, []);

  return (
    <BusinessContext.Provider
      value={{
        accounts: accountsUserId === user?.id ? accounts : [],
        accountsLoading,
        accountsError,
        mode,
        activeBusiness,
        role,
        isOwner,
        canManage: ROLE_CAN.canManage(role),
        canCreateCampaigns: ROLE_CAN.canCreateCampaigns(role),
        switchToPersonal,
        switchToBusiness,
        refresh,
        patchAccount,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (context === undefined) {
    throw new Error('useBusiness must be used within a BusinessProvider');
  }
  return context;
}