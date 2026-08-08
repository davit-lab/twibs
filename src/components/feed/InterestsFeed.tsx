import { useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserInterests } from '@/hooks/useInterests';
import { useInterestPosts, useInterestPostActions } from '@/hooks/useInterestPosts';
import { useMutedUsers } from '@/hooks/useSafety';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
import InterestPostCard from './InterestPostCard';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import {
  PlusCircle,
  Loader2,
  ImagePlus,
  X,
  Sparkles,
} from 'lucide-react';

interface MediaPreview {
  file: File;
  preview: string;
  type: 'image' | 'video';
}

interface InterestsFeedProps {
  userId: string;
  isOwnProfile?: boolean;
}

export default function InterestsFeed({ userId, isOwnProfile = false }: InterestsFeedProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: userInterests, isLoading: interestsLoading } = useUserInterests(userId);
  const {
    data: postsData,
    isLoading: postsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInterestPosts({ userId });
  const { createPost } = useInterestPostActions();
  const queryClient = useQueryClient();
  const { data: mutedIds = [] } = useMutedUsers();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [mediaPreview, setMediaPreview] = useState<MediaPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const posts =
    postsData?.pages.flatMap((page) => page.posts).filter((p) => !mutedIds.includes(p.user_id)) ||
    [];

  const isLoading = interestsLoading || postsLoading;

  // Real-time interest posts
  useEffect(() => {
    const channel = supabase
      .channel('interest-posts-realtime')
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
      toast({
        variant: 'destructive',
        title: 'Invalid file',
        description: 'Please select an image or video file.',
      });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Maximum file size is 50MB.',
      });
      return;
    }

    setMediaPreview({
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' : 'image',
    });
  };

  const removeMedia = () => {
    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview.preview);
      setMediaPreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

    const { data: { publicUrl } } = supabase.storage
      .from('interest-media')
      .getPublicUrl(fileName);

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
          toast({
            variant: 'destructive',
            title: 'Upload failed',
            description: uploaded?.error || 'Failed to upload media. Please try again.',
          });
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
      setCreateDialogOpen(false);
    } finally {
      setUploading(false);
    }
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      removeMedia();
      setNewPostContent('');
      setSelectedCategory('');
    }
    setCreateDialogOpen(open);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-32 bg-muted rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  const interests = userInterests?.map((ui) => ui.interest_categories).filter(Boolean) || [];
  const availableCategories = interests;

  return (
    <div className="space-y-5">
      {/* User's Interests Display */}
      {interests.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {interests.map((interest) => (
            <span
              key={interest.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
              style={{
                backgroundColor: `${interest.color}20`,
                color: interest.color,
                borderColor: interest.color,
                borderWidth: 1,
              }}
            >
              {interest.name}
            </span>
          ))}
        </div>
      )}

      {/* Create post entry (all users) */}
      {isOwnProfile && (
        <Button
          variant="outline"
          className="w-full justify-start gap-3 h-auto py-3 px-4"
          onClick={() => setCreateDialogOpen(true)}
          disabled={availableCategories.length === 0}
        >
          <PlusCircle className="h-5 w-5 text-primary" />
          <span className="text-left">
            <span className="block font-bold">Post to your interests</span>
            <span className="block text-xs font-medium text-muted-foreground">
              {availableCategories.length > 0
                ? 'Share a thought with your communities'
                : 'Pick some interests to start posting'}
            </span>
          </span>
        </Button>
      )}

      {/* Interest Posts List */}
      {posts.length > 0 ? (
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
            {!hasNextPage && posts.length > 0 && (
              <p className="text-center text-sm text-muted-foreground font-medium">
                You've seen all posts
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-bold text-lg mb-2">No interest posts yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            {isOwnProfile
              ? 'Share your first post to your interests feed!'
              : 'This user has not posted any interest content yet'}
          </p>
          {isOwnProfile && availableCategories.length > 0 && (
            <Button variant="outline" className="mt-4" onClick={() => setCreateDialogOpen(true)}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Create post
            </Button>
          )}
          {isOwnProfile && availableCategories.length === 0 && (
            <Button variant="outline" className="mt-4" asChild>
              <Link to="/interests">Add interests</Link>
            </Button>
          )}
        </div>
      )}

      {/* Create Post Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Post to your interests</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Category</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an interest category" />
                </SelectTrigger>
                <SelectContent>
                  {availableCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        {category.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Content</label>
              <Textarea
                placeholder="Share your thoughts..."
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>

            {mediaPreview && (
              <div className="relative rounded-lg overflow-hidden border border-border">
                {mediaPreview.type === 'video' ? (
                  <video
                    src={mediaPreview.preview}
                    controls
                    className="w-full max-h-64 object-cover"
                  />
                ) : (
                  <img
                    src={mediaPreview.preview}
                    alt="Preview"
                    className="w-full max-h-64 object-cover"
                  />
                )}
                <button
                  onClick={removeMedia}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 hover:bg-background transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {!mediaPreview && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <ImagePlus className="h-4 w-4" />
                  Add Media
                </Button>
                <span className="text-xs text-muted-foreground">Images or videos up to 50MB</span>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleDialogClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreatePost}
                disabled={!newPostContent.trim() || !selectedCategory || createPost.isPending || uploading}
              >
                {(createPost.isPending || uploading) ? (
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
