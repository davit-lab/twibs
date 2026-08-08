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
  Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';

interface MainLayoutProps {
  children: ReactNode;
  immersive?: boolean;
}

const navItems = [
  { icon: Home, label: 'Home', href: '/', id: 'home' },
  { icon: Compass, label: 'Explore', href: '/explore', id: 'explore' },
  { icon: Sparkles, label: 'Interests', href: '/interests', id: 'interests' },
  { icon: Clapperboard, label: 'Reels', href: '/reels', id: 'reels' },
  { icon: MessageCircle, label: 'Messages', href: '/messages', id: 'messages' },
  { icon: Heart, label: 'Notifications', href: '/notifications', id: 'notifications' },
  { icon: PlusSquare, label: 'Create', href: '#create', id: 'create' },
  { icon: BookOpen, label: 'Library', href: '/library', id: 'library' },
  { icon: Radio, label: 'Live TV', href: '/tv', id: 'tv' },
  { icon: Users, label: 'Groups', href: '/groups', id: 'groups' },
];

const mobileNavItems = [
  { icon: Home, label: 'Home', href: '/', id: 'home' },
  { icon: Compass, label: 'Explore', href: '/explore', id: 'explore' },
  { icon: null, label: 'Create', href: '#create', id: 'create' },
  { icon: Clapperboard, label: 'Reels', href: '/reels', id: 'reels' },
  { icon: Menu, label: 'More', href: '#more', id: 'more' },
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
    <div className="min-h-screen bg-background">
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
                      className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/30 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
                    >
                      <Plus className="h-6 w-6" strokeWidth={2.5} />
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
              <DropdownMenuItem asChild>
                <Link to="/pricing" className="cursor-pointer">
                  <Crown className="mr-3 h-4 w-4" />
                  Premium
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
        </aside>
      )}

      {/* Mobile Floating Nav - Notifications & Chats */}
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
          <Link to="/messages">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-primary/10">
              <MessageCircle className="h-5 w-5" strokeWidth={1.5} />
            </Button>
          </Link>
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
      <main className={cn('min-h-screen', user && !immersive && 'lg:ml-[80px]')}>
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

      {/* Mobile Bottom Navigation - Floating Glass Pill */}
      {user && !immersive && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-2 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-[430px] rounded-full bg-background/75 backdrop-blur-xl border border-border/60 shadow-lg shadow-black/10 flex items-center justify-around h-16 px-2 relative">
            {mobileNavItems.map((item) => {
              const active = isActive(item.href);
              const isMore = item.href === '#more';
              const isCreate = item.href === '#create';

              if (isCreate) {
                return (
                  <button
                    key={item.id}
                    onClick={() => setCreateDialogOpen(true)}
                    aria-label="Create post"
                    className="relative -mt-6"
                  >
                    <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/40 ring-4 ring-background/40 transition-transform active:scale-95 hover:scale-105">
                      <Plus className="h-6 w-6" strokeWidth={2.5} />
                    </div>
                  </button>
                );
              }

              if (isMore) {
                return (
                  <DropdownMenu key={item.id}>
                    <DropdownMenuTrigger asChild>
                      <button className="flex flex-col items-center justify-center gap-1 rounded-full px-3.5 py-1.5 text-muted-foreground hover:text-foreground transition-colors">
                        <Menu className="h-5 w-5" strokeWidth={1.5} />
                        <span className="text-[10px] font-medium">{item.label}</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[200px]" align="end" side="top" sideOffset={14}>
                      <DropdownMenuItem asChild>
                        <Link to={`/profile/${profile?.username}`} className="cursor-pointer">
                          <User className="mr-3 h-4 w-4" />
                          Profile
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/library" className="cursor-pointer">
                          <BookOpen className="mr-3 h-4 w-4" />
                          Library
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/tv" className="cursor-pointer">
                          <Radio className="mr-3 h-4 w-4" />
                          Live TV
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/groups" className="cursor-pointer">
                          <Users className="mr-3 h-4 w-4" />
                          Groups
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/interests" className="cursor-pointer">
                          <Sparkles className="mr-3 h-4 w-4" />
                          Interests
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/notifications" className="cursor-pointer">
                          <Heart className="mr-3 h-4 w-4" />
                          Notifications
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/messages" className="cursor-pointer">
                          <MessageCircle className="mr-3 h-4 w-4" />
                          Messages
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to="/settings" className="cursor-pointer">
                          <Settings className="mr-3 h-4 w-4" />
                          Settings
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/pricing" className="cursor-pointer">
                          <Crown className="mr-3 h-4 w-4" />
                          Premium
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
