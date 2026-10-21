> Raw notes from one research agent, 2026-10-21. Some claims here were corrected by the fact-check in [07-fact-check.md](07-fact-check.md); [advertising-research.md](../advertising-research.md) uses the corrected versions.

# 2. Paid advertising for a free desktop app on a small budget

Research agent 2 of 8. Accessed 2026-10-21. Labels: [DATA] = platform doc or benchmark with a stated sample; [CONSENSUS] = repeated across several independent practitioner sources; [ANECDOTE] = one practitioner or a vendor claim. Benchmarks are averages across mostly e-commerce and lead-gen advertisers, not free desktop software. Treat every cost figure as a starting range for your own test, not a forecast.

## 1. Top findings

1. **No platform can see an "install".** The download happens on your website, so the only trackable conversion is a **download button click** (or the start of the file request) on the site. To optimize for it you need the platform's pixel and a custom event on that button (Meta Pixel, Reddit Pixel, TikTok Pixel, Google tag). The fallback is UTM-tagged links plus your own download counts from R2/Pages analytics. Reddit recommends running Pixel plus Conversions API together, with deduplication [DATA, 22]. Without a pixel, the platforms optimize for cheap clicks, which several practitioners say get pushed into low-quality placements [ANECDOTE, 9].
2. **Meta's learning threshold is still "about 50 optimization events" in the week after the last significant edit, per ad set.** An ad set is "Learning limited" when it is unlikely to reach that. Significant edits include pausing, or changing the optimization event, audience or creative [DATA, 1]. At an assumed $2–$5 per download click, 50/week means $400–$1,000 per month **per ad set**. So at $100 or $500/month a download-click ad set will almost certainly stay "Learning limited". That is acceptable for a test, but expect noisy results.
3. **TikTok's budget floor is above the $100 tier and close to the $500 tier.** Ad group daily budgets must be above $20, campaign daily budgets above $50, and a lifetime ad group budget must be at least $20 × days (31 days = $620) [DATA, 3]. A continuous TikTok ad group costs about $600+/month, so at $100/month TikTok only works as a short burst (about 5 days).
4. **Reddit has the lowest real floor and the best intent targeting for this product.** The minimum is $5/day per ad group [DATA, 4], though Reddit's own setup guide recommends at least $50/day per ad group [DATA, 5]. You can target communities (Reddit advises at least 15 per ad group), interests and keywords, and choose desktop-only delivery [DATA, 6; CONSENSUS, 7]. It also carries the strongest "made by two students" authenticity angle.
5. **Google Search catches the people already looking, and you can switch phones off.** A −100% mobile device bid adjustment excludes phones, and it is honored even under Smart Bidding [DATA, 10]. Google sets no Search minimum. Your daily spend can reach 2× the average daily budget, but monthly spend is capped at 30.4× that budget [DATA, 11]. Arts & Entertainment is the cheapest search vertical, at about **$1.63 CPC, 12.75% CTR** (LocaliQ, updated June 2026; sample not stated) [DATA, 12].
6. **Search demand for "multiview" is real but owned by the TV services.** YouTube TV fully launched custom 4-stream multiview on 2026-04-28, and coverage calls multiview borderline mandatory for TV services competing for sports fans [DATA/news, 13]. TappedIn's angle is that it works across the services you already have and switches automatically, but bidding on competitors' brand terms is a policy and cost risk.
7. **YouTube is mostly a big-budget channel now.** Google retired Video Action Campaigns in 2025, so video ads with a conversion goal run as Demand Gen [CONSENSUS, 14]. Google recommends at least **$100/day** for Demand Gen Maximize Conversions, and at least 50 conversions before judging results [DATA, 15]. Smart Bidding generally wants 15–30+ conversions per 30 days [DATA, 16]. That does not fit $500/month. Use YouTube for organic Shorts, not paid.
8. **Meta's targeting has moved toward broad and automatic.** Detailed-targeting exclusions were removed in 2025 (sources cite January 31 or March 31) [CONSENSUS, 17]. Interests were consolidated starting June 2025 [ANECDOTE, 17], and Advantage+ is now the default setup for Sales, App and Leads campaigns (manual settings remain but switch Advantage+ off) [DATA, 18]. Sources contradict each other on whether education/"in college" targeting still exists, so check it in Ads Manager before planning around it [ANECDOTE, 19]. The dependable levers are age 18–24, campus radius geotargets and custom audiences such as site visitors.
9. **Meta has no clean desktop-only switch for Feed.** Meta's help pages show a device choice only for Audience Network, which you should switch off anyway. Desktop Feed exists as a placement, but the search did not confirm a "desktop only" toggle for Feeds [DATA, 8]. Plan instead for Meta traffic to be mostly phones, and make the mobile landing page about "send yourself the link".
10. **Cost benchmarks vary three- to five-fold by source; use them only as ranges.** Meta traffic campaigns averaged **$0.70 CPC** across 1,000+ campaigns (WordStream 2025; Arts & Entertainment $0.49) [DATA, 20]. TikTok CPMs range from **$4.08 median** (Focus Digital, 5,900 brands) to **$13.26 average** (Triple Whale) [DATA, 21]. Reddit CPMs run about $3–$15 and CPCs about $0.50–$4, from vendor blogs only [ANECDOTE, 23]. Snapchat CPM is about $8, with a median CPC of about $0.84 [ANECDOTE, 24]. X shows a median $2.09 CPM / $0.18 CPC in one source versus $6–$9 CPM in another [ANECDOTE, 25].
11. **TikTok US status:** TikTok USDS Joint Venture LLC closed around 2026-01-22/23 (Oracle, Silver Lake and MGX at 15% each; ByteDance 19.9%). Advertising tools were largely unchanged, but the US recommendation algorithm is being retrained, so delivery may shift [CONSENSUS, 26].
12. **X is a recovering but small ad market.** eMarketer projected 2025 US ad revenue of $1.31B (+17.5%), far below 2021. Brand-safety perception is weak: 4% of marketers in Kantar's 2024 survey called X brand-safe [CONSENSUS, 27]. The ads may be cheap, and live sports conversation is strong there, but treat X as an optional $50 experiment.
13. **Reddit 2025 changes:** In March 2025, Reddit shipped Ads Manager updates aimed at small businesses. In June 2025 it announced "Community Intelligence": Reddit Insights for social listening and Conversation Summary Add-ons, which show user posts under an ad. Reddit claims a 10% CTR lift for the add-ons [ANECDOTE/company claim, 28]. Insights could help you find which subreddits discuss multiview and RedZone.
14. **Policy friction (brief):** "Streaming" plus "watch games" wording can trip automated review for unauthorized-streaming or piracy-device rules. Meta has restricted ads for illegal streaming services and devices since 2017 [ANECDOTE, 29]. Say "uses your own TV subscription" and show the sign-in to your own provider. Avoid league or network logos and the word "free" next to "watch games". The policy agent covers this in depth.

