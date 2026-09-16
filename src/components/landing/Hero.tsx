import { type Ref } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IMG } from './landing-data';
import { parallaxStyle, useParallax } from './hooks';
import { Eyebrow, Reveal } from './ui';

function Photo({
  refAttr,
  src,
  alt,
  wrap,
  box,
  eager,
}: {
  refAttr: Ref<HTMLDivElement>;
  src: string;
  alt: string;
  wrap: string;
  box: string;
  eager?: boolean;
}) {
  return (
    <div ref={refAttr} style={parallaxStyle()} className={`absolute ${wrap}`}>
      <div className={`overflow-hidden rounded-2xl border border-border shadow-2xl ${box}`}>
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          className="h-full w-full object-cover"
        />
      </div>
    </div>
  );
}

function EditorialImageGrid() {
  const driftTall = useParallax(-0.05);
  const driftMain = useParallax(0.05);
  const driftSmall = useParallax(0.12);
  const driftWide = useParallax(-0.09);

  return (
    <div className="relative mx-auto h-[430px] w-full max-w-[460px] sm:h-[520px] sm:max-w-[560px] lg:mx-0">
      <Reveal delay={120} className="absolute inset-0 z-10">
        <Photo
          refAttr={driftTall}
          src={IMG.heroTall}
          alt="Portrait of a creator on Twibsers"
          wrap="right-0 top-0 z-10 w-[44%]"
          box="aspect-[3/4]"
          eager
        />
        <Photo
          refAttr={driftMain}
          src={IMG.heroMain}
          alt="Friends sharing a moment"
          wrap="left-0 top-[9%] z-20 w-[60%]"
          box="aspect-[4/5]"
          eager
        />
        <Photo
          refAttr={driftSmall}
          src={IMG.heroSmall}
          alt="A travel memory posted as a story"
          wrap="left-0 top-0 z-30 w-[34%]"
          box="aspect-square ring-4 ring-background"
        />
        <Photo
          refAttr={driftWide}
          src={IMG.heroWide}
          alt="Friends catching up over coffee"
          wrap="bottom-0 right-0 z-30 w-[42%]"
          box="aspect-[4/3] ring-4 ring-background"
        />
      </Reveal>

      <Reveal delay={260} className="absolute left-[38%] top-[2%] z-40">
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2 shadow-xl">
          <span className="h-9 w-9 overflow-hidden rounded-full ring-2 ring-primary/70">
            <img src={IMG.avatarAuthor} alt="" className="h-full w-full object-cover" />
          </span>
          <div className="leading-tight">
            <p className="text-xs font-semibold text-foreground">Your story</p>
            <p className="text-[10px] text-muted-foreground">Fades in 24 hours</p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={340} className="absolute bottom-[20%] right-[-2%] z-40">
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2 shadow-xl">
          <span className="relative h-9 w-9 overflow-hidden rounded-full">
            <img src={IMG.avatarFriend} alt="" className="h-full w-full object-cover" />
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-background" />
          </span>
          <div className="leading-tight">
            <p className="text-xs font-semibold text-foreground">Ana</p>
            <p className="text-[10px] text-muted-foreground">Online now</p>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(60%_55%_at_50%_0%,hsl(var(--primary)/0.12),transparent_70%)]"
        aria-hidden="true"
      />
      <div className="relative mx-auto grid w-full max-w-7xl gap-16 px-5 pb-20 pt-14 lg:grid-cols-2 lg:items-center lg:gap-8 lg:px-8 lg:pb-28 lg:pt-24">
        <div className="text-center lg:text-left">
          <Reveal>
            <Eyebrow className="justify-center lg:justify-start">A home for your people</Eyebrow>
          </Reveal>

          <Reveal delay={70}>
            <h1 className="mt-6 text-[clamp(2.75rem,6vw,4.5rem)] font-bold leading-[1.04] tracking-tight text-foreground">
              Your people.
              <br />
              Your moments.
              <br />
              <span className="text-primary">Your world.</span>
            </h1>
          </Reveal>

          <Reveal delay={140}>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground lg:mx-0">
              Twibsers brings stories, reels, books, groups and calls into one feed — so the people
              you care about are never farther than a heartbeat away.
            </p>
          </Reveal>

          <Reveal delay={210}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Button size="lg" asChild className="w-full sm:w-auto">
                <Link to="/auth?mode=signup">
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                <Link to="/auth">Log in</Link>
              </Button>
            </div>
          </Reveal>

          <Reveal delay={280}>
            <p className="mt-6 text-sm text-muted-foreground/80">
              Free to join · No credit card · Made for everyone
            </p>
          </Reveal>
        </div>

        <EditorialImageGrid />
      </div>
    </section>
  );
}