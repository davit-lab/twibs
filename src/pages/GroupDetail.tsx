import { useRef, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import MainLayout from '@/components/layout/MainLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import GroupPostCard from '@/components/groups/GroupPostCard';
import GroupMembersSheet from '@/components/groups/GroupMembersSheet';
import GroupSettingsDialog from '@/components/groups/GroupSettingsDialog';
import MediaLightbox from '@/components/MediaLightbox';
import { useGroup, useGroupPosts, useGroupActions, uploadGroupMedia } from '@/hooks/useGroups';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Users, Lock, Globe, Loader2, ImagePlus, X, MoreHorizontal, Trash2,
  UserPlus, Check, MessageSquare, AlertTriangle, Settings, Camera,
} from 'lucide-react';

const POST_MAX = 2000;

export default function GroupDetail() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const { group, membership, isLoading: groupLoading, error } = useGroup(slug);
  const {
    data: postsData,
    isLoading: postsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useGroupPosts(group?.id || '');
  const { joinGroup, leaveGroup, deleteGroup, createPost } = useGroupActions();

  const [newPost, setNewPost] = useState('');
  const [mediaPreview, setMediaPreview] = useState<{ file: File; preview: string; type: 'image' | 'video' } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const posts = postsData?.pages.flatMap((page) => page.posts) || [];

  const isMember = !!membership;
  const isOwner = membership?.role === 'owner';
  const isAdmin = membership?.role === 'owner' || membership?.role === 'admin';
  const isPrivate = group?.privacy === 'private';

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast({ variant: 'destructive', title: 'Invalid file', description: 'Select an image or video.' });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum size is 50MB.' });
      return;
    }
    if (mediaPreview) URL.revokeObjectURL(mediaPreview.preview);
    setMediaPreview({ file, preview: URL.createObjectURL(file), type: file.type.startsWith('video/') ? 'video' : 'image' });
  };

  const removeMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview.preview);
    setMediaPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePost = async () => {
    if (!newPost.trim() || !group || posting) return;
    setPosting(true);
    try {
      let mediaUrl: string | undefined;
      let mediaType: string | undefined;
      if (mediaPreview) {
        try {
          const uploaded = await uploadGroupMedia(mediaPreview.file);
          mediaUrl = uploaded.url;
          mediaType = uploaded.type;
        } catch (err: any) {
          toast({
            variant: 'destructive',
            title: 'Upload failed',
            description: err?.message || 'Could not upload the media. Please try again.',
          });
          return;
        }
      }
      await createPost.mutateAsync({
        groupId: group.id,
        content: newPost.trim(),
        mediaUrl,
        mediaType,
      });
      setNewPost('');
      removeMedia();
    } finally {
      setPosting(false);
    }
  };

  const handleJoin = async () => {
    if (!group) return;
    setJoining(true);
    try {
      if (isMember) await leaveGroup.mutateAsync(group.id);
      else await joinGroup.mutateAsync(group.id);
    } finally {
      setJoining(false);
    }
  };

  if (groupLoading) {
    return (
      <MainLayout>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Skeleton className="h-40 rounded-2xl" />
          <div className="space-y-3 mt-6">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !group) {
    return (
      <MainLayout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-destructive/10 to-destructive/5 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-black mb-2">Group not found</h1>
          <p className="text-muted-foreground text-sm mb-6 font-medium">
            This group may not exist or is private.
          </p>
          <Button onClick={() => navigate('/groups')} className="rounded-xl font-bold">
            Back to Groups
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-background pb-24">
        {/* Cover */}
        <div className="relative h-40 md:h-56 lg:h-64 bg-gradient-to-br from-primary/20 via-primary/5 to-accent/10">
          {group.cover_url && (
            <img src={group.cover_url} alt="" className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />
          {isAdmin && (
            <button
              onClick={() => setSettingsOpen(true)}
              className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-background/90 backdrop-blur border border-border px-3 py-2 text-xs font-bold hover:bg-background transition-colors"
            >
              <Camera className="h-3.5 w-3.5" />
              Edit cover
            </button>
          )}
        </div>

        <div className="max-w-3xl mx-auto px-4 -mt-16 relative">
          {/* Header card */}
          <div className="bg-card border border-border/60 rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <Avatar className="h-16 w-16 sm:h-20 sm:w-20 ring-4 ring-background bg-muted flex-shrink-0">
                <AvatarImage src={group.avatar_url || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary font-bold text-2xl sm:text-3xl">
                  {group.name?.charAt(0)?.toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl md:text-3xl font-black tracking-tight">{group.name}</h1>
                  <Badge variant="secondary" className="gap-1">
                    {isPrivate ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                    {isPrivate ? 'Private' : 'Public'}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground font-medium flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    {group.member_count.toLocaleString()} members
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4" />
                    {group.post_count.toLocaleString()} posts
                  </span>
                  <span>· created {formatDistanceToNow(new Date(group.created_at), { addSuffix: true })}</span>
                </div>
                {group.description && (
                  <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{group.description}</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border/50">
              {isMember && (
                <Button
                  variant="outline"
                  onClick={() => setMembersOpen(true)}
                  className="rounded-xl font-bold"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Members
                  <span className="ml-1 text-xs opacity-70">{group.member_count}</span>
                </Button>
              )}

              {user && (
                <Button
                  onClick={handleJoin}
                  disabled={joining || isOwner}
                  className="rounded-xl font-bold"
                >
                  {joining ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : isOwner ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      You're the owner
                    </>
                  ) : isMember ? (
                    'Joined'
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Join Group
                    </>
                  )}
                </Button>
              )}

              {(isOwner || user?.id === group.creator_id) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl ml-auto">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isAdmin && (
                      <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                        <Settings className="h-4 w-4 mr-2" />
                        Group settings
                      </DropdownMenuItem>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={(e) => e.preventDefault()}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete group
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this group?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the group, all its posts, and answers. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={() => deleteGroup.mutateAsync(group.id).then(() => navigate('/groups'))}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Composer */}
          {isMember ? (
            <div className="mt-5 bg-card border border-border/60 rounded-2xl p-4 sm:p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
                Share something
              </p>
              <div className="flex items-start gap-3">
                <Avatar className="h-9 w-9 flex-shrink-0">
                  <AvatarFallback className="text-xs">U</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <Textarea
                    placeholder={`Share something with ${group.name}...`}
                    value={newPost}
                    onChange={(e) => setNewPost(e.target.value.slice(0, POST_MAX))}
                    rows={3}
                    className="resize-none"
                  />

                  {mediaPreview && (
                    <div className="relative mt-3 rounded-xl overflow-hidden border border-border">
                      {mediaPreview.type === 'video' ? (
                        <video src={mediaPreview.preview} controls className="w-full max-h-64 object-cover" />
                      ) : (
                        <button
                          onClick={() => setLightboxOpen(true)}
                          className="block w-full cursor-zoom-in"
                        >
                          <img src={mediaPreview.preview} alt="Preview" className="w-full max-h-64 object-cover" />
                        </button>
                      )}
                      <button
                        onClick={removeMedia}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 hover:bg-background transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="gap-2"
                      >
                        <ImagePlus className="h-4 w-4" />
                        Media
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="hidden sm:inline font-mono text-[10px] text-muted-foreground">
                        {newPost.length}/{POST_MAX}
                      </span>
                      <Button
                        onClick={handlePost}
                        disabled={!newPost.trim() || posting || uploading}
                        className="rounded-xl font-bold"
                      >
                        {posting || uploading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {uploading ? 'Uploading...' : 'Posting...'}
                          </>
                        ) : (
                          'Post'
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : isPrivate && user ? (
            <div className="mt-5 text-center py-12 bg-card border border-border/60 rounded-2xl">
              <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                <Lock className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-bold text-lg mb-1">This is a private group</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Join this group to see and post in its community.
              </p>
              <Button onClick={handleJoin} disabled={joining} className="mt-5 rounded-xl font-bold">
                {joining ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                Join Group
              </Button>
            </div>
          ) : null}

          {/* Feed header */}
          <div className="mt-8">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">Community feed</h2>
              <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                {group.post_count} post{group.post_count === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-2 h-px bg-border" />
          </div>

          {/* Posts */}
          <div className="mt-5 space-y-4">
            {postsLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-14 bg-card border border-border/60 rounded-2xl">
                <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                  <MessageSquare className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-bold text-lg mb-1">No posts yet</h3>
                <p className="text-sm text-muted-foreground">
                  {isMember ? 'Be the first to start the conversation!' : 'Check back soon.'}
                </p>
              </div>
            ) : (
              posts.map((post) => (
                <GroupPostCard key={post.id} post={post} groupName={group.name} />
              ))
            )}

            <div ref={loadMoreRef} className="py-4">
              {isFetchingNextPage && (
                <div className="flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {!hasNextPage && posts.length > 0 && (
                <p className="text-center text-sm text-muted-foreground">You've seen all posts</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <GroupMembersSheet
        open={membersOpen}
        onOpenChange={setMembersOpen}
        groupId={group.id}
        groupName={group.name || 'this group'}
        canManage={isAdmin}
        viewerRole={membership?.role || null}
      />
      <GroupSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} group={group} />
      {lightboxOpen && mediaPreview?.type === 'image' && (
        <MediaLightbox src={mediaPreview.preview} alt="Post preview" onClose={() => setLightboxOpen(false)} />
      )}
    </MainLayout>
  );
}
