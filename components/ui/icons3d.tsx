'use client';

/**
 * 3D-style app icons for the Header toolbar.
 * Each icon has a radial-gradient base + gloss highlight to simulate depth.
 */

// Unique prefix to avoid SVG gradient ID collisions
const uid = (name: string) => `icon3d-${name}`;

/* ── Refresh ─────────────────────────────────────────────────── */
export function RefreshIcon3D({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      width="30" height="30" viewBox="0 0 30 30" fill="none"
      className={spinning ? 'animate-spin' : undefined}
      style={{ filter: 'drop-shadow(0 2px 4px rgba(14,165,233,0.5))' }}
    >
      <defs>
        <radialGradient id={uid('sky-bg')} cx="38%" cy="32%" r="70%">
          <stop offset="0%"   stopColor="#bae6fd" />
          <stop offset="55%"  stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#075985" />
        </radialGradient>
        <radialGradient id={uid('sky-gl')} cx="48%" cy="22%" r="52%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Base */}
      <rect width="30" height="30" rx="9" fill={`url(#${uid('sky-bg')})`} />
      {/* Gloss */}
      <rect width="30" height="15" rx="9" fill={`url(#${uid('sky-gl')})`} />
      {/* Icon — refresh arrows */}
      <path d="M9 15a6 6 0 0 1 10.4-4.1" stroke="white" strokeWidth="2.1" strokeLinecap="round" fill="none" />
      <path d="M21 15a6 6 0 0 1-10.4 4.1" stroke="white" strokeWidth="2.1" strokeLinecap="round" fill="none" />
      <polyline points="19,10.9 21.2,10.9 21.2,8.7" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="11,19.1 8.8,19.1 8.8,21.3" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      {/* Shine */}
      <ellipse cx="11" cy="9.5" rx="4" ry="2.2" fill="white" opacity="0.25" />
    </svg>
  );
}

/* ── Help / Guide ─────────────────────────────────────────────── */
export function HelpIcon3D() {
  return (
    <svg
      width="30" height="30" viewBox="0 0 30 30" fill="none"
      style={{ filter: 'drop-shadow(0 2px 4px rgba(16,185,129,0.5))' }}
    >
      <defs>
        <radialGradient id={uid('em-bg')} cx="38%" cy="32%" r="70%">
          <stop offset="0%"   stopColor="#6ee7b7" />
          <stop offset="55%"  stopColor="#10b981" />
          <stop offset="100%" stopColor="#064e3b" />
        </radialGradient>
        <radialGradient id={uid('em-gl')} cx="48%" cy="22%" r="52%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="30" height="30" rx="9" fill={`url(#${uid('em-bg')})`} />
      <rect width="30" height="15" rx="9" fill={`url(#${uid('em-gl')})`} />
      {/* ? path */}
      <path
        d="M11.5 11.5 C11.5 9.0 13.0 7.5 15 7.5 C17.0 7.5 18.5 9.0 18.5 11.0 C18.5 12.8 17.2 13.5 16 14.2 L16 16"
        stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"
      />
      <circle cx="15" cy="19.5" r="1.4" fill="white" />
      <ellipse cx="11" cy="9.5" rx="4" ry="2.2" fill="white" opacity="0.25" />
    </svg>
  );
}

/* ── Bell / Notifications ─────────────────────────────────────── */
export function BellIcon3D() {
  return (
    <svg
      width="30" height="30" viewBox="0 0 30 30" fill="none"
      style={{ filter: 'drop-shadow(0 2px 4px rgba(245,158,11,0.5))' }}
    >
      <defs>
        <radialGradient id={uid('am-bg')} cx="38%" cy="32%" r="70%">
          <stop offset="0%"   stopColor="#fde68a" />
          <stop offset="55%"  stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#92400e" />
        </radialGradient>
        <radialGradient id={uid('am-gl')} cx="48%" cy="22%" r="52%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="30" height="30" rx="9" fill={`url(#${uid('am-bg')})`} />
      <rect width="30" height="15" rx="9" fill={`url(#${uid('am-gl')})`} />
      {/* Bell body */}
      <path
        d="M15 6.5 C11.4 6.5 8.5 9.4 8.5 13 L8.5 17 L7 19.5 L23 19.5 L21.5 17 L21.5 13 C21.5 9.4 18.6 6.5 15 6.5Z"
        fill="white" opacity="0.95"
      />
      {/* Bell stem */}
      <line x1="15" y1="5" x2="15" y2="7.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      {/* Clapper */}
      <path d="M12.5 19.5 C12.5 21.2 13.6 22.5 15 22.5 C16.4 22.5 17.5 21.2 17.5 19.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <ellipse cx="11" cy="9.5" rx="4" ry="2.2" fill="white" opacity="0.25" />
    </svg>
  );
}
