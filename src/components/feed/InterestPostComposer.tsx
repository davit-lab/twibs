import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserInterests, InterestCategory } from '@/hooks/useInterests';
import { useInterestPostActions } from '@/hooks/useInterestPosts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  ImagePlus,
  Video,
  X,
  Loader2,
  ChevronDown,
  Check,
  Settings2,
  ZoomIn,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import defaultAvatar from '@/assets/default-avatar.png';
import { MediaPreviewGrid } from '@/components/media/MediaPreviewGrid';
import { MediaUploader } from '@/components/media/MediaUploader';
import MediaViewer from '@/components/media/MediaViewer';
import {
  validateMediaFile,
  createMediaItem,
  revokeMediaPreview,
  MAX_MEDIA_COUNT,
} from '@/lib/media';
import type { MediaItem } from '@/lib/media';

interface InterestPostComposerProps {
  onPosted?: () => void;
  onManageInterests?: () => void;
}

export default function InterestPostComposer({
  onPosted,
  onManageInterests,
}: InterestPostComposerProps) {
  const { profile } = useAuth();
  const { data: userInterests } = useUserInterests();
  const { createPost } = useInterestPostActions();

  const categories: InterestCategory[] = useMemo(
    () => userInterests?.map((ui) => ui.interest_categories).filter((c): c is InterestCategory => !!c) || [],
    [userInterests],
  );

  const [content, setContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(categories[0]?.id || '');
  const [menuOpen, setMenuOpen] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [initialRect, setInitialRect] = useState<DOMRect | undefined>();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaItem[]>([]);

  useEffect(() => {
    mediaRef.current = media;
  }, [media]);

  useEffect(() => () => {
    mediaRef.current.forEach(revokeMediaPreview);
  }, []);

  // Keep the selected interest valid when subscriptions change
  useEffect(() => {
    if (categories.length === 0) {
      setSelectedCategory('');
      return;
    }
    if (!categories.some((c) => c.id === selectedCategory)) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories, selectedCategory]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      const result = validateMediaFile(file);
      if (!result.valid) {
        setError(result.error || 'Invalid file');
        return false;
      }
      return true;
    });

    const available = MAX_MEDIA_COUNT - media.length;
    if (validFiles.length > available) {
      setError(available > 0
        ? `${available} item${available === 1 ? '' : 's'} added. The rest were not selected.`
        : `Remove an item before adding another. Your existing ${MAX_MEDIA_COUNT} items are unchanged.`);
    }

    const newPreviews = validFiles.slice(0, Math.max(0, available)).map((file, index) => ({
      ...createMediaItem(file),
      order: media.length + index,
    }));
    setMedia((prev) => [...prev, ...newPreviews]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (validFiles.length <= available) setError(null);
  }, [media.length]);

  const removeMedia = useCallback((id: string) => {
    setMedia((prev) => {
      const removed = prev.find((m) => m.id === id);
      if (removed) revokeMediaPreview(removed);
      return prev.filter((m) => m.id !== id).map((m, i) => ({ ...m, order: i }));
    });
  }, []);

  const handleReorder = useCallback((items: MediaItem[]) => {
    setMedia(items.map((m, i) => ({ ...m, order: i })));
  }, []);

  const openViewer = useCallback((index: number, rect?: DOMRect) => {
    setViewerIndex(index);
    setInitialRect(rect);
    setViewerOpen(true);
  }, []);

  const closeViewer = useCallback(() => {
    setViewerOpen(false);
    setInitialRect(undefined);
  }, []);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  };

  useEffect(() => {
    autoResize();
  }, [content]);

  const openInterestMenu = () => {
    if (categories.length === 0) {
      setMenuOpen(false);
      onManageInterests?.();
      return;
    }
    setMenuOpen((v) => !v);
  };

  const { startUploads, retryUpload, isUploading } = MediaUploader({
    mediaItems: media,
    setMediaItems: setMedia,
    userId: profile?.user_id || '',
    bucket: 'interest-media',
    onUploadComplete: () => {},
    onUploadError: (err) => setError(err.message),
  });

  const canPost = (content.trim().length > 0 || media.length > 0) && !!selectedCategory && !isSubmitting && !isUploading;

  const handleSubmit = async () => {
    if (!canPost) return;
    if (categories.length === 0) {
      onManageInterests?.();
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const uploadedMedia = media.length > 0 ? await startUploads() : [];

      // Create post with first media (for backward compatibility) and store rest in new table
      const postResult = await createPost.mutateAsync({
        content: content.trim(),
        categoryId: selectedCategory,
        mediaUrl: uploadedMedia[0]?.url || null,
        mediaType: uploadedMedia[0]?.type || null,
      });

      // Insert all media into interest_post_media table
      if (postResult && uploadedMedia.length > 0) {
        const { error: mediaError } = await supabase.from('interest_post_media').insert(
          uploadedMedia.map((m) => ({
            post_id: postResult.id,
            url: m.url,
            type: m.type,
            width: m.width,
            height: m.height,
            position: m.position,
          })),
        );
        if (mediaError) {
          await supabase.from('interest_posts').delete().eq('id', postResult.id);
          throw mediaError;
        }
      }

      if (media.length > 0) {
        media.forEach((m) => { if (m.source === 'upload' || m.source === 'camera') revokeMediaPreview(m); });
      }
      setMedia([]);
      setContent('');
      setExpanded(false);
      setIsSubmitting(false);
      onPosted?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't publish this post. Try again.");
      setIsSubmitting(false);
    }
  };

  const showInterestRow = expanded || content.trim() || media.length > 0;
  const selectedName = categories.find((c) => c.id === selectedCategory)?.name;

  const viewerImages = media.map((m) => ({
    src: m.localPreviewUrl,
    alt: 'Attachment preview',
    width: m.width,
    height: m.height,
  }));

  return (
    <div className="px-4 pb-4 pt-2">
      <div
        className={cn(
          'overflow-visible rounded-2xl border bg-card shadow-sm shadow-black/[0.04] transition-colors',
          expanded ? 'border-primary/30 ring-1 ring-primary/10' : 'border-border/70 hover:border-border'
        )}
      >
        <div className="flex gap-3 p-3.5 sm:p-4">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={profile?.avatar_url || defaultAvatar} alt="" />
            <AvatarFallback className="bg-surface-2 font-semibold">
              {profile?.display_name?.charAt(0)?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onFocus={() => setExpanded(true)}
              onInput={autoResize}
              placeholder="Start a conversation with your community…"
              rows={1}
              className="w-full resize-none overflow-hidden bg-transparent text-[15px] leading-normal text-foreground outline-none placeholder:text-muted-foreground/60"
            />

            {error && (
              <p className="mt-1.5 text-[13px] font-medium text-destructive" role="alert">
                {error}
              </p>
            )}

            {/* Media Previews - using new MediaPreviewGrid */}
            {media.length > 0 && (
              <MediaPreviewGrid
                mediaItems={media}
                onRemove={removeMedia}
                onReorder={handleReorder}
                onOpenViewer={openViewer}
                maxItems={MAX_MEDIA_COUNT}
                disabled={isSubmitting || isUploading}
                showAddButton={true}
                onAddClick={() => fileInputRef.current?.click()}
                onRetry={retryUpload}
              />
            )}

            {!expanded && !content && media.length === 0 && (
              <div className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
                <MessageCircle className="h-3.5 w-3.5" />
                Ask a question, share a recommendation, or start a discussion.
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2.5">
              <div className="relative">
                <button
                  type="button"
                  onClick={openInterestMenu}
                  className={cn(
                    'inline-flex h-8 max-w-[190px] shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-surface-2/70 px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-surface-2',
                    !selectedCategory && 'text-muted-foreground'
                  )}
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate">{selectedName || (showInterestRow ? 'Choose a topic' : 'Choose a topic')}</span>
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', menuOpen && 'rotate-180')}
                  />
                </button>

                {menuOpen && (
                  <div
                    className="absolute left-0 top-full z-10 mt-1.5 w-56 overflow-hidden rounded-xl border border-border/80 bg-surface-2 p-1 shadow-xl shadow-black/20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(category.id);
                          setMenuOpen(false);
                          setExpanded(true);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[14px] font-medium transition-colors',
                          selectedCategory === category.id
                            ? 'bg-primary/10 text-primary'
                            : 'text-foreground hover:bg-surface'
                        )}
                      >
                        {category.name}
                        {selectedCategory === category.id && <Check className="h-4 w-4 shrink-0" />}
                      </button>
                    ))}
                    {onManageInterests && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onManageInterests();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[14px] font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                      >
                        <Settings2 className="h-4 w-4 shrink-0" />
                        Manage interests
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1" />

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                tabIndex={-1}
                disabled={isSubmitting || media.length >= MAX_MEDIA_COUNT}
              />

              {media.length < MAX_MEDIA_COUNT && (
                <>
                  <button
                    type="button"
                    aria-label="Add image"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <ImagePlus className="h-4 w-4" />
                    <span className="hidden sm:inline">Image</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Add video"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <Video className="h-4 w-4" />
                    <span className="hidden sm:inline">Video</span>
                  </button>
                </>
              )}

              <button
                type="button"
                aria-label="Publish post"
                onClick={handleSubmit}
                disabled={!canPost}
                className="h-9 min-w-[84px] rounded-xl bg-primary px-5 text-[14px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-45"
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Posting
                  </span>
                ) : (
                  'Post'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Media Viewer */}
      {viewerOpen && viewerImages.length > 0 && (
        <MediaViewer
          images={viewerImages}
          initialIndex={viewerIndex}
          onClose={closeViewer}
          initialRect={initialRect}
          enableFullscreen={true}
        />
      )}
    </div>
  );
}
