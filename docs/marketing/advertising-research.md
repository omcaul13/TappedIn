# Advertising TappedIn: what actually works

Research report, 2026-10-21. Research only: nothing in the app or website was changed.

**How this was made.** Seven research agents worked in parallel (short-form video, paid ads, comparable products, campus and community growth, legal and policy, timing and measurement, and a hands-on browse of the public ad libraries). A fact-checker then re-verified the high-impact claims, opened 20 of the ad-library screenshots, and resolved conflicts between agents. Each agent's full notes, with every source it used, are in [research-notes/](research-notes/). The ad screenshots are in [ad-library-screenshots/](ad-library-screenshots/).

**Budget.** The budget wasn't filled in, so the advice covers three tiers: **$0** (organic only), **about $100/month**, and **about $500/month**.

**Evidence labels** used throughout:
- **[Data]**: a platform's own documentation, a published rule, or a measured number with a stated sample.
- **[Consensus]**: several independent sources agree.
- **[Opinion]**: one person's account, a single case, or a vendor's claim.

Many numbers come from companies that sell ads or marketing tools; those are flagged where they appear. None of this is legal advice.

---

## 1. One-page summary

TappedIn's advantage is something nobody else sells: **it switches games for you when one goes to commercial.** Multiview from YouTube TV, ESPN and DIRECTV makes you pick and switch by hand. No ad in the Meta or Google ad libraries (checked 2026-10-21) offered automatic switching. Every recommendation below is built around showing that one moment, "the switch", without using anyone's broadcast footage or logos.

**Top 7 recommendations, in priority order**

1. **Make one 15-second "switch" clip first, and build everything else from it.** Record it in replay or dry-run mode, which shows data tiles instead of video: a game hits a break, the screen jumps to a close game, then comes back. Add a voiceover and captions. The clip goes on TikTok, Reels, Shorts, the README, Reddit and press pitches. **Never use real broadcast video**, not even a screen recording of TappedIn playing your own subscription. Automated copyright matching doesn't care that you pay for the channel. [Data: [6], [56], [63]]
2. **Fix measurement before promoting anything.** Today a visit from a TikTok bio link can't be traced to a download. The download button drops the campaign tags, and Cloudflare Web Analytics ignores them anyway. Three small website fixes (a separate PR, not part of this one) would solve it:
   - pass `ref`/UTM tags through to the download link
   - tag the phone "send yourself the link" with `?ref=selfsend`
   - add a server-side download counter (or the free Umami plan)

   **Don't add ad pixels**; they would make the site's "no tracking" promise false. [Data: [77], [78], [79]; see §5 and [06-timing-and-measurement.md](research-notes/06-timing-and-measurement.md)]
3. **Post three short videos a week on TikTok, Instagram Reels and YouTube Shorts from a founder-led account.** Use the same edit on all three, exported without the TikTok watermark. In order of priority:
   1. switch demos
   2. game-day reactions with friends (screens showing data tiles)
   3. memes about commercial breaks
   4. "we measured the breaks" data posts

   Two to five posts a week is the efficient range. [Data, vendor: [10]]
4. **Launch in the communities whose rules allow it, in this order:**
   1. r/SideProject
   2. r/NEU
   3. Show HN (Hacker News)
   4. r/CFB, after a mod OK and some real commenting history
   5. r/macapps (monthly thread)

   **Never post in r/cordcutters, r/sports or r/InternetIsBeautiful**; their rules ban this kind of post. [Data: [45]–[49]]
5. **At Northeastern, host watch parties instead of flyering.** You can't put up dorm posters yourselves. RAs, Hall Councils and recognized student groups can, so offer them a ready-made "4-game Saturday" setup. Pitch The Huntington News the student-builders story. Then find one champion at each other school that uses Xfinity On Campus. [Data: [52], [53]]
6. **Time each push to the calendar.** Ranked by value:
   1. tournament-time first and second rounds of college basketball, **Mar 18–21, 2027**
   2. conference championship weekend, **Dec 4–5**
   3. college football Week 1 plus move-in, **Aug 28 – Sep 6, 2027**
   4. Rivalry Saturday, **Nov 28** (many students will be home)

   Go quiet during finals. [Data: [72], [73], [75], [83]]
7. **Paid ads:** none at $0. At $100, a Reddit desktop-only test. At $500, Reddit plus Google Search. Skip TikTok, Meta, Snapchat and YouTube ads at these budgets: their minimum budgets are too high, or their traffic is mostly phones, and TappedIn is a desktop app. [Data: [19]–[24]; details in §5]

**One rule overrides everything:** run every post and ad through the checklist in §6. It says no broadcast video, no logos, no "RedZone", "March Madness" or "Super Bowl", no "free streams" or "skip commercials", and always say you built it.

**Realistic time cost:** about 5–6 hours a week between the two of you: 3 short videos (about 3 h), community replies and posts (1–2 h), and a 15-minute Monday numbers check.

**Decisions only you can make**

| Decision | Recommendation |
|---|---|
| Budget tier | Start at $0 for the first 4 weeks to get an organic baseline, then decide |
| Site analytics | Cookie-less and aggregate only: a server-side download counter, or Umami's free plan. No ad pixels |
| Naming Northeastern | Fine in a founder bio, in press pitches and on r/NEU. Keep it out of ads and the site hero unless NU Marketing approves (one email to ask) |

