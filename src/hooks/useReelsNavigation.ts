import { useRef, useEffect, useCallback } from 'react';

interface UseReelsNavigationOptions {
  totalReels: number;
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
}

export function useReelsNavigation({ totalReels, currentIndex, setCurrentIndex }: UseReelsNavigationOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const lastScrollTime = useRef(0);

  const goToReel = useCallback((index: number) => {
    if (isScrollingRef.current) return;
    if (index < 0 || index >= totalReels) return;

    const now = Date.now();
    if (now - lastScrollTime.current < 300) return;

    isScrollingRef.current = true;
    lastScrollTime.current = now;
    setCurrentIndex(index);
    setTimeout(() => { isScrollingRef.current = false; }, 320);
  }, [totalReels, setCurrentIndex]);

  // Wheel navigation
  useEffect(() => {
    let accumulatedDelta = 0;
    let lastWheelTime = 0;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheelTime < 400) return;

      accumulatedDelta += e.deltaY;
      if (Math.abs(accumulatedDelta) > 60) {
        goToReel(currentIndex + (accumulatedDelta > 0 ? 1 : -1));
        accumulatedDelta = 0;
        lastWheelTime = now;
      }
    };

    const container = containerRef.current;
    if (container) container.addEventListener('wheel', handleWheel, { passive: false });
    return () => { if (container) container.removeEventListener('wheel', handleWheel); };
  }, [currentIndex, goToReel]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') goToReel(currentIndex + 1);
      if (e.key === 'ArrowUp' || e.key === 'k') goToReel(currentIndex - 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, goToReel]);

  return {
    containerRef,
    goToReel,
    isScrollingRef,
  };
}
