import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/brand/BrandLogo';
import { VISUAL_BREAK_IMAGE } from './landing-data';
import { parallaxStyle, useParallax } from './hooks';
import { Eyebrow, Reveal } from './ui';

export function VisualBreak() {
  const drift = useParallax(-0.14);
  return (
    <section className="relative overflow-hidden">
      <div ref={drift} style={parallaxStyle()} className="absolute inset-x-0 -bottom-[15%] -top-[15%]">
        <img
          src={VISUAL_BREAK_IMAGE}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="absolute inset-0 bg-black/30" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />

      <div className="relative mx-auto flex min-h-[520px] w-full max-w-7xl flex-col items-center justify-center px-5 py-24 text-center lg:px-8">
        <Reveal>
          <p className="text-2xl font-bold leading-tight tracking-tight text-white drop-shadow sm:text-3xl lg:text-5xl">
            Life happens everywhere.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-4 text-base text-white/85 drop-shadow sm:text-lg">Bring it all together on Twibsers.</p>
        </Reveal>
        <Reveal delay={220}>
          <div className="mt-8">
            <Button size="lg" asChild>
              <Link to="/auth?mode=signup">
                Get started free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto w-full max-w-3xl px-5 py-28 text-center lg:px-8 lg:py-40">
        <Reveal>
          <Eyebrow className="justify-center">Twibsers</Eyebrow>
        </Reveal>
        <Reveal delay={90}>
          <h2 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-6xl">
            Your circle is waiting.
          </h2>
        </Reveal>
        <Reveal delay={170}>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Stories, reels, books, groups and calls — under one name. Free to join, no credit card,
            and it all fits in your pocket.
          </p>
        </Reveal>
        <Reveal delay={250}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild className="w-full sm:w-auto">
              <Link to="/auth?mode=signup">
                Create your account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
              <Link to="/auth">Log in</Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const FOOTER_COLUMNS: Array<{ title: string; links: Array<{ label: string; to: string }> }> = [
  {
    title: 'Product',
    links: [
      { label: 'Reels', to: '/reels' },
      { label: 'Messages', to: '/messages' },
      { label: 'Library', to: '/library' },
      { label: 'Explore', to: '/explore' },
    ],
  },
  {
    title: 'Discover',
    links: [
      { label: 'Interests', to: '/interests' },
      { label: 'Groups', to: '/groups' },
      { label: 'Pricing', to: '/pricing' },
    ],
  },
  {
    title: 'Get started',
    links: [
      { label: 'Create account', to: '/auth?mode=signup' },
      { label: 'Log in', to: '/auth' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of Service', to: '/terms' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Community Guidelines', to: '/community-guidelines' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 py-16 lg:grid-cols-[1.3fr_2fr] lg:px-8">
        <div>
          <Link to="/" className="inline-flex" aria-label="Twibsers home">
            <BrandLogo className="h-8" />
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Twibsers is the social home for creators, readers and friends — stories, reels, books,
            groups and calls in one place.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-muted-foreground sm:flex-row lg:px-8">
          <span>© 2026 Twibsers. All rights reserved.</span>
          <span className="flex items-center gap-4">
            <Link to="/terms" className="transition-colors hover:text-foreground">Terms</Link>
            <Link to="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}