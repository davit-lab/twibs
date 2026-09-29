import { useState } from 'react';
import { EyeOff, Flag, Info, Loader2, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCampaignActions } from '@/hooks/useAds';
import { AD_REPORT_REASONS } from '@/lib/ads';
import type { MarketplaceAd } from '@/lib/marketplace';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function SponsoredAdMenu({ ad, onDismiss }: { ad: MarketplaceAd; onDismiss: () => void }) {
  const { reportAd } = useCampaignActions();
  const [pending, setPending] = useState(false);

  const hide = async () => {
    setPending(true);
    const marketplaceRpc = supabase.rpc.bind(supabase) as unknown as (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const { error } = await marketplaceRpc('hide_marketplace_ad', {
      p_advertisement_id: ad.advertisement_id,
    });
    setPending(false);
    if (error) {
      toast.error('Could not hide this ad', { description: error.message });
      return;
    }
    onDismiss();
    toast.success('Ad hidden');
  };

  const report = async (reason: string) => {
    setPending(true);
    try {
      await reportAd(ad.advertisement_id, reason);
      onDismiss();
      toast.success('Ad reported', { description: 'Thanks. Our team will review it.' });
    } catch (error) {
      toast.error('Could not report this ad', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Sponsored ad options"
          disabled={pending}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-start gap-2 whitespace-normal font-normal leading-snug text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span><strong className="block text-foreground">Why you're seeing this</strong>{ad.why_text || 'Sponsored by a business on Twibs'}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void hide()}><EyeOff className="mr-2 h-4 w-4" />Hide this ad</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Flag className="mr-2 h-4 w-4" />Report ad</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {AD_REPORT_REASONS.map((reason) => (
              <DropdownMenuItem key={reason} onSelect={() => void report(reason)} className="capitalize">
                {reason}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
