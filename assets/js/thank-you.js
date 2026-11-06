// Thank You page (/contact/thank-you/), shown after a successful Contact Us form submission.
//   - generate_lead: sent only when assets/js/contact-form.js left the one-time sessionStorage flag
//     abs_lead_pending (set just before redirecting here). The flag is removed at once, so a reload, the back
//     button or opening this page directly never sends it again. Flags older than 30 minutes are ignored.
//   - ?course=<course title> (from a course page): names the course and offers "Back to <course>".
(function () {
    var KEY = 'abs_lead_pending';
    var MAX_AGE_MS = 30 * 60 * 1000;
    var MAX_COURSE = 150;

    var lead = null;
    try {
        lead = JSON.parse(sessionStorage.getItem(KEY));
        sessionStorage.removeItem(KEY);
    } catch (e) {}
    if (lead && lead.form_name && Date.now() - Number(lead.t) < MAX_AGE_MS) {
        try {
            if (window.absAnalytics) {
                window.absAnalytics.track('generate_lead', {
                    form_name: String(lead.form_name), course_name: lead.course_name ? String(lead.course_name) : undefined,
                    link_location: 'contact_form'
                });
            }
        } catch (e) {}
    }

    var course = (new URLSearchParams(window.location.search).get('course') || '')
        .replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_COURSE);
    if (!course) return;

    var note = document.querySelector('[data-thank-you-course]');
    if (note) {
        note.textContent = 'Your question about ' + course + ' is with our training team.';
        note.hidden = false;
    }

    var links = {};
    try { links = JSON.parse(document.getElementById('course-links').textContent); } catch (e) {}
    var url = links[course];
    var back = document.querySelector('[data-thank-you-back]');
    if (url && back) {
        back.href = url;
        back.querySelector('[data-thank-you-back-label]').textContent = 'Back to ' + course;
        back.hidden = false;
    }
})();
