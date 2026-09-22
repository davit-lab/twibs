import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Music, Type, X, Clapperboard, Loader2, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import CameraModal from '@/components/media/CameraModal';
import type { MediaEditorResult } from '@/components/media/FilterEditor';
import StoryEditor from '@/components/stories/StoryEditor';
import StoryVideoTrimmer, { type TrimRange } from '@/components/stories/StoryVideoTrimmer';
import StoryMusicPicker from '@/components/stories/StoryMusicPicker';
import StoryOverlayRenderer from '@/components/stories/StoryOverlayRenderer';
import type { MusicTrack } from '@/hooks/useMusicLibrary';
import {
  STORY_BACKGROUNDS,
  STORY_MAX_DURATION,
  STORY_MAX_FILE_SIZE,
  STORY_IMAGE_DURATION,
  bakeStoryBackground,
  getVideoMeta,
  trimVideo,
  type StoryOverlay,
} from '@/lib/stories';
import { deleteStoryDraft, loadStoryDrafts, saveStoryDraftSafe, type StoryDraft } from '@/lib/storyDrafts';
import { cn } from '@/lib/utils';
import { blockCallOverlay, unblockCallOverlay } from '@/lib/callOverlayLayers';

type Step = 'menu' | 'bg' | 'trim' | 'editor' | 'music' | 'publish';

interface StoryCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (
    file: File,
    options?: {
      caption?: string;
      music?: { name: string; url: string | null };
      duration?: number;
      media_type?: 'image' | 'video';
      overlays?: StoryOverlay[];
      onProgress?: (state: { phase: 'preparing' | 'uploading' | 'publishing' | 'done'; progress: number }) => void;
    },
  ) => Promise<unknown>;
}

