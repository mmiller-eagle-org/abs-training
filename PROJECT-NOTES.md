# ABS Training website: project notes

Handoff notes for abs-training.com: how the site works, what has been done, and what is still open.
Last updated November 4, 2026.

## At a glance

| | |
|---|---|
| Live site | https://abs-training.com |
| Repository | `mmiller-eagle-org/abs-training` (public) |
| Hosting | GitHub Pages, legacy build from the `main` branch. Merging to `main` publishes the site. |
| Generator | Jekyll (built by GitHub Pages). Tailwind CSS from its CDN, Montserrat and Maitree from Google Fonts, Material Symbols icons. |
| LMS | Seertech at https://portal.abs-training.com (site `abs`, region `gl`, language `en-us`) |
| Analytics | Google Tag Manager `GTM-5W4KPWDJ` loading Google Analytics 4 `G-0LT6YRRFZH`, with a custom cookie banner (Consent Mode v2) |
| Contact email used on the site | abstraining@eagle.org |

This file is excluded from the website build in `_config.yml`, so it is not published as a page. It is visible to anyone who views the repository.

## How changes are made

1. Work on a branch and open a pull request into `main`.
2. The **Pages build check** workflow (`.github/workflows/pages-build-check.yml`) runs the same Jekyll build GitHub Pages uses. It checks that key files exist (home page, cookie policy, course catalog and course view pages, sitemap, robots.txt, CNAME and the scripts in `assets/js/`), that the catalog's course list JSON is valid and has every course page, and that the course view page is `noindex` and not in the sitemap. It uploads the built site as an artifact named `site-preview`. It does not deploy. It also runs on demand: `gh workflow run pages-build-check.yml --ref <branch>`.
3. To preview a pull request locally, download the artifact and serve it:
   ```powershell
   gh run download <run-id> -n site-preview -D <folder>
   python -m http.server 8080 --bind 127.0.0.1 --directory <folder>
   ```
   The portal feeds only allow the `https://abs-training.com` origin, so course lists and class dates do not load from `127.0.0.1`. To test them, use Playwright and route `https://abs-training.com/**` to the downloaded folder (see Testing reference).
4. Merge the pull request. GitHub Pages republishes within a few minutes. Check progress with `gh api repos/mmiller-eagle-org/abs-training/pages/builds/latest`.

Notes:
- Ruby and Jekyll are not installed locally. Rely on the build check workflow, not a local Jekyll build.
- Many files use Windows line endings (CRLF). Keep them as they are and save files as UTF-8 without a byte-order mark.
- Accessibility target is WCAG 2.2 AA. UI changes have been reviewed with the accessibility-agents specialists (contrast, ARIA, live regions, screen reader) and axe-core. Reports are kept locally in `.a11y-history/` (not committed).
- Brand rules come from the ABS brand guidelines: ABS Blue `#002A4E`, ABS Red `#DA1F33`, secondary colors in `_includes/head.html`, AP style for copy, and title case on buttons.

## Site structure

| Path | What it is |
|---|---|
| `_config.yml` | Site settings, portal URLs, GTM and GA4 IDs, the `courses` collection |
| `index.html` | Home page: hero with course search box, Setting The Standard For Training, Training by Industry, Featured Courses (live next date), How Can We Help, newsletter |
| `courses/index.html` | **Course Catalog** at `/courses/`: search and browse every course (see Course catalog below) |
| `courses/view.html` | **Course view** at `/courses/view/?id=<course ID>` for courses without their own page. `noindex`, not in the sitemap. |
| `_courses/*.md` | One file per course page. Front matter: `title`, `description`, `course_id` (Seertech ID), `tag`, `duration`, `format`, `objectives`, `audience`, optional `featured_order` |
| `_layouts/default.html` | Page shell. Consent Mode defaults and the saved choice are applied here before GTM loads. A page with `noindex: true` in its front matter gets a robots `noindex` tag. |
| `_layouts/course.html` | Course page, including the live **Upcoming Classes** panel |
| `_includes/upcoming-classes.html`, `assets/js/upcoming-classes.js` | The Upcoming Classes panel, shared by course pages and the course view page |
| `_includes/site-courses-json.html` | Writes the `_courses/` pages into the catalog and view pages as JSON, so they merge with the portal list |
| `_includes/head.html` | Meta tags, Tailwind config with brand colors, shared `.btn`, `.tag` and `.eyebrow` styles |
| `_includes/nav.html`, `footer.html` | Header (menu button below 1024px; Log In moves into the menu below 360px) and footer |
| `_includes/consent-banner.html`, `assets/js/consent.js` | Cookie banner and the Cookie Settings button |
| `cookie-policy.html` | Cookie Policy page at `/cookie-policy/` |
| `assets/js/course-offerings.js` | Loads class dates from the Seertech feed and formats them |
| `assets/js/course-catalog.js` | Loads the all-courses feed, merges the course pages and matches search words |
| `assets/js/catalog-page.js`, `assets/js/course-view.js` | Page logic for `/courses/` and `/courses/view/` |
| `assets/js/analytics.js` | Sends site events to the GTM data layer |
| `assets/images/industry-government.jpg` | Government tile photo (credit: General Dynamics NASSCO) |
| `sitemap.xml`, `robots.txt` | Generated by `jekyll-sitemap`; robots.txt points to the sitemap |

