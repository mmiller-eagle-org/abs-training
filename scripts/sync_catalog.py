#!/usr/bin/env python3
"""Snapshot every course in the ABS Training portal (Seertech) catalog into this site.

Writes _data/catalog.json and one generated page per course in _courses/ (front matter
`generated: true`). Hand-written course pages (no `generated` flag) are never changed.

The portal's course detail pages do not allow other sites to read them in the browser, so this
runs on a schedule (.github/workflows/sync-catalog.yml) and commits the result. Standard library
only. The portal firewall blocks non-browser user agents, so requests send a desktop browser's.

Usage:
  python scripts/sync_catalog.py           fetch, then update _data/catalog.json and _courses/
  python scripts/sync_catalog.py --check   fetch and validate only; writes nothing

Exit codes: 0 = done (changed or not), 1 = portal problem or failed safety check (nothing written).
"""
import argparse
import html
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(ROOT, '_data', 'catalog.json')
COURSES_DIR = os.path.join(ROOT, '_courses')

PORTAL = 'https://portal.abs-training.com'
CATALOG_URL = PORTAL + '/catalog/abs/region/gl/lang/en-us/'
SEARCH_URL = (PORTAL + '/learn-generic/v1/widgets/LMT_BROWSE_SEARCH_PARAMETER_JSON_WIDGET_OUT/?session_id={sid}'
              '&in_current_module=CLMSBROWSEV2.PRMAIN&in_save_modu_code=CLMSBROWSEV2.PRMAIN'
              '&in_mimeHeader=application/json&in_param5=&in_widget_start={start}')
OFFERING_URL = (PORTAL + '/lmt/!clmsCatalogDetails.prMain?site=abs&in_region=gl&in_language_identifier=en-us'
                '&in_offeringId={oid}')
OFFERINGS_FEED = (PORTAL + '/ws/report/out/abs/CatalogObjectOfferingsOut?offset=1&limit=50&date_from=%25'
                  '&available_only=Y&content_object_id={cid}&p_region=gl&location=%25&offering_language=%25')
USER_AGENT = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
              'Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0')

# Safety checks: a portal outage or a broken page must not wipe out the site's courses
MIN_COURSES = 20
MIN_SHARE_OF_PREVIOUS = 0.8
MAX_FAILED_SHARE = 0.2
REQUEST_PAUSE = 0.25

# ---------------------------------------------------------------------------------------------
# Topic tags. The tag is the label on catalog cards and the eyebrow on course pages, using the
# same words as the hand-written pages. First match wins: title words, then the portal's skills,
# then its categories. Edit this list to change how courses are labeled.
# ---------------------------------------------------------------------------------------------
TAG_RULES = [
    ('title', r'\bauditor\b|\baudit(ing)?\b', 'Auditing'),
    ('title', r'train the trainer', 'Instructor Training'),
    ('title', r'incident investigation|root cause', 'Safety'),
    ('title', r'\bFPSO|\bFSO|offshore|\bMODU|floating|submersible', 'Offshore'),
    ('title', r'gas carrier|natural gas liquids|CO2 carrier', 'Gas Carriers'),
    ('title', r'tanker|terminal management', 'Tankers'),
    ('title', r'hazardous area', 'Hazardous Areas'),
    ('title', r'marine fuel|LNG|methanol|ammonia', 'Marine Fuels'),
    ('title', r'classification|statutory survey', 'Classification'),
    ('title', r'\bhull\b|drydock|structural', 'Hull and Structures'),
    ('title', r'welding|metallurgy|non-?destructive', 'Materials and Welding'),
    ('title', r'electrical|batter(y|ies)|automation|propulsion|powertrain|vibration|machinery|outfitting',
     'Engineering'),
    ('title', r'\bISPS\b|security officer', 'Maritime Security'),
    ('title', r'\bMLC\b|labour convention', 'Maritime Labour'),
    ('title', r'MARPOL|SOLAS|hazardous materials|\bIHM\b|\bDPA\b|\bISM\b', 'Maritime'),
    ('title', r'crisis|emergency|risk|safety', 'Safety'),
    ('skill', r'auditing', 'Auditing'),
    ('skill', r'marine fuel', 'Marine Fuels'),
    ('skill', r'electrical|propulsion|marine engineering', 'Engineering'),
    ('skill', r'structural', 'Hull and Structures'),
    ('skill', r'survey', 'Classification'),
    ('skill', r'incident|process safety|human factors', 'Safety'),
    ('category', r'classification', 'Classification'),
    ('category', r'regulations', 'Maritime'),
    ('category', r'safety', 'Safety'),
    ('category', r'leadership', 'Leadership'),
    ('category', r'technical', 'Engineering'),
]
DEFAULT_TAG = 'Maritime'