interface MediaSource {
  file: File;
  url: string;
  type: 'image' | 'video';
  duration: number; // real seconds (used for trimming); publish clamps to the story limit
  isText: boolean;
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export default function StoryCreator({ open, onOpenChange, onUpload }: StoryCreatorProps) {
  const [step, setStep] = useState<Step>('menu');
  const [media, setMedia] = useState<MediaSource | null>(null);
  const [trimRange, setTrimRange] = useState<TrimRange | null>(null);
  const [backgroundId, setBackgroundId] = useState<string>(STORY_BACKGROUNDS[0].id);
  const [overlays, setOverlays] = useState<StoryOverlay[]>([]);
  const [music, setMusic] = useState<MusicTrack | null>(null);
  const [caption, setCaption] = useState('');
  const [drafts, setDrafts] = useState<StoryDraft[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStartMode, setCameraStartMode] = useState<'photo' | 'video'>('photo');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [workingLabel, setWorkingLabel] = useState<string | null>(null);

  const galleryRef = useRef<HTMLInputElement>(null);
  const prevOpenRef = useRef(false);
  const autosaveTimer = useRef<number | null>(null);

  // Object URLs are stable per draft across renders.
  const draftUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const draft of drafts) {
      if (!map.has(draft.id)) map.set(draft.id, URL.createObjectURL(draft.blob));
    }
    return map;
  }, [drafts]);

  useEffect(() => {
    return () => draftUrls.forEach((url) => URL.revokeObjectURL(url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // lifecycle
  // -------------------------------------------------------------------------

  const reset = () => {
    if (media?.url) URL.revokeObjectURL(media.url);
    setMedia(null);
    setTrimRange(null);
    setOverlays([]);
    setMusic(null);
    setCaption('');
    setBackgroundId(STORY_BACKGROUNDS[0].id);
    setDraftId(null);
    setStep('menu');
    setUploading(false);
    setProgress(0);
    setUploadError(null);
    setWorkingLabel(null);
  };

  useEffect(() => {
    if (open && !prevOpenRef.current) reset();
    prevOpenRef.current = open;
    if (open) {
      blockCallOverlay();
    } else {
      unblockCallOverlay();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      unblockCallOverlay();
      if (media?.url) URL.revokeObjectURL(media.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open && step === 'menu') {
      loadStoryDrafts()
        .then(setDrafts)
        .catch(() => setDrafts([]));
    }
  }, [open, step]);

  // -------------------------------------------------------------------------
  // autosave draft
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!media || uploading) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      saveStoryDraftSafe(
        { blob: media.file, mediaType: media.type, overlays, music, caption },
        draftId ?? undefined,
      )
        .then((saved) => {
          if (saved) setDraftId(saved.id);
        })
        .catch(() => {});
    }, 700);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, overlays, music, caption, uploading]);

  // -------------------------------------------------------------------------
  // media intake
  // -------------------------------------------------------------------------

  const handleLibraryFile = async (file: File) => {
    setUploadError(null);
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setUploadError('Please choose an image or video file.');
      return;
    }
    if (file.size > STORY_MAX_FILE_SIZE) {
      setUploadError(`Maximum file size is ${formatSize(STORY_MAX_FILE_SIZE)}.`);
      return;
    }

    const type: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';

    if (type === 'image') {
      enterEditor({ file, url: URL.createObjectURL(file), type, duration: STORY_IMAGE_DURATION, isText: false });
      return;
    }

    setWorkingLabel('Reading video…');
    try {
      const meta = await getVideoMeta(file);
      const needsTrim = meta.duration > STORY_MAX_DURATION;
      const url = URL.createObjectURL(file);
      setMedia({ file, url, type: 'video', duration: meta.duration, isText: false });
      if (needsTrim) {
        setTrimRange({ start: 0, end: Math.min(STORY_MAX_DURATION, meta.duration) });
        setStep('trim');
      } else {
        enterEditor({ file, url, type: 'video', duration: meta.duration, isText: false });
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not read that video.');
    } finally {
      setWorkingLabel(null);
    }
  };

  const handleCameraDone = async (file: File, result: MediaEditorResult) => {
    if (media?.url) URL.revokeObjectURL(media.url);
    setCameraOpen(false);
    setUploadError(null);
    const type = result.kind === 'video' ? 'video' : 'image';
    const url = URL.createObjectURL(file);
    enterEditor({
      file,
      url,
      type,
      duration: type === 'video' ? (result.duration ?? STORY_MAX_DURATION) : STORY_IMAGE_DURATION,
      isText: false,
    });
  };

  const enterEditor = (next: MediaSource) => {
    if (media?.url && media.url !== next.url) URL.revokeObjectURL(media.url);
    setMedia(next);
    setCaption('');
    setOverlays([]);
    setMusic(null);
    setDraftId(null);
    setStep('editor');
  };

  const chooseBackground = async (id: string) => {
    setBackgroundId(id);
    const bg = STORY_BACKGROUNDS.find((b) => b.id === id) ?? STORY_BACKGROUNDS[0];
    setWorkingLabel('Rendering background…');
    try {
      const file = await bakeStoryBackground(bg);
      if (media?.url) URL.revokeObjectURL(media.url);
      setMedia({ file, url: URL.createObjectURL(file), type: 'image', duration: STORY_IMAGE_DURATION, isText: true });
      setStep('editor');
    } catch {
      setUploadError('Could not render the background.');
    } finally {
      setWorkingLabel(null);
    }
  };

  const resumeDraft = (draft: StoryDraft) => {
    const file = new File([draft.blob], `draft-${draft.id}`, { type: draft.blob.type });
    if (media?.url) URL.revokeObjectURL(media.url);
    setMedia({
      file,
      url: URL.createObjectURL(file),
      type: draft.mediaType,
      duration: draft.mediaType === 'video' ? STORY_MAX_DURATION : STORY_IMAGE_DURATION,
      isText: false,
    });
    setOverlays(draft.overlays ?? []);
    setMusic(draft.music ?? null);
    setCaption(draft.caption ?? '');
    setDraftId(draft.id);
    setStep('editor');
  };

  const handleTrim = async () => {
    if (!media || !trimRange) return;
    setWorkingLabel('Trimming video…');
    try {
      const trimmed = await trimVideo(media.file, trimRange.start, trimRange.end, (f) => setProgress(Math.round(f * 100)));
      if (!trimmed) {
        setUploadError('This browser cannot trim video here, so we’ll post the full clip.');
        setStep('editor');
        return;
      }
      const meta = await getVideoMeta(trimmed);
      const url = URL.createObjectURL(trimmed);
      if (media.url) URL.revokeObjectURL(media.url);
      setMedia({ file: trimmed, url, type: 'video', duration: meta.duration, isText: false });
      setStep('editor');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not trim this video.');
    } finally {
      setWorkingLabel(null);
      window.setTimeout(() => setProgress(0), 400);
    }
  };

  // -------------------------------------------------------------------------
  // publish
  // -------------------------------------------------------------------------

  const publishDuration = (m: MediaSource) =>
    m.type === 'video' ? Math.min(m.duration, STORY_MAX_DURATION) : STORY_IMAGE_DURATION;

  const share = async () => {
    if (!media || uploading) return;
    setUploading(true);
    setUploadError(null);
    setProgress(0);
    try {
      await onUpload(media.file, {
        caption: caption.trim() ? caption.trim() : undefined,
        music: music && music.id !== 'none' && music.url ? { name: music.name, url: music.url } : undefined,
        duration: publishDuration(media),
        media_type: media.type,
        overlays,
        onProgress: (state) => setProgress(Math.round(state.progress * 100)),
      });
      if (draftId) deleteStoryDraft(draftId).catch(() => {});
      reset();
      onOpenChange(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not publish your story. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onOpenChange(false);
  };

  const content = (
    <DialogContent
      hideCloseButton
      className={cn(
        'w-full max-w-none border-0 bg-black p-0 text-white shadow-none',
        'h-[100dvh] max-h-[100dvh] overflow-hidden rounded-none',
        'sm:mx-auto sm:h-[96dvh] sm:max-h-[940px] sm:w-[min(96vw,1080px)] sm:rounded-2xl sm:ring-1 sm:ring-white/10',
      )}
    >
      <DialogTitle className="sr-only">Create a story</DialogTitle>

      {/* ------------------------------ MENU ------------------------------ */}
      {step === 'menu' && (
        <div className="flex h-full flex-col pt-[max(env(safe-area-inset-top,0px),12px)] pb-[max(env(safe-area-inset-bottom,0px),16px)]">
          <header className="flex items-center justify-between px-4">
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-900 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-base font-semibold tracking-tight text-white">New story</h2>
            <span className="w-10" />
          </header>

          <div className="grid grid-cols-3 gap-2.5 px-4 pt-6">
            <MenuItemButton
              icon={<Camera className="h-6 w-6" />}
              label="Photo"
              hint="Camera"
              onClick={() => {
                setCameraStartMode('photo');
                setCameraOpen(true);
              }}
            />
            <MenuItemButton
              icon={<Clapperboard className="h-6 w-6" />}
              label="Video"
              hint="Camera"
              onClick={() => {
                setCameraStartMode('video');
                setCameraOpen(true);
              }}
            />
            <MenuItemButton
              icon={<ImageIcon className="h-6 w-6" />}
              label="Gallery"
              hint="Device"
              onClick={() => galleryRef.current?.click()}
            />
          </div>

          <button
            type="button"
            onClick={() => setStep('bg')}
            className="mx-4 mt-3 flex items-center gap-4 rounded-2xl border border-white/10 bg-zinc-900/40 px-4 py-4 text-left transition hover:border-white/20 hover:bg-zinc-900"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600/20 text-violet-300">
              <Type className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white">Text story</span>
              <span className="block text-xs text-zinc-500">A bold, editorial moment on a background</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
          </button>

          {drafts.length > 0 && (
            <div className="mt-6 px-4">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Drafts</h3>
              <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
                {drafts.slice(0, 8).map((draft) => (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => resumeDraft(draft)}
                    className="relative flex h-32 w-20 shrink-0 flex-col overflow-hidden rounded-xl ring-1 ring-white/10 transition hover:ring-violet-500/60"
                  >
                    {draft.mediaType === 'video' ? (
                      <>
                        <span className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60">
                            <Clapperboard className="h-4 w-4 text-white" />
                          </span>
                        </span>
                      </>
                    ) : (
                      <img src={draftUrls.get(draft.id)} alt="Draft preview" className="absolute inset-0 h-full w-full object-cover" />
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-1 pt-5 text-left text-[10px] text-white/90">
                      {draft.caption || (draft.mediaType === 'video' ? 'Video draft' : 'Draft')}
                    </span>
                    {draft.music && draft.music.id !== 'none' && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60">
                        <Music className="h-3 w-3 text-violet-300" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {uploadError && <p className="mx-4 mt-4 text-center text-xs text-red-400">{uploadError}</p>}
        </div>
      )}

      {/* ------------------------------ BACKGROUND ------------------------------ */}
      {step === 'bg' && (
        <div className="flex h-full flex-col pt-[max(env(safe-area-inset-top,0px),12px)]">
          <header className="flex items-center justify-between px-3 pb-2">
            <button
              type="button"
              onClick={() => setStep('menu')}
              aria-label="Back"
              className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-900 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-base font-semibold text-white">Pick a background</h2>
            <span className="w-10" />
          </header>

          <div className="grid grid-cols-3 gap-2.5 overflow-y-auto px-4 pt-3">
            {STORY_BACKGROUNDS.map((bg) => (
              <button
                key={bg.id}
                type="button"
                onClick={() => chooseBackground(bg.id)}
                className={cn(
                  'group relative flex h-48 flex-col items-center justify-center gap-2 rounded-2xl ring-1 transition',
                  backgroundId === bg.id ? 'ring-2 ring-violet-500' : 'ring-white/10 hover:ring-white/30',
                )}
                style={{ background: `linear-gradient(160deg, ${bg.from}, ${bg.to})` }}
              >
                <Type className="h-6 w-6 text-white/80" />
                <span className="text-sm font-semibold text-white">{bg.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------ TRIM ------------------------------ */}
      {step === 'trim' && media && (
        <div className="flex h-full flex-col pt-[max(env(safe-area-inset-top,0px),12px)] pb-[max(env(safe-area-inset-bottom,0px),16px)]">
          <header className="flex items-center justify-between px-3">
            <button
              type="button"
              onClick={() => setStep('menu')}
              aria-label="Back"
              className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-900 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-base font-semibold text-white">Trim your video</h2>
            <span className="w-10" />
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-4">
            <div className="relative mx-auto aspect-[9/16] max-h-[56vh] overflow-hidden rounded-2xl bg-zinc-950 ring-1 ring-white/10">
              <video src={media.url} className="absolute inset-0 h-full w-full object-cover" autoPlay loop muted playsInline />
              {workingLabel && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-7 w-7 animate-spin text-violet-400" />
                    <span className="text-sm text-white">
                      {workingLabel}
                      {progress ? ` ${progress}%` : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 px-1">
              <StoryVideoTrimmer
                duration={media.duration}
                value={trimRange ?? { start: 0, end: STORY_MAX_DURATION }}
                onChange={setTrimRange}
                max={STORY_MAX_DURATION}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 px-4 pt-3">
            <button
              type="button"
              onClick={() => setStep('menu')}
              className="h-12 rounded-full border border-white/10 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleTrim}
              disabled={!!workingLabel}
              className="h-12 rounded-full bg-violet-600 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {workingLabel ? 'Working…' : 'Trim & continue'}
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------ EDITOR ------------------------------ */}
      {step === 'editor' && media && (
        <div className="flex h-full flex-col">
          <StoryEditor
            mediaUrl={media.url}
            mediaType={media.type}
            overlays={overlays}
            onChange={(o) => {
              setOverlays(o);
              setUploadError(null);
            }}
            onClose={() => {
              if (uploading) return;
              setStep('menu');
            }}
            onNext={() => setStep('publish')}
          />
        </div>
      )}

      {/* ------------------------------ MUSIC ------------------------------ */}
      {step === 'music' && (
        <div className="flex h-full flex-col">
          <StoryMusicPicker
            value={music}
            onSelect={(track) => {
              setMusic(track);
              setStep('publish');
            }}
            onClose={() => setStep('publish')}
          />
        </div>
      )}

      {/* ------------------------------ PUBLISH ------------------------------ */}
      {step === 'publish' && media && (
        <div className="flex h-full flex-col pt-[max(env(safe-area-inset-top,0px),12px)]">
          <header className="flex items-center justify-between px-3 pb-2">
            <button
              type="button"
              onClick={() => setStep('editor')}
              aria-label="Back to editor"
              className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-900 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-base font-semibold text-white">Share</h2>
            <span className="w-10" />
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <div className="relative mx-auto aspect-[9/16] max-h-[56vh] overflow-hidden rounded-2xl bg-zinc-950 ring-1 ring-white/10">
              {media.type === 'video' ? (
                <video src={media.url} className="absolute inset-0 h-full w-full object-cover" autoPlay loop muted playsInline />
              ) : (
                <img src={media.url} alt="Story preview" className="absolute inset-0 h-full w-full object-cover" />
              )}
              <StoryOverlayRenderer overlays={overlays} />
            </div>

            <div className="mt-3 space-y-2.5 pb-4">
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={200}
                placeholder="Add a caption…"
                className="h-12 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-violet-500/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setStep('music')}
                className="flex h-12 w-full items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/50 px-4 text-left transition hover:border-white/20"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 text-violet-300">
                  <Music className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-white">{music && music.id !== 'none' ? music.name : 'Add music'}</span>
                  <span className="block text-[11px] text-zinc-500">{music && music.id !== 'none' ? 'Playing over your story' : 'Optional'}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-zinc-600" />
              </button>
            </div>
          </div>

          <div className="px-4 pb-[max(env(safe-area-inset-bottom,0px),16px)]">
            {uploadError && <p className="mb-2 text-center text-xs text-red-400">{uploadError}</p>}
            <button
              type="button"
              onClick={share}
              disabled={uploading}
              className="flex h-12 w-full items-center justify-center rounded-full bg-violet-600 text-[15px] font-semibold text-white transition hover:bg-violet-500 disabled:opacity-70 active:scale-[0.99]"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing
                </>
              ) : (
                <>
                  Share story
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </>
              )}
            </button>
            {uploading && (
              <div className="mt-2">
                <ProgressBar value={progress} label={`Uploading ${progress}%`} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* working overlay (background bake / camera handoff) */}
      {workingLabel && step !== 'trim' && step !== 'editor' && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="flex items-center gap-3 rounded-2xl bg-zinc-900 px-4 py-3 text-sm text-white">
            <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
            {workingLabel}
          </div>
        </div>
      )}

      {/* hidden gallery picker */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,video/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleLibraryFile(file);
          event.target.value = '';
        }}
        className="sr-only"
      />

      <CameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        mode="story"
        startMode={cameraStartMode}
        maxVideoDuration={STORY_MAX_DURATION}
        onDone={handleCameraDone}
      />
    </DialogContent>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) handleClose();
      }}
    >
      {content}
    </Dialog>
  );
}

function MenuItemButton({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/40 px-2 py-5 transition hover:border-violet-500/40 hover:bg-zinc-900 active:scale-[0.98]"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-300 ring-1 ring-white/10 transition group-hover:text-violet-300">
        {icon}
      </span>
      <span className="text-sm font-semibold text-white">{label}</span>
      <span className="text-[11px] text-zinc-500">{hint}</span>
    </button>
  );
}

function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-violet-500 transition-all"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      {label && <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">{label}</span>}
    </div>
  );
}