import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layout/MainLayout';
import Feed from '@/components/feed/Feed';
import InterestsFeed from '@/components/feed/InterestsFeed';
import FollowButton from '@/components/social/FollowButton';
import FollowersFollowingModal from '@/components/social/FollowersFollowingModal';
import { useFollowStats } from '@/hooks/useFollowStats';
import { useStories } from '@/hooks/useStories';
import { useMutualConnections } from '@/hooks/useMutualConnections';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  BadgeCheck,
  MapPin,
  Link as LinkIcon,
  Settings,
  Lock,
  MessageCircle,
  Hammer,
  ArrowLeft,
  Loader2,
  X,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Trash2,
  Music,
  Camera,
  Share2,
  MoreHorizontal,
  CalendarDays,
  Users,
  FileText,
  UserCheck,
  Crown,
  ImagePlus,
  Eye,
} from 'lucide-react';
import LibraryModal from '@/components/library/LibraryModal';
import CoverUploadDialog from '@/components/profile/CoverUploadDialog';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface ProfileData {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  location: string | null;
  website: string | null;
  privacy: 'public' | 'private';
  is_verified: boolean;
  created_at: string;
}

function getInitials(name: string) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
}

function StatButton({ value, label, onClick }: { value: string | number; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 group p-3 rounded-xl hover:bg-muted/50 transition-colors text-center"
    >
      <span className="block text-xl font-bold tabular-nums group-hover:text-primary transition-colors">
        {value}
      </span>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </button>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0",
      className
    )}>
      {children}
    </span>
  );
}

