import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useInView } from './hooks';

export function Reveal({
  children,
  className,
  delay = 0,
  y = 26,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.1);
  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out will-change-[opacity,transform]',
        inView ? 'opacity-100' : 'opacity-0',
        className,
      )}
      style={{ transform: inView ? 'none' : `translateY(${y}px)`, transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground',
        className,
      )}
    >
      <span className="h-px w-8 bg-primary" aria-hidden="true" />
      {children}
    </p>
  );
}

export function SectionShell({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn('mx-auto w-full max-w-7xl px-5 lg:px-8 py-24 lg:py-32', className)}>
      {children}
    </section>
  );
}