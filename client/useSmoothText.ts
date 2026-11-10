import { useEffect, useRef, useState } from 'react';

// Reveals streamed text at a steady pace. Catches up within ~12 frames whatever the backlog.
export function useSmoothText(target: string, animate: boolean): string {
  const [shown, setShown] = useState(animate ? '' : target);
  const shownRef = useRef(shown);

  useEffect(() => {
    if (!animate) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    if (!target.startsWith(shownRef.current)) shownRef.current = ''; // the draft was reset
    let raf = 0;
    const tick = () => {
      const current = shownRef.current;
      const remaining = target.length - current.length;
      if (remaining <= 0) return;
      const step = Math.max(2, Math.ceil(remaining / 12));
      shownRef.current = target.slice(0, current.length + step);
      setShown(shownRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate]);

  return shown;
}
