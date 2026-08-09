import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext, PaginationLink } from '@/components/ui/pagination';

interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  label?: string;
  onPageChange: (page: number) => void;
}

export default function PaginationBar({ page, totalPages, total, label = 'items', onPageChange }: PaginationBarProps) {
  const maxButtons = 5;
  const start = Math.max(0, Math.min(page - Math.floor(maxButtons / 2), totalPages - maxButtons));
  const buttons = Array.from({ length: Math.min(maxButtons, totalPages) }).map((_, i) => start + i);

  return (
    <div className="flex items-center justify-between mt-4 gap-2 flex-wrap">
      <p className="text-sm text-muted-foreground">{total} {label}</p>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(e) => { e.preventDefault(); if (page > 0) onPageChange(page - 1); }}
              className={page === 0 ? 'pointer-events-none opacity-50' : ''}
            />
          </PaginationItem>
          {buttons.map(i => (
            <PaginationItem key={i}>
              <PaginationLink href="#" isActive={page === i} onClick={(e) => { e.preventDefault(); onPageChange(i); }}>
                {i + 1}
              </PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(e) => { e.preventDefault(); if (page < totalPages - 1) onPageChange(page + 1); }}
              className={page >= totalPages - 1 ? 'pointer-events-none opacity-50' : ''}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
