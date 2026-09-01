// UniCircle — toast.js
// Minimal toast notifications used across pages for success/error feedback.

let region = null;

function ensureRegion() {
  if (region) return region;
  region = document.createElement("div");
  region.className = "toast-region";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  document.body.appendChild(region);
  return region;
}

export function showToast(message, { type = "default", duration = 4000 } = {}) {
  const r = ensureRegion();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  r.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 200ms ease, transform 200ms ease";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px) scale(0.97)";
    setTimeout(() => el.remove(), 200);
  }, duration);
}
