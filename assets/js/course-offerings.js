// Live class data from the Seertech public offerings feed (report 065.4, "Logged out catalog course object offerings").
(function () {
    var FEED = 'https://portal.abs-training.com/ws/report/out/abs/CatalogObjectOfferingsOut';
    var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

    // Seertech dates look like "17-Nov-26 08:45 (GMT-5) EST"
    function parseStart(value) {
        var m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2})/.exec(value || '');
        if (!m) return null;
        return new Date(2000 + Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
    }

    function timeOf(value) {
        var m = /\s(\d{1,2}:\d{2})\b/.exec(value || '');
        return m ? m[1] : '';
    }

    var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // US month-day-year from the class's own start and end dates: "Dec 8, 2026", "Dec 14–15, 2026",
    // "Nov 30 – Dec 2, 2026", "Dec 30, 2026 – Jan 2, 2027". The feed's dateShort ("30 Nov -2 Dec 2026")
    // is only a fallback; its hyphen before a digit is read as "minus" by screen readers.
    function dateRange(o) {
        var s = parseStart(o.startDate);
        var e = parseStart(o.endDate) || s;
        if (!s) return (o.dateShort || '').trim();
        var md = function (d) { return MONTH_NAMES[d.getMonth()] + ' ' + d.getDate(); };
        var y = function (d) { return d.getFullYear(); };
        if (s.getTime() === e.getTime()) return md(s) + ', ' + y(s);
        if (y(s) !== y(e)) return md(s) + ', ' + y(s) + ' \u2013 ' + md(e) + ', ' + y(e);
        if (s.getMonth() !== e.getMonth()) return md(s) + ' \u2013 ' + md(e) + ', ' + y(e);
        return md(s) + '\u2013' + e.getDate() + ', ' + y(e);
    }

    function timeZoneOf(value) {
        var m = /\)\s*([A-Z]{2,5})\s*$/.exec(value || '');
        return m ? m[1] : '';
    }

    // offeringType C = classroom; the feed's contentType field is not reliable for this
    function formatLabel(o) {
        if (o.offeringType === 'C') return 'Classroom';
        if (/online/i.test(o.contentType || '')) return 'Online';
        return 'Virtual';
    }

    // Virtual classes report a host room such as "ABS Training Virtual Classroom Greece" as their location
    function venue(o) {
        var location = (o.location || '').trim();
        return location && !/virtual classroom/i.test(location) ? location : '';
    }

    function placeLabel(o) {
        var place = venue(o);
        return place ? formatLabel(o) + ', ' + place : formatLabel(o);
    }

    function placeIcon(o) {
        if (venue(o)) return 'location_on';
        return formatLabel(o) === 'Classroom' ? 'groups' : 'laptop_windows';
    }

    function timeRange(o) {
        var start = timeOf(o.startDate), end = timeOf(o.endDate), tz = timeZoneOf(o.startDate);
        if (!start) return '';
        return start + (end ? '\u2013' + end : '') + (tz ? ' ' + tz : '');
    }

    function seatsLeft(o) {
        var n = Number(o.openSeats);
        return isFinite(n) && n > 0 && n < 1000 ? n : null;
    }

    function isRealOffering(o) {
        return o.isEOI !== 'Y' && !/^zzz/i.test(o.offeringName || '') && parseStart(o.startDate);
    }

    var PAGE_SIZE = 50;
    var MAX_PAGES = 20;

    // offset is the 1-based record to start from; the feed sets hasMore when more records follow
    function fetchAll(courseId, offset, items, page) {
        var url = FEED + '?offset=' + offset + '&limit=' + PAGE_SIZE + '&date_from=%25&available_only=Y&content_object_id=' +
            encodeURIComponent(courseId) + '&p_region=gl&location=%25&offering_language=%25';
        return fetch(url)
            .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(function (data) {
                var batch = (data && data.items) || [];
                items = items.concat(batch);
                if (data && data.hasMore && batch.length && page < MAX_PAGES) {
                    return fetchAll(courseId, offset + batch.length, items, page + 1);
                }
                return items;
            });
    }

    function load(courseId) {
        return fetchAll(courseId, 1, [], 1)
            .then(function (items) {
                var today = new Date(); today.setHours(0, 0, 0, 0);
                return {
                    upcoming: items.filter(isRealOffering)
                        .filter(function (o) { return parseStart(o.startDate) >= today; })
                        .sort(function (a, b) { return parseStart(a.startDate) - parseStart(b.startDate); }),
                    interest: items.filter(function (o) { return o.isEOI === 'Y'; })[0] || null
                };
            });
    }

    window.absOfferings = { load: load, dateRange: dateRange, formatLabel: formatLabel, placeLabel: placeLabel, placeIcon: placeIcon, timeRange: timeRange, seatsLeft: seatsLeft };
})();
