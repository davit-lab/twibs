import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Upload, FileAudio, FileText, Image as ImageIcon, X, Plus, Loader2, Check } from 'lucide-react';
import { useLibraryItems } from '@/hooks/useLibraryItems';
import { cn } from '@/lib/utils';

interface UploadItemModalProps {
  children?: React.ReactNode;
  onSuccess?: () => void;
}

const ACCEPTED_TYPES = {
  audio: '.mp3,.wav,.m4a,.ogg,.flac',
  pdf: '.pdf',
  image: '.jpg,.jpeg,.png,.gif,.webp'
};

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const STEPS = ['File', 'Details', 'Visibility', 'Publish'] as const;

export default function UploadItemModal({ children, onSuccess }: UploadItemModalProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>('public');
  const [allowDownloads, setAllowDownloads] = useState(true);
  const [allowComments, setAllowComments] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadItem } = useLibraryItems();

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile.size > MAX_FILE_SIZE) {
      alert('File size exceeds 100MB limit');
      return;
    }

    setFile(selectedFile);
    setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));

    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag) && tags.length < 10) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleUpload = async () => {
    if (!file || !title.trim()) return;

    setUploading(true);
    setUploadProgress(0);

    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + 10, 90));
    }, 200);

    const result = await uploadItem(file, {
      title: title.trim(),
      description: description.trim() || undefined,
      tags,
      visibility,
      allow_downloads: allowDownloads,
      allow_comments: allowComments
    });

    clearInterval(progressInterval);
    setUploadProgress(100);

    if (result) {
      setTimeout(() => {
        setOpen(false);
        resetForm();
        onSuccess?.();
      }, 500);
    } else {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const resetForm = () => {
    setStep(0);
    setFile(null);
    setPreview(null);
    setTitle('');
    setDescription('');
    setTags([]);
    setTagInput('');
    setVisibility('public');
    setAllowDownloads(true);
    setAllowComments(true);
    setUploading(false);
    setUploadProgress(0);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const fileTypeLabel = () => {
    if (!file) return '';
    if (file.type.startsWith('audio/')) return 'Audio';
    if (file.type === 'application/pdf') return 'PDF';
    if (file.type.startsWith('image/')) return 'Image';
    return 'File';
  };

  const visibilityLabel = {
    public: 'Public',
    followers: 'Followers only',
    private: 'Private',
  }[visibility];

  const canNext = () => {
    if (step === 0) return !!file;
    if (step === 1) return title.trim().length > 0;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetForm();
    }}>
      <DialogTrigger asChild>
        {children || (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Upload
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload to Library</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Stepper */}
          <div className="flex items-center gap-1">
            {STEPS.map((label, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <div key={label} className="flex flex-1 items-center gap-1">
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                      done
                        ? 'bg-primary text-primary-foreground'
                        : active
                          ? 'border border-primary text-primary'
                          : 'border border-border/60 text-muted-foreground'
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      'hidden text-[11px] font-semibold sm:block',
                      active ? 'text-foreground' : done ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </span>
                  {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border/60" />}
                </div>
              );
            })}
          </div>

          {/* Step 1 — File */}
          {step === 0 && (
            <div
              className={cn(
                'rounded-xl border border-dashed p-6 text-center transition-colors cursor-pointer',
                dragActive ? 'border-primary bg-primary/5' : 'border-border/70 hover:border-primary/40',
                file && 'border-border/70 bg-muted/20'
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={`${ACCEPTED_TYPES.audio},${ACCEPTED_TYPES.pdf},${ACCEPTED_TYPES.image}`}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />

              {file ? (
                <div className="flex flex-col items-center gap-3">
                  {preview ? (
                    <img src={preview} alt="Preview" className="h-28 w-28 rounded-md object-cover" />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      {file.type === 'application/pdf' ? <FileText className="h-7 w-7" /> : file.type.startsWith('audio/') ? <FileAudio className="h-7 w-7" /> : <Upload className="h-7 w-7" />}
                    </span>
                  )}
                  <div>
                    <p className="max-w-[280px] truncate font-semibold">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {fileTypeLabel()} · {formatFileSize(file.size)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    >
                      Change file
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2.5">
                  <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <Upload className="h-7 w-7" />
                  </span>
                  <p className="font-semibold">Upload your book or media</p>
                  <p className="text-sm text-muted-foreground">
                    Drag and drop, or click to choose a file
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Audio (MP3, WAV, M4A) · PDF · Images · Max 100MB
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2 — Details */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex gap-4">
                {preview && (
                  <img src={preview} alt="Cover preview" className="h-28 w-20 shrink-0 rounded-md border border-border/60 object-cover" />
                )}
                <div className="flex-1 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Give your upload a title"
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Add a short description..."
                      rows={3}
                      maxLength={500}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Add a tag"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    maxLength={20}
                  />
                  <Button type="button" variant="outline" onClick={addTag}>Add</Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-sm text-primary">
                        #{tag}
                        <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3 — Visibility */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Visibility</Label>
                <Select value={visibility} onValueChange={(v: any) => setVisibility(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public — Anyone can see</SelectItem>
                    <SelectItem value="followers">Followers only</SelectItem>
                    <SelectItem value="private">Private — Only you</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
                <Label htmlFor="downloads">Allow downloads</Label>
                <Switch id="downloads" checked={allowDownloads} onCheckedChange={setAllowDownloads} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
                <Label htmlFor="comments">Allow comments</Label>
                <Switch id="comments" checked={allowComments} onCheckedChange={setAllowComments} />
              </div>
            </div>
          )}

          {/* Step 4 — Publish */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                {preview ? (
                  <img src={preview} alt="Cover preview" className="h-24 w-16 shrink-0 rounded-md border border-border/60 object-cover" />
                ) : file?.type === 'application/pdf' ? (
                  <span className="flex h-24 w-16 shrink-0 items-center justify-center rounded-md border border-border/60 bg-card">
                    <FileText className="h-6 w-6 text-red-500" />
                  </span>
                ) : file?.type.startsWith('audio/') ? (
                  <span className="flex h-24 w-16 shrink-0 items-center justify-center rounded-md border border-border/60 bg-card">
                    <FileAudio className="h-6 w-6 text-primary" />
                  </span>
                ) : file?.type.startsWith('image/') ? (
                  <span className="flex h-24 w-16 shrink-0 items-center justify-center rounded-md border border-border/60 bg-card">
                    <ImageIcon className="h-6 w-6 text-green-500" />
                  </span>
                ) : (
                  <span className="flex h-24 w-16 shrink-0 items-center justify-center rounded-md border border-border/60 bg-card">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  </span>
                )}
                <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                  <p className="truncate font-semibold">{title || 'Untitled'}</p>
                  {file && (
                    <p className="truncate text-xs text-muted-foreground">
                      {file.name} · {formatFileSize(file.size)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">Visibility: {visibilityLabel}</p>
                  {description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>
                  )}
                </div>
              </div>

              {uploading && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} className="h-1.5" />
                  <p className="text-center text-sm text-muted-foreground">
                    Uploading… {uploadProgress}%
                  </p>
                </div>
              )}

              <Button className="w-full" disabled={!file || !title.trim() || uploading} onClick={handleUpload}>
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Publish
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Step navigation */}
          {step < 3 && (
            <div className="flex items-center justify-between gap-3">
              <Button type="button" variant="ghost" disabled={step === 0 || uploading} onClick={() => setStep(s => s - 1)}>
                Back
              </Button>
              <Button type="button" disabled={!canNext() || uploading} onClick={() => setStep(s => s + 1)}>
                {step === 2 ? 'Review & publish' : 'Continue'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}