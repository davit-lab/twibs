import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Video, Plus, Home, Loader2, Users } from 'lucide-react';

interface ReelEmptyStateProps {
  isRefreshing: boolean;
  onRefresh: () => void;
  isFollowingFeed?: boolean;
}

export default function ReelEmptyState({ isRefreshing, onRefresh, isFollowingFeed = false }: ReelEmptyStateProps) {
  return (
    <div className="h-screen w-full bg-black flex flex-col items-center justify-center text-white px-6">
      <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/35">
        {isFollowingFeed ? 'Following' : 'Reels'}
      </p>
      <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center mb-4">
        {isFollowingFeed ? <Users className="h-7 w-7 text-primary/80" /> : <Video className="h-7 w-7 text-primary/80" />}
      </div>
      <h2 className="text-xl font-bold mb-1.5 text-center">
        {isFollowingFeed ? 'No reels from following' : 'No reels yet'}
      </h2>
      <p className="text-white/40 mb-6 text-center max-w-xs text-sm leading-relaxed">
        {isFollowingFeed ? 'Follow more creators to see their reels here' : 'Be the first to share amazing short videos'}
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={onRefresh} disabled={isRefreshing} className="gap-2 bg-white text-black hover:bg-white/90 rounded-full px-6">
          {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Refresh
        </Button>
        <Link to="/">
          <Button variant="outline" className="gap-2 w-full border-white/20 text-white hover:bg-white/10 rounded-full px-6">
            <Home className="h-4 w-4" /> Go Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
