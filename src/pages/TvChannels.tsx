import { useState, useRef, useEffect, useCallback } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Tv,
  Play,
  X,
  Globe,
  Tag,
  Loader2,
  AlertCircle,
  Radio,
  Volume2,
  VolumeX,
  Maximize,
  RefreshCw,
  BadgeCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useTvChannels,
  TvChannel,
} from '@/hooks/useTvChannels';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

function ChannelCard({
  channel,
  onPlay,
}: {
  channel: TvChannel;
  onPlay: (ch: TvChannel) => void;
}) {
  return (
    <button
      onClick={() => onPlay(channel)}
      className="group relative bg-card border border-border/60 rounded-2xl overflow-hidden hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 text-left"
    >
      <div className="aspect-video bg-muted flex items-center justify-center relative overflow-hidden">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt={channel.name}
            className="w-full h-full object-contain p-3 transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Tv className="h-8 w-8 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground/70 font-medium truncate max-w-[80%] text-center px-2">
              {channel.name}
            </span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 shadow-lg shadow-primary/30">
            <Play className="h-5 w-5 ml-0.5" />
          </div>
        </div>

        {channel.quality && (
          <div className="absolute top-2 right-2 text-[10px] font-bold bg-black/60 text-white px-2 py-0.5 rounded-lg backdrop-blur-sm">
            {channel.quality}
          </div>
        )}

        {channel.verified && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-emerald-500/90 backdrop-blur-sm rounded-lg px-1.5 py-0.5">
            <BadgeCheck className="h-3 w-3 text-white" />
            <span className="text-[9px] font-bold text-white tracking-wide">Verified</span>
          </div>
        )}

        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-bold text-white tracking-wide">LIVE</span>
        </div>
      </div>

      <div className="p-3.5">
        <h3 className="font-bold text-sm truncate group-hover:text-primary transition-colors">
          {channel.name}
        </h3>
        <div className="flex items-center gap-1.5 mt-1.5">
          {channel.country_flag && <span className="text-xs">{channel.country_flag}</span>}
          <span className="text-xs text-muted-foreground truncate font-medium">
            {channel.group || 'Unknown'}
          </span>
        </div>
      </div>
    </button>
  );
}

