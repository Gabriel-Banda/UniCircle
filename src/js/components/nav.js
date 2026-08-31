// UniCircle — nav.js
// Renders the left rail (desktop) and bottom tab bar (mobile) for every
// authenticated page. Call mountAppShell(activePage, profile) once the
// page's profile has loaded.

import { logOut } from "../auth.js";

const LINKS = [
  { id: "home", label: "Home", href: "home.html", icon: "home" },
  { id: "communities", label: "Communities", href: "communities.html", icon: "communities" },
  { id: "create", label: "Create", href: "discussions.html#new", icon: "create" },
  { id: "notifications", label: "Notifications", href: "notifications.html", icon: "bell" },
  { id: "profile", label: "Profile", href: "profile.html", icon: "user" },
];

// Desktop rail gets two extra entries (Search, Study Groups) that mobile's
// tab bar omits — mobile stays exactly the 5 links above, per spec.
const RAIL_EXTRA_AFTER_HOME = { id: "search", label: "Search", href: "search.html", icon: "search" };
const RAIL_EXTRA_AFTER_COMMUNITIES = { id: "study-groups", label: "Study Groups", href: "study-groups.html", icon: "groups" };

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  communities: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><path d="M10.5 9.5 13.5 14.5"/>',
  create: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4.5-6 7-6s6 2 7 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  groups: '<circle cx="9" cy="8" r="3"/><path d="M3 19c.7-3 3-5 6-5s5.3 2 6 5"/><path d="M16 4.5c1.7.3 3 1.8 3 3.5s-1.3 3.2-3 3.5"/><path d="M18.5 14c1.8.4 3.2 1.9 3.5 4"/>',
};

function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
}

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

export function mountAppShell(activePage, profile) {
  const railMount = document.getElementById("rail-mount");
  const tabMount = document.getElementById("tabbar-mount");

  if (railMount) {
    const railLinks = [LINKS[0], RAIL_EXTRA_AFTER_HOME, LINKS[1], RAIL_EXTRA_AFTER_COMMUNITIES, ...LINKS.slice(2)];
    railMount.innerHTML = `
      <nav class="rail" aria-label="Main navigation">
        <a href="home.html" class="rail-brand"><span class="dot">●</span> UniCircle</a>
        <ul class="rail-nav">
          ${railLinks.map(l => `
            <li>
              <a href="${l.href}" class="rail-link ${activePage === l.id ? "active" : ""}">
                ${icon(l.icon)} ${l.label}
              </a>
            </li>`).join("")}
        </ul>
        <div class="rail-footer">
          <a href="profile.html" class="rail-link" style="align-items:center;">
            <span class="avatar-chip">${initials(profile?.name)}</span> ${profile?.name || "Your profile"}
          </a>
          <button class="btn btn-ghost btn-block" id="rail-logout">Log out</button>
        </div>
      </nav>`;
    document.getElementById("rail-logout")?.addEventListener("click", () => logOut());
  }

  if (tabMount) {
    tabMount.innerHTML = `
      <nav class="tab-bar" aria-label="Main navigation">
        ${LINKS.map(l => `
          <a href="${l.href}" class="tab-link ${activePage === l.id ? "active" : ""}">
            ${icon(l.icon, 20)}<span>${l.label}</span>
          </a>`).join("")}
      </nav>`;
  }
}
