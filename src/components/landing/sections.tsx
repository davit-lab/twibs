import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Clapperboard,
  Compass,
  Heart,
  Home,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Send,
  Share2,
  Star,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/brand/BrandLogo';
import { useInView } from './hooks';
import {
  FEATURED,
  FEATURES,
  FOOTER_COLUMNS,
  HIGHLIGHTS,
  IMG,
  STATS,
  STEPS,
  STORY_NAMES,
  TRUST_AVATARS,
} from './landing-data';

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.1);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'transition-opacity duration-700 ease-out',
        inView ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: string;
}) {
  return (
    <div className="max-w-2xl mx-auto text-center mb-12 md:mb-16">
      <span className="inline-block text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
        {eyebrow}
      </span>
      <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
        {title}
      </h2>
      {sub && <p className="mt-4 text-base text-muted-foreground leading-relaxed">{sub}</p>}
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="mx-auto w-[290px] rounded-[2.5rem] border border-border bg-card p-1.5 shadow-xl">
      <div className="rounded-[2rem] overflow-hidden bg-background">
        <div className="flex items-center justify-between px-4 h-11 border-b border-border">
          <BrandLogo className="h-5" />
          <div className="flex items-center gap-3 text-muted-foreground">
            <Heart className="w-4 h-4" />
            <MessageCircle className="w-4 h-4" />
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          {STORY_NAMES.map((name, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <img
                src={TRUST_AVATARS[i]}
                alt=""
                className="w-11 h-11 rounded-full object-cover border-2 border-primary/30"
              />
              <span className="text-[9px] text-muted-foreground">{name}</span>
            </div>
          ))}
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img src={IMG.postAuthor} alt="" className="w-8 h-8 rounded-full object-cover" />
            <div>
              <div className="text-[12px] font-semibold text-foreground flex items-center gap-1">
                Mariam <BadgeCheck className="w-3 h-3 text-primary" />
              </div>
              <div className="text-[10px] text-muted-foreground">2 hours ago</div>
            </div>
            <MoreHorizontal className="w-4 h-4 text-muted-foreground ml-auto" />
          </div>

          <img
            src={IMG.postImage}
            alt=""
            className="mt-3 rounded-xl w-full aspect-[4/3] object-cover"
          />

          <div className="flex items-center gap-4 mt-3 text-foreground">
            <Star className="w-5 h-5 text-primary fill-primary" />
            <MessageCircle className="w-5 h-5" />
            <Share2 className="w-5 h-5" />
          </div>
          <p className="text-[12px] font-semibold text-foreground mt-2">1,248 stars</p>
          <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
            <span className="font-semibold text-foreground">Mariam</span> Sunrise hike today —
            worth every step.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-around py-2.5 px-2 border-t border-border">
        <Home className="w-5 h-5 text-primary" strokeWidth={2} fill="currentColor" />
        <Compass className="w-5 h-5 text-muted-foreground" />
        <Clapperboard className="w-5 h-5 text-muted-foreground" />
        <span className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center -mt-5">
          <Plus className="w-4 h-4 text-primary-foreground" strokeWidth={2.5} />
        </span>
        <Send className="w-5 h-5 text-muted-foreground" />
        <User className="w-5 h-5 text-muted-foreground" />
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative">
      <div className="max-w-7xl mx-auto px-5 lg:px-8 grid lg:grid-cols-2 gap-16 lg:gap-8 items-center pt-16 lg:pt-24 pb-20 lg:pb-28">
        <div className="text-center lg:text-left">
          <Reveal delay={60}>
            <h1 className="mt-6 text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.08] text-foreground">
              Share stories.
              <br />
              <span className="text-primary">Connect people.</span>
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Twibsers is the social home for creators, readers and friends — real-time messaging,
              stories, reels, books and voice & video calls in one place.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
              <Button size="lg" asChild className="w-full sm:w-auto">
                <Link to="/auth?mode=signup">
                  Get started
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                <Link to="/auth">Log in</Link>
              </Button>
            </div>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-8 flex items-center justify-center lg:justify-start gap-3">
              <div className="flex -space-x-2">
                {TRUST_AVATARS.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover ring-2 ring-background"
                  />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">50,000+ creators</span> already here
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={150} className="hidden lg:block">
          <PhoneMockup />
        </Reveal>
      </div>
    </section>
  );
}

function StatsStrip() {
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="max-w-6xl mx-auto px-5 lg:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
        {STATS.map((stat, i) => (
          <div key={i} className="text-center">
            <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
              {stat.value}
            </div>
            <div className="mt-1 text-xs text-muted-foreground uppercase tracking-wider font-medium">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Features"
            title={
              <>
                Everything you need, <span className="text-primary">nothing you don't</span>
              </>
            }
            sub="Built for creators, readers and communities — with the tools to share, connect and earn."
          />
        </Reveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feature, i) => (
            <Reveal key={i} delay={(i % 3) * 70}>
              <div className="h-full rounded-2xl border border-border bg-card p-6 transition-colors hover:border-violet-300 hover:bg-violet-50/40 dark:hover:border-violet-500/40 dark:hover:bg-violet-500/5">
                <div className="w-11 h-11 rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300 flex items-center justify-center">
                  <feature.icon className="w-5 h-5" />
                </div>
                <h3 className="mt-4 font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section id="how" className="py-20 md:py-28 bg-muted/30 border-y border-border">
      <div className="max-w-6xl mx-auto px-5 lg:px-8">
        <Reveal>
          <SectionHeading eyebrow="How it works" title="Up and running in minutes" />
        </Reveal>

        <div className="grid md:grid-cols-3 gap-8">
          {STEPS.map((step, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="relative h-full">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg shrink-0">
                    {i + 1}
                  </div>
                  {i < STEPS.length - 1 && <div className="hidden md:block flex-1 h-px bg-border" />}
                </div>
                <h3 className="mt-5 font-semibold text-foreground text-lg">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ShowcaseSection() {
  return (
    <section
      id="showcase"
      className="py-20 md:py-28 bg-pink-50/70 dark:bg-pink-500/5 border-y border-pink-100 dark:border-pink-500/10"
    >
      <div className="max-w-6xl mx-auto px-5 lg:px-8 grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        <div>
          <Reveal>
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-pink-600 dark:text-pink-400">
              Built for creators
            </span>
            <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
              Stay connected, <span className="text-primary">anywhere</span>
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Whether you're posting from your phone, publishing a book or going live to thousands
              — Twibsers keeps your audience within reach.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <ul className="mt-8 space-y-4">
              {HIGHLIGHTS.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300 flex items-center justify-center mt-0.5 shrink-0">
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-foreground font-medium">{item}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <div className="grid grid-cols-3 gap-4">
            {FEATURED.map((person, i) => (
              <figure key={i} className="text-center">
                <img
                  src={person.img}
                  alt={person.name}
                  className="w-full aspect-[3/4] rounded-2xl object-cover"
                />
                <figcaption className="mt-2.5">
                  <p className="text-sm font-semibold text-foreground">{person.name}</p>
                  <p className="text-xs text-muted-foreground">{person.role}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-5 lg:px-8">
        <Reveal>
          <div className="rounded-3xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 px-6 py-16 md:py-20 text-center">
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Your story starts here.
            </h2>
            <p className="mt-4 text-lg text-white/80 max-w-xl mx-auto leading-relaxed">
              Join 50,000+ creators building their audience on Twibsers. Free forever — it takes
              less than a minute to sign up.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                asChild
                className="w-full sm:w-auto bg-white text-violet-700 hover:bg-white/90 shadow-lg"
              >
                <Link to="/auth?mode=signup">
                  Create your account
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="w-full sm:w-auto border-white/40 text-white hover:bg-white/10 hover:border-white/70"
              >
                <Link to="/auth">Log in</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="max-w-7xl mx-auto px-5 lg:px-8 py-14 grid gap-10 lg:grid-cols-[1.3fr_2fr]">
        <div>
          <div className="flex items-center">
            <BrandLogo className="h-8" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground max-w-xs leading-relaxed">
            The social home for creators, readers and friends. Stories, books, messaging and calls —
            all in one place.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                {col.title}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© 2026 Twibsers. All rights reserved.</span>
          <span className="flex items-center gap-1.5">
            Made with <Heart className="w-3 h-3 text-pink-500 fill-pink-500" /> for creators
          </span>
        </div>
      </div>
    </footer>
  );
}

export {
  CtaSection,
  FeaturesSection,
  Footer,
  Hero,
  HowItWorksSection,
  ShowcaseSection,
  StatsStrip,
};
