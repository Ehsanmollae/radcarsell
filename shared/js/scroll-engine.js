/*
 * Scroll engine shared by every landing page.
 *
 * A page is a tall #scroll-container. While it scrolls, a fixed <canvas> plays
 * an image sequence (frames/<set>/0001.webp or .avif, per manifest.ext) and fixed .scene layers fade in
 * and out at their data-enter / data-leave progress (0–100).
 *
 * Frame sets and counts come from frames/manifest.json, written by
 * tools/extract-frames.ps1 or tools/placeholder_frames.py.
 *
 * Loading is interlaced: every 4th frame loads first so the whole scrub works
 * almost immediately at a lower frame rate, then the gaps fill in. The loader
 * hides after that first pass instead of waiting for every frame.
 */

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const Lenis = window.Lenis;
gsap.registerPlugin(ScrollTrigger);

const MOBILE_QUERY = "(max-width: 768px)";
const FIRST_PASS_STEP = 4;
const MAX_DPR = 2;

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const faNumber = (n, decimals = 0) =>
  n.toLocaleString("fa-IR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export async function initLanding(options = {}) {
  const config = {
    framesPath: "frames",
    frameRange: [4, 70],     // progress % over which the sequence plays
    imageScale: 0.9,         // < 1 leaves a padded border filled with bg
    length: { desktop: 900, mobile: 650 }, // container height in vh
    wipe: "circle",          // circle | rise | none
    porthole: { desktop: [19, 27, 54], mobile: [26, 50, 30] }, // [radius %, x %, y %] at scroll 0
    blend: false,            // cross-fade between neighbouring frames for a smoother scrub
    // "cover" fills the screen and crops the sides on tall phones; "width" keeps the full
    // frame width, pins it to the top and fades the space left at the bottom into bg.
    fit: { desktop: "cover", mobile: "cover" },
    ...options,
  };
  // "rise" wipe: % of the top still hidden at scroll 0; either key may be given alone.
  config.riseFrom = { desktop: 100, mobile: 100, ...options.riseFrom };
  config.fit = { desktop: "cover", mobile: "cover", ...options.fit };

  const root = document.documentElement;
  const container = document.getElementById("scroll-container");
  const canvas = document.getElementById("frame-canvas");
  const canvasWrap = canvas.closest(".canvas-wrap");
  const ctx = canvas.getContext("2d", { alpha: false });
  const scenes = [...document.querySelectorAll(".scene")];
  const dim = document.getElementById("dim");
  const progressBar = document.querySelector("[data-progress-bar]");
  const sceneIndex = document.querySelector("[data-scene-index]");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = window.matchMedia(MOBILE_QUERY).matches;
  const saveData = navigator.connection?.saveData === true;

  // manifest.version changes whenever frames are rebuilt, so browsers never mix old and new frames.
  const manifest = await fetch(`${config.framesPath}/manifest.json`, { cache: "no-cache" }).then((r) => r.json());
  const version = manifest.version ? `?v=${manifest.version}` : "";
  const setName = isMobile || saveData ? "mobile" : "desktop";
  const fitMode = isMobile ? config.fit.mobile : config.fit.desktop;
  const set = manifest[setName];
  const bg = config.bg || manifest.bg || "#000";
  const ext = manifest.ext || "webp";
  const frameUrl = (i) => `${config.framesPath}/${setName}/${String(i + 1).padStart(4, "0")}.${ext}${version}`;

  if (reducedMotion) {
    root.classList.add("is-static");
    await loadImage(`${config.framesPath}/poster.webp${version}`).then((img) => {
      sizeCanvas();
      drawImage(img);
    });
    hideLoader();
    runStaticCounters();
    return;
  }

  // ---- frames -------------------------------------------------------------
  const frames = new Array(set.count);
  let currentFrame = -1;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function loadFrame(i) {
    return loadImage(frameUrl(i)).then((img) => { frames[i] = img; }, () => {});
  }

  // Nearest loaded frame, so a gap in the interlaced load never shows blank.
  function nearestLoaded(i) {
    for (let d = 0; d < set.count; d++) {
      if (frames[i - d]) return frames[i - d];
      if (frames[i + d]) return frames[i + d];
    }
    return null;
  }

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    // Resizing resets the context, so smoothing is set again each time.
    ctx.imageSmoothingQuality = "high";
  }

  function drawImage(img, alpha = 1) {
    const cw = canvas.width, ch = canvas.height;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const byWidth = fitMode === "width" && ih * (cw / iw) < ch;
    const scale = (byWidth ? cw / iw : Math.max(cw / iw, ch / ih)) * config.imageScale;
    const dw = iw * scale, dh = ih * scale;
    const x = (cw - dw) / 2, y = byWidth ? 0 : (ch - dh) / 2;
    if (alpha === 1) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cw, ch);
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x, y, dw, dh);
    ctx.globalAlpha = 1;
    if (byWidth && alpha === 1) {
      // Fade the frame's lower edge into bg so the empty band below has no hard line.
      const fade = Math.min(dh * 0.18, ch * 0.12);
      const g = ctx.createLinearGradient(0, dh - fade, 0, dh);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, bg);
      ctx.fillStyle = g;
      ctx.fillRect(0, dh - fade, cw, fade + 1);
    }
  }

  // pos is a fractional frame index; with blend on, the next frame is laid over by the fraction.
  function drawFrame(pos) {
    const i = Math.floor(pos);
    const img = nearestLoaded(i);
    if (!img) return;
    drawImage(img);
    const t = pos - i;
    if (config.blend && t > 0.02 && frames[i] && frames[i + 1]) drawImage(frames[i + 1], t);
  }

  // ---- loader -------------------------------------------------------------
  const loaderBar = document.querySelector("[data-loader-bar]");
  const loaderPercent = document.querySelector("[data-loader-percent]");
  const firstPass = [];
  for (let i = 0; i < set.count; i += FIRST_PASS_STEP) firstPass.push(i);
  if (firstPass.at(-1) !== set.count - 1) firstPass.push(set.count - 1);

  let loaded = 0;
  await Promise.all(firstPass.map((i) => loadFrame(i).then(() => {
    loaded++;
    const pct = Math.round((loaded / firstPass.length) * 100);
    if (loaderBar) loaderBar.style.transform = `scaleX(${pct / 100})`;
    if (loaderPercent) loaderPercent.textContent = faNumber(pct);
  })));

  sizeCanvas();
  drawFrame(0);
  hideLoader();

  // Fill the gaps in the background, a few at a time.
  const rest = [];
  for (let i = 0; i < set.count; i++) if (!frames[i]) rest.push(i);
  (async () => {
    for (let k = 0; k < rest.length; k += 6) {
      await Promise.all(rest.slice(k, k + 6).map(loadFrame));
    }
  })();

  // ---- scroll -------------------------------------------------------------
  const lengthVh = isMobile ? config.length.mobile : config.length.desktop;
  const setContainerHeight = () => {
    container.style.height = `${Math.round((lengthVh / 100) * window.innerHeight)}px`;
  };
  setContainerHeight();

  const lenis = new Lenis({
    duration: 1.15,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const target = document.querySelector(a.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: 0, duration: 1.6 });
    });
  });

  const [fStart, fEnd] = config.frameRange.map((v) => v / 100);
  const sceneTimelines = scenes.map(buildSceneTimeline);
  // Counters inside a scene marked data-count-scrub follow the scroll instead of a timer:
  // they climb over the first 70% of the scene and hold the final value for the rest.
  const scrubCounters = [...document.querySelectorAll(".scene[data-count-scrub] [data-count]")].map((el) => {
    const scene = el.closest(".scene");
    return {
      el,
      to: parseFloat(el.dataset.count),
      decimals: parseInt(el.dataset.decimals || "0", 10),
      a: parseFloat(scene.dataset.enter) / 100,
      span: ((parseFloat(scene.dataset.leave) - parseFloat(scene.dataset.enter)) / 100) * 0.7,
      shown: null,
    };
  });
  const dimRange = (container.dataset.dim || "").split(",").map((v) => parseFloat(v) / 100);
  const marquees = [...document.querySelectorAll(".marquee")].map((el) => ({
    el,
    text: el.querySelector(".marquee-text"),
    range: el.dataset.range.split(",").map((v) => parseFloat(v) / 100),
  }));

  ScrollTrigger.create({
    trigger: container,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => update(self.progress),
  });
  update(0);

  function update(p) {
    const fp = clamp((p - fStart) / (fEnd - fStart));
    const pos = config.blend
      ? Math.round(fp * (set.count - 1) * 20) / 20 // 1/20-frame steps are enough for the cross-fade
      : Math.min(set.count - 1, Math.floor(fp * set.count));
    if (pos !== currentFrame) {
      currentFrame = pos;
      requestAnimationFrame(() => drawFrame(currentFrame));
    }

    updateWipe(p);
    if (dim && dimRange.length === 2) dim.style.opacity = rangeOpacity(p, dimRange, 0.035) * 0.9;
    marquees.forEach(({ el, text, range }) => {
      el.style.opacity = rangeOpacity(p, range, 0.03);
      text.style.transform = `translate3d(${(clamp((p - range[0]) / (range[1] - range[0])) * 40 - 5).toFixed(2)}%,0,0)`;
    });

    let active = -1;
    sceneTimelines.forEach((s, i) => {
      const inside = p >= s.enter && p <= s.leave;
      const past = p > s.leave;
      if (inside) active = i;
      if (inside || (past && s.persist)) s.show();
      else s.hide();
    });

    scrubCounters.forEach((c) => {
      const t = clamp((p - c.a) / c.span);
      const v = c.to * (1 - Math.pow(1 - t, 3));
      const text = faNumber(c.decimals ? v : Math.round(v), c.decimals);
      if (text !== c.shown) { c.shown = text; c.el.textContent = text; }
    });

    if (progressBar) progressBar.style.transform = `scaleX(${p})`;
    if (sceneIndex && active >= 0) {
      sceneIndex.textContent = `${faNumber(active + 1).padStart(2, "۰")} / ${faNumber(scenes.length).padStart(2, "۰")}`;
    }
    root.style.setProperty("--p", p.toFixed(4));
  }

  function updateWipe(p) {
    const [a, b] = [0.005, Math.max(fStart, 0) + 0.06];
    const t = clamp((p - a) / (b - a));
    const eased = t * t * (3 - 2 * t);
    if (config.wipe === "circle") {
      // The hero shows the first frame through a porthole that opens to full screen.
      const [r0, x0, y0] = isMobile ? config.porthole.mobile : config.porthole.desktop;
      const r = lerp(r0, 120, eased), x = lerp(x0, 50, eased), y = lerp(y0, 50, eased);
      canvasWrap.style.clipPath = `circle(${r.toFixed(2)}% at ${x.toFixed(2)}% ${y.toFixed(2)}%)`;
      // Keep the subject centred in the porthole; the offset is gone once it is full screen.
      canvas.style.transform = `translate3d(${(x - 50).toFixed(2)}vw, ${(y - 50).toFixed(2)}vh, 0)`;
    } else if (config.wipe === "rise") {
      // Like a roller door: riseFrom is how much of the top is still closed at scroll 0.
      const from = isMobile ? config.riseFrom.mobile : config.riseFrom.desktop;
      const edge = (1 - eased) * from;
      canvasWrap.style.clipPath = `inset(${edge.toFixed(2)}% 0 0 0)`;
      root.style.setProperty("--wipe-edge", edge.toFixed(2));
    } else {
      canvasWrap.style.opacity = eased;
    }
  }

  let resizeTimer;
  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      sizeCanvas();
      drawFrame(Math.max(currentFrame, 0));
      // Mobile browsers fire resize when the URL bar hides; only width matters.
      if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        setContainerHeight();
        ScrollTrigger.refresh();
      }
    }, 120);
  });

  initCounters();
  return { lenis, update };
}

