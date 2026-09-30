import { initLanding, initAfterReveals } from "../shared/js/scroll-engine.js";
import { bindLeadForm } from "../shared/js/lead-form.js";
import { initTabs } from "../shared/js/tabs.js";

// Placeholder sales number until the developer's real one is known.
const SALES_WHATSAPP = "989110000000";

initLanding({
  frameRange: [2, 90],
  imageScale: 1,
  blend: true,
  fit: { mobile: "width" },
  length: { desktop: 1000, mobile: 720 },
  wipe: "circle",
}).then(initAfterReveals);

initTabs(document.querySelector(".tabs"));

// Header gets a glass backing once the page content starts sliding under it.
const header = document.querySelector(".site-header");
new IntersectionObserver(([entry]) => {
  header.classList.toggle("is-solid", entry.isIntersecting || entry.boundingClientRect.top < 0);
}, { rootMargin: "0px 0px -100% 0px" }).observe(document.querySelector(".after"));

// The map draws Erfan Boulevard once the location section is on screen.
const locSection = document.querySelector(".location");
new IntersectionObserver(([entry], obs) => {
  if (!entry.isIntersecting) return;
  locSection.classList.add("is-drawn");
  obs.disconnect();
}, { threshold: 0.3 }).observe(locSection);

bindLeadForm(document.querySelector(".lead-form"), {
  phone: SALES_WHATSAPP,
  build: ({ name, phone, type }) =>
    `سلام، ${name} هستم (${phone}).\nکاتالوگ و جدول واحدهای ${type} برج باغ هرمس را می‌خواهم.`,
});
