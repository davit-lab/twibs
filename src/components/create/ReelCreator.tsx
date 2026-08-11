import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useReels } from '@/hooks/useReels';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMusicLibrary, MusicTrack } from '@/hooks/useMusicLibrary';
import { 
  Loader2, Upload, X, Play, Pause, Scissors, Palette, Music, 
  Image, ChevronLeft, ChevronRight, Volume2, VolumeX, Check,
  Sparkles, Type, Smile, Pencil, Gauge, RotateCcw, Trash2,
  Move, Plus, FastForward, Rewind, Zap, Video, Camera, SwitchCamera,
  Circle, Square, Timer
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReelCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'upload' | 'trim' | 'effects' | 'overlays' | 'filter' | 'music' | 'thumbnail' | 'caption';

// Overlay types
interface TextOverlay {
  id: string;
  type: 'text';
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily: string;
}

interface StickerOverlay {
  id: string;
  type: 'sticker';
  emoji: string;
  x: number;
  y: number;
  size: number;
}

type Overlay = TextOverlay | StickerOverlay;

const FILTERS = [
  { id: 'none', name: 'Original', css: '' },
  { id: 'grayscale', name: 'B&W', css: 'grayscale(100%)' },
  { id: 'sepia', name: 'Sepia', css: 'sepia(80%)' },
  { id: 'saturate', name: 'Vivid', css: 'saturate(150%)' },
  { id: 'contrast', name: 'Contrast', css: 'contrast(120%)' },
  { id: 'brightness', name: 'Bright', css: 'brightness(120%)' },
  { id: 'warm', name: 'Warm', css: 'sepia(30%) saturate(140%)' },
  { id: 'cool', name: 'Cool', css: 'hue-rotate(180deg) saturate(80%)' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(40%) contrast(90%) brightness(90%)' },
  { id: 'dramatic', name: 'Dramatic', css: 'contrast(130%) brightness(90%)' },
  { id: 'fade', name: 'Fade', css: 'contrast(90%) brightness(110%) saturate(80%)' },
  { id: 'noir', name: 'Noir', css: 'grayscale(100%) contrast(120%)' },
];

const STICKERS = [
  '😀', '😂', '🥰', '😎', '🤩', '🥳', '😍', '🤔',
  '🔥', '❤️', '💯', '✨', '⭐', '🎉', '🎊', '💪',
  '👍', '👏', '🙌', '💖', '💕', '🌟', '⚡', '🎵',
  '🎬', '📸', '🎭', '🎪', '🎨', '🎤', '🎸', '🎹',
];

const TEXT_COLORS = [
  '#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF',
  '#FFFF00', '#FF00FF', '#00FFFF', '#FF6B6B', '#4ECDC4',
  '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8',
];

const FONT_FAMILIES = [
  { id: 'sans', name: 'Sans', value: 'ui-sans-serif, system-ui, sans-serif' },
  { id: 'serif', name: 'Serif', value: 'ui-serif, Georgia, serif' },
  { id: 'mono', name: 'Mono', value: 'ui-monospace, monospace' },
  { id: 'cursive', name: 'Script', value: 'cursive' },
];

export default function ReelCreator({ open, onOpenChange }: ReelCreatorProps) {
  const { user } = useAuth();
  const { uploadReel } = useReels();
  const { toast } = useToast();
  const { tracks: musicTracks, refresh: refreshMusicTracks } = useMusicLibrary();
  
  // Step management
  const [step, setStep] = useState<Step>('upload');
  const [uploadMode, setUploadMode] = useState<'upload' | 'record'>('upload');
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Video state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  
  // Trim state
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(60);
  
  // Effects state
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isReversed, setIsReversed] = useState(false);
  
  // Overlays state
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [newTextValue, setNewTextValue] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [textFontSize, setTextFontSize] = useState(24);
  const [textFontFamily, setTextFontFamily] = useState(FONT_FAMILIES[0].value);
  const [overlayTab, setOverlayTab] = useState<'text' | 'stickers'>('text');
  
  // Filter state
  const [selectedFilter, setSelectedFilter] = useState('none');
  
  // Music state
  const [selectedMusic, setSelectedMusic] = useState('none');
  const [musicVolume, setMusicVolume] = useState(50);
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [musicTab, setMusicTab] = useState<'library' | 'mine'>('library');
  
  // Thumbnail state
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedThumbnail, setSelectedThumbnail] = useState(0);
  const [customThumbnail, setCustomThumbnail] = useState<string | null>(null);
  
  // Caption
  const [caption, setCaption] = useState('');
  
  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Dragging state
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Apply music volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, musicVolume / 100));
    }
  }, [musicVolume, selectedMusic]);

  // Generate thumbnails from video
  const generateThumbnails = useCallback(async (video: HTMLVideoElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const thumbs: string[] = [];
    const duration = video.duration;
    const numThumbs = Math.min(8, Math.floor(duration));
    
    canvas.width = 160;
    canvas.height = 284;
    
    for (let i = 0; i < numThumbs; i++) {
      const time = (duration / numThumbs) * i;
      video.currentTime = time;
      await new Promise(resolve => {
        video.onseeked = resolve;
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      thumbs.push(canvas.toDataURL('image/jpeg', 0.7));
    }
    
    video.currentTime = 0;
    setThumbnails(thumbs);
  }, []);

  // Handle video file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please select a video file.',
      });
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Maximum file size is 100MB.',
      });
      return;
    }

    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setStep('trim');
  };

  // Handle music upload
  const handleMusicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('audio/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please select an audio file (MP3, WAV, etc.).',
      });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Maximum music file size is 20MB.',
      });
      return;
    }

    setUploadingMusic(true);
    try {
      const fileName = `${user.id}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage
        .from('reel-music')
        .upload(fileName, file);

      if (error) throw error;

      toast({
        title: 'Music uploaded!',
        description: 'Your track is now available.',
      });

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

  // Delete custom music track
  const handleDeleteMusic = async (track: MusicTrack) => {
    if (!user || !track.isCustom) return;

    try {
      // For custom tracks we store the storage path as the id: `${user.id}/${file.name}`
      await supabase.storage.from('reel-music').remove([track.id]);
        await refreshMusicTracks();
        if (selectedMusic === track.id) setSelectedMusic('none');
        toast({
          title: 'Track deleted',
          description: 'Music track has been removed.',
        });
    } catch (error) {
      console.error('Error deleting track:', error);
    }
  };

  // Handle video metadata loaded
  const handleVideoLoaded = () => {
    if (videoRef.current) {
      const duration = videoRef.current.duration;
      setVideoDuration(duration);
      setTrimEnd(Math.min(60, duration));
      generateThumbnails(videoRef.current);
    }
  };

  // Handle thumbnail file selection
  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    const url = URL.createObjectURL(file);
    setCustomThumbnail(url);
  };

  // Play/pause toggle
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        audioRef.current?.pause();
      } else {
        videoRef.current.play();
        if (selectedMusic !== 'none' && audioRef.current) {
          audioRef.current.currentTime = videoRef.current.currentTime;
          audioRef.current.play();
        }
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Update playback speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Update current time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.currentTime >= trimEnd) {
        video.currentTime = trimStart;
        if (audioRef.current) audioRef.current.currentTime = trimStart;
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [trimStart, trimEnd]);

  // Seek to trim start when trim changes
  useEffect(() => {
    if (videoRef.current && step === 'trim') {
      videoRef.current.currentTime = trimStart;
    }
  }, [trimStart, step]);

  // Camera recording functions
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

  const switchCamera = async () => {
    stopCamera();
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  useEffect(() => {
    if (uploadMode === 'record' && step === 'upload') {
      startCamera();
    }
    return () => {
      if (uploadMode === 'record') {
        stopCamera();
      }
    };
  }, [uploadMode, facingMode]);

  useEffect(() => {
    if (step !== 'upload') {
      stopCamera();
    }
  }, [step]);

  const startRecording = () => {
    if (!cameraStream) return;

    setRecordedChunks([]);
    setRecordingTime(0);

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const mediaRecorder = new MediaRecorder(cameraStream, { mimeType });
    mediaRecorderRef.current = mediaRecorder;

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const file = new File([blob], `recording-${Date.now()}.webm`, { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      setVideoFile(file);
      setVideoUrl(url);
      setRecordedChunks([]);
      stopCamera();
      setStep('trim');
    };

    mediaRecorder.start(100);
    setIsRecording(true);

    // Start timer
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime(prev => {
        if (prev >= 60) {
          stopRecording();
          return 60;
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

  // Add text overlay
  const addTextOverlay = () => {
    if (!newTextValue.trim()) return;
    
    const newOverlay: TextOverlay = {
      id: `text-${Date.now()}`,
      type: 'text',
      text: newTextValue,
      x: 50,
      y: 50,
      fontSize: textFontSize,
      color: textColor,
      fontFamily: textFontFamily,
    };
    
    setOverlays([...overlays, newOverlay]);
    setNewTextValue('');
    setSelectedOverlayId(newOverlay.id);
  };

  // Add sticker overlay
  const addStickerOverlay = (emoji: string) => {
    const newOverlay: StickerOverlay = {
      id: `sticker-${Date.now()}`,
      type: 'sticker',
      emoji,
      x: 50,
      y: 50,
      size: 48,
    };
    
    setOverlays([...overlays, newOverlay]);
    setSelectedOverlayId(newOverlay.id);
  };

  // Remove overlay
  const removeOverlay = (id: string) => {
    setOverlays(overlays.filter(o => o.id !== id));
    if (selectedOverlayId === id) setSelectedOverlayId(null);
  };

  // Handle overlay drag
  const handleOverlayMouseDown = (e: React.MouseEvent, overlayId: string) => {
    e.preventDefault();
    const container = previewContainerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const overlay = overlays.find(o => o.id === overlayId);
    if (!overlay) return;
    
    const currentX = (overlay.x / 100) * rect.width;
    const currentY = (overlay.y / 100) * rect.height;
    
    setDragging(overlayId);
    setDragOffset({
      x: e.clientX - rect.left - currentX,
      y: e.clientY - rect.top - currentY,
    });
    setSelectedOverlayId(overlayId);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging || !previewContainerRef.current) return;
    
    const container = previewContainerRef.current;
    const rect = container.getBoundingClientRect();
    
    const newX = ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100;
    const newY = ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100;
    
    setOverlays(overlays.map(o => 
      o.id === dragging 
        ? { ...o, x: Math.max(0, Math.min(100, newX)), y: Math.max(0, Math.min(100, newY)) }
        : o
    ));
  }, [dragging, dragOffset, overlays]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  // Get current filter CSS
  const getFilterStyle = () => {
    const filter = FILTERS.find(f => f.id === selectedFilter);
    return filter?.css || '';
  };

  // Upload the reel
  const handleUpload = async () => {
    if (!videoFile) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      await uploadReel(
        videoFile,
        caption,
        {
          duration: Math.round(Math.max(0, trimEnd - trimStart)),
          isPublished: true,
          audioName: selectedMusicTrack && selectedMusicTrack.id !== 'none' ? selectedMusicTrack.name : null,
          audioUrl: selectedMusicTrack && selectedMusicTrack.id !== 'none' ? selectedMusicTrack.url : null,
        },
        (progress) => {
          setUploadProgress(progress);
        }
      );

      clearInterval(progressInterval);
      setUploadProgress(100);

      toast({
        title: 'Reel posted! 🎬',
        description: 'Your reel is now live.',
      });

      handleClose();
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

  // Reset and close
  const handleClose = () => {
    stopCamera();
    stopRecording();
    setStep('upload');
    setUploadMode('upload');
    setVideoFile(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setVideoDuration(0);
    setTrimStart(0);
    setTrimEnd(60);
    setPlaybackSpeed(1);
    setIsReversed(false);
    setOverlays([]);
    setSelectedOverlayId(null);
    setSelectedFilter('none');
    setSelectedMusic('none');
    setThumbnails([]);
    setSelectedThumbnail(0);
    if (customThumbnail) URL.revokeObjectURL(customThumbnail);
    setCustomThumbnail(null);
    setCaption('');
    setIsPlaying(false);
    setRecordingTime(0);
    setIsRecording(false);
    setCameraError(null);
    onOpenChange(false);
  };

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Navigation
  const goToStep = (newStep: Step) => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    setStep(newStep);
  };

  const steps: Step[] = ['trim', 'effects', 'overlays', 'filter', 'music', 'thumbnail', 'caption'];
  const currentStepIndex = steps.indexOf(step);

  const nextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      goToStep(steps[currentStepIndex + 1]);
    }
  };

  const prevStep = () => {
    if (currentStepIndex > 0) {
      goToStep(steps[currentStepIndex - 1]);
    } else {
      goToStep('upload');
    }
  };

  const selectedMusicTrack = musicTracks.find(t => t.id === selectedMusic);

  const visibleTracks = musicTracks.filter((t) => {
    if (t.id === 'none') return true;
    if (musicTab === 'library') return t.scope === 'library';
    return t.scope === 'mine';
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              {step !== 'upload' && (
                <Button variant="ghost" size="icon" onClick={prevStep}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              )}
              <DialogTitle className="text-lg">
                {step === 'upload' && 'Create Reel'}
                {step === 'trim' && 'Trim Video'}
                {step === 'effects' && 'Video Effects'}
                {step === 'overlays' && 'Text & Stickers'}
                {step === 'filter' && 'Add Filter'}
                {step === 'music' && 'Add Music'}
                {step === 'thumbnail' && 'Choose Thumbnail'}
                {step === 'caption' && 'Add Caption'}
              </DialogTitle>
            </div>
            {step !== 'upload' && step !== 'caption' && (
              <Button variant="ghost" onClick={nextStep}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {step === 'caption' && (
              <Button 
                onClick={handleUpload} 
                disabled={uploading}
                className=""
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {uploadProgress}%
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Share
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Step indicators */}
          {step !== 'upload' && (
            <div className="flex justify-center gap-1 py-2 px-4 border-b bg-muted/30 overflow-x-auto">
              {steps.map((s, i) => (
                <button
                  key={s}
                  onClick={() => goToStep(s)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                    step === s
                      ? "bg-primary text-primary-foreground"
                      : i < currentStepIndex
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {s === 'trim' && <Scissors className="h-3 w-3" />}
                  {s === 'effects' && <Zap className="h-3 w-3" />}
                  {s === 'overlays' && <Type className="h-3 w-3" />}
                  {s === 'filter' && <Palette className="h-3 w-3" />}
                  {s === 'music' && <Music className="h-3 w-3" />}
                  {s === 'thumbnail' && <Image className="h-3 w-3" />}
                  {s === 'caption' && <Sparkles className="h-3 w-3" />}
                  <span className="hidden sm:inline capitalize">{s}</span>
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {/* Upload Step */}
            {step === 'upload' && (
              <div className="flex flex-col items-center justify-center min-h-[450px] p-6">
                {/* Mode toggle */}
                <div className="flex gap-2 mb-6">
                  <Button
                    variant={uploadMode === 'upload' ? 'default' : 'outline'}
                    onClick={() => {
                      setUploadMode('upload');
                      stopCamera();
                    }}
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Upload
                  </Button>
                  <Button
                    variant={uploadMode === 'record' ? 'default' : 'outline'}
                    onClick={() => setUploadMode('record')}
                    className="gap-2"
                  >
                    <Video className="h-4 w-4" />
                    Record
                  </Button>
                </div>

                {/* Upload mode */}
                {uploadMode === 'upload' && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full max-w-sm aspect-[9/16] rounded-2xl border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-4 transition-colors relative"
                  >
                    <div className="relative">
                        <div className="relative rounded-full p-[3px] bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 shadow-lg">
                          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center shadow-xl transition-transform duration-300 group-hover:scale-105">
                            <div className="absolute inset-0 rounded-full pointer-events-none">
                              <div className="absolute -top-1 left-0 w-full h-6 rounded-t-full bg-white/6 blur-sm" />
                            </div>
                            <Upload className="w-8 h-8 text-primary" />
                          </div>
                        </div>

                        {/* small plus overlay (handcrafted offset + soft glow) */}
                        <div className="absolute -right-1 -bottom-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center border-[1.5px] border-card text-white text-xs shadow-[0_6px_18px_rgba(137,78,239,0.18)] transform rotate-4">
                          <Plus className="w-3 h-3" />
                        </div>
                    </div>

                    <div className="text-center">
                      <p className="font-medium">Upload Video</p>
                      <p className="text-sm text-muted-foreground">MP4, MOV, WebM • Max 100MB</p>
                    </div>
                  </button>
                )}

                {/* Record mode */}
                {uploadMode === 'record' && (
                  <div className="w-full max-w-sm aspect-[9/16] rounded-2xl overflow-hidden bg-black relative">
                    {cameraError ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                        <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mb-4">
                          <Camera className="w-8 h-8 text-destructive" />
                        </div>
                        <p className="text-white font-medium mb-2">Camera access denied</p>
                        <p className="text-white/60 text-sm mb-4">{cameraError}</p>
                        <Button onClick={startCamera} variant="outline" size="sm">
                          Try Again
                        </Button>
                      </div>
                    ) : !cameraStream ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <Loader2 className="w-8 h-8 text-white animate-spin mb-2" />
                        <p className="text-white/60 text-sm">Starting camera...</p>
                      </div>
                    ) : (
                      <>
                        <video
                          ref={cameraVideoRef}
                          autoPlay
                          muted
                          playsInline
                          className="w-full h-full object-cover"
                          style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                        />

                        {/* Recording timer */}
                        {isRecording && (
                          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 ">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-white font-mono text-sm">
                              {formatTime(recordingTime)} / 1:00
                            </span>
                          </div>
                        )}

                        {/* Progress bar */}
                        {isRecording && (
                          <div className="absolute top-0 left-0 right-0 h-1 bg-white/20">
                            <div 
                              className="h-full bg-red-500 transition-all duration-1000"
                              style={{ width: `${(recordingTime / 60) * 100}%` }}
                            />
                          </div>
                        )}

                        {/* Camera controls */}
                        <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-6">
                          {/* Switch camera */}
                          <button
                            onClick={switchCamera}
                            disabled={isRecording}
                            className={cn(
                              "w-12 h-12 rounded-full bg-white/20  flex items-center justify-center transition-all",
                              isRecording ? "opacity-50" : "hover:bg-white/30"
                            )}
                          >
                            <SwitchCamera className="w-6 h-6 text-white" />
                          </button>

                          {/* Record button */}
                          <button
                            onClick={isRecording ? stopRecording : startRecording}
                            className={cn(
                              "w-20 h-20 rounded-full flex items-center justify-center transition-all",
                              isRecording
                                ? "bg-white"
                                : "bg-red-500 ring-4 ring-white/30 hover:ring-white/50"
                            )}
                          >
                            {isRecording ? (
                              <Square className="w-8 h-8 text-red-500 fill-red-500" />
                            ) : (
                              <Circle className="w-16 h-16 text-red-600 fill-red-600" />
                            )}
                          </button>

                          {/* Timer indicator */}
                          <div className="w-12 h-12 rounded-full bg-white/20  flex items-center justify-center">
                            <Timer className="w-6 h-6 text-white" />
                          </div>
                        </div>

                        {/* Recording instructions */}
                        {!isRecording && (
                          <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 text-center pointer-events-none">
                            <p className="text-white/80 text-sm font-medium drop-shadow-lg">
                              Tap to start recording
                            </p>
                            <p className="text-white/60 text-xs mt-1">
                              Max 60 seconds
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Video preview with editing */}
            {step !== 'upload' && videoUrl && (
              <div className="flex flex-col lg:flex-row gap-4 p-4">
                {/* Video preview */}
                <div className="flex-shrink-0 mx-auto">
                  <div 
                    ref={previewContainerRef}
                    className="relative w-[200px] aspect-[9/16] rounded-xl overflow-hidden bg-black"
                  >
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      className="w-full h-full object-cover"
                      style={{ 
                        filter: getFilterStyle(),
                        transform: isReversed ? 'scaleX(-1)' : 'none',
                      }}
                      onLoadedMetadata={handleVideoLoaded}
                      muted={isMuted || selectedMusic !== 'none'}
                      playsInline
                      loop
                    />
                    
                    {/* Overlays */}
                    {overlays.map((overlay) => (
                      <div
                        key={overlay.id}
                        className={cn(
                          "absolute cursor-move select-none",
                          selectedOverlayId === overlay.id && "ring-2 ring-primary ring-offset-1"
                        )}
                        style={{
                          left: `${overlay.x}%`,
                          top: `${overlay.y}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        onMouseDown={(e) => handleOverlayMouseDown(e, overlay.id)}
                      >
                        {overlay.type === 'text' ? (
                          <span
                            style={{
                              fontSize: `${overlay.fontSize}px`,
                              color: overlay.color,
                              fontFamily: overlay.fontFamily,
                              textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {overlay.text}
                          </span>
                        ) : (
                          <span style={{ fontSize: `${overlay.size}px` }}>
                            {overlay.emoji}
                          </span>
                        )}
                      </div>
                    ))}
                    
                    {/* Play/pause overlay */}
                    <button
                      onClick={togglePlay}
                      className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity"
                    >
                      <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                        {isPlaying ? (
                          <Pause className="h-6 w-6 text-white" />
                        ) : (
                          <Play className="h-6 w-6 text-white ml-1" />
                        )}
                      </div>
                    </button>

                    {/* Mute toggle */}
                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center"
                    >
                      {isMuted ? (
                        <VolumeX className="h-4 w-4 text-white" />
                      ) : (
                        <Volume2 className="h-4 w-4 text-white" />
                      )}
                    </button>

                    {/* Speed indicator */}
                    {playbackSpeed !== 1 && (
                      <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/50 text-white text-xs font-medium">
                        {playbackSpeed}x
                      </div>
                    )}

                    {/* Time display */}
                    <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/50 text-white text-xs">
                      {formatTime(currentTime)} / {formatTime(trimEnd - trimStart)}
                    </div>
                  </div>
                </div>

                {/* Controls panel */}
                <div className="flex-1 min-w-0">
                  <ScrollArea className="h-[350px] pr-2">
                    {/* Trim controls */}
                    {step === 'trim' && (
                      <div className="space-y-6">
                        <div>
                          <h3 className="font-medium mb-3 flex items-center gap-2">
                            <Scissors className="h-4 w-4" />
                            Trim Video
                          </h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Select the portion of your video (max 60 seconds)
                          </p>
                        </div>

                        <div className="space-y-4">
                          <div className="flex justify-between text-sm">
                            <span>Start: {formatTime(trimStart)}</span>
                            <span>End: {formatTime(trimEnd)}</span>
                          </div>
                          
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Start time</label>
                            <Slider
                              value={[trimStart]}
                              min={0}
                              max={Math.max(0, trimEnd - 1)}
                              step={0.1}
                              onValueChange={([value]) => setTrimStart(value)}
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">End time</label>
                            <Slider
                              value={[trimEnd]}
                              min={trimStart + 1}
                              max={Math.min(videoDuration, trimStart + 60)}
                              step={0.1}
                              onValueChange={([value]) => setTrimEnd(value)}
                            />
                          </div>

                          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <span className="text-sm">Duration</span>
                            <span className="font-medium">{formatTime(trimEnd - trimStart)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Effects controls */}
                    {step === 'effects' && (
                      <div className="space-y-6">
                        <div>
                          <h3 className="font-medium mb-1 flex items-center gap-2">
                            <Zap className="h-4 w-4" />
                            Video Effects
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Adjust speed and apply effects
                          </p>
                        </div>

                        {/* Playback Speed */}
                        <div className="space-y-3">
                          <label className="text-sm font-medium flex items-center gap-2">
                            <Gauge className="h-4 w-4" />
                            Playback Speed
                          </label>
                          <div className="grid grid-cols-5 gap-2">
                            {[0.25, 0.5, 1, 1.5, 2].map((speed) => (
                              <Button
                                key={speed}
                                variant={playbackSpeed === speed ? "default" : "outline"}
                                size="sm"
                                onClick={() => setPlaybackSpeed(speed)}
                                className="text-xs"
                              >
                                {speed}x
                              </Button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Rewind className="h-4 w-4" />
                            <span>Slow motion</span>
                            <span className="mx-2">—</span>
                            <FastForward className="h-4 w-4" />
                            <span>Speed up</span>
                          </div>
                        </div>

                        {/* Mirror/Reverse */}
                        <div className="space-y-3">
                          <label className="text-sm font-medium flex items-center gap-2">
                            <RotateCcw className="h-4 w-4" />
                            Mirror Video
                          </label>
                          <Button
                            variant={isReversed ? "default" : "outline"}
                            onClick={() => setIsReversed(!isReversed)}
                            className="w-full"
                          >
                            {isReversed ? 'Mirrored' : 'Mirror Horizontally'}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Overlays controls */}
                    {step === 'overlays' && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-medium mb-1 flex items-center gap-2">
                            <Type className="h-4 w-4" />
                            Text & Stickers
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Add text and stickers, then drag to position
                          </p>
                        </div>

                        <Tabs value={overlayTab} onValueChange={(v) => setOverlayTab(v as 'text' | 'stickers')}>
                          <TabsList className="w-full">
                            <TabsTrigger value="text" className="flex-1">
                              <Type className="h-4 w-4 mr-2" />
                              Text
                            </TabsTrigger>
                            <TabsTrigger value="stickers" className="flex-1">
                              <Smile className="h-4 w-4 mr-2" />
                              Stickers
                            </TabsTrigger>
                          </TabsList>

                          <TabsContent value="text" className="space-y-4 mt-4">
                            <div className="flex gap-2">
                              <Input
                                placeholder="Enter text..."
                                value={newTextValue}
                                onChange={(e) => setNewTextValue(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addTextOverlay()}
                              />
                              <Button onClick={addTextOverlay} disabled={!newTextValue.trim()}>
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* Text styling */}
                            <div className="space-y-3">
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Color</label>
                                <div className="flex flex-wrap gap-1">
                                  {TEXT_COLORS.map((color) => (
                                    <button
                                      key={color}
                                      onClick={() => setTextColor(color)}
                                      className={cn(
                                        "w-6 h-6 rounded-full border-2 transition-all",
                                        textColor === color ? "border-primary scale-110" : "border-transparent"
                                      )}
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </div>
                              </div>

                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Size: {textFontSize}px</label>
                                <Slider
                                  value={[textFontSize]}
                                  min={12}
                                  max={48}
                                  step={2}
                                  onValueChange={([v]) => setTextFontSize(v)}
                                />
                              </div>

                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Font</label>
                                <div className="grid grid-cols-4 gap-1">
                                  {FONT_FAMILIES.map((font) => (
                                    <Button
                                      key={font.id}
                                      variant={textFontFamily === font.value ? "default" : "outline"}
                                      size="sm"
                                      onClick={() => setTextFontFamily(font.value)}
                                      className="text-xs"
                                      style={{ fontFamily: font.value }}
                                    >
                                      {font.name}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="stickers" className="mt-4">
                            <div className="grid grid-cols-8 gap-1">
                              {STICKERS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => addStickerOverlay(emoji)}
                                  className="w-8 h-8 flex items-center justify-center text-xl hover:bg-muted rounded transition-colors"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </TabsContent>
                        </Tabs>

                        {/* Active overlays */}
                        {overlays.length > 0 && (
                          <div className="space-y-2 pt-2 border-t">
                            <label className="text-xs text-muted-foreground">Active overlays</label>
                            {overlays.map((overlay) => (
                              <div 
                                key={overlay.id}
                                className={cn(
                                  "flex items-center justify-between p-2 rounded-lg",
                                  selectedOverlayId === overlay.id ? "bg-primary/10" : "bg-muted/50"
                                )}
                                onClick={() => setSelectedOverlayId(overlay.id)}
                              >
                                <div className="flex items-center gap-2">
                                  <Move className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm truncate max-w-[150px]">
                                    {overlay.type === 'text' ? overlay.text : overlay.emoji}
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeOverlay(overlay.id);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Filter controls */}
                    {step === 'filter' && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-medium mb-1 flex items-center gap-2">
                            <Palette className="h-4 w-4" />
                            Filters
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Choose a filter for your reel
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {FILTERS.map((filter) => (
                            <button
                              key={filter.id}
                              onClick={() => setSelectedFilter(filter.id)}
                              className={cn(
                                "relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all",
                                selectedFilter === filter.id
                                  ? "border-primary ring-2 ring-primary/20"
                                  : "border-transparent hover:border-border"
                              )}
                            >
                              <div 
                                className="absolute inset-0 bg-neutral-800/50"
                                style={{ filter: filter.css }}
                              />
                              <span className="absolute bottom-1 left-0 right-0 text-center text-xs font-medium text-white drop-shadow-md">
                                {filter.name}
                              </span>
                              {selectedFilter === filter.id && (
                                <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                  <Check className="h-3 w-3 text-white" />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Music controls */}
                    {step === 'music' && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-medium mb-1 flex items-center gap-2">
                            <Music className="h-4 w-4" />
                            Add Music
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Add background music to your reel
                          </p>
                        </div>

                        <Tabs value={musicTab} onValueChange={(v) => setMusicTab(v as any)}>
                          <TabsList className="w-full">
                            <TabsTrigger value="library" className="flex-1">Music Library</TabsTrigger>
                            <TabsTrigger value="mine" className="flex-1">My Uploads</TabsTrigger>
                          </TabsList>

                          <TabsContent value="library" className="mt-4">
                            <div className="space-y-2">
                              {visibleTracks.length === 0 ? (
                                <div className="text-sm text-muted-foreground p-3 bg-muted/40 rounded-lg">
                                  No library tracks yet.
                                </div>
                              ) : (
                                visibleTracks.map((track) => (
                                  <div
                                    key={track.id}
                                    className={cn(
                                      "flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer",
                                      selectedMusic === track.id
                                        ? "bg-primary/10 border border-primary/30"
                                        : "bg-muted/50 hover:bg-muted"
                                    )}
                                    onClick={() => setSelectedMusic(track.id)}
                                  >
                                    <div className={cn(
                                      "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                                      selectedMusic === track.id
                                        ? "bg-primary text-white"
                                        : "bg-muted-foreground/20"
                                    )}>
                                      <Music className="h-5 w-5" />
                                    </div>
                                    <span className="flex-1 text-left font-medium truncate">
                                      {track.name}
                                    </span>
                                    {selectedMusic === track.id && (
                                      <Check className="h-5 w-5 text-primary flex-shrink-0" />
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </TabsContent>

                          <TabsContent value="mine" className="mt-4 space-y-3">
                            {/* Upload music */}
                            <Button
                              variant="outline"
                              onClick={() => musicInputRef.current?.click()}
                              disabled={uploadingMusic}
                              className="w-full"
                            >
                              {uploadingMusic ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Upload className="h-4 w-4 mr-2" />
                                  Upload Music
                                </>
                              )}
                            </Button>

                            <div className="space-y-2">
                              {visibleTracks.map((track) => (
                            <div
                              key={track.id}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer",
                                selectedMusic === track.id
                                  ? "bg-primary/10 border border-primary/30"
                                  : "bg-muted/50 hover:bg-muted"
                              )}
                              onClick={() => setSelectedMusic(track.id)}
                            >
                              <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                                selectedMusic === track.id
                                  ? "bg-primary text-white"
                                  : "bg-muted-foreground/20"
                              )}>
                                <Music className="h-5 w-5" />
                              </div>
                              <span className="flex-1 text-left font-medium truncate">
                                {track.name}
                              </span>
                              {track.isCustom && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 flex-shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteMusic(track);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                              {selectedMusic === track.id && (
                                <Check className="h-5 w-5 text-primary flex-shrink-0" />
                              )}
                            </div>
                              ))}
                            </div>
                          </TabsContent>
                        </Tabs>

                        {selectedMusic !== 'none' && (
                          <div className="space-y-2 pt-2">
                            <div className="flex justify-between text-sm">
                              <span>Music Volume</span>
                              <span>{musicVolume}%</span>
                            </div>
                            <Slider
                              value={[musicVolume]}
                              min={0}
                              max={100}
                              step={5}
                              onValueChange={([value]) => setMusicVolume(value)}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Thumbnail controls */}
                    {step === 'thumbnail' && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-medium mb-1 flex items-center gap-2">
                            <Image className="h-4 w-4" />
                            Cover Photo
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Choose a thumbnail for your reel
                          </p>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                          {thumbnails.map((thumb, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                setSelectedThumbnail(i);
                                setCustomThumbnail(null);
                              }}
                              className={cn(
                                "relative aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all",
                                selectedThumbnail === i && !customThumbnail
                                  ? "border-primary ring-2 ring-primary/20"
                                  : "border-transparent hover:border-border"
                              )}
                            >
                              <img
                                src={thumb}
                                alt={`Thumbnail ${i + 1}`}
                                className="w-full h-full object-cover"
                              />
                              {selectedThumbnail === i && !customThumbnail && (
                                <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                  <Check className="h-2.5 w-2.5 text-white" />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>

                        <Button
                          variant="outline"
                          onClick={() => thumbnailInputRef.current?.click()}
                          className="w-full"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Custom Thumbnail
                        </Button>

                        {customThumbnail && (
                          <div className="relative w-20 aspect-[9/16] rounded-lg overflow-hidden border-2 border-primary ring-2 ring-primary/20">
                            <img
                              src={customThumbnail}
                              alt="Custom thumbnail"
                              className="w-full h-full object-cover"
                            />
                            <button
                              onClick={() => setCustomThumbnail(null)}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive flex items-center justify-center"
                            >
                              <X className="h-3 w-3 text-white" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Caption step */}
                    {step === 'caption' && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-medium mb-1 flex items-center gap-2">
                            <Sparkles className="h-4 w-4" />
                            Add Caption
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Write a caption for your reel
                          </p>
                        </div>

                        <Textarea
                          placeholder="Write something amazing..."
                          value={caption}
                          onChange={(e) => setCaption(e.target.value)}
                          className="resize-none h-32"
                          maxLength={2200}
                        />
                        
                        <div className="text-right text-sm text-muted-foreground">
                          {caption.length}/2200
                        </div>

                        {/* Summary */}
                        <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                          <h4 className="font-medium text-sm">Summary</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="text-muted-foreground">Duration:</div>
                            <div>{formatTime(trimEnd - trimStart)}</div>
                            <div className="text-muted-foreground">Speed:</div>
                            <div>{playbackSpeed}x</div>
                            <div className="text-muted-foreground">Overlays:</div>
                            <div>{overlays.length} items</div>
                            <div className="text-muted-foreground">Filter:</div>
                            <div>{FILTERS.find(f => f.id === selectedFilter)?.name}</div>
                            <div className="text-muted-foreground">Music:</div>
                            <div className="truncate">{selectedMusicTrack?.name || 'None'}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>
            )}
          </div>

          {/* Hidden inputs and audio */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={musicInputRef}
            type="file"
            accept="audio/*"
            onChange={handleMusicUpload}
            className="hidden"
          />
          <input
            ref={thumbnailInputRef}
            type="file"
            accept="image/*"
            onChange={handleThumbnailSelect}
            className="hidden"
          />
          <canvas ref={canvasRef} className="hidden" />
          
          {/* Background audio for music */}
          {selectedMusicTrack?.url && (
            <audio
              ref={audioRef}
              src={selectedMusicTrack.url}
              loop
              style={{ display: 'none' }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
