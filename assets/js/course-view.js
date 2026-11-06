// Course view page (/courses/view/?id=<Seertech course ID>) for courses without their own page in _courses/.
// Shows the title and format from the CatalogOut feed (assets/js/course-catalog.js) and live class dates
// (assets/js/upcoming-classes.js). IDs that do have a course page are sent there instead.
(function () {
    var cat = window.absCatalog;
    var q = function (name) { return document.querySelector('[data-view-' + name + ']'); };
    var id = (new URLSearchParams(window.location.search).get('id') || '').replace(/[^0-9A-Za-z-]/g, '');
    var statusNode = q('status');
    var loadStarted = Date.now();

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function setTitle(text) {
        q('title').textContent = text;
        q('crumb').textContent = text;
        document.title = text + ' | ABS Training';
    }

    function problem(title, text, iconName) {
        setTitle(title);
        q('format').textContent = 'Course Catalog';
        q('lede').textContent = text;
        q('problem-icon').textContent = iconName;
        q('problem-title').textContent = 'Find Another Course';
        q('problem-text').textContent = 'Browse the course catalog on this site, or search the full catalog on the ABS Training portal.';
        q('problem').hidden = false;
        statusNode.textContent = title + '. ' + text;
    }

    function show(course) {
        setTitle(course.title);
        q('format').textContent = course.formatText;
        q('lede').textContent = course.description ||
            'Find dates and registration details below. Registration and payment are completed on the ABS Training portal.';

        var meta = q('meta');
        course.formats.forEach(function (f) {
            var item = el('li', 'flex items-center gap-2');
            var mark = el('span', 'material-symbols-outlined text-[20px]', cat.formats[f].icon);
            mark.setAttribute('aria-hidden', 'true');
            item.appendChild(mark);
            item.appendChild(document.createTextNode(' ' + cat.formats[f].label));
            meta.appendChild(item);
        });
        meta.hidden = false;
        q('content').hidden = false;
        // A course that appears with the page is read with it; a slow load replaces "Loading course…", so say so
        if (Date.now() - loadStarted > 1500) statusNode.textContent = course.title + ' loaded.';

        var contact = q('contact');
        if (contact) contact.href = contact.getAttribute('href') + '?course=' + encodeURIComponent(course.title);

        var details = q('details');
        if (course.detailsUrl) details.href = course.detailsUrl;

        window.absCoursePage = { id: course.id, name: course.title, category: course.formatText };
        // Tracking is optional: privacy extensions may block analytics.js, and class dates must still load
        try {
            if (window.absAnalytics) window.absAnalytics.track('view_item', {}, [window.absAnalytics.courseItem(window.absCoursePage)]);
        } catch (e) {}

        window.absUpcomingClasses.start(course.id).then(function (result) {
            if (!result) return;
            // The portal page for a real offering holds the full description; the course ID alone does not open it
            var offering = result.upcoming[0] || result.selfPaced || result.interest;
            if (offering && offering.courseDetailsURL) details.href = offering.courseDetailsURL;
            q('jump-label').textContent = result.selfPaced && !result.upcoming.length ? 'How to Enroll' : 'View Dates';
            q('jump').hidden = false;
        });
    }

    if (!id) {
        problem('Course Not Found', 'No course was chosen.', 'search_off');
        return;
    }

    // Course pages on this site have the full description, so go there instead
    var local = cat.localOnly().filter(function (c) { return c.id === id; })[0];
    if (local) {
        window.location.replace(local.url);
        return;
    }

    cat.loadAll()
        .then(function (list) {
            var course = list.filter(function (c) { return c.id === id; })[0];
            if (course) show(course);
            else problem('Course Not Found', 'This course is not in the catalog. It may have been renamed or retired.', 'search_off');
        })
        .catch(function () {
            problem('Course Unavailable', 'The course could not be loaded right now. Please try again later.', 'cloud_off');
        });
})();