### Courses

Course pages live at `/courses/<file-name>/`. A course appears on the home page only if it has `featured_order`.

| Featured order | Course | Seertech ID |
|---|---|---|
| 1 | Maritime Incident Investigation and Root Cause Analysis | 226074832 |
| 2 | ISM Code Internal Auditor | 224266683 |
| 3 | DPA Requirements: Effective SMS Implementation | 226074836 |
| 4 | FPSO Classification Requirements and Risk-Based Inspection (RBI) | 226074844 |
| 5 | Advanced Maritime Incident Investigation and Root Cause Analysis | 226070634 |
| 6 | Train the Trainer (USCG Accepted) | 226074865 |
| not featured | Tanker Management and Self-Assessment (TMSA 3) Essentials | 226074851 |
| not featured | Orientation to In-Service Classification and Statutory Surveys | 226074850 |
| not featured | Gas Carrier Systems and Cargo Handling Equipment Introduction | 226074858 |

To add a course, copy a file in `_courses/`, set its `course_id` from the portal, and fill in the content. The class dates fill in automatically, and the catalog links to the new page instead of the generic course view.

### Course catalog (`/courses/`)

- Loads every course live from the public all-courses feed: `https://portal.abs-training.com/ws/report/out/abs/CatalogOut?offset=1&limit=100&p_region=gl`. It allows the `https://abs-training.com` origin by CORS and needs no login. It returns 55 courses (`hasMore` false). It times out after 10 seconds.
- Feed quirks:
  - Fields used: `courseId`, `courseTitle`, `contentType`, `offeringType`, `courseIdentifier`, `courseDetailsURL`, `shortDescription`. `offeringType` `S` is self-paced online and `H` is a channel (an online bundle). `contentType` is "Virtual Class", "Online", "Classroom" or "Channel".
  - `offeringCount` is unreliable (0 for courses that have classes), and `offeringDates`, `location` are always empty. Not used.
  - `price` is set only for online items; prices are not shown (same rule as class dates).
  - `shortDescription` is set for 3 courses, one of them a placeholder ("This course is about..."); placeholders and anything under 40 characters are hidden.
  - `courseDetailsURL` is set only for online items. For other courses the portal details link comes from the course's first offering in the offerings feed; a portal details URL built from the course ID alone opens an error page.
  - **Keyword search:** add `&keyword=<word>`. It matches whole words in titles and the portal descriptions ("auditor" works, "aud" does not), returns courses containing any of several words, treats `%` as a wildcard, and returns everything when the text has an unmatched quote. `p_keyword` and `p_search` are ignored.
- How the page searches: each word is matched instantly against what the site has (title, description, topic tag, format, course code). Words of 3+ letters are also sent to the feed one at a time, so a course matches when **every** word is found either on the site or in its portal description. Results are ordered: all words in the title, then other site matches, then portal-description matches (labeled "Found in the full course description"), each A to Z.
- **Merge with course pages:** courses in `_courses/` replace the feed record with the same ID (their title, description, topic tag, duration, format and page link win). Course pages missing from the feed are still listed and searchable. 226074832 (Maritime Incident Investigation and Root Cause Analysis) is on the portal's own catalog but not in CatalogOut, so it appears only through its course page.
- **All 56 courses are listed**, matching the portal catalog: the 55 feed records plus 226074832 from its course page. This includes 226417341 "Final Examination: Welding, Metallurgy, Inspections and Nondestructive Evaluation (NDE)" and 224892634 "ASC003 Maritime Incident Investigation" (Classroom), which were kept at the owner's request on November 4, 2026. Only titles starting `zzz` (test data) are skipped (`isListed` in `assets/js/course-catalog.js`).
- Format filter: Virtual Class, Classroom, Self-Paced Online, Online Bundle, with counts for the current search. Course pages use their front-matter `format` ("Classroom and Virtual Class" counts as both).
- Links: `/courses/?q=fuel&format=virtual` opens a search, and `/courses/#course-search` focuses the search box. The home page hero search box submits to `/courses/?q=`.
- If the feed fails, the page lists the course pages on this site with a notice and a link to the portal catalog. With no JavaScript, it lists the course pages and the portal link.
- Courses without a page link to `/courses/view/?id=<course ID>`, which shows the title, format, the live Upcoming Classes panel and a **Full Course Details** link to the portal. Course IDs that have a page redirect to it. Unknown IDs show "Course Not Found".
- Self-paced online courses and bundles have no class dates. Their Upcoming Classes panel becomes **Start Anytime** with an **Enroll Now** button to the portal.

