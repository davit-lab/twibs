import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Loader2, Plus, Search, Users, Hash, KeyRound, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0 rounded-2xl">
        {resultCode ? (
          <>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col items-center text-center py-6">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Check className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-bold mb-1">Created!</h3>
                <p className="text-sm text-muted-foreground mb-5 max-w-xs">
                  Share this code with friends so they can join the conversation.
                </p>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-primary/10 ring-1 ring-primary/30 hover:bg-primary/15 transition-colors"
                >
                  <KeyRound className="h-5 w-5 text-primary" />
                  <span className="font-mono font-bold tracking-[0.3em] text-lg">{resultCode}</span>
                </button>
                <span className="text-xs text-muted-foreground mt-2 h-4">
                  {copied ? 'Copied to clipboard!' : 'Tap to copy'}
                </span>
                <Button
                  className="w-full mt-6 h-11 rounded-xl font-semibold"
                  onClick={() => {
                    onOpenChange(false);
                    if (createdId) onCreated(createdId);
                  }}
                >
                  Open chat
                </Button>
              </div>
            </div>
          </>
        ) : (
        <>
        {/* Tabs */}
        <div className="flex p-2 gap-1 border-b border-border/60 bg-card/50">
          <button
            onClick={() => setTab('group')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
              tab === 'group'
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
            )}
          >
            <Users className="h-4 w-4" />
            New Group
          </button>
          <button
            onClick={() => setTab('community')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
              tab === 'community'
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
            )}
          >
            <Hash className="h-4 w-4" />
            Community
          </button>
          <button
            onClick={() => setTab('join')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
              tab === 'join'
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
            )}
          >
            <KeyRound className="h-4 w-4" />
            Join by code
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'group' ? (
            <div className="space-y-4">
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
                  className="orbis-search"
                />
              </div>

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
                          'w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left',
                          isSelected
                            ? 'bg-primary/10 ring-1 ring-primary/30'
                            : 'hover:bg-muted/50'
                        )}
                      >
                        <Avatar className="h-10 w-10 rounded-full">
                          <AvatarImage src={friend.avatar_url || undefined} />
                          <AvatarFallback className="rounded-full bg-gradient-to-br from-primary to-primary/60 text-white text-xs font-bold">
                            {getInitials(friend.display_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{friend.display_name}</p>
                          <p className="text-xs text-muted-foreground truncate">@{friend.username}</p>
                        </div>
                        <div className={cn(
                          'h-6 w-6 rounded-full flex items-center justify-center transition-all flex-shrink-0',
                          isSelected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                        )}>
                          {isSelected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : tab === 'community' ? (
            <div className="space-y-4">
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
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                <KeyRound className="h-5 w-5 text-primary flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Enter the 8-character code to join a <span className="font-semibold text-foreground">group</span> or{' '}
                  <span className="font-semibold text-foreground">community</span>. Ask the owner for their code.
                </p>
              </div>
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. ABC123EF"
                maxLength={8}
                className="h-12 rounded-xl text-center font-mono font-bold uppercase tracking-[0.3em]"
              />
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/60 p-4 bg-card/50">
          <Button
            className="w-full h-11 rounded-xl gap-2 font-semibold"
            disabled={
              submitting ||
              (tab === 'group'
                ? !groupName.trim() || selectedIds.size === 0
                : tab === 'community'
                  ? !communityName.trim()
                  : !joinCode.trim())
            }
            onClick={() => {
              if (tab === 'group') handleCreateGroup();
              else if (tab === 'community') handleCreateCommunity();
              else handleJoin();
            }}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : tab === 'group' ? (
              <Users className="h-4 w-4" />
            ) : tab === 'community' ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {tab === 'group'
              ? 'Create Group'
              : tab === 'community'
                ? 'Create Community'
                : 'Join by Code'}
          </Button>
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
