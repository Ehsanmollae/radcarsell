/*
 * Lead forms hand the visitor to WhatsApp with a prefilled message instead of
 * posting to a server, so a static page on shared hosting still captures leads.
 * Pass `send(text)` to deliver the message some other way.
 */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export const toLatinDigits = (s) =>
  s.replace(/[۰-۹]/g, (d) => FA_DIGITS.indexOf(d)).replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d));

export function bindLeadForm(form, { phone, build, send }) {
  form.querySelectorAll("[data-digits]").forEach((input) => {
    input.addEventListener("input", () => {
      const pos = input.selectionStart;
      input.value = toLatinDigits(input.value);
      input.setSelectionRange(pos, pos);
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const text = build(Object.fromEntries(new FormData(form)));
    if (send) send(text);
    else window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    form.classList.add("is-sent");
  });
}
