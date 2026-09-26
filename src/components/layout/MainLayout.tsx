import { ReactNode, useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserBan } from '@/hooks/useUserBan';
import { usePresence } from '@/hooks/usePresence';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import NotificationDropdown from '@/components/notifications/NotificationDropdown';
import CreateDialog from '@/components/create/CreateDialog';
import BrandLogo from '@/components/brand/BrandLogo';
import { AccountSwitcher, AccountSwitcherItems } from '@/components/business/AccountSwitcher';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Home,
  Compass,
  Clapperboard,
  MessageCircle,
  Heart,
  PlusSquare,
  User,
  Settings,
  LogOut,
  Shield,
  Menu,
  BookOpen,
  Ban,
  Clock,
  Crown,
  Plus,
  Radio,
  Users,
  Target,
  Megaphone,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';

interface MainLayoutProps {
  children: ReactNode;
  immersive?: boolean;
}

const navItems = [
  { icon: Home, label: 'Home', href: '/', id: 'home' },
  { icon: Compass, label: 'Explore', href: '/explore', id: 'explore' },
  { icon: Clapperboard, label: 'Reels', href: '/reels', id: 'reels' },
  { icon: MessageCircle, label: 'Messages', href: '/messages', id: 'messages' },
  { icon: Heart, label: 'Notifications', href: '/notifications', id: 'notifications' },
  { icon: PlusSquare, label: 'Create', href: '#create', id: 'create' },
  { icon: BookOpen, label: 'Library', href: '/library', id: 'library' },
  { icon: Users, label: 'Groups', href: '/groups', id: 'groups' },
  { icon: Target, label: 'Interests', href: '/interests', id: 'interests' },
  { icon: Megaphone, label: 'Advertise', href: '/b', id: 'ads' },
];

const mobileNavItems = [
  { icon: Home, label: 'Home', href: '/', id: 'home' },
  { icon: Compass, label: 'Explore', href: '/explore', id: 'explore' },
  { icon: null, label: 'Create', href: '#create', id: 'create' },
  { icon: Clapperboard, label: 'Reels', href: '/reels', id: 'reels' },
  { icon: MessageCircle, label: 'Messages', href: '/messages', id: 'messages' },
];

export default function MainLayout({ children, immersive = false }: MainLayoutProps) {
  const { user, profile, signOut, isAdmin, isModerator } = useAuth();
  const { isBanned, banInfo } = useUserBan();
  usePresence();
  const location = useLocation();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [navVisible, setNavVisible] = useState(true);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => {
      setNavVisible(false);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => setNavVisible(true), 200);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, []);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const isActive = (href: string) => {
    if (href === '#create') return false;
    if (href === '/profile' && location.pathname.startsWith('/profile/')) return true;
    if (href === '/groups' && location.pathname.startsWith('/groups/')) return true;
    if (href === '/b') {
      return (
        location.pathname.startsWith('/b') ||
        location.pathname.startsWith('/ads') ||
        location.pathname.startsWith('/boost/') ||
        location.pathname.startsWith('/business/')
      );
    }
    return location.pathname === href;
  };

// Rendered only inside the top bar's 3-dot menu. "Profile" and "Business" are
// intentionally absent: the profile header card above and the embedded account
// switcher already cover them, so they were duplicate links.
const moreNavItems = [
  { icon: BookOpen, label: 'Library', href: '/library', id: 'library' },
  { icon: Users, label: 'Groups', href: '/groups', id: 'groups' },
];

