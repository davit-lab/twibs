import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

const systemNoticeVariants = cva(
  cn(
    'relative flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm',
    'transition-colors',
  ),
  {
    variants: {
      variant: {
        info:    'border-blue-500/20 bg-blue-500/5 text-blue-100',
        success: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-100',
        warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        error:   'border-red-500/20 bg-red-500/5 text-red-100',
        account: 'border-violet-500/20 bg-violet-500/5 text-foreground',
        system:  'border-border bg-muted/30 text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  },
);

export interface SystemNoticeAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

export interface SystemNoticeProps
  // `title` is omitted because HTMLAttributes declares it as `string`, which
  // would forbid the ReactNode heading this component actually renders.
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof systemNoticeVariants> {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: SystemNoticeAction;
  dismissible?: boolean;
  onDismiss?: () => void;
}

export function SystemNotice({
  className,
  variant,
  icon,
  title,
  description,
  action,
  dismissible,
  onDismiss,
  ...props
}: SystemNoticeProps) {
  const isAccount = variant === 'account';

  return (
    <div
      className={cn(systemNoticeVariants({ variant }), className)}
      {...props}
    >
      {icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      <div className="flex-1 min-w-0">
        {title ? (
          <div className="flex items-center gap-1.5">
            <span className="font-semibold leading-tight">{title}</span>
          </div>
        ) : null}
        {description ? (
          <div
            className={cn(
              'text-sm opacity-90',
              !title && 'font-medium',
              isAccount && !title ? 'text-violet-300' : '',
            )}
          >
            {description}
          </div>
        ) : null}
      </div>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className={cn(
            'flex-shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap',
            'transition-colors',
            isAccount
              ? 'text-violet-600 hover:bg-violet-500/10 dark:text-violet-300'
              : 'hover:bg-black/5 dark:hover:bg-white/5',
          )}
        >
          {action.icon ? (
            <span className="mr-1 flex-shrink-0">{action.icon}</span>
          ) : null}
          {action.label}
        </button>
      ) : null}
      {dismissible && onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 rounded-lg p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
