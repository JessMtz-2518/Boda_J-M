/* =========================================================
   JESSICA & MARCOS — HERO PREMIUM V4 / FASE 2
   Entrada cinematográfica y profundidad interactiva
   ========================================================= */

(() => {
  "use strict";

  const { clamp, onReady } = window.InviteUtils;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  const heroState = {
    hero: null,
    main: null,
    pointerX: 0,
    pointerY: 0,
    targetX: 0,
    targetY: 0,
    scrollProgress: 0,
    frameRequested: false,
    initialized: false
  };

  function initializeHeroPremium() {
    if (heroState.initialized) {
      return;
    }

    heroState.hero = document.querySelector(".hero-premium");
    heroState.main = document.getElementById("main");

    if (!heroState.hero) {
      return;
    }

    heroState.initialized = true;

    watchInvitationOpening();
    initializePointerDepth();
    initializeScrollDepth();

    if (!heroState.main?.classList.contains("hidden")) {
      playHeroEntrance();
    }
  }

  function watchInvitationOpening() {
    if (!heroState.main) {
      playHeroEntrance();
      return;
    }

    if (!heroState.main.classList.contains("hidden")) {
      playHeroEntrance();
      return;
    }

    const observer = new MutationObserver(() => {
      if (!heroState.main.classList.contains("hidden")) {
        playHeroEntrance();
        observer.disconnect();
      }
    });

    observer.observe(heroState.main, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function playHeroEntrance() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        heroState.hero?.classList.add("hero-ready");
        window.PremiumMotionEngine?.refresh?.();
      });
    });
  }

  function initializePointerDepth() {
    if (reducedMotion.matches) {
      return;
    }

    const supportsFinePointer = window.matchMedia(
      "(pointer: fine)"
    ).matches;

    if (!supportsFinePointer) {
      initializeDeviceTilt();
      return;
    }

    heroState.hero.addEventListener(
      "pointermove",
      event => {
        const bounds = heroState.hero.getBoundingClientRect();

        heroState.targetX =
          ((event.clientX - bounds.left) / bounds.width - .5) * 2;

        heroState.targetY =
          ((event.clientY - bounds.top) / bounds.height - .5) * 2;

        requestHeroFrame();
      },
      { passive: true }
    );

    heroState.hero.addEventListener(
      "pointerleave",
      () => {
        heroState.targetX = 0;
        heroState.targetY = 0;
        requestHeroFrame();
      },
      { passive: true }
    );
  }

  function initializeDeviceTilt() {
    /*
     * En móviles no se solicita permiso de sensores.
     * Se utiliza un movimiento ambiental seguro y ligero.
     */
    let phase = 0;

    const ambientMotion = () => {
      if (
        reducedMotion.matches ||
        !heroState.hero ||
        document.hidden
      ) {
        return;
      }

      phase += .012;

      heroState.targetX = Math.sin(phase) * .18;
      heroState.targetY = Math.cos(phase * .82) * .14;

      requestHeroFrame();
      window.requestAnimationFrame(ambientMotion);
    };

    window.requestAnimationFrame(ambientMotion);
  }

  function initializeScrollDepth() {
    if (reducedMotion.matches) {
      return;
    }

    window.addEventListener(
      "scroll",
      () => {
        updateScrollProgress();
        requestHeroFrame();
      },
      { passive: true }
    );

    window.addEventListener(
      "resize",
      () => {
        updateScrollProgress();
        requestHeroFrame();
      },
      { passive: true }
    );

    updateScrollProgress();
  }

  function updateScrollProgress() {
    if (!heroState.hero) {
      return;
    }

    const rect = heroState.hero.getBoundingClientRect();
    const distance = Math.max(rect.height, 1);

    heroState.scrollProgress = clamp(
      -rect.top / distance,
      0,
      1
    );
  }

  function requestHeroFrame() {
    if (heroState.frameRequested) {
      return;
    }

    heroState.frameRequested = true;

    window.requestAnimationFrame(() => {
      renderHeroDepth();
      heroState.frameRequested = false;
    });
  }

  function renderHeroDepth() {
    if (!heroState.hero) {
      return;
    }

    /*
     * Interpolación para evitar movimientos bruscos.
     */
    heroState.pointerX +=
      (heroState.targetX - heroState.pointerX) * .075;

    heroState.pointerY +=
      (heroState.targetY - heroState.pointerY) * .075;

    const x = heroState.pointerX;
    const y = heroState.pointerY;
    const scroll = heroState.scrollProgress;

    heroState.hero.style.setProperty(
      "--hero-pointer-x",
      x.toFixed(4)
    );

    heroState.hero.style.setProperty(
      "--hero-pointer-y",
      y.toFixed(4)
    );

    heroState.hero.style.setProperty(
      "--hero-scroll-progress",
      scroll.toFixed(4)
    );

    heroState.hero.style.setProperty(
      "--hero-depth-back-x",
      `${(x * 8).toFixed(2)}px`
    );

    heroState.hero.style.setProperty(
      "--hero-depth-back-y",
      `${(y * 6 + scroll * 8).toFixed(2)}px`
    );

    heroState.hero.style.setProperty(
      "--hero-depth-front-x",
      `${(x * 17).toFixed(2)}px`
    );

    heroState.hero.style.setProperty(
      "--hero-depth-front-y",
      `${(y * 13 + scroll * 17).toFixed(2)}px`
    );

    heroState.hero.style.setProperty(
      "--hero-content-x",
      `${(x * -4).toFixed(2)}px`
    );

    heroState.hero.style.setProperty(
      "--hero-content-y",
      `${(y * -3 + scroll * -8).toFixed(2)}px`
    );

    const stillMoving =
      Math.abs(heroState.targetX - heroState.pointerX) > .001 ||
      Math.abs(heroState.targetY - heroState.pointerY) > .001;

    if (stillMoving) {
      requestHeroFrame();
    }
  }


  onReady(initializeHeroPremium);

  window.addEventListener(
    "pageshow",
    () => {
      updateScrollProgress();
      requestHeroFrame();
    }
  );
})();
