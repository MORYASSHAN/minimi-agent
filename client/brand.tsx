export const BRAND = 'Scout';
export const PORTFOLIO_URL = 'https://moryasshan.vercel.app';
export const REPO_URL = 'https://github.com/MORYASSHAN/minimi-agent';

export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M15.4 15.4l5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowUpRight() {
  return (
    <svg className="arrow-ur" viewBox="0 0 16 16" aria-hidden>
      <path d="M5 11l6-6M6 5h5v5" />
    </svg>
  );
}