**Also found, outside marketing:** the homepage says the app talks only to your TV service and ESPN. But the Mac build checks the TappedIn site for updates ([electron/mac-updates.cjs:46](../../electron/mac-updates.cjs#L46)). Fix that wording before promoting the site's privacy claims.

---

## 2. What works and what doesn't

Fit is for TappedIn specifically: a free desktop app, two students, campus audience, no footage.

| Tactic | Evidence | Cost | Effort | Fit | Notes |
|---|---|---|---|---|---|
| Short-form organic video (TikTok, Reels, Shorts) | [Consensus] on ranking signals; [Data, vendor] on frequency | $0 | Medium (≈3 h/week) | **High** | All three platforms rank on viewer reaction, not follower count, so a new account can reach people [1], [3], [5] |
| Switch-demo screen recordings (replay mode) | [Consensus] + [Opinion] | $0 | Low | **High** | The demo *is* the content; indie apps like Dumbphone grew this way [16] |
| Reddit launch posts where allowed | [Data] for rules; [Opinion] for results | $0 | Low–Medium | **High** | One honest post in the right niche is how most indie tools broke out ([03](research-notes/03-comparable-products.md)) |
| Show HN | [Data] rules; [Opinion] results | $0 | Low (be in the thread all day) | Medium–High | Free, open source, no TappedIn account needed, real technical story [49] |
| GitHub README, topics, curated lists | [Opinion] | $0 | Low | Medium | 100+ stars also unlocks r/macapps' main feed [48] |
| Watch parties via RAs, Hall Councils, student groups | [Opinion] | $0–$50 | Medium | **High** at NU | The only route to dorm audiences under NU's poster and solicitation rules [52], [53] |
| Student newspaper pitch | [Opinion] | $0 | Low | Medium | Open angle: "two engineering students measured every commercial break" |
| One local champion per campus (recognition, maybe a disclosed $25 gift card) | [Opinion] | $0–$100 | Medium | Medium–High | Unpaid version of what funded apps did with paid reps |
| Paid campus ambassador program | Weak: every example was VC-funded [55] | $$$ | High | Low | Yik Yak, Fizz and Gas had funding and social network effects that TappedIn lacks |
| Flyering dorms yourselves | [Data]: not allowed at NU [52] | n/a | n/a | **Don't** | Unstamped posters are removed |
| Discord and group chats | [Consensus] | $0 | Low | Medium | Only as yourself, in #self-promo channels; never mass-DM [51] |
| Product Hunt | [Opinion]: low featuring odds (third-party estimates) | $0 | Medium | Low | The audience is makers, not sports fans; do it once for credibility |
| Reddit ads, desktop-only | [Data] mechanics; [Opinion] costs | $100+/mo | Low–Medium | **Best paid fit** | Subreddit targeting; can exclude phones [20] |
| Google Search ads, phones excluded | [Data] | $50+/mo | Medium | Good | Catches people already searching "watch multiple games at once" [21], [23] |
| Micro-creator post (disclosed) | [Data, vendor] | $50–$200/post | Medium | Medium at $500 | Partnership or Spark formats; must carry #ad [67] |
| Meta (Facebook/Instagram) ads | [Data] | needs ≈50 conversions/week per ad set to optimize | Medium | Low | Mostly phone traffic; can't optimize without a pixel [18] |
| TikTok ads | [Data] | ad group must spend >$20/day [19] | Medium | Low | Phone-only traffic; at most a 5-day burst at $500 |
| YouTube ads | [Data] | Google recommends $100/day for Demand Gen [24] | Medium | No | Big-budget only; use organic Shorts instead |
| Snapchat ads | [Data] | ≈$5/day minimum | Low | No | Mobile app only |
| X ads | [Opinion] | small | Low | Optional | Live sports talk is strong there, but brand-safety concerns and conflicting cost data |
| Game highlight clips | [Data] | $0 | Low | **Don't** | The top sports-TikTok format [37], but you don't own the footage: takedowns and strikes [63] |
| "RedZone for college football" positioning | [Data] | $0 | n/a | **Don't** | ESPN and NFL marks [30], [71] |

---

## 3. Instagram and TikTok deep dive

### How the platforms decide who sees a video

- **TikTok** recommends videos based on what viewers do: finishing the video, rewatching, sharing, commenting, following. Follower count is not a direct factor [1]. [Consensus]
- **Instagram Reels** are ranked on how likely someone is to watch to the end, like, reshare, or tap the audio [3]. For reaching people who don't follow you, **DM shares ("sends")** are the strongest signal (Mosseri, Jan 2025, reported secondhand). [Consensus]
- **Instagram cuts reach for unoriginal content:** reposted TikToks with watermarks, silent videos, or mostly-text posts. Since Apr 30, 2026, this also applies to photos and carousels, and accounts that mostly repost lose recommendations to non-followers [4]. [Data, platform statement] → **Export a clean file for each platform. Never upload the TikTok download.**
- **YouTube Shorts** measures how many people chose to watch instead of swiping away, plus how long they watched [5]. Shorts can now be 3 minutes, but **a Short over 1 minute with any Content ID claim is blocked** [6]. [Data]

**What this means for TappedIn:** a brand-new account can get reach from its first post if people watch to the end and send it to friends. The test for every post is the one Yahoo Fantasy uses: *would this get forwarded to the group chat?* [38]. [Opinion, but the most transferable rule found]

### Content types, ranked by expected pull

| Rank | Type | Why it works | Evidence | Example to study |
|---|---|---|---|---|
| 1 | **The switch demo**: 4-screen window, a game breaks, the screen jumps to a close game, then back | Shows the one thing no competitor does in under 10 s. TikTok's own ad guidance says to state the point in 3 s and land the hook by 6 s [2] | [Consensus] + [Opinion] | Dumbphone grew from handheld phone demos of the app (≈2.4M views, ≈20k downloads in 78 days, per a vendor write-up) [16] |
| 2 | **Game-day reaction with friends**: people first, the app catching a big moment on a second screen (data tiles or blurred) | Sports fans already use TikTok during live games; in a TikTok-commissioned Ipsos study, 85% of fans said they do [13]. Highly forwardable | [Data, platform-sponsored] | Culture Media's college game-day creator house posts huge clip volumes on Saturdays ([01](research-notes/01-short-form.md), source 37) |
| 3 | **Commercial-break memes and POV skits** ("POV: the 4th TV timeout this half") | Cheap and shareable, which drives Instagram sends. Weaker link to downloads unless the app shows up by the end | [Opinion] | — |
| 4 | **Dorm or desk setup tours** ("my Saturday setup") | A familiar, high-curiosity format that reaches students who already have campus TV. Drives saves more than downloads | [Opinion] | A Texas lineman's two-TV, 5-game Saturday got news coverage [(A to Z Sports, 2025)](https://atozsports.com/college-football/texas-longhorns-news/texas-c-jake-majors-describes-glorious-saturday-watching-college-football-tv-youtube-multiview-longhorns-florida-gators/) |
| 5 | **"We measured the breaks" data posts and build-in-public** | TappedIn has real numbers no one else has (for example, every NHL TV timeout ran 90 s or more; MLB's between-innings median is 147 s; see README). Gives Reddit, HN and press a story | [Opinion] | SponsorBlock, a one-developer "skip the boring part" tool, spread from its developer's own posts (2019, old) [39] |
| 6 | **2-minute setup walkthrough and reply-to-comment videos** | Fewer views, but converts people who are already interested. Pin it; use it to answer "does it work with my service?" | [Consensus] | — |
| 7 | **Student creators** (disclosed) | The best route to downloads once there's a budget, using Spark Ads (TikTok) or partnership ads (Meta) | [Data, vendor]: Spark Ads +30% completion vs. regular ads (TikTok internal, 2020–21) [12] | Cal AI scaled with about 250 paid creators. That's a big-budget tactic, not one to copy |

**Don't make:** highlight clips (the top sports-TikTok format [37], but it's someone else's footage), green-screen-over-headline posts (Instagram's originality penalty), or anything using trending pop songs (see audio below).

### Platform specifics

| | TikTok | Instagram Reels | YouTube Shorts |
|---|---|---|---|
| **Length** | Test two lengths: a 10–20 s demo and a 60–90 s explainer. Buffer found videos over 60 s got 43% more median reach than 30–60 s videos (1.1M videos, correlational, vendor data) [9] | Short demos; watch-to-end matters most [3]. Up to 3 min allowed | Keep anything with outside audio or footage **under 60 s** [6] |
| **Hook** | The point in 3 s, the hook by 6 s. First frame: 4 screens plus text, such as "it switches when your game goes to commercial" [2] | Key message in 3 s, real people on camera [8] | Watch the "viewed vs. swiped away" number in YouTube Studio; it measures your hook directly [5] |
| **Text** | 5–10 words per second, kept inside the safe zone [2] | Keep about 14% of the frame clear at the top and 35% at the bottom [8] | Same edit as TikTok |
| **Audio** | All founder posts promote your own app, so treat them as commercial. **Use the Commercial Music Library or your own voiceover** [62] | Use Meta's Sound Collection or voiceover. You can now swap a licensed track to boost a Reel [17] | Most Shorts Audio Library tracks can run up to 90 s; royalty-free YouTube Audio Library music won't be claimed [6] |
| **Account** | Business account: it unlocks the bio link before 1,000 followers, and you need commercial music anyway | Professional account (up to 5 bio links, which open in the in-app browser) | Channel with "how to watch multiple games on PC"-style titles. YouTube is also a search engine, so these keep getting found |
| **How often** | 2–5 posts a week. Median views stayed flat across posting rates, but more posts meant more chances of a breakout (Buffer, 11.4M posts) [10] | Same videos, natively exported. Use **Trial Reels** to test hooks on non-followers | Same videos; YouTube says there's no minimum cadence [7] |
| **When** | Generic "best time" studies contradict each other [11]. Follow the game windows: post Friday night or Saturday morning before college football, and Saturday night for recaps | Same | Same |
| **Organic vs. paid** | Spark Ads boost an organic post and keep its comments and likes. Ad groups need >$20/day [19] | Boost or partnership ads. Mostly phone traffic | Paid only via Demand Gen (big budgets) |

**College reach:** among US adults 18–29, 95% use YouTube, 80% Instagram and 63% TikTok (Pew, 2025) [14]. TikTok has added campus verification and college group chats [15], so college-specific feeds are growing. [Data]

**Desktop-app catch:** nearly all short-form viewers are on phones. Every bio link and caption should lead to a page that says "on your phone? send yourself the link." The site already has this, and it needs the `?ref=selfsend` tag (§5) to be measurable.

### What competitors' ads look like (hands-on, Meta Ad Library, US, 2026-10-21)

Full tables are in [08-ad-libraries.md](research-notes/08-ad-libraries.md); corrections are in [07-fact-check.md](research-notes/07-fact-check.md) §4. The sample is small, so treat these as observations:

- **Calls to action follow the business model.** Subscription services use "Sign Up": ESPN 52 of 67 cards ([screenshot](ad-library-screenshots/meta-espn-ad-Sep22026.jpg)), Sling 40 of 45. App installs use "Download" or "Install Now": FanDuel, DraftKings, theScore Bet ([screenshot](ad-library-screenshots/meta-fanduel-ad-Sep42026.jpg)). → For TappedIn, use **"Download"**. (n = 5 advertisers)
- **Brand videos are short:** mostly 15 s or 6–10 s. Videos made with creators run 40–100 s, talking to camera ([Sling creator ad](ad-library-screenshots/meta-slingtv-ad-creator-mrg030.jpg)). (n = 4 advertisers)
- **"Finding your game" is a frame only distributors use.** A DIRECTV dealer pitches game day as watching football rather than searching for it ([screenshot](ad-library-screenshots/meta-kw-multiview-ad-hispeedtoday-directv.jpg)). Spectrum runs "Where's My Game?" ([screenshot](ad-library-screenshots/meta-kw-multiview-ad-spectrum-wheresmygame.jpg)). Kinetic, an internet provider, advertises watching 4 games at once with YouTube TV multiview ([screenshot](ad-library-screenshots/meta-kw-youtubetv-results.jpg)). **Thin evidence (n = 3), but a cheap copy angle to test.**
- **Short, emoji-led, sport-specific one-liners** come from Fubo ([screenshot](ad-library-screenshots/meta-fubo-ad-gamedaystartshere.jpg)) and theScore Bet. Easy to rotate by sport. **Thin (n = 2).**
- **Not seen anywhere:** an ad for automatic switching during breaks. YouTube TV's own Meta page had 0 active ads ([screenshot](ad-library-screenshots/meta-youtubetv-results.jpg)).
- **Depends on footage or logos, so don't copy:** Fubo's network-logo grid, Sling's RedZone creative with player photos ([screenshot](ad-library-screenshots/meta-slingtv-ad-nflredzone.jpg)), ESPN's team imagery. Also stay far away from the look of the unbranded "TV service" reseller ads: huge channel counts and "Send Message" ([screenshot](ad-library-screenshots/meta-kw-multiview-ad-iptv-stopscrolling.jpg)).
- **Long-running ads:** only 3 competitor ads had run 60+ days, and two of them aren't marketing lessons: a stale Super Bowl hospitality ad and a responsible-gambling video. **No conclusion drawn.**
- **Gaps:**
  - TikTok's Creative Center (Top Ads, trending hashtags) returned "access denied" to the automated browser ([screenshot](ad-library-screenshots/tiktok-cc-topads-blocked-403.jpg)).
  - TikTok's ad library has no US option at all ([screenshot](ad-library-screenshots/tiktok-library-country-options.jpg)).
  - **To do:** spend 15 minutes browsing Creative Center by hand in a normal browser, filtered to US sports and apps.

---

## 4. Content idea bank (30 posts)

Every idea follows the §6 checklist:
- Screens show replay or dry-run data tiles, or are blurred or out of frame.
- No logos, and no league event trademarks.
- Audio is your voiceover or the platforms' commercial libraries.

**Before you record:**
- **Logos:** dry-run mode uses today's real ESPN data, which is great for timely posts. Block ESPN's team logos the way the website screenshots did, so teams show the app's abbreviation badges.
- **Names:** team names in captions describing real games are low risk in organic posts. Keep them out of paid ads.

| # | Hook (first line or visual) | Format | Platform | What to film | Best timing |
|---|---|---|---|---|---|
| 1 | "My game just went to commercial. Watch the top-right screen." | Screen recording + voiceover, 12–15 s | TikTok, Reels, Shorts | Replay mode, one switch and the return, with captions | Any college football Saturday |
| 2 | "POV: it's the 4th TV timeout this half" | Skit → app shot | TikTok, Reels | Friend groaning at a laptop, cut to the 4-screen window switching | College basketball weeknights (Nov–Mar) |
| 3 | "What a timeout looks like in TappedIn" | 3-beat explainer (live → break → fill-in → back) | All three | Replay mode with an on-screen label for each beat | Evergreen; pin it |
| 4 | "Rate my Saturday setup: dorm edition" | Setup tour | TikTok, Reels | Desk or TV with TappedIn on data tiles; snacks and jerseys with no logos visible | Move-in (Aug 2027) or any Saturday |
| 5 | "We timed every commercial break in 76 football games" | Data post, talking head + charts | Shorts, TikTok; also a Reddit/HN text post | Founder at a whiteboard or the screen; numbers from the break model | Weekday, not game day |
| 6 | "Two engineering students built this because we kept missing the good game" | Founder origin story | All three | Both founders on camera, 30–45 s, one switch clip in the middle | Launch week |
| 7 | "If you live on campus, you probably already have live TV" | Reminder, text + voiceover | TikTok, Reels | Screen of TappedIn's service picker (plain text names); "works with Xfinity On Campus" in plain text, organic only | Start of semester; move-in |
| 8 | "How it knows a timeout from a foul shot" | Explainer | Shorts, TikTok | Replay of a college basketball game: a foul (no switch) vs. a TV timeout (switch) | Champions Classic week (Nov 10), conference play |
| 9 | "Setup takes 2 minutes. Here it is at 4× speed." | Sped-up screen recording | All three; pin | The `--setup-demo` flow (no real sign-in shown) | Evergreen |
| 10 | "Hockey fans: here's what happens at intermission" | Feature demo | TikTok, Shorts | Intermission → highlights reel (video blurred) and scores board | NHL nights |
| 11 | "Four screens, one living room, rivalry Saturday" | Reaction video | TikTok, Reels | Friends reacting; TVs out of frame or showing data tiles | Sat Nov 28 (post that night) |
| 12 | "Every title game, one window" | Grid demo | All three | Dry-run on the day; 4 championship games as data tiles | Fri–Sat Dec 4–5 |
| 13 | "Tournament Thursday on a dorm laptop" | How-to | TikTok, Reels, Shorts | Setup → 4 tournament games on tiles → a timeout switch. **Say "tournament", never "March Madness"** | Post Mar 14–17, 2027 |
| 14 | "Which screen gets the sound? You pick, or it follows the action." | Feature demo | TikTok, Reels | Press Shift+1–4, then show "follow the action" | Any |
| 15 | "Your team's screen never leaves." | Feature demo | TikTok, Reels | Lock a screen; the other three keep switching | Rivalry week |
| 16 | "The ticker that jumps to scores" | Feature demo | Reels, Shorts | Mini ticker jumping to a touchdown or goal | Any busy night |
| 17 | "It moved me to the upset before I knew it was happening" | Reaction + demo | TikTok | Real reaction to an "upset brewing" fill-in (replay) | Tournament first round; bowl season |
| 18 | "Game over? It already picked my next game." | Feature demo | All three | Game picker with countdown (logos pixelated) | Late Saturday windows |
| 19 | "Does it work with my TV service?" | Reply-to-comment video | TikTok | Founder answers on camera; shows the Tested / Experimental list as plain text | Whenever the question shows up |
| 20 | "Every way to watch 4 games on a laptop, tested" | Comparison (factual, dated, no logos) | Shorts (searchable title), TikTok | Browser tabs vs. a TV service's multiview vs. TappedIn; say what each can and can't do | Evergreen |
| 21 | "Halftime, handled" | Feature demo | Reels, TikTok | Halftime reel (blurred) while the game keeps going underneath | Any Saturday |
| 22 | "Commercial break bingo" | Text graphic or carousel | Instagram carousel, TikTok photo mode | Original illustration, no network names | Football Sundays |
| 23 | "Shipping a sports app on a game day" | Day-in-the-life vlog | TikTok, Shorts | Bug fix at 11 a.m., watch at noon, log review at night | Any Saturday |
| 24 | "Every NHL TV timeout we measured lasted 90+ seconds" | One-stat data post | TikTok, Shorts, X | Stat card + replay switch | Opening weeks of the NHL season |
| 25 | "How to run a 4-game watch party for your floor" | Carousel guide for RAs and clubs | Instagram, also a PDF for RAs | TV setup, cables, sound tips; TappedIn on tiles | 1–2 weeks before Rivalry week and the tournament |
| 26 | "One Saturday noon window, minute by minute" | Time-lapse of decisions | Shorts, Reddit | Decision log played back as the "why" lines | Weekday after a big Saturday |
| 27 | "Mac users: it's here" | Launch announcement | All three, r/macapps megathread | Mac window with the app running on tiles | Whenever the Mac build is announced |
| 28 | "Football timeout? Here's a power play." | Cross-sport fill-in demo | TikTok, Reels | Replay: NFL break → NHL power play tile | Sunday afternoons |
| 29 | "Soccer is the best way to wait out a football timeout" | Tier-3 fill-in demo | TikTok, Shorts | Saturday morning soccer filling a college football break | Saturday late mornings |
| 30 | "Things TappedIn will never do" | Trust post | All three, pinned on the profile | Founder lists: never records, never sees your password, never accepts terms for you | Launch week, then pinned |

---

## 5. Paid ads plan

### Is it worth it at your budget?

- **$0:** No paid ads. Spend the first 4 weeks getting an organic baseline: what share of visitors download, and which channels send them.
- **$100/month:** Optional. One narrow test on Reddit (desktop only) can show whether paid clicks become downloads at a sane cost. It won't move total downloads much. Run it only after the measurement fixes below.
- **$500/month:** Worth a disciplined 4-week test on Reddit plus Google Search. Still too small for Meta or TikTok to optimize: Meta wants about 50 conversions per ad set per week [18], and TikTok ad groups must spend over $20/day [19].

### Prerequisites, before spending $1

1. **Measurement (website PR, separate from this one):**
   - forward `ref`/UTM tags from the landing page onto the download links
   - add `?ref=selfsend` to the phone self-send link
   - count downloads by `ref` server-side: a Workers Analytics Engine binding on the existing `/download/*` Function (free tier), or Umami's free Hobby plan
   - Without this, campaign tags are recorded nowhere. [Data: [77], [79], [80]]
2. **No ad pixels.** Meta, Reddit and TikTok pixels, even server-side versions, send visitor data to the ad platforms. That contradicts "No accounts, no tracking" and can bring California opt-out duties. Accept weaker optimization: buy click objectives and judge results with your own counter. [Consensus; [06](research-notes/06-timing-and-measurement.md) §3e]
3. **Landing page facts for Google's software-download rules:** say what the app is and does, what it needs (your own TV subscription, Windows or Mac), how to uninstall, and link to terms or the license [59]. [Data]
4. **Check each platform's ad policy against your copy** (§6). Reddit's ad policy page couldn't be fetched, so read it before the first ad.

### Which platform first

| Platform | Why |
|---|---|
| **Reddit (start here)** | Can target specific subreddits (r/CFB, r/nfl, r/CollegeBasketball, r/hockey, school subreddits; Reddit advises 15+ per ad group). Can deliver to desktop only. Low floor: about $5/day per ad group, though check for a $100 campaign minimum in Ads Manager. CPM and CPC figures are vendor blog ranges only: roughly $3–15 CPM, $0.50–4 CPC. [Data mechanics [20]; Opinion costs] |
| **Google Search (second)** | Catches people already searching. A −100% mobile bid adjustment excludes phones [21]. Arts & Entertainment clicks average $1.63 (LocaliQ, vendor, no sample size) [23], but expect more for "watch college football"-type terms, which Fubo and Sling already bid on. |
| **Skip** | Meta (mostly phones, and optimizing needs a pixel), TikTok (phones, $20/day floor), YouTube ($100/day recommended), Snapchat (mobile only). X only as an optional $50 curiosity. |

### Test structure

**$100/month (≈$3.30/day):**
- 1 Reddit campaign, 1 ad group, **desktop only**, 15+ sports subreddits.
- 3 ads:
  - (A) the switch clip
  - (B) a still: "Your game breaks. This screen switches."
  - (C) a founder text post ("we're two students; we built this")
- Run on game days only (Fri–Sun, about $8/day) for **3 weeks**. Don't edit mid-test.

**$500/month (≈$16/day):**

| Budget | Setup |
|---|---|
| Reddit, $250 | 2 ad groups, both desktop only: football subreddits, and basketball/hockey subreddits. 3 ads each |
| Google Search, $150 | 1 campaign, 10–20 exact/phrase keywords such as "watch multiple games at once", "watch 4 games at once on pc", "multiview college football", "how to watch two football games on laptop". −100% mobile; Maximize Clicks with a max-CPC cap |
| Reserve, $100 | Either one disclosed student-creator post, or a 5-day TikTok Spark burst of your best-performing organic video during tournament week ($20/day). Judge the TikTok burst by `selfsend` downloads, since its traffic is phones |

- **Never bid on** "RedZone", "NFL RedZone", "YouTube TV" or other brand names [58].
- Run 4 weeks around a big slate (conference championships, then tournament time). Change one thing per round. Raise a winning channel's budget 20–30% at a time.

### What counts as success or failure

These thresholds are working assumptions from the paid-ads research, not industry benchmarks. Revisit them after the first test.

| Metric | Good | Kill |
|---|---|---|
| Cost per download start (counter, by `ref`) | ≤ $3 | > $8 after ~150 clicks |
| Reddit click-through rate | ≥ 0.5% | < 0.2% |
| Google click-through rate | ≥ 5% | < 2% |
| Desktop visit → download start | ≥ 20% | < 10% (fix the page before spending more) |
| Download start → completed (R2 bytes ÷ file size) | ≥ 60% | Low numbers point to the Windows SmartScreen warning, which ads can't fix |

After 3–4 weeks: if one channel is under $3 per download, keep it and scale slowly. If both are over $8, stop paid ads and put the money into a student creator or watch-party supplies.

### Mistakes that waste small budgets

- Too many ad groups (each needs its own learning volume).
- Tests shorter than 3 game weeks.
- Editing mid-test.
- Boost buttons that optimize for likes.
- Broad national audiences.
- Paying for phone clicks to a desktop download.
- Counting clicks as downloads.
- Spending during finals or the off-season.
- Copy that sounds like piracy.

Sources: [18]–[24], [02](research-notes/02-paid-ads.md).

---

## 6. Risks and rules: the checklist

Run every post, ad, flyer and creator brief through this. If any answer is "no", fix it first. Full reasoning and sources: [05-legal-and-policy.md](research-notes/05-legal-and-policy.md).

**Footage and marks**
- [ ] **No real broadcast video or audio** anywhere: not on a TV in the background, not in a screen recording of TappedIn, not commentators or stadium PA. Screens show replay or dry-run data tiles, mock video, or blur. [56], [60], [61], [63]
- [ ] **No logos**: team, league, network, TV service or school, including on clothing in the shot. Team abbreviation badges are fine. [64], [66]
- [ ] **No league event trademarks or RedZone:**
  - "tournament time", not March Madness, Final Four or Big Dance
  - "the big game", not Super Bowl
  - "every break, a better game", not RedZone (lowercase "red zone" only when describing football action)
  - [64], [65], [30], [71]
- [ ] TV service names are **plain text only**, used to say what TappedIn works with, on the landing page and in organic posts. **Keep them out of ad headlines**: TikTok's ad policy allows no unauthorized brands. [58], [61]

**Wording**
- [ ] It doesn't imply free TV: make clear (or at least never contradict) that **your own TV subscription is required**.
- [ ] It never claims to skip or remove ads. The service's ads still play when a screen stays on a break, and networks have sued over ad-skipping features (Fox v. DISH AutoHop, settled 2016) [69].
- [ ] No "official", "partnered", "approved by" or "the app [school] students use".
- [ ] Nothing about sharing logins or passwords (Xfinity's terms forbid letting others use your credentials) [70].
- [ ] Claims match measured results in the README; no absolutes like "never miss a play".

| Avoid | Say instead |
|---|---|
| "Watch every game free" / "free streams" | "Free app. Up to 4 games from the TV service you already have." |
| "Skip the commercials" / "zero commercials" | "When your game goes to break, your screen jumps to one that's live." |
| "No cable needed" | "Works with campus TV and live TV streaming services." |
| "Hack / bypass / unlock Xfinity" | "Sign in on your service's own page." |
| "RedZone for college football" | "Every break, a better game." / "A whip-around for the games on your screens." |
| "March Madness on 4 screens" | "Tournament time on 4 screens." |
| "Super Bowl party setup" | "Big game setup." |

**Disclosure (FTC)** [67], [68]
- [ ] Founders say **"I built this"** (or "we built this") in the video and the caption. No fake "just found this app" posts from alt accounts.
- [ ] Anyone who got anything of value has **#ad or "paid partnership" in the first line, on screen and spoken**, plus the platform toggle. That includes cash, gift cards, merch, early perks and contest prizes.
- [ ] No reviews from founders. No reviews from friends without disclosure. No rewards for positive reviews. No bought followers or views. Penalties run up to **$53,088 per violation** (2025 adjustment, still current).

**Other**
- [ ] Music is your own, the TikTok Commercial Music Library, Meta Sound Collection or licensed stock [62].
- [ ] Everyone on camera agreed (a simple written OK).
- [ ] No Northeastern name or logo as an endorsement beyond a factual bio line (NU Policy 116) [66].
- [ ] For ads: the landing page says what it does, what it needs, links terms, and explains uninstalling [59].
- [ ] **Gut check:** would someone who's never heard of TappedIn think "legit app for my own TV service" and not "piracy tool"?

**Community-specific:** read each subreddit's live `/about/rules` before posting. The rules here were read through mirrors on 2026-10-21. Never ask anyone to upvote, on Reddit, HN or Product Hunt, including in group chats [44], [49], [50].

**Website fixes before promoting** (separate PR):
- Mention update checks in the "talks only to" privacy line.
- Add the what-it-needs / how-to-uninstall block.

---

## 7. 30-day starter plan (Oct 26 – Nov 25, 2026)

Every week: 3 short videos (from §4), daily replies to comments, and a 15-minute review each Monday.

**The Monday review:**
- R2 download starts and completed estimates
- downloads by `ref` once the counter exists
- views → link clicks per post
- one decision for the next week

**Ignore:** likes, followers and GitHub stars.

**Week 1, Oct 26 – Nov 1: set up**
- Decide: budget tier, analytics option, no pixels. Email NU Marketing about using the school name.
- Website PR (separate): campaign-tag forwarding, `?ref=selfsend`, a download counter, privacy-line fix, what-it-needs/uninstall block.
- Accounts: TikTok Business, Instagram Professional and a YouTube channel, with a bio link to the site using UTMs (`utm_source=tiktok&utm_medium=social&utm_campaign=2026-11-launch&utm_content=bio`).
- Record 6–8 clips in replay mode (ideas 1, 3, 9, 14, 21, 30). Dry-run Saturday Oct 31 for fresh data tiles; that's also a World Series weekend.
- Start commenting genuinely in r/CFB game threads from your own accounts (r/CFB requires a comment history before you post).
- Post: ideas 1, 6, 30.
- 15 minutes: browse TikTok Creative Center by hand (US, sports and apps).

**Week 2, Nov 2–8: first launch posts**
- **r/SideProject** (weekday): "TappedIn – a desktop app that switches games during commercial breaks", with the clip. Ask for specific feedback.
- **r/NEU** (weekday): "Two NEU students built a free app for Xfinity On Campus", with the clip. Reply to every comment.
- Pitch **The Huntington News** (tipline) with the measured-breaks angle.
- Email 3–5 RAs or Hall Councils and 2 student groups (club sports, the robotics teams). Offer to set up a 4-game watch party on **Sat Nov 21** (last on-campus Saturday before Thanksgiving). Remember the group still needs its own approval to advertise it.
- Post: ideas 2, 5, 28.

**Week 3, Nov 9–15: wider tech audience**
- **Show HN** (Tue or Wed morning ET). Both of you stay in the thread all day; answer the terms-of-service and automation questions plainly.
- Post a hoops idea in Champions Classic week (Nov 10): idea 8. Also ideas 4 and 24.
- Message r/CFB's mods: ask whether one [OC] text post with the clip and GitHub link is OK.
- First real Monday review with counter data, if the website PR has shipped.

**Week 4, Nov 16–22: Rivalry week build-up**
- Post ideas 15 and 25, plus a "set it up before you go home for Thanksgiving" reminder. Campus TV may not work off campus at every school, so say "check your school's off-campus rules".
- **Watch party, Sat Nov 21.** Film reactions with screens on data tiles or out of frame, and get written OKs from friends on camera.
- r/CFB post (weekday) if the mods said yes.
- **If budget ≥ $100:** start the Reddit desktop test (§5), running through Dec 5.

**Right after day 30**
- Rivalry Saturday, Nov 28: idea 11.
- Conference championships, Dec 4–5: idea 12, plus the paid test ending.
- Then go quiet for finals (about Dec 7–18; check the Registrar).
- January: plan tournament time (Mar 14–21) and the Aug 2027 move-in push.

---

## 8. Sources

Sources the report relies on, with dates and evidence labels. Every source each agent consulted (about 200) is listed with dates and labels at the end of its notes file in [research-notes/](research-notes/). "Accessed" means the page is undated and was read on 2026-10-21. "Vendor" means the publisher sells ads, tools or services.

**Platform guidance and short-form**
1. How TikTok recommends videos #ForYou. TikTok Newsroom, 2020-06-18, still the official explainer. https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you/ [Consensus]
2. Creative best practices for performance ads. TikTok Ads Help, updated Jun 2025. https://ads.tiktok.com/help/article/creative-best-practices [Consensus, vendor]
3. Instagram Ranking Explained. Instagram (Adam Mosseri), 2023-05-31, current. https://about.instagram.com/blog/announcements/instagram-ranking-explained/ [Consensus]
4. Instagram restricts reach of content aggregators. TechCrunch, 2026-04-30. https://techcrunch.com/2026/04/30/instagram-restricts-reach-of-content-aggregators-in-new-crackdown/ [Data, platform statement]
5. Search & discovery tips: Shorts. YouTube Help, accessed. https://support.google.com/youtube/answer/11914225 [Consensus]
6. Understand three-minute YouTube Shorts. YouTube Help, accessed. https://support.google.com/youtube/answer/15424877 [Data]
7. Shorts truths: debunking common myths. YouTube Blog, 2025-05-06. https://blog.youtube/creator-and-artist-stories/debunking-common-myths-about-youtube-shorts/ [Consensus]
8. Reels ads and safe zones. Meta for Business, accessed. https://www.facebook.com/business/ads/facebook-instagram-reels-ads [Consensus, vendor]
9. Longer TikToks get more views (1.1M videos). Buffer, 2025-03-17. https://buffer.com/resources/longer-tiktoks-get-more-views-data/ [Data, vendor, correlational]
10. How often should you post on TikTok (11.4M posts). Buffer, 2025-10-08. https://buffer.com/resources/how-often-should-you-post-on-tiktok/ [Data, vendor]
11. Best time to post on TikTok in 2026 (7.1M posts). Buffer, 2026-09-14. https://buffer.com/resources/best-time-to-post-on-tiktok/ [Data, vendor; low value]
12. Spark Ads Creative Playbook. TikTok Creative Center, data Q4 2020–Q2 2021. https://ads.tiktok.com/business/creativecenter/quicktok/online/Spark-Ads-Creative-Playbook/pc/en [Data, vendor, old]
13. TikTok x Ipsos, The New Sporting Era. Ipsos, May 2026 (fieldwork Jun–Jul 2025; sample weighted to TikTok users). https://www.ipsos.com/sites/default/files/ct/news/documents/2026-05/TikTok%20x%20Ipsos%20-%20The%20New%20Sporting%20Era.pdf [Data, platform-sponsored]
14. Americans' social media use 2025. Pew Research Center, 2025-11-20 (n = 5,022). https://www.pewresearch.org/internet/2025/11/20/americans-social-media-use-2025/ [Data]
15. TikTok's new Campus Hub. TechCrunch, 2026-04-30. https://techcrunch.com/2026/04/30/tiktoks-new-campus-hub-features-college-group-chats-and-feeds/ [Consensus]
16. 20K downloads and $9K MRR in 78 days (Dumbphone). Shortimize, 2024-10-31. https://shortimize.com/blog/20k-downloads-and-9k-mrr-in-78-days-how-this-indie-app-turned-minimalism-into-millions-of-views [Opinion, vendor]
17. Instagram adds option to replace licensed music to boost Reels. Lindsey Gamble, c. Nov 2024. https://www.lindseygamble.com/blog/instagram-adds-option-to-replace-licensed-music-to-boost-reels-as-ads [Consensus]

**Paid advertising**

18. About the learning phase. Meta Business Help Center, accessed (page didn't render; wording via several 2026 secondary sources, including Jon Loomer). https://www.facebook.com/business/help/112167992830700 and https://www.jonloomer.com/qvt/learning-phase-10-or-50-events/ [Data, partly verified]
19. About budgets for ads in TikTok Ads Manager. TikTok Ads Help, updated Jul 2026. https://ads.tiktok.com/help/article/budget [Data]
20. Reddit Ads audiences and minimums. Reddit Ads Help, accessed. https://business.reddithelp.com/s/article/reddit-audiences ; PPC Land, 2023-12-21. https://ppc.land/reddit-ads-minimum-prices [Data mechanics; Opinion on minimums]
21. About bid adjustments (−100% mobile). Google Ads Help, accessed. https://support.google.com/google-ads/answer/2732132 [Data]
22. About average daily budgets. Google Ads Help, accessed. https://support.google.com/google-ads/answer/6385083 [Data]
23. Search Advertising Benchmarks. LocaliQ/WordStream, updated 2026-06-01 (sample size not stated). https://localiq.com/blog/search-advertising-benchmarks/ [Data, vendor]
24. Best practices for Demand Gen campaigns. Google Ads Help, accessed. https://support.google.com/google-ads/answer/10546923 [Data]
25. Facebook Ads Benchmarks 2025. WordStream, 2025 (n > 1,000 campaigns). https://www.wordstream.com/blog/facebook-ads-benchmarks-2025 [Data, vendor]
26. TikTok ads CTR and CPM by industry. Focus Digital, 2026 (5,900 brands). https://focus-digital.co/average-tiktok-ads-ctr-and-cpm-by-industry/ [Data, vendor]
27. TikTok officially secures a US future. eMarketer, Jan 2026. https://www.emarketer.com/content/tiktok-officially-secures-us-future--what-happens-next [Consensus]
28. Reddit releases Community Intelligence ad tools. Axios, 2025-06-16. https://www.axios.com/2025/06/16/reddit-ai-community-intelligence [Opinion, company claim]

**Comparable products**

29. Scott Hanson: RedZone commercials permanent, catchphrase change. Awful Announcing, 2025-09-03. https://awfulannouncing.com/nfl/scott-hanson-redzone-commercials-permanent-catchphrase-change.html [Data]
30. ESPN closes deal for NFL Network, rights for RedZone. AP via NBC News, 2026-02-01. https://www.nbcnews.com/business/media/espn-closes-deal-nfl-network-rights-redzone-giving-nfl-stake-network-rcna256906 [Data]
31. ESPN discusses RedZone possibility for college football. Sports Illustrated, 2025-09-17. https://www.si.com/fannation/college/cfb-hq/espn-president-discusses-redzone-possibility-for-college-football-other-sports [Data]
32. Building multiview on YouTube TV. YouTube Official Blog, 2023-03-14. https://blog.youtube/news-and-events/multiview-on-youtube-tv/ [Data, older than 18 months]
33. YouTube TV custom multiview. 9to5Google, 2026-04-28. https://9to5google.com/2026/04/28/youtube-tv-custom-multiview/ [Data]
34. DIRECTV launches build-your-own multiview for sports. SVG, 2026-10-15. https://www.sportsvideo.org/2026/10/15/directv-launches-build-your-own-multiview-for-sports/ [Data]
35. ESPN Unlimited review. CableTV.com, 2026-10-20. https://www.cabletv.com/espn-unlimited-review [Opinion]
36. NBCUniversal's Paris Olympics results (multiview usage over 25%). NBCUniversal, Aug 2024. https://www.nbcuniversal.com/article/nbcuniversals-presentation-spectacular-paris-olympics-dominates-media-landscape-across-all-platforms [Data, company-reported, old]
37. NBA, NFL lead in social media performance (STN Digital report). Net Influencer, 2025-06-23. https://www.netinfluencer.com/report-nba-nfl-lead-in-social-media-performance-personality-driven-content-dominates-across-all-leagues/ [Data, agency]
38. Yahoo Fantasy, Hashtag Sports Awards shortlist. Hashtag Sports, 2026. https://www.hashtagsports.com/awards/shortlist-2026/yahoo-fantasy [Opinion, self-nominated]
39. SponsorBlock launch posts. blog.ajay.app, 2019-07-29. https://blog.ajay.app/sponsorblock-block-youtube-sponsorships [Data, old]
40. How I built an open source app that went viral (Wealthfolio). DEV, 2024-09-24. https://dev.to/afadil/how-i-built-an-open-source-app-that-went-viral-160p [Opinion]
41. Western Washington University drops Xfinity On Campus (14% of 896 residents used it). The Western Front, undated. https://www.thefrontonline.com/r/b10722adee [Opinion, single school, undated]
42. "Fix this" calls mount against YouTube TV. EssentiallySports, 2026-09-14. https://www.essentiallysports.com/nfl-active-news-fix-this-calls-mount-against-youtube-tv-as-nfl-fans-are-forced-to-wait-for-commanders-vs-eagles-to-end-before-switching-games/ [Opinion]

**Campus and community**

43. Reddit Rules (Rule 2). Reddit Inc., accessed. https://redditinc.com/policies/reddit-rules [Data]
44. Reddiquette. Reddit Help, updated 2026-10-05. https://support.reddithelp.com/hc/en-us/articles/205926439-Reddiquette [Data]
45. r/CFB Rules v.2026.1. r/CFB mods, adopted 2026-10-11. https://rules.redditcfb.com [Data]
46. r/cordcutters rules (no self-promotion, no unofficial apps, no terms-of-service workarounds). Accessed via mirror. https://www.reddit.com/r/cordcutters/about/rules [Data]
47. r/nba, r/nfl, r/CollegeBasketball, r/hockey, r/sports rules wikis. Accessed via mirror. https://www.reddit.com/r/nba/wiki/rules , https://www.reddit.com/r/nfl/wiki/postingguidelines , https://www.reddit.com/r/CollegeBasketball/wiki/rules_guidelines , https://www.reddit.com/r/hockey/wiki/faq , https://www.reddit.com/r/sports/wiki/rules [Data]
48. r/SideProject, r/macapps, r/InternetIsBeautiful, r/NEU sidebars. Accessed via mirror. https://www.reddit.com/r/SideProject , https://www.reddit.com/r/macapps , https://www.reddit.com/r/InternetIsBeautiful , https://www.reddit.com/r/NEU [Data]
49. Show HN Guidelines. Hacker News, accessed. https://news.ycombinator.com/showhn.html [Data]
50. Product Hunt Launch Guide. Product Hunt, accessed. https://www.producthunt.com/launch [Data]. Featuring-rate estimates are third-party only ([04](research-notes/04-campus-and-community.md) sources 22, 36) [Opinion]
51. Discord Community Guidelines. Discord, effective 2025-09-29. https://discord.com/guidelines [Data]
52. Poster Policy. Northeastern Housing & Residential Life, accessed. https://housing.northeastern.edu/policies-and-publications/poster-policy [Data]
53. Policy 300: Non-Solicitation and Sales. Northeastern University, revised 2026-05-12. https://policies.northeastern.edu/policy300 [Data]
54. Marketing/Publications Policies. Northeastern Center for Student Involvement, accessed. https://csi.studentlife.northeastern.edu/marketing-publications-policies [Data]
55. Yik Yak and History of Facebook. Wikipedia, accessed. https://en.wikipedia.org/wiki/Yik_Yak , https://en.wikipedia.org/wiki/History_of_Facebook [Data, secondary]

**Legal and policy**

56. Google Ads Policies: Copyrights. Google, accessed. https://support.google.com/adspolicy/answer/6018015 [Data]
57. Google Ads Policies: Enabling dishonest behavior. Google, accessed. https://support.google.com/adspolicy/answer/6016086 [Data]
58. Google Ads Policies: Trademarks. Google, accessed. https://support.google.com/adspolicy/answer/6118 [Data]
59. Google Ads Policies: Unwanted software. Google, accessed. https://support.google.com/adspolicy/answer/15938073 [Data]
60. Meta Advertising Standards: Copyrights and Trademarks. Meta Transparency Center, accessed. https://transparency.meta.com/policies/ad-standards/intellectual-property-infringement/copyright-and-trademarks [Data]
61. TikTok Ads Policy: Intellectual Property Infringement. TikTok, updated Apr 2026. https://ads.tiktok.com/help/article/tiktok-ads-policy-intellectual-property-infringement?lang=en [Data]
62. Commercial Music Library. TikTok Business Help Center, updated Jul 2025. https://ads.tiktok.com/help/article/commercial-music-library [Data]
63. How Content ID works, Fair use on YouTube, and Understand copyright strikes. YouTube Help, accessed. https://support.google.com/youtube/answer/2797370 , https://support.google.com/youtube/answer/9783148 , https://support.google.com/youtube/answer/2814000 [Data]
64. NCAA Advertising and Promotional Guidelines, effective 2026-07-01. NCAA. https://www.ncaa.com/_flysystem/public-s3/files/Advertising_Promotional_Standards_2026.pdf [Data]
65. Tiptoeing on the Sidelines: 2026 update on Super Bowl advertising. Broadcast Law Blog via Nevada Broadcasters Assn., 2026-01-23. https://nevadabroadcasters.org/tiptoeing-on-the-sidelines-2026-update-on-super-bowl-advertising-and-promotions/ [Consensus]
66. Policy 116: Endorsements and Use of University Identifiers. Northeastern University, revised 2026-05-20. https://policies.northeastern.edu/policy116 [Data]
67. FTC Endorsement Guides, 16 CFR Part 255 (revised 2023-07-26), and Disclosures 101 for Social Media Influencers (2019, current). https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255 , https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers [Data]
68. FTC final rule banning fake reviews (effective 2024-10-21), FTC 2024-08-14; and 2025 inflation-adjusted civil penalties ($53,088), FTC Feb 2025. https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials , https://www.ftc.gov/news-events/news/press-releases/2025/02/ftc-publishes-inflation-adjusted-civil-penalty-amounts-2025 [Data]
69. DISH Network Form 10-K FY2016 (Fox v. DISH AutoHop). SEC EDGAR, filed Feb 2017. https://www.sec.gov/Archives/edgar/data/0001001082/000155837017000748/dish-20161231x10k.htm [Data, old]
70. Xfinity Web Services Terms of Service, effective 2024-02-13. Comcast. https://www.xfinity.com/terms/web [Data]
71. RedZone trademark records: RED ZONE CHANNEL Reg. 3182102 (now ESPN), NFL REDZONE Reg. 3871364 (cancelled 2021), REDZONE serial 99166963 (filed 2025, not independently verified). Mirrors, accessed; confirm on USPTO TSDR. https://trademarkregistration.app/Trademark/Details/78727140 , https://trademarks.justia.com/778/13/nfl-77813422.html , https://trademarks.justia.com/991/66/redzone-99166963.html [Data, verify]

**Timing and measurement**

72. 2027 March Madness men's tournament schedule. NCAA.com, 2026-05-07. https://www.ncaa.com/news/basketball-men/article/2026-05-07/2027-march-madness-mens-ncaa-tournament-schedule-dates [Data]
73. College Football Playoff 2026–27 schedule. FBSchedules, 2026-06-01. https://fbschedules.com/college-football-playoff-sets-2026-27-schedule-kickoff-times-tv-designations/ [Data]
74. 2026 NFL Christmas games on Netflix. NFL.com, Aug 2026. https://amp.nfl.com/news/christmas-netflix-2026-nfl-schedule-release [Data]
75. Networks unveil 2026 college football broadcast schedules. SVG, 2026-05-27. https://www.sportsvideo.org/2026/05/27/networks-unveil-2026-college-football-broadcast-schedules/ [Data]
76. NBA key dates 2026–27. NBC Washington, updated 2026-10-19. https://www.nbcwashington.com/nba/nba-key-dates-2026-27-opening-night-trade-deadline-finals/4140559/ [Data]
77. Web Analytics FAQ (no query strings, no custom events). Cloudflare Docs, updated 2026-07-14. https://developers.cloudflare.com/web-analytics/faq/ [Data]
78. R2 metrics and analytics. Cloudflare Docs, updated 2026-09-24. https://developers.cloudflare.com/r2/platform/metrics-analytics/ [Data]
79. Workers Analytics Engine pricing and limits. Cloudflare Docs, updated 2026-04-23. https://developers.cloudflare.com/analytics/analytics-engine/pricing/ [Data]
80. Umami pricing (free Hobby plan). Umami, accessed. https://umami.is/pricing [Data]
81. URL builders: collect campaign data with custom URLs. Google Analytics Help, 2026. https://support.google.com/analytics/answer/10917952 [Data]
82. Xfinity On Campus off-campus access varies by school (example: St. Thomas IT page). Accessed. https://services.stthomas.edu/TDClient/1898/ClientPortal/KB/Article/99439/XFINITY-on-Campus-Getting-Started [Data]
83. 2027 college football Week 1 date changes. FBSchedules, 2026. https://fbschedules.com/oklahoma-smu-utah-state-announce-2027-football-game-date-changes/ [Data]

**Hands-on ad libraries** (captured 2026-10-21, 14:48–15:25 EDT, US, active ads only; screenshots in [ad-library-screenshots/](ad-library-screenshots/))

84. Meta Ad Library. https://www.facebook.com/ads/library/ [Data; small samples, n stated with each pattern]
85. Google Ads Transparency Center. https://adstransparency.google.com/?region=US [Data; ESPN's page showed only Europe/Türkiye ads]
86. TikTok Commercial Content Library (EU/EEA/UK only, no US). https://library.tiktok.com/ads [Data]
87. TikTok Creative Center: blocked ("access denied") to automated browsing; not reviewed. https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en
