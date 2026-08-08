import { useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Copy, Check, Download, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShareProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
}

const QUIET_ZONE = 4;
const BRAND = '#7c3aed';
const MODULE_RADIUS = 0.32;

function buildModuleMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  const matrix: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) row.push(qr.isDark(r, c));
    matrix.push(row);
  }
  return matrix;
}

function QrSvg({ matrix, className }: { matrix: boolean[][]; className?: string }) {
  const size = matrix.length;
  const total = size + QUIET_ZONE * 2;

  const squares: React.ReactNode[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        squares.push(
          <rect
            key={`${r}-${c}`}
            x={c + QUIET_ZONE}
            y={r + QUIET_ZONE}
            width={1}
            height={1}
            rx={MODULE_RADIUS}
          />
        );
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      className={cn('w-full h-auto', className)}
      role="img"
      aria-label="QR code"
    >
      <rect x={0} y={0} width={total} height={total} fill="#ffffff" rx={2} />
      <g fill={BRAND}>{squares}</g>
    </svg>
  );
}

export default function ShareProfileDialog({
  open,
  onOpenChange,
  displayName,
  username,
  avatarUrl,
}: ShareProfileDialogProps) {
  const { toast } = useToast();
  const url = useMemo(() => `${window.location.origin}/profile/${username}`, [username]);
  const matrix = useMemo(() => buildModuleMatrix(url), [url]);
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: 'Link copied', description: 'Profile link copied to clipboard.' });
    setTimeout(() => setCopied(false), 1500);
  };

  const handleShare = async () => {
    if (!navigator.share) {
      await handleCopy();
      return;
    }
    try {
      await navigator.share({ title: `${displayName} on Twibsers`, url });
    } catch {
      // cancelled
    }
  };

  const handleDownload = () => {
    const size = matrix.length;
    const scale = 12;
    const radius = scale * MODULE_RADIUS;
    const total = size + QUIET_ZONE * 2;
    const canvas = document.createElement('canvas');
    canvas.width = total * scale;
    canvas.height = total * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = BRAND;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c]) {
          ctx.beginPath();
          ctx.roundRect((c + QUIET_ZONE) * scale, (r + QUIET_ZONE) * scale, scale, scale, radius);
          ctx.fill();
        }
      }
    }

    const href = canvas.toDataURL('image/png');
    const a = downloadRef.current;
    if (a) {
      a.href = href;
      a.download = `${username}-qr.png`;
      a.click();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden">
        <DialogTitle className="sr-only">Share profile</DialogTitle>
        <DialogDescription className="sr-only">
          Share {displayName}'s profile with a QR code or link.
        </DialogDescription>

        <div className="px-6 py-7 flex flex-col items-center">
          <Avatar className="h-14 w-14 mb-2 ring-2 ring-primary/20">
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback className="text-lg font-semibold">{displayName?.charAt(0) || 'U'}</AvatarFallback>
          </Avatar>
          <p className="font-semibold text-lg leading-tight">{displayName}</p>
          <p className="text-sm text-muted-foreground mb-5">@{username}</p>

          <div className="bg-white rounded-[1.5rem] p-3.5 shadow-lg shadow-primary/10">
            <QrSvg matrix={matrix} className="w-52 h-52 sm:w-56 sm:h-56" />
          </div>
          <p className="text-xs text-muted-foreground mt-3">Scan with your camera to open this profile</p>

          <div className="mt-5 w-full flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5">
            <span className="text-xs text-muted-foreground truncate flex-1">{url}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5 w-full">
            <Button variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Save QR
            </Button>
            {navigator.share ? (
              <Button onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-2" />
                Share link
              </Button>
            ) : (
              <Button onClick={handleCopy}>
                <Check className="h-4 w-4 mr-2" />
                Copy link
              </Button>
            )}
          </div>
        </div>

        <a ref={downloadRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
