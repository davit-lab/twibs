import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import BrandLogo from '@/components/brand/BrandLogo';

interface LegalLayoutProps {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}

export default function LegalLayout({ title, updatedAt, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Twibsers
          </Link>
          <Link to="/" aria-label="Twibsers home">
            <BrandLogo className="h-7" />
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight mb-1">{title}</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {updatedAt}</p>

        <div className="space-y-8">
          <div className="flex flex-wrap gap-2 mb-2">
            <Link to="/terms" className="text-sm px-3 py-1 rounded-full border border-border font-medium hover:bg-surface-2 transition-colors">Terms of Service</Link>
            <Link to="/privacy" className="text-sm px-3 py-1 rounded-full border border-border font-medium hover:bg-surface-2 transition-colors">Privacy Policy</Link>
            <Link to="/community-guidelines" className="text-sm px-3 py-1 rounded-full border border-border font-medium hover:bg-surface-2 transition-colors">Community Guidelines</Link>
          </div>

          <article className="space-y-6 leading-relaxed text-[15px] text-foreground/90">
            {children}
          </article>
        </div>

        <footer className="mt-16 pt-6 border-t border-border/60 text-xs text-muted-foreground">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/community-guidelines" className="hover:text-foreground transition-colors">Guidelines</Link>
            <a href="mailto:support@twibsers.com" className="hover:text-foreground transition-colors">Contact support</a>
          </div>
          <p className="mt-3">© {new Date().getFullYear()} Twibsers. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}
