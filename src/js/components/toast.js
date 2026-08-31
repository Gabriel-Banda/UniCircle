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
  el.className = `toast enter-fast ${type}`;
  el.textContent = message;
  r.appendChild(el);
  setTimeout(() => el.remove(), duration);
}