// ---- scenes ---------------------------------------------------------------

const ENTRANCES = {
  "fade-up":     { y: 48, opacity: 0 },
  "slide-start": { x: 90, opacity: 0 },   // RTL: start edge is the right
  "slide-end":   { x: -90, opacity: 0 },
  "scale-up":    { scale: 0.86, opacity: 0, transformOrigin: "50% 100%" },
  "blur-in":     { opacity: 0, filter: "blur(14px)", y: 18 },
  "clip-reveal": { clipPath: "inset(0 0 100% 0)", y: 30 },
  "tilt-in":     { y: 40, rotation: -2.5, opacity: 0, transformOrigin: "100% 100%" },
};

function buildSceneTimeline(scene) {
  const enter = parseFloat(scene.dataset.enter) / 100;
  const leave = parseFloat(scene.dataset.leave) / 100;
  const persist = scene.dataset.persist === "true";
  const from = ENTRANCES[scene.dataset.anim] || ENTRANCES["fade-up"];
  const parts = scene.querySelectorAll("[data-reveal]");

  const tl = gsap.timeline({ paused: true });
  tl.set(scene, { autoAlpha: 1 });
  tl.from(parts, {
    ...from,
    duration: 0.95,
    ease: scene.dataset.anim === "clip-reveal" ? "power4.inOut" : "power3.out",
    stagger: 0.11,
    clearProps: "filter",
  });
  tl.call(() => scene.dispatchEvent(new CustomEvent("scene:shown")));

  let visible = false;
  return {
    enter, leave, persist,
    show() {
      if (visible) return;
      visible = true;
      scene.classList.add("is-active");
      tl.timeScale(1).play();
    },
    hide() {
      if (!visible) return;
      visible = false;
      scene.classList.remove("is-active");
      tl.timeScale(2.2).reverse();
    },
  };
}

