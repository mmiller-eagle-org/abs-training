// Site analytics: pushes events into window.dataLayer for Google Tag Manager.
// Nothing is sent and no cookies are set unless a GTM container ID is configured
// (analytics.gtm_id in _config.yml); Consent Mode defaults are set in _layouts/default.html.
//
// Events
//   view_item                course page viewed           ecommerce.items[0] = the course
//   select_item              featured course card clicked ecommerce.items[0] = the course, item_list_name
//   register_click           Register on a scheduled class    course_id, course_name, offering_id, class_date, class_format
//   register_interest_click  Register interest (no classes)   course_id, course_name, offering_id
//   contact_click            any mailto: link                 link_url
//   outbound_click           link to the portal or another site   link_name, link_url
// Every click event also carries link_location (header, footer, or the section's heading id).
// Add ?track_debug=1 to a URL to log events to the browser console.
(function () {
    window.dataLayer = window.dataLayer || [];
    var debug = /[?&]track_debug=1(&|$)/.test(window.location.search);

    function track(event, params, items) {
        var data = { event: event };
        for (var key in params) {
            if (params[key] !== undefined && params[key] !== null && params[key] !== '') data[key] = params[key];
        }
        if (items) {
            window.dataLayer.push({ ecommerce: null });
            data.ecommerce = { items: items };
        }
        window.dataLayer.push(data);
        if (debug && window.console) console.info('[track]', data);
    }

    function courseItem(course) {
        return { item_id: course.id, item_name: course.name, item_category: course.category, item_brand: 'ABS Training' };
    }

    function linkLocation(a) {
        if (a.closest('[data-offerings]')) return 'upcoming_classes';
        if (a.closest('header')) return 'header';
        if (a.closest('footer')) return 'footer';
        var section = a.closest('section[aria-labelledby]');
        return section ? section.getAttribute('aria-labelledby') : 'page';
    }

    function linkName(url) {
        if (/\/catalog\/abs\//i.test(url)) return 'course_catalog';
        if (/clmscoursecalendar/i.test(url)) return 'course_calendar';
        if (/xlr8login/i.test(url)) return 'log_in';
        if (/clmscertificate/i.test(url)) return 'verify_certificate';
        if (/absinfo\.eagle\.org/i.test(url)) return 'newsletter';
        if (/linkedin\.com/i.test(url)) return 'linkedin';
        if (/eagle\.org/i.test(url)) return 'eagle_org';
        return 'other';
    }

    // Capture phase so the event is recorded before the browser starts navigating away
    document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!a) return;
        var where = linkLocation(a);
        var page = window.absCoursePage || {};

        if (a.dataset.track === 'register' || a.dataset.track === 'register_interest') {
            track(a.dataset.track === 'register' ? 'register_click' : 'register_interest_click', {
                course_id: page.id, course_name: page.name, offering_id: a.dataset.offeringId,
                class_date: a.dataset.classDate, class_format: a.dataset.classFormat, link_location: where
            });
            return;
        }

        var card = a.closest('article[data-course-id]');
        if (card) {
            track('select_item', { item_list_name: 'Featured Courses', link_location: where }, [courseItem({
                id: card.dataset.courseId, name: card.dataset.courseName, category: card.dataset.courseTag
            })]);
            return;
        }

        if (/^mailto:/i.test(a.getAttribute('href'))) {
            track('contact_click', { link_url: a.getAttribute('href').replace(/^mailto:/i, '').split('?')[0], link_location: where });
            return;
        }

        if (a.hostname && a.hostname !== window.location.hostname) {
            track('outbound_click', { link_name: linkName(a.href), link_url: a.href, link_location: where });
        }
    }, true);

    window.absAnalytics = { track: track, courseItem: courseItem };
})();
