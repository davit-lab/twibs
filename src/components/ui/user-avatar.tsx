import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PremiumBadge } from '@/components/ui/premium-badge';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  userId?: string;
  avatarUrl?: string | null;
  displayName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showPremiumBadge?: boolean;
  className?: string;
  isPremium?: boolean; // Override for when you already know the status
}

const sizeClasses = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-16 w-16',
};

const badgeSizes: Record<string, 'sm' | 'md' | 'lg'> = {
  xs: 'sm',
  sm: 'sm',
  md: 'sm',
  lg: 'md',
  xl: 'lg',
};

export function UserAvatar({
  userId,
  avatarUrl,
  displayName = 'User',
  size = 'md',
  showPremiumBadge = true,
  className,
  isPremium: isPremiumOverride,
}: UserAvatarProps) {
  const { data: isPremiumFromDb } = usePremiumStatus(
    showPremiumBadge && isPremiumOverride === undefined ? userId : undefined
  );

  const isPremium = isPremiumOverride ?? isPremiumFromDb;

  return (
    <div className="relative inline-block">
      <Avatar className={cn(sizeClasses[size], className)}>
        <AvatarImage src={avatarUrl || undefined} alt={displayName} />
        <AvatarFallback />
      </Avatar>
      {showPremiumBadge && isPremium && (
        <PremiumBadge size={badgeSizes[size]} />
      )}
    </div>
  );
}

export default UserAvatar;
