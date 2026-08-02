import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string;
  alt?: string;
}

export default function BrandLogo({ className, alt = 'Twibsers' }: BrandLogoProps) {
  return (
    <img
      src="/imigelogo.png"
      alt={alt}
      className={cn('h-8 w-auto object-contain', className)}
    />
  );
}
