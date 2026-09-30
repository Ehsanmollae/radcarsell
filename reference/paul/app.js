import { initLanding, initAfterReveals } from "../shared/js/scroll-engine.js";
import { bindLeadForm } from "../shared/js/lead-form.js";
import { initTabs } from "../shared/js/tabs.js";

// Placeholder number until the lounge's real one is known.
const LOUNGE_WHATSAPP = "989110000000";

// The frame sequence rises for its first 84% and opens the doors after 80%,
// so with frameRange [2, 90] the elevator reaches floor 8 at about 76% scroll.
const FRAME_RANGE = [2, 90];
const ARRIVE_AT = (FRAME_RANGE[0] + 0.84 * (FRAME_RANGE[1] - FRAME_RANGE[0])) / 100;
const TOP_FLOOR = 8;

initLanding({
  frameRange: FRAME_RANGE,
  imageScale: 0.95,
  length: { desktop: 1000, mobile: 720 },
  wipe: "circle",
  porthole: { desktop: [20, 28, 54], mobile: [27, 50, 32] },
}).then((landing) => {
  initAfterReveals();
  if (landing) initFloorPanel();
});

// Elevator display: counts floors as the sequence climbs.
function initFloorPanel() {
  const panel = document.querySelector(".floor-panel");
  const num = panel.querySelector("[data-floor]");
  const label = panel.querySelector("[data-floor-label]");
  const start = FRAME_RANGE[0] / 100;
  let shown = 0;

  window.ScrollTrigger.create({
    trigger: "#scroll-container",
    start: "top top",
    end: "bottom bottom",
    onUpdate: ({ progress }) => {
      const t = Math.min(1, Math.max(0, (progress - start) / (ARRIVE_AT - start)));
      const floor = 1 + Math.round(t * (TOP_FLOOR - 1));
      if (floor === shown) return;
      shown = floor;
      num.textContent = floor.toLocaleString("fa-IR").padStart(2, "۰");
      const arrived = floor === TOP_FLOOR;
      panel.classList.toggle("is-arrived", arrived);
      label.textContent = arrived ? "پائول" : "طبقه";
    },
  });
}

// Every night has a DJ; mark tonight. Days use Date#getDay numbering.
const tonight = new Date().getDay();
document.querySelector(`.week li[data-day="${tonight}"]`)?.classList.add("is-tonight");

initTabs(document.querySelector(".tabs"));

const form = document.querySelector(".lead-form");
document.querySelectorAll("[data-party-cta]").forEach((a) => {
  a.addEventListener("click", () => {
    form.querySelector('input[name="kind"][value="اتاق جشن"]').checked = true;
  });
});

bindLeadForm(form, {
  phone: LOUNGE_WHATSAPP,
  build: ({ name, phone, kind, day, guests, note }) =>
    `سلام، ${name} هستم (${phone}).\nرزرو ${kind} برای ${day}، ${guests} نفر.${note ? `\n${note}` : ""}`,
});
