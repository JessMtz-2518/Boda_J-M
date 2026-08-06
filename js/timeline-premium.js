/* =========================================================
   JESSICA & MARCOS — TIMELINE PREMIUM V4 / FASE 3
   Línea progresiva y eventos sincronizados
   ========================================================= */

(() => {
  "use strict";

  const { clamp, onReady } = window.InviteUtils;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  const state = {
    section: null,
    timeline: null,
    events: [],
    ticking: false,
    progress: 0,
    activeIndex: -1,
    initialized: false
  };

  function initializeTimelinePremium() {
    if (state.initialized) {
      return;
    }

    state.section = document.querySelector(
      ".timeline-premium-section"
    );
    state.timeline = state.section?.querySelector(
      ".timeline-premium"
    );
    state.events = Array.from(
      state.section?.querySelectorAll(".timeline-event") || []
    );

    if (!state.section || !state.timeline || !state.events.length) {
      return;
    }

    state.initialized = true;

    state.events.forEach((event, index) => {
      event.style.setProperty(
        "--event-delay",
        `${index * 80}ms`
      );
    });

    /*
     * Las cinco tarjetas permanecen visibles. La animación de
     * desplazamiento controla únicamente la línea y el evento activo.
     */
    revealAllEvents();

    if (reducedMotion.matches) {
      revealAllEvents();
      state.section.style.setProperty("--timeline-progress", "1");
      return;
    }

    window.addEventListener(
      "scroll",
      requestTimelineFrame,
      { passive: true }
    );

    window.addEventListener(
      "resize",
      requestTimelineFrame,
      { passive: true }
    );

    observeMainVisibility();
    requestTimelineFrame();
  }

  function observeMainVisibility() {
    const main = document.getElementById("main");

    if (!main || !main.classList.contains("hidden")) {
      requestTimelineFrame();
      return;
    }

    const observer = new MutationObserver(() => {
      if (!main.classList.contains("hidden")) {
        requestTimelineFrame();
        observer.disconnect();
      }
    });

    observer.observe(main, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function requestTimelineFrame() {
    if (state.ticking) {
      return;
    }

    state.ticking = true;

    window.requestAnimationFrame(() => {
      updateTimeline();
      state.ticking = false;
    });
  }

  function updateTimelineGeometry() {
    if (!state.timeline || !state.events.length) {
      return;
    }

    if (window.innerWidth <= 900) {
      state.timeline.style.removeProperty("--timeline-track-left");
      state.timeline.style.removeProperty("--timeline-track-right");
      state.timeline.style.removeProperty("--timeline-track-top");
      return;
    }

    const firstMarker = state.events[0]?.querySelector(".timeline-marker");
    const lastMarker = state.events.at(-1)?.querySelector(".timeline-marker");

    if (!firstMarker || !lastMarker) {
      return;
    }

    const timelineRect = state.timeline.getBoundingClientRect();
    const firstRect = firstMarker.getBoundingClientRect();
    const lastRect = lastMarker.getBoundingClientRect();

    const firstCenterX = firstRect.left - timelineRect.left + firstRect.width / 2;
    const lastCenterX = lastRect.left - timelineRect.left + lastRect.width / 2;
    const centerY = firstRect.top - timelineRect.top + firstRect.height / 2;

    state.timeline.style.setProperty(
      "--timeline-track-left",
      `${Math.max(firstCenterX, 0).toFixed(2)}px`
    );
    state.timeline.style.setProperty(
      "--timeline-track-right",
      `${Math.max(timelineRect.width - lastCenterX, 0).toFixed(2)}px`
    );
    state.timeline.style.setProperty(
      "--timeline-track-top",
      `${Math.max(centerY - 1.5, 0).toFixed(2)}px`
    );
  }

  function updateTimeline() {
    if (!state.section) {
      return;
    }

    updateTimelineGeometry();

    const sectionRect = state.section.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    /*
     * El dibujo comienza cuando la sección entra al 82% de la
     * ventana y termina cuando su parte inferior llega al 24%.
     */
    const startPoint = viewportHeight * .82;
    const endPoint = viewportHeight * .24;
    const travelDistance =
      sectionRect.height + startPoint - endPoint;

    const rawProgress =
      (startPoint - sectionRect.top) /
      Math.max(travelDistance, 1);

    const targetProgress = clamp(rawProgress, 0, 1);

    /*
     * Interpolación ligera para que la línea no tenga saltos
     * incluso en ruedas de mouse o trackpads rápidos.
     */
    state.progress +=
      (targetProgress - state.progress) * .18;

    if (Math.abs(targetProgress - state.progress) < .001) {
      state.progress = targetProgress;
    }

    state.section.style.setProperty(
      "--timeline-progress",
      state.progress.toFixed(4)
    );

    synchronizeEvents(state.progress);

    if (Math.abs(targetProgress - state.progress) > .001) {
      requestTimelineFrame();
    }
  }

  function synchronizeEvents(progress) {
    const count = state.events.length;

    state.events.forEach((event, index) => {
      const markerPosition =
        count === 1 ? 0 : index / (count - 1);

      /*
       * El evento se revela un poco antes de que el brillo llegue
       * exactamente al marcador para mantener continuidad visual.
       */
      const revealThreshold = Math.max(
        markerPosition - .045,
        0
      );

      const isRevealed =
        progress >= revealThreshold ||
        (index === 0 && progress > .015);

      event.classList.add("is-revealed");
      event.dataset.timelineReached = String(isRevealed);
    });

    const calculatedIndex = clamp(
      Math.floor(progress * (count - 1) + .28),
      0,
      count - 1
    );

    const hasEntered = progress > .015;
    const nextActiveIndex = hasEntered
      ? calculatedIndex
      : -1;

    if (nextActiveIndex !== state.activeIndex) {
      state.activeIndex = nextActiveIndex;

      state.events.forEach((event, index) => {
        event.classList.toggle(
          "is-active",
          index === state.activeIndex
        );
      });
    }
  }

  function revealAllEvents() {
    state.events.forEach(event => {
      event.classList.add("is-revealed");
    });

    state.events.at(-1)?.classList.add("is-active");
  }


  onReady(initializeTimelinePremium);

  window.addEventListener(
    "pageshow",
    requestTimelineFrame
  );
})();
