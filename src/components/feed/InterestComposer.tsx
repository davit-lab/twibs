import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useInterestPostActions } from '@/hooks/useInterestPosts';
import type { InterestCategory } from '@/hooks/useInterests';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ImagePlus, X, Compass } from 'lucide-react';

interface MediaPreview {
  file: File;
  preview: string;
  type: 'image' | 'video';
}

export default function InterestComposer({
  interests,
  defaultCategoryId,
}: {
  interests: InterestCategory[];
  defaultCategoryId?: string;
}) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { createPost } = useInterestPostActions();

  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [media, setMedia] = useState<MediaPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canPost = content.trim().length > 0 && !!category;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast({ variant: 'destructive', title: 'Invalid file', description: 'Please select an image or video file.' });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 50MB.' });
      return;
    }

    setMedia({
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' : 'image',
    });
  };

  const removeMedia = () => {
    if (media) URL.revokeObjectURL(media.preview);
    setMedia(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCancel = () => {
    removeMedia();
    setContent('');
    setCategory('');
    setOpen(false);
  };

  const handleSubmit = async () => {
    if (!canPost) return;

    setUploading(true);
    try {
      let mediaUrl: string | undefined;
      let mediaType: string | undefined;

      if (media) {
        if (!user) return;
        const fileExt = media.file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error } = await supabase.storage.from('interest-media').upload(fileName, media.file);
        if (error) {
          toast({ variant: 'destructive', title: 'Upload failed', description: error.message });
          return;
        }

        const { data: { publicUrl } } = supabase.storage.from('interest-media').getPublicUrl(fileName);
        mediaUrl = publicUrl;
        mediaType = media.type;
      }

      await createPost.mutateAsync({
        content: content.trim(),
        categoryId: category,
        mediaUrl,
        mediaType,
      });

      handleCancel();
    } finally {
      setUploading(false);
    }
  };

  if (interests.length === 0) {
    return (
      <div className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border/70 bg-card text-left">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Compass className="h-5 w-5 text-primary" />
        </div>
        <span className="text-[15px] text-muted-foreground font-medium">
          Pick interests to start posting
        </span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setCategory(
            defaultCategoryId && interests.some((c) => c.id === defaultCategoryId)
              ? defaultCategoryId
              : interests[0]?.id || ''
          );
          setOpen(true);
        }}
        className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border/70 bg-card text-left transition-colors hover:border-border"
      >
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarImage src={profile?.avatar_url || undefined} />
          <AvatarFallback className="bg-surface-2 text-foreground font-bold">
            {profile?.display_name?.charAt(0) || 'U'}
          </AvatarFallback>
        </Avatar>
        <span className="text-[15px] text-muted-foreground font-medium">
          Share something with your interests...
        </span>
      </button>
    );
  }

  return (
    <div className="p-4 rounded-2xl border border-border/70 bg-card space-y-3">
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarImage src={profile?.avatar_url || undefined} />
          <AvatarFallback className="bg-surface-2 text-foreground font-bold">
            {profile?.display_name?.charAt(0) || 'U'}
          </AvatarFallback>
        </Avatar>
        <Textarea
          autoFocus
          placeholder="Share something with your interests..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          className="flex-1 resize-none bg-transparent border-none focus-visible:ring-0 p-0 text-[15px]"
        />
      </div>

      {media && (
        <div className="relative rounded-xl overflow-hidden border border-border/60">
          {media.type === 'video' ? (
            <video src={media.preview} controls className="w-full max-h-64 object-cover" />
          ) : (
            <img src={media.preview} alt="Preview" className="w-full max-h-64 object-cover" />
          )}
          <button
            onClick={removeMedia}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 hover:bg-background transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="gap-2 text-muted-foreground"
          >
            <ImagePlus className="h-4 w-4" />
            Media
          </Button>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-auto min-w-[140px] gap-2 text-xs font-bold">
              <SelectValue placeholder="Pick a topic" />
            </SelectTrigger>
            <SelectContent>
              {interests.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canPost || createPost.isPending || uploading}
          >
            {createPost.isPending || uploading ? (
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
    </div>
  );
}
