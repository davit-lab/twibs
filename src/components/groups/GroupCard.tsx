import { Link } from 'react-router-dom';
import { Users, UserPlus, Check, Loader2, Clock } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Group } from '@/hooks/useGroups';

interface GroupCardProps {
  group: Group;
  onJoin?: (groupId: string) => void;
  onLeave?: (groupId: string) => void;
  isJoining?: boolean;
}

function getHue(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) % 360;
  }
  return h;
}

export default function GroupCard({ group, onJoin, onLeave, isJoining }: GroupCardProps) {
  const isMember = !!group.membership;
  const isOwner = group.membership?.role === 'owner';
  const isPrivate = group.privacy === 'private';
  const isPending = !isMember && group.join_request?.status === 'pending';
  const hue = getHue(group.name || 'group');

  return (
    <Link
      to={`/groups/${group.slug}`}
      className="group block bg-card border border-border/60 rounded-2xl overflow-hidden hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-300"
    >
      {/* Cover */}
      <div className="relative h-28 sm:h-32">
        {group.cover_url ? (
          <img
            src={group.cover_url}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className="w-full h-full flex items-end justify-end p-3"
            style={{ background: `linear-gradient(135deg, hsl(${hue} 45% 14%), hsl(${hue} 45% 8%))` }}
          >
            <p className="font-black text-[64px] leading-none tracking-tighter text-white/10 select-none">
              {group.name?.charAt(0)?.toUpperCase()}
            </p>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/5 to-transparent" />

        {/* Privacy badge removed */}

        {/* Avatar */}
        <div className="absolute -bottom-5 left-4">
          <Avatar className="h-14 w-14 ring-4 ring-background bg-muted shadow-md">
            <AvatarImage src={group.avatar_url || undefined} />
            <AvatarFallback
              className="font-bold text-xl"
              style={{ backgroundColor: `hsl(${hue} 45% 16%)`, color: `hsl(${hue} 85% 75%)` }}
            >
              {group.name?.charAt(0)?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      <div className="pt-8 px-4 pb-4">
        <h3 className="font-black text-lg tracking-tight truncate group-hover:text-primary transition-colors">
          {group.name}
        </h3>
        {/* created-at and author removed */}

        {group.description && (
          <p className="text-sm text-muted-foreground/90 mt-2 line-clamp-2 leading-relaxed">{group.description}</p>
        )}

        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground font-bold">
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {group.member_count.toLocaleString()}
          </span>
          {/* post count removed */}
        </div>

        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isMember) onLeave?.(group.id);
            else onJoin?.(group.id);
          }}
          disabled={isJoining || isOwner || isPending}
          className={cn(
            'w-full mt-4 h-9 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5',
            isMember
              ? 'bg-surface text-foreground border border-border/60 hover:border-primary/30'
              : isPending
                ? 'bg-surface-2 text-muted-foreground border border-border/60 cursor-default'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20',
            isOwner && 'opacity-70 cursor-default'
          )}
        >
          {isJoining ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isOwner ? (
            <>
              <Check className="h-4 w-4" />
              Owner
            </>
          ) : isMember ? (
            <>
              <Check className="h-4 w-4" />
              Joined
            </>
          ) : isPending ? (
            <>
              <Clock className="h-4 w-4" />
              Request sent
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" />
              {isPrivate ? 'Request to Join' : 'Join Group'}
            </>
          )}
        </button>
      </div>
    </Link>
  );
}
