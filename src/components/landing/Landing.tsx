import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/brand/BrandLogo';
import { NAV_LINKS } from './landing-data';
import {
  CtaSection,
  FeaturesSection,
  Footer,
  Hero,
  HowItWorksSection,
  ShowcaseSection,
  StatsStrip,
} from './sections';

function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 bg-background transition-shadow',
        scrolled ? 'border-b border-border shadow-sm' : 'border-b border-transparent',
      )}
    >
      <div className="max-w-7xl mx-auto px-5 lg:px-8 flex items-center justify-between h-14">
        <Link to="/" className="flex items-center">
          <BrandLogo className="h-8" />
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/auth">Log in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/auth?mode=signup">Sign up</Link>
          </Button>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="md:hidden w-10 h-10 rounded-lg border border-border flex items-center justify-center text-foreground"
          aria-label="Toggle menu"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <div className={cn('md:hidden overflow-hidden transition-all duration-300', open ? 'max-h-96' : 'max-h-0')}>
        <div className="px-5 pt-2 pb-5 space-y-1 border-t border-border bg-background">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {link.label}
            </a>
          ))}
          <div className="flex gap-3 pt-3">
            <Button variant="outline" className="flex-1" asChild>
              <Link to="/auth" onClick={() => setOpen(false)}>
                Log in
              </Link>
            </Button>
            <Button className="flex-1" asChild>
              <Link to="/auth?mode=signup" onClick={() => setOpen(false)}>
                Sign up
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav />
      <main>
        <Hero />
        <StatsStrip />
        <FeaturesSection />
        <HowItWorksSection />
        <ShowcaseSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
