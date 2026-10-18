# Streaming services for RedZone Director: research report

Researched 2026-10-18. Sources are official help and terms pages where they could be fetched, university housing and IT pages, and the code of open-source projects that already drive these web players. Anything marked **(unverified)** could not be confirmed from a primary source. Short quotes are verbatim. This is not legal advice.

**Contents**
1. [Bottom line](#1-bottom-line)
2. [Campus services](#2-campus-services)
3. [Consumer services](#3-consumer-services)
4. [Comparison tables](#4-comparison-tables)
5. [Recommended priority order](#5-recommended-priority-order)
6. [Risks of distributing the app](#6-risks-of-distributing-the-app)
7. [Safer architecture](#7-safer-architecture)
8. [Decisions for Stage 2](#8-decisions-for-stage-2)
9. [Sources](#9-sources)

---

## 1. Bottom line

1. **Stream limits are the biggest feasibility risk for a 2×2 grid, Xfinity On Campus included.**
   - Comcast's own pages say Xfinity On Campus is "limited to one stream". Instant TV gets two. Regular TV gets five at home and three away.
   - Penn, BU, CMU and UMass Lowell all say one stream. So did Northeastern in 2016.
   - Cox Contour on Campus also says one device at a time.
   - Your 10/17 test still played **six** streams on Northeastern's XOC with no limit message. So the limit is documented but, at least at Northeastern today, not enforced. That can change at any time and may differ by school.
   - Onboarding has to *measure* what plays (Stage 3 step 4). It can't assume 4.
2. **Only five campus services matter for a US student in 2025–26:** Xfinity On Campus, SpectrumU, Apogee/Boldyn Stream2, Cox Contour on Campus, and (mostly retired) Philo Edu.
   - DIRECTV sells campus TV for lounges and bulk deals. No school was found giving students their own DIRECTV streaming login.
3. **Campus TV is shrinking.**
   - BU ended XOC on 5/31/2025, citing usage that "significantly declined".
   - Purdue is retiring live TV in May 2026. UW-Milwaukee and Stockton dropped residence-hall TV. UW-Madison narrowed SpectrumU in 2024. Michigan and Houston retired Philo.
   - **Consumer services are the bigger long-term audience.**
4. **Three services can reuse what you already have:**
   - **Xfinity Stream for regular Comcast customers.** It is the same web app as XOC; only the sign-in differs.
   - **Cox Contour.** Cox's web player runs the same Comcast "TV-APP" web app as Xfinity. The open-source PrismCast project drives both with one code path.
   - **Spectrum.** It has the cleanest per-channel URL of any service: `watch.spectrum.net/livetv?tmsid=<station id>`.
5. **YouTube TV is the most valuable consumer target and the riskiest to sign in to.**
   - It has about 10M subscribers, a full college-football lineup, and stable `tv.youtube.com/watch/<id>` channel URLs.
   - Google blocks sign-in from embedded browser frameworks and automated Chrome. Channels DVR users hit "This browser or app may not be secure" under Puppeteer.
6. **Every terms of service that could be read bans automated access to the player.** That includes Xfinity, YouTube, Hulu, DIRECTV, Philo, Peacock and Paramount+.
   - For your own personal use, the risk is mostly to your own account.
   - **Distributing** the app moves risk onto you as the distributor: cease-and-desist letters, tortious-interference claims, trademark complaints, and Widevine/EVS signing that castLabs can change.
   - See §6. The safest shape is fully local, open source, no shared servers, no service logos, and stop if asked.

---

## 2. Campus services

### 2.1 Xfinity On Campus (Comcast): supported today

**Reach**
- About 63 campuses in 2016 and "more than 100" by August 2017. Comcast has published no newer count.
- Current users found on 2025–26 pages: Northeastern, MIT, CMU, Penn, Temple, Drexel, Towson, Tennessee, Northwestern, Michigan State, UC Davis, Salisbury, Simmons and St. Thomas.
- Dropped it: BU in 2025, Stockton.

**Web player and DRM**
- Sign in at xfinityoncampus.com (pick your school), then watch at xfinity.com/stream.
- Chrome, Firefox, Edge and Safari are supported on Windows and macOS. Linux is not.
- The Linux block is in the Widevine license request itself, so Widevine is confirmed.

**Login**
- School SSO through a federated school picker. The school passes a residency flag (Penn error FEDX100001).
- On a new device: Terms of Activation, then name the device.
- Penn requires the first login on each device to be on the campus network.
- Usually 3 registered devices, and the 4th replaces the oldest.

**Channels**
- Vary by school. Northeastern's lineup (from `config/redzone.config.json5`) has everything except BTN.
- Tennessee: ESPN family, SECN, ACCN, CBSSN, FS1/FS2, TNT, truTV. No BTN, and locals are campus-only.
- Towson: BTN in the base package. ESPNU, SECN and ACCN are paid add-ons.
- Off campus: Comcast says "over 90 live channels"; locals are usually campus-only.

**Streams**
- Documented as 1 (see §1). Measured at Northeastern on 10/17/2026: 6 played.

**Changing channels**
- Guide click, cached `/stream/live/<slug>/<id>/<CALLSIGN>` URLs, or a full guide load. This is what `src/windows/tune.ts` does today.
- PrismCast reaches 2–3 s switches by calling the TV-APP element's internal `_watchChannelEventHandler`. That calls the site's private code, which is more invasive and more fragile than clicking the guide. Not recommended.

**Terms**
- The Xfinity Web Services Terms (effective 2/13/2024) cover xfinity.com/stream. They bar access:
  - "through any automated means, including scripts or web crawlers"
  - "except through APIs or other interfaces specifically provided for this purpose"
- They also say "You may not incorporate the Content into any hardware or software application." Use is limited to "personal, residential, and non-commercial purposes".
- A third-party tracker reports a July 2026 clause banning AI agents (unverified).

### 2.2 SpectrumU (Charter / Spectrum Enterprise)

**Reach**
- No total published.
- Users: Columbia (free in undergraduate halls), UCSD, Cal Poly, CSUN, Binghamton, Michigan Tech, Colby, Hobart and William Smith, Morehead State, Wofford and others.
- In 2021, six New York colleges added about 12,000 viewers.
- UW-Madison dropped campus-wide service in July 2024.

**Web player and DRM**
- watch.spectrum.net ("Sign In to SpectrumU"), also watch.spectrumutv.com.
- Chrome, Firefox, Edge and Safari supported. Widevine is very likely (unverified).

**Login**
- Enter the school domain, then school SSO ("Trusted Authentication"), sometimes with Duo.
- Browser tokens last 14 days (UCSD guide).
- Some schools authenticate common-area devices by network instead.

**Channels**
- UW-Madison's lineup had every college-football network: ESPN family, SECN, ACCN, BTN, CBSSN, FS1/FS2, TNT, truTV, and the ABC/CBS/NBC/FOX/CW locals.
- Cal Poly's page still lists Pac-12 Networks and NBCSN, so it's stale.

**Streams**
- "Multiple devices simultaneously" on the campus network (North Greenville). One device off campus (North Greenville, Morehead State).

**Changing channels**
- The consumer app has a per-channel URL: `https://watch.spectrum.net/livetv?tmsid=<Gracenote station id>`. PrismCast reads the station ID from the guide's logo image URLs.
- Whether SpectrumU accounts accept the same URLs is unverified, but it's the same web app.

**Terms**
- The "Charter Software License Agreement: SpectrumU TV App…". Spectrum blocked automated fetches, so its text was not read (unverified).

**Off campus**
- Varies: Morehead 120+ channels, Cal Poly and Wisconsin none live.

### 2.3 Apogee Stream2 (Apogee is now part of Boldyn Networks)

**Reach**
- Apogee claims 350+ colleges and more than 1M students and staff across *all* its services, not only TV.
- Stream2 schools found: USC, George Mason, Rochester, JMU, NC A&T, Miami (Ohio), University of Miami, Wake Forest, WashU, Montclair State, Bowling Green.
- Campus Televideo became part of Apogee in 2015.

**Web player and DRM**
- webplayer.mystream2.com: search for your school, then sign in.
- Chrome is recommended; Safari is not supported. DRM is unverified.

**Login**
- School SSO, sometimes with Duo. An End User Agreement at first login (text not found).

**Channels**
- NC A&T: ESPN, ESPN2, ESPNU, ESPNews, SECN, ACCN, BTN, FS1. Rochester and Wake Forest list about 80 channels including locals.

**Streams, URLs and off campus**
- Stream limit and per-channel URLs: unverified. No open-source project drives it.
- It runs from a headend on the campus network and **does not work off campus** (USC, NC A&T, GMU and others).

### 2.4 Cox Contour on Campus (Cox Business)

**Reach**
- No count found. Users include Providence College, William & Mary and Hollins. ODU's MonarchVision runs on Cox coax.

**Web player and login**
- campus.cox.com (pick your school), then school SSO.
- Cox's consumer player, watchtv.cox.com, is the same Comcast "TV-APP" web app as Xfinity Stream. PrismCast's `comcastPolymer.ts` serves both.
- Whether campus.cox.com is the same app is likely but unverified. DRM is probably Widevine (unverified).

**Streams and off campus**
- Cox's FAQ says "only one device at a time".
- On-campus-network devices only.

**Channels and terms**
- Not found (unverified).

### 2.5 Philo Edu

**Status**
- Philo began as Tivli at Harvard and reached 42 universities by 2015.
- Retired at Michigan (2021), Harding (2022) and Houston (2022). No 2025–26 deployment was found.
- Philo Edu re-streamed the school's own cable lineup, so it could carry ESPN.
- **Consumer Philo has no ESPN, no locals and no college-football networks.** Not worth an adapter.

**Technical notes**
- Uses Widevine; on campus networks only.
- Consumer terms (effective 10/9/2026) ban "use any automatic means to access our Services". A new section requires AI agents to identify themselves in the user agent and stop when asked.

### 2.6 Others

- **DIRECTV campus:** bulk and common-area deals only. No student login found.
- **YouTube TV or Sling on lounge Rokus** (Stetson, John Carroll): school-run accounts with no student login.
- **No campus streaming product found:** Hotwire (Fision U is internet), Verizon Fios, Mediacom, Optimum, Allo, Midco.
- **No in-room TV:** Lesley, Susquehanna, Purdue (from May 2026), UW-Milwaukee.

---

## 3. Consumer services

**No service offers native multiview in a desktop web browser.**
- YouTube TV's help page: you "can't watch in multiview from your web browser."
- Fubo's multiview runs on Apple TV, Roku and LG.
- DIRECTV's new "Build Your Own Multiview" (October 2026) runs on Gemini and Roku.
- So a 4-up desktop grid still fills a real gap.

### 3.1 YouTube TV

**Reach**
- About 10M+ subscribers (industry estimates from late 2025 and March 2026; not an official figure).

**Web player and DRM**
- tv.youtube.com, Widevine.

**Login**
- Google account. **Google blocks sign-in from embedded frameworks and detects automated Chrome** (Google Security Blog, April 2019; Channels DVR reports).
- RedZone attaches to its views over the debugging port. Whether Google flags castLabs Electron is unverified, so it must be tested before anything else.

**Channels**
- Base plan: all locals including CW, ESPN family, SECN, FS1/FS2, CBSSN, TNT, truTV. ACCN and BTN are marked "some regions".
- A $64.99 Sports Plan has existed since February 2026.
- A Disney blackout (10/30–11/14/2025) has been resolved.

**Streams**
- 3, per the paid-service terms ("limited to 3 concurrent streams").
- 4K Plus: unlimited streams at home.

**Changing channels**
- `https://tv.youtube.com/watch/<11-char id>`, scraped from the `/live` guide. PrismCast notes the URL "carries no session state", so it can be cached per channel.
- The watch page holds many `<video>` elements, so the app has to pick the active one.

**Location**
- Home area is set by zip code and location. Away from home you get local channels for where you are.
- You must check in at home every 3 months, and the home area can change twice in 12 months.
- **A student away at school is effectively "away from home."**

**Terms**
- Bans "automated means (such as robots, botnets or scrapers)".
- "personal, non-commercial, residential use only".

### 3.2 Hulu + Live TV (Disney; combined with Fubo since 10/29/2025)

**Reach**
- 6.2M Hulu Live and Fubo subscribers combined (12/31/2025). Both products still run separately.

**Web player and DRM**
- hulu.com/live, Widevine. Disney says there are "no current plans to sunset the Hulu app".

**Login**
- Disney account.

**Channels**
- ESPN family, SECN, ACCN, BTN, FS1/FS2, CBSSN and locals (secondary sources). truTV is unconfirmed.

**Streams**
- 2. The Unlimited Screens add-on allows unlimited at home and 3 away.

**Changing channels**
- **No per-channel URL.** The guide is a virtualized single-page app.
- PrismCast rewrites Hulu's playback requests. That is too invasive for RedZone. Guide clicks are the acceptable path.

**Terms**
- Ban "using a robot, spider, script or other automated means", also modifying, framing or embedding the service.

**Location**
- Home network rules. Third-party sources say 4 changes a year.

### 3.3 Sling TV

**Reach**
- 1.98M (end of 2025).

**Web player and DRM**
- watch.sling.com, Widevine. Sling's page lists only Chrome and Safari for computers.

**Login**
- Sling account.

**Channels**
- **Orange:** ESPN, ESPN2, TNT.
- **Blue:** FS1, truTV, TNT, plus FOX/NBC/ABC in some markets.
- **Sports Extra add-on:** SECN, ACCN, ESPNU, ESPNews, BTN, FS2.
- **No CBS, CW or CBSSN on any tier.**

**Streams**
- **Orange 1**, Blue 3, Orange & Blue 4. Orange channels always play on one device at a time, so four ESPN-family screens are impossible.

**Changing channels**
- `https://watch.sling.com/1/channel/<32-hex GUID>/watch`, with the GUID read from the guide (CH4C project).
- PrismCast notes there are "no stable watch URLs" apart from the channel GUID.

**Terms**
- Couldn't be fetched (unverified).

### 3.4 Fubo

**Reach**
- Counted with Hulu Live above.

**Web player and DRM**
- fubo.tv, Widevine assumed. The official browser page returned 403.

**Login**
- Fubo account.

**Channels**
- ESPN family, SECN, ACCN, BTN, CBSSN, FS1/FS2, and ABC/CBS/FOX locals.
- **No TNT, TBS or truTV**, so no TNT College Football Playoff games.
- NBC returned in mid-2026 (status unverified).

**Streams**
- 10 at home and 3 away on current plans (help-center snippet).

**Changing channels**
- Unverified. One report of `fubo.tv/p/watch?channelId=<n>&type=live`. Another user says there are no live deep links.

**Terms**
- Couldn't be fetched (unverified).

### 3.5 DIRECTV (streaming; the "DIRECTV STREAM" name was retired in April 2025)

**Reach**
- No current streaming count. It was under 1M in 2023.

**Web player and DRM**
- stream.directv.com, Widevine. **Chrome or Edge 143+ recommended.** The ECS Chromium version and the user agent RedZone presents both matter here.

**Login**
- DIRECTV account.

**Channels**
- MySports: locals, ESPN, ESPN2, FS1/FS2, TNT, truTV, CBSSN.
- SECN, BTN, ESPNU and ACCN need Choice or above.

**Streams**
- Unlimited at home and 3 away.
- **Fox networks are capped at 3 total, even at home:** FOX, FS1, FS2 and BTN.

**Changing channels**
- **No deep links.** Projects either hook the app's internal Redux store (PrismCast) or tab through the guide and type the channel number (chrome-capture). Both are fragile, and the Redux hook is too invasive.

**Terms**
- Bans "use the App to send automated queries to any website"; "only for private, non-commercial use".

### 3.6 Xfinity Stream for regular Comcast customers

**Reach**
- 11.27M Comcast video customers (end of 2025).

**Web player, tuning and terms**
- Same web app, tuner and terms as XOC.

**Login**
- Comcast ID; no Watch Now hand-off.

**Streams**
- 5 at home and 3 away (Instant TV: 2).

**Location**
- The full lineup only on your home Xfinity network. Away from home you get about 250 "TV Go" channels, and locals may be missing.

### 3.7 Spectrum TV (consumer)

**Reach**
- 12.6M video customers (end of 2025).

**Web player and tuning**
- watch.spectrum.net, with the same tmsid URLs as SpectrumU.

**Streams**
- Unlimited at home and 3 away. Some channels are home-only.

### 3.8 Network-specific apps (not recommended as adapters in Stage 2)

These are organized by program, not by channel. That fits the halftime reel or a single network better than a 4-channel tuner.

| Service | College football coverage | Streams | Notes |
|---|---|---|---|
| ESPN Unlimited (launched 8/2025) | ESPN, ESPN2, ESPNU, ESPNews, SECN, ACCN, ESPN on ABC | 3 | espn.com/watch. Disney account or TV-provider login. Deep links point to programs, not channels. |
| Fox One | FOX, FS1, FS2, BTN | unverified | `fox.com/live/channels`, tuned by clicking channel logos. PrismCast says it is non-DRM HLS. |
| Peacock | NBC plus exclusive Big Ten games | 3 | Bans "robots, spiders, crawlers, devices, scripts". |
| Paramount+ Premium | Live CBS games | 3–4 (conflicting) | Bans "any robot, bot, scraper". |

Venu Sports was cancelled before launch (January 2025).

---

## 4. Comparison tables

### 4.1 Access and technology

| Service | Reach | Notable schools | Desktop web player | Widevine | Login | Off campus or away from home |
|---|---|---|---|---|---|---|
| **Xfinity On Campus** | 100+ schools (2017) | Northeastern, MIT, CMU, Penn, Temple, Northwestern, Tennessee, Michigan State | xfinity.com/stream | Yes | School SSO via xfinityoncampus.com, then Watch Now | ~90 channels, no locals |
| **SpectrumU** | Not published | Columbia, UCSD, Cal Poly, Binghamton, Michigan Tech | watch.spectrum.net | Likely (unverified) | School domain, then SSO (14-day token) | Varies by school, 1 stream |
| **Apogee Stream2** | Apogee: 350+ colleges (all services) | USC, GMU, Rochester, JMU, Wake Forest, WashU, U Miami | webplayer.mystream2.com | Unverified | School SSO | **No** |
| **Cox Contour on Campus** | Not published | Providence, William & Mary | campus.cox.com | Probably | School SSO | **No** |
| Philo Edu | Mostly retired | (Richmond page undated) | school.philo.com | Yes | School SSO | No |
| **YouTube TV** | ~10M subscribers | — | tv.youtube.com | Yes | Google account (**embedded-browser block**) | Home-area rules |
| **Hulu + Live TV** | 6.2M with Fubo | — | hulu.com/live | Yes | Disney account | Home-network rules |
| **Sling TV** | 1.98M | — | watch.sling.com | Yes | Sling account | Mostly none |
| **Fubo** | (with Hulu) | — | fubo.tv | Assumed | Fubo account | 3 away |
| **DIRECTV** | <1M (2023) | — | stream.directv.com (Chrome 143+) | Yes | DIRECTV account | 3 away |
| **Xfinity Stream (consumer)** | 11.27M video | — | xfinity.com/stream | Yes | Comcast ID | ~250 channels away |
| **Spectrum TV (consumer)** | 12.6M video | — | watch.spectrum.net | Likely | Spectrum account | 3 away, fewer channels |

### 4.2 College-football networks

Key: ✓ carried · ~ depends on school, market or package · ✗ not carried · ? unverified. Pac-12 Network shut down in 2024 and no longer matters.

| Service (lineup basis) | ESPN | ESPN2 | ESPNU | SECN | ACCN | BTN | FS1 | FS2 | CBSSN | ABC | CBS | NBC | FOX | CW | TNT/truTV |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| XOC (Northeastern, your config) | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| XOC (Tennessee / Towson) | ✓ | ✓ | ~ | ~ | ~ | ~ | ✓ | ~ | ~ | campus only | campus only | campus only | campus only | campus only | ~ |
| SpectrumU (UW-Madison) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Stream2 (NC A&T) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ? | ? | ~ | ~ | ~ | ~ | ? | ? |
| Cox on Campus | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| Philo (consumer) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| YouTube TV (base) | ✓ | ✓ | ✓ | ✓ | ~ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hulu + Live TV | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ? | ? |
| Sling Orange & Blue + Sports Extra | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ~ | ✗ | ~ | ~ | ✗ | ✓ |
| Fubo | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ? | ✓ | ? | ✗ |
| DIRECTV (Choice / MySports) | ✓ | ✓ | ~ | ~ | ~ | ~ | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ? | ✓ |
| Xfinity / Spectrum consumer | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ |

Because lineups vary this much, **lineup discovery has to happen per user.** Scrape the guide, then match against ESPN's network names. A static per-service map can only be a fallback.

### 4.3 Integration

| Service | Streams per account | Channel change | Terms on automation | Difficulty | Priority |
|---|---|---|---|---|---|
| **Xfinity On Campus** | 1 documented, **6 measured** | Guide click + cached URL (done) | Bans "automated means, including scripts" | Done | **1 (stable)** |
| **Xfinity Stream (consumer)** | 5 home / 3 away | Same as XOC | Same as XOC | **Low**: same app, new login detection | **2** |
| **Spectrum (SpectrumU + consumer)** | Multiple on campus; unlimited home / 3 away | **URL** (`livetv?tmsid=`) | Not read (unverified) | **Low–medium** | **3** |
| **Cox Contour (campus + consumer)** | 1 on campus | Comcast TV-APP, likely the same as Xfinity | Not read | **Low–medium** if it's the same app | **4** |
| **YouTube TV** | 3 (unlimited at home with 4K Plus) | **URL** (`/watch/<id>`) | Bans "automated means (such as robots…)" | **Medium–high**: Google sign-in block, multiple `<video>` elements | **5** |
| **Sling TV** | Orange 1, Blue 3, Orange & Blue 4 | **URL** (`/1/channel/<guid>/watch`) | Not read | Medium | **6** |
| Hulu + Live TV | 2 (add-on: unlimited at home) | Guide clicks only | Bans "robot, spider, script" | High | 7 (later) |
| Fubo | 10 home / 3 away | Unverified | Not read | Medium–high (unknown) | 8 (later) |
| DIRECTV | Unlimited home / 3 away; **Fox networks 3** | Guide or keyboard only | Bans "automated queries" | High | 9 (later) |
| Apogee Stream2 | Unverified | Unverified | EULA not found | Unknown: no information and no prior art | Needs a tester |
| Philo | 3 (consumer) | URL | Bans "automatic means" | — | **Skip** (no sports) |
| DIRECTV campus | — | — | — | — | **Skip** (no student product) |

---

## 5. Recommended priority order

The order weighs reach × college-football lineup × usable stream count against integration risk:

1. **Xfinity On Campus**: becomes the first adapter, **stable**. Behavior unchanged.
2. **Xfinity Stream (consumer)**: almost free. It shares the tuner, health checks and CSS with XOC. Only sign-in and lineup detection differ. It's the largest audience that needs no new tuning code.
3. **Spectrum (SpectrumU + Spectrum TV)**: one adapter with two sign-in entry points. It has a clean URL per channel, a big consumer base, a solid campus footprint, and more than one stream on campus.
4. **Cox Contour (on Campus + consumer)**: probably the Comcast TV-APP again, so the shared Xfinity code may be reused through a common "Comcast TV-APP" base. It is limited by the documented single stream on campus.
5. **YouTube TV**: the biggest consumer service with the best lineup and stable URLs. **Start with a sign-in spike:** can a Google account sign in inside a RedZone view at all? If Google blocks it, the adapter is blocked. Don't work around that block (§6).
6. **Sling TV**: GUID URLs are workable. Orange's single stream limits it.

Later, only if a tester turns up: Hulu + Live TV, Fubo, DIRECTV, Apogee Stream2 (a generic "guide-click" adapter configured through diagnostics). Skip Philo and DIRECTV campus.

**Ground rule for every adapter:** tune only by navigating to a URL or clicking the service's own guide, the way a user would. Don't do what some capture projects do: rewrite the service's network requests (Hulu), hook its internal app state (DIRECTV), or call private page functions (Xfinity `_watchChannelEventHandler`). Those are faster, but they are closer to "modifying the service", they break more often, and they are harder to defend (§6).

---

## 6. Risks of distributing the app

Personal use keeps the risk mostly with you: your account, your terms of service. Distribution adds risks that fall on the distributor.

### 6.1 Terms of service

- **Every terms document read bans automated access, as noted per service in §2–§3.** Most also bar modifying, framing or embedding the service and allow only personal, non-commercial use.
- Xfinity adds: "You may not incorporate the Content into any hardware or software application." Xfinity's visitor agreement says "We do not permit framing or inline linking to our Site".
- **There is a trend toward explicit AI-agent clauses.** Philo's 10/2026 terms add a section requiring agents to identify themselves. A tracker reports a July 2026 Comcast clause (unverified). RedZone isn't an AI agent, but the direction is clear: services are writing automation bans more explicitly.
- **Who carries the risk:**
  - A terms violation is mainly a **contract matter between the user and the service**. Usually that means account suspension.
  - A distributor can still face a cease-and-desist letter and **tortious interference with contract**. In *MDY v. Blizzard* (9th Cir. 2010), that claim against a bot maker was sent to trial.
- **Enforcement precedent:**
  - Google shut down YouTube Vanced (2022) with a cease-and-desist that targeted its name and logo.
  - YouTube sent Invidious a 7-day takedown demand (2023).
  - Comcast has taken no confirmed action against automation tools. Channels DVR users report anecdotal password resets and 403 errors with Xfinity TV Everywhere.
- **Stream limits:**
  - Advertising "4 screens" to XOC students, whose documented limit is 1, invites both account problems and attention.
  - Account sharing is banned outright by Xfinity: "You will not allow another person to access the Web Services using your credentials".

### 6.2 Widevine, VMP and castLabs EVS

- ECS ships "VMP-signed for development". Xfinity's license server refused that build (your error `-9000:502`), so production EVS signing is required, at least for Xfinity.
- **EVS is free and removes the need for your own Widevine agreement with Google,** per castLabs. Rules: one account per person; don't force re-signing while a signature is valid; tokens expire monthly. Windows and macOS only, because Linux can't be VMP-signed.
- **Widevine can change it.** In May 2022 castLabs paused EVS "At the request of Widevine" while Widevine investigated "possible misuse of ECS". castLabs warned the terms may change.
  - An app that automates third-party pay-TV players is the kind of use such a review would look at (inference).
- **Distribution choices:**
  1. **You ship EVS-signed binaries.** You become the visible party to castLabs and Widevine. No separate EVS end-user license text was found (unverified).
  2. **Users build and EVS-sign their own copy.** This keeps you out of the signer seat. It's more friction: Python, an EVS account, and re-signing after updates. It matches what you do now.
- **Don't bundle the CDM.** castLabs relays Widevine's warning about "legal issues with providing the Widevine CDM". ECS downloads it from Google at runtime, and that has to stay.
- **User-agent spoofing:** RedZone presents a Chrome user agent because Xfinity rejects Electron's. castLabs issue #199 reports custom user agents breaking DRM for some services. Make the user agent an adapter setting, and avoid it where a service accepts the real one.
- Successful open-source precedent: **tidal-hifi** ships an ECS app openly through GitHub, Flathub and others.

### 6.3 DMCA §1201, CFAA, trademarks

- **DMCA §1201 (anti-circumvention):**
  - Using Google's licensed CDM normally is not circumvention.
  - The line is crossed by:
    - extracting keys or frames;
    - spoofing VMP or the security level;
    - possibly defeating stream-count or home-network checks.
  - *MDY v. Blizzard* found §1201 liability for evading an **anti-bot system**. **Never add code that detects or evades a service's automation checks** (Google's sign-in block, bot challenges, CAPTCHAs).
- **CFAA:**
  - After *Van Buren* (2021), breaking a ToS while otherwise authorized generally isn't a CFAA crime.
  - *Facebook v. Power Ventures* (2016) found a violation once access continued **after a cease-and-desist letter and IP blocks**. If you get a letter, stop distributing.
- **Trademarks:**
  - Naming a service to say the app works with it is nominative fair use, as long as there is no implied endorsement.
  - **Logos are riskier.** The Vanced takedown targeted its name and logo, and Comcast's brand guidelines require written approval to use Xfinity branding.
  - Recommendation for Stage 3's service picker: **text names (or neutral initials or icons), not official logos**, plus a non-affiliation disclaimer.

### 6.4 The unofficial ESPN API at many-user scale

- ESPN shut its public API in 2014. espn.com is covered by the Disney Terms of Use, which bar extracting "using a robot, spider, script, or other automated means" and anything that would "overburden or impair" the service. **No rate limits are published.**
- Community reports of throttling and blocks:
  - "You don't have permission to access" errors.
  - User-agent-based blocks.
  - **Date-range scoreboard queries began failing around 9/15/2026.** RedZone uses single-date queries (`?dates=YYYYMMDD`), which still work.
- **Polling at scale:**
  - **Per-user polling from each user's own IP**, which is what RedZone does now, spreads load and keeps any block local to that user.
  - **A shared proxy** would make you the one party "systematically" pulling ESPN data. That's a single point of failure and an obvious target for blocks or letters. Don't build one.
- At scale: back off with jitter on errors and 429/403, cache, poll fast only for on-screen games (already done), and keep the honest user agent.
- **Alternatives:**
  - **CollegeFootballData.com** (per-user keys; live scoreboard from $1/month; live play-by-play from $5/month). The cleanest licensed fallback. Latency versus ESPN is unverified.
  - **ncaa-api** (open source, ncaa.com data; self-host).
  - **SportsDataIO** and **Sportradar** (paid, commercial).

---

## 7. Safer architecture

What the sources support, most of which RedZone already does:

1. **Everything runs locally.**
   - No shared servers, no stream proxying or relaying, and no account data leaves the machine.
   - The local server stays on localhost (already true).
2. **The user signs in on the service's real page, in the app's own view.**
   - The app never sees, stores or sends passwords; only the browser profile's normal cookies persist (already true).
   - Clicks are fine only where they're the user's own "Watch Now"-style hand-off, as now.
3. **Leave DRM alone.**
   - Use the Google-downloaded CDM as is.
   - Never extract, record or capture.
   - Never spoof VMP or the security level.
4. **Respect limits.**
   - Measure stream capacity and tell the user honestly. Never rotate accounts.
   - Never evade home-area, geo or stream checks.
   - Turn standby views off by default for experimental adapters, since standby adds 2 streams.
5. **Never evade automation detection.**
   - If a service blocks sign-in or challenges the app, stop and tell the user.
   - Keep tuning at human pace: one page load at a time, as now.
6. **Keep fragile details in config** (selectors, URLs, timings), so a site change can be fixed without a new binary. This is what Stage 2 plans.
7. **Distribution:**
   - Open source; users build and EVS-sign their own copy.
   - No service logos or names in the app's name.
   - A clear disclaimer that it's not affiliated and that users are responsible for following their provider's terms.
   - **Stop distributing if any service objects.**
8. **ESPN:**
   - Per-user polling with backoff, jitter and caching.
   - A CollegeFootballData key as an optional fallback.

---

## 8. Decisions for Stage 2

These come out of the research and change what gets built.

1. **Which adapters to build in Stage 2.** Recommended: §5 items 2–6 (Xfinity consumer, Spectrum, Cox, YouTube TV, Sling). Hulu, Fubo, DIRECTV and Stream2 later.
2. **Service logos in the picker.** Recommended: text names or neutral icons instead (§6.3).
3. **Stream limits.** XOC documents 1 stream, and you measured 6. Should the app use whatever actually plays (your Stage 3 spec), and is standby (+2 streams) on by default for anyone but you? Recommended: use what plays, show the documented limit next to the result, and keep standby off unless the stream test shows room.
4. **Distribution model.** Recommended: source-only, users sign their own copy. That decides whether Stage 3 onboarding needs an "EVS signing" step for other people.
5. **YouTube TV.** Recommended: a sign-in spike before building the adapter, and an honest "not supported" if Google blocks the embedded view.

---

## 9. Sources

**Xfinity / Comcast**
- https://www.xfinity.com/support/articles/stream-faqs
- https://www.xfinity.com/support/articles/tv-app-overview
- https://www.xfinity.com/support/articles/xfinity-on-campus-getting-started
- https://www.xfinity.com/support/articles/xfinity-tv-app-requirements
- https://www.xfinity.com/terms/web
- https://www.xfinity.com/terms/license/
- https://www.xfinity.com/corporate/legal/visitoragreement
- https://docs.developer.comcast.com/docs/brand-guidelines
- https://www.cmu.edu/computing/services/comm-collab/television/stream-faq.html
- https://su-support.atlassian.net/wiki/spaces/TSC/pages/73835906/Xfinity+on+Campus+System+Requirements+Troubleshooting+and+Support
- https://pennvideo.upenn.edu/archive/XFINITY-instructions.html
- https://www.bu.edu/tech/services/cccs/television/xfinity-on-campus
- https://dailyfreepress.com/?p=212698
- https://news.northeastern.edu/2016/01/20/huskycable-users-now-have-access-to-more-channels-streaming-service
- https://housing.northeastern.edu/residential-utilities/
- https://thebrokenrail.com/2022/12/31/xfinity-stream-on-linux.html
- https://techhelp.towson.edu/TDClient/1879/Portal/KB/ArticleDet?ID=150381
- https://oit.utk.edu/cable/xfinity-stream-channels
- https://www.northwestern.edu/living/services/cable-and-streaming/
- https://www.pc.pitt.edu/sites/default/files/XOCCampusSupportOctober2017.pdf
- https://www.uml.edu/it/get-help/xfinity-on-campus.aspx
- https://www.facilitiesnet.com/site/pressreleases/Xfinity-on-Campus-Surpasses-100-School-Milestone--39726
- https://techguides.uindy.edu/a/1102279
- https://community.getchannels.com/t/provider-xfinity/18118/1017
- https://conductatlas.com/platform/comcast/comcast-terms-of-service/ai-agent-access-prohibition/
- https://cordcuttersnews.com/comcast-lost-1-155-million-tv-customers-710000-internet-customers-in-2025-as-cord-cutting-2-0-grows/

**Spectrum / SpectrumU**
- https://kb.wisc.edu/helpdesk/38722
- https://it.wisc.edu/news/spectrumu-going-away-for-faculty-staff-jul-1/
- https://housing.calpoly.edu/tv-streaming
- https://ngu.teamdynamix.com/TDClient/93/Portal/KB/PrintArticle?ID=14466
- https://www.moreheadstate.edu/news/2023/03/msu-implements-spectrumu-streaming-service
- https://hdhgradfamilyhousing.ucsd.edu/residents/resources/internet-cable/SpectrumU_Trusted-Auth_Quick_Start_UCSD_Grad_English_2024.01.pdf
- https://www.cuit.columbia.edu/cable-tv
- https://corporate.charter.com/newsroom/spectrum-enterprise-teams-with-six-ny-statecolleges-and-universities-to-add-nearly-12000-spectrumu-viewers
- https://www.spectrum.com/policies/spectrumu-tv-app-and-spectrum-enterprise-tv-app (not retrievable)
- https://www.spectrum.net/support/tv/tv-app-frequently-asked-questions
- https://community.getchannels.com/t/stream-links-spectrumtv/45074
- https://www.advanced-television.com/2026/01/30/charter-stops-video-fall/

**Apogee / Boldyn Stream2**
- https://tech.rochester.edu/tutorials/stream2-web-browser-access/
- https://hub.ncat.edu/administration/its/student-tv.php
- https://housing.usc.edu/?p=78424
- https://its.gmu.edu/knowledge-base/what-is-stream2/
- https://help.jmu.edu/TDClient/277/Portal/KB/ArticleDet?ID=20414
- https://www.boldyn.com/news/twenty-six-more-colleges-and-universities-partnered-with-apogee-a-boldyn-networks-company-to-help-fulfill-their-strategic-commitment-to-innovation-and-exceptional-campus-technology-experiences
- https://www.apogee.us/wp-content/uploads/2022/09/Video_IPTV_ServicesData-Sheet_FINAL_041921.pdf

**Cox**
- https://service.providence.edu/TDClient/262/Portal/KB/ArticleDet?ID=5646
- https://ihelp.providence.edu/wp-content/uploads/sites/37/2021/01/contour-on-campus-user-guide.pdf
- https://cox.com/business/tv/lp/contour-on-campus.html

**Philo**
- https://michigan.it.umich.edu/news/2021/02/23/u-m-to-retire-philo-internet-tv/
- https://www.uh.edu/infotech/help/resident-support/philo/
- https://spidertechnet.richmond.edu/TDClient/1955/Portal/Requests/Service/35303/Philo
- https://www.philo.com/terms
- https://help.philo.com/troubleshooting/chrome-browser/

**Campus TV retirements and others**
- https://www.housing.purdue.edu/btv/faq
- https://uwm.edu/housing/amenities/technology-media/
- https://stockton.edu/information-technology/residential-media-and-streaming.html
- https://www.directv.com/insider/directv-for-business/tv-in-dorms/
- https://www.stetson.edu/administration/information-technology/television.php

**YouTube TV / Google**
- https://www.youtube.com/t/terms
- https://www.youtube.com/t/terms_paidservice
- https://support.google.com/youtubetv/answer/13418774
- https://support.google.com/youtubetv/answer/7129768
- https://security.googleblog.com/2019/04/better-protection-against-man-in-middle.html
- https://community.getchannels.com/t/youtubetv-tve-failing-this-browser-or-app-may-not-be-secure/37560
- https://cordcuttersnews.com/youtube-tv-surpasses-10-million-subscribers-solidifying-dominance-in-live-tv-streaming/

**Hulu / Fubo / Sling / DIRECTV**
- https://www.hulu.com/terms
- https://help.hulu.com/s/article/manage-home-network
- https://www.thewrap.com/fubo-hulu-live-tv-merger-disney-deal-closes/
- https://cordcuttersnews.com/fubo-hulu-live-tv-stop-reporting-separate-subscriber-numbers-but-hit-6-2-million-subscribers-combined/
- https://support.fubo.tv/hc/en-us/articles/115001440248
- https://www.tvtechnology.com/news/wbd-networks-dropped-from-fubo
- https://www.sling.com/supported-devices/chrome
- https://home.sling.com/whatson/sports/college-football/stream-college-football-live-sling-tv
- https://ir.echostar.com/node/33401
- https://www.directv.com/support/article/000079946
- https://directv.com/support/article/000069938
- https://www.directv.com/legal/directv-stream-tos-eula-policy/
- https://www.sportsvideo.org/2026/10/15/directv-launches-build-your-own-multiview-for-sports/

**Network apps**
- https://support.espn.com/hc/en-us/articles/40375615278228-How-many-devices-can-stream-ESPN-subscriptions-simultaneously
- https://www.peacocktv.com/terms
- https://www.peacocktv.com/help/article/how-many-streams-can-i-view-concurrently
- https://legal.paramount.com/us/en/pplus/termsofuse

**Prior-art automation projects** (they capture video, which RedZone never does; useful only as tuning references)
- https://github.com/hjdhjd/prismcast (`src/browser/tuning/*.ts`)
- https://github.com/fancybits/chrome-capture-for-channels
- https://github.com/dravenst/CH4C

**castLabs / Widevine**
- https://github.com/castlabs/electron-releases
- https://github.com/castlabs/electron-releases/wiki
- https://github.com/castlabs/electron-releases/wiki/EVS
- https://github.com/castlabs/electron-releases/wiki/FAQ
- https://github.com/castlabs/electron-releases/issues/199
- https://github.com/Mastermindzh/tidal-hifi
- https://pypi.org/project/castlabs-evs

**Legal background**
- https://www.copyright.gov/1201/background.pdf
- https://newmedialaw.proskauer.com/2011/01/04/ninth-circuit-says-dmca-anticircumvention-provision-gives-new-access-prevention-right-to-copyright-owners-mdy-v-blizzard-part-ii/
- https://www.eff.org/deeplinks/2021/06/van-buren-victory-against-overbroad-interpretations-cfaa-protects-security
- https://www.mintz.com/insights-center/viewpoints/2016-07-19-facebook-v-vachani-user-authorization-can-be-revoked-service
- https://www.natlawreview.com/article/linkedin-s-data-scraping-battle-hiq-labs-ends-proposed-judgment
- https://law.resource.org/pub/us/case/reporter/F3/279/279.F3d.796.00-55538.00-55537.00-55229.00-55009.html
- https://www.tubefilter.com/2022/03/14/youtube-vanced-app-shut-down/
- https://alternativeto.net/news/2023/6/youtube-legal-team-asked-invidious-developers-to-take-down-the-service-within-7-days

**ESPN API and alternatives**
- https://disneytermsofuse.com/english/
- https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b
- https://github.com/pseudo-r/Public-ESPN-API
- https://collegefootballdata.com/api-tiers
- https://github.com/henrygd/ncaa-api
