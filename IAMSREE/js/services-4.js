/**
 * Services 04 — GSAP scroll + hover preview
 * Depends on gsap + ScrollTrigger from plugin.js / main.js stack.
 */
(function () {
    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    function whenGsapReady(fn) {
        var tries = 0;
        (function wait() {
            if (typeof gsap !== 'undefined') {
                if (typeof ScrollTrigger !== 'undefined') {
                    gsap.registerPlugin(ScrollTrigger);
                }
                fn();
                return;
            }
            tries += 1;
            if (tries < 40) window.setTimeout(wait, 50);
        })();
    }

    function revealOnScroll(targets, fromVars, toVars, trigger, start) {
        var el = gsap.utils.toArray(targets);
        if (!el.length) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (typeof ScrollTrigger === 'undefined') return;

        gsap.fromTo(
            el,
            fromVars,
            Object.assign(
                {
                    duration: 0.7,
                    ease: 'power2.out',
                    stagger: 0.1,
                    overwrite: 'auto',
                    immediateRender: false,
                    scrollTrigger: {
                        trigger: trigger || el[0],
                        start: start || 'top 88%',
                        once: true,
                        invalidateOnRefresh: true,
                    },
                },
                toVars || {},
            ),
        );
    }

    function initServices4() {
        if (!document.querySelector('[data-svc4-hero], [data-svc4-index], [data-svc4-engage]')) {
            return;
        }

        initIndexHover();
        initHeroParallax();
        initItemStagger();
        initSteps();

        if (typeof ScrollTrigger !== 'undefined') {
            window.requestAnimationFrame(function () {
                ScrollTrigger.refresh();
            });
        }
    }

    /* Floating image: only on collapsed rows; fixed to viewport via body */
    function initIndexHover() {
        var root = document.querySelector('[data-svc4-index]');
        if (!root) return;

        var floatEl = root.querySelector('[data-svc4-float]');
        var floatImg = floatEl && floatEl.querySelector('[data-svc4-float-img]');
        var items = root.querySelectorAll('[data-svc4-item]');
        if (!floatEl || !floatImg || !items.length) return;
        if (!window.matchMedia('(min-width: 992px)').matches) return;

        if (floatEl.parentElement !== document.body) {
            document.body.appendChild(floatEl);
        }

        var offsetX = 28;
        var offsetY = 20;
        var visible = false;

        gsap.set(floatEl, {
            position: 'fixed',
            top: 0,
            left: 0,
            x: 0,
            y: 0,
            xPercent: 0,
            yPercent: 0,
            autoAlpha: 0,
            scale: 0.88,
            pointerEvents: 'none',
            zIndex: 9999,
        });

        var xTo = gsap.quickTo(floatEl, 'x', { duration: 0.4, ease: 'power3.out' });
        var yTo = gsap.quickTo(floatEl, 'y', { duration: 0.4, ease: 'power3.out' });

        function isItemCollapsed(item) {
            var panel = item.querySelector('.collapse');
            if (panel && panel.classList.contains('show')) return false;
            var btn = item.querySelector('[data-bs-toggle="collapse"]');
            if (btn && btn.getAttribute('aria-expanded') === 'true') return false;
            if (btn && !btn.classList.contains('collapsed')) return false;
            return true;
        }

        function placeAt(clientX, clientY) {
            var w = floatEl.offsetWidth || 280;
            var h = floatEl.offsetHeight || 350;
            var pad = 16;
            var x = clientX + offsetX;
            var y = clientY + offsetY;
            if (x + w > window.innerWidth - pad) x = clientX - w - offsetX;
            if (x < pad) x = pad;
            if (y + h > window.innerHeight - pad) y = clientY - h - offsetY;
            if (y < pad) y = pad;
            xTo(x);
            yTo(y);
        }

        function hideFloat() {
            if (!visible) return;
            visible = false;
            gsap.to(floatEl, {
                autoAlpha: 0,
                scale: 0.92,
                duration: 0.28,
                ease: 'power2.in',
                overwrite: 'auto',
            });
        }

        function showFloat(item, clientX, clientY) {
            if (!isItemCollapsed(item)) {
                hideFloat();
                return;
            }
            var preview = item.getAttribute('data-preview');
            if (preview) floatImg.src = preview;
            visible = true;
            placeAt(clientX, clientY);
            gsap.to(floatEl, {
                autoAlpha: 1,
                scale: 1,
                duration: 0.35,
                ease: 'power2.out',
                overwrite: 'auto',
            });
        }

        root.addEventListener('mousemove', function (e) {
            if (!visible) return;
            placeAt(e.clientX, e.clientY);
        });

        items.forEach(function (item) {
            item.addEventListener('mouseenter', function (e) {
                showFloat(item, e.clientX, e.clientY);
            });
            item.addEventListener('mouseleave', hideFloat);

            var panel = item.querySelector('.collapse');
            if (panel) {
                panel.addEventListener('show.bs.collapse', hideFloat);
                panel.addEventListener('shown.bs.collapse', hideFloat);
            }
        });
    }

    function initHeroParallax() {
        if (typeof ScrollTrigger === 'undefined') return;
        var media = document.querySelector('[data-svc4-hero-media]');
        if (!media) return;
        var img = media.querySelector('img');
        if (!img) return;

        gsap.fromTo(
            img,
            { yPercent: -6, scale: 1.08 },
            {
                yPercent: 6,
                scale: 1,
                ease: 'none',
                scrollTrigger: {
                    trigger: media,
                    start: 'top bottom',
                    end: 'bottom top',
                    scrub: true,
                },
            },
        );
    }

    function initItemStagger() {
        var items = document.querySelectorAll('[data-svc4-item]');
        if (items.length) {
            gsap.set(items, { clearProps: 'opacity,visibility,transform' });
        }
        revealOnScroll(
            '[data-svc4-item]',
            { y: 28 },
            { y: 0, duration: 0.7, stagger: 0.1, clearProps: 'transform' },
            '[data-svc4-index]',
            'top 82%',
        );
    }

    function initSteps() {
        var section = document.querySelector('[data-svc4-engage]');
        var steps = document.querySelectorAll('[data-svc4-step]');
        if (!section || !steps.length) return;

        gsap.set(steps, { clearProps: 'opacity,visibility,transform' });

        revealOnScroll(
            steps,
            { y: 32 },
            { y: 0, duration: 0.65, stagger: 0.12, clearProps: 'transform' },
            section.querySelector('.svc4-process') || section,
            'top 88%',
        );
    }

    ready(function () {
        whenGsapReady(function () {
            window.setTimeout(initServices4, 120);
        });
    });
})();
