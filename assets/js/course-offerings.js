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
    var MONTH_NAMES_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
        'October', 'November', 'December'];
    var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var DAY_NAMES_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // US month-day-year from the class's own start and end dates: "Dec 8, 2026", "Dec 14–15, 2026",
    // "Nov 30 – Dec 2, 2026", "Dec 30, 2026 – Jan 2, 2027". The feed's dateShort ("30 Nov -2 Dec 2026")
    // is only a fallback; its hyphen before a digit is read as "minus" by screen readers.
    // long gives full month names for screen readers, since some voices do not expand "Nov".
    function dateRange(o, long) {
        var s = parseStart(o.startDate);
        var e = parseStart(o.endDate) || s;
        if (!s) return (o.dateShort || '').trim();
        var names = long ? MONTH_NAMES_LONG : MONTH_NAMES;
        var md = function (d) { return names[d.getMonth()] + ' ' + d.getDate(); };
        var y = function (d) { return d.getFullYear(); };
        if (s.getTime() === e.getTime()) return md(s) + ', ' + y(s);
        if (y(s) !== y(e)) return md(s) + ', ' + y(s) + ' \u2013 ' + md(e) + ', ' + y(e);
        if (s.getMonth() !== e.getMonth()) return md(s) + ' \u2013 ' + md(e) + ', ' + y(e);
        return md(s) + '\u2013' + e.getDate() + ', ' + y(e);
    }

    // "Tue–Thu", or "Tue" for a one-day class; long names ("Tuesday–Thursday") for screen readers
    function weekdayRange(o, long) {
        var s = parseStart(o.startDate);
        var e = parseStart(o.endDate) || s;
        if (!s) return '';
        var names = long ? DAY_NAMES_LONG : DAY_NAMES;
        return s.getTime() === e.getTime() ? names[s.getDay()] : names[s.getDay()] + '\u2013' + names[e.getDay()];
    }

    // Days of instruction. The feed's totalSessions matches this; calendar days are the fallback.
    function classDays(o) {
        var n = Number(o.totalSessions);
        if (isFinite(n) && n > 0 && n < 60) return n;
        var s = parseStart(o.startDate);
        var e = parseStart(o.endDate) || s;
        return s ? Math.round((e - s) / 86400000) + 1 : null;
    }

    function timeZoneOf(value) {
        var m = /\)\s*([A-Z]{2,5})\s*$/.exec(value || '');
        return m ? m[1] : '';
    }

    // "(GMT-3)" -> "GMT−3" with a true minus sign, which screen readers read as "minus"
    function gmtOffsetOf(value) {
        var m = /\(GMT\s*([+-])\s*(\d{1,2}(?::\d{2})?)\)/.exec(value || '');
        return m ? 'GMT' + (m[1] === '-' ? '\u2212' : '+') + m[2] : '';
    }

    // AP style 12-hour clock: "09:00" -> "9 a.m.", "08:45" -> "8:45 a.m.", "12:00" -> "noon".
    // No-break spaces keep "5 p.m." and "BRT (GMT−3)" from splitting across lines.
    // forSpeech gives "AM"/"PM", since NVDA reads the first period in "a.m." as "dot".
    function clock(hhmm, forSpeech) {
        var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
        if (!m) return '';
        var h = Number(m[1]), min = m[2];
        if (min === '00' && h === 12) return 'noon';
        if (min === '00' && h === 0) return 'midnight';
        var suffix = forSpeech ? (h < 12 ? ' AM' : ' PM') : (h < 12 ? '\u00a0a.m.' : '\u00a0p.m.');
        return (h % 12 || 12) + (min === '00' ? '' : ':' + min) + suffix;
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

    // "9 a.m. – 5 p.m. BRT (GMT−3)". The offset stays because some feed abbreviations are ambiguous
    // (China is reported as CST, which US readers take to be US Central time).
    function timeRange(o, forSpeech) {
        var start = clock(timeOf(o.startDate), forSpeech), end = clock(timeOf(o.endDate), forSpeech);
        if (!start) return '';
        var tz = timeZoneOf(o.startDate), offset = gmtOffsetOf(o.startDate);
        var zone = tz && offset && !/^(GMT|UTC)$/.test(tz) ? tz + '\u00a0(' + offset + ')' : tz || offset;
        return start + (end ? ' \u2013 ' + end : '') + (zone ? ' ' + zone : '');
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
    // A stalled feed would otherwise leave "Loading class dates…" on screen forever
    var TIMEOUT_MS = 10000;

    // offset is the 1-based record to start from; the feed sets hasMore when more records follow
    function fetchAll(courseId, offset, items, page, signal) {
        var url = FEED + '?offset=' + offset + '&limit=' + PAGE_SIZE + '&date_from=%25&available_only=Y&content_object_id=' +
            encodeURIComponent(courseId) + '&p_region=gl&location=%25&offering_language=%25';
        return fetch(url, signal ? { signal: signal } : undefined)
            .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(function (data) {
                var batch = (data && data.items) || [];
                items = items.concat(batch);
                if (data && data.hasMore && batch.length && page < MAX_PAGES) {
                    return fetchAll(courseId, offset + batch.length, items, page + 1, signal);
                }
                return items;
            });
    }

    function load(courseId) {
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var timer = controller && setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
        return fetchAll(courseId, 1, [], 1, controller && controller.signal)
            .then(function (items) {
                clearTimeout(timer);
                var today = new Date(); today.setHours(0, 0, 0, 0);
                return {
                    upcoming: items.filter(isRealOffering)
                        .filter(function (o) { return parseStart(o.startDate) >= today; })
                        .sort(function (a, b) { return parseStart(a.startDate) - parseStart(b.startDate); }),
                    interest: items.filter(function (o) { return o.isEOI === 'Y'; })[0] || null
                };
            }, function (err) {
                clearTimeout(timer);
                throw err;
            });
    }

    window.absOfferings = {
        load: load, dateRange: dateRange, weekdayRange: weekdayRange, classDays: classDays, formatLabel: formatLabel,
        placeLabel: placeLabel, placeIcon: placeIcon, timeRange: timeRange, seatsLeft: seatsLeft
    };
})();
