import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, ChevronRight, Loader2, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACCOUNT_TYPE_META } from '@/lib/business';

function getInitials(name: string) {
  return name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';
}

/**
 * The 3-dot menu in the top bar is a dark translucent panel, while the sidebar
 * uses the normal themed surfaces. These palettes keep the switcher legible and
 * consistent in whichever menu it is rendered.
 */
const TONES = {
  default: {
    label: 'text-xs text-muted-foreground',
    item: 'cursor-pointer gap-2.5',
    name: 'text-sm font-medium',
    handle: 'block truncate text-[11px] text-muted-foreground',
    badge:
      'rounded-md bg-muted px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground',
    fallback: 'bg-muted text-[10px] font-semibold text-foreground',
    check: 'h-4 w-4 text-primary',
    loading: 'flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground',
  },
  glass: {
    label: 'px-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400',
    item: 'cursor-pointer gap-2.5 focus:bg-white/10 focus:text-white',
    name: 'text-sm font-medium text-white',
    handle: 'block truncate text-[11px] text-neutral-400',
    badge:
      'rounded-md border border-white/10 bg-white/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-neutral-200',
    fallback: 'bg-white/10 text-[10px] font-semibold text-white/90',
    check: 'h-4 w-4 text-white',
    loading: 'flex items-center gap-2 px-3 py-4 text-sm text-neutral-300',
  },
} as const;

export type AccountSwitcherTone = keyof typeof TONES;

export interface AccountSwitcherItemsProps {
  tone?: AccountSwitcherTone;
  className?: string;
}

/**
 * The switcher *content* on its own, with no trigger and no menu wrapper.
 *
 * This exists so the identity list can be embedded directly inside another
 * `DropdownMenu` (the top bar's 3-dot menu) — Radix does not support nesting a
 * `DropdownMenu` inside another one, so the list is exposed standalone and
 * `AccountSwitcher` simply wraps it in its own trigger + menu.
 */
export function AccountSwitcherItems({ tone = 'default', className }: AccountSwitcherItemsProps) {
  const { profile } = useAuth();
  const { accounts, accountsLoading, mode, activeBusiness, switchToPersonal, switchToBusiness } =
    useBusiness();
  const navigate = useNavigate();

  const t = TONES[tone];
  const thisModeActive = mode === 'business';

  // This menu is purely an identity switcher: pick who you are acting as. It
  // deliberately carries no "create business", "business hub" or "view profile"
  // actions - business setup lives in Settings > Professional, the hub is on the
  // main nav, and selecting an identity already lands you on that profile.
  // With no business there is nothing to switch to, so it renders nothing.
  if (!accountsLoading && accounts.length === 0) return null;

  if (accountsLoading) {
    return (
      <div className={cn(t.loading, className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading accounts…
      </div>
    );
  }

  return (
    <div className={className}>
      <DropdownMenuLabel className={t.label}>Switch account</DropdownMenuLabel>
      <DropdownMenuGroup>
        {/* Personal identity is always offered, even with no businesses. */}
        <DropdownMenuItem
          onClick={() => {
            switchToPersonal();
            if (thisModeActive) navigate('/');
          }}
          className={t.item}
        >
          <Avatar className="h-7 w-7 flex-shrink-0">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className={t.fallback}>
              {getInitials(profile?.display_name || 'U')}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate', t.name)}>{profile?.display_name || 'You'}</span>
            <span className={t.handle}>@{profile?.username}</span>
          </span>
          {mode === 'personal' && <Check className={t.check} />}
        </DropdownMenuItem>

        {accounts.map((account) => (
          <DropdownMenuItem
            key={account.id}
            onClick={() => {
              switchToBusiness(account.id);
              // Selecting a business takes you to that business's profile, so
              // the switch and the destination are a single action.
              navigate(`/business/${account.username}`);
            }}
            className={t.item}
          >
            <Avatar className="h-7 w-7 flex-shrink-0">
              <AvatarImage src={account.avatar_url || undefined} />
              <AvatarFallback className={t.fallback}>{getInitials(account.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className={cn('flex items-center gap-1.5 overflow-hidden', t.name)}>
                <span className="truncate">{account.name}</span>
                <span className={t.badge}>
                  {ACCOUNT_TYPE_META[account.account_type]?.label ?? 'Business'}
                </span>
              </span>
              <span className={t.handle}>@{account.username}</span>
            </span>
            {mode === 'business' && activeBusiness?.id === account.id && (
              <Check className={t.check} />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </div>
  );
}

interface AccountSwitcherProps {
  className?: string;
  side?: 'top' | 'bottom';
  /**
   * Avatar-only trigger, for places with no room for the full name/handle
   * block. Behaviour is identical.
   */
  compact?: boolean;
  /**
   * Three-line (hamburger) icon trigger, used in the desktop sidebar next to
   * the notification button. Keeps the trigger to a single icon so it can sit
   * inline; the open menu still shows the avatar, name and handle per identity.
   */
  lines?: boolean;
}

/**
 * Identity switcher between a user's personal account and their businesses,
 * with its own trigger and menu. The selection is persisted per-user and drives
 * the active identity context.
 */
export function AccountSwitcher({ className, side = 'top', compact = false, lines = false }: AccountSwitcherProps) {
  const { profile } = useAuth();
  const { mode, activeBusiness, accounts, accountsLoading } = useBusiness();

  const thisModeActive = mode === 'business';
  const activeName =
    mode === 'business' ? activeBusiness?.name || 'Business' : profile?.display_name || 'You';
  const activeHandle = mode === 'business' ? activeBusiness?.username : profile?.username;

  // Nothing to switch to yet, so the icon-only trigger would open a menu with
  // no identities in it. Hidden until the first business exists.
  if (lines && !accountsLoading && accounts.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {lines ? (
          <button
            className={cn(
              'relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground',
              className
            )}
            aria-label={`Switch account (currently ${activeName})`}
            title={`Switch account — ${activeName}`}
          >
            <Menu className="h-5 w-5" />
            {/* Keeps a hint of the active identity now that the trigger is icon-only. */}
            {thisModeActive ? (
              <span
                aria-hidden="true"
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
              />
            ) : null}
          </button>
        ) : (
          <button
            className={cn(
              'flex items-center rounded-xl text-left transition-colors hover:bg-surface-2',
              compact ? 'justify-center p-1' : 'w-full gap-3 px-3 py-2.5',
              className
            )}
            aria-label="Switch account"
          >
            {mode === 'business' && activeBusiness ? (
              <Avatar className={cn('flex-shrink-0 ring-2 ring-primary/40', compact ? 'h-8 w-8' : 'h-9 w-9')}>
                <AvatarImage src={activeBusiness.avatar_url || undefined} />
                <AvatarFallback className="bg-muted text-xs font-semibold text-foreground">
                  {getInitials(activeBusiness.name)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <Avatar className={cn('flex-shrink-0 ring-2 ring-border hover:ring-primary/40', compact ? 'h-8 w-8' : 'h-9 w-9')}>
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-muted text-xs font-semibold text-foreground">
                  {getInitials(profile?.display_name || 'U')}
                </AvatarFallback>
              </Avatar>
            )}
            {compact ? null : (
              <>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                    {activeName}
                    {mode === 'business' && (
                      <span className="rounded-md bg-muted px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {ACCOUNT_TYPE_META[activeBusiness?.account_type ?? 'business']?.label ?? 'Business'}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">@{activeHandle}</span>
                </span>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              </>
            )}
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[260px]" align="start" side={side} sideOffset={10}>
        <AccountSwitcherItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
