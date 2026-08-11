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

## 1. Handles — decided

**`@lumenapeiron` is the handle on every platform. "Chaos Master" is the
subtitle.**

This is the right call, and it's settled by reality as much as by strategy:
"chaos master" handles are already taken more or less everywhere, so the choice
was never really open. The upside is that the handle now matches the domain
every video points at, which removes the permanent small tax of a
handle–destination mismatch.

### Where "Chaos Master" goes

The sub-brand still does work — it carries whatever recognition the old name
accumulated, and it's far more searchable than a Greek-Latin compound most
people can't spell. Put it everywhere a **display name** or a **line of prose**
is allowed, and nowhere a **handle** is:

| Slot                   | Value                                                          |
| ---------------------- | -------------------------------------------------------------- |
| Handle (all platforms) | `@lumenapeiron`                                                |
| Display name           | `Lumen Apeiron · Chaos Master`                                 |
| Bio line 1             | What it is, in plain words — "Fractal flames in your browser." |
| Bio line 2             | `formerly Chaos Master`                                        |
| Link                   | `lumenapeiron.com`                                             |
| Video watermark        | `lumenapeiron.com` — the domain, not the name                  |

The pattern to hold: **one handle, two names.** Someone searching either term
finds you; everyone who clicks lands on a site whose name they've already read.

Grab `@chaosmaster` variants if any turn out to be free — defensive, costs
nothing — but don't post from them.

### Registration checklist

- [ ] `@lumenapeiron` on YouTube, TikTok, Instagram — check all three for
      availability before claiming any of them, and take the closest consistent
      variant everywhere if one is gone
- [ ] Display name `Lumen Apeiron · Chaos Master` on all three
- [ ] Same avatar and banner (a flame still — you have 56 to pick from)
- [ ] Identical bio wording everywhere, including the `formerly Chaos Master`
      line
- [ ] Link to `lumenapeiron.com` in all three bios
- [ ] **Instagram: set it to Business or Creator.** Personal accounts can't be
      scheduled from Meta Business Suite.
- [ ] **TikTok: see §1a before flipping the account type.**
- [ ] Add YouTube, TikTok and Instagram links to the app's Help modal (which
      already has Discord at `/discord`), the landing page footer, and the README
      badge row

---

## 1a. TikTok — a second account under the same company

**Short answer: yes, that's normal and allowed.** Running several TikTok accounts
for several products under one company is standard practice and explicitly
supported. What TikTok prohibits is multiple accounts used to fake engagement,
spam, or evade a ban — none of which is what you're doing.

Two practical constraints: **each account needs its own unique email or phone
number**, and TikTok caps how many accounts you can link for fast in-app
switching (a small number — check the current limit if you plan to run more than
a couple).

### Three different things called "business", and only one needs verification

This is where the question usually gets tangled:

| Thing                             | What it is                                                                                                       | Needs verification?                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Account type: Business**        | A free self-serve toggle in Settings → Account. Changes which tools and music library you get.                   | **No.** It's a switch, per account.                  |
| **Business Center / Ads Manager** | Where a legal entity is verified with documents, and where multiple accounts and ad assets are managed together. | **Yes** — once, per company.                         |
| **Verified badge (blue check)**   | Authenticity badge granted by TikTok.                                                                            | Separate process entirely; not something you toggle. |

So the answer to what you actually asked: **you don't re-verify anything.**
Open the second account, flip its type to Business in its own settings — that
toggle asks for nothing — and if you want it managed under the same legal entity
for ads or shared access, **add it as an asset to the Business Center you already
verified.** Holding multiple accounts under one verified entity is precisely what
Business Center exists for.

### The trade-off worth knowing before you flip the switch

Business account type is not strictly better than Creator, and the difference
matters for exactly the content you're planning:

|                            | Business                   | Creator                                        |
| -------------------------- | -------------------------- | ---------------------------------------------- |
| Website link in bio        | **From day one**           | Historically gated behind a follower threshold |
| Music library              | **Commercial Sounds only** | Full library, including trending audio         |
| Analytics / business tools | Fuller                     | Fewer                                          |

**The music restriction is the real cost** — a Business account can't use the
general trending-audio library, and trending audio is a meaningful discovery
lever on TikTok.

**But in your case it's nearly free**, and this is the deciding argument: the
content plan already concludes you need audio you own or have cleared for all
three platforms, because TikTok-licensed audio can't be cross-posted to YouTube
(§5). Your soundtrack is going to be your own fractal ambient or a collaborating
musician's track either way. Giving up a library you'd already decided not to use
costs you almost nothing — and you gain the bio link to `lumenapeiron.com` from
your very first post, which is the entire point of the channel.

**Recommendation: Business, same as your other account.** Consistent management,
link from day one, and the restriction lands on something you weren't going to
use.

One caveat on all of the above: account-type perks and limits shift, and my
knowledge runs to mid-2026. Confirm the current music-library and bio-link rules
in the app before committing — the reasoning holds regardless of where the exact
lines sit.

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

- [ ] Register `@lumenapeiron` on TikTok and Instagram; set Instagram to
      Business/Creator and TikTok to Business (§1a)
- [ ] Rename the YouTube channel to `@lumenapeiron`, display name
      `Lumen Apeiron · Chaos Master`
- [ ] Add the new TikTok account to your existing Business Center as an asset
- [ ] Create the six empty playlists (§2)
- [ ] Write the bio once, paste it three times
- [ ] Add the three social links to the app's Help modal, the landing footer and
      the README
- [ ] Post one test Short to YouTube only, from §10 of the Shorts playbook, to
      prove the pipeline before the first real batch
