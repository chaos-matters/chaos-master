# Community & Funding Strategy for Chaos Master

> Research document — May 2026
>
> **Context**: Chaos Master v0.7.7 alpha, zero community infrastructure. Goal: add
> lightweight support option + minimal Discord gathering spot, framed as
> beta/early-access. Target: fractal artists + creative coders equally.

---

## 1. Support Platform Analysis

### Platform Comparison

| | Patreon | Ko-fi | GitHub Sponsors | Open Collective |
|---|---|---|---|---|
| **Platform fee** | 5-12% | 0% (+ Stripe ~3%) | 0% | 10% |
| **One-time donations** | No | Yes | Yes (since 2023) | Yes |
| **Recurring subscriptions** | Yes (core) | Yes (Gold) | Yes (core) | Yes |
| **Member posts / devlog** | Yes | Yes (Gold) | No (repo only) | Blog-style updates |
| **Discord role integration** | Yes (native) | Via webhook | No (3rd-party) | No |
| **Discoverability** | Weak | Weak | Strong (GitHub profile) | Weak |
| **Audience fit** | Creators, artists | General, shops | Developers | Transparency-focused |
| **"Support" vibe** | "Subscribe to my content" | "Buy me a coffee" | "Sponsor my work" | "Fund our mission" |

### Recommendation: Ko-fi (primary) + GitHub Sponsors (secondary)

**Why not Patreon?** Patreon's fee structure (5-12%) and content-heavy expectations
are a poor fit for a moderate commitment. The platform signals "I produce regular
content you pay for," which creates pressure you've said you want to avoid. Patreon
makes sense if you later start producing video tutorials or a podcast — revisit
then.

