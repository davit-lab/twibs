import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Upload } from 'lucide-react';

export interface ImageCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Human label used in the dialog copy, e.g. "cover photo". */
  label: string;
  /** width / height. Covers are wide (16/5), avatars are square (1). */
  aspect: number;
  /** Output canvas dimensions after cropping. */
  outputWidth: number;
  outputHeight: number;
  /**
   * Performs the actual upload and resolves to the stored public URL.
   * Keeping this injected means the crop UI is shared by every caller while
   * storage authorisation stays in the caller's own (member-scoped) code path.
   */
  onUpload: (file: File, croppedBlob: Blob) => Promise<string>;
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number) {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 100 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  );
}

/**
 * Shared select -> crop -> upload dialog.
 *
 * Extracted from the personal CoverUploadDialog pattern so business assets get
 * identical crop/validation behaviour without duplicating the canvas maths, and
 * without coupling the dialog to any particular account type.
 */
export default function ImageCropDialog({
  open,
  onOpenChange,
  label,
  aspect,
  outputWidth,
  outputHeight,
  onUpload,
}: ImageCropDialogProps) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [uploading, setUploading] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke the object URL when it is replaced or the dialog closes, otherwise
  // every crop leaks the full-size file for the life of the document.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const reset = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please select an image file.',
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Maximum file size is 10MB.',
      });
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget;
      setCrop(centerAspectCrop(width, height, aspect));
    },
    [aspect]
  );

  const getCroppedImg = async (): Promise<Blob | null> => {
    if (!imgRef.current || !completedCrop) return null;

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // `onComplete` hands back a PixelCrop (display pixels). Converting it to the
    // image's natural pixel grid needs the rendered->natural scale factors.
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = outputWidth;
    canvas.height = outputHeight;

    // JPEG has no alpha channel, so transparent PNG regions would otherwise be
    // composited against black and export as black boxes.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9));
  };

  const handleUpload = async () => {
    if (!selectedFile || !completedCrop) return;

    setUploading(true);
    try {
      const croppedBlob = await getCroppedImg();
      if (!croppedBlob) throw new Error('Failed to crop image');
      const url = await onUpload(selectedFile, croppedBlob);
      toast({ title: `Your ${label} has been updated.` });
      handleOpenChange(false);
      return url;
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Change {label}</DialogTitle>
          <DialogDescription>
            Upload an image and crop it to fit. JPG, PNG, WebP or GIF, up to 10MB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {!previewUrl ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-border py-14 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
            >
              <Upload className="h-6 w-6" />
              <span>Choose an image</span>
            </button>
          ) : (
            <>
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
                aspect={aspect}
              >
                <img
                  ref={imgRef}
                  onLoad={onImageLoad}
                  src={previewUrl}
                  alt="Crop preview"
                  className="max-h-[50vh] w-full"
                />
              </ReactCrop>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  setCrop(undefined);
                  setCompletedCrop(undefined);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                Choose a different image
              </Button>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!completedCrop || uploading}>
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
