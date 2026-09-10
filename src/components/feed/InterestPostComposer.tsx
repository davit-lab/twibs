import { useRef, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserInterests, InterestCategory } from '@/hooks/useInterests';
import { useCreateInterestPost } from '@/hooks/useCreateInterestPost';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  ImagePlus,
  Video,
  X,
  Loader2,
  ChevronDown,
  Check,
  Settings2,
} from 'lucide-react';
import defaultAvatar from '@/assets/default-avatar.png';

const MAX_MEDIA_SIZE = 50 * 1024 * 1024; // 50MB

interface MediaPick {
  file: File;
  url: string;
  type: 'image' | 'video';
}

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
  const publish = useCreateInterestPost();

  const categories: InterestCategory[] =
    userInterests?.map((ui) => ui.interest_categories).filter((c): c is InterestCategory => !!c) ||
    [];

  const [content, setContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(categories[0]?.id || '');
  const [menuOpen, setMenuOpen] = useState(false);
  const [media, setMedia] = useState<MediaPick | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

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
    if (media?.url) URL.revokeObjectURL(media.url);
    setMedia({ file, url: URL.createObjectURL(file), type });
    setExpanded(true);
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

  const canPost = content.trim().length > 0 && !!selectedCategory && !isSubmitting;

  const handleSubmit = async () => {
    if (!canPost) return;
    if (categories.length === 0) {
      onManageInterests?.();
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const result = await publish({
      content: content.trim(),
      categoryId: selectedCategory,
      file: media?.file || null,
    });
    if (!result.ok) {
      setError(result.error || "Couldn't publish this post. Try again.");
      setIsSubmitting(false);
      return;
    }
    if (media?.url) URL.revokeObjectURL(media.url);
    setMedia(null);
    setContent('');
    setExpanded(false);
    setIsSubmitting(false);
    onPosted?.();
  };

  const showInterestRow = expanded || content.trim() || !!media;
  const selectedName = categories.find((c) => c.id === selectedCategory)?.name;

  return (
    <div className="px-4 pb-3 pt-1.5">
      <div
        className={cn(
          'rounded-2xl border bg-card transition-colors',
          expanded ? 'border-border/80' : 'border-border/60 hover:border-border'
        )}
      >
        <div className="flex gap-3 p-3.5">
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
              placeholder="Create a post on your interests…"
              rows={1}
              className="w-full resize-none overflow-hidden bg-transparent text-[15px] leading-normal text-foreground outline-none placeholder:text-muted-foreground/60"
            />

            {error && (
              <p className="mt-1.5 text-[13px] font-medium text-destructive" role="alert">
                {error}
              </p>
            )}

            {media && (
              <div className="relative mt-2">
                {media.type === 'video' ? (
                  <video
                    src={media.url}
                    controls
                    className="max-h-[280px] w-full rounded-xl border border-border/60 bg-surface-2 object-contain"
                  />
                ) : (
                  <img
                    src={media.url}
                    alt="Attachment preview"
                    className="max-h-[280px] w-full rounded-xl border border-border/60 bg-surface-2 object-contain"
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (media?.url) URL.revokeObjectURL(media.url);
                    setMedia(null);
                  }}
                  aria-label="Remove attachment"
                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2.5">
              <div className="relative">
                <button
                  type="button"
                  onClick={openInterestMenu}
                  className={cn(
                    'inline-flex h-7 max-w-[180px] shrink-0 items-center gap-1 rounded-full border border-border/70 bg-surface-2/70 px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-2',
                    !selectedCategory && 'text-muted-foreground'
                  )}
                >
                  <span className="truncate">{selectedName || (showInterestRow ? 'No interest — add one' : 'No interest selected')}</span>
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

              {onManageInterests && (
                <button
                  type="button"
                  onClick={onManageInterests}
                  className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Manage
                </button>
              )}

              <div className="flex-1" />

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
              <button
                type="button"
                aria-label="Add image"
                onClick={() => imageInputRef.current?.click()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <ImagePlus className="h-4 w-4" />
                <span className="hidden sm:inline">Image</span>
              </button>
              <button
                type="button"
                aria-label="Add video"
                onClick={() => videoInputRef.current?.click()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <Video className="h-4 w-4" />
                <span className="hidden sm:inline">Video</span>
              </button>
              <button
                type="button"
                aria-label="Publish post"
                onClick={handleSubmit}
                disabled={!canPost}
                className="h-9 min-w-[84px] rounded-xl bg-primary px-5 text-[14px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-45"
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
    </div>
  );
}