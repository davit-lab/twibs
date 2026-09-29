import { Link } from 'react-router-dom';
import { Inbox, Loader2, MessageSquare, Package, ShoppingBag } from 'lucide-react';
import { useConversations } from '@/hooks/useConversations';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'C';
}

export function BusinessInboxTab({ businessId }: { businessId: string }) {
  const { conversations, loading, error, fetchConversations } = useConversations();
  const threads = conversations.filter((conversation) => conversation.type === 'business' && conversation.business_id === businessId);
  const unread = threads.reduce((total, conversation) => total + conversation.unread_count, 0);

  return (
    <section aria-labelledby="business-inbox-title">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Customer conversations</p>
          <div className="mt-1 flex items-center gap-2">
            <h2 id="business-inbox-title" className="text-xl font-bold">Inbox</h2>
            {unread > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{unread}</span>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Messages sent from products, orders and your Business profile appear here.</p>
        </div>
        <Button asChild><Link to="/messages"><MessageSquare className="mr-2 h-4 w-4" />Open full inbox</Link></Button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading conversations…</div>
      ) : error ? (
        <div className="py-12 text-center"><p className="font-semibold">Could not load the business inbox</p><p className="mt-1 text-sm text-muted-foreground">{error.message}</p><Button className="mt-4" variant="outline" onClick={() => void fetchConversations()}>Retry</Button></div>
      ) : threads.length === 0 ? (
        <div className="py-16 text-center">
          <Inbox className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <h3 className="mt-3 font-semibold">No customer messages yet</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">When someone chooses Message Business on your profile, product, or order, their conversation will appear here.</p>
        </div>
      ) : (
        <div className="divide-y divide-border border-b border-border">
          {threads.map((conversation) => (
            <Link
              key={conversation.id}
              to={`/messages?conv=${conversation.id}`}
              className="flex items-center gap-3 py-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Avatar className="h-11 w-11">
                <AvatarImage src={conversation.party.avatar_url || undefined} />
                <AvatarFallback>{initials(conversation.party.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{conversation.party.name}</p>
                  {conversation.unread_count > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label={`${conversation.unread_count} unread`} />}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{conversation.last_message?.content || 'New customer conversation'}</p>
                {(conversation.context_product_id || conversation.context_order_id) && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    {conversation.context_order_id ? <Package className="h-3 w-3" /> : <ShoppingBag className="h-3 w-3" />}
                    {conversation.context_order_id ? 'Order conversation' : 'Product enquiry'}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">Reply →</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