const moreAccountItems = [
  { icon: Settings, label: 'Settings', href: '/settings', id: 'settings' },
];

  return (
    <div className={cn('bg-background', immersive ? 'h-[100dvh] overflow-hidden' : 'min-h-screen')}>
      {/* Desktop Expanded Sidebar */}
      {user && !immersive && (
        <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-[240px] z-40 flex-col border-r border-border bg-background py-4 pl-3 pr-3">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2">
            <Link to="/" className="flex items-center gap-2.5" title="Home">
              <BrandLogo className="h-9" />
            </Link>
          </div>

          <nav className="flex flex-1 w-full flex-col gap-0.5 overflow-y-auto scrollbar-hide py-3">
            {navItems.map((item) => {
              const active = isActive(item.href);

              if (item.href === '#create') {
                return (
                  <div key={item.id} className="mt-1">
                    <button
                      onClick={() => setCreateDialogOpen(true)}
                      className="create-btn flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white"
                    >
                      <Plus className="h-5 w-5 text-white" strokeWidth={2.5} />
                      Create
                    </button>
                  </div>
                );
              }

              return (
                <Link
                  key={item.id}
                  to={item.href}
                  className={cn(
                    'relative group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors',
                    active
                      ? 'bg-primary/15 font-semibold text-primary'
                      : 'font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                  )}
                >
                  <item.icon
                    className={cn('h-[22px] w-[22px] flex-shrink-0', active && 'text-primary')}
                    strokeWidth={active ? 2.5 : 1.75}
                    fill={active ? 'currentColor' : 'none'}
                  />
                  <span className={cn(active && 'ml-0')}>{item.label}</span>
                  {active && <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-primary" />}
                </Link>
              );
            })}
            <div className="mt-3 pt-1.5">
              <button
                onClick={() => setCreateDialogOpen(true)}
                aria-label="Create"
                className="create-btn flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white"
              >
                <Plus className="h-5 w-5 text-white" strokeWidth={2.5} />
                Create
              </button>
            </div>
          </nav>

          <div className="flex flex-col gap-leaf pt-3">
            {/* Notification on the left, identity switcher immediately to its right. */}
            <div className="flex items-center gap-2">
              <NotificationDropdown className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground" />
              <AccountSwitcher lines side="top" />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2" aria-label="Account">
                  <Avatar className="h-9 w-9 flex-shrink-0 ring-2 ring-border hover:ring-primary/40 transition-shadow">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {getInitials(profile?.display_name || 'U')}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {profile?.display_name || 'You'}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[240px]" align="start" side="top" sideOffset={10}>
                <DropdownMenuItem asChild>
                  <Link to={`/profile/${profile?.username}`} className="cursor-pointer">
                    <User className="mr-3 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="cursor-pointer">
                    <Settings className="mr-3 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                {(isAdmin || isModerator) && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin" className="cursor-pointer">
                      <Shield className="mr-3 h-4 w-4" />
                      Admin
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive">
                  <LogOut className="mr-3 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>
      )}

      {/* Mobile Floating Nav - Notifications & More */}
      {user && !immersive && location.pathname !== '/messages' && (
        <div
          className={cn(
            'lg:hidden fixed top-3 right-3 z-50 flex items-center gap-0.5 bg-background/85 backdrop-blur-xl border border-border/60 rounded-full p-1.5 shadow-lg shadow-black/10 transition-all duration-300',
            navVisible
              ? 'translate-y-0 opacity-100'
              : '-translate-y-16 opacity-0 pointer-events-none'
          )}
        >
          <NotificationDropdown className="text-muted-foreground hover:text-foreground hover:bg-primary/10" />
          <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="More"
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300',
                  moreOpen
                    ? 'bg-white/15 text-white'
                    : 'text-neutral-300 hover:bg-white/10 hover:text-white'
                )}
              >
                <Menu
                  className={cn('h-5 w-5 transition-transform duration-300', moreOpen && 'rotate-90')}
                  strokeWidth={1.5}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="bottom"
              sideOffset={10}
              className="w-60 rounded-2xl border border-white/15 bg-black/45 p-1 text-white shadow-2xl shadow-black/50 backdrop-blur-2xl backdrop-saturate-150"
            >
              {/* Profile card header */}
              <Link
                to={`/profile/${profile?.username || ''}`}
                className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-white/10"
              >
                <Avatar className="h-9 w-9 flex-shrink-0 ring-1 ring-white/20">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-white/10 text-xs font-semibold text-white/90">
                    {getInitials(profile?.display_name || 'U')}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">
                    {profile?.display_name || 'You'}
                  </span>
                  <span className="block truncate text-[11px] text-neutral-400">
                    @{profile?.username || 'username'}
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-neutral-500" />
              </Link>

              <DropdownMenuSeparator className="my-1 bg-white/10" />

              {/* Identity switching lives in the top navigation rather than the
                  bottom bar. The header card above always shows the *personal*
                  profile, so putting the switcher directly beneath it makes the
                  account you are currently acting as unambiguous. */}
              <AccountSwitcherItems tone="glass" />

              <DropdownMenuSeparator className="my-1 bg-white/10" />

              <DropdownMenuGroup>
                {moreNavItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <DropdownMenuItem
                      key={item.id}
                      asChild
                      className="cursor-pointer gap-2 rounded-lg py-1.5 focus:bg-white/10 focus:text-white"
                    >
                      <Link to={item.href}>
                        <span
                          className={cn(
                            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border transition-colors',
                            active
                              ? 'border-white/20 bg-white/20 text-white'
                              : 'border-white/10 bg-white/10 text-neutral-200'
                          )}
                        >
                          <item.icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                        </span>
                        <span className="text-sm font-medium text-white">{item.label}</span>
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>

              <DropdownMenuSeparator className="my-1 bg-white/10" />

              <DropdownMenuGroup>
                {moreAccountItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <DropdownMenuItem
                      key={item.id}
                      asChild
                      className="cursor-pointer gap-2 rounded-lg py-1.5 focus:bg-white/10 focus:text-white"
                    >
                      <Link to={item.href}>
                        <span
                          className={cn(
                            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border transition-colors',
                            active
                              ? 'border-white/20 bg-white/20 text-white'
                              : 'border-white/10 bg-white/10 text-neutral-200'
                          )}
                        >
                          <item.icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                        </span>
                        <span className="text-sm font-medium text-white">{item.label}</span>
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
                {(isAdmin || isModerator) && (
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer gap-2 rounded-lg py-1.5 focus:bg-white/10 focus:text-white"
                  >
                    <Link to="/admin">
<span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-neutral-200">
                        <Shield className="h-3.5 w-3.5" strokeWidth={1.8} />
                      </span>
                      <span className="text-sm font-medium text-white">Admin</span>
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>

              <DropdownMenuSeparator className="my-1 bg-white/10" />

<DropdownMenuItem
                onClick={signOut}
                className="cursor-pointer gap-2 rounded-lg py-1.5 text-red-400 focus:bg-white/10 focus:text-red-300"
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-red-400/20 bg-red-400/10 text-red-400">
                  <LogOut className="h-3.5 w-3.5" strokeWidth={1.8} />
                </span>
                <span className="text-sm font-medium">Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Guest Header */}
      {!user && (
        <header className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="flex items-center justify-between h-14 px-4 max-w-screen-lg mx-auto">
            <Link to="/" className="flex items-center">
              <BrandLogo className="h-8" />
            </Link>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/auth">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/auth?mode=signup">Sign up</Link>
              </Button>
            </div>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className={cn(
        immersive ? 'h-full overflow-hidden' : 'min-h-screen',
        user && !immersive && 'lg:ml-[80px]'
      )}>
        {isBanned && banInfo ? (
          <div className="max-w-md mx-auto py-20 px-4">
            <Card>
              <CardHeader className="text-center pb-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
                  <Ban className="w-6 h-6 text-destructive" />
                </div>
                <CardTitle>Account Suspended</CardTitle>
                <CardDescription>
                  Your account has been suspended.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg bg-surface">
                  <p className="text-sm font-medium mb-1">Reason</p>
                  <p className="text-sm text-muted-foreground">{banInfo.reason}</p>
                </div>
                {banInfo.expires_at && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>Until {format(new Date(banInfo.expires_at), 'PPp')}</span>
                  </div>
                )}
                <Button variant="outline" onClick={signOut} className="w-full">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          children
        )}
      </main>

      {/* Legal footer */}
      {!immersive && !isBanned && (
        <footer className={cn(
          'px-4 py-6 text-center text-xs text-muted-foreground/70',
          user && 'lg:ml-[80px]'
        )}>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/community-guidelines" className="hover:text-foreground transition-colors">Guidelines</Link>
            <a href="mailto:support@twibsers.com" className="hover:text-foreground transition-colors">Contact support</a>
          </div>
          <p className="mt-1.5">© {new Date().getFullYear()} Twibsers. All rights reserved.</p>
        </footer>
      )}

      {/* Mobile Bottom Navigation - Floating Glass Pill */}
      {user && !immersive && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-2 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-[430px] rounded-full bg-background/75 backdrop-blur-xl border border-border/60 shadow-lg shadow-black/10 flex items-center justify-around h-16 px-2 relative">
            {mobileNavItems.map((item) => {
              const active = isActive(item.href);
              const isCreate = item.href === '#create';

              if (isCreate) {
                return (
                  <button
                    key={item.id}
                    onClick={() => setCreateDialogOpen(true)}
                    aria-label="Create post"
                    className="relative -mt-7 group"
                  >
                    <span className="absolute -inset-1.5 rounded-full bg-violet-500/40 blur-lg opacity-50 group-hover:opacity-90 group-active:opacity-70 transition-opacity" />
                    <span className="create-btn relative flex h-14 w-14 items-center justify-center">
                      <Plus className="relative z-10 h-6 w-6 text-white drop-shadow" strokeWidth={2.5} />
                    </span>
                  </button>
                );
              }

              return (
                <div key={item.id} className="relative flex items-center">
                  {active && (
                    <motion.div
                      layoutId="mobile-nav-cloud"
                      transition={{ type: 'spring', stiffness: 340, damping: 32, opacity: { duration: 0.15 } }}
                      className="absolute inset-0 z-0 flex items-center justify-center"
                    >
                      <svg
                        viewBox="0 0 96 80"
                        className="h-16 w-20 -translate-y-1 overflow-visible drop-shadow-[0_5px_14px_rgba(124,58,237,0.45)]"
                        aria-hidden="true"
                      >
                        <defs>
                          <linearGradient
                            id="nav-cloud-grad"
                            x1="0"
                            y1="0"
                            x2="96"
                            y2="80"
                            gradientUnits="userSpaceOnUse"
                          >
                            <stop offset="0%" stopColor="#a78bfa" />
                            <stop offset="50%" stopColor="hsl(var(--primary))" />
                            <stop offset="100%" stopColor="#4f46e5" />
                          </linearGradient>
                        </defs>
                        <g fill="url(#nav-cloud-grad)">
                          <rect x="4" y="46" width="74" height="28" rx="14" />
                          <circle cx="24" cy="40" r="16" />
                          <circle cx="44" cy="30" r="19" />
                          <circle cx="66" cy="37" r="17" />
                          <circle cx="82" cy="48" r="12" />
                        </g>
                      </svg>
                    </motion.div>
                  )}
                  <Link
                    to={item.href}
                    className={cn(
                      "relative z-10 flex flex-col items-center justify-center gap-1 px-3.5 py-2 transition-all duration-200",
                      active
                        ? "text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {item.icon && (
                      <item.icon
                        className={cn("h-5 w-5 transition-transform duration-200", active && "scale-110")}
                        strokeWidth={active ? 2.5 : 1.5}
                        fill={active ? 'currentColor' : 'none'}
                      />
                    )}
                    <span className={cn("text-[10px]", active && "font-semibold")}>
                      {item.label}
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        </nav>
      )}

      <CreateDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

      <style>{`
        .rail-tip {
          pointer-events: none;
          position: absolute;
          left: calc(100% + 10px);
          top: 50%;
          transform: translateY(-50%);
          white-space: nowrap;
          border-radius: 8px;
          background: hsl(var(--foreground));
          color: hsl(var(--background));
          font-size: 12px;
          font-weight: 500;
          padding: 5px 10px;
          opacity: 0;
          transition: opacity 0.15s ease;
          z-index: 60;
          box-shadow: 0 8px 20px rgba(0,0,0,0.18);
        }
        .group:hover > .rail-tip {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
