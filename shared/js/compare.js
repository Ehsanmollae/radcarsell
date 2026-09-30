/*
 * Before/after slider. Markup:
 *   <div class="compare" style="--pos:50%">
 *     <img class="compare-after" …> <img class="compare-before" …>
 *     <input class="compare-range" type="range" min="0" max="100" value="50" aria-label="…">
 *   </div>
 * The range input drives --pos, so keyboard and screen readers work for free.
 */
export function initCompare(root) {
  const range = root.querySelector(".compare-range");
  const set = () => root.style.setProperty("--pos", `${range.value}%`);
  range.addEventListener("input", set);
  set();

  // A short nudge the first time it scrolls into view shows that it can be dragged.
  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    io.disconnect();
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 1400);
      range.value = 50 + Math.sin(t * Math.PI * 2) * 18 * (1 - t);
      set();
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, { threshold: 0.6 });
  io.observe(root);
}
