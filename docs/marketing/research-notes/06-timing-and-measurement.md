> Raw notes from one research agent, 2026-10-21. Some claims here were corrected by the fact-check in [07-fact-check.md](07-fact-check.md); [advertising-research.md](../advertising-research.md) uses the corrected versions.

# 6. Timing (sports calendar) and measurement for a two-person team

Research date: 2026-10-21. Labels: [DATA] = published schedule, doc or measured value; [CONSENSUS] = several secondary sources agree, or widely known practice; [ANECDOTE] = one source or my inference. Source numbers refer to section 5.

## 1. Top findings

1. **March Madness First Round, Thu–Fri Mar 18–19, 2027, is still the single best multi-game window.** 2027 is the first 76-team field. Selection Sunday is Mar 14, the 12 Opening Round games are Mar 16–17, the Second Round is Mar 20–21, the Final Four is in Detroit and the title game is Apr 5. The dates did not move with the expansion. [DATA] [3][4] In 2026 the opening Thursday averaged 9.8M viewers across CBS/TNT/TBS/truTV, and its primetime window was the most-watched first-round window on record. Nielsen's new Big Data + Panel method inflates comparisons with earlier years. [DATA] [5]
2. **The best fall dates left are Rivalry Week (Fri–Sat Nov 27–28, 2026; Michigan at Ohio State is Sat Nov 28 at noon ET on FOX) and conference championship weekend (Fri–Sat Dec 4–5).** ACC, Big Ten and Big 12 title games are all on Sat Dec 5. [DATA] [6][7] NBA Cup quarterfinals fall on the same Dec 4–5. [DATA] [8]
3. **CFP 2026–27 (12 teams):** first round Fri Dec 18 (8 pm ESPN), then Sat Dec 19 at 12:00, 3:30 and 7:30 ET. Quarterfinals are Wed Dec 30 (Fiesta) and Fri Jan 1 at 12, 4 and 8 ET (Peach, Rose, Cotton). Semifinals are Jan 14 (Orange) and Jan 15 (Sugar). The title game is Mon Jan 25 in Las Vegas. Games air on ESPN/ABC and TNT/truTV/HBO Max. The playoff runs one game at a time, back to back, with only short overlaps, so it has less multi-game value than a regular Saturday. [DATA] [1]
4. **Christmas Day (Fri Dec 25, 2026) has eight big games in one day:** NFL Packers–Bears at 1:00 and Bills–Broncos at 4:30 (both Netflix), Rams–Seahawks at 8:15 (FOX), plus five NBA games (Spurs–Knicks, Nuggets–Warriors, …). The audience is mostly at home, not on campus. [DATA] [2][8]
5. **The NFL alone has limited multi-game value on a cable-style service.** A local market gets about 1–2 Sunday-afternoon games (its CBS and FOX affiliates). The playoffs (Wild Card weekend Jan 16–18, 2027, with six games) are scheduled one after another. NFL value goes up when the app mixes it with college basketball, the NBA, the NHL and soccer. [CONSENSUS] (broadcast practice); [DATA] for the dates [2][9]
6. **Back-to-school 2027 lines up with CFB Week 1.** The NCAA's standardized 14-week format makes Sat Aug 28, 2027 Week 1. The US Open starts Aug 29, and Labor Day is Sep 6. This is the install moment for campus TV users. [DATA] [10][11]
7. **Campus TV off campus varies by school.** Some Xfinity On Campus schools let students stream from home with fewer channels (St. Thomas, Bowdoin); others work only on campus (Champlain). Thanksgiving, winter break (bowls, CFP, Christmas) and spring break (possibly during March Madness) can strand campus users. [DATA] [12]
8. **Today's site can already estimate downloads with no code change.** R2's operations dataset (GraphQL `r2OperationsAdaptiveGroups`) has an `objectName` field, so GetObject counts on `TappedIn-Setup.exe` / `TappedIn.dmg` approximate download starts. Bucket bandwidth divided by about 157 MB gives a rough count of completed downloads. Queries cover at most 31 days. [DATA] [13]
9. **GitHub `download_count` hardly counts anything.** On 2026-10-21 `gh api` showed 0–2 downloads per release asset across all seven releases. The site serves installers from R2, so GitHub counts only people who download from GitHub itself. [DATA] (measured) [14]
10. **Cloudflare Web Analytics is free and cookie-less, but it can't read UTMs.** Query strings are not logged and custom events are not supported. [DATA] [15][16] So it can't attribute campaigns or download clicks.
11. **Umami Cloud's free Hobby plan covers this team's needs:** 100K events/month, 1 site, 6-month retention, UTM + custom events, no cookies. Plausible ($9/mo, 10k pageviews, 30-day trial) and Pirsch ($6/mo) are paid options. [DATA] [17][18][19]
12. **A server-side counter in the download Function is the most "no tracking"-consistent attribution option.** Pages Functions support an Analytics Engine binding (dashboard: Settings → Bindings → Analytics engine). The free tier is 100k data points written/day and 10k reads/day, with 3-month retention, and Cloudflare currently doesn't bill for it. KV makes a poor counter (1,000 writes/day free, 1 write/sec per key). [DATA] [20][21][22]
13. **UTMs get lost at two points in the current site.** (a) The download button links to `/download/windows` without the landing page's query string. (b) The phone "send yourself the link" email/share uses the bare origin. Social traffic is mostly phone traffic (TikTok/IG in-app browsers), so the desktop visit that actually downloads arrives as "direct." [DATA] (code read: `website/src/download.js`) + [CONSENSUS] (dark social)
14. **Ad pixels conflict with the site's "No accounts, no tracking" claim.** Server-side conversion APIs (Meta CAPI, Reddit CAPI, TikTok Events API) still send IP, user agent and the page URL to the ad platform. They don't remove consent or opt-out duties, and California's "sharing" rules cover ad pixels. [CONSENSUS] [23][24][25][26]
15. **Trust note from the code:** the Mac build calls `tappedin-4ot.pages.dev` for updates (`/api/update/mac/<version>`, `/api/latest?platform=mac`). The homepage says the app "talks only to your TV service and ESPN's public scores." The wording should mention update checks before anyone adds any measurement, so the claim stays literally true. [DATA] (code read: `electron/mac-updates.cjs`, `website/src/index.html`)

