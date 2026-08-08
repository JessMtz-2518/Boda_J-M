/* =========================================================
   JESSICA & MARCOS — V3.0.1.1 CINEMATIC ENTRANCE
   Entrada/salida reversible, inicializada cuando el contenido
   principal de la invitación ya es visible.
   ========================================================= */

(() => {
  "use strict";

  const SELECTORS = [
    "#contador",
    "#padres",
    "#detalles",
    "#vestimenta",
    "#regalos",
    "#rsvp",
    "main > footer:last-of-type"
  ];

  let observer = null;
  let initialized = false;

  function getTargets() {
    return SELECTORS.flatMap(selector =>
      Array.from(document.querySelectorAll(selector))
    ).filter((element, index, list) => list.indexOf(element) === index);
  }

  function classifyPosition(element) {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    element.classList.remove("is-cinematic-above", "is-cinematic-below");

    if (rect.bottom <= 0) {
      element.classList.add("is-cinematic-above");
    } else if (rect.top >= viewportHeight) {
      element.classList.add("is-cinematic-below");
    }
  }

  function evaluateNow(targets) {
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    targets.forEach(target => {
      const rect = target.getBoundingClientRect();
      const visiblePixels = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
      const minimumVisible = Math.min(90, Math.max(32, rect.height * 0.08));
      const isVisible = visiblePixels >= minimumVisible;

      target.classList.toggle("is-cinematic-visible", isVisible);

      if (!isVisible) {
        classifyPosition(target);
      } else {
        target.classList.remove("is-cinematic-above", "is-cinematic-below");
      }
    });
  }

  function initialize() {
    if (initialized) return;

    const targets = getTargets();
    if (!targets.length) return;

    initialized = true;

    targets.forEach(target => {
      target.classList.add("cinematic-section");
      classifyPosition(target);
    });

    document.documentElement.classList.add("cinematic-ready");

    if (!("IntersectionObserver" in window)) {
      const fallback = () => evaluateNow(targets);
      window.addEventListener("scroll", fallback, { passive: true });
      window.addEventListener("resize", fallback, { passive: true });
      requestAnimationFrame(fallback);
      return;
    }

    observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          const target = entry.target;
          const isVisible = entry.isIntersecting && entry.intersectionRect.height >= 24;

          target.classList.toggle("is-cinematic-visible", isVisible);

          if (isVisible) {
            target.classList.remove("is-cinematic-above", "is-cinematic-below");
          } else {
            classifyPosition(target);
          }
        });
      },
      {
        threshold: [0, 0.04, 0.1, 0.2],
        rootMargin: "-10% 0px -12% 0px"
      }
    );

    targets.forEach(target => observer.observe(target));

    requestAnimationFrame(() => {
      evaluateNow(targets);
      window.setTimeout(() => evaluateNow(targets), 120);
    });
  }

  function startWhenInvitationIsReady() {
    const main = document.querySelector("main");

    if (main && !main.classList.contains("hidden") && main.getAttribute("aria-hidden") !== "true") {
      initialize();
      return;
    }

    document.addEventListener("invitation:contentvisible", initialize, { once: true });
    document.addEventListener("invitation:opened", initialize, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startWhenInvitationIsReady, { once: true });
  } else {
    startWhenInvitationIsReady();
  }

  window.addEventListener("beforeunload", () => observer?.disconnect(), { once: true });
})();
