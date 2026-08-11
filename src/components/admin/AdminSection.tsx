import { ReactNode } from 'react';

interface AdminSectionProps {
  icon: React.ElementType;
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function AdminSection({
  icon: Icon,
  title,
  eyebrow = 'Admin',
  description,
  actions,
  children,
  className,
}: AdminSectionProps) {
  return (
    <section className={`admin-panel ${className ?? ''}`}>
      <header className="admin-panel-head">
        <div className="flex items-center gap-3 min-w-0">
          <div className="admin-icon-chip">
            <Icon className="w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0">
            <p className="admin-eyebrow">{eyebrow}</p>
            <h2 className="font-bold text-base leading-tight truncate">{title}</h2>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 sm:ml-auto">{actions}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
