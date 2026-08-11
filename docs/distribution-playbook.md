# Distribution Playbook

> Companion to `channel-content-plan.md` and `shorts-production-playbook.md`.
> Accounts, handles, playlists, and how a finished file gets onto three
> platforms.
>
> **Caveat on platform mechanics:** the specifics below (Shorts detection rules,
> free-tier limits, API access) change frequently and my knowledge runs to
> mid-2026. Treat every platform-behaviour claim here as "verify in the UI
> before relying on it" — the _strategy_ holds either way.

---

## 1. Handles — one decision to make before you register anything

You said you'd open TikTok and Instagram as **Chaos Master**. Worth pausing on,
because the repo says the product is **Lumen Apeiron** (`lumenapeiron.com`), with
Chaos Master kept as the sub-brand on the welcome screen and social cards.

**The problem with `@chaosmaster`:** every video sends people to
`lumenapeiron.com`. A viewer who sees the handle, likes the work, and later
searches "chaos master" finds a name that doesn't match the site, and a fraction
of them bounce. Handle–domain mismatch is a small, permanent tax on every video
you will ever post.

**Recommendation:** register **`@lumenapeiron`** on TikTok and Instagram, and
rename the YouTube channel to match. If `@chaosmaster` is free, grab it too and
point it at the same place — defensive, costs nothing.

**The counter-case, honestly:** "Chaos Master" is more searchable and more
memorable than a Greek-Latin compound most people can't spell, and it has
whatever recognition the old name accumulated. If you'd rather keep it, the fix
is to make the _site_ carry both names visibly, so the bridge is obvious. What
doesn't work is a handle that appears nowhere on the destination.

Either way: **same handle on all three platforms.** Check availability on all
three before registering any of them.

### Registration checklist

- [ ] Same handle on YouTube, TikTok, Instagram
- [ ] Same avatar and banner (a flame still — you have 56 to pick from)
- [ ] Bio, identical wording everywhere: what it is, one line, then the link
- [ ] Link to `lumenapeiron.com` in all three bios
- [ ] **Instagram: set it to a Business or Creator account.** Personal accounts
      can't be scheduled from Meta Business Suite, and you'll want that.
- [ ] Add YouTube, TikTok and Instagram links to the app's Help modal (which
      already has Discord at `/discord`), the landing page footer, and the README
      badge row

---

## 2. YouTube playlists — what you actually need

**Shorts get their own tab automatically.** YouTube detects a Short from aspect
ratio and length; you don't create or manage that shelf, and you can't opt a
video into it manually. So there is no "Shorts playlist" to find — the tab
already exists on your channel.

**You should still make playlists, one per series.** They do three things the
Shorts tab can't:

- Give you a linkable URL: "the full Variation of the Day playlist" in a
  description, a blog post, or the app's Help modal.
- Group by series rather than by format, so someone who liked one quiz can find
  the other forty.
- Show up as shelves on your channel homepage, which is what a new visitor
  actually looks at.

Create these now, empty:

| Playlist             | Fills from             |
| -------------------- | ---------------------- |
| Variation of the Day | A1                     |
| Guess the Variation  | A2                     |
| Fractal ↔ Music      | A3, A4                 |
| Fractal vs. Reality  | A5                     |
| Ambient — long form  | C2                     |
| Watch Me Build       | Tier B, once it starts |

One caveat to verify: Shorts placed in a regular playlist have historically
played in the standard player rather than the Shorts player, which changes the
viewing experience. Check how it behaves before you lean on playlists as a
primary surface — treat them as an organisational and linking tool, and let the
Shorts tab do the discovery work.

---

## 3. Can I post for you? No — here's the honest picture

**I can't post to YouTube or Instagram.** I have no tools connected in this
session that publish to either. Anything I told you about scheduling on your
behalf across all three would be false.

**One partial exception:** there's a third-party media service connected to this
session that exposes TikTok publishing (connect account, prepare, publish, check
status). It's **TikTok-only**, it needs your TikTok account connected to that
service, and it's been intermittently available during this conversation. It's
worth knowing it exists; it is not a three-platform solution and I wouldn't build
a workflow on it without testing its reliability first. Say the word if you want
to try it and I'll walk through connecting it.

### Is there a free tool that posts to all three at once?

Short answer: **not cleanly, and not free, for these three platforms.**

The obstacle is API access, not tooling. Instagram requires a Business/Creator
account and API posting through Meta's graph; TikTok's Content Posting API is
gated to approved partners. Third-party schedulers that clear both bars are
generally paid, and their free tiers usually exclude exactly what you need —
video, Reels, or TikTok specifically.

Options, with the honest catch on each:

| Tool                                                                             | Free tier                 | Catch                                                                      |
| -------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| **Native schedulers** — YouTube Studio, TikTok web uploader, Meta Business Suite | Genuinely free, all three | Three logins instead of one                                                |
| Buffer, Later, Metricool                                                         | Limited free tiers        | Video/Reels/TikTok often excluded or capped on free; verify current limits |
| Postiz, Mixpost (open source, self-host)                                         | Free if you host it       | You now maintain a posting service. That's a side project, not a shortcut. |

**Recommendation: use the three native schedulers.** They're free, they need no
API approval, they can't break under you, and they support scheduling. The cost
is about ten extra minutes per batch — cheaper than debugging a posting tool at
11pm, and far cheaper than self-hosting one.

Revisit when you're posting daily across three platforms and those ten minutes
have become an hour. Not before.

---

## 4. The upload routine

Per video, ~3 minutes once the template exists.

### YouTube (first — it's the account you have)

- Upload the 9:16 file. Shorts detection is automatic.
- **Title:** the hook, not the category. "This one line of maths makes a mirror"
  beats "Variation of the Day #1".
- **Description:** one line of what it is, the **full `?flame=` link**, the blog
  post URL, then Discord and the repo.
- Add to the series playlist.
- Schedule rather than publish, so the batch goes out on a rhythm.

### TikTok

- Same file. Rewrite the caption — TikTok captions are shorter and more direct
  than YouTube titles.
- Link goes in the bio, not the caption.
- 3–5 hashtags, specific over generic: `#fractal #generativeart #webgpu` beats
  `#art #fyp`.

### Instagram Reels

- Same file, via Meta Business Suite if the account is Business/Creator.
- Caption closer to TikTok's than YouTube's.
- Link in bio.

### The one thing to never skip

**The `?flame=` link in the description, every single time.** It's the only
mechanism turning a view into an app session, and it's the number Phase 4
reviews (plan §13). A video without it is entertainment; a video with it is
distribution.

---

## 5. Cross-posting: the two real traps

1. **Platform-native audio doesn't travel.** A track licensed inside TikTok's
   library is not licensed on YouTube. If you want one file on three platforms,
   the audio must be yours or cleared for all three — which is the strongest
   practical argument for the fractal-ambient production line (plan §5).
2. **Watermarks get downranked.** Don't download your own TikTok upload to
   repost elsewhere — it carries a TikTok watermark and platforms demote it.
   Always upload the clean export from your own folder to each platform.

---

## 6. What to do this week

- [ ] Decide the handle question (§1) — this blocks everything else
- [ ] Register TikTok and Instagram; set Instagram to Business/Creator
- [ ] Rename the YouTube channel if you go with `@lumenapeiron`
- [ ] Create the six empty playlists (§2)
- [ ] Write the bio once, paste it three times
- [ ] Add the three social links to the app's Help modal, the landing footer and
      the README
- [ ] Post one test Short to YouTube only, from §10 of the Shorts playbook, to
      prove the pipeline before the first real batch