function ChannelPlayer({
  channel,
  onClose,
}: {
  channel: TvChannel;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  // Start muted: autoplay with sound is blocked by browsers once the click
  // gesture is lost (hls.js loads asynchronously), which leaves the spinner up.
  const [muted, setMuted] = useState(true);
  const [loadingStream, setLoadingStream] = useState(true);
  const [streamKey, setStreamKey] = useState(0);
  const hlsRef = useRef<any>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel.stream_url) return;

    let isCancelled = false;
    setPlayerError(null);
    setLoadingStream(true);
    const url = channel.stream_url;
    const isHls = url.includes('.m3u8') || url.includes('m3u8');

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    timeoutRef.current = setTimeout(() => {
      if (!isCancelled) {
        setLoadingStream(false);
        setPlayerError('Stream timed out. It may be offline or geo-blocked.');
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      }
    }, 12000);

    const clearLoading = () => {
      if (isCancelled) return;
      setLoadingStream(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
    video.addEventListener('playing', clearLoading);
    video.addEventListener('canplay', clearLoading);

    if (!isHls) {
      video.src = url;
      video.play().catch(() => {});
      setLoadingStream(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (isCancelled) return;

        if (Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          manifestLoadingTimeOut: 10000,
          manifestLoadingMaxRetry: 3,
          manifestLoadingRetryDelay: 1000,
          levelLoadingTimeOut: 10000,
          levelLoadingMaxRetry: 3,
        });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!isCancelled) {
            clearLoading();
            video.play().catch(() => {});
          }
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal && !isCancelled) {
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR && hlsRef.current) {
              hlsRef.current.recoverMediaError();
              return;
            }
            clearLoading();
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              setPlayerError('Network error — stream may be geo-blocked or offline');
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              setPlayerError('Playback error');
            } else {
              setPlayerError('Stream not supported');
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.play().catch(() => {});
        clearLoading();
      } else {
        setPlayerError('HLS not supported in this browser');
        clearLoading();
      }
      });
    }

    return () => {
      isCancelled = true;
      video.removeEventListener('playing', clearLoading);
      video.removeEventListener('canplay', clearLoading);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [channel.stream_url, streamKey]);

  const toggleFullscreen = () => {
    videoRef.current?.requestFullscreen?.();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl p-0 bg-black border-none overflow-hidden rounded-2xl">
        <div className="relative">
          <div className="aspect-video bg-black flex items-center justify-center">
            {loadingStream && !playerError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gradient-to-b from-black/90 to-black/70">
                <Loader2 className="h-8 w-8 text-white/60 animate-spin mb-3" />
                <p className="text-white/60 text-sm font-medium">Connecting to stream...</p>
                <p className="text-white/30 text-xs mt-1">This may take a few seconds</p>
              </div>
            )}
            <video
              ref={videoRef}
              className="w-full h-full"
              controls
              playsInline
              muted={muted}
            />
            {muted && !loadingStream && !playerError && (
              <button
                onClick={() => { setMuted(false); if (videoRef.current) videoRef.current.muted = false; }}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black/60 backdrop-blur-sm border border-white/10 text-white text-sm font-bold hover:bg-black/80 transition-all"
              >
                <VolumeX className="h-4 w-4" />
                Tap to unmute
              </button>
            )}
          </div>

          {/* Controls */}
          <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
            <button
              onClick={() => { setMuted(!muted); if (videoRef.current) videoRef.current.muted = !muted; }}
              className="w-9 h-9 rounded-xl bg-black/50 backdrop-blur-sm hover:bg-black/70 text-white flex items-center justify-center transition-all"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="w-9 h-9 rounded-xl bg-black/50 backdrop-blur-sm hover:bg-black/70 text-white flex items-center justify-center transition-all"
            >
              <Maximize className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-black/50 backdrop-blur-sm hover:bg-black/70 text-white flex items-center justify-center transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Error */}
          {playerError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
              <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
              <p className="text-white/80 text-sm text-center px-4 font-medium">{playerError}</p>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => { setPlayerError(null); setStreamKey(k => k + 1); }}
                  className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm rounded-xl font-bold transition-all shadow-lg shadow-primary/20"
                >
                  Retry
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-xl font-bold transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-8 z-10">
            <div className="flex items-center gap-3">
              {channel.logo && (
                <img src={channel.logo} alt="" className="w-9 h-9 rounded-xl bg-white/10 object-contain p-1" />
              )}
              <div>
                <h3 className="text-white font-bold text-sm">{channel.name}</h3>
                <p className="text-white/60 text-xs font-medium">
                  {channel.country_flag} {channel.group}
                  {channel.quality && ` · ${channel.quality}`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TvChannels() {
  const {
    channels,
    totalCount,
    filteredCount,
    hasMore,
    loadMore,
    refreshChannels,
    countries,
    categories,
    loading,
    error,
    dataSource,
    searchQuery,
    setSearchQuery,
    selectedCountry,
    setSelectedCountry,
    selectedCategory,
    setSelectedCategory,
    clearFilters,
    hasFilters,
  } = useTvChannels();

  const [playingChannel, setPlayingChannel] = useState<TvChannel | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || loading) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const onSearchChange = useCallback(
    (value: string) => {
      setLocalSearch(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setSearchQuery(value), 300);
    },
    [setSearchQuery]
  );

  if (loading && channels.length === 0) {
    return (
      <MainLayout>
        <div className="max-w-6xl mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">Loading channels...</p>
        </div>
      </MainLayout>
    );
  }

  if (error && channels.length === 0) {
    return (
      <MainLayout>
        <div className="max-w-6xl mx-auto px-4 py-20 text-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-destructive/10 to-destructive/5 flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-10 h-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-black mb-2">Failed to load channels</h1>
          <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto font-medium">{error}</p>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={() => refreshChannels()} className="h-11 px-6 rounded-xl font-bold shadow-lg shadow-primary/20">Retry</Button>
            <Button variant="outline" onClick={() => window.history.back()} className="h-11 px-6 rounded-xl font-bold border-border/60">
              Go Back
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 pb-24">
        {/* Hero Header */}
        <div className="relative overflow-hidden mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/8 blur-[100px] rounded-full animate-pulse" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-accent/8 blur-[80px] rounded-full" />

          <div className="relative pt-8 pb-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
                  <Radio className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl md:text-5xl font-black tracking-tight">Live TV</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-muted-foreground text-sm font-medium">
                      {totalCount.toLocaleString()} live channels
                    </p>
                    {dataSource !== 'default' && !loading && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-bold flex items-center gap-1 border border-emerald-500/20">
                        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                        Live
                      </span>
                    )}
                    {dataSource === 'default' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20">
                        Verified
                      </span>
                    )}
                    {loading && dataSource !== 'default' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-bold flex items-center gap-1 border border-blue-500/20">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" /> Updating
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => refreshChannels()}
                disabled={loading}
                className="h-10 px-4 rounded-xl bg-card border border-border/60 text-sm font-bold flex items-center gap-1.5 hover:border-primary/30 hover:shadow-md transition-all disabled:opacity-50 shadow-sm"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search channels..."
              value={localSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 h-11 rounded-2xl bg-card border border-border/60 focus:border-primary/50 shadow-sm font-medium"
            />
          </div>

          <Select value={selectedCountry || '__all__'} onValueChange={(v) => setSelectedCountry(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-full sm:w-48 h-11 rounded-2xl border-border/60 shadow-sm font-medium">
              <Globe className="h-4 w-4 mr-2 shrink-0" />
              <SelectValue placeholder="All Countries" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-border/60">
              <SelectItem value="__all__">All Countries</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.flag} {c.name} ({c.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedCategory || '__all__'} onValueChange={(v) => setSelectedCategory(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-full sm:w-48 h-11 rounded-2xl border-border/60 shadow-sm font-medium">
              <Tag className="h-4 w-4 mr-2 shrink-0" />
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-border/60">
              <SelectItem value="__all__">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Active filters */}
        {hasFilters && (
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-muted-foreground font-bold">
              {filteredCount.toLocaleString()} results
            </span>
            <button onClick={clearFilters} className="text-xs text-primary font-bold hover:underline">
              Clear filters
            </button>
          </div>
        )}

        {/* Channel grid */}
        {channels.length === 0 ? (
          <div className="py-24 text-center bg-card border border-border/60 rounded-3xl">
            <div className="w-20 h-20 bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl flex items-center justify-center mx-auto mb-5">
              <Tv className="h-10 w-10 text-primary/60" />
            </div>
            <h2 className="text-xl font-black mb-2">No channels found</h2>
            <p className="text-sm text-muted-foreground font-medium">Try adjusting your search or filters</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {channels.map((channel) => (
                <ChannelCard
                  key={channel.id}
                  channel={channel}
                  onPlay={setPlayingChannel}
                />
              ))}
            </div>

            {/* Load more sentinel */}
            <div ref={sentinelRef} className="py-10 flex justify-center">
              {hasMore ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading more channels...
                </div>
              ) : (
                <p className="text-xs text-muted-foreground font-bold">
                  Showing all {filteredCount.toLocaleString()} channels
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {playingChannel && (
        <ChannelPlayer channel={playingChannel} onClose={() => setPlayingChannel(null)} />
      )}
    </MainLayout>
  );
}
