import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layout/MainLayout';
import InterestPostCard from '@/components/feed/InterestPostCard';
import InterestCard from '@/components/onboarding/InterestCard';
import {
  useUserInterests,
  useInterestCategories,
  useInterestActions,
} from '@/hooks/useInterests';
import { useInterestPosts, useInterestPostActions } from '@/hooks/useInterestPosts';
import { useMutedUsers } from '@/hooks/useSafety';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  ImagePlus,
  X,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MediaPreview {
  file: File;
  preview: string;
  type: 'image' | 'video';
}

export default function Interests() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: userInterests, isLoading: interestsLoading } = useUserInterests(user?.id);
  const { data: allCategories } = useInterestCategories();
  const { saveInterests } = useInterestActions();
  const { createPost } = useInterestPostActions();
  const { data: mutedIds = [] } = useMutedUsers();

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [mediaPreview, setMediaPreview] = useState<MediaPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageSelection, setManageSelection] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const interestCategories = useMemo(
    () =>
      (userInterests
        ?.map((ui) => ui.interest_categories)
        .filter((c): c is { id: string; name: string; icon: string; color: string } => !!c) || []),
    [userInterests]
  );

  const activeCategoryIds = useMemo(() => {
    if (activeCategory === 'all') return interestCategories.map((c) => c.id);
    if (!interestCategories.some((c) => c.id === activeCategory)) return interestCategories.map((c) => c.id);
    return [activeCategory];
  }, [activeCategory, interestCategories]);

  const {
    data: postsData,
    isLoading: postsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInterestPosts({
    categoryIds: activeCategoryIds,
    limit: 12,
  });

  const posts =
    postsData?.pages.flatMap((page) => page.posts).filter((p) => !mutedIds.includes(p.user_id)) ||
    [];

  // Real-time interest posts
  useEffect(() => {
    const channel = supabase
      .channel('interests-page-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'interest_posts' },
        () => queryClient.invalidateQueries({ queryKey: ['interest-posts'] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast({ variant: 'destructive', title: 'Invalid file', description: 'Please select an image or video file.' });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 50MB.' });
      return;
    }

    setMediaPreview({
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' : 'image',
    });
  };

  const removeMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview.preview);
    setMediaPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadMedia = async (file: File): Promise<{ url: string; type: string; error?: string } | null> => {
    if (!user) return null;
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error } = await supabase.storage.from('interest-media').upload(fileName, file);
    if (error) {
      console.error('Upload error:', error);
      return { url: '', type: '', error: error.message };
    }

    const { data: { publicUrl } } = supabase.storage.from('interest-media').getPublicUrl(fileName);
    return { url: publicUrl, type: file.type };
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim() || !selectedCategory) return;

    setUploading(true);
    try {
      let mediaUrl: string | undefined;
      let mediaType: string | undefined;

      if (mediaPreview) {
        const uploaded = await uploadMedia(mediaPreview.file);
        if (uploaded && uploaded.url) {
          mediaUrl = uploaded.url;
          mediaType = uploaded.type;
        } else {
          toast({ variant: 'destructive', title: 'Upload failed', description: uploaded?.error || 'Failed to upload media. Please try again.' });
          setUploading(false);
          return;
        }
      }

      await createPost.mutateAsync({
        content: newPostContent.trim(),
        categoryId: selectedCategory,
        mediaUrl,
        mediaType,
      });

      removeMedia();
      setNewPostContent('');
      setSelectedCategory('');
      setComposerOpen(false);
      setActiveCategory('all');
    } finally {
      setUploading(false);
    }
  };

  const openManage = () => {
    setManageSelection(userInterests?.map((ui) => ui.category_id) || []);
    setManageOpen(true);
  };

  const toggleManage = (id: string) => {
    setManageSelection((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleSaveInterests = async () => {
    await saveInterests.mutateAsync(manageSelection);
    setManageOpen(false);
  };

  const canPost = newPostContent.trim().length > 0 && !!selectedCategory;

  const categoryChips = [
    {
      id: 'all',
      name: 'For you',
      color: undefined,
    },
    ...interestCategories,
  ];

  return (
    <MainLayout>
      <div className="min-h-screen bg-background pb-28">
        {/* Editorial Hero */}
        <div className="border-b border-border">
          <div className="max-w-3xl mx-auto px-4 py-10 md:py-12">
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary mb-4">
                  Your feed, filtered
                </p>
                <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-none">
                  Interests
                </h1>
              </div>
              <p className="text-muted-foreground text-sm font-medium pb-1 hidden sm:block text-right leading-relaxed">
                Posts about the things
                <br />
                you actually care about
              </p>
            </div>
          </div>
        </div>

        {/* Category chips + manage */}
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
          <div className="max-w-3xl mx-auto px-4">
            <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-hide pr-2">
              {categoryChips.map((chip) => {
                const active = activeCategory === chip.id;
                return (
                  <button
                    key={chip.id}
                    onClick={() => setActiveCategory(chip.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-all duration-200',
                      chip.id === 'all'
                        ? active
                          ? 'bg-foreground text-background shadow-sm'
                          : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                        : active
                          ? 'shadow-sm'
                          : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                    )}
                    style={
                      chip.id !== 'all' && active
                        ? { backgroundColor: `${chip.color}18`, color: chip.color, borderColor: chip.color }
                        : chip.id !== 'all'
                          ? { borderColor: `${chip.color}55` }
                          : undefined
                    }
                  >
                    {chip.id !== 'all' && (
                      <span
                        className={cn('w-1.5 h-1.5 rounded-full', !active && 'opacity-60')}
                        style={{ backgroundColor: active ? chip.color : `${chip.color}99` }}
                      />
                    )}
                    {chip.name}
                  </button>
                );
              })}

              <button
                onClick={openManage}
                className="sticky right-0 flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors whitespace-nowrap bg-background/95 backdrop-blur shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.2)]"
              >
                <Settings2 className="h-4 w-4" />
                Manage
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
          {/* Composer */}
          {composerOpen ? (
            <div className="p-4 rounded-2xl border border-border/70 bg-card space-y-3">
              <div className="flex items-start gap-3">
                <LinkAvatar
                  avatarUrl={profile?.avatar_url || null}
                  displayName={profile?.display_name || ''}
                  username={profile?.username || ''}
                />
                <Textarea
                  autoFocus
                  placeholder="Share something with your interests..."
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  rows={3}
                  className="flex-1 resize-none bg-transparent border-none focus-visible:ring-0 p-0 text-[15px]"
                />
              </div>

              {mediaPreview && (
                <div className="relative rounded-xl overflow-hidden border border-border/60">
                  {mediaPreview.type === 'video' ? (
                    <video src={mediaPreview.preview} controls className="w-full max-h-64 object-cover" />
                  ) : (
                    <img src={mediaPreview.preview} alt="Preview" className="w-full max-h-64 object-cover" />
                  )}
                  <button
                    onClick={removeMedia}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 hover:bg-background transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-2 text-muted-foreground"
                  >
                    <ImagePlus className="h-4 w-4" />
                    Media
                  </Button>

                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="h-9 w-auto min-w-[140px] gap-2 text-xs font-bold">
                      <SelectValue placeholder="Pick a topic" />
                    </SelectTrigger>
                    <SelectContent>
                      {interestCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: category.color }} />
                            {category.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setComposerOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreatePost}
                    disabled={!canPost || createPost.isPending || uploading}
                  >
                    {createPost.isPending || uploading ? (
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
          ) : (
            <button
              onClick={() => {
                if (interestCategories.length === 0) return;
                setSelectedCategory(interestCategories[0]?.id || '');
                setComposerOpen(true);
              }}
              className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border/70 bg-card text-left transition-colors hover:border-border"
            >
              <LinkAvatar
                avatarUrl={profile?.avatar_url || null}
                displayName={profile?.display_name || ''}
                username={profile?.username || ''}
              />
              <span className="text-[15px] text-muted-foreground font-medium">
                {interestCategories.length > 0
                  ? 'Share something with your interests...'
                  : 'Pick interests to start posting'}
              </span>
            </button>
          )}

          {/* Feed */}
          {postsLoading || interestsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-5 rounded-2xl border border-border/70 bg-card animate-pulse space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-4 w-28 bg-muted rounded" />
                      <div className="h-3 w-20 bg-muted rounded" />
                    </div>
                  </div>
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-4 w-3/4 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : posts.length > 0 ? (
            <div className="space-y-3">
              {posts.map((post) => (
                <InterestPostCard key={post.id} post={post} />
              ))}

              <div ref={loadMoreRef} className="py-4">
                {isFetchingNextPage && (
                  <div className="flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!hasNextPage && (
                  <p className="text-center text-sm text-muted-foreground font-medium">
                    You're all caught up
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-black text-xl tracking-tight mb-1.5">
                {interestCategories.length === 0 ? 'No interests yet' : 'Nothing here yet'}
              </h3>
              <p className="text-sm text-muted-foreground font-medium max-w-xs mx-auto mb-5">
                {interestCategories.length === 0
                    ? "Pick a few things you love and we'll fill this space."
                  : 'Be the first to post about this topic.'}
              </p>
              <Button variant="outline" onClick={interestCategories.length === 0 ? openManage : undefined}>
                {interestCategories.length === 0 ? 'Choose interests' : 'Post to your interests'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Manage interests dialog */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage your interests</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
            {allCategories?.map((category) => (
              <InterestCard
                key={category.id}
                name={category.name}
                icon={category.icon}
                color={category.color}
                selected={manageSelection.includes(category.id)}
                onToggle={() => toggleManage(category.id)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-sm text-muted-foreground font-medium">
              {manageSelection.length} selected
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setManageOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveInterests}
                disabled={manageSelection.length === 0 || saveInterests.isPending}
              >
                {saveInterests.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

function LinkAvatar({
  avatarUrl,
  displayName,
  username,
}: {
  avatarUrl: string | null;
  displayName: string;
  username: string;
}) {
  return (
    <Avatar className="h-10 w-10 flex-shrink-0">
      <AvatarImage src={avatarUrl || undefined} />
      <AvatarFallback className="bg-surface-2 text-foreground font-bold">
        {displayName?.charAt(0) || 'U'}
      </AvatarFallback>
    </Avatar>
  );
}
