import { Link } from 'react-router-dom';
import { ArrowRight, Phone, Send, SmilePlus, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IMG, MESSAGING_PHOTOS } from './landing-data';
import { Eyebrow, Reveal } from './ui';

function ChatPreview() {
  return (
    <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="relative h-9 w-9 overflow-hidden rounded-full">
          <img src={IMG.avatarFriend} alt="" className="h-full w-full object-cover" />
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-card" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-foreground">Ana</p>
          <p className="text-[11px] text-success">Online now</p>
        </div>
        <div className="ml-auto flex items-center gap-1 text-muted-foreground">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-2 hover:text-foreground">
            <Phone className="h-4 w-4" />
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-2 hover:text-foreground">
            <Video className="h-4 w-4" />
          </span>
        </div>
      </div>

      <div className="space-y-3 px-4 py-5">
        <div className="flex items-end gap-2">
          <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full">
            <img src={IMG.avatarFriend} alt="" className="h-full w-full object-cover" />
          </span>
          <span className="message-other px-3.5 py-2 text-sm leading-snug">Are you free tonight?</span>
        </div>

        <div className="flex justify-end">
          <span className="message-own max-w-[75%] px-3.5 py-2 text-sm leading-snug">
            Just landed — I'll be there by 20:00
          </span>
        </div>

        <div className="flex items-end gap-2">
          <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full">
            <img src={IMG.avatarFriend} alt="" className="h-full w-full object-cover" />
          </span>
          <span className="message-other px-3.5 py-2 text-sm leading-snug">
            Perfect. Street's full of lights tonight.
          </span>
        </div>

        <div className="flex items-end gap-2">
          <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full">
            <img src={IMG.avatarFriend} alt="" className="h-full w-full object-cover" />
          </span>
          <span className="typing-bubble">
            <span />
            <span />
            <span />
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <span className="orbis-input-wrap h-10">
          <span className="flex-1 px-2 text-sm text-muted-foreground">Say something…</span>
          <SmilePlus className="h-4 w-4 text-muted-foreground" />
        </span>
        <span className="send-btn">
          <Send className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

export function MessagingShowcase() {
  return (
    <section id="messaging" className="border-y border-border bg-surface/40">
      <div className="mx-auto grid w-full max-w-7xl gap-16 px-5 py-24 lg:grid-cols-2 lg:items-center lg:gap-8 lg:px-8 lg:py-32">
        <div>
          <Reveal>
            <Eyebrow>Messaging &amp; calls</Eyebrow>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-foreground md:text-5xl md:leading-[1.08]">
              Stay close, even when you're apart
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
              Real-time text, voice notes and calls with the people who matter. Read receipts, live
              presence and zero noise from anyone you didn't choose.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-7 flex max-w-md gap-3">
              {MESSAGING_PHOTOS.map((photo) => (
                <figure key={photo.label} className="group relative flex-1 overflow-hidden rounded-2xl border border-border">
                  <img
                    src={photo.img}
                    alt={`People catching up — ${photo.label}`}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
                  <figcaption className="absolute bottom-2 left-3 text-xs font-semibold text-white drop-shadow">
                    {photo.label}
                  </figcaption>
                </figure>
              ))}
            </div>
          </Reveal>

          <Reveal delay={250}>
            <div className="mt-8">
              <Button size="lg" asChild>
                <Link to="/auth?mode=signup">
                  Start a conversation
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>

        <Reveal delay={140}>
          <ChatPreview />
        </Reveal>
      </div>
    </section>
  );
}