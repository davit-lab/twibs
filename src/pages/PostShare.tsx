import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, FileQuestion } from 'lucide-react';

export default function PostShare() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'missing'>('loading');

  useEffect(() => {
    if (!postId) {
      setStatus('missing');
      return;
    }

    const resolve = async () => {
      try {
        const { data, error } = await supabase
          .from('posts')
          .select('user_id, profiles!inner (username)')
          .eq('id', postId)
          .maybeSingle();

        if (error || !data || !data.profiles?.username) {
          setStatus('missing');
          return;
        }

        // Shared posts deep-link to the author's profile
        navigate(`/profile/${data.profiles.username}`, { replace: true });
      } catch {
        setStatus('missing');
      }
    };

    resolve();
  }, [postId, navigate]);

  if (status === 'missing') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="bg-card border border-border rounded-2xl p-12 text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-5">
            <FileQuestion className="w-8 h-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Post not found</h1>
          <p className="text-muted-foreground text-sm mb-6">
            This post doesn't exist or may have been removed.
          </p>
          <Button onClick={() => navigate('/')} className="px-6">
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm">
          Opening post… <Link to="/" className="text-primary hover:underline">Home</Link>
        </span>
      </div>
    </div>
  );
}
