# UniCircle

A student discussion platform organized around real academic identity:
**Institution → Faculty/School → Program → Academic Year → Course → Discussions**

Vanilla HTML/CSS/JS frontend. Supabase (Postgres + Auth) backend — no framework, real persistence, real multi-user auth, row-level security.

---

## Why Supabase

The brief asks for a framework-free frontend with persistent, secure, multi-user auth and data. That combination needs a real backend — Supabase gives you:

- Email/password auth with sessions, password reset, and a JS client that works fine with plain `fetch`/ES modules (no React required)
- Postgres with **row-level security (RLS)**, which is how "a user must not be able to manipulate requests to access another user's private data" actually gets enforced — on the database, not just in frontend JS
- A generated REST/JS API, so `js/api.js` stays thin

You'll need your own free Supabase project (supabase.com) — I can't provision one for you from here. Once you have a project:

1. Run `supabase/schema.sql` in the Supabase SQL editor — creates every table, relationship, and RLS policy
2. Drop your project URL and anon key into `js/config.js`
3. Open `index.html`

## Status — this is Phase 1 of a multi-phase build

This is a large product (30+ pages, real-time notifications, moderation, study groups...). Building it well means building it in working phases rather than 30 half-wired pages at once. **Phase 1, delivered now:**

- Full data model (`supabase/schema.sql`) — every entity in the brief, with RLS policies enforcing ownership and anonymous-post privacy
- Design system (`css/base.css`, `layout.css`, `components.css`, `animations.css`) — see "Design direction" below
- `js/config.js`, `js/api.js`, `js/auth.js` — real Supabase auth (signup, login, logout, password reset, session persistence)
- Landing page (`index.html`), `login.html`, `signup.html` — fully wired, no fake content

**Planned next phases** (say the word and I'll build the next one):

2. Onboarding flow (institution/faculty/program/year/course setup) → personalized home dashboard
3. Discussion system — create/edit/delete, comments, reactions, saves (the core of the app)
4. Communities, course pages, global search
5. Study groups, notifications, profiles, settings
6. Admin/moderation foundation + responsive/empty/error/loading polish pass

## Design direction

Avoiding the generic "AI dashboard" look on purpose — no cream+serif+terracotta, no dark+neon-accent, no purple gradients.

- **Palette:** paper `#FAF9F6`, ink `#14161F`, cobalt `#2B4EFF` (primary — stamped-ID blue), chartreuse `#C4F135` (highlighter accent, used sparingly), slate `#5B6072` (secondary text), brick `#E8483A` (alerts only)
- **Type:** Space Grotesk (display), Inter (body), IBM Plex Mono (course codes, timestamps, IDs — reads like a catalog number)
- **Signature element:** the "academic path" — a torn-ticket/boarding-pass style breadcrumb (`.path-stub` in components.css) showing Institution → Faculty → Program → Year → Course. It's not decoration — it's the actual navigational spine of the product, styled to look like a stamped student credential.
- **Layout:** left rail navigation on desktop (syllabus-spine feel) instead of a generic top navbar; bottom tab bar on mobile (Home | Communities | Create | Notifications | Profile) per spec.

## File structure

```
unicircle/
├── index.html          landing (unauthenticated)
├── login.html
├── signup.html
├── css/
│   ├── base.css         tokens, reset, typography
│   ├── layout.css        shell, rail nav, mobile tab bar
│   ├── components.css     buttons, cards, path-stub, empty states, toasts
│   ├── animations.css      transitions, respects prefers-reduced-motion
│   └── pages/            per-page overrides, added as pages are built
├── js/
│   ├── config.js          Supabase project URL/key — fill this in
│   ├── api.js             thin wrapper over Supabase client
│   ├── auth.js             signup/login/logout/reset/session
│   └── components/        added as needed
└── supabase/
    └── schema.sql          full data model + RLS policies
```
