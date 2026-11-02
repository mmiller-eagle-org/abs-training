// Cookie consent banner for Google Consent Mode v2.
// Defaults and any saved choice are applied in <head> (_layouts/default.html) before Tag Manager loads;
// this file shows the banner, records the visitor's choice and applies it immediately.
// Stored in localStorage as abs_consent_v1: { v: 1, analytics: bool, ads: bool, ts: ISO date }.
(function () {
    var KEY = 'abs_consent_v1';
    var banner = document.getElementById('consent-banner');
    if (!banner) return;

    var options = banner.querySelector('[data-consent-options]');
    var analyticsBox = banner.querySelector('[name=consent_analytics]');
    var adsBox = banner.querySelector('[name=consent_ads]');
    var customizeButton = banner.querySelector('[data-consent-customize]');
    var saveButton = banner.querySelector('[data-consent-save]');
    var title = banner.querySelector('#consent-title');
    var returnFocus = null;

    function read() {
        try {
            var c = JSON.parse(localStorage.getItem(KEY));
            return c && typeof c.analytics === 'boolean' && typeof c.ads === 'boolean' ? c : null;
        } catch (e) { return null; }
    }

    function write(c) {
        try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
    }

    // GA and Ads cookies live on the registrable domain (.abs-training.com), so try every scope
    function clearCookies(prefix) {
        var host = location.hostname;
        var parts = host.split('.');
        var domains = ['', '; domain=' + host];
        if (parts.length > 1 && !/^\d+$/.test(parts[parts.length - 1])) domains.push('; domain=.' + parts.slice(-2).join('.'));
        document.cookie.split(';').forEach(function (pair) {
            var name = pair.split('=')[0].trim();
            if (name.indexOf(prefix) !== 0) return;
            domains.forEach(function (d) {
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + d;
            });
        });
    }

    function apply(c) {
        var ads = c.ads ? 'granted' : 'denied';
        if (typeof window.gtag === 'function') {
            window.gtag('consent', 'update', {
                analytics_storage: c.analytics ? 'granted' : 'denied',
                ad_storage: ads, ad_user_data: ads, ad_personalization: ads
            });
        }
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: 'consent_update', consent_analytics: c.analytics, consent_ads: c.ads });
        if (!c.analytics) clearCookies('_ga');
        if (!c.ads) {
            clearCookies('_gcl');
            try { localStorage.removeItem('_gcl_ls'); } catch (e) {}
        }
    }

    // Keep fixed-banner space clear so it never covers the page end or a focused element (WCAG 2.4.11)
    function reserveSpace(on) {
        var h = on ? banner.offsetHeight + 'px' : '';
        document.body.style.paddingBottom = h;
        document.documentElement.style.scrollPaddingBottom = h;
    }

    function showOptions(on) {
        options.hidden = !on;
        saveButton.hidden = !on;
        customizeButton.hidden = on;
        customizeButton.setAttribute('aria-expanded', String(on));
        reserveSpace(true);
    }

    function open(trigger) {
        var c = read();
        analyticsBox.checked = !!(c && c.analytics);
        adsBox.checked = !!(c && c.ads);
        banner.hidden = false;
        showOptions(!!trigger);
        if (trigger) {
            returnFocus = trigger;
            title.focus();
        }
    }

    function close() {
        banner.hidden = true;
        showOptions(false);
        reserveSpace(false);
        var target = returnFocus || document.getElementById('main');
        returnFocus = null;
        if (target) target.focus({ preventScroll: true });
    }

    function save(analytics, ads) {
        var c = { v: 1, analytics: analytics, ads: ads, ts: new Date().toISOString() };
        write(c);
        apply(c);
        close();
    }

    banner.querySelector('[data-consent-accept]').addEventListener('click', function () { save(true, true); });
    banner.querySelector('[data-consent-reject]').addEventListener('click', function () { save(false, false); });
    saveButton.addEventListener('click', function () { save(analyticsBox.checked, adsBox.checked); });
    customizeButton.addEventListener('click', function () {
        showOptions(true);
        analyticsBox.focus();
    });

    banner.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && returnFocus && read()) close();
    });

    document.addEventListener('click', function (e) {
        var trigger = e.target.closest && e.target.closest('[data-consent-open]');
        if (trigger) open(trigger);
    });

    window.addEventListener('resize', function () { if (!banner.hidden) reserveSpace(true); });
    // Tailwind's CDN styles the banner after this script runs, so re-measure whenever its size changes
    if (window.ResizeObserver) new ResizeObserver(function () { if (!banner.hidden) reserveSpace(true); }).observe(banner);

    window.absConsent = { open: function () { open(document.activeElement); }, get: read };

    if (!read()) open(null);
})();
