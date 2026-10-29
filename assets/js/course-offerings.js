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

    window.absOfferings = { load: load, formatLabel: formatLabel, timeRange: timeRange, seatsLeft: seatsLeft };
})();
