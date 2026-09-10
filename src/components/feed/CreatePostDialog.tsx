import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  X,
  ImagePlus,
  Video,
  ChevronDown,
  Loader2,
  Check,
  Settings2,
} from 'lucide-react';
import defaultAvatar from '@/assets/default-avatar.png';

const MAX_MEDIA_SIZE = 50 * 1024 * 1024; // 50MB

interface CategoryOption {
  id: string;
  name: string;
}

interface PublishInput {
  content: string;
  categoryId: string;
  file: File | null;
}

interface PublishResult {
  ok: boolean;
  error?: string;
}

interface CreatePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryOption[];
  profile: {
    avatar_url: string | null;
    display_name: string;
    username: string;
  } | null;
  onPublish: (input: PublishInput) => Promise<PublishResult>;
  onManageInterests?: () => void;
}

interface MediaSelection {
  file: File;
  url: string;
  type: 'image' | 'video';
}

export default function CreatePostDialog({
  open,
  onOpenChange,
  categories,
  profile,
  onPublish,
  onManageInterests,
}: CreatePostDialogProps) {
  const [content, setContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(categories[0]?.id || '');
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [media, setMedia] = useState<MediaSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const mediaUrlRef = useRef<string | null>(null);

  const setMediaSelection = (next: MediaSelection | null) => {
    if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
    mediaUrlRef.current = next?.url || null;
    setMedia(next);
  };

  // Reset the editor whenever the surface opens (only on the open transition,
  // so parent re-renders - e.g. inbound realtime posts - never wipe draft content).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setContent('');
      setMediaSelection(null);
      setError(null);
      setIsSubmitting(false);
      setCategoryMenuOpen(false);
      setSelectedCategory(categories[0]?.id || '');
    }
    wasOpenRef.current = open;
  }, [open, categories]);

  // Revoke any preview URL on unmount
  useEffect(
    () => () => {
      if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
    },
    []
  );

  // Lock body scroll and support Escape-to-close while open
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  const selectMedia = (file: File, type: 'image' | 'video') => {
    setError(null);
    if (!file.type.startsWith(`${type}/`)) {
      setError(`Please choose a ${type} file.`);
      return;
    }
    if (file.size > MAX_MEDIA_SIZE) {
      setError('File is too large (max 50MB).');
      return;
    }
    setMediaSelection({ file, url: URL.createObjectURL(file), type });
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) selectMedia(file, 'image');
  };

  const handleVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) selectMedia(file, 'video');
  };

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const canPost = content.trim().length > 0 && !!selectedCategory && !isSubmitting;

  const handlePublish = async () => {
    if (!canPost) return;
    setIsSubmitting(true);
    setError(null);
    const result = await onPublish({
      content: content.trim(),
      categoryId: selectedCategory,
      file: media?.file || null,
    });
    if (result.ok) {
      onOpenChange(false);
    } else {
      setError(result.error || "Couldn't publish this post. Try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]">
          <motion.div
            key="overlay"
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={() => onOpenChange(false)}
          />

          <div className="absolute inset-0 flex items-end justify-center sm:items-center sm:p-6">
            <motion.div
              key="panel"
              role="dialog"
              aria-modal="true"
              aria-label="Create post"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-surface sm:h-auto sm:max-h-[88vh] sm:min-h-[520px] sm:max-w-[600px] sm:rounded-2xl sm:border sm:border-border/70 sm:shadow-2xl sm:shadow-black/20"
            >
              {/* Header */}
              <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border/70 px-4 sm:h-16 sm:px-6">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close post editor"
                  className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <X className="h-5 w-5" />
                </button>
                <span className="text-[18px] font-semibold tracking-tight">Create post</span>
                <div className="h-9 w-9" aria-hidden="true" />
              </div>

              {/* Body */}
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-4 sm:px-6 sm:pt-5" onClick={() => categoryMenuOpen && setCategoryMenuOpen(false)}>
                {/* Author + interest */}
                <div className="flex items-center gap-3">
                  <Avatar className="h-11 w-11 flex-shrink-0">
                    <AvatarImage src={profile?.avatar_url || defaultAvatar} alt="" />
                    <AvatarFallback className="bg-surface-2 font-semibold">
                      {profile?.display_name?.charAt(0)?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold leading-tight">
                      {profile?.display_name || profile?.username || 'You'}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] text-muted-foreground">Posting to</span>
                      <div className="relative min-w-0">
                        <button
                          type="button"
                          aria-label="Choose interest"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCategoryMenuOpen((v) => !v);
                          }}
                          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border/60 bg-surface-2/70 px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                        >
                          <span className="max-w-[150px] truncate">
                            {categories.find((c) => c.id === selectedCategory)?.name ||
                              'Choose an interest'}
                          </span>
                          <ChevronDown
                            className={cn(
                              'h-3.5 w-3.5 text-muted-foreground transition-transform',
                              categoryMenuOpen && 'rotate-180'
                            )}
                          />
                        </button>

                        {categoryMenuOpen && (
                          <div
                            className="absolute left-0 top-full z-10 mt-2 w-56 overflow-hidden rounded-xl border border-border/80 bg-surface-2 p-1 shadow-xl shadow-black/20"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {categories.length === 0 ? (
                              <p className="px-3 py-2 text-sm text-muted-foreground">
                                No interests yet
                              </p>
                            ) : (
                              categories.map((category) => (
                                <button
                                  key={category.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedCategory(category.id);
                                    setCategoryMenuOpen(false);
                                  }}
                                  className={cn(
                                    'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[14px] font-medium transition-colors',
                                    selectedCategory === category.id
                                      ? 'bg-primary/10 text-primary'
                                      : 'text-foreground hover:bg-surface'
                                  )}
                                >
                                  {category.name}
                                  {selectedCategory === category.id && (
                                    <Check className="h-4 w-4 shrink-0" />
                                  )}
                                </button>
                              ))
                            )}

                            {onManageInterests && (
                              <>
                                <div className="my-1 border-t border-border/60" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCategoryMenuOpen(false);
                                    onManageInterests();
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[14px] font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                                >
                                  <Settings2 className="h-4 w-4 shrink-0" />
                                  Manage interests
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Composition area */}
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    autoResize();
                  }}
                  onInput={autoResize}
                  placeholder="What's on your mind?"
                  rows={4}
                  className="mt-3 min-h-[220px] w-full flex-1 resize-none overflow-y-auto bg-transparent py-2 text-[16px] leading-[1.6] text-foreground outline-none placeholder:text-muted-foreground/60 sm:text-[18px]"
                />

                {/* Media preview */}
                {media && (
                  <div className="relative mt-2">
                    {media.type === 'video' ? (
                      <video
                        src={media.url}
                        controls
                        className="max-h-[360px] w-full rounded-xl border border-border/60 object-contain bg-surface-2"
                      />
                    ) : (
                      <img
                        src={media.url}
                        alt="Attachment preview"
                        className="max-h-[360px] w-full rounded-xl border border-border/60 object-contain bg-surface-2"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setMediaSelection(null)}
                      aria-label="Remove attachment"
                      className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 border-t border-border/70 px-4 py-3.5 sm:px-6">
                {error && (
                  <p className="mb-2.5 text-[13px] font-medium text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <div className="flex items-center gap-1.5">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImage}
                    className="hidden"
                    tabIndex={-1}
                  />
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleVideo}
                    className="hidden"
                    tabIndex={-1}
                  />
                  <Button
                    type="button"
                    aria-label="Add image"
                    className="h-11 gap-1.5 rounded-xl border border-border/70 bg-surface-2/60 px-3 text-[13px] font-medium text-foreground hover:bg-surface-2"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4" />
                    Image
                  </Button>
                  <Button
                    type="button"
                    aria-label="Add video"
                    className="h-11 gap-1.5 rounded-xl border border-border/70 bg-surface-2/60 px-3 text-[13px] font-medium text-foreground hover:bg-surface-2"
                    onClick={() => videoInputRef.current?.click()}
                  >
                    <Video className="h-4 w-4" />
                    Video
                  </Button>
                  <div className="flex-1" />
                  <Button
                    type="button"
                    aria-label="Cancel"
                    className="hidden h-11 rounded-xl px-3 text-[14px] font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground sm:inline-flex"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    aria-label="Publish post"
                    onClick={handlePublish}
                    disabled={!canPost}
                    className="h-11 min-w-[100px] rounded-xl bg-primary px-5 text-[14px] font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Posting...
                      </>
                    ) : (
                      'Post'
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}