### Live class dates (Seertech feed)

- Feed: `https://portal.abs-training.com/ws/report/out/abs/CatalogObjectOfferingsOut?offset=1&limit=50&date_from=%25&available_only=Y&content_object_id=<course id>&p_region=gl&location=%25&offering_language=%25`. It is public, needs a course ID, and pages with `offset` and `hasMore`. There is no all-courses version of this feed (CatalogOut lists courses but not their dates), so the site has no combined class calendar; the portal's course calendar is linked instead.
- The portal firewall returns **403** to automated or headless browsers. Automated tests must send a normal desktop browser user agent.
- Rules the site applies:
  - `offeringType` `C` means Classroom. Do not use `contentType`; it is unreliable.
  - `isEOI` `Y` is a "Register Interest" entry, not a class. Offerings named `zzz_UAT…` are test data and are skipped.
  - `offeringType` `S` (self-paced online) and `H` (online bundle) offerings are open all the time and are not listed as classes; the panel shows Enroll Now instead.
  - `openSeats` of 9999999 means unlimited (hidden); 5 or fewer shows "Only N seats left".
  - For virtual classes, `location` is a host room such as "ABS Training Virtual Classroom Greece", so it is hidden.
  - Prices vary by region and currency, so they are not shown.
  - The feed labels China time "CST" (GMT+8), which US readers take as US Central, so times always show the GMT offset.
  - Requests time out after 10 seconds and show a "Dates Unavailable" message with a catalog link.
- Dates are shown in US format: "Dec 14–15, 2026", "Nov 30 – Dec 2, 2026". Times use AP style: "9 a.m. – 5 p.m. BRT (GMT−3)".

### Portal links used on the site

| Link | URL |
|---|---|
| Course Catalog (portal) | https://portal.abs-training.com/catalog/abs/region/gl/lang/en-us/ (linked from the on-site catalog, its empty and error states, and the Upcoming Classes error state; header, footer, home page and course breadcrumbs now go to `/courses/`) |
| Course Calendar | https://portal.abs-training.com/lmt/clmscoursecalendar.prMain?site=abs&in_language_logged_out=en-us&in_region=gl |
| Log In | https://portal.abs-training.com/lmt/xlr8login.login?site=abs&in_language_identifier=en-us&in_region=gl |
| Certificate verification (not linked anywhere now) | https://portal.abs-training.com/lmt/!clmscertificate.prVerify?site=abs&in_region=gl&in_lang=en-us |

Do not use the generic Seertech site `iplus`; its catalog is empty.

## Analytics and consent

### Accounts (created November 2, 2026)

- **Google Tag Manager:** account "ABS Training", container `abs-training.com`, ID **GTM-5W4KPWDJ**. Version 2 is published. It contains:
  - Google tag (G-0LT6YRRFZH) on all pages
  - GA4 event tag for course ecommerce events (`view_item`, `select_item`)
  - GA4 event tag for site actions (register, contact, outbound)
  - Conversion Linker (ready for Google Ads)
  - 9 data layer variables and 2 custom event triggers
- **Google Analytics 4:** account "ABS Training" (414411402), property "ABS Training (abs-training.com)" (561949337), web stream for https://abs-training.com, measurement ID **G-0LT6YRRFZH**. Central Time, USD, 14-month data retention. This is a separate account from the one used for the ABS careers page.
- Custom dimensions (event scope): Course ID, Course name, Offering ID, Class date, Class format, Link location, Link name.

### Events sent by the site

| Event | When | Details |
|---|---|---|
| `view_item` | Course page viewed | course ID, name, category |
| `select_item` | Course card clicked | course + list name: "Featured Courses" (home) or "Course Catalog" (`/courses/`) |
| `search` | Catalog search, once typing pauses for 1.5 seconds or on submit (once per term) | search_term |
| `register_click` | **Register** on a scheduled class, or **Enroll Now** on a self-paced course | course_id, course_name, offering_id, class_date, class_format ("Self-paced online" for Enroll Now, with no class_date) |
| `register_interest_click` | **Register Interest** | course_id, course_name, offering_id |
| `contact_click` | Any email link (GA redacts the address) | link_location |
| `outbound_click` | Portal and other external links | link_name, link_url |

