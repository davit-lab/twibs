import { ReactNode, useState, useEffect, useRef } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  Sparkles,
  Megaphone,
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
  { icon: Megaphone, label: 'Advertise', href: '/ads', id: 'ads' },
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
    return location.pathname === href;
  };

  return (
    <div className={cn('bg-background', immersive ? 'h-[100dvh] overflow-hidden' : 'min-h-screen')}>
      {/* Desktop Compact Icon Rail */}
      {user && !immersive && (
        <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-[80px] z-40 flex-col items-center border-r border-border bg-background py-5 px-2">
          <Link to="/" className="mb-6 flex items-center justify-center" title="Home">
            <BrandLogo className="h-8" />
          </Link>

          <nav className="flex flex-1 w-full flex-col items-center gap-1 overflow-y-auto scrollbar-hide">
            {navItems.map((item) => {
              const active = isActive(item.href);

              if (item.href === '#create') {
                return (
                  <div key={item.id} className="relative group w-full flex justify-center my-1">
                    <button
                      onClick={() => setCreateDialogOpen(true)}
                      aria-label="Create"
                      className="create-btn flex h-12 w-12 items-center justify-center"
                    >
                      <Plus className="relative z-10 h-6 w-6 text-white drop-shadow" strokeWidth={2.5} />
                    </button>
                    <span className="rail-tip">Create</span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.id}
                  to={item.href}
                  aria-label={item.label}
                  className="relative group w-full flex justify-center py-0.5"
                >
                  <span
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-2xl transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                    )}
                  >
                    <item.icon
                      className={cn('h-[22px] w-[22px]', active && 'text-primary')}
                      strokeWidth={active ? 2.5 : 1.5}
                      fill={active ? 'currentColor' : 'none'}
                    />
                  </span>
                  <span className="rail-tip">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="relative group w-full flex justify-center py-1">
            <NotificationDropdown className="h-11 w-11 rounded-2xl text-muted-foreground hover:text-foreground hover:bg-surface-2" />
            <span className="rail-tip">Notifications</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="relative group w-full flex justify-center mt-1" aria-label="Account">
                <Avatar className="h-10 w-10 ring-2 ring-border hover:ring-primary/40 transition-shadow">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-xs bg-surface-2">
                    {getInitials(profile?.display_name || 'U')}
                  </AvatarFallback>
                </Avatar>
                <span className="rail-tip">Account</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[220px]" align="start" side="right" sideOffset={12}>
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
              {/* Premium removed */}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="More"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground hover:bg-primary/10"
              >
                <Menu className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="bottom"
              sideOffset={10}
              className="w-64 rounded-2xl border-border/70 bg-background/95 p-1.5 shadow-xl shadow-black/20 backdrop-blur-xl"
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Navigation
                </DropdownMenuLabel>
                <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-xl py-2">
                  <Link to={`/profile/${profile?.username}`}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2">
                      <User className="h-4 w-4" />
                    </span>
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-xl py-2">
                  <Link to="/library">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2">
                      <BookOpen className="h-4 w-4" />
                    </span>
                    Library
                  </Link>
                </DropdownMenuItem>
                {/* Live TV removed */}
                <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-xl py-2">
                  <Link to="/groups">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2">
                      <Users className="h-4 w-4" />
                    </span>
                    Groups
                  </Link>
                </DropdownMenuItem>
                {/* Interests removed */}
              </DropdownMenuGroup>

              <DropdownMenuSeparator className="my-1.5" />

              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Account
                </DropdownMenuLabel>
                <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-xl py-2">
                  <Link to="/settings">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2">
                      <Settings className="h-4 w-4" />
                    </span>
                    Settings
                  </Link>
                </DropdownMenuItem>
                {/* Premium removed */}
                {(isAdmin || isModerator) && (
                  <DropdownMenuItem asChild className="cursor-pointer gap-2.5 rounded-xl py-2">
                    <Link to="/admin">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2">
                        <Shield className="h-4 w-4" />
                      </span>
                      Admin
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>

              <DropdownMenuSeparator className="my-1.5" />

              <DropdownMenuItem
                onClick={signOut}
                className="cursor-pointer gap-2.5 rounded-xl py-2 text-destructive"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                  <LogOut className="h-4 w-4" />
                </span>
                Log out
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
                <Link
                  key={item.id}
                  to={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-full px-3.5 py-1.5 transition-all duration-200",
                    active
                      ? "text-primary bg-primary/10"
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
