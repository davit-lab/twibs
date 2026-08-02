import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useUserInterests, useInterestCategories } from '@/hooks/useInterests';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useInterestPosts, useInterestPostActions, InterestPost } from '@/hooks/useInterestPosts';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import InterestPostComments from './InterestPostComments';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Sparkles, Lock, Crown, PlusCircle, Heart, MessageCircle, 
  Share2, MoreHorizontal, Trash2, Loader2, BadgeCheck, ImagePlus, X, 
  Copy, Check, Twitter, Facebook, MessageSquare, Link as LinkIcon
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

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
  const { data: categories } = useInterestCategories();
  const { data: isPremium, isLoading: premiumLoading } = usePremiumStatus(userId);
  const { data: viewerIsPremium } = usePremiumStatus(user?.id);
  const { data: postsData, isLoading: postsLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInterestPosts({ userId });
  const { createPost, deletePost, likePost, unlikePost } = useInterestPostActions();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [commentsPost, setCommentsPost] = useState<InterestPost | null>(null);
  const [mediaPreview, setMediaPreview] = useState<MediaPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  // Flatten paginated posts
  const posts = postsData?.pages.flatMap(page => page.posts) || [];
  
  const isLoading = interestsLoading || premiumLoading || postsLoading;

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

    // Validate file type
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid file',
        description: 'Please select an image or video file.',
      });
      return;
    }

    // Validate file size (50MB max)
    if (file.size > 50 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Maximum file size is 50MB.',
      });
      return;
    }

    const type = file.type.startsWith('video/') ? 'video' : 'image';
    setMediaPreview({
      file,
      preview: URL.createObjectURL(file),
      type,
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

  const uploadMedia = async (file: File): Promise<{ url: string; type: string } | null> => {
    if (!user) return null;

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error } = await supabase.storage
      .from('interest-media')
      .upload(fileName, file);

    if (error) {
      console.error('Upload error:', error);
      return null;
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
        if (uploaded) {
          mediaUrl = uploaded.url;
          mediaType = uploaded.type;
        } else {
          toast({
            variant: 'destructive',
            title: 'Upload failed',
            description: 'Failed to upload media. Please try again.',
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

  const getPostUrl = (postId: string, username: string) => {
    return `${window.location.origin}/profile/${username}?post=${postId}`;
  };

  const handleCopyLink = async (postId: string, username: string) => {
    const url = getPostUrl(postId, username);
    await navigator.clipboard.writeText(url);
    setCopiedPostId(postId);
    toast({
      title: 'Link copied!',
      description: 'Post link copied to clipboard.',
    });
    setTimeout(() => setCopiedPostId(null), 2000);
  };

  const handleShareTwitter = (post: InterestPost) => {
    const url = getPostUrl(post.id, post.profiles?.username || '');
    const text = post.content.slice(0, 200) + (post.content.length > 200 ? '...' : '');
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleShareFacebook = (post: InterestPost) => {
    const url = getPostUrl(post.id, post.profiles?.username || '');
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleShareWhatsApp = (post: InterestPost) => {
    const url = getPostUrl(post.id, post.profiles?.username || '');
    const text = `${post.content.slice(0, 100)}... ${url}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleLikeToggle = async (postId: string, isLiked: boolean) => {
    if (!user) return;
    if (isLiked) {
      await unlikePost.mutateAsync(postId);
    } else {
      await likePost.mutateAsync(postId);
    }
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

  // Show user's interests as tags
  const interests = userInterests?.map((ui: any) => ui.interest_categories).filter(Boolean) || [];
  const userCategoryIds = userInterests?.map((ui: any) => ui.category_id) || [];
  const availableCategories = categories?.filter(c => userCategoryIds.includes(c.id)) || [];

  return (
    <div className="space-y-6">
      {/* User's Interests Display */}
      {interests.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {interests.map((interest: any) => (
            <span
              key={interest.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
              style={{ 
                backgroundColor: `${interest.color}20`,
                color: interest.color,
                borderColor: interest.color,
                borderWidth: 1
              }}
            >
              {interest.name}
            </span>
          ))}
        </div>
      )}

      {/* Premium gate for posting to interests */}
      {isOwnProfile && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-5 rounded-xl border",
            isPremium 
              ? "border-primary/30 bg-muted/50" 
              : "border-border bg-card"
          )}
        >
          {isPremium ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center">
                  <Crown className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-medium">Share to Interests Feed</p>
                  <p className="text-sm text-muted-foreground">
                    Create content based on your interests
                  </p>
                </div>
              </div>
              <Button 
                className=""
                onClick={() => setCreateDialogOpen(true)}
                disabled={availableCategories.length === 0}
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                Create Post
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Unlock Interests Posting</p>
                  <p className="text-sm text-muted-foreground">
                    Upgrade to Premium to post to your interests feed
                  </p>
                </div>
              </div>
              <Button variant="outline" asChild>
                <Link to="/pricing" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Upgrade
                </Link>
              </Button>
            </div>
          )}
        </motion.div>
      )}

      {/* Interest Posts List */}
      {posts && posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map((post) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl border border-border bg-card"
            >
              {/* Post Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Link to={`/profile/${post.profiles?.username}`}>
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={post.profiles?.avatar_url || undefined} />
                      <AvatarFallback>
                        {post.profiles?.display_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Link 
                        to={`/profile/${post.profiles?.username}`}
                        className="font-semibold hover:underline"
                      >
                        {post.profiles?.display_name}
                      </Link>
                      {post.profiles?.is_verified && (
                        <BadgeCheck className="h-4 w-4 text-primary fill-primary/20" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>@{post.profiles?.username}</span>
                      <span>·</span>
                      <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-1 rounded-full text-xs font-medium"
                    style={{ 
                      backgroundColor: `${post.interest_categories?.color}20`,
                      color: post.interest_categories?.color 
                    }}
                  >
                    {post.interest_categories?.name}
                  </span>
                  
                  {user?.id === post.user_id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={() => deletePost.mutate(post.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>

              {/* Post Content */}
              <p className="text-foreground whitespace-pre-wrap">{post.content}</p>

              {/* Post Media */}
              {post.media_url && (
                <div className="mt-3 rounded-lg overflow-hidden">
                  {post.media_type?.startsWith('video') ? (
                    <video 
                      src={post.media_url} 
                      controls 
                      className="w-full max-h-96 object-cover"
                    />
                  ) : (
                    <img 
                      src={post.media_url} 
                      alt="" 
                      className="w-full max-h-96 object-cover"
                    />
                  )}
                </div>
              )}

              {/* Post Actions */}
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
                <button 
                  onClick={() => handleLikeToggle(post.id, post.user_has_liked || false)}
                  className={cn(
                    "flex items-center gap-1.5 text-sm transition-colors",
                    post.user_has_liked 
                      ? "text-red-500" 
                      : "text-muted-foreground hover:text-red-500"
                  )}
                >
                  <Heart className={cn("h-4 w-4", post.user_has_liked && "fill-current")} />
                  {post.like_count}
                </button>
                <button 
                  onClick={() => setCommentsPost(post)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  {post.comment_count}
                </button>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
                      <Share2 className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2 bg-popover border border-border" align="start">
                    <div className="space-y-1">
                      <button
                        onClick={() => handleCopyLink(post.id, post.profiles?.username || '')}
                        className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                      >
                        {copiedPostId === post.id ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <LinkIcon className="h-4 w-4" />
                        )}
                        {copiedPostId === post.id ? 'Copied!' : 'Copy link'}
                      </button>
                      <button
                        onClick={() => handleShareTwitter(post)}
                        className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                      >
                        <Twitter className="h-4 w-4" />
                        Share on X
                      </button>
                      <button
                        onClick={() => handleShareFacebook(post)}
                        className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                      >
                        <Facebook className="h-4 w-4" />
                        Share on Facebook
                      </button>
                      <button
                        onClick={() => handleShareWhatsApp(post)}
                        className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                      >
                        <MessageSquare className="h-4 w-4" />
                        Share on WhatsApp
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </motion.div>
          ))}
          
          {/* Infinite scroll trigger */}
          <div ref={loadMoreRef} className="py-4">
            {isFetchingNextPage && (
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!hasNextPage && posts.length > 0 && (
              <p className="text-center text-sm text-muted-foreground">
                You've seen all posts
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-2">No interest posts yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            {isOwnProfile 
              ? isPremium 
                ? "Share your first post to your interests feed!"
                : "Upgrade to Premium to start posting to your interests"
              : "This user hasn't posted any interest content yet"
            }
          </p>
          {isOwnProfile && !isPremium && (
            <Button variant="outline" className="mt-4" asChild>
              <Link to="/pricing">
                <Sparkles className="h-4 w-4 mr-2" />
                View Premium
              </Link>
            </Button>
          )}
        </div>
      )}

      {/* Create Post Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Interest Post</DialogTitle>
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

            {/* Media Preview */}
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

            {/* Media Upload Button */}
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
                <span className="text-xs text-muted-foreground">
                  Images or videos up to 50MB
                </span>
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
                className=""
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

      {/* Comments Modal */}
      {commentsPost && (
        <InterestPostComments
          postId={commentsPost.id}
          postAuthorName={commentsPost.profiles?.display_name || ''}
          commentCount={commentsPost.comment_count}
          open={!!commentsPost}
          onOpenChange={(open) => !open && setCommentsPost(null)}
        />
      )}
    </div>
  );
}
