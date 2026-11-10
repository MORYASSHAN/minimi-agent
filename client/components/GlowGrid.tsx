import { useEffect, useRef } from 'react';

const TILE = 52;

// Near-black to magenta (#fb64fa), sampled once per tile so the glow reads as soft pixels.
const STOPS: Array<[number, [number, number, number]]> = [
  [0, [15, 15, 15]],
  [0.32, [34, 14, 34]],
  [0.6, [84, 26, 86]],
  [0.84, [150, 50, 152]],
  [1, [196, 74, 198]],
];

function ramp(t: number): [number, number, number] {
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i]!;
    const [t0, c0] = STOPS[i - 1]!;
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
    }
  }
  return STOPS[STOPS.length - 1]![1];
}

/**
 * Tile grid with a magenta glow that eases toward the cursor, plus a small spotlight
 * right under it. Canvas draws flat tiles; a CSS layer adds the soft bevel. It only
 * redraws while something is moving, so it costs nothing when idle.
 */
export function GlowGrid({ visible }: { visible: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    const glow = { x: 0.28, y: 0.18 };
    const target = { ...glow };
    const pointer = { x: -999, y: -999, strength: 0, goal: 0 };
    let raf = 0;

    const draw = () => {
      const cols = Math.ceil(width / TILE) + 1;
      const rows = Math.ceil(height / TILE) + 1;
      const gx = glow.x * width;
      const gy = glow.y * height;
      const radius = Math.max(width, height) * 0.78;
      const spot = TILE * 3.6;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = c * TILE + TILE / 2;
          const cy = r * TILE + TILE / 2;
          let t = Math.max(0, 1 - Math.hypot(cx - gx, (cy - gy) * 1.2) / radius);
          t = t * t * (3 - 2 * t);
          if (pointer.strength > 0.01) {
            const near = Math.max(0, 1 - Math.hypot(cx - pointer.x, cy - pointer.y) / spot);
            t = Math.min(1, t + near * near * 0.32 * pointer.strength);
          }
          const [red, green, blue] = ramp(t);
          ctx.fillStyle = `rgb(${red | 0},${green | 0},${blue | 0})`;
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
    };

    const tick = () => {
      glow.x += (target.x - glow.x) * 0.055;
      glow.y += (target.y - glow.y) * 0.055;
      pointer.strength += (pointer.goal - pointer.strength) * 0.12;
      draw();
      const moving = Math.abs(target.x - glow.x) + Math.abs(target.y - glow.y) > 0.0006 || Math.abs(pointer.goal - pointer.strength) > 0.01;
      raf = moving ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.goal = 1;
      if (!reduceMotion) {
        target.x = e.clientX / width;
        target.y = e.clientY / height;
      }
      kick();
    };
    const onLeave = () => {
      pointer.goal = 0;
      kick();
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div className={`glow ${visible ? '' : 'glow--hidden'}`} aria-hidden>
      <canvas ref={canvasRef} className="glow__canvas" />
      <div className="glow__tiles" style={{ backgroundSize: `${TILE}px ${TILE}px` }} />
      <div className="glow__vignette" />
    </div>
  );
}