**Why Ko-fi as primary?**
- Zero platform fees on donations (only Stripe's ~3% processing)
- Supports both one-time "tips" AND recurring monthly (Gold plan, $6/mo)
- Member-only posts for occasional devlogs / early access builds
- Shop feature for future (flame packs, presets, etc.)
- The "support" framing is warmer than "sponsor" — better for creative audiences
- Discord role integration via webhook (auto-assign supporter roles)
- No minimum commitment — one-time supporters aren't locked into subscriptions

**Why GitHub Sponsors as secondary?**
- Essential for developer-audience credibility
- Zero fees (GitHub absorbs everything)
- Sponsor badge on the repo — visible to every visitor
- One-time sponsorships possible
- Developer audience already has GitHub accounts — zero friction
- Can mirror the same tiers from Ko-fi

### Proposed Setup

| Tier | Price | Ko-fi | GitHub | Perks |
|------|-------|-------|--------|-------|
| Tip jar | Any (one-time) | Yes | Yes | Warm fuzzy feeling + name in README |
| Supporter | $3/mo | Yes | Yes | Discord supporter role, early access builds |
| Patron | $8/mo | Yes | Yes | + Name in app credits, vote on roadmap |

Keep it simple — two recurring tiers max. Don't over-segment early.

---

## 2. "Support" Button: Wording & Placement

### Wording

**Use "Support" — not "Donate."** "Donate" implies charity. "Support" implies you're
helping sustain something you value. This is the consensus across successful open
source creative tools.

Button variants by placement:
- **Header / global**: "Support" or "❤ Support" (heart icon)
- **Help modal**: "Support Chaos Master"
- **Welcome screen**: "Support this project"
- **GitHub**: "Sponsor" (matches platform convention)

### Placement in the App

Three touchpoints, progressively visible:

**1. Help Modal (low-key)**
Add a "Support" link at the bottom of the existing HelpModal, alongside the
GitHub link. This is where curious users go — low pressure, natural placement.

**2. Header "heart" icon (subtle persistent)**
A small heart or coffee icon in the top-right header area. Clicking opens a small
dropdown: "Support on Ko-fi" / "Sponsor on GitHub." Muted styling so it doesn't
scream "please pay." Reference: how VSCode, Blender, and OBS place their support
links — visible but not in your face.

**3. Welcome Screen (onboarding moment)**
A small line at the bottom of the welcome modal: "Chaos Master is free and open
source. [Support the project →]" This catches users at peak appreciation — they
just discovered the tool.

### Anti-patterns to Avoid

- **No popup nag** — never interrupt the creative flow
- **No feature gating** — don't lock rendering quality or export behind paywalls
- **No watermark** — don't brand user output
- **No guilt messaging** — "Help me afford ramen" undercuts the tool's credibility

---

## 3. Discord Community Server Design

### Principle: Minimal & Self-Sustaining

You want a gathering spot, not a second job. Design the server so members help each
other and channels are self-explanatory. Invest in good onboarding once, then let it
run.

### Server Structure

```
🌐 WELCOME
├── #welcome          — Join message, rules, what this server is
├── #rules            — Short code of conduct + link to GitHub
└── #introductions    — New members say hi, share their fractal interest

📢 NEWS
├── #announcements    — New releases, major features (post-only by you)
├── #devlog           — Casual development updates, what you're working on
└── #changelog        — Auto-post GitHub releases (use GitHub webhook bot)

🎨 GALLERY
├── #share-your-work  — Users post flames they've created
├── #daily-challenge  — Optional: weekly flame prompt (e.g., "minimalist")
└── #tips-and-tricks  — Parameter settings, favorite variation combos, etc.

💬 CHAT
├── #general          — Anything Chaos Master related
├── #help             — "How do I...?" support channel
└── #off-topic        — Fractal art in general, other tools, random

🔧 TECH (for developer audience)
├── #webgpu-dev       — WebGPU discussion, rendering techniques
├── #contributing     — PR discussion, issues, contributor onboarding
└── #api-and-scripts  — If/when a scripting API exists

🔒 SUPPORTERS (requires Ko-fi role)
└── #early-access     — Pre-release builds, voting on next features
```

**Total: 14 channels.** Start with channels that have obvious content. If a channel
is dead for 2 weeks, archive it. Better to have 8 active channels than 14 quiet ones.

### Role Structure

```
@Admin          — You
@Moderator      — Trusted community members (recruit later, not day 1)
@Supporter      — Ko-fi subscribers (auto-assigned via webhook bot)
@Contributor    — GitHub contributors (manual or via bot)
@everyone       — Default
```

Keep roles simple. No XP systems, no level grinding — those make servers feel like
games and attract the wrong energy for a creative tool.

### Bots

| Bot | Purpose | Priority |
|-----|---------|----------|
| **Carl-bot** | Reaction roles, auto-mod, welcome messages, embeds | Essential |
| **GitHub webhook** | Post releases/issues/PRs to #changelog | High |
| **Ko-fi bot** | Auto-assign @Supporter role on donation | High |

Carl-bot alone covers 80% of needs. Start there. Don't clutter with music bots,
leveling bots, or meme commands — they dilute the creative/technical vibe.

### Launch Checklist

- [ ] Server icon + banner (use a Chaos Master flame render as server icon)
- [ ] Welcome message with: what this is, how to get started, link to app
- [ ] Rules channel: "Be kind. No AI-generated art without disclosure. No NSFW."
- [ ] #introductions with a pinned template: "I make fractal art using ___. I found Chaos Master through ___."
- [ ] Invite link in: GitHub README, app HelpModal, Ko-fi page
- [ ] Seed initial content: post 3-5 of your own flames in #share-your-work before inviting anyone

---

## 4. Community Integration Points

### Where to Exist Beyond Your Own Server

| Platform | Why | Effort | Priority |
|----------|-----|--------|----------|
| **r/fractals** (Reddit) | Largest fractal art community. Post renders, link tool in comments. | Low | High |
| **FractalForums.com** | Historical home of flame fractal software. Announce there. | Low | High |
| **DeviantArt** | Still the hub for fractal artists. Post renders, tag appropriately. | Low | Medium |
| **GitHub Discussions** | Developer audience. Enable on the repo for technical Q&A. | Low | Medium |
| **YouTube** | Tutorials + timelapse renders. High effort but compounding. | High | Future |
| **Twitter/X / Bluesky** | Renders get good engagement. Use #generativeart tag. | Medium | Optional |

### Reddit Strategy (r/fractals)

- Post a high-quality flame render once a week
- Title: flame name + "made with Chaos Master (free, browser-based)"
- Comment: link to app, mention it's open source, invite to Discord
- Never spam — one post per week max

### FractalForums Announcement

- One well-written "Introducing Chaos Master" post
- Explain what differentiates it: WebGPU, browser-based, open source, timeline animation
- Acknowledge the lineage (Apophysis, Chaotica, JWildfire) to show respect to the community

---

## 5. Presentation & Guide Materials

### Elevator Pitch (30 words)

> Chaos Master is a free, browser-based fractal flame generator powered by WebGPU.
> Create stunning IFS fractals with real-time feedback, animate parameters on a
> timeline, and export high-res renders or video — all from your browser.

### Short Introduction (~100 words)

> Chaos Master brings Iterated Function System (IFS) fractal flames to the modern
> web. Built on WebGPU for GPU-accelerated rendering, it gives you instant visual
> feedback as you compose transforms, tweak variations, adjust color palettes, and
> tune render parameters. A full keyframe animation timeline lets you create evolving
> fractal videos and export them as MP4. Over 20 example flames come built-in to get
> you started. It's free, open source (AGPL-3.0), and runs entirely in your browser —
> no install, no signup, no limits.

### README Improvements

Current README is minimal. Proposed additions:
- Hero GIF showing a flame being edited in real time
- Feature list with icons
- Quick start: "1. Pick an example flame → 2. Tweak transforms → 3. Export PNG"
- "Support" section with Ko-fi + GitHub Sponsors links
- Discord badge (shield.io style)
- Link to live demo prominently at top

### Quick Start Guide Outline

For a future `GUIDE.md` or in-app tour:

1. **Pick a flame** — Open the example browser, click any flame to load it
2. **Understand transforms** — Each transform is a function that maps points around. More transforms = more complexity
3. **Tweak variations** — Variations are the "flavor" of each transform (linear, sinusoidal, swirl, etc.)
4. **Adjust colors** — Drag the color picker, change palette speed, tweak vibrancy
5. **Play with render settings** — Exposure, gamma, contrast, highlight power
6. **Animate** — Open the timeline, add keyframes, press play
7. **Export** — PNG for stills, MP4 for animations

### Community Guidelines (for Discord + GitHub)

```
- Be kind and constructive. This is a creative space.
- Feedback is welcome; criticism should be actionable.
- No AI-generated art without disclosure.
- No NSFW content.
- Share parameters when posting flames — help others learn.
- Respect the AGPL-3.0 license when remixing or redistributing.
```

---

## 6. Implementation Roadmap

### Phase 1: Foundation (1-2 days)

- [ ] Create Ko-fi page with 2 tiers (Supporter $3, Patron $8)
- [ ] Enable GitHub Sponsors on `chaos-matters/chaos-master`
- [ ] Add `.github/FUNDING.yml` pointing to both
- [ ] Add "Support" link to HelpModal in the app
- [ ] Add Ko-fi + GitHub badges to README

### Phase 2: Discord (1 day)

- [ ] Create Discord server with channel structure above
- [ ] Set up Carl-bot for welcome + reaction roles
- [ ] Set up Ko-fi webhook for supporter role
- [ ] Seed initial content (3-5 flame posts)
- [ ] Add Discord invite to README, HelpModal, Ko-fi page

### Phase 3: Outreach (ongoing)

- [ ] Announce on FractalForums
- [ ] First Reddit post on r/fractals
- [ ] Write "Introducing Chaos Master" presentation post
- [ ] Quick start guide (can be a README section initially)

### Phase 4: Content (ongoing, low-cadence)

- [ ] Monthly devlog post on Ko-fi (what was built, what's next)
- [ ] Early access builds posted to #early-access in Discord
- [ ] Periodic flame renders posted to social platforms

---

## Appendix: Fractal Art Community Context

Chaos Master enters an established ecosystem. The three major tools are:

- **Apophysis** — The classic, open-source flame editor. Legacy but still used. Created the IFS flame file format that Chaos Master uses.
- **Chaotica** — Modern, commercial ($) GPU-accelerated fractal renderer by Thomas Ludwig. High-quality output, Windows/Linux.
- **JWildfire** — Java-based, actively developed by Andreas Maschke. Strong community, scriptable, cross-platform.

Chaos Master's differentiators in this landscape:
- **Browser-based** — No install, works on any device with a modern browser
- **WebGPU** — Hardware acceleration via the latest web standard
- **Timeline animation** — Built-in keyframe editor, not an afterthought
- **Open source** — AGPL-3.0, fully transparent
- **Free** — No paid tier, no feature gating

Acknowledge the lineage in community posts. The fractal flame format Chaos Master
uses was pioneered by Apophysis. This shows respect and helps with credibility in
existing communities.
