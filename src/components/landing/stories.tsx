import { Link } from 'react-router-dom';
import { ArrowRight, Heart, MoreHorizontal, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { REELS, STORIES } from './landing-data';
import { Eyebrow, Reveal } from './ui';

function StoryCard() {
  const [hero, a, b] = STORIES;
  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-border shadow-2xl">
        <div className="relative aspect-[9/13]">
          <img src={hero.img} alt={`Story from ${hero.name}`} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25" />

          <div className="absolute inset-x-0 top-0 p-3">
            <div className="flex gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className={`h-1 flex-1 rounded-full ${i === 0 ? 'bg-white' : 'bg-white/40'}`} />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="h-8 w-8 overflow-hidden rounded-full ring-2 ring-primary/80">
                <img src={hero.thumb} alt="" className="h-full w-full object-cover" />
              </span>
              <span className="text-sm font-semibold text-white drop-shadow">{hero.name}</span>
              <span className="text-xs text-white/70">· 2h</span>
              <MoreHorizontal className="ml-auto h-4 w-4 text-white/80" />
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 p-4">
            <p className="text-sm font-medium leading-snug text-white drop-shadow">{hero.caption}</p>
            <p className="mt-1 text-xs text-white/70">Tap through the day</p>
          </div>
        </div>
      </div>

      <Reveal delay={180}>
        <div className="absolute -left-10 top-12 hidden w-24 -rotate-6 overflow-hidden rounded-2xl border border-border shadow-xl ring-4 ring-background sm:block">
          <img src={a.img} alt={`Story thumbnail from ${a.name}`} loading="lazy" className="aspect-[3/4] w-full object-cover" />
        </div>
      </Reveal>
      <Reveal delay={260}>
        <div className="absolute -right-9 bottom-16 hidden w-20 rotate-[5deg] overflow-hidden rounded-2xl border border-border shadow-xl ring-4 ring-background sm:block">
          <img src={b.img} alt={`Story thumbnail from ${b.name}`} loading="lazy" className="aspect-[3/4] w-full object-cover" />
        </div>
      </Reveal>
    </div>
  );
}

export function StoriesShowcase() {
  return (
    <section id="stories" className="border-y border-border bg-surface/40">
      <div className="mx-auto grid w-full max-w-7xl gap-16 px-5 py-24 lg:grid-cols-12 lg:items-center lg:gap-8 lg:px-8 lg:py-32">
        <div className="lg:col-span-5">
          <Reveal>
            <Eyebrow>Stories</Eyebrow>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-foreground md:text-5xl md:leading-[1.08]">
              Gone in a day.
              <br />
              Remembered for longer.
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
              Stories are the little moments — a commute, a first bite, a quiet win. They don't clog
              your feed, and they disappear before they start to matter less.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-7 flex items-center gap-4">
              {STORIES.map((s) => (
                <div key={s.name} className="flex flex-col items-center gap-1.5">
                  <span className="rounded-full bg-primary/70 p-[2.5px]">
                    <span className="block h-14 w-14 overflow-hidden rounded-full ring-2 ring-background">
                      <img src={s.thumb} alt={`${s.name}'s story`} loading="lazy" className="h-full w-full object-cover" />
                    </span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">{s.name}</span>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={250}>
            <div className="mt-8">
              <Button size="lg" asChild>
                <Link to="/auth?mode=signup">
                  Share your first story
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>

        <Reveal delay={140} className="lg:col-span-7">
          <StoryCard />
        </Reveal>
      </div>
    </section>
  );
}

function ReelCard({
  reel,
  main,
  className,
}: {
  reel: (typeof REELS)[number];
  main?: boolean;
  className?: string;
}) {
  return (
    <figure className={`group relative overflow-hidden rounded-2xl border border-border shadow-xl ${className}`}>
      <img src={reel.img} alt={`Reel from ${reel.handle}`} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20" />
      {main ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white transition-transform duration-300 group-hover:scale-110">
            <Play className="h-5 w-5 fill-current" />
          </span>
        </span>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/90">
            <Play className="h-3.5 w-3.5 fill-current" />
          </span>
        </span>
      )}
      <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3">
        <span className="h-6 w-6 overflow-hidden rounded-full ring-1 ring-white/40">
          <img src={reel.thumb} alt="" className="h-full w-full object-cover" />
        </span>
        <span className="text-xs font-semibold text-white drop-shadow">{reel.handle}</span>
        <span className="text-[10px] text-white/80">{reel.caption}</span>
        <Heart className="ml-auto h-4 w-4 shrink-0 text-white drop-shadow" />
      </figcaption>
    </figure>
  );
}

export function ReelsShowcase() {
  const [center, left, right] = REELS;
  return (
    <section id="reels" className="overflow-hidden">
      <div className="mx-auto grid w-full max-w-7xl gap-16 px-5 py-24 lg:grid-cols-12 lg:items-center lg:gap-8 lg:px-8 lg:py-32">
        <div className="lg:col-span-5">
          <Reveal>
            <Eyebrow>Reels</Eyebrow>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-foreground md:text-5xl md:leading-[1.08]">
              Watch what moves people
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
              Short vertical film for the moments that deserve motion — a stage, a skyline, a dance
              floor. Sound on, loop forever, share with your circle.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-8">
              <Button size="lg" asChild>
                <Link to="/auth?mode=signup">
                  Start posting reels
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>

        <Reveal delay={140} className="lg:col-span-7">
          <div className="flex items-start justify-center gap-4">
            <div className="hidden w-[28%] -rotate-3 opacity-60 transition hover:rotate-0 hover:opacity-100 sm:block">
              <ReelCard reel={left} className="aspect-[9/16]" />
            </div>
            <div className="w-[280px] max-w-full shrink-0 sm:w-[44%]">
              <ReelCard reel={center} main className="aspect-[9/16]" />
            </div>
            <div className="hidden w-[28%] rotate-3 translate-y-6 opacity-60 transition hover:rotate-0 hover:opacity-100 sm:block">
              <ReelCard reel={right} className="aspect-[9/16]" />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}