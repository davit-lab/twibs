import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import CommentSection from '@/components/comments/CommentSection';
import FollowButton from '@/components/social/FollowButton';
import { useSavedPosts, useSafetyActions } from '@/hooks/useSafety';
import { recordAdEvent, useAdImpression } from '@/hooks/useAdTracking';
import { useCampaignActions } from '@/hooks/useAds';
import {
  Star,
  MessageCircle,
  Share2,
  MoreHorizontal,
  Flag,
  BadgeCheck,
  Loader2,
  Megaphone,
  Bookmark,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { AD_REPORT_REASONS, type FeedAd } from '@/lib/ads';

interface SponsoredPostProps {
  ad: FeedAd;
  onReported?: () => void;
  className?: string;
}

export default function SponsoredPost({ ad, onReported, className }: SponsoredPostProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { reportAd } = useCampaignActions();
  const { data: savedPostIds = [] } = useSavedPosts();
  const { savePost, unsavePost } = useSafetyActions();

  const rootRef = useRef<HTMLElement | null>(null);
  useAdImpression(rootRef, ad, true);

  const [starring, setStarring] = useState(false);
  const [starCount, setStarCount] = useState(ad.post_star_count ?? 0);
  const [starred, setStarred] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(ad.post_comment_count ?? 0);
  const [reportOpen, setReportOpen] = useState(false);

  const isSaved = ad.post_id ? savedPostIds.includes(ad.post_id) : false;

  const media = ad.post_media || [];

  const getInitials = (name: string) =>
    name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  const recordClick = () => {
    recordAdEvent(ad.campaign_id, ad.advertisement_id, 'click', 'feed');
  };

  const handleStar = async () => {
    if (!user) {
      toast({ title: 'Sign in required', description: 'Please sign in to star posts.' });
      return;
    }
    if (starred) return;
    setStarring(true);
    try {
      const { error } = await supabase
        .from('stars')
        .insert({ post_id: ad.post_id, user_id: user.id });
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          setStarred(true);
        } else {
          throw error;
        }
      }
      setStarred(true);
      setStarCount((c) => c + 1);
      await recordAdEvent(ad.campaign_id, ad.advertisement_id, 'like', 'feed');
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to star this post.' });
    } finally {
      setStarring(false);
    }
  };

  const handleSave = async () => {
    if (!user) {
      toast({ title: 'Sign in required', description: 'Please sign in to save posts.' });
      return;
    }
    if (!ad.post_id) return;
    const ok = isSaved ? await unsavePost(ad.post_id) : await savePost(ad.post_id);
    if (ok && !isSaved) {
      await recordAdEvent(ad.campaign_id, ad.advertisement_id, 'save', 'feed');
    }
  };

  const handleShare = async () => {
    const postUrl = `${window.location.origin}/post/${ad.post_id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${ad.advertiser_name} on Twibsers`,
          text: ad.post_content?.slice(0, 100) || ad.headline || '',
          url: postUrl,
        });
        await recordAdEvent(ad.campaign_id, ad.advertisement_id, 'share', 'feed');
      } catch {
        // cancelled
      }
    } else {
      await navigator.clipboard.writeText(postUrl);
      toast({ title: 'Link copied!', description: 'Post link copied to clipboard.' });
      await recordAdEvent(ad.campaign_id, ad.advertisement_id, 'share', 'feed');
    }
  };

  const handleCtaClick = async () => {
    recordClick();
    const cta = ad.cta || '';
    if (cta === 'Follow') return; // rendered as an inline follow button
    if (cta === 'View Post') {
      if (ad.post_id) {
        await recordAdEvent(ad.campaign_id, ad.advertisement_id, 'profile_visit', 'feed');
        navigate(`/post/${ad.post_id}`);
      }
      return;
    }
    if (cta === 'Visit Profile') {
      await recordAdEvent(ad.campaign_id, ad.advertisement_id, 'profile_visit', 'feed');
      navigate(`/profile/${ad.profile_username}`);
      return;
    }
    // Learn More / Visit Website
    const destination = ad.cta_url;
    if (destination) {
      await recordAdEvent(ad.campaign_id, ad.advertisement_id, 'website_click', 'feed');
      window.open(destination, '_blank', 'noopener,noreferrer');
    } else {
      toast({ title: 'No link available', description: 'This ad has no destination link yet.' });
    }
  };

  const handleReport = async (reason: string) => {
    try {
      await reportAd(ad.advertisement_id, reason);
      toast({ title: 'Ad reported', description: 'Thanks — our team will review it.' });
      onReported?.();
      setReportOpen(false);
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not report ad',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    }
  };

  const ctaIsFollow = ad.cta === 'Follow';

  return (
    <article
      ref={rootRef}
      aria-label="Sponsored post"
      className={cn(
        'bg-card rounded-2xl border border-border/60 shadow-sm shadow-black/[0.03] overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-4 pb-3">
        {ctaIsFollow ? (
          <Avatar className="h-10 w-10">
            <AvatarImage src={ad.advertiser_avatar_url || undefined} />
            <AvatarFallback className="bg-surface-2 text-xs">
              {getInitials(ad.advertiser_name)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <Link to={`/profile/${ad.profile_username}`} className="flex-shrink-0">
            <Avatar className="h-10 w-10">
              <AvatarImage src={ad.advertiser_avatar_url || undefined} />
              <AvatarFallback className="bg-surface-2 text-xs">
                {getInitials(ad.advertiser_name)}
              </AvatarFallback>
            </Avatar>
          </Link>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Link
              to={`/profile/${ad.profile_username}`}
              className="truncate font-semibold text-[15px] hover:text-primary transition-colors"
            >
              {ad.advertiser_name}
            </Link>
            {ad.advertiser_is_verified && (
              <BadgeCheck className="h-[18px] w-[18px] text-primary flex-shrink-0" />
            )}
            <span className="text-muted-foreground text-sm">@{ad.advertiser_username}</span>
          </div>
          <div className="mt-0.5">
            <Badge
              variant="secondary"
              className="gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <Megaphone className="h-3 w-3" />
              Sponsored
            </Badge>
          </div>
        </div>

        <DropdownMenu open={reportOpen} onOpenChange={setReportOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="p-2 -m-1 rounded-full text-muted-foreground hover:bg-surface-3 hover:text-foreground transition-colors"
              aria-label="Ad options"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-xl">
            <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Report advertisement
            </p>
            <DropdownMenuSeparator className="bg-border/30" />
            {AD_REPORT_REASONS.map((reason) => (
              <DropdownMenuItem
                key={reason}
                className="gap-2 text-sm rounded-lg"
                onClick={() => handleReport(reason)}
              >
                <Flag className="h-4 w-4" />
                {reason}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Post content */}
      {ad.post_content && (
        <div className="px-4">
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {ad.post_content}
          </p>
        </div>
      )}

      {/* Media */}
      {media.length > 0 && (
        <div className="px-4 mt-3">
          <div
            className={cn(
              'grid gap-1 rounded-2xl overflow-hidden border border-border/40',
              media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
            )}
          >
            {media.map((m, index) => (
              <div key={m.id} className={cn('relative bg-muted', media.length >= 3 && index === 0 && 'row-span-2')}>
                {m.type === 'image' ? (
                  <img
                    src={m.url}
                    alt={m.alt_text || 'Ad image'}
                    loading="lazy"
                    className="w-full h-full object-cover max-h-[400px]"
                  />
                ) : (
                  <video src={m.url} className="w-full h-full object-cover max-h-[400px]" controls muted />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ad creative: headline + description + CTA */}
      {(ad.headline || ad.description || ad.cta) && (
        <div className="px-4 mt-3 space-y-1.5">
          {ad.headline && (
            <p className="text-[15px] font-semibold leading-snug">{ad.headline}</p>
          )}
          {ad.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{ad.description}</p>
          )}
          {ad.cta && (
            <div className="pt-2">
              {ctaIsFollow ? (
                <FollowButton
                  targetUserId={ad.advertiser_user_id}
                  targetUsername={ad.profile_username}
                  isPrivateAccount={ad.profile_privacy === 'private'}
                  onFollowCreated={() =>
                    recordAdEvent(ad.campaign_id, ad.advertisement_id, 'follow', 'feed')
                  }
                  size="sm"
                />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full font-semibold border-primary/40 text-primary hover:bg-primary/5"
                  onClick={handleCtaClick}
                >
                  {ad.cta}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Engagement bar */}
      <div className="flex items-center justify-between px-4 py-2.5 mt-3 border-t border-border/20">
        <div className="flex items-center gap-1">
          <button
            onClick={handleStar}
            disabled={starring}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 active:scale-95',
              starred
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-surface-3 hover:text-primary'
            )}
          >
            {starring ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Star className={cn('h-5 w-5', starred && 'fill-primary scale-110')} />
            )}
          </button>

          {starCount > 0 && (
            <span className="px-1.5 text-xs tabular-nums font-semibold text-muted-foreground">
              {starCount}
            </span>
          )}

          <button
            onClick={() => setShowComments(!showComments)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 active:scale-95',
              showComments
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-surface-3 hover:text-primary'
            )}
          >
            <MessageCircle className={cn('h-5 w-5', showComments && 'fill-primary/20')} />
            {commentCount > 0 && (
              <span className="text-xs tabular-nums font-semibold">{commentCount}</span>
            )}
          </button>

          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-muted-foreground hover:bg-surface-3 hover:text-primary transition-all duration-200 active:scale-95"
          >
            <Share2 className="h-5 w-5" />
          </button>
        </div>

        <button
          onClick={handleSave}
          className={cn(
            'p-2 rounded-full transition-all duration-200 active:scale-95',
            isSaved ? 'text-primary' : 'text-muted-foreground hover:bg-surface-3 hover:text-primary'
          )}
          aria-label={isSaved ? 'Unsave post' : 'Save post'}
        >
          <Bookmark className={cn('h-5 w-5', isSaved && 'fill-primary')} />
        </button>
      </div>

      {showComments && ad.post_id && (
        <Collapsible open={showComments} onOpenChange={setShowComments}>
          <CollapsibleContent>
            <div className="px-4 pb-4">
              <CommentSection
                postId={ad.post_id}
                onCommented={() => {
                  setCommentCount((c) => c + 1);
                  recordAdEvent(ad.campaign_id, ad.advertisement_id, 'comment', 'feed');
                }}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </article>
  );
}
