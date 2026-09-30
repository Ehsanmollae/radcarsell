import { initLanding, initAfterReveals } from "./shared/js/scroll-engine.js";
import { bindLeadForm } from "./shared/js/lead-form.js";
import { initTabs } from "./shared/js/tabs.js";

// "تماس / واتساپ" on the brand's own graphics (brand/facts.md).
const WHATSAPP = "989119842354";

// The doors open over the first ~10% of the scroll, then the film plays to 92%.
const FRAME_RANGE = [4, 92];

const root = document.documentElement;
const tracker = document.querySelector(".tracker");
const steps = [...tracker.querySelectorAll("li")].map((li) => ({ li, at: parseFloat(li.dataset.at) }));
const first = steps[0].at;
const last = steps.at(-1).at;

initLanding({
  frameRange: FRAME_RANGE,
  imageScale: 1,
  blend: true,
  length: { desktop: 1000, mobile: 760 },
  wipe: "doors",
}).then((landing) => {
  initAfterReveals();
  if (landing) initRoute();
});

// Route tracker: each step lights when the scroll passes it; names only, no times or claims.
function initRoute() {
  let struck = false;
  let now = -1;
  window.ScrollTrigger.create({
    trigger: "#scroll-container",
    start: "top top",
    end: "bottom bottom",
    onUpdate: ({ progress: p }) => {
      if (!struck && p > 0.004) { struck = true; root.classList.add("is-struck"); }
      tracker.classList.toggle("is-hidden", p < 0.07);
      const route = Math.min(1, Math.max(0, (p - first) / (last - first)));
      tracker.style.setProperty("--route", route.toFixed(4));
      let n = -1;
      steps.forEach((s, i) => { if (p >= s.at) n = i; });
      if (n === now) return;
      now = n;
      steps.forEach((s, i) => {
        s.li.classList.toggle("is-done", i < n);
        s.li.classList.toggle("is-now", i === n);
      });
    },
  });
}

// Glass header, and the tracker steps aside, once the page content slides over the film.
const header = document.querySelector(".site-header");
new IntersectionObserver(([entry]) => {
  header.classList.toggle("is-solid", entry.isIntersecting || entry.boundingClientRect.top < 0);
}, { rootMargin: "0px 0px -100% 0px" }).observe(document.querySelector(".after"));
new IntersectionObserver(([entry]) => {
  tracker.classList.toggle("is-gone", entry.isIntersecting || entry.boundingClientRect.top < 0);
}, { rootMargin: "0px 0px -18% 0px" }).observe(document.querySelector(".after"));

initTabs(document.querySelector(".tabs"));

bindLeadForm(document.querySelector(".lead-form"), {
  phone: WHATSAPP,
  build: ({ model, year, budget, plate, city, phone }) =>
    [
      "سلام، برای استعلام خودرو پیام می‌دهم.",
      `مدل دلخواه: ${model}`,
      year && `سال: ${year}`,
      budget && `بودجه: ${budget}`,
      `نوع پلاک: ${plate}`,
      `شهر: ${city}`,
      `شماره: ${phone}`,
    ].filter(Boolean).join("\n"),
});