export default function Profile() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user, profile: currentUserProfile } = useAuth();
  const { toast } = useToast();

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isProfileAdmin, setIsProfileAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);

  // Story states
  const [uploading, setUploading] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwnProfile = currentUserProfile?.username === username;
  const { stats, loading: statsLoading } = useFollowStats(profileData?.user_id);
  const { mutuals, count: mutualCount, loading: mutualsLoading } = useMutualConnections(profileData?.user_id);
  const { data: isPremium } = usePremiumStatus(profileData?.user_id);
  const { groupedStories, viewStory, uploadStory, deleteStory } = useStories({
    profileUserId: profileData?.user_id
  });

  // Modal states
  const [followModalOpen, setFollowModalOpen] = useState(false);
  const [followModalType, setFollowModalType] = useState<'followers' | 'following'>('followers');
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [libraryCount, setLibraryCount] = useState(0);

  const hasStories = groupedStories.length > 0 && groupedStories[0]?.stories.length > 0;
  const currentGroup = groupedStories[0];
  const currentStory = currentGroup?.stories[currentStoryIndex];
  const hasUnviewed = currentGroup?.has_unviewed;

  useEffect(() => {
    const fetchProfile = async () => {
      if (!username) {
        setError('Profile not found');
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .maybeSingle();

      if (fetchError || !data) {
        setError('Profile not found');
      } else {
        setProfileData(data as ProfileData);

        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', data.user_id)
          .eq('role', 'admin')
          .maybeSingle();

        setIsProfileAdmin(!!roleData);

        const { count } = await supabase
          .from('user_library')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', data.user_id);

        setLibraryCount(count || 0);
      }
      setLoading(false);
    };

    fetchProfile();
  }, [username]);

  const handleFollowChange = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast({ variant: 'destructive', title: 'Invalid file type', description: 'Please select an image or video file.' });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 50MB.' });
      return;
    }

    setUploading(true);
    try {
      await uploadStory(file);
      toast({ title: 'Story added!', description: 'Your story will be visible for 24 hours.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: err.message || 'Failed to upload story.' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearStoryTimer = useCallback(() => {
    if (storyTimerRef.current) {
      clearTimeout(storyTimerRef.current);
      storyTimerRef.current = null;
    }
  }, []);

  const nextStory = useCallback(() => {
    clearStoryTimer();
    if (!currentGroup) return;
    if (currentStoryIndex < currentGroup.stories.length - 1) {
      const newIndex = currentStoryIndex + 1;
      setCurrentStoryIndex(newIndex);
      const story = currentGroup.stories[newIndex];
      if (story && !story.is_viewed) viewStory(story.id);
    } else {
      setViewerOpen(false);
    }
  }, [currentGroup, currentStoryIndex, clearStoryTimer, viewStory]);

  const prevStory = useCallback(() => {
    clearStoryTimer();
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(prev => prev - 1);
    }
  }, [currentStoryIndex, clearStoryTimer]);

  const openViewer = () => {
    if (!hasStories) return;
    clearStoryTimer();
    setCurrentStoryIndex(0);
    setViewerOpen(true);
    setPaused(false);
    setMusicMuted(false);
    const story = currentGroup?.stories[0];
    if (story && !story.is_viewed) viewStory(story.id);
  };

  // Auto-advance timer for images when not paused
  useEffect(() => {
    clearStoryTimer();
    if (!viewerOpen || !currentStory || !currentGroup) return;
    if (paused) return;
    if (currentStory.media_type === 'video') return;

    const duration = (currentStory.duration || 5) * 1000;
    storyTimerRef.current = setTimeout(nextStory, duration);

    return clearStoryTimer;
  }, [viewerOpen, currentStory, currentStoryIndex, paused, nextStory, clearStoryTimer, currentGroup]);

  // Close story viewer cleanup
  useEffect(() => {
    if (!viewerOpen) {
      clearStoryTimer();
      setPaused(false);
    }
  }, [viewerOpen, clearStoryTimer]);

  if (loading) {
    return (
      <MainLayout>
        <div className="min-h-screen bg-background">
          <div className="max-w-4xl mx-auto">
            <Skeleton className="h-52 w-full rounded-none" />
            <div className="px-4 -mt-16 relative">
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex gap-5">
                  <Skeleton className="h-28 w-28 rounded-full shrink-0" />
                  <div className="flex-1 space-y-3 pt-2">
                    <Skeleton className="h-7 w-52" />
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !profileData) {
    return (
      <MainLayout>
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="bg-card border border-border rounded-2xl p-12 text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-5">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Profile not found</h1>
            <p className="text-muted-foreground text-sm mb-6">
              This user doesn't exist or the profile has been removed.
            </p>
            <Button onClick={() => navigate('/')} className="px-6">
              Back to Home
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-background pb-24 lg:pb-8">
        <div className="max-w-4xl mx-auto">

          {/* Cover */}
          <div className="relative h-44 md:h-52 overflow-hidden bg-muted">
            {profileData.cover_url ? (
              <img src={profileData.cover_url} alt="" className="w-full h-full object-cover" />
            ) : null}

            {/* Back button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="absolute top-4 left-4 rounded-xl bg-black/50 hover:bg-black/70 text-white border border-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            {/* Cover actions */}
            <div className="absolute top-4 right-4 flex gap-2">
              {isOwnProfile && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCoverDialogOpen(true)}
                    className="rounded-xl bg-black/50 hover:bg-black/70 text-white border border-white/10"
                  >
                    <ImagePlus className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    className="rounded-xl bg-black/50 hover:bg-black/70 text-white border border-white/10"
                  >
                    <Link to="/settings">
                      <Settings className="h-5 w-5" />
                    </Link>
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl bg-black/50 hover:bg-black/70 text-white border border-white/10"
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Profile card */}
          <div className="px-4 -mt-16 relative">
            <div className="bg-card border border-border rounded-2xl p-5 md:p-6">
              <div className="flex flex-col md:flex-row md:items-end gap-4">

                {/* Avatar */}
                <div className="relative -mt-16 md:-mt-20 shrink-0">
                  <div
                    className={cn(
                      "rounded-full p-1 transition-colors",
                      hasStories
                        ? hasUnviewed
                          ? "bg-primary ring-2 ring-primary/40"
                          : "bg-muted-foreground/30"
                        : "bg-card"
                    )}
                    onClick={hasStories ? openViewer : undefined}
                    role={hasStories ? "button" : undefined}
                    tabIndex={hasStories ? 0 : undefined}
                    onKeyDown={hasStories ? (e) => e.key === 'Enter' && openViewer() : undefined}
                  >
                    <Avatar className="w-24 h-24 md:w-32 md:h-32 border-4 border-card">
                      <AvatarImage src={profileData.avatar_url || undefined} alt={profileData.display_name} className="object-cover" />
                      <AvatarFallback className="bg-muted text-foreground text-3xl md:text-4xl font-bold">
                        {getInitials(profileData.display_name)}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  {isOwnProfile && user && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="absolute bottom-1 right-1 w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:scale-105 transition-transform border-2 border-card"
                    >
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </button>
                  )}

                  {hasStories && (
                    <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border-2 border-card">
                      {currentGroup.stories.length}
                    </div>
                  )}
                </div>

                {/* Name & info */}
                <div className="flex-1 md:pb-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate">
                      {profileData.display_name}
                    </h1>
                    {profileData.is_verified && (
                      <Badge className="bg-primary text-primary-foreground">
                        <BadgeCheck className="h-3 w-3" />
                      </Badge>
                    )}
                    {isPremium && (
                      <Badge className="bg-amber-500 text-white" title="Premium Member">
                        <Crown className="h-3 w-3" />
                      </Badge>
                    )}
                    {isProfileAdmin && (
                      <Badge className="bg-muted text-muted-foreground" title="Admin">
                        <Hammer className="h-3 w-3" />
                      </Badge>
                    )}
                    {profileData.privacy === 'private' && (
                      <Badge className="bg-muted text-muted-foreground" title="Private Account">
                        <Lock className="h-3 w-3" />
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">@{profileData.username}</p>
                </div>

                {/* Desktop action buttons */}
                <div className="hidden md:flex items-center gap-2">
                  {isOwnProfile ? (
                    <>
                      <Button variant="outline" asChild className="rounded-xl font-semibold h-9">
                        <Link to="/settings">Edit Profile</Link>
                      </Button>
                      <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9">
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : user ? (
                    <>
                      <FollowButton
                        targetUserId={profileData.user_id}
                        targetUsername={profileData.username}
                        isPrivateAccount={profileData.privacy === 'private'}
                        onFollowChange={handleFollowChange}
                      />
                      <Button variant="outline" asChild className="rounded-xl font-semibold h-9">
                        <Link to={`/messages?new=${profileData.user_id}`}>
                          <MessageCircle className="h-4 w-4 mr-2" />
                          Message
                        </Link>
                      </Button>
                    </>
                  ) : (
                    <Button className="font-semibold rounded-xl h-9" asChild>
                      <Link to="/auth">Follow</Link>
                    </Button>
                  )}
                </div>
              </div>

              {/* Bio */}
              {profileData.bio && (
                <p className="mt-4 text-foreground/80 leading-relaxed max-w-2xl text-sm">
                  {profileData.bio}
                </p>
              )}

              {/* Meta info */}
              <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-muted-foreground">
                {profileData.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {profileData.location}
                  </span>
                )}
                {profileData.website && (
                  <a
                    href={profileData.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <LinkIcon className="h-3.5 w-3.5" />
                    {profileData.website.replace(/^https?:\/\//, '').split('/')[0]}
                  </a>
                )}
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Joined {format(new Date(profileData.created_at), 'MMM yyyy')}
                </span>
              </div>

              {/* Mutual connections */}
              {!isOwnProfile && user && !mutualsLoading && mutualCount > 0 && (
                <div className="flex items-center gap-2 mt-3 p-3 rounded-xl bg-muted/50 border border-border">
                  <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="flex -space-x-1.5">
                      {mutuals.slice(0, 3).map((mutual) => (
                        <Avatar key={mutual.user_id} className="w-5 h-5 border-2 border-card">
                          <AvatarImage src={mutual.avatar_url || undefined} />
                          <AvatarFallback className="text-[8px] bg-muted text-muted-foreground">
                            {mutual.display_name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground truncate">
                      Followed by{' '}
                      <span className="text-foreground font-medium">{mutuals[0]?.display_name}</span>
                      {mutualCount > 1 && <> and <span className="text-foreground font-medium">{mutualCount - 1} others</span></>}
                    </span>
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center gap-1 mt-4 pt-4 border-t border-border">
                <StatButton
                  value={statsLoading ? '–' : stats.followers.toLocaleString()}
                  label="Followers"
                  onClick={() => { setFollowModalType('followers'); setFollowModalOpen(true); }}
                />
                <div className="w-px h-8 bg-border" />
                <StatButton
                  value={statsLoading ? '–' : stats.following.toLocaleString()}
                  label="Following"
                  onClick={() => { setFollowModalType('following'); setFollowModalOpen(true); }}
                />
                <div className="w-px h-8 bg-border" />
                <StatButton
                  value={libraryCount.toLocaleString()}
                  label="Library"
                  onClick={() => setLibraryModalOpen(true)}
                />
              </div>

              {/* Mobile action buttons */}
              <div className="flex md:hidden gap-2 mt-4">
                {isOwnProfile ? (
                  <>
                    <Button variant="outline" className="flex-1 rounded-xl font-semibold h-10" asChild>
                      <Link to="/settings">Edit Profile</Link>
                    </Button>
                    <Button variant="outline" size="icon" className="rounded-xl h-10 w-10">
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </>
                ) : user ? (
                  <>
                    <FollowButton
                      targetUserId={profileData.user_id}
                      targetUsername={profileData.username}
                      isPrivateAccount={profileData.privacy === 'private'}
                      onFollowChange={handleFollowChange}
                      className="flex-1 rounded-xl"
                    />
                    <Button variant="outline" className="flex-1 rounded-xl font-semibold h-10" asChild>
                      <Link to={`/messages?new=${profileData.user_id}`}>
                        <MessageCircle className="h-4 w-4 mr-2" />
                        Message
                      </Link>
                    </Button>
                  </>
                ) : (
                  <Button className="flex-1 rounded-xl font-semibold h-10" asChild>
                    <Link to="/auth">Follow</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Library Modal */}
          <LibraryModal
            open={libraryModalOpen}
            onOpenChange={setLibraryModalOpen}
            userId={profileData.user_id}
            username={profileData.username}
            isOwnProfile={isOwnProfile}
          />

          {/* Tabs */}
          <div className="px-4 mt-4">
            <div className="bg-card border border-border rounded-2xl">
              <Tabs defaultValue="activity" className="w-full">
                <div className="border-b border-border px-4">
                  <TabsList className="grid w-full grid-cols-2 max-w-[200px] bg-muted/50 p-0.5 rounded-lg h-9">
                    <TabsTrigger value="activity" className="flex items-center gap-1.5 rounded-md text-xs font-semibold">
                      <FileText className="h-3.5 w-3.5" />
                      Activity
                    </TabsTrigger>
                    <TabsTrigger value="interests" className="flex items-center gap-1.5 rounded-md text-xs font-semibold">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      Interests
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="activity" className="p-4 mt-0">
                  <Feed userId={profileData.user_id} refreshTrigger={refreshKey} />
                </TabsContent>

                <TabsContent value="interests" className="p-4 mt-0">
                  <InterestsFeed userId={profileData.user_id} isOwnProfile={isOwnProfile} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input for story upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Story Viewer */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-lg p-0 bg-black border-none overflow-hidden h-[90vh] max-h-[800px]">
          {currentStory && currentGroup && (
            <div className="relative h-full w-full flex flex-col">
              {/* Progress bars */}
              <div className="absolute top-2 left-2 right-2 z-20 flex gap-1">
                {currentGroup.stories.map((story, i) => (
                  <div key={story.id} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full bg-white rounded-full transition-none",
                        i < currentStoryIndex && "w-full",
                        i === currentStoryIndex && "animate-story-progress",
                        i > currentStoryIndex && "w-0"
                      )}
                      style={i === currentStoryIndex && paused ? { animationPlayState: 'paused' } : undefined}
                    />
                  </div>
                ))}
              </div>

              {/* Header */}
              <div className="absolute top-5 left-0 right-0 z-20 flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                  <Avatar className="w-9 h-9 ring-2 ring-white/30">
                    <AvatarImage src={currentGroup.avatar_url || undefined} />
                    <AvatarFallback className="bg-muted text-foreground text-xs">
                      {getInitials(currentGroup.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-white font-semibold text-sm">{currentGroup.display_name}</p>
                    <p className="text-white/60 text-xs">
                      {formatDistanceToNow(new Date(currentStory.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPaused(!paused)}
                    className="rounded-full text-white hover:bg-white/20 h-9 w-9"
                  >
                    {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                  {currentStory.media_type === 'video' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setMuted(!muted)}
                      className="rounded-full text-white hover:bg-white/20 h-9 w-9"
                    >
                      {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                  )}
                  {isOwnProfile && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        deleteStory(currentStory.id);
                        nextStory();
                      }}
                      className="rounded-full text-white hover:bg-red-500/80 h-9 w-9"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setViewerOpen(false)}
                    className="rounded-full text-white hover:bg-white/20 h-9 w-9"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Media */}
              <div className="flex-1 flex items-center justify-center bg-black">
                {currentStory.media_type === 'video' ? (
                  <video
                    key={currentStory.id}
                    src={currentStory.media_url}
                    className="max-h-full max-w-full object-contain"
                    autoPlay
                    loop={false}
                    muted={muted || !!currentStory.music_url}
                    playsInline
                    onEnded={nextStory}
                  />
                ) : (
                  <img
                    key={currentStory.id}
                    src={currentStory.media_url}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                )}
              </div>

              {/* Story music */}
              {currentStory.music_url && (
                <>
                  <audio
                    key={currentStory.id}
                    src={currentStory.music_url}
                    autoPlay
                    loop
                    muted={musicMuted}
                    className="hidden"
                  />
                  <div className="absolute bottom-16 left-0 right-0 z-20 flex justify-center">
                    <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full pl-3 pr-1.5 py-1.5">
                      <Music className="h-4 w-4 text-white flex-shrink-0" />
                      <span className="text-white text-xs font-medium max-w-[160px] truncate">
                        {currentStory.music_name || 'Audio'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setMusicMuted(!musicMuted)}
                        className="h-7 w-7 rounded-full text-white hover:bg-white/20"
                      >
                        {musicMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {/* Caption */}
              {currentStory.caption && (
                <div className="absolute bottom-16 left-4 right-4 z-20">
                  <p className="text-white text-center text-sm bg-black/50 rounded-lg px-4 py-2 backdrop-blur-sm">
                    {currentStory.caption}
                  </p>
                </div>
              )}

              {/* Navigation */}
              <button onClick={prevStory} className="absolute left-0 top-16 bottom-0 w-1/3 z-10" />
              <button onClick={nextStory} className="absolute right-0 top-16 bottom-0 w-1/3 z-10" />

              {/* View count */}
              {isOwnProfile && (
                <div className="absolute bottom-4 left-0 right-0 z-20 text-center">
                  <span className="text-white/60 text-xs inline-flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {currentStory.view_count} views
                  </span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <FollowersFollowingModal
        open={followModalOpen}
        onOpenChange={setFollowModalOpen}
        userId={profileData.user_id}
        type={followModalType}
        username={profileData.username}
      />

      <CoverUploadDialog
        open={coverDialogOpen}
        onOpenChange={setCoverDialogOpen}
        onUploadComplete={(url) => {
          setProfileData(prev => prev ? { ...prev, cover_url: url } : null);
        }}
      />

      <style>{`
        @keyframes story-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
        .animate-story-progress {
          animation: story-progress 5s linear forwards;
        }
      `}</style>
    </MainLayout>
  );
}
