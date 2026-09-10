import { useState, useMemo } from 'react';
import { useStories, GroupedStories } from '@/hooks/useStories';
import { useFeedAds } from '@/hooks/useFeedAds';
import { useAuth } from '@/contexts/AuthContext';
import StoryTray from '@/components/stories/StoryTray';
import StoryCreator from '@/components/stories/StoryCreator';
import StoryViewer from '@/components/stories/StoryViewer';

export default function StoriesBar() {
  const { user } = useAuth();
  const {
    groupedStories, loading, error, refetch, viewStory, uploadStory, deleteStory, fetchStoryViewers,
    toggleStoryLike, sendStoryReply,
  } = useStories();
  const { ads } = useFeedAds(1);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  const [creatorOpen, setCreatorOpen] = useState(false);

  // Append a single sponsored story to the tray (real active campaign only).
  const groups: GroupedStories[] = useMemo(() => {
    if (ads.length === 0) return groupedStories;
    const ad = ads[0];
    const media = ad.post_media || [];
    const visual = media.find(m => m.type === 'video') || media[0];
    const adGroup: GroupedStories = {
      user_id: `ad-${ad.advertisement_id}`,
      username: ad.advertiser_username,
      display_name: ad.advertiser_name,
      avatar_url: ad.advertiser_avatar_url,
      has_unviewed: false,
      ad,
      stories: [{
        id: `ad-${ad.advertisement_id}`,
        user_id: `ad-${ad.advertisement_id}`,
        media_url: visual?.url || ad.advertiser_avatar_url || '',
        media_type: 'image',
        caption: null,
        duration: 5,
        view_count: 0,
        like_count: 0,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        music_url: null,
        music_name: null,
        is_viewed: true,
      }],
    };
    return [...groupedStories, adGroup];
  }, [groupedStories, ads]);

  return (
    <>
      <StoryTray
        user={user ? { id: user.id } : null}
        groups={groups}
        loading={loading}
        error={error}
        uploading={false}
        onOpenCreator={() => setCreatorOpen(true)}
        onPlayGroup={(index) => { setViewerStart(index); setViewerOpen(true); }}
        onRetry={() => refetch()}
      />

      <StoryCreator
        open={creatorOpen}
        onOpenChange={setCreatorOpen}
        onUpload={uploadStory}
      />

      <StoryViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        groups={groups}
        currentUserId={user?.id ?? null}
        initialGroupIndex={viewerStart}
        onView={viewStory}
        onDelete={deleteStory}
        onFetchViewers={fetchStoryViewers}
        onToggleLike={toggleStoryLike}
        onSendReply={sendStoryReply}
      />
    </>
  );
}