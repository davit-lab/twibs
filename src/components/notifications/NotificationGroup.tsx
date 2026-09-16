import { ReactNode } from 'react';

export function NotificationGroup({
  bucket,
  count,
  children,
}: {
  bucket: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={bucket} className="pt-1">
      <div className="flex items-center gap-3 px-1">
        <h2 className="flex-shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
          {bucket}
        </h2>
        <span aria-hidden="true" className="h-px flex-1 bg-border/60" />
        {typeof count === 'number' && (
          <span className="flex-shrink-0 text-[11px] tabular-nums text-muted-foreground/50">
            {count}
          </span>
        )}
      </div>
      <div className="mt-1 divide-y divide-border/60">{children}</div>
    </section>
  );
}