Every click event includes `link_location` (header, footer, upcoming_classes, or the section's heading ID, such as `results-title` for catalog results). On the course view page, `view_item` uses the course format as its category. Add `?track_debug=1` to any page URL to log events to the browser console.

`class_date` uses the same text shown on the page. It changed on November 3, 2026 from the feed's format ("14-15 Dec 2026") to US format ("Dec 14–15, 2026"), so older reports mix the two.

### Consent behavior

- The banner shows until the visitor chooses. **Accept All** and **Reject All** look identical; **Customize** offers Analytics and Advertising separately. The choice is stored in local storage (`abs_consent_v1`) and applied before GTM loads on later pages. The footer **Cookie Settings** button reopens it.
- Before a choice: EEA, UK and Switzerland default to denied (cookieless pings only). Elsewhere defaults to granted, except advertising is denied when the browser sends Global Privacy Control.
- Rejecting deletes existing `_ga`, `_gcl` cookies and Google's `_gcl_ls` storage.
- To turn all tracking off, set `analytics.gtm_id: ""` in `_config.yml`.

## Change history

| PR | Merged | Summary |
|---|---|---|
| [#1](https://github.com/mmiller-eagle-org/abs-training/pull/1) | Oct 28 | New "ABS & Affiliated Companies" nav logo, hero and section copy, redesigned footer |
| [#2](https://github.com/mmiller-eagle-org/abs-training/pull/2) | Oct 29 | Log In, Course Catalog and certificate links point to the Seertech portal |
| [#3](https://github.com/mmiller-eagle-org/abs-training/pull/3) | Oct 29 | Classroom vs Virtual label uses `offeringType` |
| [#4](https://github.com/mmiller-eagle-org/abs-training/pull/4) | Oct 29 | Converted to Jekyll; SEO course pages with live class dates, structured data, sitemap; Pages build check workflow |
| [#5](https://github.com/mmiller-eagle-org/abs-training/pull/5) | Oct 29 | Feed loader follows all result pages |
| [#6](https://github.com/mmiller-eagle-org/abs-training/pull/6) | Oct 29 | Nav logo links to the ABS Training home page |
| [#7](https://github.com/mmiller-eagle-org/abs-training/pull/7) | Nov 2 | Accessibility and mobile audit fixes: skip link, landmarks, phone/tablet menu, no sideways scroll, fixed 404 legal and subscribe links |
| [#8](https://github.com/mmiller-eagle-org/abs-training/pull/8) | Nov 2 | Home page simplified: centered hero, new featured six, static industry tiles, Government photo, How Can We Help cards, simpler footer; three new course pages |
| [#9](https://github.com/mmiller-eagle-org/abs-training/pull/9) | Nov 2 | GA4 through GTM, Consent Mode v2, cookie banner, site events |
| [#10](https://github.com/mmiller-eagle-org/abs-training/pull/10) | Nov 2 | Cookie Policy page; Search Courses and Course Calendar buttons; title-case buttons site-wide |
| [#11](https://github.com/mmiller-eagle-org/abs-training/pull/11) | Nov 3 | US date format; redesigned Upcoming Classes panel (12-hour times with GMT offset, weekday and length, seats, compact Register button, empty/error/loading states, screen-reader fixes, 10-second feed timeout); these notes |
| [#12](https://github.com/mmiller-eagle-org/abs-training/pull/12) | **open** | On-site Course Catalog at `/courses/` with live search and format filter, course view page for courses without a page, home hero search box, catalog links moved on site, self-paced Enroll Now, `search` event |

## Outstanding items

### Course catalog
- [ ] Review and merge [#12](https://github.com/mmiller-eagle-org/abs-training/pull/12), the course catalog.
- [ ] In GTM, send the new `search` event to GA4: add `search` to the site-actions trigger and a data layer variable for `search_term` (GA4 reports it as a built-in parameter). Until then it stays in the data layer only.
- [ ] Ask Seertech why 226074832 (Maritime Incident Investigation and Root Cause Analysis) is missing from the CatalogOut feed although it is in the portal catalog and has classes.
- [ ] Course descriptions, objectives and audiences exist only on the portal's HTML detail pages, which do not allow other sites to read them. Option: a scheduled GitHub Action that copies them into `_courses/` pages, so every course gets a full page and better search results.
- [ ] Optional: show each result's next class date in the catalog (one offerings-feed request per course, so load only the visible cards).

### Google Analytics
- [ ] In GA4 (Admin > Data display > Events), mark `register_click`, `register_interest_click` and `contact_click` as **key events**. They have been sending since November 2.
- [ ] Add `portal.abs-training.com` to the GA4 web stream's domain list (Admin > Data streams > Configure tag settings > Configure your domains) so visits that continue to the portal are not counted as new sessions. This only matters once the portal also runs GTM (see Seertech below).
- [ ] Build saved reports or an exploration for Register clicks by course, class date, format and traffic source.

### Google Ads
- [ ] Create the Google Ads account (or use the ABS one) and link it to GA4 property 561949337.
- [ ] Turn on auto-tagging so ad clicks carry `gclid`. The Conversion Linker tag is already in GTM.
- [ ] Import `register_click` (and optionally `register_interest_click`) from GA4 as conversions, or add a Google Ads conversion tag in GTM on the same trigger.
- [ ] Point ads at course pages (`/courses/<name>/`), not the portal, so the visit and the Register click are measured.
- [ ] Tag non-Google campaigns (LinkedIn, email, newsletters) with `utm_source`, `utm_medium` and `utm_campaign`.
- [ ] Before running ads in the EU or UK, confirm with ABS legal that the custom banner is acceptable or whether a certified consent platform (for example Cookiebot, which eagle.org uses) is required.
- [ ] Note: the site measures the Register click, not the actual enrollment or payment, which happens on the portal. True conversions need the Seertech work below.

### Seertech portal
- [ ] Ask Seertech to add GTM container `GTM-5W4KPWDJ` to portal.abs-training.com and push `add_to_cart`, `sign_up` and `purchase` events. This allows real enrollment and revenue reporting and Google Ads conversion values.
- [ ] Optional: ask whether a public all-courses offerings feed (with dates) exists, which would allow a combined class calendar on the site. CatalogOut lists courses only.

### Legal, content and approvals
- [ ] ABS legal review of the Cookie Policy wording and of default-on tracking outside Europe.
- [ ] Confirm the General Dynamics NASSCO photo (Government tile) may be used on abs-training.com.
- [ ] Decide whether to re-add a "Verify a Certificate" link. It was replaced by Course Catalog in PR #8 and is not linked anywhere now.
- [ ] Optional: AP-style month abbreviations ("Sept.", "Nov."; March to July spelled out) instead of the current "Sep", "Nov".

### Accessibility follow-ups
- [ ] Buttons lose their outline in Windows high-contrast mode. A one-line change to `.btn` in `_includes/head.html` would fix every button; it was kept out of PR #11 because it affects the whole site.
- [ ] Test the Upcoming Classes panel with real screen readers (NVDA and JAWS on Windows, VoiceOver on Mac and iPhone). It has only been checked with automated tools and accessibility-tree inspection.
- [ ] Optional (AAA): have screen readers say time-zone names ("Brasília time") instead of spelling "B R T".
- [ ] Optional: a no-JavaScript message on course pages. Without JavaScript the panel stays on "Loading class dates…".

### Technical
- [ ] Tailwind runs from its in-browser CDN and fonts load from Google. A build step and self-hosted fonts would be faster and remove two third-party requests.
- [ ] The local test script `verify_tracking.py` still expects the old tracking-off build; 4 of its checks fail for that reason, not because of a site problem. Update it if it is reused.

## Testing reference

Test scripts and working files from the original chat are stored locally (not in the repo) at
`C:\Users\MAMILLER\.copilot\session-state\fa1f21b9-d2b0-4df4-a4f1-9dfb27363ed6\files\`:

- `audit\verify_consent.py`: 27 checks of the cookie banner and consent behavior (all passing on November 3).
- `audit\verify_tracking.py`: data layer event checks (see the note above).
- `audit\overflow.py`: no sideways scroll at 320–1280px.
- Course catalog: `C:\Users\MAMILLER\.copilot\session-state\b592b914-c422-41c0-976b-87ed7d76e88b\files\verify_catalog.py <site-preview folder> <screenshot folder>`. It routes `https://abs-training.com/**` to the built site so the live feeds' CORS rule applies, then checks search, filters, deep links, empty and error states, both link types, the course view page, analytics events, keyboard order, axe-core and 320px layouts.
- `gtm-abs-training-import.json`: a GTM container import file.

They use Playwright for Python with Microsoft Edge, and must set a normal browser user agent for the Seertech feed.