NUMBER_WORDS = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8,
                'nine': 9, 'ten': 10, 'half': 0.5}


# ------------------------------------------------------------------------------------- HTTP
class Portal:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.session = None

    def get(self, url, referer=None, xhr=False, tries=4):
        headers = {'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9'}
        if referer:
            headers['Referer'] = referer
        if xhr:
            headers['X-Requested-With'] = 'XMLHttpRequest'
            headers['Accept'] = 'application/json, text/javascript, */*; q=0.01'
        for attempt in range(tries):
            try:
                time.sleep(REQUEST_PAUSE)
                with self.opener.open(urllib.request.Request(url, headers=headers), timeout=40) as r:
                    return r.read().decode('utf-8', 'replace')
            except Exception:
                if attempt == tries - 1:
                    raise
                time.sleep(3 * (attempt + 1))

    def start(self):
        page = self.get(CATALOG_URL)
        m = re.search(r'session_id=(\w+)', page)
        if not m:
            raise RuntimeError('No anonymous session id on the portal catalog page')
        self.session = m.group(1)

    def search_results(self):
        results, start, total = [], 1, None
        while True:
            data = json.loads(self.get(SEARCH_URL.format(sid=self.session, start=start), referer=CATALOG_URL, xhr=True))
            batch = data.get('results') or []
            more = data['data']['metadata'].get('moreResultsData') or {}
            total = int(more.get('total') or 0)
            results.extend(batch)
            if not batch or len(results) >= total or start > 2000:
                break
            start = int(more.get('nWidgetStart') or start + len(batch))
        return results, total