## 2. Platform comparison

| Platform | Typical CPM | Typical CPC | Min spend | Targeting for students and sports fans | Desktop fit | Verdict for TappedIn |
|---|---|---|---|---|---|---|
| **Reddit** | ~$3–$15 (vendor blogs) [23] | ~$0.50–$4 [23] | $5/day per ad group; recommends ≥$50/day [4,5] | Communities (r/CFB, r/nfl, r/CollegeBasketball, r/cordcutters, r/YouTubeTV, campus subreddits; ≥15 per ad group), interests, keywords, location [6] | **Best social fit**: desktop-only ad groups possible [7]; about 22–28% of Reddit visits are desktop (secondary, weak) | **Start here** for both paid tiers |
| **Google Search** | n/a | ~$1.63 Arts & Entertainment avg; $5.42 all-industry avg [12] | None for Search; spend capped at 30.4×/month [11] | Intent keywords ("watch multiple games at once", "multiview college football", "red zone channel alternative", "watch 4 games on pc"); campus radius geo | **Excellent**: −100% mobile [10] | **Second channel**; small, tightly matched keyword list |
| **Meta (FB/IG)** | ~$8–$15 (varies) | $0.70 traffic avg; $0.49 Arts & Ent. (2025, n>1,000) [20] | ~$1/day per ad set [30] | Age 18–24, campus radius, broad + Advantage+; interests consolidated; education targeting uncertain [17–19] | Weak: no desktop-only Feed toggle [8]; mostly phone traffic | Retargeting site visitors at $500; otherwise skip |
| **TikTok** | $4–$13 (two 2025 data sets) [21] | ~$0.50–$1.00 (secondary) | Ad group > $20/day; campaign > $50/day [3] | Age, interest (predicted), behavior: hashtag (7-day), creator and video interactions [31] | Poor: app traffic, nearly all phone | Organic first; paid only at $500 as a 1–2 week burst |
| **YouTube** | ~$5–$10; Shorts ~$4 (agency blogs) [14] | n/a (CPV ~$0.02–$0.10) | Demand Gen: $100/day recommended for Max Conversions [15] | Sports channels, topics, custom segments by search terms | Mixed (YouTube on desktop exists) | Skip paid; big-budget only |
| **Snapchat** | ~$8 [24] | ~$0.84 median [24] | $5/day (2021 change; secondary) [24]; $20–$50/day suggested | Age, point-radius around an address, lifestyle categories [32] | Very poor: mobile app only | Skip |
| **X** | $2–$9 (conflicting) [25] | $0.18–$3 [25] | No stated minimum (unconfirmed) | Keywords and hashtags (#CFB, #RedZone), follower look-alikes (@ESPNCFB etc.) [33] | Moderate (X web) | Optional $50 test only |

## 3. Recommendations by budget tier

**Setup for every tier (do this before any spend):**
- Fire one site event, `download_click`, on the download buttons. Add a second event, `send_link`, on the "send yourself the link" option.
- Tag every ad link with UTMs (`utm_source=reddit&utm_campaign=cfb_test1&utm_content=ad_a`).
- Count R2 downloads per day to compare against button clicks.

**$0 (organic only)**
- Paid ads: none. Put the time into Reddit posts in communities whose rules allow self-promotion, TikTok and Shorts demo clips cut from replay mode, and campus channels (other agents cover these).
- Measure organic with the same UTMs, so you have a baseline landing → download rate before paying for traffic.
- Apply for any Reddit or Google promotional ad credits shown in the ad account at signup, but do not rely on them.

**~$100/month (about $3.30/day)**
- **Platform:** Reddit only, or Reddit $70 plus Google Search $30. Run on football and basketball game days, when intent peaks.
- **Structure:** 1 campaign, 1–2 ad groups. Keep them desktop-only, with community targeting of at least 15 sports and cord-cutting subreddits. Reddit recommends at least 3 ads per ad group [22]: use 3 creatives (a 4-screen video clip, a "switched to the red zone automatically" before/after, a plain founder text post). Use a daily budget of $5 on 4–5 chosen days per week, or a lifetime budget.
- **Duration:** at least 3 weeks (one game-day cycle per week) and about 150+ clicks before judging. Don't edit mid-test.
- **Thresholds** (our assumptions, not benchmarks): CTR ≥0.5% on Reddit feed; landing → download click ≥20% for desktop visitors. **Good:** cost per download click ≤$3. **Kill:** above $8 after 150 clicks, or CTR below 0.2%. On Google, aim for CTR ≥5% and cost per download click ≤$4.
- **Don't:** run Meta or TikTok here. TikTok's $20/day ad group floor buys 5 days at most, and Meta can't optimize at this volume.

**~$500/month (~$16/day)**
- **Split:** Reddit $250 (2 ad groups: football communities versus basketball/hockey/cord-cutting, desktop only). Google Search $150 (one campaign, 10–20 exact/phrase keywords, −100% mobile, Maximize Clicks with a max CPC cap until about 30 conversions). Meta $100 for **retargeting only**: site visitors from the last 30 days plus a lookalike of the people who download, with a creative that says "On your laptop? Here's the download". Optional: swap Meta for one 2-week TikTok burst ($20/day × 10 days = $200) in a big week such as bowl season or March Madness, using a Spark Ad that boosts your best organic clip.
- **Creatives:** 3–4 per ad group. Refresh the losing one every 2 weeks.
- **Duration:** 4 weeks per round; change one variable per round.
- **Thresholds:** blended cost per download click ≤$3 (good) / ≥$7 (kill the channel). Reddit and Google CTR as above. Landing → download ≥20% desktop and mobile "send link" ≥5%. Download click → actual R2 download ≥60%; the SmartScreen warning causes drop-off after this point, which ads can't fix.
- **If Reddit or Google wins:** move that channel's budget up in steps of about 20–30%, not doubling. Both TikTok and Google warn that big jumps reset learning [3, 15].

## 4. Mistakes to avoid

- **Optimizing for clicks or reach without a pixel.** The algorithm buys the cheapest clicks, often on Audience Network or accidental taps [ANECDOTE, 9]. Use the download-click event, or at least landing page views.
- **Too many ad sets or ad groups.** Each one needs its own learning volume (Meta: ~50 per ad set per week [1]; Google Demand Gen: merge ad groups under 30 conversions per 30 days [15]). At $100–$500, use 1–2.
- **Short tests.** Two or three days, or under about 100–150 clicks, is noise. Sports traffic is also weekly (Saturdays and Sundays), so run full weeks.
- **Editing mid-test.** Budget, audience and creative edits restart learning [1, 3, 15].
- **"Boost post" buttons.** They optimize for engagement, not download clicks. Same problem as optimizing for clicks.
- **Broad national audiences on a tiny budget.** The money spreads thin and the ads reach people without TV services. Narrow by community or intent instead (Reddit communities, Google keywords).
- **Paying for phone traffic to a desktop-only download.** Exclude mobile where you can (Reddit, Google). Where you can't, make the mobile landing page lead with "send yourself the link".
- **Counting only clicks.** Compare platform-reported events against UTMs and R2 downloads. Clicks are not downloads, and downloads are not people who installed past SmartScreen.
- **Offseason or wrong-day spend.** Spend around big slates, rivalry weeks, conference championships, bowls and March Madness.
- **Ad copy that sounds like piracy** ("watch every game free"). Expect rejection or account flags.

## 5. Weak-evidence claims seen and rejected

- "YouTube's technical minimum is $10/day": an agency blog, not confirmed in Google's docs; Google's own guidance is per bid strategy [15].
- "TikTok joint venture added compliance reviews for targeting parameters": from one AI-assisted article, uncorroborated [26].
- "Reddit CPC $0.59 vs Meta $1.33" and other cross-platform "X% cheaper" claims: statistics roundups with no sample or method.
- "Swipe-up rate 1–2.5%" for Snapchat: legacy metric, aggregator blogs only.
- "Most Meta ad sets exit learning in 3–5 days": a blog paraphrase. Meta's doc only states the ~50 events per week rule.
- "Meta education targeting is gone" versus "still available": both unsourced; left as "verify in Ads Manager".
- Reddit desktop share (22–28%): secondary statistics sites citing Statista or Similarweb without a date. Used only as "minority but meaningful".

## 6. Sources

1. "About learning limited" / "About the learning phase," Meta Business Help Center, undated (accessed 2026-10-21; page text came from search snippets), https://en-gb.facebook.com/business/help/269269737396981 and https://www.facebook.com/business/help/112167992830700 — [DATA], sells services: no
2. "Last Significant Edit," Meta Business Help Center, undated (accessed 2026-10-21), https://www.facebook.com/business/help/942374239243867 — [DATA], no
3. "About budgets for ads in TikTok Ads Manager," TikTok for Business, undated (accessed 2026-10-21), https://ads.tiktok.com/help/article/budget — [DATA], no
4. "How much do Reddit Ads cost?," Reddit Ads Help, undated (accessed 2026-10-21; content from search snippet), https://business.reddithelp.com/en/categories/billing-payment/how-much-do-reddit-ads-cost — [DATA], no
5. "Set up a Reddit Ads Campaign," Reddit Ads Help, undated (accessed 2026-10-21; content from search snippet), https://business.reddithelp.com/en/categories/campaign-setup/create-an-ad-campaign — [DATA], no
6. "Reddit Audiences" / "Audience Manager" / "About Audience Targeting," Reddit Ads Help, undated (accessed 2026-10-21), https://business.reddithelp.com/s/article/reddit-audiences — [DATA], no
7. Reddit device and placement options (desktop/mobile ad groups, Feed versus Conversation), Interteam Marketing and BeFound Online guides, undated, https://www.interteammarketing.com/blog/reddit-ads-campaigns-and-ad-groups — [CONSENSUS], sells services: yes
8. "About Meta Ads Placements" / "Create Ads that Appear on Audience Network," Meta Business Help Center, undated, https://www.facebook.com/business/help/1409448922609084 — [DATA], no
9. "Understand the Meta Ads Algorithm," Jon Loomer Digital, undated (accessed 2026-10-21), https://www.jonloomer.com/meta-ads-algorithm/ — [ANECDOTE], sells training: yes
10. "About bid adjustments," Google Ads Help, undated, https://support.google.com/google-ads/answer/2732132 — [DATA], no
11. "About average daily budgets," Google Ads Help, undated, https://support.google.com/google-ads/answer/6385083 — [DATA], no
12. "Search Advertising Benchmarks," LocaliQ (WordStream/Gannett), updated 2026-06-01, sample "thousands of campaigns" (no exact n), https://localiq.com/blog/search-advertising-benchmarks/ — [DATA], sells services: yes
13. "YouTube TV fully customizable multiview includes NFL Sunday Ticket," Awful Announcing, 2026-04-28, https://awfulannouncing.com/youtube/fully-customizable-multiview-includes-nfl-sunday-ticket.html — [DATA/news], no
14. YouTube ad cost benchmarks and the VAC → Demand Gen migration, StoreGrowers, 2025–2026, https://www.storegrowers.com/youtube-ads-benchmarks/ — [CONSENSUS], sells services: affiliate/yes
15. "Best practices for high performing Demand Gen campaigns," Google Ads Help, undated (accessed 2026-10-21), https://support.google.com/google-ads/answer/10546923 — [DATA], no
16. "About Smart Bidding learning" / Display Smart Bidding guidance, Google Ads Help, undated, https://support.google.com/google-ads/answer/13020501 — [DATA], no
17. "It's Official: No More Detailed Targeting Exclusions," Jon Loomer, 2024 (effective 2025), https://www.jonloomer.com/qvt/detailed-targeting-exclusions/ ; Conversios 2026 guide, https://www.conversios.io/blog/meta-advantage-audience-vs-detailed-targeting-2026-guide/ — [CONSENSUS], yes
18. "Advantage+ Campaign Experience for Sales, App, and Leads," Meta for Developers, 2025, https://developers.facebook.com/docs/marketing-api/advantage-campaigns ; Search Engine Land, Feb 2025, https://searchengineland.com/meta-advantage-campaign-setup-leads-campaigns-451713 — [DATA], no
19. "Meta ads targeting college students," Stackmatix, undated; ThinkOrion, updated 2026-04-03, https://www.stackmatix.com/blog/meta-ads-targeting-college-students , https://thinkorion.com/blog/how-to-target-students-facebook-ads-ppc — [ANECDOTE], yes
20. "Facebook Ads Benchmarks 2025," WordStream, 2025, n>1,000 campaigns (page blocked; figures from summary and republishers), https://www.wordstream.com/blog/facebook-ads-benchmarks-2025 — [DATA], yes
21. "TikTok Ads Benchmarks 2026" (Triple Whale data), Influee, 2026, https://influee.co/blog/tiktok-ads-benchmarks ; Focus Digital (5,900 brands, Aug 2025–Jul 2026), https://focus-digital.co/average-tiktok-ads-ctr-and-cpm-by-industry/ — [DATA], yes
22. "About the Conversions API" / "Optimize with Recommendations," Reddit Ads Help, undated, https://business.reddithelp.com/s/article/Conversions-API , https://business.reddithelp.com/s/article/about-recommendations — [DATA], no
23. Reddit ads statistics, Webtonic (2026), https://www.webtonic.io/blog/health-wellness-reddit-ads-statistics ; Affect Group (2025), https://affectgroup.com/blog/reddit-ads-average-cpc-2025/ — [ANECDOTE], yes
24. Snapchat ad cost, MegaDigital (2026), https://megadigital.ai/en/blog/snapchat-ad-cost/ ; AdNabu, https://blog.adnabu.com/snapchat/how-much-do-snapchat-ads-cost/ — [ANECDOTE], yes
25. X ads guides, Webtonic and Socialk.it, 2025, https://www.webtonic.io/blog/the-ultimate-guide-to-twitter-x-advertising — [ANECDOTE], yes
26. "TikTok officially secures a US future," eMarketer, Jan 2026, https://www.emarketer.com/content/tiktok-officially-secures-us-future--what-happens-next ; Marketing Dive, 2026, https://www.marketingdive.com/news/tiktok-pitches-advertisers-on-bold-new-chapter-under-us-joint-venture/815632/ — [CONSENSUS], no
27. "Why X's ad comeback doesn't match reality," Brave Bison, Jan 2026, https://bravebison.com/insights/why-xs-ad-comeback-doesnt-match-reality/ ; Kantar via VideoWeek, 2024-09-05, https://videoweek.com/2024/09/05/one-quarter-of-marketers-to-reduce-x-spending-next-year-finds-kantar/ — [CONSENSUS], Brave Bison sells services: yes
28. "Reddit releases new Community Intelligence ad tools," Axios, 2025-06-16, https://www.axios.com/2025/06/16/reddit-ai-community-intelligence ; MediaPost, 2025, https://www.mediapost.com/publications/article/407896/reddit-q2-ad-buys-surge-84-active-users-not-so-m.html — [ANECDOTE/company claim], no
29. "Facebook updates ad policy to restrict piracy services," The Drum, 2017, https://www.thedrum.com/news/facebook-updates-ad-policy-restrict-piracy-services — [ANECDOTE, old], no
30. "Best practices for minimum budgets," Meta Business Help Center, undated, https://en-gb.facebook.com/business/help/203183363050448 — [DATA], no
31. "About Behavior Targeting" / "Ad Targeting Dimensions," TikTok for Business, undated, https://ads.tiktok.com/help/article/behavior-targeting?lang=en — [DATA], no
32. "Snapchat Ads Targeting Options," Snap for Business, undated, https://forbusiness.snapchat.com/advertising/targeting — [DATA], no
33. "Bidding and auctions FAQs," X Business, undated, https://business.x.com/en/help/troubleshooting/bidding-and-auctions-faqs — [DATA], no
