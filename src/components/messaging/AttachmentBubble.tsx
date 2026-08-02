import { Download, FileText } from 'lucide-react';
import type { MessageAttachment } from '@/hooks/useMessages';
import { cn } from '@/lib/utils';

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export async function downloadUrl(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank');
  }
}

interface AttachmentBubbleProps {
  attachments: MessageAttachment[];
  isOwn: boolean;
  onImageClick?: (url: string) => void;
}

export default function AttachmentBubble({ attachments, isOwn, onImageClick }: AttachmentBubbleProps) {
  return (
    <div className="space-y-2">
      {attachments.map((att) => {
        if (att.type === 'image') {
          return (
            <div key={att.id} className="relative group">
              <img
                src={att.url}
                alt={att.name || 'Image'}
                loading="lazy"
                className="max-w-full rounded-xl max-h-72 object-contain cursor-pointer"
                onClick={() => onImageClick?.(att.url)}
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); downloadUrl(att.url, att.name || 'image'); }}
                className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Download"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          );
        }

        if (att.type === 'audio') {
          return (
            <div key={att.id} className="space-y-1">
              <audio controls preload="metadata" className="h-10 w-60 max-w-full" src={att.url} />
              <div className="flex items-center gap-2">
                <span className={cn('text-[10px]', isOwn ? 'text-white/70' : 'text-muted-foreground')}>
                  {att.duration ? `${formatDuration(att.duration)} · ` : ''}Voice message
                </span>
                <button
                  type="button"
                  onClick={() => downloadUrl(att.url, att.name || 'voice-message.webm')}
                  className="text-[10px] underline opacity-70 hover:opacity-100"
                  title="Download"
                >
                  Download
                </button>
              </div>
            </div>
          );
        }

        return (
          <div key={att.id} className="flex items-center gap-3 rounded-xl bg-black/10 dark:bg-white/10 px-3 py-2.5">
            <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0', isOwn ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary')}>
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-medium truncate', isOwn ? 'text-white' : 'text-foreground')}>
                {att.name || 'File'}
              </p>
              <p className={cn('text-[11px]', isOwn ? 'text-white/70' : 'text-muted-foreground')}>
                {formatFileSize(att.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => downloadUrl(att.url, att.name || 'download')}
              className={cn('h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0', isOwn ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
              title="Download"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
