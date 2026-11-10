/** Product name in one place. */
export const BRAND = 'Scout';

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6.2" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="10.5" cy="10.5" r="2.1" fill="currentColor" />
      <path d="M15.2 15.2l5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
