import { useEffect, useState } from 'react';
import { isBrowserOffline } from '@/lib/network';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => !isBrowserOffline());

  useEffect(() => {
    const update = () => setIsOnline(!isBrowserOffline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return isOnline;
}

