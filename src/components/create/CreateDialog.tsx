import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useStories } from '@/hooks/useStories';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  Camera,
  ImageIcon,
  X,
  Plus,
  ChevronRight,
  ArrowLeft,
  Clapperboard,
  Music,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ReelCreator from './ReelCreator';
import MusicPicker from '@/components/music/MusicPicker';
import type { MusicTrack } from '@/hooks/useMusicLibrary';

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CreateType = 'story' | 'post' | 'reel';

const createOptions = [
  {
    type: 'story' as CreateType,
    icon: Camera,
    label: 'Story',
    description: 'Share a moment that disappears in 24 hours',
    gradient: 'from-primary to-primary/60',
  },
  {
    type: 'post' as CreateType,
    icon: ImageIcon,
    label: 'Post',
    description: 'Share a photo or update with your followers',
    gradient: 'from-primary/90 to-primary/50',
  },
  {
    type: 'reel' as CreateType,
    icon: Clapperboard,
    label: 'Reel',
    description: 'Record and edit a short vertical video',
    gradient: 'from-primary to-primary/40',
  },
];

export default function CreateDialog({ open, onOpenChange }: CreateDialogProps) {
  const { uploadStory } = useStories();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [createType, setCreateType] = useState<CreateType | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedMusic, setSelectedMusic] = useState<MusicTrack | null>(null);
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  const [reelCreatorOpen, setReelCreatorOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
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

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      await uploadStory(
        selectedFile,
        caption || undefined,
        selectedMusic ? { name: selectedMusic.name, url: selectedMusic.url } : undefined
      );
      toast({
        title: 'Story posted!',
        description: 'Your story is now live for 24 hours.',
      });
      handleClose();
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload.',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setCreateType(null);
    setSelectedFile(null);
    setCaption('');
    setSelectedMusic(null);
    setMusicPickerOpen(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onOpenChange(false);
  };

  const handleCreateTypeSelect = (type: CreateType) => {
    if (type === 'reel') {
      onOpenChange(false);
      setReelCreatorOpen(true);
    } else if (type === 'post') {
      onOpenChange(false);
      navigate('/?compose=1');
    } else {
      setCreateType(type);
    }
  };

  const selectedOption = createType ? createOptions.find((o) => o.type === createType) : null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md p-0 gap-0 rounded-3xl overflow-hidden">
          {!createType ? (
            <>
              {/* Header */}
              <div className="p-6 pb-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/25">
                    <Plus className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">Create</h2>
                    <p className="text-sm text-muted-foreground">Choose what you'd like to share</p>
                  </div>
                </div>
              </div>

              {/* Options */}
              <div className="px-4 pb-5 space-y-3">
                {createOptions.map((option) => (
                  <button
                    key={option.type}
                    onClick={() => handleCreateTypeSelect(option.type)}
                    className={cn(
                      'group w-full flex items-center gap-4 p-4 rounded-2xl border border-border/60 bg-card text-left',
                      'transition-all duration-200 hover:border-primary/40 hover:bg-primary/[0.04]',
                      'hover:shadow-md hover:shadow-primary/10 active:scale-[0.98]'
                    )}
                  >
                    <div className={cn(
                      'w-14 h-14 rounded-2xl bg-gradient-to-br text-white flex items-center justify-center',
                      'shadow-md shadow-primary/25 flex-shrink-0 transition-transform duration-200 group-hover:scale-105',
                      option.gradient
                    )}>
                      <option.icon className="h-6 w-6" strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block font-semibold">{option.label}</span>
                      <span className="block text-sm text-muted-foreground leading-snug">
                        {option.description}
                      </span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground/60 flex-shrink-0 transition-all duration-200 group-hover:text-primary group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCreateType(null)}
                  className="h-9 w-9 rounded-full hover:bg-primary/10 hover:text-primary"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    'w-9 h-9 rounded-xl bg-gradient-to-br text-white flex items-center justify-center shadow-md shadow-primary/25',
                    selectedOption?.gradient
                  )}>
                    {selectedOption && <selectedOption.icon className="h-4.5 w-4.5" />}
                  </div>
                  <div>
                    <h2 className="font-bold tracking-tight leading-none mb-1">New Story</h2>
                    <p className="text-xs text-muted-foreground">Visible for 24 hours</p>
                  </div>
                </div>
              </div>

              {!selectedFile ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="group w-full aspect-video rounded-2xl border-2 border-dashed border-primary/25 bg-primary/[0.03] hover:border-primary/50 hover:bg-primary/[0.06] transition-all flex flex-col items-center justify-center gap-3"
                >
                  <div className="w-14 h-14 rounded-full bg-primary/10 group-hover:bg-primary/15 flex items-center justify-center transition-colors">
                    <ImageIcon className="h-6 w-6 text-primary" />
                  </div>
                  <span className="font-medium">Choose a photo or video</span>
                  <span className="text-xs text-muted-foreground">Tap to browse · up to 50MB</span>
                </button>
              ) : (
                <div className="relative rounded-2xl overflow-hidden ring-1 ring-primary/20">
                  {selectedFile.type.startsWith('video/') ? (
                    <video
                      src={previewUrl || undefined}
                      className="w-full aspect-video object-cover"
                      controls
                    />
                  ) : (
                    <img
                      src={previewUrl || undefined}
                      alt="Preview"
                      className="w-full aspect-video object-cover"
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedFile(null);
                      if (previewUrl) URL.revokeObjectURL(previewUrl);
                      setPreviewUrl(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="absolute top-2.5 right-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Music */}
              {selectedMusic ? (
                <div className="flex items-center gap-3 p-3 rounded-2xl border border-primary/25 bg-primary/[0.04]">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/70 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-primary/25">
                    <Music className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{selectedMusic.name}</p>
                    <p className="text-xs text-muted-foreground">Soundtrack · plays on your story</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedMusic(null)}
                    className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setMusicPickerOpen(!musicPickerOpen)}
                  className="w-full rounded-2xl border-border/60 hover:border-primary/40 hover:bg-primary/[0.04]"
                >
                  <Music className="h-4 w-4 mr-2 text-primary" />
                  {musicPickerOpen ? 'Close music picker' : 'Add music to your story'}
                </Button>
              )}

              {musicPickerOpen && !selectedMusic && (
                <MusicPicker
                  value=""
                  onSelect={(track) => {
                    setSelectedMusic(track);
                    setMusicPickerOpen(false);
                  }}
                />
              )}

              <Textarea
                placeholder="Add a caption..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="resize-none rounded-2xl border-border/60 bg-card focus-visible:ring-primary/30"
                rows={3}
              />

              <div className="flex gap-2.5 pt-1">
                <Button
                  variant="outline"
                  onClick={() => setCreateType(null)}
                  className="flex-1 rounded-xl border-border/60 hover:bg-muted/50"
                >
                  Back
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                  className="flex-1 rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/25 hover:from-primary/90 hover:to-primary/60"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    'Share Story'
                  )}
                </Button>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </DialogContent>
      </Dialog>

      {/* Reel Creator Dialog */}
      <ReelCreator open={reelCreatorOpen} onOpenChange={setReelCreatorOpen} />
    </>
  );
}
