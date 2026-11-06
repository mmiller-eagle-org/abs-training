// Contact Us page (/contact/): works with the Microsoft Dynamics 365 Customer Insights form embedded in
// contact.html. Loaded before Dynamics' FormLoader so the cookie switch and event listeners are in place first.
//   - Cookies: Dynamics sets msdynmkt_formsubmissionid (1 year) after a submission unless
//     window.disableCookiesUsage() returns true. The cookie ties the browser to the visitor's CRM record for
//     marketing, so it is only allowed with a saved Advertising choice in the cookie banner (abs_consent_v1).
//   - /contact/?course=<course title> (from course pages) adds the course to the Comments box.
//   - The form only has the browser's own validation bubbles, so each problem is also written under its
//     field (aria-invalid + aria-describedby) and focus moves to the first one.
//   - Analytics: generate_lead (form_name, course_name) after a successful submission. No personal data.
// The form itself sets the hidden "ABSG Page URL" field to this page's address, including ?course=.
(function () {
    var LOAD_TIMEOUT_MS = 15000;
    var MAX_COURSE = 150;

    window.disableCookiesUsage = function () {
        try {
            var c = JSON.parse(localStorage.getItem('abs_consent_v1'));
            return !(c && c.ads === true);
        } catch (e) {
            return true;
        }
    };

    var course = (new URLSearchParams(window.location.search).get('course') || '')
        .replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_COURSE);
    var loaded = false;
    var pendingFocus = null;
    var invalidCount = 0;

    function q(sel) { return document.querySelector(sel); }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    // Cleared first so the same message is announced again on a second try
    function announce(text) {
        var node = q('[data-contact-status]');
        if (!node) return;
        node.textContent = '';
        setTimeout(function () { node.textContent = text; }, 50);
    }

    function track(event, params) {
        try {
            if (window.absAnalytics) window.absAnalytics.track(event, params);
        } catch (e) {}
    }

    function fieldBlock(input) {
        return input.closest('[data-editorblocktype]') || input.parentNode;
    }

    function labelText(input) {
        var label = input.id ? document.querySelector('label[for="' + input.id + '"]') : null;
        return label ? label.textContent.replace(/\s+/g, ' ').replace(/\*/g, '').trim() : '';
    }

    function message(input) {
        var v = input.validity;
        var name = labelText(input);
        if (v.valueMissing) {
            if (input.type === 'checkbox') return 'Check this box to send your message.';
            if (input.name === 'abs_countryregion') return 'Choose your country.';
            return name ? 'Enter your ' + name.toLowerCase() + '.' : 'This field is required.';
        }
        if (input.type === 'email' && (v.typeMismatch || v.patternMismatch)) {
            return 'Enter an email address like name@company.com.';
        }
        return input.validationMessage || 'Check this field.';
    }

    function describe(input, id, add) {
        var ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (x) { return x && x !== id; });
        if (add) ids.push(id);
        if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
        else input.removeAttribute('aria-describedby');
    }

    function showError(input) {
        var id = (input.id || input.name) + '-error';
        var note = document.getElementById(id);
        if (!note) {
            note = el('p', 'contact-error');
            note.id = id;
            fieldBlock(input).appendChild(note);
        }
        note.textContent = message(input);
        input.setAttribute('aria-invalid', 'true');
        describe(input, id, true);
    }

    function clearError(input) {
        var id = (input.id || input.name) + '-error';
        var note = document.getElementById(id);
        if (note) note.parentNode.removeChild(note);
        input.removeAttribute('aria-invalid');
        describe(input, id, false);
    }

    function onInvalid(e) {
        var input = e.target;
        if (!input || !input.validity) return;
        // The message is shown on the page instead of the browser's bubble, which disappears and covers one field
        e.preventDefault();
        showError(input);
        invalidCount++;
        if (!pendingFocus) {
            pendingFocus = input;
            setTimeout(function () {
                pendingFocus.focus();
                announce(invalidCount === 1 ? '1 field needs your attention.' : invalidCount + ' fields need your attention.');
                pendingFocus = null;
                invalidCount = 0;
            }, 0);
        }
    }

    function onEdit(e) {
        var input = e.target;
        if (input && input.getAttribute && input.getAttribute('aria-invalid') === 'true' && input.validity && input.validity.valid) {
            clearError(input);
        }
    }

    function enhance(form) {
        if (form.dataset.absEnhanced) return;
        form.dataset.absEnhanced = 'true';

        // Placeholders repeat the visible labels ("Business Email *"), and titles such as "Account Name" or
        // "Field label" are read as descriptions that don't match the labels
        Array.prototype.forEach.call(form.querySelectorAll('input, select, textarea, label'), function (node) {
            node.removeAttribute('title');
            if (node.tagName !== 'LABEL') node.removeAttribute('placeholder');
        });
        Array.prototype.forEach.call(form.querySelectorAll('a[target="_blank"]'), function (a) {
            if (!a.querySelector('.sr-only')) a.appendChild(el('span', 'sr-only', ' (opens in a new tab)'));
        });

        form.addEventListener('invalid', onInvalid, true);
        form.addEventListener('input', onEdit, true);
        form.addEventListener('change', onEdit, true);

        if (course) {
            var comments = form.querySelector('textarea[name="description"]');
            if (comments && !comments.value) {
                comments.value = 'I would like to know more about: ' + course;
                comments.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }

    document.addEventListener('d365mkt-afterformload', function (e) {
        loaded = true;
        var loading = q('[data-contact-loading]');
        if (loading) loading.hidden = true;
        var form = (e.target && e.target.querySelector && e.target.querySelector('form')) || q('[data-contact-form] form');
        if (form) enhance(form);
    });

    document.addEventListener('d365mkt-formsubmit', function () {
        announce('Sending your message…');
    });

    document.addEventListener('d365mkt-afterformsubmit', function (e) {
        var ok = !!(e.detail && e.detail.successful);
        var heading = q('#form-title');
        if (ok) {
            track('generate_lead', { form_name: 'contact_us', course_name: course || undefined, link_location: 'contact_form' });
            announce('Thank you. Your message has been sent.');
        } else {
            announce('Your message could not be sent. Please try again or email abstraining@eagle.org.');
        }
        // The form is replaced by Dynamics' result message, so focus would otherwise be lost
        if (heading) {
            heading.setAttribute('tabindex', '-1');
            heading.focus();
        }
    });

    function ready() {
        var note = q('[data-contact-course]');
        if (course && note) {
            note.textContent = 'Your message will mention: ' + course;
            note.hidden = false;
        }
        setTimeout(function () {
            if (loaded) return;
            var loading = q('[data-contact-loading]');
            var fallback = q('[data-contact-fallback]');
            if (loading) loading.hidden = true;
            if (fallback) fallback.hidden = false;
            announce('The contact form could not be loaded. Please email abstraining@eagle.org.');
        }, LOAD_TIMEOUT_MS);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
    else ready();
})();
