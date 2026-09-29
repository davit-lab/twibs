import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useReels } from '@/hooks/useReels';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useMusicLibrary, MusicTrack } from '@/hooks/useMusicLibrary';
import {
  Loader2, Upload, X, Play, Music, Image, ChevronLeft, ChevronRight,
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
        video.currentTime = duration / (frames * 2);
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
    } catch (error: unknown) {
      console.error('Camera error:', error);
      setCameraError(error instanceof Error ? error.message : 'Failed to access camera');
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
    } catch (error: unknown) {
      console.error('Camera error:', error);
      setCameraError(error instanceof Error ? error.message : 'Failed to access camera');
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

  useEffect(() => {
    if (cameraVideoRef.current && cameraStream) {
      cameraVideoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
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
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload music.',
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

  const selectThumbnail = (index: number) => {
    setSelectedThumbnail(`auto-${index}`);
    const video = videoRef.current;
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      video.pause();
      setIsPlaying(false);
      video.currentTime = (video.duration / 6) * (index + 0.5);
    }
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
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload reel.',
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
      <DialogContent
        hideCloseButton
        className="grid h-[100dvh] max-h-[100dvh] w-full max-w-none grid-rows-[auto_1fr_auto] gap-0 overflow-hidden rounded-none border-0 bg-[#090909] p-0 text-white shadow-none sm:h-[94dvh] sm:max-h-[900px] sm:w-[min(94vw,980px)] sm:rounded-[28px] sm:border sm:border-white/10 sm:shadow-2xl"
      >
        <DialogTitle className="sr-only">Create reel</DialogTitle>
        <DialogDescription className="sr-only">Upload or record a video, choose its cover and sound, then publish it as a reel.</DialogDescription>

        <header className="flex h-14 items-center justify-between border-b border-white/[0.07] px-3 sm:px-4">
          <div className="flex min-w-10 items-center">
            {stage !== 'create' && (
              <button
                type="button"
                onClick={() => setStage(stage === 'publish' ? 'details' : 'create')}
                disabled={uploading}
                aria-label="Back"
                className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/10 disabled:opacity-40"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
          </div>
          <div className="text-center">
            <h2 className="text-[15px] font-semibold tracking-tight">
              {stage === 'create' ? 'New reel' : stage === 'details' ? 'Edit reel' : 'Share reel'}
            </h2>
            {stage !== 'publish' && <p className="text-[10px] text-zinc-500">{stage === 'create' ? 'Up to 60 seconds' : 'Preview and finish'}</p>}
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <main className="min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain">
          {stage === 'create' && (
            <div className="flex min-h-full flex-col items-center px-4 py-4 sm:justify-center sm:py-6">
              <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileSelect} className="hidden" />

              <div
                className="relative aspect-[9/16] max-h-[65vh] w-full max-w-[330px] overflow-hidden rounded-[26px] bg-[#161616] shadow-[0_28px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/10"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files?.[0];
                  if (file) acceptVideoFile(file);
                }}
              >
                {uploadMode === 'record' ? (
                  <>
                    {cameraStream ? (
                      <video ref={cameraVideoRef} autoPlay playsInline muted className={cn('absolute inset-0 h-full w-full object-cover', facingMode === 'user' && '-scale-x-100')} />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-white/55">
                        {cameraError ? <><Camera className="h-8 w-8" /><p className="text-sm">{cameraError}</p></> : <Loader2 className="h-7 w-7 animate-spin" />}
                      </div>
                    )}

                    <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/50 to-transparent" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/60 to-transparent" />

                    {isRecording && (
                      <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold backdrop-blur-xl">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                        {formatTime(recordingTime)} <span className="text-white/50">/ 1:00</span>
                      </div>
                    )}

                    {cameraStream && !isRecording && (
                      <button type="button" onClick={switchCamera} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-xl" aria-label="Switch camera">
                        <SwitchCamera className="h-5 w-5" />
                      </button>
                    )}

                    {cameraStream && (
                      <button
                        type="button"
                        onClick={isRecording ? stopRecording : startRecording}
                        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                        className="absolute bottom-5 left-1/2 flex h-[74px] w-[74px] -translate-x-1/2 items-center justify-center rounded-full border-[3px] border-white bg-white/15 shadow-xl backdrop-blur transition active:scale-95"
                      >
                        {isRecording ? <Square className="h-7 w-7 fill-red-500 text-red-500" /> : <Circle className="h-14 w-14 fill-white text-white" />}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black">
                      <Video className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mt-5 text-xl font-semibold tracking-tight">Add a video</h3>
                    <p className="mt-2 max-w-[220px] text-xs leading-5 text-zinc-400">Choose a vertical video from your library or record one now.</p>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-6 h-11 rounded-full bg-white px-6 text-sm font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.98]">
                      Choose video
                    </button>
                    <p className="mt-3 text-[10px] text-zinc-600">MP4 or WebM · 60 sec · 100 MB</p>
                  </div>
                )}
              </div>

              <div className="mt-4 flex rounded-full border border-white/10 bg-white/[0.05] p-1">
                <button type="button" onClick={() => setUploadMode('upload')} className={cn('flex h-10 min-w-28 items-center justify-center gap-2 rounded-full px-4 text-xs font-semibold transition', uploadMode === 'upload' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white')}>
                  <Upload className="h-4 w-4" /> Library
                </button>
                <button type="button" onClick={() => setUploadMode('record')} className={cn('flex h-10 min-w-28 items-center justify-center gap-2 rounded-full px-4 text-xs font-semibold transition', uploadMode === 'record' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white')}>
                  <Camera className="h-4 w-4" /> Camera
                </button>
              </div>
            </div>
          )}

          {stage === 'details' && videoUrl && (
            <div className="grid min-w-0 gap-0 lg:min-h-full lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
              <section className="flex min-w-0 items-center justify-center bg-black px-4 py-3 lg:border-r lg:border-white/[0.07] lg:py-6">
                <div className="relative aspect-[9/16] w-[72vw] max-w-[280px] shrink-0 overflow-hidden rounded-[22px] bg-zinc-950 shadow-xl ring-1 ring-white/10 sm:w-[240px] lg:w-full lg:max-w-[310px] lg:rounded-[24px] lg:shadow-2xl">
                  <video ref={videoRef} src={videoUrl} className="absolute inset-0 h-full w-full object-contain" loop playsInline muted={isMuted} onLoadedMetadata={handleVideoLoaded} onClick={togglePlay} />
                  {!isPlaying && (
                    <button type="button" onClick={togglePlay} aria-label="Play video" className="absolute inset-0 flex items-center justify-center bg-black/10">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-xl"><Play className="ml-1 h-6 w-6 fill-current" /></span>
                    </button>
                  )}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                    <button type="button" onClick={() => { setIsPlaying(false); videoRef.current?.pause(); setIsMuted(value => !value); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 backdrop-blur-xl" aria-label={isMuted ? 'Unmute' : 'Mute'}>
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                    <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-medium backdrop-blur-xl"><Clock className="h-3.5 w-3.5" />{formatTime(videoDuration)}</span>
                  </div>
                  <audio ref={audioRef} className="hidden" loop />
                </div>
              </section>

              <section className="min-w-0 space-y-5 overflow-hidden border-t border-white/[0.07] px-4 py-4 sm:px-6 lg:overflow-y-auto lg:border-t-0 lg:px-8 lg:py-7">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between"><label className="text-sm font-semibold">Caption</label><span className="text-[11px] tabular-nums text-zinc-600">{caption.length}/220</span></div>
                  <Textarea placeholder="Write a caption…" value={caption} maxLength={220} onChange={(event) => setCaption(event.target.value)} rows={3} className="resize-none rounded-2xl border-white/10 bg-white/[0.04] text-white placeholder:text-zinc-600 focus-visible:ring-white/30" />
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between"><label className="text-sm font-semibold">Cover</label><span className="text-[11px] text-zinc-500">Choose a frame</span></div>
                  <div className="flex w-full max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {thumbnailOptions.map((thumbnail, index) => (
                      <button key={`auto-${index}`} type="button" onClick={() => selectThumbnail(index)} className={cn('relative aspect-[9/14] w-14 shrink-0 overflow-hidden rounded-lg transition', selectedThumbnail === `auto-${index}` ? 'ring-2 ring-white ring-offset-2 ring-offset-[#090909]' : 'opacity-65 hover:opacity-100')}>
                        <img src={thumbnail.url} alt={`Cover option ${index + 1}`} className="h-full w-full object-cover" />
                        {selectedThumbnail === `auto-${index}` && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-black"><Check className="h-3 w-3" /></span>}
                      </button>
                    ))}
                    {customThumbnail && (
                      <button type="button" onClick={() => setSelectedThumbnail('custom')} className={cn('relative aspect-[9/14] w-14 shrink-0 overflow-hidden rounded-lg', selectedThumbnail === 'custom' ? 'ring-2 ring-white ring-offset-2 ring-offset-[#090909]' : 'opacity-65')}><img src={customThumbnail.url} alt="Custom cover" className="h-full w-full object-cover" /></button>
                    )}
                    <input ref={thumbnailInputRef} type="file" accept="image/*" onChange={handleThumbnailSelect} className="hidden" />
                    <button type="button" onClick={() => thumbnailInputRef.current?.click()} className="flex aspect-[9/14] w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] text-[9px] text-zinc-400 hover:bg-white/[0.08]"><Image className="h-4 w-4" />Custom</button>
                  </div>
                </div>

                <div className="min-w-0 overflow-hidden">
                  <div className="mb-3 flex items-center justify-between">
                    <div><label className="text-sm font-semibold">Sound</label><p className="mt-0.5 text-[11px] text-zinc-500">Add music to your reel</p></div>
                    <input ref={musicInputRef} type="file" accept="audio/*" onChange={handleMusicUpload} className="hidden" />
                    <button type="button" disabled={uploadingMusic} onClick={() => musicInputRef.current?.click()} className="flex h-9 items-center gap-2 rounded-full border border-white/10 px-3 text-xs font-semibold text-zinc-300 hover:bg-white/10 disabled:opacity-50">
                      {uploadingMusic ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload sound
                    </button>
                  </div>

                  <div className="mb-3 flex w-fit rounded-full bg-white/[0.05] p-1">
                    {(['library', 'mine'] as const).map(tab => <button key={tab} type="button" onClick={() => setMusicTab(tab)} className={cn('h-8 rounded-full px-4 text-xs font-semibold capitalize transition', musicTab === tab ? 'bg-white text-black' : 'text-zinc-500 hover:text-white')}>{tab === 'mine' ? 'My sounds' : 'Library'}</button>)}
                  </div>

                  <div className="flex w-full max-w-full touch-pan-x gap-2 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {visibleTracks.map(track => (
                      <div key={track.id} className="group relative shrink-0">
                        <button type="button" onClick={() => setSelectedMusic(track.id)} className={cn('flex h-16 w-36 items-center gap-3 rounded-xl border px-3 text-left transition', selectedMusic === track.id ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]')}>
                          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', selectedMusic === track.id ? 'bg-black/10' : 'bg-white/10')}><Music className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold">{track.name}</span>
                          {selectedMusic === track.id && <Check className="h-4 w-4 shrink-0" />}
                        </button>
                        {track.isCustom && <button type="button" onClick={() => handleDeleteMusic(track)} aria-label={`Delete ${track.name}`} className="absolute -right-1 -top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex"><Trash2 className="h-3 w-3" /></button>}
                      </div>
                    ))}
                  </div>

                  {selectedMusicTrack && selectedMusicTrack.id !== 'none' && selectedMusicTrack.url && (
                    <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2"><Volume2 className="h-4 w-4 text-zinc-500" /><input type="range" min={0} max={100} value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} className="w-full accent-white" /><button type="button" onClick={() => setSelectedMusic('none')} className="text-xs font-medium text-zinc-400 hover:text-white">Remove</button></div>
                  )}
                </div>
              </section>
            </div>
          )}

          {stage === 'publish' && (
            <div className="flex min-h-full flex-col items-center justify-center px-6 py-10 text-center">
              <div className="relative aspect-[9/16] h-56 overflow-hidden rounded-[22px] bg-black shadow-2xl ring-1 ring-white/10">
                {videoUrl && <video src={videoUrl} muted className="absolute inset-0 h-full w-full object-cover" />}
                {uploading && <div className="absolute inset-0 flex items-center justify-center bg-black/35"><Loader2 className="h-8 w-8 animate-spin" /></div>}
                <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20"><div className="h-full bg-white transition-all duration-200" style={{ width: `${uploadProgress}%` }} /></div>
              </div>
              <h3 className="mt-6 text-xl font-semibold tracking-tight">{uploading ? uploadLabel : 'Your reel is ready'}</h3>
              <p className="mt-2 max-w-sm text-sm text-zinc-500">{uploading ? `${Math.round(uploadProgress)}% complete — keep this window open.` : 'Review complete. Share it when you are ready.'}</p>
              {!uploading && <button type="button" onClick={handlePublish} disabled={!canPublish} className="mt-6 flex h-12 min-w-40 items-center justify-center rounded-full bg-white px-7 text-sm font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.98]">Share reel</button>}
            </div>
          )}
        </main>

        {stage === 'details' && (
          <footer className="flex items-center justify-between border-t border-white/[0.07] bg-[#090909]/95 px-4 py-3 backdrop-blur-xl sm:px-6">
            <button type="button" onClick={resetToCreate} className="text-sm font-medium text-zinc-400 transition hover:text-white">Replace video</button>
            <button type="button" onClick={() => setStage('publish')} disabled={!videoFile} className="flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </footer>
        )}
      </DialogContent>
      <canvas ref={canvasRef} className="hidden" />
    </Dialog>
  );
}
