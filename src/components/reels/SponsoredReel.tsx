import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Megaphone, ExternalLink } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { recordAdEvent, useAdImpression } from '@/hooks/useAdTracking';
import type { FeedAd } from '@/lib/ads';
import defaultAvatar from '@/assets/default-avatar.png';

interface SponsoredReelProps {
  ad: FeedAd;
  isActive: boolean;
}

export default function SponsoredReel({ ad, isActive }: SponsoredReelProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const rootRef = useRef<HTMLDivElement | null>(null);
  useAdImpression(rootRef, isActive ? ad : null, true, 'reels');

  const media = ad.post_media || [];
  const visual = media.find(m => m.type === 'video') || media[0];
  const ctaIsFollow = ad.cta === 'Follow';
  const cta = ad.cta || 'Learn More';

  const handleCta = async () => {
    await recordAdEvent(ad.campaign_id, ad.advertisement_id, 'click', 'reels');
    if (ctaIsFollow) {
      await recordAdEvent(ad.campaign_id, ad.advertisement_id, 'follow', 'reels');
      navigate(`/profile/${ad.profile_username}`);
      return;
    }
    if (cta === 'View Post' && ad.post_id) {
      await recordAdEvent(ad.campaign_id, ad.advertisement_id, 'profile_visit', 'reels');
      navigate(`/post/${ad.post_id}`);
      return;
    }
    if (cta === 'Visit Profile') {
      await recordAdEvent(ad.campaign_id, ad.advertisement_id, 'profile_visit', 'reels');
      navigate(`/profile/${ad.profile_username}`);
      return;
    }
    const destination = ad.cta_url;
    if (destination) {
      await recordAdEvent(ad.campaign_id, ad.advertisement_id, 'website_click', 'reels');
      window.open(destination, '_blank', 'noopener,noreferrer');
    } else {
      toast({ title: 'No link available', description: 'This ad has no destination link yet.' });
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full select-none overflow-hidden bg-black sm:rounded-[28px] sm:border sm:border-white/10"
    >
      {/* Visual */}
      {visual ? (
        visual.type === 'video' ? (
          <video
            src={visual.url}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            loop
            muted
            playsInline
          />
        ) : (
          <img src={visual.url} alt={visual.alt_text || 'Ad'} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        )
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-950 to-black">
          <div className="flex flex-col items-center gap-3">
            <Avatar className="h-20 w-20 ring-2 ring-white/25">
              <AvatarImage src={ad.advertiser_avatar_url || undefined} />
              <AvatarFallback className="bg-neutral-800">
                <img src={defaultAvatar} alt="" className="h-full w-full object-cover" />
              </AvatarFallback>
            </Avatar>
            <p className="text-2xl font-bold text-white">{ad.advertiser_name}</p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      </div>

      {/* Sponsored badge */}
      <div className="absolute left-4 top-16 z-30 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/85 backdrop-blur-md">
        <Megaphone className="h-3.5 w-3.5" />
        Sponsored
      </div>

      {/* Advertiser */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pb-8">
        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={() => navigate(`/profile/${ad.profile_username}`)}
            className="flex items-center gap-3 text-left"
          >
            <Avatar className="h-11 w-11 ring-2 ring-white/25">
              <AvatarImage src={ad.advertiser_avatar_url || undefined} className="object-cover" />
              <AvatarFallback className="bg-neutral-800">
                <img src={defaultAvatar} alt="" className="h-full w-full object-cover" />
              </AvatarFallback>
            </Avatar>
          </button>
          <div className="min-w-0 flex-1">
            <button onClick={() => navigate(`/profile/${ad.profile_username}`)} className="group flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-white group-hover:underline">
                {ad.advertiser_name}
              </span>
              {ad.advertiser_is_verified && <BadgeCheck className="h-4 w-4 flex-shrink-0 text-blue-400" />}
            </button>
            <p className="truncate text-xs text-white/55">@{ad.advertiser_username}</p>
          </div>
        </div>

        {(ad.headline || ad.description || ad.post_content) && (
          <div className="mb-3 space-y-1">
            {ad.headline && (
              <p className="text-[15px] font-bold leading-snug text-white">{ad.headline}</p>
            )}
            {(ad.description || ad.post_content) && (
              <p className="text-sm leading-relaxed text-white/80 line-clamp-3">{ad.description || ad.post_content}</p>
            )}
          </div>
        )}

        <Button
          size="sm"
          onClick={handleCta}
          className="h-9 rounded-lg bg-white px-5 text-xs font-bold text-black hover:bg-white/90"
        >
          {ctaIsFollow ? 'Follow' : cta}
          {!ctaIsFollow && cta !== 'View Post' && cta !== 'Visit Profile' && (
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