# ----------------------------------------------------------------------------------- HTML text
class TextExtractor(HTMLParser):
    """Turns a fragment of portal HTML into paragraphs and list items (plain text only)."""

    BLOCKS = {'p', 'div', 'br', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'table', 'ul', 'ol'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.paragraphs, self.items, self.buf, self.in_li = [], [], [], 0

    def flush(self):
        text = clean(''.join(self.buf))
        self.buf = []
        if not text:
            return
        (self.items if self.in_li else self.paragraphs).append(text)

    def handle_starttag(self, tag, attrs):
        if tag == 'li':
            self.flush()
            self.in_li += 1
        elif tag in self.BLOCKS:
            self.flush()

    def handle_endtag(self, tag):
        if tag == 'li':
            self.flush()
            self.in_li = max(0, self.in_li - 1)
        elif tag in self.BLOCKS:
            self.flush()

    def handle_data(self, data):
        self.buf.append(data)

    def close(self):
        super().close()
        self.flush()


def clean(text):
    text = html.unescape(text or '').replace('\u00a0', ' ').replace('\ufffd', '')
    text = re.sub(r'[\u200b\u200e\u200f\ufeff]', '', text)
    return re.sub(r'\s+', ' ', text).strip()


def fragment_text(fragment):
    parser = TextExtractor()
    parser.feed(fragment or '')
    parser.close()
    return parser.paragraphs, parser.items


def sections(page):
    """Description, Objectives, Audience and any other headed sections on a portal details page."""
    found = {}
    for m in re.finditer(r'<section class="course-details__description">\s*<h2>(.*?)</h2>(.*?)</section>', page, re.S):
        name = clean(re.sub(r'<[^>]+>', '', m.group(1)))
        if name and name not in found:
            found[name] = m.group(2)
    return found


def first(pattern, text, flags=re.S):
    m = re.search(pattern, text or '', flags)
    return clean(re.sub(r'<[^>]+>', ' ', m.group(1))) if m else ''


# ------------------------------------------------------------------------------- normalizing
def duration_text(raw):
    """"Three-Day" -> "3 days", "one-Hour" -> "1 hour"; anything unusual is kept as written."""
    raw = clean(raw).strip(' -')
    m = re.match(r'^([A-Za-z]+|\d+(?:\.\d+)?)[\s-]+(day|hour|week|minute)s?$', raw, re.I)
    if not m:
        return raw
    word = m.group(1).lower()
    n = NUMBER_WORDS.get(word)
    if n is None:
        try:
            n = float(word)
        except ValueError:
            return raw
    n = int(n) if float(n).is_integer() else n
    unit = m.group(2).lower()
    return '%s %s%s' % (n, unit, '' if n == 1 else 's')


def split_sentences(items):
    """Portal lists sometimes hold two objectives in one item: "Describe X. Apply Y." """
    out = []
    for item in items:
        parts = [p.strip() for p in re.split(r'(?<=[a-z)]{3}\.)\s+(?=[A-Z][a-z])', item) if p.strip()]
        out.extend(parts if len(parts) > 1 and all(len(p) >= 15 for p in parts) else [item])
    return out


def objectives_list(fragment):
    paragraphs, items = fragment_text(fragment)
    if items:
        return split_sentences([i for i in items if i])
    text = ' '.join(paragraphs)
    text = re.sub(r'^(upon completion[^:]*|participants will[^:]*|you will[^:]*|by the end[^:]*):\s*', '', text, flags=re.I)
    parts = [p.strip(' .') for p in re.split(r';\s*', text) if p.strip(' .')]
    if len(parts) > 1:
        return [p[0].upper() + p[1:] + '.' for p in parts]
    sentences = split_sentences([text]) if text else []
    if len(sentences) > 1 and all(len(s) < 200 for s in sentences):
        return sentences
    return [text] if text else []


def sentence_case_item(text):
    text = text.strip()
    return text if re.search(r'[.!?)]$', text) else text + '.'


def summary_of(paragraphs, limit=200):
    """A complete one or two sentence summary for cards and the page hero, taken from the description."""
    text = ' '.join(paragraphs)
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    summary = sentences[0] if sentences else ''
    # A short opener ("Chart a course for safety and compliance!") reads better with the next sentence
    if len(summary) < 70 and len(sentences) > 1 and len(summary) + 1 + len(sentences[1]) <= limit:
        summary += ' ' + sentences[1]
    # A very long opener: use a shorter sentence that describes the course, else keep the whole sentence.
    # Summaries are never cut off mid-sentence.
    if len(summary) > limit:
        for s in sentences[1:3]:
            if len(s) <= limit and re.match(r'^(Participants|In this|This [\w-]*\s*course|You will|The course)\b', s):
                return s
    return summary


def pick_tag(title, skills, categories):
    for kind, pattern, tag in TAG_RULES:
        values = {'title': [title], 'skill': skills, 'category': categories}[kind]
        if any(re.search(pattern, v, re.I) for v in values):
            return tag
    return DEFAULT_TAG


def format_of(pictogram, label, offering_types):
    if pictogram == 'channel' or re.search(r'channel', label, re.I):
        return 'Online Bundle'
    if pictogram in ('self-paced', 'assessment') or re.search(r'^online', label, re.I):
        return 'Self-Paced Online'
    kinds = set(offering_types)
    if pictogram == 'classroom' or re.search(r'classroom', label, re.I):
        kinds.add('C')
    if pictogram == 'virtual' and not kinds:
        kinds.add('W')
    if 'C' in kinds and 'W' in kinds:
        return 'Classroom and Virtual Class'
    if 'C' in kinds:
        return 'Classroom'
    return 'Virtual Class'


def slugify(title):
    s = title.lower().replace('&', ' and ')
    s = re.sub(r'\(([^)]*)\)', r' \1 ', s)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    s = re.sub(r'^abs-', '', s)
    if len(s) > 80:
        s = s[:81].rsplit('-', 1)[0]
    return s or 'course'


# -------------------------------------------------------------------------------- fetching
def fetch_course(portal, result):
    cid, oid = str(result['cid']), str(result['oid'])
    details_url = urllib.parse.urljoin(PORTAL + '/lmt/', html.unescape(result.get('details_href') or ''))
    page = portal.get(details_url, referer=CATALOG_URL) if result.get('details_href') else ''
    if 'Error Message' in page[:3000] or 'No records found' in page:
        page = ''
    found = sections(page)

    # Online courses and bundles keep their description on the offering's page
    offering_page = ''
    if 'Description' not in found and oid:
        offering_page = portal.get(OFFERING_URL.format(oid=oid), referer=CATALOG_URL)
        for k, v in sections(offering_page).items():
            found.setdefault(k, v)

    source = page or offering_page
    widgets = {}
    for m in re.finditer(r'"ajaxUrl":"(clmswidget\.prMain[^"]+)"', source):
        url = html.unescape(m.group(1))
        name = re.search(r'in_rptName=(\w+)', url)
        if name and name.group(1) in ('LMT_WIDGET_CONTENT_ATTRIBUTES', 'LMT_WIDGET_COURSE_CATEGORIES'):
            try:
                widgets[name.group(1)] = portal.get(PORTAL + '/lmt/' + url, referer=details_url, xhr=True)
            except Exception:
                widgets[name.group(1)] = ''

    categories = [clean(c) for c in re.findall(r'<p class="parent"[^>]*>(.*?)</p>', widgets.get('LMT_WIDGET_COURSE_CATEGORIES', ''), re.S)]
    skills = [clean(c) for c in re.findall(r'<p class="child-\d+"[^>]*>(.*?)</p>', widgets.get('LMT_WIDGET_COURSE_CATEGORIES', ''), re.S)]
    categories = [c for c in categories if c and c.lower() != 'search by skill']
    code = first(r'<label>SKU</label>(.*?)</span>', widgets.get('LMT_WIDGET_CONTENT_ATTRIBUTES', ''))

    offering_types = []
    try:
        feed = json.loads(portal.get(OFFERINGS_FEED.format(cid=cid)))
        offering_types = [o.get('offeringType') for o in feed.get('items') or [] if o.get('offeringType') in ('C', 'W')]
    except Exception:
        pass

    meta1 = ' '.join(x.get('html') or '' for x in result.get('metadata1') or [])
    meta3 = ' '.join(x.get('html') or '' for x in result.get('metadata3') or [])
    label = first(r'class="label--type">(.*?)</span>', meta1)
    duration_raw = first(r'class="duration">(.*?)</span>', meta3) or first(r'class="duration">(.*?)</span>', source)

    description, _ = fragment_text(found.pop('Description', ''))
    if not description:
        short = clean(re.sub(r'<[^>]+>', ' ', result.get('short_description') or ''))
        description = [short] if len(short) >= 40 and not short.endswith('...') else []
    objectives = [sentence_case_item(o) for o in objectives_list(found.pop('Objectives', ''))]
    audience_paragraphs, audience_items = fragment_text(found.pop('Audience', ''))
    audience = ' '.join(audience_paragraphs + audience_items)
    prerequisites_p, prerequisites_i = fragment_text(found.pop('Prerequisites', found.pop('Prerequisite', '')))
    other = {}
    for name, fragment in found.items():
        paragraphs, items = fragment_text(fragment)
        if paragraphs or items:
            other[name] = paragraphs + items

    image = first(r'course-details__detail">.*?<img[^>]*src="([^"]+)"', source)
    title = clean(result.get('name')) or first(r'<h1 class="title">(.*?)</h1>', source)
    return {
        'id': cid,
        'offering_id': oid if oid != cid else '',
        'title': title,
        'code': code,
        'format': format_of(result.get('pictogram') or '', label, offering_types),
        'duration': duration_text(duration_raw),
        'tag': pick_tag(title, skills, categories),
        'summary': summary_of(description),
        'description': description,
        'objectives': objectives,
        'audience': audience,
        'prerequisites': prerequisites_p + prerequisites_i,
        'other_sections': other,
        'categories': categories,
        'skills': skills,
        'price': first(r'class="cost">(.*?)</span>', meta1),
        'image': urllib.parse.urljoin(PORTAL, html.unescape(image)) if image else '',
        'portal_url': OFFERING_URL.format(oid=oid) if result.get('pictogram') in ('self-paced', 'assessment', 'channel') else '',
    }


# --------------------------------------------------------------------------------- writing
def read_front_matter(path):
    text = open(path, encoding='utf-8').read()
    m = re.match(r'^---\r?\n(.*?)\r?\n---', text, re.S)
    fields = {}
    if m:
        for line in m.group(1).splitlines():
            k = re.match(r'^(\w+):\s*(.*)$', line)
            if k:
                fields[k.group(1)] = k.group(2).strip().strip('"')
    return fields


def existing_pages():
    hand, generated = {}, {}
    for name in sorted(os.listdir(COURSES_DIR)):
        if not name.endswith('.md'):
            continue
        fm = read_front_matter(os.path.join(COURSES_DIR, name))
        cid = fm.get('course_id')
        if not cid:
            continue
        (generated if fm.get('generated') == 'true' else hand)[cid] = name
    return hand, generated


def q(value):
    return json.dumps(value, ensure_ascii=False)


def page_text(course):
    lines = ['---',
             '# Generated by scripts/sync_catalog.py from the ABS Training portal. Do not edit: changes are',
             '# replaced on the next sync. To write this page by hand, remove "generated: true".',
             'generated: true',
             'title: ' + q(course['title'])]
    if course['summary']:
        lines.append('description: ' + q(course['summary']))
    lines.append('course_id: ' + q(course['id']))
    if course['code']:
        lines.append('code: ' + q(course['code']))
    lines.append('tag: ' + q(course['tag']))
    if course['duration']:
        lines.append('duration: ' + q(course['duration']))
    lines.append('format: ' + q(course['format']))
    if course['objectives']:
        lines.append('objectives:')
        lines.extend('  - ' + q(o) for o in course['objectives'])
    if course['audience']:
        lines.append('audience: ' + q(course['audience']))
    if course['prerequisites']:
        lines.append('prerequisites:')
        lines.extend('  - ' + q(p) for p in course['prerequisites'])
    if course['skills']:
        lines.append('skills:')
        lines.extend('  - ' + q(s) for s in course['skills'])
    if course['portal_url']:
        lines.append('portal_url: ' + q(course['portal_url']))
    lines.append('---')
    # Plain paragraphs, escaped, inside {% raw %} so portal text can never run as Markdown or Liquid
    body = [html.escape(p, quote=False) for p in course['description']]
    if body:
        lines.append('{% raw %}')
        lines.extend('<p>' + p + '</p>' for p in body)
        lines.append('{% endraw %}')
    return '\n'.join(lines) + '\n'


def write_if_changed(path, text):
    """Writes LF line endings, as the repository stores them; a Windows checkout's CRLF copy counts as equal."""
    old = open(path, encoding='utf-8', newline='').read() if os.path.exists(path) else None
    if old is not None and old.replace('\r\n', '\n') == text:
        return False
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(text)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--check', action='store_true', help='fetch and validate only; write nothing')
    args = parser.parse_args()

    previous = {}
    if os.path.exists(DATA_FILE):
        try:
            previous = {c['id']: c for c in json.load(open(DATA_FILE, encoding='utf-8'))['courses']}
        except Exception:
            previous = {}

    portal = Portal()
    portal.start()
    results, total = portal.search_results()
    print('Portal lists %d courses (reported total %d)' % (len(results), total))
    results = [r for r in results if not re.match(r'^zzz', r.get('name') or '', re.I)]

    floor = max(MIN_COURSES, int(len(previous) * MIN_SHARE_OF_PREVIOUS))
    if len(results) < floor:
        print('ERROR: only %d courses returned; expected at least %d. Nothing written.' % (len(results), floor))
        return 1

    courses, failed = [], []
    for r in results:
        try:
            course = fetch_course(portal, r)
            if not course['description'] and previous.get(course['id'], {}).get('description'):
                raise RuntimeError('description missing this time')
            courses.append(course)
        except Exception as e:
            cid = str(r.get('cid'))
            failed.append('%s %s (%s)' % (cid, r.get('name'), e))
            if cid in previous:
                courses.append(previous[cid])
    if len(failed) > len(results) * MAX_FAILED_SHARE:
        print('ERROR: %d of %d courses failed. Nothing written.\n  %s' % (len(failed), len(results), '\n  '.join(failed)))
        return 1
    for f in failed:
        print('WARNING: kept the previous snapshot for ' + f)

    courses.sort(key=lambda c: c['title'].lower())
    missing = [c for c in courses if not c['description']]
    for c in missing:
        print('NOTE: no description on the portal for %s %s' % (c['id'], c['title']))
    print('Courses: %d, with description %d, objectives %d, audience %d' % (
        len(courses), len(courses) - len(missing), sum(1 for c in courses if c['objectives']),
        sum(1 for c in courses if c['audience'])))
    if args.check:
        for c in courses:
            print('  %-10s %-24s %-28s %-9s %s' % (c['id'], c['tag'], c['format'], c['duration'], c['title']))
        return 0

    hand, generated = existing_pages()
    used = set(os.listdir(COURSES_DIR))
    changed = []
    for c in courses:
        if c['id'] in hand:
            continue
        name = generated.get(c['id'])
        if not name:
            base = slugify(c['title'])
            name, n = base + '.md', 2
            while name in used:
                name, n = '%s-%d.md' % (base, n), n + 1
            used.add(name)
        if write_if_changed(os.path.join(COURSES_DIR, name), page_text(c)):
            changed.append(name)
    keep = {c['id'] for c in courses}
    for cid, name in generated.items():
        if cid not in keep:
            os.remove(os.path.join(COURSES_DIR, name))
            changed.append(name + ' (removed)')

    data = {'source': CATALOG_URL, 'count': len(courses), 'courses': courses}
    old = json.load(open(DATA_FILE, encoding='utf-8')) if os.path.exists(DATA_FILE) else {}
    old_body = {k: v for k, v in old.items() if k != 'updated'}
    data['updated'] = old.get('updated') if old_body == data else time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    if write_if_changed(DATA_FILE, json.dumps(data, ensure_ascii=False, indent=1) + '\n'):
        changed.append('_data/catalog.json')
    print('Changed: %s' % (', '.join(changed) if changed else 'nothing'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
