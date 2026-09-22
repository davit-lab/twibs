import { useMemo, useState } from 'react';
import { useStories, GroupedStories } from '@/hooks/useStories';
import { useFeedAds } from '@/hooks/useFeedAds';
import { useAuth } from '@/contexts/AuthContext';
import StoryTray from '@/components/stories/StoryTray';
import StoryCreator from '@/components/stories/StoryCreator';
import StoryViewer from '@/components/stories/StoryViewer';

export default function StoriesBar() {
  const { user } = useAuth();

  const {
    groupedStories,
    loading,
    error,
    refetch,
    viewStory,
    uploadStory,
    uploading,
    uploadState,
    deleteStory,
    fetchStoryViewers,
    toggleStoryLike,
    setStoryReaction,
    sendStoryReply,
  } = useStories();

  const { ads } = useFeedAds(1);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  const [creatorOpen, setCreatorOpen] = useState(false);

  /**
   * Stories + one active sponsored story.
   *
   * Sponsored content stays at the end of the tray so the user's
   * own/followed stories remain the primary experience.
   */
  const groups = useMemo<GroupedStories[]>(() => {
    if (!ads.length) {
      return groupedStories;
    }

    const ad = ads[0];

    const media = ad.post_media ?? [];

    const visual =
      media.find((item) => item.type === 'video') ??
      media.find((item) => item.type === 'image') ??
      media[0];

    const sponsoredStory: GroupedStories = {
      user_id: `ad-${ad.advertisement_id}`,
      username: ad.advertiser_username,
      display_name: ad.advertiser_name,
      avatar_url: ad.advertiser_avatar_url,
      has_unviewed: false,
      ad,

      stories: [
        {
          id: `ad-${ad.advertisement_id}`,
          user_id: `ad-${ad.advertisement_id}`,
          media_url:
            visual?.url ??
            ad.advertiser_avatar_url ??
            '',

          media_type:
            visual?.type === 'video'
              ? 'video'
              : 'image',

          caption: null,
          duration: 5,
          view_count: 0,
          like_count: 0,

          created_at: new Date().toISOString(),
          expires_at: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString(),

          music_url: null,
          music_name: null,
          overlays: [],
          is_viewed: true,
        },
      ],
    };

    return [
      ...groupedStories,
      sponsoredStory,
    ];
  }, [groupedStories, ads]);

  const handlePlayGroup = (index: number) => {
    setViewerStart(index);
    setViewerOpen(true);
  };

  const handleOpenCreator = () => {
    setCreatorOpen(true);
  };

  return (
    <>
      <section
        aria-label="Stories"
        className="
          relative
          w-full
          border-b border-white/[0.06]
          bg-black
        "
      >
        <div className="mx-auto w-full max-w-7xl">
          <div
            className="
              relative
              px-3 py-3
              sm:px-5 sm:py-4
              lg:px-6
            "
          >
            {/* Subtle section header */}
            <div
              className="
                mb-2
                flex items-center justify-between
                px-1
              "
            >
              <div className="flex items-center gap-2">
                <span
                  className="
                    text-[13px]
                    font-semibold
                    tracking-[-0.01em]
                    text-white
                  "
                >
                  Stories
                </span>

                {groups.some((group) => group.has_unviewed) && (
                  <span
                    className="
                      h-1.5 w-1.5
                      rounded-full
                      bg-[#8B5CF6]
                    "
                    aria-label="New stories"
                  />
                )}
              </div>

              {groups.length > 0 && (
                <span
                  className="
                    text-[11px]
                    font-medium
                    text-white/35
                  "
                >
                  {groups.length}
                </span>
              )}
            </div>

            <StoryTray
              user={user ? { id: user.id } : null}
              groups={groups}
              loading={loading}
              error={error}
              uploading={uploading}
              uploadState={uploadState}
              onOpenCreator={handleOpenCreator}
              onPlayGroup={handlePlayGroup}
              onRetry={refetch}
            />
          </div>
        </div>
      </section>

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
        onReact={setStoryReaction}
        onSendReply={sendStoryReply}
      />
    </>
  );
}