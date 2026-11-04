// Upcoming Classes panel (_includes/upcoming-classes.html) on course pages and the course view page.
// Needs assets/js/course-offerings.js. Call absUpcomingClasses.start(courseId); it resolves to the feed
// result ({ upcoming, interest, selfPaced }) once the panel is drawn, or null if the dates could not be loaded.
// Set window.absCoursePage first so Register clicks are tracked with the course.
(function () {
    var panel = document.getElementById('dates');
    if (!panel) return;
    var box = panel.querySelector('[data-offerings]');
    var statusNode = panel.querySelector('[data-offerings-status]');
    var countNode = panel.querySelector('[data-offerings-count]');
    var headingNode = panel.querySelector('[data-dates-heading]');
    var headingIcon = panel.querySelector('[data-dates-icon]');
    var catalogNote = panel.querySelector('[data-catalog-link]');
    var portalCatalogUrl = panel.getAttribute('data-portal-catalog');
    var siteCatalogUrl = panel.getAttribute('data-site-catalog');
    var off = window.absOfferings;
    var loadStarted = Date.now();

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

    function hidden(node) {
        node.setAttribute('aria-hidden', 'true');
        return node;
    }

    // Screen readers skip the en dash ("Nov 17 19"), so ranges are spoken with "to"
    function spoken(text) {
        return text.replace(/\s*\u2013\s*/g, ' to ');
    }

    // Shows the visual text but exposes one spoken string. A single sr-only string avoids the words
    // running together, which happens when sr-only spans are split around the dash.
    function say(node, visible, heard) {
        if (visible === heard) {
            node.appendChild(document.createTextNode(visible));
        } else {
            node.appendChild(hidden(el('span', '', visible)));
            node.appendChild(el('span', 'sr-only', heard));
        }
        return node;
    }

    function linkButton(href, label, primary) {
        var a = el('a', 'btn ' + (primary ? 'btn-primary' : 'btn-outline') + ' w-full justify-center', label);
        a.href = href;
        return a;
    }

    // The footer's catalog link would repeat a catalog button shown in the panel body
    function catalogButton(url, label) {
        if (catalogNote) catalogNote.hidden = true;
        return linkButton(url, label, true);
    }

    function setHeading(light, bold, iconName) {
        headingNode.textContent = '';
        headingNode.appendChild(el('span', 'font-light', light));
        headingNode.appendChild(document.createTextNode(' '));
        headingNode.appendChild(el('span', 'font-extrabold', bold));
        headingIcon.textContent = iconName;
    }

    // Polite status for screen readers. A result that arrives with the page is skipped, since it would
    // interrupt page-load reading; slow loads, errors and loads while focus is in the panel are announced.
    // The text is cleared afterward so it is not read again after the list.
    function announce(text, always) {
        statusNode.className = 'sr-only';
        var useful = always || Date.now() - loadStarted > 2000 || panel.contains(document.activeElement);
        statusNode.textContent = useful ? text : '';
        if (useful) setTimeout(function () { statusNode.textContent = ''; }, 7000);
    }

    function detail(iconName, visible, heard) {
        // The flex box wraps a block <p>: a flex <p> is dropped from Chromium's accessibility tree,
        // which makes NVDA and JAWS read the time, format and seats lines as one run-on line
        var line = el('div', 'flex items-start gap-2 text-sm leading-5 text-gray-700');
        line.appendChild(icon(iconName, 'mt-px text-[18px] text-abs-blue-mid'));
        line.appendChild(say(el('p', 'min-w-0'), visible, heard || spoken(visible)));
        return line;
    }

    function classRow(o) {
        var item = el('li', 'py-5 first:pt-0 last:pb-0');
        var date = off.dateRange(o);
        var heardDate = spoken(off.dateRange(o, true));

        // h3 so each class is reachable by heading navigation under the "Upcoming Classes" h2
        item.appendChild(say(el('h3', 'text-lg font-bold leading-snug text-abs-blue'), date, heardDate));
        var days = off.classDays(o);
        var dayText = days ? days + (days === 1 ? ' day' : ' days') : '';
        var sub = el('p', 'mt-0.5 text-xs font-medium text-gray-600');
        var visibleSub = hidden(el('span', '', off.weekdayRange(o)));
        if (dayText) {
            visibleSub.appendChild(el('span', 'mx-1.5 text-gray-500', '\u00b7'));
            visibleSub.appendChild(document.createTextNode(dayText));
        }
        sub.appendChild(visibleSub);
        sub.appendChild(el('span', 'sr-only', [spoken(off.weekdayRange(o, true)), dayText].filter(Boolean).join(', ')));
        item.appendChild(sub);
        var details = el('div', 'mt-3 space-y-1.5');
        var time = off.timeRange(o);
        if (time) details.appendChild(detail('schedule', time, spoken(off.timeRange(o, true))));
        details.appendChild(detail(off.placeIcon(o), off.placeLabel(o)));
        item.appendChild(details);

        var action = el('div', 'mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3');
        var seats = off.seatsLeft(o);
        if (seats) {
            var few = seats <= 5;
            var seatLine = el('div', 'flex items-center gap-1.5 text-sm ' + (few ? 'font-bold text-abs-red-dark' : 'text-gray-600'));
            seatLine.appendChild(icon('event_seat', 'text-[18px]'));
            seatLine.appendChild(el('p', '', (few ? 'Only ' : '') + seats + (seats === 1 ? ' seat' : ' seats') + ' left'));
            action.appendChild(seatLine);
        }
        var register = el('a', 'btn btn-primary ml-auto px-5');
        // One flex item, and a no-break space, so the name reads "Register for Nov 17 to 19, 2026"
        var label = el('span', '', 'Register');
        label.appendChild(el('span', 'sr-only', '\u00a0for ' + heardDate));
        register.appendChild(label);
        register.appendChild(icon('arrow_forward', 'btn-arrow text-[18px]'));
        register.href = o.courseDetailsURL;
        register.dataset.track = 'register';
        register.dataset.offeringId = o.offeringId;
        register.dataset.classDate = date;
        register.dataset.classFormat = off.formatLabel(o);
        action.appendChild(register);
        item.appendChild(action);
        return item;
    }

    function notice(iconName, title, text, link) {
        var wrap = el('div', 'text-center');
        var badge = hidden(el('div', 'mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#E6EAEF] text-abs-blue'));
        badge.appendChild(icon(iconName, 'text-[26px]'));
        wrap.appendChild(badge);
        wrap.appendChild(el('h3', 'text-base font-bold text-abs-blue', title));
        wrap.appendChild(el('p', 'mt-1 mb-5 text-sm leading-relaxed text-gray-600', text));
        wrap.appendChild(link);
        return wrap;
    }

    // Placeholder rows under the visible "Loading class dates…" status text; the pulse stops after
    // 4 seconds so a slow feed does not leave motion running (WCAG 2.2.2)
    function showLoading() {
        var rows = hidden(el('div', 'space-y-6'));
        for (var i = 0; i < 2; i++) {
            var row = el('div', 'space-y-2.5 animate-pulse');
            ['h-5 w-3/4', 'h-3 w-1/3', 'h-3 w-5/6', 'h-3 w-1/2'].forEach(function (size) {
                row.appendChild(el('div', 'rounded bg-gray-100 ' + size));
            });
            rows.appendChild(row);
        }
        box.appendChild(rows);
        setTimeout(function () {
            Array.prototype.forEach.call(rows.children, function (row) { row.classList.remove('animate-pulse'); });
        }, 4000);
    }

    function render(result) {
        box.textContent = '';
        var count = result.upcoming.length;
        if (count) {
            var list = el('ul', 'divide-y divide-gray-200');
            // Safari drops list semantics when list-style is none
            list.setAttribute('role', 'list');
            result.upcoming.forEach(function (o) { list.appendChild(classRow(o)); });
            box.appendChild(list);
            countNode.textContent = count + (count === 1 ? ' date' : ' dates');
            countNode.hidden = false;
            announce(count === 1 ? '1 upcoming class loaded.' : count + ' upcoming classes loaded.');
            return;
        }
        var link;
        if (result.selfPaced) {
            // Self-paced online courses and bundles have no class dates; one offering is open all the time
            setHeading('Start', 'Anytime', 'play_circle');
            link = linkButton(result.selfPaced.courseDetailsURL, 'Enroll Now', true);
            link.dataset.track = 'register';
            link.dataset.offeringId = result.selfPaced.offeringId;
            link.dataset.classFormat = 'Self-paced online';
            box.appendChild(notice('play_circle', 'Self-Paced Online Course',
                'Take this course online at your own pace. Enroll and pay on the ABS Training portal.', link));
            announce('Self-paced online course. Enroll anytime.');
            return;
        }
        if (result.interest) {
            link = linkButton(result.interest.courseDetailsURL, 'Register Interest', true);
            link.dataset.track = 'register_interest';
            link.dataset.offeringId = result.interest.offeringId;
            box.appendChild(notice('event_upcoming', 'New Dates Coming Soon',
                'No classes are scheduled right now. Register your interest and we will contact you when new dates are added.', link));
        } else {
            box.appendChild(notice('event_upcoming', 'New Dates Coming Soon',
                'No classes are scheduled right now. Browse our other courses or contact us about this one.',
                catalogButton(siteCatalogUrl, 'Browse All Courses')));
        }
        announce('No upcoming classes are scheduled.');
    }

    function start(courseId) {
        loadStarted = Date.now();
        box.setAttribute('data-course-id', courseId);
        showLoading();
        return off.load(courseId)
            .then(function (result) {
                render(result);
                return result;
            })
            .catch(function () {
                box.textContent = '';
                box.appendChild(notice('event_busy', 'Dates Unavailable',
                    'Class dates could not be loaded. You can see all dates in the ABS Training catalog.',
                    catalogButton(portalCatalogUrl, 'Browse the Catalog')));
                announce('Class dates could not be loaded.', true);
                return null;
            });
    }

    window.absUpcomingClasses = { start: start };
})();