## 2. Calendar, Oct 2026 – Oct 2027

Multi-game value = how many games plausibly overlap on channels a typical lineup carries. All times ET.

| Date | Moment | Multi-game value | Angle |
|---|---|---|---|
| Every Sat through Nov 21, 2026 | CFB Saturdays (noon / 3:30 / 7:30 windows) | High | "Four games, no remote." Clip a live switch during a commercial |
| Fri Oct 23 – Sat Oct 31 | World Series (G1 Oct 23, G2 Sat Oct 24; G6–7 Oct 30–31 if needed) [27] | Med (one game, but it overlaps CFB Saturdays) | "Don't pick between the Series and your team" |
| Sundays through Jan 3, 2027 | NFL 1:00/4:25 windows | Med (1–2 per market) + NHL/NBA/soccer mixing | Mix NFL with other sports; show switching to another sport |
| Tue–Wed Nov 3–4, Nov 24–25, Dec 8–9; Jan 19–20, 27, 2027 | UCL league phase (most matches kick off at once) [28] | Low–Med (depends on which matches air on channels the user gets, not streaming-only) | For soccer fans only; check what the lineup carries |
| Tue Nov 10 | Champions Classic, Chicago (Duke–MSU, Kansas–Kentucky, ESPN) [29] | Med | College-hoops launch moment |
| Wed–Fri Nov 25–27 | NFL Thanksgiving Eve (Packers–Rams), Thanksgiving triple (1:00 / 4:30 / 8:20), Black Friday (Broncos–Steelers 3:00), CFB Friday rivalries [2] | Med (NFL games run one after another; Friday overlaps CFB) | Students home. Promo the week before: "set it up before you leave" |
| **Sat Nov 28** | **Rivalry Saturday** (The Game at noon on FOX) [6] | **High** | Biggest fall Saturday; home vs. campus caveat |
| **Fri–Sat Dec 4–5** | **Conference championships + NBA Cup QFs** [7][8] | **High** | "Every title game on one screen" |
| Sun Dec 6 | CFP Selection Day [1] | Low (attention only) | Bracket-reveal content |
| ~Dec 7–18 | Fall finals at most semester schools [CONSENSUS] | n/a | Go quiet; no paid spend |
| Fri Dec 11 | NBA Cup final, Indianapolis [8] | Low | n/a |
| Fri–Sat Dec 18–19 | CFP first round (Sat at 12 / 3:30 / 7:30) [1] | Med–High | Many students gone home |
| Mid-Dec – early Jan | Bowl season | Med (stacked bowl days) | "Bowl buffet" |
| **Fri Dec 25** | **NFL ×3 + NBA ×5** [2][8] | **High** (needs Netflix-carried games to be watchable; check) | Live TV service users, not campus users |
| Wed–Fri Dec 30 – Jan 1 | Fiesta (Dec 30), NHL Winter Classic (Dec 31) [30], CFP QFs Jan 1 at 12/4/8 + other bowls [1] | Med–High | New Year's Day "three playoff games plus bowls" |
| Sat–Sun Jan 9–10, 2027 | NFL Week 18 (dates inferred from Wild Card Jan 16) | Med | Playoff-stakes games run simultaneously in the late window |
| Thu–Fri Jan 14–15; Mon Jan 25 | CFP semis; title game [1] | Low (single game) | Attention only |
| Sat–Mon Jan 16–18 | NFL Wild Card (6 games: 2/3/1) [2][9] | Low–Med (scheduled one after another) | Pair with college-hoops Saturday |
| Jan 17–31 (main draw) | Australian Open (overnight in the US) [11] | Low | n/a |
| Sun Feb 14 | Super Bowl LXI, SoFi, ABC/ESPN [2] | Low (one game) | Highest attention; "What do you watch the other 51 Sundays?" |
| Feb Saturdays | College-hoops conference play | High | "Bubble watch on four screens" |
| ~Mar 9–14 | Conference tournaments (Big Ten Mar 10–14, Indianapolis; ACC Mar 9–13, single source) [31] | High (all day, overlapping) | Warm-up promo before the Madness |
| Sun Mar 14 | Selection Sunday (men's and women's) [3][4] | Low (attention) | Last chance to get installs before Thursday |
| Tue–Wed Mar 16–17 | Opening Round (12 games, new) [3] | Med–High | Explain the new 76-team format |
| **Thu–Sun Mar 18–21** | **First and Second Round** (CBS/TBS/TNT/truTV; women's rounds Mar 19–22) [3][4][5] | **Highest** | The core demo: every channel at once, auto-switch on timeouts |
| Wed–Thu Mar 24–25 | MLB Opening Night (Netflix) / Opening Day (14 games) [32] | Med (local/regional rights) | "Baseball's back" (CBA expires Dec 1, 2026: possible schedule risk) |
| Mar 25–28 | Sweet 16 / Elite Eight (women's Mar 26–29) [3][4] | Med–High | n/a |
| Mar (varies) | Spring break [CONSENSUS] | n/a | Campus TV may not work at home |
| Apr 2–5 | Women's (Apr 2/4) and men's (Apr 3/5) Final Fours [3][4] | Low | n/a |
| Apr 13–17+ | NBA play-in (Apr 13) and playoffs (Apr 17); NHL playoffs after Apr 10 (date not published) [8][30] | Med–High (NBA + NHL nights overlap) | "Playoff nights, two sports" |
| Apr 29 – May 1 | NFL Draft, Washington, D.C. [33] | Low | Attention only |
| Late Apr – May | Spring finals; semester ends | n/a | Quiet |
| May 23 – Jun 6; Jun 5 | Roland-Garros; UCL final, Madrid [11][28] | Low | n/a |
| June | NBA Finals / Stanley Cup Final | Low | n/a |
| Jun 28 – Jul 11 | Wimbledon [11] | Low–Med | n/a |
| Summer | Off-season for students | n/a | Build, fix, collect testimonials |
| Mid-Aug – early Sep 2027 | **Dorm move-in** (students set up campus TV) [CONSENSUS] | n/a (install moment) | RA/club flyers with QR + UTM; "set up your dorm TV" |
| **Sat Aug 28 – Mon Sep 6, 2027** | **CFB Week 1 (new format) + US Open (from Aug 29) + Labor Day** [10][11] | **High** | Back-to-school + kickoff combined |
| Sep 2027 | NFL kickoff (date TBA); MLB regular season ends Sun Sep 26 [32] | Med | n/a |
| Early Oct 2027 | MLB Wild Card series (several series on the same days) | Med–High | n/a |

### Top 8 moments, ranked

1. **March Madness First/Second Round, Mar 18–21, 2027.** The most simultaneous nationally televised games of the year, on four channels a typical lineup carries, during the school term. Promo should run Selection Sunday through Wednesday.
2. **Conference championship weekend, Dec 4–5, 2026.** Stacked title games plus NBA Cup quarterfinals. Students are mostly still on campus, before finals.
3. **CFB Week 1 + move-in, Aug 28 – Sep 6, 2027.** The install moment for the campus audience, with the US Open overlapping. This is where a year of preparation pays off.
4. **Rivalry Week, Nov 27–28, 2026.** The biggest regular-season Saturday. Many campus users will be home, so promote it Nov 16–24.
5. **Regular CFB Saturdays, now through Nov 21.** The nearest opportunity: four live Saturdays left to make clips of real switches.
6. **Conference tournaments, ~Mar 9–14, 2027.** All-day overlapping games, and a warm-up for #1.
7. **Christmas Day, Dec 25, 2026.** Eight games, but mainly for live TV service users at home. Check whether Netflix-only NFL games are watchable in the app (probably not through a cable-style lineup).
8. **New Year's window, Dec 30 – Jan 1.** CFP quarterfinals plus bowls plus the NHL Winter Classic. High attention, with moderate overlap.

Honorable mentions: NBA + NHL playoff openers (mid-Apr), MLB Opening Day (Mar 25), MLB Wild Card (Oct 2027). The Super Bowl gets maximum attention but has little multi-game value. Use it for awareness content, not a "4 screens" pitch.

## 3. Measurement plan

### 3a. Measurable today, zero code changes

| Signal | Where | What it approximates | Caveats |
|---|---|---|---|
| GetObject on `TappedIn-Setup.exe`, `TappedIn.dmg` | R2 bucket → Metrics, or GraphQL `r2OperationsAdaptiveGroups` filtered by `objectName` [13] | Download **starts** per platform | Resumed (range) downloads add extra GETs; HEAD requests counted separately; ≤31 days per query |
| R2 downloaded bytes ÷ ~157 MB (Win) | `r2BandwidthUsageAdaptiveGroups` [13] | **Completed-download equivalents** | Per bucket, not per object, so Windows and Mac are mixed (Mac DMG is ~376 MB); excludes transfers under 100 KiB |
| GetObject on `latest.json` | same | Rough **page views** of pages that load `download.js`, plus one per Windows download | 5-min browser cache (`max-age=300`); no referrer data |
| GetObject on `latest-mac.json` / `TappedIn-mac.zip` | same | Page views + **Mac app update checks**; zip GETs = Mac updates applied (a rough count of active Mac installs) | Make sure the privacy wording covers this (finding 15) |
| Pages Functions Metrics tab | Workers & Pages → project → Functions Metrics [34] | Total/success/error requests | Project-wide totals; I found no per-route breakdown in the docs |
| GitHub `download_count` | `gh api repos/omcaul13/TappedIn/releases --jq '.[] \| {tag: .tag_name, assets: [.assets[] \| {name, download_count}]}'` [14] | GitHub-direct downloads only | 0–2 per asset on 2026-10-21; doesn't include the site/R2 path |

None of these show **where visitors came from**. For that you need a ref/UTM-aware tool (below), or the platforms' own link-click stats (TikTok/IG/Reddit post analytics).

Free-tier headroom: Pages Functions share the Workers Free quota of 100,000 requests/day [35]. R2 includes 10M Class B operations/month, and egress is free [36]. A viral day still sits well inside both.

### 3b. Options if they add measurement

| Tool | Cost | Cookies? | UTM? | Custom events (download click)? | Fit |
|---|---|---|---|---|---|
| Cloudflare Web Analytics [15][16] | Free | No (no cookies/localStorage, no IP fingerprinting) | **No** (query strings dropped) | **No** | Pageviews and referrers only; doesn't answer "which post worked" |
| Workers Analytics Engine counter in `/download/*` Function [20][21] | Free tier (100k writes/day); not billed today | No (server-side) | Yes, if the download URL carries `?ref=`/utm (needs the button to forward it) | Counts actual download requests, not clicks; ad blockers can't block it | **Best match for "no tracking"**: aggregate rows of {ref, platform, country}, no IP |
| KV counter [22] | Free | No | Yes | Yes | Poor: 1,000 writes/day, 1 write/sec/key; skip |
| Umami Cloud Hobby [17] | Free (100K events/mo, 1 site, 6-mo retention); Pro $20 | No | Yes | Yes | **Best free client-side option** |
| Umami self-host [17] | Free + hosting | No | Yes | Yes | Overkill for two students |
| Plausible [18] | $9/mo (10k pageviews), 30-day trial | No | Yes | Yes (goals). File-download auto-tracking matches file extensions, and `/download/windows` has none, so it needs a custom goal [ANECDOTE: inference] | Polished; costs money |
| GoatCounter [37] | Free for "reasonable public usage" | No | Campaigns mentioned; UTM handling unverified | Yes (`count({event:true})`) | Minimal, fine |
| Simple Analytics [38] | Free plan: 1-month history, badge required; paid $20/mo | No | Unverified | Unverified | Free tier too limited |
| Pirsch [19] | $6/mo (10k pageviews), 30-day trial | No (hashes IP + UA) | Unverified | Yes | Cheapest paid option |

**Recommendation for consistency with "No accounts, no tracking":** cookie-less, aggregate-only site analytics (Umami Hobby *or* an Analytics Engine counter), and a footer line saying exactly that: "This site counts visits and downloads without cookies or personal data." Never put telemetry in the app without an explicit opt-in. Any future "first-run completed" ping should be off by default and documented. [CONSENSUS]

**Two small fixes make any of these work (describe-only):** forward the landing page's `ref`/utm parameters onto the download links, and add a fixed tag such as `?ref=selfsend` to the phone self-send link (a tag only, never personal data). That lets the team see how many phone visits turn into desktop downloads.

### 3c. UTM convention

All lowercase, hyphens, no spaces (values are case-sensitive) [39]. Always set source, medium and campaign [39].

- `utm_source`: `tiktok`, `instagram`, `reddit`, `youtube`, `x`, `discord`, `groupme`, `email`, `flyer`
- `utm_medium`: `social` (organic post/bio), `paid-social`, `community` (Reddit/Discord threads), `qr`, `referral`
- `utm_campaign`: `yyyy-mm-moment` → `2026-11-rivalry`, `2026-12-confchamp`, `2027-03-madness`, `2027-08-movein`
- `utm_content`: creative or placement → `bio`, `grid-demo-v1`, `switch-clip-osu-mich`, `r-cfb-gamethread`

Example: `https://<site>/?utm_source=tiktok&utm_medium=social&utm_campaign=2027-03-madness&utm_content=bio`. On Reddit, long UTMs look spammy. Use a short alias like `?ref=r-cfb` and map refs to campaigns in a shared sheet. TikTok bio links need a Business account or 1,000+ followers and are added in the mobile app [40]. Instagram allows up to 5 bio links, and they open in the in-app browser [41]. In both cases the click comes from a phone, so the self-send tag matters. Google's Campaign URL Builder: https://ga-dev-tools.web.app/ga4/campaign-url-builder/ [39]. **Without an analytics tool or the server counter, UTMs are recorded nowhere.**

### 3d. Funnel and weekly 15-minute review (Mondays, after the sports weekend)

Funnel: post views → site visits (by ref/source) → download clicks → download starts (R2 GETs) → completed-download equivalents (R2 bytes) → (optional, opt-in only) first-run completed.

1. (3 min) R2 GraphQL/dashboard: last 7 days of GETs on exe/dmg/zip, plus bytes.
2. (4 min) Analytics or counter: visits and downloads by ref/campaign; download rate per source.
3. (3 min) Native post stats: views → profile visits → link clicks for each post.
4. (5 min) One row in a sheet: week, sports moment, posts, visits, starts, completed estimate, support emails/bug reports, **one decision** for next week. Compare weeks of the same moment type (CFB Saturday against CFB Saturday).

**Metrics that matter:** weekly download starts and completed estimates, visit→download rate by source, downloads per post, Mac update pulls and support emails (signs people keep using it). **Vanity:** views, likes, followers, impressions, total pageviews, GitHub stars. **Attribution limits:** group chats, DMs, iMessage and email links show up as "direct" (dark social), and so does the phone→desktop handoff. Expect most downloads to be unattributed. Read trends, not exact credit.

### 3e. Ad-platform conversion tracking

Meta/TikTok/Reddit pixels are third-party scripts that put platform cookies on visitors and report their visits back to the platform. That directly contradicts "no tracking." Server-side APIs avoid the browser script, but Meta CAPI website events require `event_source_url` and `client_user_agent` [23]. Reddit and TikTok also deduplicate pixel and server events by event ID [24][25]. Vendors say server-side sending doesn't remove consent obligations [24]. Under California's CPRA, sharing data for cross-context behavioral advertising (including via pixels) carries opt-out duties [26]. Whether CPRA applies to a free student project depends on its thresholds; this is not legal advice. **Recommended:** if they ever pay for ads, buy click-based objectives measured on the platform side. Measure outcomes with UTM/ref plus the server-side download counter, accept weaker optimization, and keep the trust claim intact.

## 4. Weak-evidence claims rejected

- One schedule article dated the NFL "Thanksgiving Eve" game "Dec 25." The correct date is Wed Nov 25, 2026 [2].
- A search summary placed the 2026 NBA Cup knockouts in Las Vegas. The final is at Hinkle Fieldhouse, Indianapolis, and the earlier knockout games are at home sites [8].
- An SI projection of an Aug 26, 2027 CFB start. Schedule changes since then put games on Aug 28 [10].
- Northeastern 2026–27 finals/break dates: aggregator sites conflict, so they are not used. Check the Registrar.
- NHL 2027 playoff start, Iron Bowl date, Army–Navy date, Big East/SEC tournament dates: not published or not found. ACC tournament dates come from a single source.
- "Dark social is X% of sharing" statistics: old vendor figures, not cited.
- Plausible auto-tracking `/download/windows` as a file download: unlikely (no file extension), listed as inference.
- Simultaneous final-day MLB starts in 2027: unverified, left out.

## 5. Sources

1. "College Football Playoff sets 2026-27 schedule, kickoff times, TV designations," FBSchedules, 2026-06-01, https://fbschedules.com/college-football-playoff-sets-2026-27-schedule-kickoff-times-tv-designations/ [DATA]
2. "NFL schedule release 2026: complete 18-week slate," FBSchedules, May 2026, https://fbschedules.com/nfl-schedule-release-2026-complete-18-week-slate-unveiled/amp/ (Thanksgiving times also in Fox Sports, https://www.foxsports.com/stories/nfl/2026-nfl-schedule-release-full-schedule-all-32-teams) [DATA]
3. "2027 March Madness men's NCAA tournament schedule, dates," NCAA.com, 2026-05-07, https://www.ncaa.com/news/basketball-men/article/2026-05-07/2027-march-madness-mens-ncaa-tournament-schedule-dates [DATA]
4. "2027 March Madness women's NCAA tournament schedule," NCAA.com, 2026-05-07, https://www.ncaa.com/news/basketball-women/article/2026-05-07/2027-march-madness-womens-ncaa-tournament-schedule-dates-times [DATA]
5. "March Madness first-round viewership record," Awful Announcing, Mar 2026, https://awfulannouncing.com/college-basketball/march-madness-first-round-viewership-record-third-consecutive-year.html; SVG ratings roundup, 2026-04-10, https://www.sportsvideo.org/2026/04/10/ratings-roundup-more-than-18-million-fans-tune-into-2026-ncaa-mens-march-madness-on-tnt-and-cbs-sports/ [DATA]
6. "Networks unveil 2026 college football broadcast schedules," SVG, 2026-05-27, https://www.sportsvideo.org/2026/05/27/networks-unveil-2026-college-football-broadcast-schedules/ [DATA]
7. "College football conference championship games," FBSchedules, 2026, https://fbschedules.com/college-football-conference-championship-games [DATA]
8. "NBA key dates 2026-27," NBC Washington, 2026-08-11 (updated 2026-10-19), https://www.nbcwashington.com/nba/nba-key-dates-2026-27-opening-night-trade-deadline-finals/4140559/; ESPN NBA Cup explainer, 2026, https://www.espn.com/nba/story/_/id/49577473/2026-nba-season-tournament-cup-format-highlights-updates [DATA]
9. "NFL Playoff Schedule," FBSchedules, 2026, https://fbschedules.com/nfl-playoff-schedule/ [DATA]
10. "Oklahoma, SMU, Utah State announce 2027 football game date changes," FBSchedules, 2026, https://fbschedules.com/oklahoma-smu-utah-state-announce-2027-football-game-date-changes/ [DATA]
11. "Australian Open 2027 dates confirmed," Ministry of Sport, 2026, https://ministryofsport.com/australian-open-2027-dates-confirmed-following-record-breaking-2026/; ATP 2027 calendar, TennisNerd, 2026, https://www.tennisnerd.net/?p=62689 [DATA for AO; CONSENSUS for RG/Wimbledon/USO]
12. School IT pages on Xfinity On Campus: St. Thomas, https://services.stthomas.edu/TDClient/1898/ClientPortal/KB/Article/99439/XFINITY-on-Campus-Getting-Started; Bowdoin, https://bowdoin.teamdynamix.com/TDClient/1814/Portal/KB/Article/67111/Watch-Xfinity-on-Campus-Bowdoin-Cable-Television; Champlain via GMHEC, https://support.gmhec.org/TDClient/46/cc-portal/KB/PrintArticle?ID=89 (undated, current pages) [DATA]
13. "R2 metrics and analytics," Cloudflare Docs, updated 2026-09-24, https://developers.cloudflare.com/r2/platform/metrics-analytics/ [DATA]
14. "REST API endpoints for release assets," GitHub Docs, 2026, https://docs.github.com/en/rest/releases/assets; plus `gh api` run 2026-10-21 [DATA]
15. "Web Analytics FAQ," Cloudflare Docs, updated 2026-07-14, https://developers.cloudflare.com/web-analytics/faq/ [DATA]
16. "Cloudflare Web Analytics," Cloudflare, accessed 2026-10-21, https://www.cloudflare.com/web-analytics/ [DATA, vendor claim]
17. Umami pricing, accessed 2026-10-21, https://umami.is/pricing [DATA]
18. Plausible pricing, accessed 2026-10-21, https://plausible.io/#pricing; file-download docs, https://plausible.io/docs/file-downloads-tracking [DATA]
19. Pirsch pricing, accessed 2026-10-21, https://pirsch.io/pricing [DATA]
20. "Pages Functions bindings," Cloudflare Docs, updated 2026-06-25, https://developers.cloudflare.com/pages/functions/bindings/ [DATA]
21. Workers Analytics Engine pricing (updated 2026-04-23) and limits, Cloudflare Docs, https://developers.cloudflare.com/analytics/analytics-engine/pricing/ , https://developers.cloudflare.com/analytics/analytics-engine/limits/ [DATA]
22. "KV limits," Cloudflare Docs, updated 2026-10-08, https://developers.cloudflare.com/kv/platform/limits/ [DATA]
23. "Server Event Parameters," Meta for Developers, 2026, https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event [DATA]
24. "Reddit Pixel Cookie Consent Integration Guide," FlexyConsent, 2026, https://flexyconsent.com/blog/reddit-pixel-consent-integration-guide/; Hightouch Reddit CAPI guide, https://hightouch.com/blog/how-to-set-up-reddit-conversion-api [CONSENSUS]
25. Adobe TikTok web events API extension overview, https://experienceleague.adobe.com/docs/experience-platform/tags/extensions/server/tiktok/overview.html; Stape TikTok server-side guide, 2026, https://stape.io/blog/tiktok-server-side-tracking [CONSENSUS]
26. "CCPA selling and sharing: what counts," Clym, 2025, https://www.clym.io/blog/ccpa-selling-and-sharing-what-counts-as-a-sale-or-share [CONSENSUS; not primary law]
27. "What you need to know about the 2026 World Series," MLB.com, Oct 2026, https://www.mlb.com/news/2026-mlb-world-series-faq-schedule-times-teams-and-more [DATA]
28. "2026/27 Champions League: dates, draws, final," UEFA.com, 2026, https://www.uefa.com/uefachampionsleague/news/02a6-20d57cfcd03e-407c22a7f465-1000/ [DATA]
29. "State Farm Champions Classic returns to Chicago in 2026," ESPN Press Room, 2025-11, https://espnpressroom.com/us/press-releases/2025/11/state-farm-champions-classic-returns-to-chicago-in-2026/ [DATA]
30. "NHL releases 2026-27 regular season schedule," NHL.com, 2026, https://www.nhl.com/news/nhl-releases-2026-27-regular-season-schedule [DATA]
31. 2027 Big Ten Men's Basketball Tournament, Gainbridge Fieldhouse, https://www.gainbridgefieldhouse.com/events/detail/2027-big-ten-mens-basketball-tournament; ACC dates via sportsbrackets.net hub, 2026-06-23, https://sportsbrackets.net/2026/06/23/2026-27-mens-college-basketball-schedule-hub/ [DATA / ANECDOTE for ACC]
32. "MLB releases 2027 regular-season schedule," MLB.com, 2026-07-16, https://www.mlb.com/news/mlb-2027-schedule-released [DATA]
33. "NFL announces dates for 2027 Draft in Washington, D.C.," NFL.com, 2026-06, https://www.nfl.com/news/nfl-announces-dates-for-2027-draft-in-washington-d-c [DATA]
34. "Pages Functions metrics," Cloudflare Docs, 2026, https://developers.cloudflare.com/pages/functions/metrics/ [DATA]
35. "Pages Functions pricing," Cloudflare Docs, updated 2026-09-08, https://developers.cloudflare.com/pages/functions/pricing/ [DATA]
36. "R2 pricing," Cloudflare Docs, updated 2026-10-01, https://developers.cloudflare.com/r2/pricing/ [DATA]
37. GoatCounter home and events help, accessed 2026-10-21, https://www.goatcounter.com/ , https://www.goatcounter.com/help/events [DATA]
38. Simple Analytics pricing, accessed 2026-10-21, https://www.simpleanalytics.com/pricing [DATA]
39. "[GA4] URL builders: Collect campaign data with custom URLs," Google Analytics Help, 2026, https://support.google.com/analytics/answer/10917952 [DATA]
40. "TikTok Link in Bio Requirements: 2026 guide," Stan, 2026, https://stan.store/blog/tiktok-link-bio-requirements-2026-guide/ [CONSENSUS]
41. "Instagram now allows up to 5 links in bio," Search Engine Land, 2023-04, https://searchengineland.com/instagram-now-allows-up-to-5-links-in-bio-395742 [CONSENSUS; older than 18 months but still current behavior]
