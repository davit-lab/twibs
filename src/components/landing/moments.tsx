import { Clapperboard, Heart, MessageCircle, MoreHorizontal, PenLine, Play, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePublicMoments } from './public-content';
import { Eyebrow, Reveal, SectionShell } from './ui';

type MomentVariant = 'post' | 'story' | 'reel' | 'message';

const VARIANTS: Record<
  MomentVariant,
  { title: string; desc: string; icon: typeof PenLine }
> = {
  post: {
    title: 'Posts',
    desc: 'Full moments — photos, thoughts and the replies that follow.',
    icon: PenLine,
  },
  story: {
    title: 'Stories',
    desc: 'Slices of the day that are gone in 24 hours. That\'s the point.',
    icon: Timer,
  },
  reel: {
    title: 'Reels',
    desc: 'Short vertical video for the things words can\'t carry.',
    icon: Clapperboard,
  },
  message: {
    title: 'Messages & calls',
    desc: 'Talk to the people you actually care about — text, voice or video.',
    icon: MessageCircle,
  },
};

function AuthorM({ avatar, name }: { avatar: string | null; name: string }) {
  return (
    <div className="flex items-center gap-2">
      {avatar ? (
        <span className="h-7 w-7 overflow-hidden rounded-full ring-1 ring-white/40">
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        </span>
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-3 text-[10px] font-bold text-muted-foreground ring-1 ring-white/40">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-sm font-semibold text-white drop-shadow">{name}</span>
    </div>
  );
}

function MomentTile({
  variant,
  image,
  caption,
  authorName,
  authorAvatar,
}: {
  variant: MomentVariant;
  image: string;
  caption: string;
  authorName: string;
  authorAvatar: string | null;
}) {
  const meta = VARIANTS[variant];
  return (
    <article className="group overflow-hidden rounded-2xl border border-border bg-surface/60">
      <div className="relative aspect-[4/5] overflow-hidden">
        <img
          src={image}
          alt={caption}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        />

        {variant === 'story' && (
          <div className="absolute inset-x-0 top-0 z-10 flex gap-1.5 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <span
                key={i}
                className={cn('h-1 flex-1 rounded-full', i <= 1 ? 'bg-white' : 'bg-white/35')}
              />
            ))}
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/10" />

        <span className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/90">
          <meta.icon className="h-3 w-3" />
          {meta.title}
        </span>

        {variant === 'post' && (
          <span className="absolute bottom-3 right-3 z-10 text-white drop-shadow">
            <Heart className="h-5 w-5" />
          </span>
        )}

        {variant === 'reel' && (
          <span className="absolute inset-0 z-10 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white transition-transform duration-300 group-hover:scale-110">
              <Play className="h-5 w-5 fill-current" />
            </span>
          </span>
        )}

        {variant === 'message' && (
          <span className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white/90">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Online now
          </span>
        )}

        <div className="absolute bottom-3 left-3 z-10 flex items-end justify-between gap-2">
          <div>
            <AuthorM avatar={authorAvatar} name={authorName} />
            <p className="mt-1 max-w-[210px] truncate text-xs text-white/85 drop-shadow">{caption}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-border p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">{meta.title}</p>
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{meta.desc}</p>
      </div>
    </article>
  );
}

export function WhatIsTwibsers() {
  const { moments, source } = usePublicMoments(4);

  return (
    <SectionShell id="what">
      <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
        <Reveal>
          <Eyebrow>What is Twibsers</Eyebrow>
          <h2 className="mt-5 max-w-xl text-3xl font-bold tracking-tight text-foreground md:text-5xl md:leading-[1.08]">
            One place, four ways to be yourself
          </h2>
        </Reveal>
        <Reveal delay={110}>
          <p className="max-w-xl leading-relaxed text-muted-foreground lg:ml-auto">
            Posts for the long reads, stories for the in-between, reels when a moment deserves
            motion, and messages for the people you want to hear from right now.
          </p>
          {source === 'live' && (
            <p className="mt-4 flex items-center gap-2 text-xs font-medium text-muted-foreground lg:justify-end">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Real stories from Twibsers today
            </p>
          )}
        </Reveal>
      </div>

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(VARIANTS) as MomentVariant[]).map((variant, i) => {
          const m = moments[i];
          return (
            <Reveal key={variant} delay={i * 90}>
              <MomentTile
                variant={variant}
                image={m.image}
                caption={m.caption}
                authorName={m.authorName}
                authorAvatar={m.authorAvatar}
              />
            </Reveal>
          );
        })}
      </div>
    </SectionShell>
  );
}