// Course list for the on-site catalog (/courses/) and course view (/courses/view/): the site's course pages
// (_courses/: hand-written plus the ones scripts/sync_catalog.py generates from the portal every day), merged
// with the Seertech public CatalogOut feed so a course added on the portal since the last sync still appears
// (linked to /courses/view/). The feed allows abs-training.com by CORS and needs no login.
(function () {
    var FEED = 'https://portal.abs-training.com/ws/report/out/abs/CatalogOut';
    var VIEW_PATH = '/courses/view/';
    var PAGE_SIZE = 100;
    var MAX_PAGES = 10;
    // A stalled feed would otherwise leave "Loading courses…" on screen forever
    var TIMEOUT_MS = 10000;

    var FORMATS = {
        virtual: { label: 'Virtual Class', icon: 'laptop_windows' },
        classroom: { label: 'Classroom', icon: 'groups' },
        online: { label: 'Self-Paced Online', icon: 'play_circle' },
        bundle: { label: 'Online Bundle', icon: 'library_books' }
    };
    var FORMAT_ORDER = ['virtual', 'classroom', 'online', 'bundle'];

    // offeringType S = self-paced online, H = channel (a bundle of online courses)
    function feedFormat(item) {
        var type = item.contentType || '';
        if (item.offeringType === 'H' || /channel/i.test(type)) return 'bundle';
        if (item.offeringType === 'S' || /online/i.test(type)) return 'online';
        if (/classroom/i.test(type)) return 'classroom';
        return 'virtual';
    }

    // Course pages state their format in words, such as "Classroom and Virtual Class" or "Online Bundle"
    function siteFormats(text) {
        if (/bundle/i.test(text)) return ['bundle'];
        var list = [];
        if (/virtual/i.test(text)) list.push('virtual');
        if (/classroom/i.test(text)) list.push('classroom');
        if (/self-paced|online/i.test(text)) list.push('online');
        return list.length ? list : ['virtual'];
    }

    // Most feed records have no description; placeholders such as "This course is about..." are left out
    function usefulDescription(text) {
        text = (text || '').replace(/\s+/g, ' ').trim();
        return text.length >= 40 && !/(\.\.\.|\u2026)$/.test(text) ? text : '';
    }

    // Every feed record is listed, matching the portal catalog, except zzz_UAT… test data
    function isListed(item) {
        var title = item.courseTitle || '';
        return item.courseId && title && !/^zzz/i.test(title);
    }

    function viewUrl(id) {
        return VIEW_PATH + '?id=' + encodeURIComponent(id);
    }

    // On-site course pages, written into the page as JSON by _includes/site-courses-json.html
    function siteCourses() {
        var node = document.getElementById('site-courses');
        var list = [];
        try { list = node ? JSON.parse(node.textContent) : []; } catch (e) {}
        return list.filter(function (c) { return c && c.id && c.title; }).map(function (c) {
            return {
                id: String(c.id), title: c.title, description: c.description || '', tag: c.tag || '',
                duration: c.duration || '', formats: siteFormats(c.format || ''), formatText: c.format || '',
                url: c.url, onSite: true, inFeed: false, code: c.code || '', detailsUrl: '', search: c.search || ''
            };
        });
    }

    function fromFeed(item) {
        var format = feedFormat(item);
        var id = String(item.courseId);
        return {
            id: id, title: item.courseTitle.trim(), description: usefulDescription(item.shortDescription), tag: '',
            duration: '', formats: [format], formatText: FORMATS[format].label, url: viewUrl(id), onSite: false,
            inFeed: true, code: item.courseIdentifier && item.courseIdentifier !== id ? item.courseIdentifier : '',
            detailsUrl: item.courseDetailsURL || ''
        };
    }

    function byTitle(a, b) {
        return a.title.localeCompare(b.title, 'en', { sensitivity: 'base', numeric: true });
    }

    // offset is the 1-based record to start from; the feed sets hasMore when more records follow
    function fetchPages(params, offset, items, page, signal) {
        var url = FEED + '?offset=' + offset + '&limit=' + PAGE_SIZE + '&p_region=gl' + params;
        return fetch(url, signal ? { signal: signal } : undefined)
            .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(function (data) {
                var batch = (data && data.items) || [];
                items = items.concat(batch);
                if (data && data.hasMore && batch.length && page < MAX_PAGES) {
                    return fetchPages(params, offset + batch.length, items, page + 1, signal);
                }
                return items;
            });
    }

    // Times out after TIMEOUT_MS; an outer signal lets callers cancel a search that has been superseded
    function request(params, outer) {
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var timer = controller && setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
        if (controller && outer) {
            if (outer.aborted) controller.abort();
            else outer.addEventListener('abort', function () { controller.abort(); });
        }
        return fetchPages(params, 1, [], 1, controller && controller.signal).then(function (items) {
            clearTimeout(timer);
            return items;
        }, function (err) {
            clearTimeout(timer);
            throw err;
        });
    }

    // Every listed course, A to Z. Course pages win over feed records with the same ID, and course pages
    // missing from the feed (such as 226074832) are still included.
    function merge(feedItems) {
        var courses = siteCourses();
        var byId = {};
        courses.forEach(function (c) { byId[c.id] = c; });
        feedItems.forEach(function (item) {
            if (!isListed(item)) return;
            var id = String(item.courseId);
            var known = byId[id];
            if (known) {
                known.inFeed = true;
                known.detailsUrl = item.courseDetailsURL || '';
                return;
            }
            byId[id] = fromFeed(item);
            courses.push(byId[id]);
        });
        return courses.sort(byTitle);
    }

    function loadAll(signal) {
        return request('', signal).then(merge);
    }

    function localOnly() {
        return siteCourses().sort(byTitle);
    }

    // The feed treats % as a wildcard and an unmatched quote as "match everything", so only letters,
    // digits, spaces and hyphens are sent
    function cleanQuery(text) {
        return String(text || '').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
    }

    // Course IDs whose title or portal description contains a search word. The feed matches whole words
    // only ("auditor", not "aud") and returns courses that contain any of the words.
    function searchIds(text, signal) {
        var keyword = cleanQuery(text);
        if (keyword.length < 3) return Promise.resolve([]);
        return request('&keyword=' + encodeURIComponent(keyword), signal).then(function (items) {
            return items.map(function (item) { return String(item.courseId); });
        });
    }

    function fold(text) {
        return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function terms(text) {
        return fold(cleanQuery(text)).split(' ').filter(Boolean);
    }

    // 1 = every word in the title, 2 = every word somewhere in what the site knows about the course (its page's
    // description, objectives, audience and skills), 0 = no match
    function matchRank(course, words) {
        if (!words.length) return 1;
        var has = function (haystack) { return words.every(function (w) { return haystack.indexOf(w) !== -1; }); };
        if (has(fold(course.title))) return 1;
        if (course.folded === undefined) {
            course.folded = fold([course.title, course.description, course.tag, course.formatText, course.code, course.id,
                course.search].join(' '));
        }
        var text = course.folded;
        return has(text) ? 2 : 0;
    }

    window.absCatalog = {
        formats: FORMATS, formatOrder: FORMAT_ORDER, loadAll: loadAll, localOnly: localOnly, searchIds: searchIds,
        terms: terms, matchRank: matchRank, cleanQuery: cleanQuery, viewUrl: viewUrl, byTitle: byTitle
    };
})();
