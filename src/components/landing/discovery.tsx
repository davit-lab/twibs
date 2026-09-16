import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COMMUNITIES, INTERESTS, LIBRARY_COVERS } from './landing-data';
import { Eyebrow, Reveal, SectionShell } from './ui';

export function InterestsShowcase() {
  return (
    <SectionShell id="interests">
      <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
        <Reveal>
          <Eyebrow>Discovery</Eyebrow>
          <h2 className="mt-5 max-w-xl text-3xl font-bold tracking-tight text-foreground md:text-5xl md:leading-[1.08]">
            Find your people
          </h2>
        </Reveal>
        <Reveal delay={110}>
          <p className="max-w-xl leading-relaxed text-muted-foreground lg:ml-auto">
            Your feed isn't powered by algorithms guessing your mood. Pick what you love and watch
            your circle form around it.
          </p>
        </Reveal>
      </div>

      <div className="mt-14 grid grid-cols-2 gap-4 md:grid-cols-3 lg:gap-5">
        {INTERESTS.map((interest, i) => (
          <Reveal key={interest.label} delay={(i % 3) * 90}>
            <figure className="group relative overflow-hidden rounded-2xl border border-border">
              <img
                src={interest.img}
                alt={interest.label}
                loading="lazy"
                className="aspect-[4/5] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
              <figcaption className="absolute inset-x-0 bottom-0 p-4">
                <p className="text-base font-bold uppercase tracking-[0.14em] text-white drop-shadow">
                  {interest.label}
                </p>
                <p className="mt-0.5 text-xs text-white/80">{interest.sub}</p>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
}

const COMMUNITY_POINTS = [
  'Spaces for anything — books, runs, music, photography.',
  'Tools to welcome, moderate and grow your space.',
  'Your groups, your rules — public or private.',
];

export function CommunityShowcase() {
  return (
    <section id="groups" className="border-y border-border bg-surface/40">
      <div className="mx-auto grid w-full max-w-7xl gap-16 px-5 py-24 lg:grid-cols-2 lg:items-center lg:gap-8 lg:px-8 lg:py-32">
        <div>
          <Reveal>
            <Eyebrow>Communities</Eyebrow>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-foreground md:text-5xl md:leading-[1.08]">
              Bring people together
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
              Start a space around the thing you can't stop talking about. Invite the whole city or
              keep it to seven friends — communities are built at the size you want them.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <ul className="mt-7 max-w-md space-y-3.5">
              {COMMUNITY_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <span className="mt-[9px] h-1 w-4 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span className="text-sm leading-relaxed text-foreground/90">{point}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={250}>
            <div className="mt-8">
              <Button size="lg" asChild>
                <Link to="/auth?mode=signup">
                  Find your community
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>

        <div className="flex flex-col gap-5">
          {COMMUNITIES.map((group, i) => (
            <Reveal key={group.name} delay={i * 110} className={i === 1 ? 'md:translate-x-8' : ''}>
              <article className="flex overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-lg">
                <img
                  src={group.img}
                  alt={group.name}
                  loading="lazy"
                  className="aspect-[4/5] w-28 shrink-0 object-cover sm:w-36"
                />
                <div className="flex min-w-0 flex-col p-4 sm:p-5">
                  <h3 className="font-semibold text-foreground">{group.name}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {group.tagline}
                  </p>
                  <span className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground">
                    Open community
                  </span>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LibraryShowcase() {
  return (
    <SectionShell id="library">
      <div className="grid items-center gap-16 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-6">
          <Reveal>
            <Eyebrow>Digital library</Eyebrow>
            <h2 className="mt-5 max-w-xl text-3xl font-bold tracking-tight text-foreground md:text-5xl md:leading-[1.08]">
              A shelf that travels with you
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
              Read any book, PDF or draft wherever you are. Keep your progress in place, pick up the
              page mid-thought, and share the story with a friend in one tap.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-8">
              <Button size="lg" asChild>
                <Link to="/auth?mode=signup">
                  Start your shelf
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>

        <Reveal delay={140} className="lg:col-span-6">
          <div className="relative mx-auto flex max-w-[560px] items-end justify-center">
            <div className="flex items-end gap-3">
              {LIBRARY_COVERS.map((cover, i) => (
                <div
                  key={cover}
                  className={`w-[104px] overflow-hidden rounded-md border border-white/10 shadow-xl sm:w-[124px] ${
                    i === 0 ? '-rotate-6 translate-y-2' : i === 1 ? 'z-10' : 'rotate-6 translate-y-2'
                  }`}
                >
                  <img
                    src={cover}
                    alt="A book on a Twibsers library shelf"
                    loading="lazy"
                    className="aspect-[3/4] w-full object-cover"
                  />
                </div>
              ))}
            </div>

            <Reveal delay={240}>
              <div className="absolute -right-2 bottom-8 w-44 rounded-xl border border-border bg-background px-4 py-3 shadow-xl sm:-right-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Reading progress
                </p>
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full w-[62%] rounded-full bg-primary" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Pick up where you left off</p>
              </div>
            </Reveal>
          </div>
        </Reveal>
      </div>
    </SectionShell>
  );
}