function rangeOpacity(p, [a, b], fade) {
  if (p < a - fade || p > b + fade) return 0;
  if (p < a) return (p - (a - fade)) / fade;
  if (p > b) return 1 - (p - b) / fade;
  return 1;
}

// ---- counters ---------------------------------------------------------------

function initCounters() {
  document.querySelectorAll("[data-count]").forEach((el) => {
    if (el.closest(".scene[data-count-scrub]")) return; // driven by update() instead
    const to = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || "0", 10);
    const host = el.closest(".scene, section") || el;
    const state = { v: 0 };
    el.textContent = faNumber(0, decimals);
    const run = () => {
      state.v = 0;
      gsap.to(state, {
        v: to,
        duration: 1.8,
        ease: "power2.out",
        onUpdate: () => { el.textContent = faNumber(state.v, decimals); },
      });
    };
    if (host.classList.contains("scene")) host.addEventListener("scene:shown", run);
    else ScrollTrigger.create({ trigger: host, start: "top 75%", once: true, onEnter: run });
  });
}

function runStaticCounters() {
  document.querySelectorAll("[data-count]").forEach((el) => {
    el.textContent = faNumber(parseFloat(el.dataset.count), parseInt(el.dataset.decimals || "0", 10));
  });
}

function hideLoader() {
  const loader = document.getElementById("loader");
  if (!loader) return;
  loader.classList.add("is-done");
  setTimeout(() => loader.remove(), 900);
}

// ---- after-scroll reveals -------------------------------------------------
// Plain sections below the cinematic part use [data-rise] for a simple entrance.

export function initAfterReveals() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll("[data-rise]").forEach((el) => {
    gsap.from(el, {
      y: 40, opacity: 0, duration: 0.9, ease: "power3.out",
      delay: parseFloat(el.dataset.rise || "0"),
      scrollTrigger: { trigger: el, start: "top 85%", once: true },
    });
  });
}
