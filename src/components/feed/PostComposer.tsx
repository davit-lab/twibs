import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { useActiveIdentity } from '@/contexts/ActiveIdentityContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import CameraModal from '@/components/media/CameraModal';
import type { MediaEditorResult } from '@/components/media/FilterEditor';
import { useToast } from '@/hooks/use-toast';
import EmojiPicker from '@/components/messaging/EmojiPicker';
import GifPicker from '@/components/messaging/GifPicker';
import {
  Image as ImageIcon,
  Film,
  Smile,
  Globe,
  Users,
  Lock,
  ChevronDown,
  X,
  Loader2,
  Check,
  GripVertical,
  Play,
  Plus,
  Clock,
  Camera,
  Timer,
  Info,
  MapPin,
  Calendar,
  Bot,
  ExternalLink,
  Pencil,
  MoreHorizontal,
  Store,
  ChevronRight,
  AlertTriangle,
  ZoomIn,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { MediaPreviewGrid } from '@/components/media/MediaPreviewGrid';
import { MediaUploader } from '@/components/media/MediaUploader';
import MediaViewer from '@/components/media/MediaViewer';
import {
  validateMediaFile,
  createMediaItem,
  revokeMediaPreview,
  getMediaDimensions,
  MAX_MEDIA_COUNT,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
} from '@/lib/media';
import type { MediaItem } from '@/lib/media';

type PostVisibility = 'public' | 'followers' | 'private';

interface PostContextMeta {
  location?: string | null;
  source_url?: string | null;
  when?: string | null;
  is_edited?: boolean;
  is_ai_generated?: boolean;
  references?: string | null;
}

interface PostComposerProps {
  onPostCreated?: () => void;
}

const MAX_CHARS = 5000;
const DRAFT_KEY = 'post-draft-v1';

const TOOL_BUTTON =
  'inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10 disabled:opacity-40 sm:h-9 sm:w-9';
const TOOL_ICON = 'h-[18px] w-[18px] sm:h-5 sm:w-5';

const visibilityOptions = [
  { value: 'public', label: 'Everyone', icon: Globe, description: 'Anyone can see' },
  { value: 'followers', label: 'Followers', icon: Users, description: 'Only followers' },
  { value: 'private', label: 'Only me', icon: Lock, description: 'Private' },
] as const;

export default function PostComposer({ onPostCreated }: PostComposerProps) {
  const { profile } = useAuth();
  const { accountsLoading } = useBusiness();
  const { identity } = useActiveIdentity();

  const wantsBusiness = identity.type === 'business';
  const postingAsBusiness = wantsBusiness && !!identity.business;
  const attributionBlocked = wantsBusiness && !postingAsBusiness;
  const activeBusiness = identity.business;
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaFilesRef = useRef<MediaItem[]>([]);

  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [mediaFiles, setMediaFiles] = useState<MediaItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [justPosted, setJustPosted] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [expiresIn24h, setExpiresIn24h] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextMeta, setContextMeta] = useState<PostContextMeta>({});
  const [contextDraft, setContextDraft] = useState<PostContextMeta>({});
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [initialRect, setInitialRect] = useState<DOMRect | undefined>();

  useEffect(() => {
    mediaFilesRef.current = mediaFiles;
  }, [mediaFiles]);

  useEffect(() => () => {
    mediaFilesRef.current.forEach(revokeMediaPreview);
  }, []);

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  // Restore draft (text only, not media)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;

      const draft = JSON.parse(raw);
      if (typeof draft?.content === 'string' && draft.content.trim()) {
        setContent(draft.content);
        if (['public', 'followers', 'private'].includes(draft.visibility)) {
          setVisibility(draft.visibility);
        }
        if (typeof draft.expiresIn24h === 'boolean') {
          setExpiresIn24h(draft.expiresIn24h);
        }
        if (draft.contextMeta && typeof draft.contextMeta === 'object') {
          setContextMeta(draft.contextMeta);
        }
        setDraftRestored(true);
      }
    } catch {
      // ignore corrupt drafts
    }
  }, []);

  // Focus the composer when the "Create Post" flow navigates here
  useEffect(() => {
    const onFocusRequest = () => {
      setIsFocused(true);
      textareaRef.current?.focus();
    };
    window.addEventListener('focus-composer', onFocusRequest);
    return () => window.removeEventListener('focus-composer', onFocusRequest);
  }, []);

  // Auto-save draft (text only)
  useEffect(() => {
    if (isSubmitting || justPosted) return;
    if (!content.trim() && mediaFiles.length === 0) return;
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ content, visibility, expiresIn24h, contextMeta, savedAt: Date.now() }));
    }, 400);
    return () => clearTimeout(timer);
  }, [content, visibility, expiresIn24h, contextMeta, mediaFiles, isSubmitting, justPosted]);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [content]);

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setContent('');
    setDraftRestored(false);
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      const result = validateMediaFile(file);
      if (!result.valid) {
        toast({
          variant: 'destructive',
          title: 'Invalid file',
          description: result.error,
        });
        return false;
      }
      return true;
    });

    const available = MAX_MEDIA_COUNT - mediaFiles.length;
    if (validFiles.length > available) {
      toast({
        variant: 'destructive',
        title: '22 media limit',
        description: available > 0
          ? `${available} item${available === 1 ? '' : 's'} added. The rest were not selected.`
          : `Remove an item before adding another. Your existing ${MAX_MEDIA_COUNT} items are unchanged.`,
      });
    }

    const acceptedFiles = validFiles.slice(0, Math.max(0, available));
    const newPreviews = acceptedFiles.map((file, index) => ({ ...createMediaItem(file), order: mediaFiles.length + index }));
    setMediaFiles((prev) => [...prev, ...newPreviews]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [mediaFiles.length, toast]);

  const removeMedia = useCallback((id: string) => {
    setMediaFiles((prev) => {
      const removed = prev.find((m) => m.id === id);
      if (removed) revokeMediaPreview(removed);
      return prev.filter((m) => m.id !== id).map((m, i) => ({ ...m, order: i }));
    });
  }, []);

  const handleCameraDone = useCallback((_file: File, result: MediaEditorResult) => {
    setCameraOpen(false);
    if (mediaFiles.length >= MAX_MEDIA_COUNT) {
      toast({
        variant: 'destructive',
        title: 'Media limit reached',
        description: `You can attach up to ${MAX_MEDIA_COUNT} media items per post.`,
      });
      return;
    }
    const newItem = createMediaItem(result.file, 'camera');
    newItem.type = result.kind;
    setMediaFiles((prev) => [...prev, { ...newItem, order: prev.length }]);
  }, [mediaFiles.length, toast]);

  const handleGifSelect = useCallback((gifUrl: string) => {
    if (mediaFiles.length >= MAX_MEDIA_COUNT) {
      toast({
        variant: 'destructive',
        title: 'Media limit reached',
        description: `You can attach up to ${MAX_MEDIA_COUNT} media items per post.`,
      });
      return;
    }
    const newItem: MediaItem = {
      id: `gif-${Date.now()}`,
      file: null,
      localPreviewUrl: gifUrl,
      type: 'image',
      source: 'gif',
      uploadState: 'uploaded',
      uploadProgress: 100,
      remoteUrl: gifUrl,
      width: null,
      height: null,
      mimeType: 'image/gif',
      fileSize: null,
      order: mediaFiles.length,
      error: null,
    };
    setMediaFiles((prev) => [...prev, newItem]);
    setShowGifPicker(false);
  }, [mediaFiles.length, toast]);

  // Drag-to-reorder media
  const handleReorder = useCallback((items: MediaItem[]) => {
    setMediaFiles(items.map((m, i) => ({ ...m, order: i })));
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

  const { startUploads, retryUpload, isUploading } = MediaUploader({
    mediaItems: mediaFiles,
    setMediaItems: setMediaFiles,
    userId: profile?.user_id || '',
    bucket: 'post-media',
    onUploadComplete: () => {},
    onUploadError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Upload error',
        description: error.message,
      });
    },
  });

  const handleSubmit = async () => {
    if (!content.trim() && mediaFiles.length === 0) return;
    if (!profile) return;

    if (attributionBlocked) {
      toast({
        variant: 'destructive',
        title: accountsLoading ? 'Loading your business…' : 'Business unavailable',
        description: accountsLoading
          ? 'Your business account is still loading. Try again in a moment.'
          : 'We could not load the business you are posting as. Switch back to your personal account or pick a business from the account switcher.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const uploadedMedia = mediaFiles.length > 0 ? await startUploads() : [];
      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({
          user_id: profile.user_id,
          business_id: postingAsBusiness ? activeBusiness!.id : null,
          content: content.trim(),
          visibility,
          expires_at: expiresIn24h ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
          context_meta: (Object.keys(contextMeta).length > 0 ? contextMeta : null) as unknown as Json,
        })
        .select()
        .single();

      if (postError) throw postError;

      if (uploadedMedia.length > 0) {
        const { error: mediaError } = await supabase.from('post_media').insert(
          uploadedMedia.map((result) => ({
            post_id: post.id,
            url: result.url,
            type: result.type,
            position: result.position,
            width: result.width,
            height: result.height,
          })),
        );
        if (mediaError) {
          await supabase.from('posts').delete().eq('id', post.id);
          throw mediaError;
        }
      }

      localStorage.removeItem(DRAFT_KEY);
      setContent('');
      setMediaFiles((prev) => {
        prev.forEach((m) => { if (m.source === 'upload' || m.source === 'camera') revokeMediaPreview(m); });
        return [];
      });
      setVisibility('public');
      setExpiresIn24h(false);
      setContextMeta({});
      setIsFocused(false);
      setDraftRestored(false);
      setJustPosted(true);

      setTimeout(() => setJustPosted(false), 1600);

      toast({
        title: 'Posted!',
        description: 'Your post is now live.',
      });

      onPostCreated?.();
    } catch (error: unknown) {
      console.error('Post creation error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create post. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedVisibility = visibilityOptions.find((v) => v.value === visibility)!;
  const charCount = content.length;
  const isOverLimit = charCount > MAX_CHARS;
  const canPost = (content.trim() || mediaFiles.length > 0) && !isOverLimit && !isSubmitting && !isUploading;

  const showActions = isFocused || content.trim() || mediaFiles.length > 0;

  const viewerImages = mediaFiles.map((m) => ({
    src: m.localPreviewUrl,
    alt: 'Upload preview',
    width: m.width,
    height: m.height,
  }));

  return (
    <div className={cn(
      "relative rounded-3xl border transition-all duration-300",
      isFocused
        ? "border-primary/25 bg-background shadow-xl shadow-primary/10 ring-4 ring-primary/[0.06]"
        : "border-transparent hover:border-border/70 hover:bg-muted/30"
    )}>
      <div className="flex gap-3 p-3 sm:p-4">
        <Avatar className="h-11 w-11 flex-shrink-0 ring-2 ring-primary/20">
          <AvatarImage
            src={
              postingAsBusiness
                ? activeBusiness!.avatar_url || undefined
                : profile?.avatar_url || undefined
            }
          />
          <AvatarFallback className={cn(
            'text-white text-sm font-medium',
            postingAsBusiness
              ? 'bg-gradient-to-br from-violet-600 to-indigo-600'
              : 'bg-gradient-to-br from-primary to-accent'
          )}>
            {getInitials(
              postingAsBusiness ? activeBusiness!.name : profile?.display_name || 'U'
            )}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          {postingAsBusiness ? (
            <Link
              to="/b"
              className="mb-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-500/15 dark:text-violet-300"
            >
              <Store className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">Posting as {activeBusiness!.name}</span>
              <ChevronRight className="h-3 w-3 flex-shrink-0" />
            </Link>
          ) : null}

          {attributionBlocked ? (
            <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                {accountsLoading
                  ? 'Loading your business account…'
                  : 'Your business account could not be loaded, so posting is paused to avoid publishing to your personal profile.'}
              </span>
            </div>
          ) : null}

          <Textarea
            ref={textareaRef}
            placeholder={
              attributionBlocked
                ? 'Posting is paused until your business account loads'
                : postingAsBusiness
                  ? `Post as ${activeBusiness!.name}`
                  : "What's on your mind?"
            }
            disabled={attributionBlocked}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onFocus={() => setIsFocused(true)}
            className="min-h-[40px] sm:min-h-[44px] border-0 bg-transparent resize-none focus-visible:ring-0 p-0 text-sm sm:text-[15px] placeholder:text-muted-foreground/60 overflow-hidden disabled:cursor-not-allowed disabled:opacity-60"
            rows={1}
          />

          {/* Media Previews - using new MediaPreviewGrid */}
          {mediaFiles.length > 0 && (
            <MediaPreviewGrid
              mediaItems={mediaFiles}
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

          {/* Draft notice */}
          {draftRestored && !showActions && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span>Draft restored</span>
              <button
                onClick={discardDraft}
                className="px-2 py-0.5 rounded-full bg-muted hover:bg-surface-3 text-foreground/70 transition-colors"
              >
                Discard
              </button>
            </div>
          )}

          {/* Actions Bar */}
          {showActions && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-1.5 gap-y-1 pt-3 border-t border-border/40">
              <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isSubmitting || mediaFiles.length >= MAX_MEDIA_COUNT}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={mediaFiles.length >= MAX_MEDIA_COUNT || isSubmitting}
                  title="Add photo or video"
                  className={cn(TOOL_BUTTON)}
                >
                  <ImageIcon className={TOOL_ICON} />
                </button>
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  disabled={mediaFiles.length >= MAX_MEDIA_COUNT || isSubmitting}
                  title="Take photo or record video"
                  className={cn(TOOL_BUTTON)}
                >
                  <Camera className={TOOL_ICON} />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setShowGifPicker(v => !v); setShowEmojiPicker(false); }}
                    disabled={isSubmitting}
                    title="Add GIF"
                    className={cn(TOOL_BUTTON)}
                  >
                    <Film className={TOOL_ICON} />
                  </button>
                  {showGifPicker && (
                    <GifPicker
                      position="down"
                      onSelect={handleGifSelect}
                      onClose={() => setShowGifPicker(false)}
                    />
                  )}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setShowEmojiPicker(v => !v); setShowGifPicker(false); }}
                    disabled={isSubmitting}
                    title="Add emoji"
                    className={cn(TOOL_BUTTON)}
                  >
                    <Smile className={TOOL_ICON} />
                  </button>
                  {showEmojiPicker && (
                    <EmojiPicker
                      position="down"
                      onSelect={(emoji) => {
                        setContent(c => c + emoji);
                        textareaRef.current?.focus();
                      }}
                      onClose={() => setShowEmojiPicker(false)}
                    />
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      title="More options"
                      aria-label="More options"
                      className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary sm:hidden"
                    >
                      <MoreHorizontal className="h-[18px] w-[18px]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-60 rounded-xl">
                    <DropdownMenuItem
                      onClick={() => setExpiresIn24h(v => !v)}
                      className="gap-2.5 py-2.5"
                    >
                      <Timer className={cn("h-4 w-4", expiresIn24h ? "text-primary" : "text-muted-foreground")} />
                      <div className="flex-1">
                        <p className="font-medium text-sm">Post expires in 24 hours</p>
                        <p className="text-xs text-muted-foreground">Disappears from your profile</p>
                      </div>
                      {expiresIn24h && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => { setContextDraft(contextMeta); setContextOpen(true); }}
                      className="gap-2.5 py-2.5"
                    >
                      <Info className={cn("h-4 w-4", Object.keys(contextMeta).length > 0 ? "text-primary" : "text-muted-foreground")} />
                      <div className="flex-1">
                        <p className="font-medium text-sm">Add context</p>
                        <p className="text-xs text-muted-foreground">Share more about your post</p>
                      </div>
                      {Object.keys(contextMeta).length > 0 && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <button
                  type="button"
                  onClick={() => setExpiresIn24h(v => !v)}
                  disabled={isSubmitting}
                  title="Post expires from your profile in 24 hours"
                  className={cn(
                    "hidden sm:inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full h-8 sm:h-9 px-2.5 text-[13px] font-medium transition-colors",
                    expiresIn24h
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-accent/10 hover:text-accent"
                  )}
                >
                  <Timer className={cn("h-4 w-4", expiresIn24h && "fill-primary/20")} />
                  <span>{expiresIn24h ? 'Expires in 24h' : 'Temporary'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setContextDraft(contextMeta); setContextOpen(true); }}
                  disabled={isSubmitting}
                  title="Add context to your post"
                  className={cn(
                    "hidden sm:inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full h-8 sm:h-9 px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors",
                    Object.keys(contextMeta).length > 0 && "text-primary bg-primary/10"
                  )}
                >
                  <Info className="h-4 w-4" />
                  <span>Context</span>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      title={`Audience: ${selectedVisibility.label}`}
                      aria-label={`Audience: ${selectedVisibility.label}`}
                      className="inline-flex h-8 sm:h-9 flex-shrink-0 items-center gap-1 rounded-full px-2 sm:px-3 text-primary transition-colors hover:bg-primary/10"
                    >
                      <selectedVisibility.icon className="h-4 w-4" />
                      <span className="hidden sm:inline text-[13px]">{selectedVisibility.label}</span>
                      <ChevronDown className="hidden sm:inline h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52 rounded-xl">
                    {visibilityOptions.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={() => setVisibility(option.value)}
                        className="gap-3 py-2.5"
                      >
                        <option.icon className={cn("h-4 w-4", option.value === visibility ? "text-primary" : "text-muted-foreground")} />
                        <div className="flex-1">
                          <p className="font-medium text-sm">{option.label}</p>
                          <p className="text-xs text-muted-foreground">{option.description}</p>
                        </div>
                        {option.value === visibility && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="ml-auto flex flex-shrink-0 items-center gap-1 sm:gap-1.5">
                <div className="relative h-7 w-7 sm:h-8 sm:w-8 progress-ring">
                  <svg className="h-7 w-7 sm:h-8 sm:w-8 -rotate-90" viewBox="0 0 32 32" aria-hidden>
                    <circle
                      cx="16"
                      cy="16"
                      r="13.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="progress-ring__bg text-muted"
                    />

                    <circle
                      cx="16"
                      cy="16"
                      r="13.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 13.5}
                      strokeDashoffset={2 * Math.PI * 13.5 * (1 - Math.min(charCount / MAX_CHARS, 1))}
                      className={cn(
                        "progress-ring__fg transition-all duration-200",
                        isOverLimit
                          ? "text-destructive"
                          : charCount > MAX_CHARS - 200
                          ? "text-amber-500"
                          : "text-primary"
                      )}
                    />
                  </svg>
                  {charCount > MAX_CHARS - 200 && (
                    <span className={cn(
                      "absolute inset-0 flex items-center justify-center text-[9px] font-semibold tabular-nums",
                      isOverLimit ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {MAX_CHARS - charCount}
                    </span>
                  )}
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={!canPost}
                  className={cn(
                    "rounded-full h-8 px-3.5 flex-shrink-0 font-semibold transition-all duration-300 sm:h-9 sm:px-4",
                    justPosted && "bg-primary text-white"
                  )}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : justPosted ? (
                    <span className="flex items-center gap-1.5">
                      <Check className="h-4 w-4" /> Posted
                    </span>
                  ) : (
                    'Post'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <CameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        mode="post"
        startMode="photo"
        maxVideoDuration={30}
        onDone={handleCameraDone}
      />

      {/* Add Context dialog */}
      <Dialog open={contextOpen} onOpenChange={setContextOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Info className="h-5 w-5 text-primary" />
              Add Context
            </DialogTitle>
            <DialogDescription>
              Help people understand this post — where it's from, when it happened, and whether it's AI-generated.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-1">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Where</Label>
              <div className="relative mt-1.5">
                <MapPin className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="w-full rounded-xl border border-border/70 bg-muted/40 pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40"
                  placeholder="Location, e.g. Tokyo, Japan"
                  value={contextDraft.location || ''}
                  onChange={(e) => setContextDraft(d => ({ ...d, location: e.target.value || null }))}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">When</Label>
              <div className="relative mt-1.5">
                <Calendar className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="datetime-local"
                  className="w-full rounded-xl border border-border/70 bg-muted/40 pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 [color-scheme:dark]"
                  value={contextDraft.when ? new Date(contextDraft.when).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setContextDraft(d => ({ ...d, when: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Original source</Label>
              <div className="relative mt-1.5">
                <ExternalLink className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="w-full rounded-xl border border-border/70 bg-muted/40 pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40"
                  placeholder="https://…"
                  value={contextDraft.source_url || ''}
                  onChange={(e) => setContextDraft(d => ({ ...d, source_url: e.target.value || null }))}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">References</Label>
              <textarea
                rows={2}
                className="mt-1.5 w-full rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 resize-none"
                placeholder="Links or sources that support this post"
                value={contextDraft.references || ''}
                onChange={(e) => setContextDraft(d => ({ ...d, references: e.target.value || null }))}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-xl border border-border/70">
                <div className="flex items-center gap-2.5">
                  <Bot className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">AI generated</p>
                    <p className="text-xs text-muted-foreground">This post was created with AI</p>
                  </div>
                </div>
                <Switch checked={contextDraft.is_ai_generated ?? false} onCheckedChange={(c: boolean) => setContextDraft(d => ({ ...d, is_ai_generated: c }))} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl border border-border/70">
                <div className="flex items-center gap-2.5">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Edited</p>
                    <p className="text-xs text-muted-foreground">This post was edited before publishing</p>
                  </div>
                </div>
                <Switch checked={contextDraft.is_edited ?? false} onCheckedChange={(c: boolean) => setContextDraft(d => ({ ...d, is_edited: c }))} />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2 gap-2">
            <Button
              variant="ghost"
              onClick={() => setContextOpen(false)}
              className="rounded-full text-muted-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const cleaned: PostContextMeta = {};
                if (contextDraft.location?.trim()) cleaned.location = contextDraft.location.trim();
                if (contextDraft.when) cleaned.when = contextDraft.when;
                if (contextDraft.source_url?.trim()) cleaned.source_url = contextDraft.source_url.trim();
                if (contextDraft.references?.trim()) cleaned.references = contextDraft.references.trim();
                if (contextDraft.is_ai_generated) cleaned.is_ai_generated = true;
                if (contextDraft.is_edited) cleaned.is_edited = true;
                setContextMeta(cleaned);
                setContextOpen(false);
              }}
              className="rounded-full gap-1.5"
            >
              <Check className="h-4 w-4" />
              Save context
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
