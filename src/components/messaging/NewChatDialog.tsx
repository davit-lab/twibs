import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Loader2, Plus, Search, Users, Hash, KeyRound, Sparkles, X, PartyPopper, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import AvatarCollage from './AvatarCollage';

interface Friend {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
}

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (conversationId: string) => void;
  onCreateGroup: (name: string, memberIds: string[], avatarUrl?: string) => Promise<string | null>;
  onCreateCommunity: (name: string, description?: string, avatarUrl?: string) => Promise<string | null>;
  onJoinByCode: (code: string) => Promise<string | null>;
}

type DialogTab = 'group' | 'community' | 'join';

const TABS: { id: DialogTab; label: string; icon: typeof Users }[] = [
  { id: 'group', label: 'New Group', icon: Users },
  { id: 'community', label: 'Community', icon: Hash },
  { id: 'join', label: 'Join', icon: KeyRound },
];

export default function NewChatDialog({
  open,
  onOpenChange,
  onCreated,
  onCreateGroup,
  onCreateCommunity,
  onJoinByCode,
}: NewChatDialogProps) {
  const { user } = useAuth();

  const [tab, setTab] = useState<DialogTab>('group');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendQuery, setFriendQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [communityName, setCommunityName] = useState('');
  const [communityDescription, setCommunityDescription] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultCode, setResultCode] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !user) return;

    const fetchFriends = async () => {
      setFriendsLoading(true);
      try {
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id)
          .eq('status', 'accepted');

        const friendIds = (follows || []).map(f => f.following_id).filter(id => id !== user.id);

        if (friendIds.length === 0) {
          setFriends([]);
          return;
        }

        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url, is_verified')
          .in('user_id', friendIds);

        setFriends((profiles || []) as Friend[]);
      } catch (err) {
        console.error('Error fetching friends:', err);
      } finally {
        setFriendsLoading(false);
      }
    };

    fetchFriends();
  }, [open, user]);

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set());
      setGroupName('');
      setCommunityName('');
      setCommunityDescription('');
      setJoinCode('');
      setError(null);
      setResultCode(null);
      setCreatedId(null);
      setCopied(false);
    }
  }, [open]);

  const fetchJoinCode = async (conversationId: string): Promise<string | null> => {
    const { data } = await supabase
      .from('conversations')
      .select('join_code')
      .eq('id', conversationId)
      .single();
    return data?.join_code || null;
  };

  const finishCreate = (id: string, code: string | null) => {
    if (code) {
      setResultCode(code);
      setCreatedId(id);
    } else {
      onOpenChange(false);
      onCreated(id);
    }
  };

  const toggleSelect = (userId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedIds.size === 0) return;
    setSubmitting(true);
    setError(null);
    const id = await onCreateGroup(groupName.trim(), Array.from(selectedIds));
    setSubmitting(false);
    if (id) {
      const code = await fetchJoinCode(id);
      finishCreate(id, code);
    } else {
      setError('Failed to create group. Make sure the database migration is applied.');
    }
  };

  const handleCreateCommunity = async () => {
    if (!communityName.trim()) return;
    setSubmitting(true);
    setError(null);
    const id = await onCreateCommunity(communityName.trim(), communityDescription.trim() || undefined);
    setSubmitting(false);
    if (id) {
      const code = await fetchJoinCode(id);
      finishCreate(id, code);
    } else {
      setError('Failed to create community. Make sure the database migration is applied.');
    }
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setSubmitting(true);
    setError(null);
    const id = await onJoinByCode(code);
    setSubmitting(false);
    if (id) {
      onOpenChange(false);
      onCreated(id);
    } else {
      setError('Invalid code or the group/community does not exist.');
    }
  };

  const handleCopyCode = async () => {
    if (!resultCode) return;
    try {
      await navigator.clipboard.writeText(resultCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const getInitials = (name: string) =>
    name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  const filteredFriends = friends.filter(f =>
    f.display_name.toLowerCase().includes(friendQuery.toLowerCase()) ||
    f.username.toLowerCase().includes(friendQuery.toLowerCase())
  );

  const selectedFriends = friends.filter(f => selectedIds.has(f.user_id));
  const tabIndex = TABS.findIndex(t => t.id === tab);

  const createDisabled =
    submitting ||
    (tab === 'group'
      ? !groupName.trim() || selectedIds.size === 0
      : tab === 'community'
        ? !communityName.trim()
        : !joinCode.trim());

  const createLabel = tab === 'group'
    ? 'Create Group'
    : tab === 'community'
      ? 'Create Community'
      : 'Join by Code';

  const CreateIcon = tab === 'group' ? Users : tab === 'community' ? Sparkles : KeyRound;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0 rounded-3xl">
        {resultCode ? (
          /* ---------- Success screen ---------- */
          <div className="relative flex-1 overflow-hidden px-6 py-8">
            <div className="absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
            <div className="flex flex-col items-center text-center relative">
              {/* Sparkles */}
              {[0, 1, 2, 3, 4].map(i => (
                <Sparkles
                  key={i}
                  className="absolute text-primary/70 pointer-events-none"
                  style={{
                    top: `${10 + (i % 3) * 12}%`,
                    left: `${12 + i * 17}%`,
                    width: i % 2 ? 14 : 10,
                    height: i % 2 ? 14 : 10,
                    animation: `float-up 1.6s cubic-bezier(0.22, 0.61, 0.36, 1) ${i * 0.25}s forwards`,
                  }}
                />
              ))}

              <div className="relative mb-6 mt-2">
                <span className="absolute inset-0 rounded-full bg-primary/25 animate-ping" />
                <span className="absolute -inset-4 rounded-full bg-primary/10" />
                <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary to-[hsl(285_80%_58%)] flex items-center justify-center shadow-xl shadow-primary/40">
                  <Check className="h-10 w-10 text-white" strokeWidth={3} />
                </div>
              </div>

              <h3 className="text-xl font-extrabold tracking-tight mb-1.5">You&rsquo;re in!</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                Share this code with friends so they can join the conversation.
              </p>

              <button
                onClick={handleCopyCode}
                className="relative flex items-center gap-3 px-6 py-4 rounded-2xl bg-primary/10 ring-1 ring-primary/30 hover:bg-primary/15 hover:ring-primary/50 transition-all active:scale-95 group"
              >
                <KeyRound className="h-5 w-5 text-primary" />
                <span className="font-mono font-bold tracking-[0.3em] text-lg">{resultCode}</span>
                <span className={cn(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all',
                  copied ? 'bg-success/15 text-success' : 'bg-background/60 text-muted-foreground'
                )}>
                  {copied ? 'Copied' : 'Tap to copy'}
                </span>
              </button>

              <div className="flex flex-col items-center gap-2 mt-3 h-4">
                {copied && (
                  <span className="text-xs font-medium text-success flex items-center gap-1 animate-fade-in">
                    <Check className="h-3 w-3" /> Copied to clipboard!
                  </span>
                )}
              </div>

              <Button
                className="w-full mt-6 h-12 rounded-2xl font-semibold gap-2"
                onClick={() => {
                  onOpenChange(false);
                  if (createdId) onCreated(createdId);
                }}
              >
                Open chat
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* ---------- Header + tabs ---------- */}
            <div className="pt-5 px-5 pb-4 border-b border-border/60 bg-card/50">
              <div className="flex items-center justify-between mb-4 pr-8">
                <div>
                  <h2 className="text-lg font-bold leading-none tracking-tight">Start a conversation</h2>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Create a group, a community, or join with a code
                  </p>
                </div>
                <PartyPopper className="h-5 w-5 text-primary/60 flex-shrink-0" />
              </div>

              {/* Sliding tabs */}
              <div className="relative grid grid-cols-3 gap-1 p-1 rounded-2xl bg-surface-2">
                <span
                  className="absolute top-1 bottom-1 rounded-xl bg-foreground shadow-sm transition-all duration-300 ease-out"
                  style={{
                    left: `calc(4px + ${tabIndex} * ((100% - 8px) / 3))`,
                    width: `calc((100% - 8px) / 3)`,
                  }}
                />
                {TABS.map(t => {
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={cn(
                        'relative flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200',
                        active ? 'text-background' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <t.icon className={cn('h-4 w-4', active && 'text-background')} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ---------- Body ---------- */}
            <div className="flex-1 overflow-y-auto p-5">
              {tab === 'group' ? (
                <div className="space-y-4">
                  {/* Live preview */}
                  <div className="relative rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.09] to-primary/[0.02] p-4 overflow-hidden">
                    <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
                    <div className="relative flex items-center gap-4">
                      <AvatarCollage
                        items={selectedFriends.slice(0, 3).map(f => ({ url: f.avatar_url, name: f.display_name }))}
                        size={56}
                        count={selectedIds.size}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[15px] truncate">
                          {groupName.trim() || 'New Group'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {selectedIds.size === 0
                            ? 'Pick friends to build the group'
                            : `${selectedIds.size} member${selectedIds.size === 1 ? '' : 's'} selected`}
                        </p>
                      </div>
                      <div className="flex -space-x-2 flex-shrink-0">
                        {selectedFriends.slice(0, 3).map(f => (
                          <div key={f.user_id} className="h-7 w-7 rounded-full ring-2 ring-background overflow-hidden bg-surface-3 flex-shrink-0">
                            {f.avatar_url ? (
                              <img src={f.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="h-full w-full flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                                {getInitials(f.display_name)}
                              </span>
                            )}
                          </div>
                        ))}
                        {selectedIds.size > 3 && (
                          <div className="h-7 w-7 rounded-full ring-2 ring-background bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">
                            +{selectedIds.size - 3}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Group name</label>
                    <Input
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="e.g. Weekend Book Club"
                      className="h-11 rounded-xl"
                    />
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={friendQuery}
                      onChange={(e) => setFriendQuery(e.target.value)}
                      placeholder="Search friends..."
                      className="w-full h-11 pl-10 pr-4 rounded-xl bg-surface-2 text-foreground text-sm outline-none border border-transparent transition-all duration-200 focus:border-primary/40 focus:ring-2 focus:ring-primary/15 focus:bg-background"
                    />
                  </div>

                  {selectedIds.size > 0 && (
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 py-0.5">
                      {selectedFriends.map(f => (
                        <div
                          key={f.user_id}
                          className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-primary/10 border border-primary/20 flex-shrink-0 animate-scale-in"
                        >
                          <Avatar className="h-6 w-6 rounded-full">
                            <AvatarImage src={f.avatar_url || undefined} />
                            <AvatarFallback className="rounded-full bg-gradient-to-br from-primary to-primary/60 text-white text-[9px] font-bold">
                              {getInitials(f.display_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs font-medium max-w-[90px] truncate">
                            {f.display_name.split(' ')[0]}
                          </span>
                          <button
                            onClick={() => toggleSelect(f.user_id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select friends'}
                  </div>

                  <div className="space-y-1 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                    {friendsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    ) : filteredFriends.length === 0 ? (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        No friends found. Follow some people first.
                      </div>
                    ) : (
                      filteredFriends.map(friend => {
                        const isSelected = selectedIds.has(friend.user_id);
                        return (
                          <button
                            key={friend.user_id}
                            onClick={() => toggleSelect(friend.user_id)}
                            className={cn(
                              'w-full flex items-center gap-3 p-2.5 rounded-2xl transition-all text-left',
                              isSelected
                                ? 'bg-primary/[0.08] ring-1 ring-primary/25'
                                : 'hover:bg-surface-2'
                            )}
                          >
                            <div className={cn(
                              'rounded-full p-[2px] transition-all duration-200 flex-shrink-0',
                              isSelected ? 'bg-gradient-to-tr from-primary to-success' : 'bg-transparent'
                            )}>
                              <Avatar className="h-10 w-10 rounded-full ring-2 ring-background">
                                <AvatarImage src={friend.avatar_url || undefined} />
                                <AvatarFallback className="rounded-full bg-gradient-to-br from-primary to-primary/60 text-white text-xs font-bold">
                                  {getInitials(friend.display_name)}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{friend.display_name}</p>
                              <p className="text-xs text-muted-foreground truncate">@{friend.username}</p>
                            </div>
                            <div className={cn(
                              'h-6 w-6 rounded-full flex items-center justify-center transition-all duration-200 flex-shrink-0',
                              isSelected
                                ? 'bg-primary text-white shadow-sm shadow-primary/30 animate-like-pop'
                                : 'bg-surface-3 text-muted-foreground'
                            )}>
                              {isSelected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Plus className="h-3.5 w-3.5" />}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : tab === 'community' ? (
                <div className="space-y-4">
                  {/* Live preview */}
                  <div className="relative rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.09] to-primary/[0.02] p-4 overflow-hidden">
                    <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
                    <div className="relative flex items-center gap-4">
                      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-[hsl(285_80%_58%)] flex items-center justify-center ring-2 ring-background shadow-md shadow-primary/25 flex-shrink-0">
                        <Hash className="h-6 w-6 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[15px] truncate">
                          {communityName.trim() || 'New Community'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {communityDescription.trim() || 'A space for people to share and connect'}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-1 flex-shrink-0">
                        Community
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Community name</label>
                    <Input
                      value={communityName}
                      onChange={(e) => setCommunityName(e.target.value)}
                      placeholder="e.g. # Reading Corner"
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Description</label>
                    <Input
                      value={communityDescription}
                      onChange={(e) => setCommunityDescription(e.target.value)}
                      placeholder="What is this community about?"
                      className="h-11 rounded-xl"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-primary/[0.07] ring-1 ring-primary/15">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <KeyRound className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter the <span className="font-bold text-foreground">8-character code</span> to join a group or
                      community. Ask the owner for their code.
                    </p>
                  </div>
                  <Input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="ABC123EF"
                    maxLength={8}
                    className="h-14 rounded-2xl text-center font-mono font-bold uppercase tracking-[0.35em] text-lg"
                  />
                  <div className="flex items-center justify-center gap-1">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <span
                        key={i}
                        className={cn(
                          'h-1.5 rounded-full transition-all duration-300',
                          i < joinCode.length ? 'bg-primary w-3' : 'bg-surface-3 w-2'
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-center text-xs text-muted-foreground">
                    {joinCode.length === 8 ? 'Code looks complete — hit the button!' : `${joinCode.length}/8 characters`}
                  </p>
                </div>
              )}

              {error && (
                <p className="mt-4 text-sm font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5">
                  {error}
                </p>
              )}
            </div>

            {/* ---------- Footer ---------- */}
            <div className="border-t border-border/60 p-4 bg-card/50">
              <Button
                className="w-full h-12 rounded-2xl gap-2 font-semibold"
                disabled={createDisabled}
                onClick={() => {
                  if (tab === 'group') handleCreateGroup();
                  else if (tab === 'community') handleCreateCommunity();
                  else handleJoin();
                }}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreateIcon className="h-4 w-4" />
                )}
                {createLabel}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
