# AthLink — Website structure & navigation redesign

_Proposal, 2 July 2026. Goal: make the site intuitive — one clear structure everyone
can understand, results findable in ~2 clicks, no button/tab bombardment._

## Why (the diagnosis)

User feedback: home page confusing, landing "portal" not intuitive, menu bar useless.
Codebase audit + research (NN/g, Baymard, Cartesi, Nike, Airbnb, Spotify, Wikipedia)
confirmed the root cause: **the site makes people browse when its actual job is to
retrieve.** Concrete problems found in the current build:

- "Portal" means two different things — a **class** portal (global standings) and a
  **host** portal (a club/federation/association). Both use the same card + enter
  function, so new users can't tell them apart.
- The 4 class buttons on the home page have **no section label**.
- **Search is hidden inside the hamburger pill** — over half of users are
  search-dominant and go straight for a search box (NN/g). Ours is buried.
- **Redundant paths**: Athletes, Calendar, and Home are each reachable 3+ ways with
  different labels ("Class Portals" = home, etc.).
- **Ranking is buried** inside federation portals — non-editors never find it.
- **No breadcrumb / "you are here"** — the single most common IA mistake (NN/g), and
  worse for us because our clean URLs get deep-linked and shared.
- Terminology drifts: events / competitions / results used interchangeably.

## The new structure

**One search-first home → 3 fixed doors → everything else on demand → one shared shell.**

### 1. Home = one action + proof of breadth
- Hero is a single large search box spanning **athletes + competitions + clubs**,
  type disambiguated in the results dropdown (Google / Wikipedia model).
- Below it, a quiet "breadth strip": class chips (29er · ILCA · 49er · Optimist),
  recent competitions, featured athletes — proves the data is there so visitors
  don't assume the catalog is narrow and leave (Baymard).
- The two competing grids (class buttons + HK/International × Fed/Club/Assoc matrix)
  are removed from the landing page.

### 2. Primary nav = 3 items, always visible on desktop
- **Athletes · Competitions · Rankings** — ordered by frequency of use, not org chart.
- Plus a utility slot: search + account avatar. No hamburger on desktop (NN/g #1).
- Account/host tools live in the avatar menu; "about"/legal in the footer.

### 3. Class = a filter, not a door
- Class stops being a "portal type." It becomes a filter/lens applied inside
  Athletes, Competitions, and Rankings. This removes the class-vs-club collision.

### 4. Clubs = browse + search, not a top-level door
- Clubs (former host portals) are reachable via search and browsable from
  Competitions. The region × type matrix disappears from the home page.

### 5. Entity pages = one shared shell + breadcrumb wayfinding
- Athlete, Competition, and Club pages share identical chrome so drilling in never
  reshapes the layout (Notion/Vercel model).
- Breadcrumb echoes context: `Competitions › 2026 Optimist Nationals`,
  `29er › Casey Law`, `Clubs › RHKYC`. This is the wayfinding mechanism (the top bar
  has no back button by rule).

### 6. Progressive disclosure
- Result filters (class, year, host) appear **after** a search / on results pages —
  never on the landing page. Cap disclosure at two levels (NN/g).
- Optional: a Cmd+K quick-jump palette for power users.

### 7. Locked terminology (UI-facing)
- **Athletes · Competitions · Clubs · Rankings · Classes.** Five words, one meaning
  each. "Portal" retired from the UI. "Competition" everywhere (never event/regatta).

## Mobile
Desktop and mobile share this one structure. On mobile the top bar collapses to a
**bottom tab bar** (Athletes · Competitions · Rankings · You) in the thumb zone —
research shows tab bars beat hamburgers on discovery. Search lives in the hero.
Rankings reflow to card rows; full event-results tables get horizontal scroll with a
frozen name column. (See earlier mobile pass notes.)

## Suggested build sequence
1. Nav + shell: 3-item top bar, kill desktop hamburger, add breadcrumb component.
2. Home: search-first hero + breadth strip; remove the two grids.
3. Terminology sweep + retire "portal" from UI strings.
4. Class → filter; Clubs → browse/search.
5. Entity-page shell unification.
6. Mobile: bottom tab bar + responsive pass.

## Sources
- NN/g: Menu-Design Checklist; IA Questions about Navigation Menus; Search and You
  May Find; Progressive Disclosure; Navigation "You Are Here"; Characteristics of
  Minimalism.
- Baymard: Search Field Design; Inferring Catalog Breadth from the Homepage.
- Live/studied: Cartesi (cartesi.io), Nike, Airbnb, Spotify, Wikipedia, Google,
  Linear, Notion, Vercel, Stripe.
