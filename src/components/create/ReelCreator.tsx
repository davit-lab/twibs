import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useReels } from '@/hooks/useReels';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useMusicLibrary, MusicTrack } from '@/hooks/useMusicLibrary';
import {
  Loader2, Upload, X, Play, Music, Image, ChevronLeft,
  Volume2, VolumeX, Check, Trash2, Video, Camera, SwitchCamera,
  Circle, Square, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReelCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Stage = 'create' | 'details' | 'publish';

const MAX_DURATION = 60;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_MUSIC_SIZE = 20 * 1024 * 1024;

export default function ReelCreator({ open, onOpenChange }: ReelCreatorProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { uploadReel } = useReels();
  const { toast } = useToast();
  const { tracks: musicTracks, refresh: refreshMusicTracks } = useMusicLibrary();

  const [stage, setStage] = useState<Stage>('create');
  const [uploadMode, setUploadMode] = useState<'upload' | 'record'>('upload');

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Video source
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const loadedUrlRef = useRef<string | null>(null);

  // Thumbnails
  const [thumbnailOptions, setThumbnailOptions] = useState<{ url: string; blob: Blob }[]>([]);
  const [selectedThumbnail, setSelectedThumbnail] = useState<string | null>(null);
  const [customThumbnail, setCustomThumbnail] = useState<{ url: string; blob: Blob } | null>(null);

  // Details
  const [caption, setCaption] = useState('');
  const [selectedMusic, setSelectedMusic] = useState('none');
  const [musicVolume, setMusicVolume] = useState(50);
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [musicTab, setMusicTab] = useState<'library' | 'mine'>('library');

  // Publish
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedMusicTrack = musicTracks.find(t => t.id === selectedMusic) || null;

  // Generate thumbnail candidates from the loaded video
  const generateThumbnails = useCallback(async (video: HTMLVideoElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const duration = video.duration;
    if (!duration || !isFinite(duration)) return;

    canvas.width = 540;
    canvas.height = 960;

    const frames = 6;
    const options: { url: string; blob: Blob }[] = [];
    const paintFrame = async (index: number) => {
      if (index >= frames) {
        video.currentTime = 0;
        setThumbnailOptions(options);
        setSelectedThumbnail(options.length > 0 ? 'auto-0' : 'none');
        return;
      }
      const time = (duration / frames) * (index + 0.5);
      await new Promise<void>((resolve) => {
        video.addEventListener('seeked', function onSeeked() {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        });
        video.currentTime = time;
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.7)
      );
      if (blob) {
        options.push({ url: URL.createObjectURL(blob), blob });
      }
      await paintFrame(index + 1);
    };

    if (video.readyState >= 2) {
      paintFrame(0);
    } else {
      video.addEventListener('canplay', () => paintFrame(0), { once: true });
    }
  }, []);

  const handleVideoLoaded = () => {
    const video = videoRef.current;
    if (!video || loadedUrlRef.current === videoUrl) return;
    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) {
      video.addEventListener('durationchange', handleVideoLoaded, { once: true });
      return;
    }
    loadedUrlRef.current = videoUrl;
    if (duration > MAX_DURATION) {
      toast({
        variant: 'destructive',
        title: 'Video is too long',
        description: `Reels are limited to ${MAX_DURATION} seconds. Please pick a shorter video.`,
      });
      resetToCreate();
      return;
    }
    setVideoDuration(duration);
    generateThumbnails(video);
  };

  const resetToCreate = () => {
    stopCamera();
    setStage('create');
    setUploadMode('upload');
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setVideoFile(null);
    setVideoDuration(0);
    loadedUrlRef.current = null;
    thumbnailOptions.forEach(t => URL.revokeObjectURL(t.url));
    setThumbnailOptions([]);
    setSelectedThumbnail(null);
    if (customThumbnail) URL.revokeObjectURL(customThumbnail.url);
    setCustomThumbnail(null);
    setCaption('');
    setSelectedMusic('none');
    setIsPlaying(false);
    setRecordingTime(0);
    setIsRecording(false);
    setCameraError(null);
    setUploadProgress(0);
    setUploadLabel('');
  };

  const handleClose = () => {
    resetToCreate();
    onOpenChange(false);
  };

  // ---- Video selection ----
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    acceptVideoFile(file);
  };

  const acceptVideoFile = (file: File) => {
    if (!file.type.startsWith('video/')) {
      toast({ variant: 'destructive', title: 'Invalid file type', description: 'Please select a video file.' });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 100MB.' });
      return;
    }
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setStage('details');
  };

  // ---- Recording ----
  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      });
      setCameraStream(stream);
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
      }
    } catch (error: any) {
      console.error('Camera error:', error);
      setCameraError(error.message || 'Failed to access camera');
      toast({
        variant: 'destructive',
        title: 'Camera access denied',
        description: 'Please allow camera access to record videos.',
      });
    }
  };

  const switchCamera = async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      });
      setCameraStream(stream);
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
      }
    } catch (error: any) {
      console.error('Camera error:', error);
      setCameraError(error.message || 'Failed to access camera');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (stage === 'create' && uploadMode === 'record') {
      startCamera();
    }
    return () => {
      if (stage === 'create' && uploadMode === 'record') {
        stopCamera();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, uploadMode]);

  const startRecording = () => {
    if (!cameraStream) return;
    setRecordingTime(0);

    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mimeType = candidates.find((c) => MediaRecorder.isTypeSupported(c)) || '';
    const mediaRecorder = new MediaRecorder(cameraStream, mimeType
      ? { mimeType, videoBitsPerSecond: 6_000_000 }
      : { videoBitsPerSecond: 6_000_000 });
    mediaRecorderRef.current = mediaRecorder;
    const chunks: Blob[] = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const type = mimeType || 'video/webm';
      const blob = new Blob(chunks, { type });
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `recording-${Date.now()}.${ext}`, { type });
      stopCamera();
      acceptVideoFile(file);
    };

    mediaRecorder.start(100);
    setIsRecording(true);
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime(prev => {
        if (prev >= MAX_DURATION) {
          stopRecording();
          return MAX_DURATION;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  // ---- Music ----
  const handleMusicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('audio/')) {
      toast({ variant: 'destructive', title: 'Invalid file type', description: 'Please select an audio file (MP3, WAV, etc.).' });
      return;
    }
    if (file.size > MAX_MUSIC_SIZE) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum music file size is 20MB.' });
      return;
    }

    setUploadingMusic(true);
    try {
      const fileName = `${user.id}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage
        .from('reel-music')
        .upload(fileName, file);
      if (error) throw error;
      toast({ title: 'Music uploaded!', description: 'Your track is now available.' });
      await refreshMusicTracks();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error.message || 'Failed to upload music.',
      });
    } finally {
      setUploadingMusic(false);
      if (musicInputRef.current) musicInputRef.current.value = '';
    }
  };

  const handleDeleteMusic = async (track: MusicTrack) => {
    if (!user || !track.isCustom) return;
    try {
      await supabase.storage.from('reel-music').remove([track.id]);
      await refreshMusicTracks();
      if (selectedMusic === track.id) setSelectedMusic('none');
      toast({ title: 'Track deleted', description: 'Music track has been removed.' });
    } catch (error) {
      console.error('Error deleting track:', error);
    }
  };

  // ---- Preview play / pause ----
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      audioRef.current?.pause();
    } else {
      video.play();
      const music = selectedMusicTrack;
      if (music && music.url && audioRef.current) {
        audioRef.current.src = music.url;
        audioRef.current.volume = Math.max(0, Math.min(1, musicVolume / 100));
        audioRef.current.currentTime = video.currentTime;
        audioRef.current.play();
      }
    }
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, musicVolume / 100));
    }
  }, [musicVolume]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = isMuted;
  }, [isMuted]);

  // ---- Custom thumbnail ----
  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid file type', description: 'Please select an image file.' });
      return;
    }
    if (customThumbnail) URL.revokeObjectURL(customThumbnail.url);
    const url = URL.createObjectURL(file);
    setCustomThumbnail({ url, blob: file });
    setSelectedThumbnail('custom');
  };

  const selectedThumbnailBlob = (): Blob | null => {
    if (selectedThumbnail === 'custom') return customThumbnail?.blob ?? null;
    if (selectedThumbnail?.startsWith('auto-')) {
      const idx = Number(selectedThumbnail.slice(5));
      return thumbnailOptions[idx]?.blob ?? null;
    }
    return null;
  };

  // ---- Publish ----
  const handlePublish = async () => {
    if (!videoFile || uploading) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadLabel('Uploading video…');
    try {
      await uploadReel(
        videoFile,
        {
          caption,
          duration: Math.round(videoDuration),
          isPublished: true,
          audioName: selectedMusicTrack && selectedMusicTrack.id !== 'none' ? selectedMusicTrack.name : null,
          audioUrl: selectedMusicTrack && selectedMusicTrack.id !== 'none' ? selectedMusicTrack.url : null,
          thumbnailBlob: selectedThumbnailBlob(),
        },
        (progress) => {
          setUploadProgress(progress);
          if (progress >= 55 && progress < 95) setUploadLabel('Adding cover');
          else if (progress >= 95) setUploadLabel('Publishing…');
        }
      );
      setUploadLabel('Done');
      toast({ title: 'Reel posted!', description: 'Your reel is now live.' });
      resetToCreate();
      onOpenChange(false);
      navigate('/reels');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error.message || 'Failed to upload reel.',
      });
    } finally {
      setUploading(false);
    }
  };

  const visibleTracks = musicTracks.filter((t) => {
    if (t.id === 'none') return true;
    if (musicTab === 'library') return t.scope === 'library';
    return t.scope === 'mine';
  });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const canPublish = !!videoFile && !uploading;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent hideCloseButton className="grid max-w-3xl max-h-[90vh] p-0 gap-0 overflow-hidden grid-rows-[auto_1fr_auto]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/60">
            <div className="flex items-center gap-2">
              {stage !== 'create' ? (
                <Button variant="ghost" size="icon" onClick={() => setStage(stage === 'publish' ? 'details' : 'create')} aria-label="Back">
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              ) : (
                <span className="w-9" />
              )}
              <h2 className="text-lg font-black tracking-tight">
                {stage === 'create' ? 'Create reel' : stage === 'details' ? 'Details' : 'Publishing'}
              </h2>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <div className="p-5">
              {/* Stage: pick / record */}
              {stage === 'create' && (
                <div className="space-y-4">
                  <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as 'upload' | 'record')} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="upload" className="gap-2"><Upload className="h-4 w-4" /> Upload</TabsTrigger>
                      <TabsTrigger value="record" className="gap-2"><Video className="h-4 w-4" /> Record</TabsTrigger>
                    </TabsList>

                    <TabsContent value="upload" className="pt-4">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const file = e.dataTransfer.files?.[0];
                          if (file) acceptVideoFile(file);
                        }}
                        className="w-full h-56 rounded-2xl border-2 border-dashed border-border/70 bg-surface-2/40 flex flex-col items-center justify-center gap-3 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer"
                      >
                        <span className="grid place-items-center w-14 h-14 rounded-2xl bg-surface-2">
                          <Upload className="h-6 w-6" />
                        </span>
                        <span className="text-sm font-semibold">Choose a video to upload</span>
                        <span className="text-xs">MP4, WebM · up to {MAX_DURATION}s · max 100MB</span>
                      </button>
                    </TabsContent>

                    <TabsContent value="record" className="pt-4">
                      <div className="relative aspect-[9/16] max-h-[70vh] sm:max-h-[520px] mx-auto rounded-2xl overflow-hidden bg-black border border-border/60">
                        {cameraStream ? (
                          <video
                            ref={cameraVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 gap-3">
                            {cameraError ? (
                              <>
                                <Camera className="h-8 w-8" />
                                <p className="text-sm px-6 text-center">{cameraError}</p>
                              </>
                            ) : (
                              <Loader2 className="h-8 w-8 animate-spin" />
                            )}
                          </div>
                        )}

                        {isRecording && (
                          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur px-3 py-1.5 rounded-full text-white text-xs font-bold">
                            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                            {formatTime(recordingTime)}
                            <span className="text-white/60">/ {MAX_DURATION}s</span>
                          </div>
                        )}

                        {cameraStream && !isRecording && (
                          <button
                            onClick={switchCamera}
                            className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 transition-colors"
                            aria-label="Switch camera"
                          >
                            <SwitchCamera className="h-4 w-4" />
                          </button>
                        )}

                        {cameraStream && (
                          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                            {isRecording ? (
                              <button
                                onClick={stopRecording}
                                className="flex items-center gap-2 rounded-full bg-red-500 text-white font-bold text-sm px-5 py-2.5 hover:bg-red-600 transition-colors shadow-lg"
                              >
                                <Square className="h-4 w-4 fill-current" />
                                Stop
                              </button>
                            ) : (
                              <button
                                onClick={startRecording}
                                className="flex items-center gap-2 rounded-full bg-white text-black font-bold text-sm px-5 py-2.5 hover:bg-white/90 transition-colors shadow-lg"
                              >
                                <Circle className="h-4 w-4 fill-current text-red-500" />
                                Record
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <p className="text-center text-xs text-muted-foreground mt-3">
                        Recordings are limited to {MAX_DURATION} seconds.
                      </p>
                    </TabsContent>
                  </Tabs>
                </div>
              )}

              {/* Stage: details */}
              {stage === 'details' && videoUrl && (
                <div className="grid gap-5 sm:grid-cols-[minmax(0,17rem)_1fr]">
                  {/* Preview */}
                  <div className="space-y-3">
                    <div className="grid place-items-center rounded-2xl overflow-hidden bg-black border border-border/60 max-h-[46vh] sm:max-h-none">
                      <div className="relative aspect-[9/16] max-h-[46vh] sm:max-h-none">
                      <video
                        ref={videoRef}
                        src={videoUrl}
                        className="absolute inset-0 h-full w-full object-cover"
                        loop
                        playsInline
                        muted={isMuted}
                        onLoadedMetadata={handleVideoLoaded}
                        onClick={togglePlay}
                      />
                      {!isPlaying && (
                        <div className="absolute inset-0 grid place-items-center pointer-events-none">
                          <span className="grid place-items-center h-16 w-16 rounded-full bg-black/55 backdrop-blur text-white">
                            <Play className="h-7 w-7 ml-1" fill="currentColor" />
                          </span>
                        </div>
                      )}
                      <div className="absolute bottom-3 left-3 flex items-center gap-2">
                        <button
                          onClick={() => { setIsPlaying(false); videoRef.current?.pause(); setIsMuted(m => !m); }}
                          aria-label={isMuted ? 'Unmute' : 'Mute'}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 transition-colors"
                        >
                          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </button>
                        <span className="rounded-full bg-black/55 backdrop-blur px-2.5 py-1 text-[11px] font-semibold text-white/90 flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatTime(videoDuration)}
                        </span>
                      </div>
                      <audio ref={audioRef} className="hidden" loop />
                    </div>
                    </div>
                  </div>

                  {/* Details form */}
                  <div className="space-y-5">
                    <div>
                      <label className="text-sm font-semibold mb-2 block">Caption</label>
                      <Textarea
                        placeholder="Write a caption…"
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        rows={2}
                        className="resize-none"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-semibold mb-2 block">Cover</label>
                      <div className="flex gap-2 flex-wrap">
                        {thumbnailOptions.map((t, i) => (
                          <button
                            key={`auto-${i}`}
                            onClick={() => setSelectedThumbnail(`auto-${i}`)}
                            className={cn(
                              'relative w-16 h-24 rounded-lg overflow-hidden border-2 transition-all',
                              selectedThumbnail === `auto-${i}`
                                ? 'border-primary ring-2 ring-primary/30'
                                : 'border-transparent hover:border-border'
                            )}
                          >
                            <img src={t.url} alt="Thumbnail" className="w-full h-full object-cover" />
                          </button>
                        ))}
                        {customThumbnail && (
                          <button
                            onClick={() => setSelectedThumbnail('custom')}
                            className={cn(
                              'relative w-16 h-24 rounded-lg overflow-hidden border-2 transition-all',
                              selectedThumbnail === 'custom'
                                ? 'border-primary ring-2 ring-primary/30'
                                : 'border-transparent hover:border-border'
                            )}
                          >
                            <img src={customThumbnail.url} alt="Custom thumbnail" className="w-full h-full object-cover" />
                          </button>
                        )}
                        <input
                          ref={thumbnailInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleThumbnailSelect}
                          className="hidden"
                        />
                        <button
                          onClick={() => thumbnailInputRef.current?.click()}
                          className="w-16 h-24 rounded-lg border border-dashed border-border/70 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors text-[10px] font-semibold"
                        >
                          <Image className="h-4 w-4" />
                          Upload
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold">Music</label>
                        <input
                          ref={musicInputRef}
                          type="file"
                          accept="audio/*"
                          onChange={handleMusicUpload}
                          className="hidden"
                        />
                        <Button variant="outline" size="sm" disabled={uploadingMusic} onClick={() => musicInputRef.current?.click()}>
                          {uploadingMusic ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Music className="h-3.5 w-3.5 mr-1.5" />}
                          Upload track
                        </Button>
                      </div>

                      {selectedMusicTrack && selectedMusicTrack.id !== 'none' ? (
                        <div className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface p-3 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Music className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="text-sm font-semibold truncate">{selectedMusicTrack.name}</span>
                          </div>
                          <button
                            onClick={() => setSelectedMusic('none')}
                            className="text-muted-foreground hover:text-foreground flex-shrink-0"
                            aria-label="Remove music"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mb-2">No music selected.</p>
                      )}

                      {selectedMusicTrack && selectedMusicTrack.id !== 'none' && selectedMusicTrack.url && (
                        <div className="flex items-center gap-2 mb-2">
                          <Volume2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={musicVolume}
                            onChange={(e) => setMusicVolume(Number(e.target.value))}
                            className="w-full accent-[hsl(var(--primary))]"
                          />
                        </div>
                      )}

                      <Tabs value={musicTab} onValueChange={(v) => setMusicTab(v as 'library' | 'mine')} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="library">Library</TabsTrigger>
                          <TabsTrigger value="mine">My tracks</TabsTrigger>
                        </TabsList>
                        <TabsContent value={musicTab} className="pt-2">
                          <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                            {visibleTracks.map((track) => (
                              <div key={track.id}>
                                <button
                                  onClick={() => setSelectedMusic(track.id)}
                                  className={cn(
                                    'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors',
                                    selectedMusic === track.id
                                      ? 'bg-primary/10 text-foreground font-semibold'
                                      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                                  )}
                                >
                                  <span className="flex-1 truncate text-left">{track.name}</span>
                                  {selectedMusic === track.id && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                                </button>
                                {track.isCustom && (
                                  <button
                                    onClick={() => handleDeleteMusic(track)}
                                    className="w-full text-left pl-10 pt-0.5 text-[11px] text-muted-foreground/70 hover:text-destructive transition-colors flex items-center gap-1"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Delete track
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </TabsContent>
                      </Tabs>
                    </div>
                  </div>
                </div>
              )}

              {/* Stage: publish */}
              {stage === 'publish' && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="relative mb-6 h-32 w-24 rounded-2xl overflow-hidden bg-black">
                    {videoUrl && <video src={videoUrl} muted className="absolute inset-0 h-full w-full object-cover" />}
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
                      <div
                        className="h-full bg-white transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>

                  <div className="mb-4 flex items-center gap-2">
                    {uploading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                    <p className="font-bold">
                      {uploading ? uploadLabel : 'Ready to publish'}
                    </p>
                  </div>

                  {!uploading && (
                    <p className="text-sm text-muted-foreground max-w-xs mb-6">
                      {caption ? `"${caption.length > 48 ? caption.slice(0, 48) + '…' : caption}"` : 'No caption'} ·{' '}
                      {selectedMusicTrack && selectedMusicTrack.id !== 'none' ? selectedMusicTrack.name : 'No music'} ·{' '}
                      {formatTime(videoDuration)}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    {!uploading && (
                      <Button variant="outline" onClick={() => setStage('details')}>
                        Back to edit
                      </Button>
                    )}
                    <Button onClick={handlePublish} disabled={!canPublish}>
                      {uploading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {uploadLabel}
                        </>
                      ) : (
                        'Publish'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer / continue */}
          {stage === 'details' && (
            <div className="flex items-center justify-between gap-3 p-4 border-t border-border/60">
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={() => setStage('publish')} disabled={!videoFile}>
                Continue
                <ChevronLeft className="h-4 w-4 ml-2 rotate-180" />
              </Button>
            </div>
          )}
      </DialogContent>
      <canvas ref={canvasRef} className="hidden" />
    </Dialog>
  );
}