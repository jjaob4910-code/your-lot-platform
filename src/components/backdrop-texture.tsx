/**
 * Faint backdrop texture: a fine grid, two soft washes and a few thin
 * geometric shapes. Purely decorative — sits behind all page content.
 */
export function BackdropTexture() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* fine grid lines, fading out down the page */}
      <div className="backdrop-grid absolute inset-0" />

      {/* soft radial washes */}
      <div className="backdrop-glow absolute -top-40 left-1/2 h-[560px] w-[880px] -translate-x-1/2" />
      <div className="backdrop-glow absolute -left-48 bottom-[8%] size-[560px]" />

      {/* thin concentric circles, top right */}
      <svg
        className="absolute -right-28 top-40 size-[460px] text-primary"
        viewBox="0 0 460 460"
        fill="none"
      >
        <circle cx="230" cy="230" r="228" stroke="currentColor" strokeOpacity="0.09" />
        <circle cx="230" cy="230" r="156" stroke="currentColor" strokeOpacity="0.055" />
        <circle cx="230" cy="230" r="84" stroke="currentColor" strokeOpacity="0.04" />
      </svg>

      {/* thin diagonal lines, mid left */}
      <svg
        className="absolute -left-16 top-[42%] h-[340px] w-[340px] text-primary"
        viewBox="0 0 340 340"
        fill="none"
      >
        <line x1="0" y1="340" x2="340" y2="0" stroke="currentColor" strokeOpacity="0.08" />
        <line x1="60" y1="340" x2="340" y2="60" stroke="currentColor" strokeOpacity="0.05" />
      </svg>

      {/* horizontal hairline with a soft fade, lower third */}
      <svg
        className="absolute inset-x-0 top-[72%] h-px w-full text-foreground"
        preserveAspectRatio="none"
        viewBox="0 0 100 1"
      >
        <line x1="0" y1="0.5" x2="100" y2="0.5" stroke="currentColor" strokeOpacity="0.08" />
      </svg>

      {/* small square outlines drifting near the bottom */}
      <svg
        className="absolute bottom-[4%] right-[14%] size-40 text-primary"
        viewBox="0 0 160 160"
        fill="none"
      >
        <rect x="0.5" y="0.5" width="159" height="159" stroke="currentColor" strokeOpacity="0.07" />
        <rect x="52.5" y="52.5" width="55" height="55" stroke="currentColor" strokeOpacity="0.05" />
      </svg>
    </div>
  );
}
