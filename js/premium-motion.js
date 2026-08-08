/* =========================================================
   JESSICA & MARCOS — PREMIUM MOTION ENGINE V4 / FASE 1
   Un solo motor para animaciones, parallax y rendimiento
   ========================================================= */

(() => {
  "use strict";

  const { clamp, onReady } = window.InviteUtils;

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  const state = {
    observer: null,
    ticking: false,
    lastScrollY: 0,
    hero: null,
    footer: null,
    initialized: false
  };

  const MOTION_GROUPS = [
    {
      section: "#contador",
      items:
        ".section-title, .countdown > div, .ornament",
      effect: "up",
      delay: 105
    },
    {
      section: "#padres",
      items:
        ".section-title, .parents-intro, .parents-card",
      effects: ["up", "up", "left", "right"],
      delay: 130
    },
    {
      section: "#detalles",
      items:
        ".section-title, .leaf-mark, .details-grid article, .btn.map",
      effect: "up",
      delay: 105
    },
    {
      section: "#itinerario",
      items:
        ".section-title, .timeline > div",
      effect: "up",
      delay: 125
    },
    {
      section: "#galeria",
      items:
        ".section-title, .photos img, .hint",
      effect: "zoom",
      delay: 65
    },
    {
      section: ".nav-strip",
      items: "a",
      effect: "up",
      delay: 75
    },
    {
      section: "#vestimenta",
      items: "> div",
      effects: ["left", "right"],
      delay: 140
    },
    {
      section: "#regalos",
      items: "> div",
      effects: ["left", "right"],
      delay: 140
    },
    {
      section: "#rsvp",
      items:
        ".script-title, .subtitle, form > *, .form-msg",
      effect: "up",
      delay: 90
    }
  ];

  function initializePremiumMotion() {
    if (state.initialized) {
      return;
    }

    state.initialized = true;
    state.hero = document.querySelector(".hero");
    state.footer = document.querySelector("footer");

    prepareHero();
    prepareMotionGroups();
    prepareFooter();
    initializeObserver();
    initializeParallax();
    forceInitialEvaluation();
  }

  function prepareHero() {
    state.hero?.classList.add("motion-section");
  }

  function prepareMotionGroups() {
    MOTION_GROUPS.forEach(group => {
      const section = document.querySelector(group.section);

      if (!section) {
        return;
      }

      section.classList.add("motion-section");

      let items = [];

      if (group.items.startsWith(">")) {
        items = Array.from(section.children).filter(element =>
          element.matches(group.items.slice(1).trim())
        );
      } else {
        items = Array.from(section.querySelectorAll(group.items));
      }

      items.forEach((item, index) => {
        const effect = group.effects
          ? group.effects[index % group.effects.length]
          : group.effect;

        item.classList.add("motion-item");
        item.dataset.motion = effect || "up";
        item.style.setProperty(
          "--motion-delay",
          `${index * (group.delay || 90)}ms`
        );
      });
    });
  }

  function prepareFooter() {
    if (!state.footer) {
      return;
    }

    state.footer.classList.add("motion-section");

    Array.from(state.footer.children).forEach((element, index) => {
      element.classList.add("footer-motion-item");
      element.style.transitionDelay = `${index * 130}ms`;
    });
  }

  function initializeObserver() {
    const sections = Array.from(
      document.querySelectorAll(".motion-section")
    );

    if (
      !("IntersectionObserver" in window) ||
      prefersReducedMotion.matches
    ) {
      document.documentElement.classList.add(
        "no-intersection-observer"
      );

      sections.forEach(section => {
        section.classList.add("is-in-view");
      });

      return;
    }

    state.observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          /*
           * Se repite al bajar y al subir:
           * entra = anima, sale = se prepara de nuevo.
           */
          entry.target.classList.toggle(
            "is-in-view",
            entry.isIntersecting
          );
        });
      },
      {
        threshold: 0.06,
        rootMargin: "4% 0px -4% 0px"
      }
    );

    sections.forEach(section => {
      state.observer.observe(section);
    });
  }

  function initializeParallax() {
    if (prefersReducedMotion.matches) {
      return;
    }

    state.lastScrollY = window.scrollY;

    window.addEventListener(
      "scroll",
      requestParallaxFrame,
      { passive: true }
    );

    window.addEventListener(
      "resize",
      requestParallaxFrame,
      { passive: true }
    );

    requestParallaxFrame();
  }

  function requestParallaxFrame() {
    state.lastScrollY = window.scrollY;

    if (state.ticking) {
      return;
    }

    state.ticking = true;

    window.requestAnimationFrame(() => {
      updateParallax();
      ensureFooterVisibility();
      state.ticking = false;
    });
  }

  function updateParallax() {
    if (!state.hero) {
      return;
    }

    const heroRect = state.hero.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    if (
      heroRect.bottom < 0 ||
      heroRect.top > viewportHeight
    ) {
      return;
    }

    const progress = clamp(
      (viewportHeight - heroRect.top) /
      (viewportHeight + heroRect.height),
      0,
      1
    );

    const backgroundOffset = (progress - .5) * 34;
    const textOffset = (progress - .5) * -18;

    state.hero.style.setProperty(
      "--hero-parallax-y",
      `${backgroundOffset.toFixed(2)}px`
    );

    state.hero.style.setProperty(
      "--hero-text-parallax-y",
      `${textOffset.toFixed(2)}px`
    );
  }

  function ensureFooterVisibility() {
    if (!state.footer) {
      return;
    }

    const nearBottom =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 40;

    if (nearBottom) {
      state.footer.classList.add("is-in-view");
    }
  }

  function forceInitialEvaluation() {
    window.requestAnimationFrame(() => {
      requestParallaxFrame();

      /*
       * El contenido principal aparece después de abrir el sobre.
       * Esta revisión garantiza que el observador detecte correctamente
       * las secciones al pasar de display:none a visible.
       */
      const main = document.getElementById("main");

      if (!main) {
        return;
      }

      const mainVisibilityObserver = new MutationObserver(() => {
        if (!main.classList.contains("hidden")) {
          refreshPremiumMotion();
          mainVisibilityObserver.disconnect();
        }
      });

      if (main.classList.contains("hidden")) {
        mainVisibilityObserver.observe(main, {
          attributes: true,
          attributeFilter: ["class"]
        });
      } else {
        refreshPremiumMotion();
      }
    });
  }

  function refreshPremiumMotion() {
    document
      .querySelectorAll(".motion-section")
      .forEach(section => {
        state.observer?.unobserve(section);
        state.observer?.observe(section);
      });

    requestParallaxFrame();
  }


  onReady(initializePremiumMotion);

  window.addEventListener(
    "pageshow",
    requestParallaxFrame
  );

  prefersReducedMotion.addEventListener?.(
    "change",
    () => {
      window.location.reload();
    }
  );

  window.PremiumMotionEngine = Object.freeze({
    refresh: refreshPremiumMotion
  });
})();
