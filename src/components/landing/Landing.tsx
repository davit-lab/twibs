import { Navbar } from './Navbar';
import { Hero } from './Hero';
import { WhatIsTwibsers } from './moments';
import { ReelsShowcase, StoriesShowcase } from './stories';
import { MessagingShowcase } from './messaging';
import { CommunityShowcase, InterestsShowcase, LibraryShowcase } from './discovery';
import { FinalCTA, Footer, VisualBreak } from './outro';

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main>
        <Hero />
        <WhatIsTwibsers />
        <StoriesShowcase />
        <ReelsShowcase />
        <MessagingShowcase />
        <InterestsShowcase />
        <CommunityShowcase />
        <LibraryShowcase />
        <VisualBreak />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}