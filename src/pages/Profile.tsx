import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layout/MainLayout';
import Feed from '@/components/feed/Feed';
import RepostsFeed from '@/components/feed/RepostsFeed';
import InterestsFeed from '@/components/feed/InterestsFeed';
import FollowButton from '@/components/social/FollowButton';
import FollowersFollowingModal from '@/components/social/FollowersFollowingModal';
import ProfileActionsMenu from '@/components/social/ProfileActionsMenu';
import ShareProfileDialog from '@/components/social/ShareProfileDialog';
import { useFollowStats } from '@/hooks/useFollowStats';
import { useStories } from '@/hooks/useStories';
import { useMutualConnections } from '@/hooks/useMutualConnections';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import StoryViewer from '@/components/stories/StoryViewer';
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
  Camera,
  Share2,
  MoreHorizontal,
  CalendarDays,
  Users,
  FileText,
  UserCheck,
  Crown,
  ImagePlus,
  Megaphone,
  Repeat,
} from 'lucide-react';
import LibraryModal from '@/components/library/LibraryModal';
import CoverUploadDialog from '@/components/profile/CoverUploadDialog';
import { format } from 'date-fns';
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
  const [shareOpen, setShareOpen] = useState(false);

  // Story states
  const [uploading, setUploading] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = currentUserProfile?.username === username;
  const { stats, loading: statsLoading } = useFollowStats(profileData?.user_id);
  const { mutuals, count: mutualCount, loading: mutualsLoading } = useMutualConnections(profileData?.user_id);
  const { data: isPremium } = usePremiumStatus(profileData?.user_id);
  const { groupedStories, viewStory, uploadStory, deleteStory, fetchStoryViewers } = useStories({
    profileUserId: profileData?.user_id,
    enabled: !!profileData,
  });

  // Modal states
  const [followModalOpen, setFollowModalOpen] = useState(false);
  const [followModalType, setFollowModalType] = useState<'followers' | 'following'>('followers');
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [libraryCount, setLibraryCount] = useState(0);
  const [reelsCount, setReelsCount] = useState(0);

  const hasStories = groupedStories.length > 0 && groupedStories[0]?.stories.length > 0;
  const currentGroup = groupedStories[0];
  const hasUnviewed = currentGroup?.has_unviewed;

  useEffect(() => {
    const fetchProfile = async () => {
      // Reset immediately when the target profile changes so we never render
      // stale data (or the previous user's stories) while loading the new one.
      setLoading(true);
      setProfileData(null);
      setError(null);

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

        // Fetch reels count and total views for this profile
        try {
          const { count: reelsCnt } = await supabase
            .from('reels')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', data.user_id)
            .eq('is_published', true);
          setReelsCount(reelsCnt || 0);
        } catch (err) {
          console.error('Failed to fetch reels stats', err);
        }
      }
      setLoading(false);
    };

    fetchProfile();
  }, [username]);

  // Close the story viewer whenever the profile being viewed changes.
  const viewedUserId = profileData?.user_id;
  useEffect(() => {
    setViewerOpen(false);
  }, [viewedUserId]);

  const handleFollowChange = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleShareProfile = () => {
    setShareOpen(true);
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
    } catch (err) {
      toast({ variant: 'destructive', title: 'Upload failed', description: err instanceof Error ? err.message : 'Failed to upload story.' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openViewer = () => {
    if (!hasStories) return;
    setViewerOpen(true);
  };

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
                  <Button variant="outline" asChild className="rounded-xl font-semibold h-9">
                    <Link to="/ads">
                      <Megaphone className="h-4 w-4 mr-2" />
                      Advertise
                    </Link>
                  </Button>
                  <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9" onClick={handleShareProfile}>
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
                  <ProfileActionsMenu
                    userId={profileData.user_id}
                    username={profileData.username}
                    displayName={profileData.display_name}
                    avatarUrl={profileData.avatar_url}
                    onBlocked={() => navigate('/')}
                    trigger={
                      <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9" title="More actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    }
                  />
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
                  <div className="w-px h-8 bg-border" />
                  <StatButton
                    value={reelsCount.toLocaleString()}
                    label="Reels"
                    onClick={() => {
                      if (!profileData) return;
                      navigate(`/reels?user=${profileData.user_id}`);
                    }}
                  />
              </div>

              {/* Mobile action buttons */}
              <div className="flex md:hidden gap-2 mt-4">
                {isOwnProfile ? (
                  <>
                    <Button variant="outline" className="flex-1 rounded-xl font-semibold h-10" asChild>
                      <Link to="/settings">Edit Profile</Link>
                    </Button>
                    <Button variant="outline" size="icon" className="rounded-xl h-10 w-10" onClick={handleShareProfile}>
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
                    <ProfileActionsMenu
                      userId={profileData.user_id}
                      username={profileData.username}
                      displayName={profileData.display_name}
                      avatarUrl={profileData.avatar_url}
                      onBlocked={() => navigate('/')}
                      trigger={
                        <Button variant="outline" size="icon" className="rounded-xl h-10 w-10" title="More actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      }
                    />
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
                  <TabsList className="grid w-full grid-cols-3 max-w-[300px] bg-muted/50 p-0.5 rounded-lg h-9">
                    <TabsTrigger value="activity" className="flex items-center gap-1.5 rounded-md text-xs font-semibold">
                      <FileText className="h-3.5 w-3.5" />
                      Activity
                    </TabsTrigger>
                    <TabsTrigger value="reposts" className="flex items-center gap-1.5 rounded-md text-xs font-semibold">
                      <Repeat className="h-3.5 w-3.5" />
                      Reposts
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

                <TabsContent value="reposts" className="p-4 mt-0">
                  <RepostsFeed userId={profileData.user_id} refreshTrigger={refreshKey} />
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
      <StoryViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        groups={groupedStories}
        currentUserId={user?.id ?? null}
        initialGroupIndex={0}
        onView={viewStory}
        onDelete={deleteStory}
        onFetchViewers={fetchStoryViewers}
      />

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

      {profileData && (
        <ShareProfileDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          displayName={profileData.display_name}
          username={profileData.username}
          avatarUrl={profileData.avatar_url}
        />
      )}
    </MainLayout>
  );
}
