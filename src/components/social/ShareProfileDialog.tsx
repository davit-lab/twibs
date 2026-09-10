import { useCallback, useMemo, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetDescription, SheetTitle,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ArrowLeft, Check, Copy, Download, Maximize2, ScanLine, Share2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  buildModuleMatrix,
  DEFAULT_QR_ACCENT,
  DEFAULT_QR_FRAME,
  DEFAULT_QR_STYLE,
  downloadQrMatrix,
  QR_ACCENTS,
  QR_FRAMES,
  QR_STYLES,
  renderQrSvg,
  type QrAccent,
  type QrFrame,
  type QrStyleId,
} from '@/lib/qr';

interface ShareProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  bio?: string | null;
}

function getInitials(name: string) {
  return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex items-center gap-1 rounded-full border border-border/70 bg-surface-2/60 p-1"
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.id)}
            className={cn(
              'min-w-0 flex-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ShareProfileDialog({
  open,
  onOpenChange,
  displayName,
  username,
  avatarUrl,
  bio,
}: ShareProfileDialogProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [copied, setCopied] = useState(false);
  const [style, setStyle] = useState<QrStyleId>(DEFAULT_QR_STYLE);
  const [frame, setFrame] = useState<QrFrame>(DEFAULT_QR_FRAME);
  const [accent, setAccent] = useState<QrAccent>(DEFAULT_QR_ACCENT);
  const [focused, setFocused] = useState(false);
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const url = useMemo(() => `${window.location.origin}/profile/${username}`, [username]);

  // The module matrix only depends on the URL, so it is computed once and reused
  // across style switches.
  const matrix = useMemo(() => buildModuleMatrix(url), [url]);
  const qrKey = useMemo(() => `${style}-${accent}`, [style, accent]);

  const handleClose = useCallback(() => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
    setCopied(false);
    setFocused(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers / contexts without the async clipboard API.
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
    toast({ title: 'Profile link copied', description: 'Paste it anywhere to share this profile.' });
  }, [url, toast]);

  const shareProfile = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${displayName} on Twibsers`,
          text: `Check out ${displayName} (@${username}) on Twibsers.`,
          url,
        });
      } catch {
        // User dismissed the native share sheet.
      }
      return;
    }
    await copyLink();
  }, [displayName, username, url, copyLink]);

  const saveQr = useCallback(() => {
    const canvas = downloadQrMatrix(matrix, style, accent, username);
    if (!canvas) {
      toast({
        variant: 'destructive',
        title: "Couldn't save QR",
        description: 'Something went wrong while generating the image.',
      });
      return;
    }
    const a = downloadRef.current;
    if (a) {
      a.href = canvas.toDataURL('image/png');
      a.download = `${username}-twibsers-qr.png`;
      a.click();
    }
  }, [matrix, style, accent, username, toast]);

  const qrCardClass = cn(
    'mx-auto flex flex-col items-center',
    frame === 'minimal' && 'rounded-2xl border border-border/80 bg-surface/40 p-4',
    frame === 'card' && 'rounded-3xl border border-border bg-card p-5 shadow-sm'
  );

  const qrClass = cn(
    'w-[min(58vw,210px)] sm:w-[224px]',
    frame !== 'none' && 'rounded-xl'
  );

  const renderMain = () => (
    <div className="flex flex-col px-5 pb-6">
      {/* Identity */}
      <div className="flex flex-col items-center pt-5 pb-4 text-center">
        <Avatar className="h-14 w-14 ring-2 ring-border/60">
          <AvatarImage src={avatarUrl || undefined} alt={displayName} />
          <AvatarFallback className="text-lg font-semibold bg-neutral-700 text-white">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        <p className="mt-2.5 text-[15px] font-bold leading-tight">{displayName}</p>
        <p className="text-[13px] text-muted-foreground">@{username}</p>
        {bio && (
          <p className="mt-1 max-w-[260px] truncate text-xs text-muted-foreground/70">
            {bio}
          </p>
        )}
      </div>

      {/* QR */}
      <div className={qrCardClass}>
        <div className="relative">
          <span className="sr-only">QR code for @{username}&apos;s Twibsers profile</span>
          <div key={qrKey} className="qr-swap">
            {renderQrSvg(matrix, style, accent, qrClass)}
          </div>
          <button
            type="button"
            onClick={() => setFocused(true)}
            className="absolute -right-1 -top-1 grid h-8 w-8 place-items-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="Show QR full screen"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ScanLine className="h-3.5 w-3.5" />
          Scan to view profile
        </p>
      </div>

      {/* Actions */}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button size="sm" className="h-11 rounded-full font-semibold gap-2" onClick={shareProfile}>
          <Share2 className="h-4 w-4" />
          Share profile
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-11 rounded-full font-semibold gap-2"
          onClick={copyLink}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="mt-2 h-10 w-full rounded-full font-semibold gap-2 text-muted-foreground"
        onClick={saveQr}
      >
        <Download className="h-4 w-4" />
        Save QR
      </Button>

      {/* Customizer */}
      <div className="mt-4 space-y-3 rounded-2xl border border-border/70 bg-surface/40 p-3.5">
        <div>
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            QR style
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {QR_STYLES.map((s) => {
              const active = style === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStyle(s.id)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/80 bg-background text-muted-foreground hover:border-border hover:text-foreground'
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-[2px]"
                    style={{ background: s.moduleFill }}
                    aria-hidden="true"
                  />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="min-w-0">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Frame
            </span>
            <Segmented
              label="QR frame"
              value={frame}
              onChange={(v) => setFrame(v)}
              options={QR_FRAMES}
            />
          </div>
          <div className="min-w-0">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Accent
            </span>
            <Segmented
              label="QR accent color"
              value={accent}
              onChange={(v) => setAccent(v)}
              options={QR_ACCENTS}
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderFocus = () => (
    <div className="flex flex-col overflow-y-auto px-6 pb-8">
      <div className="m-auto flex flex-col items-center pt-14">
        <button
          type="button"
          onClick={() => setFocused(false)}
          className="mb-5 flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <p className="text-sm font-medium text-muted-foreground">@{username}</p>
        <div className="mt-4">
          <span className="sr-only">QR code for @{username}&apos;s Twibsers profile</span>
          <div key={`focus-${qrKey}`} className="qr-swap">
            {renderQrSvg(matrix, style, accent, 'w-[min(72vw,300px)]')}
          </div>
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <ScanLine className="h-4 w-4" />
          Scan to view profile
        </p>

        <div className="mt-7 w-full max-w-[300px] space-y-2">
          <Button className="h-11 w-full rounded-full font-semibold gap-2" onClick={shareProfile}>
            <Share2 className="h-4 w-4" />
            Share profile
          </Button>
          <Button
            variant="outline"
            className="h-11 w-full rounded-full font-semibold gap-2"
            onClick={saveQr}
          >
            <Download className="h-4 w-4" />
            Save QR
          </Button>
        </div>

        {copied && (
          <span className="sr-only" role="status">Link copied</span>
        )}
      </div>
    </div>
  );

  const sheetHeader = (
    <div className="flex items-center justify-between px-5 pb-1 pt-4">
      <SheetTitle className="text-base font-bold">{focused ? 'Show QR' : 'Share profile'}</SheetTitle>
      <SheetDescription className="sr-only">
        Share {displayName}&apos;s profile with a QR code or link.
      </SheetDescription>
    </div>
  );

  const dialogHeader = (
    <div className="flex items-center justify-between px-5 pb-1 pt-4">
      <DialogTitle className="text-base font-bold">{focused ? 'Show QR' : 'Share profile'}</DialogTitle>
      <DialogDescription className="sr-only">
        Share {displayName}&apos;s profile with a QR code or link.
      </DialogDescription>
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close"
        className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  const scrollable = (content: React.ReactNode) => (
    <div className="flex flex-col overflow-y-auto">{content}</div>
  );

  return (
    <>
      <style>{`
        @keyframes qr-swap {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        .qr-swap { animation: qr-swap 0.18s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .qr-swap { animation: none; }
        }
      `}</style>

      {isMobile ? (
        <Sheet open={open} onOpenChange={handleClose}>
          <SheetContent
            side="bottom"
            className={cn(
              'gap-0 rounded-t-[1.5rem] border-t-border p-0 sm:hidden',
              focused ? 'h-[94dvh]' : 'max-h-[92dvh]'
            )}
          >
            <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-border" />
            {sheetHeader}
            {focused ? scrollable(renderFocus()) : scrollable(renderMain())}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={handleClose}>
          <DialogContent
            hideCloseButton
            className={cn(
              'flex max-h-[96dvh] w-[calc(100vw-2rem)] flex-col gap-0 rounded-[1.25rem] p-0 sm:max-w-[400px]',
              focused && 'sm:max-w-md'
            )}
          >
            {dialogHeader}
            {focused ? scrollable(renderFocus()) : scrollable(renderMain())}
          </DialogContent>
        </Dialog>
      )}

      <a ref={downloadRef} className="hidden" tabIndex={-1} aria-hidden="true" />
    </>
  );
}