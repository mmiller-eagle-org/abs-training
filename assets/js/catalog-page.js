// Course Catalog page (/courses/): search box, format filter and results.
// Data comes from assets/js/course-catalog.js. The URL keeps ?q= and ?format= so searches can be shared
// and other pages can link to a search. Analytics: "search" (search_term) once typing settles or on submit;
// result clicks send select_item with item_list_name "Course Catalog" (assets/js/analytics.js).
(function () {
    var cat = window.absCatalog;
    var form = document.querySelector('[data-catalog-form]');
    var input = document.getElementById('course-search');
    var filter = document.querySelector('[data-format-filter]');
    var results = document.querySelector('[data-results]');
    var noticeBox = document.querySelector('[data-results-notice]');
    var summary = document.querySelector('[data-results-summary]');
    var statusNode = document.querySelector('[data-catalog-status]');
    var clearButton = document.querySelector('[data-clear-search]');
    var portalUrl = results.getAttribute('data-portal-catalog');

    var MAX_QUERY = 100;
    var courses = null;
    var query = '';
    var format = '';
    // Feed keyword results per search word: word -> { id: true }. Words still loading are in pending.
    var wordMatches = {};
    var pending = {};
    var searchController = null;
    var feedTimer, announceTimer, trackTimer, urlTimer;
    var lastTracked = '';

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function icon(name, className) {
        var node = el('span', 'material-symbols-outlined ' + className, name);
        node.setAttribute('aria-hidden', 'true');
        return node;
    }

    function plural(n, word) {
        return n + ' ' + word + (n === 1 ? '' : 's');
    }

    // Curly quotes around the search text, as in: 7 courses match "fuel"
    function quoted(text) {
        return '\u201c' + text + '\u201d';
    }

    function readUrl() {
        var params = new URLSearchParams(window.location.search);
        query = (params.get('q') || '').slice(0, MAX_QUERY).trim();
        var f = params.get('format') || '';
        format = cat.formats[f] ? f : '';
        input.value = query;
        var radio = filter.querySelector('input[value="' + format + '"]');
        if (radio) radio.checked = true;
    }

    function writeUrl() {
        var params = new URLSearchParams(window.location.search);
        if (query) params.set('q', query); else params.delete('q');
        if (format) params.set('format', format); else params.delete('format');
        var search = params.toString();
        history.replaceState(null, '', window.location.pathname + (search ? '?' + search : '') + window.location.hash);
    }

    // Feed search words: whole words of 3+ letters (the feed cannot match shorter or partial words)
    function feedWords() {
        return cat.terms(query).filter(function (w) { return w.length >= 3; }).slice(0, 5);
    }

    // A course matches when every search word is in its title or details here, or the feed found that word
    // in its portal description. Rank: 1 = all words in the title, 2 = found here, 3 = portal description.
    function matches() {
        var words = cat.terms(query);
        var found = [];
        courses.forEach(function (c) {
            var rank = cat.matchRank(c, words);
            if (!rank && words.length && words.every(function (w) {
                return cat.matchRank(c, [w]) || (wordMatches[w] && wordMatches[w][c.id]);
            })) rank = 3;
            if (rank) found.push({ course: c, rank: rank });
        });
        return found.sort(function (a, b) { return a.rank - b.rank || cat.byTitle(a.course, b.course); });
    }

    function isSearching() {
        return feedWords().some(function (w) { return pending[w]; });
    }

    function card(match) {
        var c = match.course;
        var item = el('li', 'flex');
        var article = el('article', 'group relative flex w-full flex-col rounded-lg border border-gray-200 border-t-4 border-t-abs-blue bg-white p-5 lg:p-6 shadow-card transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-card-hover focus-within:ring-2 focus-within:ring-abs-blue focus-within:ring-offset-2 focus-within:ring-offset-gray-50');
        article.dataset.courseId = c.id;
        article.dataset.courseName = c.title;
        article.dataset.courseTag = c.tag || c.formatText;
        article.dataset.listName = 'Course Catalog';
        if (c.tag) article.appendChild(el('span', 'tag tag-gray self-start mb-3', c.tag));

        var heading = el('h3', 'text-base lg:text-lg font-bold leading-snug text-abs-blue transition-colors group-hover:text-abs-red');
        var link = el('a', 'focus-visible:outline-none after:absolute after:inset-0', c.title);
        link.href = c.url;
        heading.appendChild(link);
        article.appendChild(heading);

        if (c.description) article.appendChild(el('p', 'mt-2 font-serif text-sm leading-relaxed text-gray-600', c.description));
        if (match.rank === 3) {
            var why = el('p', 'mt-2 flex items-center gap-1.5 text-xs font-medium text-gray-600');
            why.appendChild(icon('manage_search', 'text-[18px] text-abs-blue-mid'));
            why.appendChild(el('span', '', 'Found in the full course description'));
            article.appendChild(why);
        }

        var meta = el('ul', 'flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-gray-100 pt-4 text-xs font-medium text-gray-600');
        meta.setAttribute('role', 'list');
        var spacer = el('div', 'mt-auto pt-4');
        function fact(iconName, text) {
            var li = el('li', 'flex items-center gap-1.5');
            li.appendChild(icon(iconName, 'text-[20px] text-abs-blue'));
            li.appendChild(el('span', '', text));
            meta.appendChild(li);
        }
        c.formats.forEach(function (f) { fact(cat.formats[f].icon, cat.formats[f].label); });
        if (c.duration) fact('schedule', c.duration);
        spacer.appendChild(meta);
        article.appendChild(spacer);
        item.appendChild(article);
        return item;
    }

    function emptyState() {
        var wrap = el('div', 'rounded-xl border border-gray-200 bg-white px-6 py-10 text-center shadow-card');
        var badge = el('div', 'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#E6EAEF] text-abs-blue');
        badge.setAttribute('aria-hidden', 'true');
        badge.appendChild(icon('search_off', 'text-[28px]'));
        wrap.appendChild(badge);
        wrap.appendChild(el('h3', 'text-lg font-bold text-abs-blue', 'No Courses Found'));
        var where = format ? ' in ' + cat.formats[format].label : '';
        var text = query
            ? 'No courses match ' + quoted(query) + where + '. Check the spelling, try a broader word such as auditor or fuel, or clear the search.'
            : 'No ' + (format ? cat.formats[format].label + ' ' : '') + 'courses are listed right now. Clear the search to see every course.';
        wrap.appendChild(el('p', 'mx-auto mt-2 mb-6 max-w-lg font-serif text-sm leading-relaxed text-gray-600', text));
        var actions = el('div', 'flex flex-wrap justify-center gap-3');
        var clear = el('button', 'btn btn-primary', 'Clear Search');
        clear.type = 'button';
        clear.addEventListener('click', clearAll);
        actions.appendChild(clear);
        var portal = el('a', 'btn btn-outline', 'Search the Portal Catalog');
        portal.href = portalUrl;
        actions.appendChild(portal);
        wrap.appendChild(actions);
        return wrap;
    }

    function summaryText(count) {
        var kind = format ? cat.formats[format].label + ' ' : '';
        var noun = count === 1 ? 'course' : 'courses';
        if (query) return count + ' ' + kind + noun + (count === 1 ? ' matches ' : ' match ') + quoted(query);
        return count + ' ' + kind + noun;
    }

    // Announced politely once typing pauses, so screen readers do not read a count after every key
    function announce(text, delay) {
        clearTimeout(announceTimer);
        announceTimer = setTimeout(function () {
            statusNode.textContent = '';
            // A short gap makes screen readers treat a repeated message as new
            setTimeout(function () { statusNode.textContent = text; }, 50);
        }, delay);
    }

    function render(announceDelay) {
        if (!courses) return;
        var found = matches();
        var counts = { '': found.length };
        cat.formatOrder.forEach(function (f) { counts[f] = 0; });
        found.forEach(function (m) { m.course.formats.forEach(function (f) { counts[f]++; }); });
        Array.prototype.forEach.call(filter.querySelectorAll('[data-format-option]'), function (option) {
            option.querySelector('[data-format-count]').textContent = '(' + counts[option.getAttribute('data-format-option')] + ')';
        });

        var shown = format ? found.filter(function (m) { return m.course.formats.indexOf(format) !== -1; }) : found;
        var searching = !shown.length && isSearching();
        results.textContent = '';
        if (shown.length) {
            var list = el('ul', 'grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6');
            // Safari drops list semantics when list-style is none
            list.setAttribute('role', 'list');
            shown.forEach(function (m) { list.appendChild(card(m)); });
            results.appendChild(list);
        } else if (!searching) {
            results.appendChild(emptyState());
        }

        var text = searching ? 'Searching course descriptions\u2026' : summaryText(shown.length);
        summary.textContent = text;
        clearButton.hidden = !(query || format);
        if (!searching && announceDelay !== undefined) {
            announce(shown.length ? text + '.' : 'No courses found.', announceDelay);
        }
    }

    // Asks the feed for each search word it has not seen yet, then redraws when the answers arrive.
    // Failures are ignored: matches found on this site are still shown.
    function searchFeed() {
        clearTimeout(feedTimer);
        var words = feedWords().filter(function (w) { return !wordMatches[w] && !pending[w]; });
        if (!words.length) return;
        feedTimer = setTimeout(function () {
            if (searchController) searchController.abort();
            searchController = typeof AbortController === 'function' ? new AbortController() : null;
            var signal = searchController && searchController.signal;
            words.forEach(function (w) { pending[w] = true; });
            Promise.all(words.map(function (w) {
                return cat.searchIds(w, signal).then(function (ids) {
                    var set = {};
                    ids.forEach(function (id) { set[id] = true; });
                    wordMatches[w] = set;
                }, function () {});
            })).then(function () {
                words.forEach(function (w) { delete pending[w]; });
                render(600);
            });
        }, 350);
    }

    function track(now) {
        clearTimeout(trackTimer);
        var term = query;
        if (term.length < 2 || term.toLowerCase() === lastTracked) return;
        trackTimer = setTimeout(function () {
            lastTracked = term.toLowerCase();
            try {
                if (window.absAnalytics) window.absAnalytics.track('search', { search_term: term, link_location: 'catalog' });
            } catch (e) {}
        }, now ? 0 : 1500);
    }

    function setQuery(value, immediate) {
        query = String(value || '').slice(0, MAX_QUERY).trim();
        render(immediate ? 100 : 1000);
        searchFeed();
        track(immediate);
        clearTimeout(urlTimer);
        urlTimer = setTimeout(writeUrl, immediate ? 0 : 400);
    }

    function clearAll() {
        input.value = '';
        format = '';
        filter.querySelector('input[value=""]').checked = true;
        setQuery('', true);
        input.focus();
    }

    input.addEventListener('input', function () { setQuery(input.value); });
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        setQuery(input.value, true);
    });
    filter.addEventListener('change', function (e) {
        if (e.target.name !== 'format') return;
        format = e.target.value;
        render(300);
        writeUrl();
    });
    clearButton.addEventListener('click', clearAll);

    function showLoading() {
        var grid = el('div', 'grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6');
        grid.setAttribute('aria-hidden', 'true');
        for (var i = 0; i < 6; i++) {
            var row = el('div', 'space-y-3 rounded-lg border border-gray-200 border-t-4 border-t-gray-200 bg-white p-6 animate-pulse');
            ['h-5 w-3/4', 'h-3 w-full', 'h-3 w-5/6', 'h-3 w-1/3'].forEach(function (size) {
                row.appendChild(el('div', 'rounded bg-gray-100 ' + size));
            });
            grid.appendChild(row);
        }
        results.textContent = '';
        results.appendChild(grid);
        // The pulse stops after 4 seconds so a slow feed does not leave motion running (WCAG 2.2.2)
        setTimeout(function () {
            Array.prototype.forEach.call(grid.children, function (row) { row.classList.remove('animate-pulse'); });
        }, 4000);
    }

    // The feed failed: course pages on this site are still listed and searchable
    function showPartialNotice() {
        var box = el('div', 'mb-6 flex items-start gap-3 rounded-lg border border-[#9A6700] bg-[#FFF7E6] p-4');
        box.appendChild(icon('info', 'text-[22px] text-abs-blue'));
        var text = el('p', 'text-sm leading-relaxed text-gray-700', 'The full course list could not be loaded, so only some courses are shown. ');
        var link = el('a', 'font-bold text-abs-blue underline underline-offset-2 hover:text-abs-blue-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-abs-blue focus-visible:ring-offset-2 rounded-sm', 'See every course on the ABS Training portal');
        link.href = portalUrl;
        text.appendChild(link);
        text.appendChild(document.createTextNode('.'));
        box.appendChild(text);
        noticeBox.appendChild(box);
        noticeBox.hidden = false;
    }

    readUrl();
    showLoading();
    if (window.location.hash === '#course-search') input.focus();

    cat.loadAll()
        .then(function (list) {
            courses = list;
            render(query ? 100 : undefined);
            searchFeed();
            if (query) track(true);
        })
        .catch(function () {
            courses = cat.localOnly();
            showPartialNotice();
            render();
            announce('The full course list could not be loaded, so only some courses are shown.', 100);
            if (query) track(true);
        });
})();
