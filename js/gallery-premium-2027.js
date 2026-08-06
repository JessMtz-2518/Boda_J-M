/**
 * Gallery Premium 2027 · Entrega 4
 * Carrusel con flechas, teclado, swipe táctil y drag con mouse o pluma.
 * Incluye visor ampliado accesible para abrir las fotografías.
 */
(() => {
  "use strict";

  class GalleryPremium2027 {
    constructor(root) {
      this.root = root;
      this.viewport = root.querySelector(".gallery-2027__viewport");
      this.track = root.querySelector(".gallery-2027__track");
      this.slides = Array.from(root.querySelectorAll(".gallery-2027__slide"));
      this.previousButton = root.querySelector(".gallery-2027__arrow--prev");
      this.nextButton = root.querySelector(".gallery-2027__arrow--next");
      this.counter = root.querySelector(".gallery-2027__counter");
      this.progressBar = root.querySelector(".gallery-2027__progress-bar");

      this.currentIndex = 0;
      this.scrollTimer = 0;
      this.prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

      this.drag = {
        pointerId: null,
        pointerType: "",
        startX: 0,
        startY: 0,
        lastX: 0,
        lastTime: 0,
        startScrollLeft: 0,
        velocity: 0,
        axis: null,
        active: false,
        moved: false
      };

      this.suppressClickUntil = 0;

      this.onPrevious = () => this.goTo(this.currentIndex - 1);
      this.onNext = () => this.goTo(this.currentIndex + 1);
      this.onScroll = () => this.handleScroll();
      this.onKeyDown = (event) => this.handleKeyDown(event);
      this.onResize = () => this.refresh();
      this.onPointerDown = (event) => this.handlePointerDown(event);
      this.onPointerMove = (event) => this.handlePointerMove(event);
      this.onPointerUp = (event) => this.handlePointerEnd(event);
      this.onPointerCancel = (event) => this.handlePointerEnd(event, true);
      this.onLostPointerCapture = (event) => this.handlePointerEnd(event, true);
      this.onClickCapture = (event) => this.handleClickCapture(event);
    }

    init() {
      if (!this.viewport || !this.track || this.slides.length === 0) {
        this.root.dataset.galleryState = "error";
        return false;
      }

      this.previousButton?.removeAttribute("disabled");
      this.nextButton?.removeAttribute("disabled");

      this.previousButton?.addEventListener("click", this.onPrevious);
      this.nextButton?.addEventListener("click", this.onNext);
      this.viewport.addEventListener("scroll", this.onScroll, { passive: true });
      this.viewport.addEventListener("keydown", this.onKeyDown);
      this.viewport.addEventListener("pointerdown", this.onPointerDown);
      this.viewport.addEventListener("pointermove", this.onPointerMove, { passive: false });
      this.viewport.addEventListener("pointerup", this.onPointerUp);
      this.viewport.addEventListener("pointercancel", this.onPointerCancel);
      this.viewport.addEventListener("lostpointercapture", this.onLostPointerCapture);
      this.viewport.addEventListener("click", this.onClickCapture, true);

      if ("ResizeObserver" in window) {
        this.resizeObserver = new ResizeObserver(this.onResize);
        this.resizeObserver.observe(this.viewport);
      } else {
        window.addEventListener("resize", this.onResize, { passive: true });
      }

      this.root.dataset.galleryPhase = "4";
      this.root.dataset.galleryState = "ready";
      this.updateInterface();
      return true;
    }

    clampIndex(index) {
      return Math.min(Math.max(index, 0), this.slides.length - 1);
    }

    getSlideTarget(index) {
      const slide = this.slides[index];
      const viewportWidth = this.viewport.clientWidth;
      const target = slide.offsetLeft - (viewportWidth - slide.offsetWidth) / 2;
      const maxScroll = Math.max(0, this.viewport.scrollWidth - viewportWidth);
      return Math.min(Math.max(target, 0), maxScroll);
    }

    goTo(index, options = {}) {
      const nextIndex = this.clampIndex(index);
      const behavior = options.instant || this.prefersReducedMotion.matches ? "auto" : "smooth";

      this.currentIndex = nextIndex;
      this.viewport.scrollTo({
        left: this.getSlideTarget(nextIndex),
        behavior
      });
      this.updateInterface();
    }

    previous() {
      this.goTo(this.currentIndex - 1);
    }

    next() {
      this.goTo(this.currentIndex + 1);
    }

    handleKeyDown(event) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.previous();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        this.next();
      } else if (event.key === "Home") {
        event.preventDefault();
        this.goTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        this.goTo(this.slides.length - 1);
      }
    }

    handlePointerDown(event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (this.drag.pointerId !== null) return;

      this.drag.pointerId = event.pointerId;
      this.drag.pointerType = event.pointerType;
      this.drag.startX = event.clientX;
      this.drag.startY = event.clientY;
      this.drag.lastX = event.clientX;
      this.drag.lastTime = performance.now();
      this.drag.startScrollLeft = this.viewport.scrollLeft;
      this.drag.velocity = 0;
      this.drag.axis = null;
      this.drag.active = true;
      this.drag.moved = false;

      /*
       * No capturamos el puntero todavía.
       * Si se captura desde pointerdown, el navegador puede enviar el click final
       * al viewport en lugar de a la tarjeta y el visor nunca recibe el clic.
       * La captura se activa únicamente cuando confirmamos un arrastre horizontal.
       */
      this.viewport.classList.add("is-pointer-down");
    }

    handlePointerMove(event) {
      if (!this.drag.active || event.pointerId !== this.drag.pointerId) return;

      const deltaX = event.clientX - this.drag.startX;
      const deltaY = event.clientY - this.drag.startY;

      if (!this.drag.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 7) {
        this.drag.axis = Math.abs(deltaX) > Math.abs(deltaY) * 1.1 ? "x" : "y";

        if (this.drag.axis === "x") {
          this.viewport.setPointerCapture?.(event.pointerId);
          this.viewport.classList.add("is-dragging");
        }
      }

      if (this.drag.axis !== "x") return;

      event.preventDefault();
      const now = performance.now();
      const elapsed = Math.max(1, now - this.drag.lastTime);
      const movement = event.clientX - this.drag.lastX;

      this.drag.velocity = movement / elapsed;
      this.drag.lastX = event.clientX;
      this.drag.lastTime = now;
      this.drag.moved = this.drag.moved || Math.abs(deltaX) > 8;
      this.viewport.scrollLeft = this.drag.startScrollLeft - deltaX;
    }

    handlePointerEnd(event, cancelled = false) {
      if (!this.drag.active || event.pointerId !== this.drag.pointerId) return;

      const wasHorizontal = this.drag.axis === "x";
      const deltaX = event.clientX - this.drag.startX;
      const velocity = this.drag.velocity;

      if (this.viewport.hasPointerCapture?.(event.pointerId)) {
        this.viewport.releasePointerCapture(event.pointerId);
      }

      this.viewport.classList.remove("is-pointer-down", "is-dragging");

      if (wasHorizontal && this.drag.moved) {
        this.suppressClickUntil = performance.now() + 350;

        if (!cancelled) {
          const distanceThreshold = Math.min(110, this.viewport.clientWidth * 0.13);
          const velocityThreshold = 0.35;
          let targetIndex = this.findClosestSlide();

          if (Math.abs(deltaX) >= distanceThreshold || Math.abs(velocity) >= velocityThreshold) {
            targetIndex = deltaX < 0 || velocity < -velocityThreshold
              ? this.currentIndex + 1
              : this.currentIndex - 1;
          }

          this.goTo(targetIndex);
        } else {
          this.goTo(this.findClosestSlide());
        }
      }

      this.resetDrag();
    }

    resetDrag() {
      this.drag.pointerId = null;
      this.drag.pointerType = "";
      this.drag.axis = null;
      this.drag.active = false;
      this.drag.moved = false;
      this.drag.velocity = 0;
    }

    handleClickCapture(event) {
      if (performance.now() < this.suppressClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    handleScroll() {
      if (this.drag.active && this.drag.axis === "x") return;

      window.clearTimeout(this.scrollTimer);
      this.scrollTimer = window.setTimeout(() => {
        this.currentIndex = this.findClosestSlide();
        this.updateInterface();
      }, 80);
    }

    findClosestSlide() {
      const viewportCenter = this.viewport.scrollLeft + this.viewport.clientWidth / 2;
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      this.slides.forEach((slide, index) => {
        const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
        const distance = Math.abs(slideCenter - viewportCenter);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      return nearestIndex;
    }

    updateInterface() {
      const total = this.slides.length;
      const current = this.currentIndex + 1;
      const pad = String(total).length;

      this.slides.forEach((slide, index) => {
        const isActive = index === this.currentIndex;
        slide.classList.toggle("is-active", isActive);
        slide.setAttribute("aria-current", isActive ? "true" : "false");
      });

      if (this.previousButton) this.previousButton.disabled = this.currentIndex === 0;
      if (this.nextButton) this.nextButton.disabled = this.currentIndex === total - 1;

      if (this.counter) {
        this.counter.innerHTML = `<span>${String(current).padStart(pad, "0")}</span><span aria-hidden="true"> / </span><span>${String(total).padStart(pad, "0")}</span>`;
      }

      if (this.progressBar) {
        this.progressBar.style.width = `${(current / total) * 100}%`;
      }

      this.root.style.setProperty("--gallery-2027-current", String(this.currentIndex));
    }

    refresh() {
      if (!this.viewport.clientWidth) return;
      this.goTo(this.currentIndex, { instant: true });
    }
  }

  const galleries = Array.from(document.querySelectorAll("[data-gallery-2027]"));
  const instances = galleries
    .map((gallery) => new GalleryPremium2027(gallery))
    .filter((instance) => instance.init());

  window.GalleryPremium2027 = GalleryPremium2027;
  window.galleryPremium2027Instances = instances;

  console.info(`Gallery Premium 2027 · Entrega 5.2 estable (${instances.length} instancia${instances.length === 1 ? "" : "s"}).`);
})();

/**
 * Entrega 4 · Visor accesible de fotografías
 * Se integra sobre la estructura existente sin archivos HTML adicionales.
 */
(() => {
  "use strict";

  const cards = Array.from(document.querySelectorAll(".gallery-2027__card"));
  if (!cards.length) return;

  const photos = cards.map((card) => {
    const image = card.querySelector(".gallery-2027__image");
    return {
      src: image?.getAttribute("src") || image?.currentSrc || image?.src || "",
      alt: image?.alt || "Fotografía de la galería"
    };
  });

  const lightbox = document.createElement("div");
  lightbox.className = "gallery-viewer";
  lightbox.hidden = true;
  lightbox.setAttribute("aria-hidden", "true");
  lightbox.innerHTML = `
    <div class="gallery-viewer__backdrop" data-viewer-close></div>
    <section class="gallery-viewer__dialog" role="dialog" aria-modal="true" aria-labelledby="galleryViewerTitle" tabindex="-1">
      <h2 id="galleryViewerTitle" class="gallery-viewer__sr-only">Visor de fotografías</h2>
      <button class="gallery-viewer__close" type="button" aria-label="Cerrar fotografía" data-viewer-close>×</button>
      <button class="gallery-viewer__arrow gallery-viewer__arrow--prev" type="button" aria-label="Fotografía anterior">‹</button>
      <figure class="gallery-viewer__figure">
        <div class="gallery-viewer__loading" aria-hidden="true"></div>
        <img class="gallery-viewer__image" src="" alt="" draggable="false">
        <figcaption class="gallery-viewer__caption" aria-live="polite"></figcaption>
      </figure>
      <button class="gallery-viewer__arrow gallery-viewer__arrow--next" type="button" aria-label="Fotografía siguiente">›</button>
    </section>`;

  document.body.appendChild(lightbox);

  const dialog = lightbox.querySelector(".gallery-viewer__dialog");
  const viewerImage = lightbox.querySelector(".gallery-viewer__image");
  const caption = lightbox.querySelector(".gallery-viewer__caption");
  const previousButton = lightbox.querySelector(".gallery-viewer__arrow--prev");
  const nextButton = lightbox.querySelector(".gallery-viewer__arrow--next");
  const loading = lightbox.querySelector(".gallery-viewer__loading");
  const focusableSelector = "button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

  let currentIndex = 0;
  let lastFocusedElement = null;
  let closingTimer = 0;

  function formatNumber(value) {
    return String(value).padStart(String(photos.length).length, "0");
  }

  function showPhoto(index) {
    currentIndex = (index + photos.length) % photos.length;
    const photo = photos[currentIndex];

    loading.classList.add("is-visible");
    viewerImage.classList.remove("is-loaded");
    viewerImage.alt = photo.alt;
    caption.textContent = `${formatNumber(currentIndex + 1)} / ${formatNumber(photos.length)}`;

    viewerImage.onload = () => {
      loading.classList.remove("is-visible");
      viewerImage.classList.add("is-loaded");
    };
    viewerImage.onerror = () => {
      loading.classList.remove("is-visible");
      caption.textContent = "No fue posible cargar esta fotografía";
    };
    viewerImage.src = photo.src;

    previousButton.disabled = photos.length < 2;
    nextButton.disabled = photos.length < 2;
  }

  function openViewer(index, trigger) {
    window.clearTimeout(closingTimer);
    lastFocusedElement = trigger || document.activeElement;
    showPhoto(index);
    lightbox.hidden = false;
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("gallery-viewer-open");
    requestAnimationFrame(() => {
      lightbox.classList.add("is-open");
      dialog.focus({ preventScroll: true });
    });
  }

  function closeViewer() {
    if (lightbox.hidden) return;
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("gallery-viewer-open");
    closingTimer = window.setTimeout(() => {
      lightbox.hidden = true;
      viewerImage.removeAttribute("src");
      lastFocusedElement?.focus?.({ preventScroll: true });
    }, 240);
  }

  function previousPhoto() {
    showPhoto(currentIndex - 1);
  }

  function nextPhoto() {
    showPhoto(currentIndex + 1);
  }

  function trapFocus(event) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll(focusableSelector));
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  cards.forEach((card) => {
    card.disabled = false;
    card.removeAttribute("disabled");
    card.setAttribute("aria-haspopup", "dialog");
  });

  // Escuchamos el clic desde document en fase de captura. Así el visor se abre
  // antes de que el controlador de drag del carrusel pueda cancelar el evento.
  document.addEventListener("click", (event) => {
    const card = event.target.closest?.(".gallery-2027__card");
    if (!card) return;

    const index = cards.indexOf(card);
    if (index < 0) return;

    event.preventDefault();
    event.stopPropagation();
    openViewer(index, card);
  }, true);

  lightbox.querySelectorAll("[data-viewer-close]").forEach((element) => {
    element.addEventListener("click", closeViewer);
  });

  previousButton.addEventListener("click", previousPhoto);
  nextButton.addEventListener("click", nextPhoto);

  document.addEventListener("keydown", (event) => {
    if (lightbox.hidden) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeViewer();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      previousPhoto();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nextPhoto();
    } else {
      trapFocus(event);
    }
  });
})();


/**
 * Entrega 2.6.1.2 · Autoplay robusto
 * Controlador desacoplado del motor del carrusel para conservar intacta la
 * navegación manual, el drag, el swipe, el teclado y el visor ampliado.
 */
(() => {
  "use strict";

  const AUTOPLAY_DELAY = 4000;
  const MANUAL_PAUSE = 6000;
  const instances = window.galleryPremium2027Instances || [];

  if (!instances.length) return;

  instances.forEach((instance) => {
    const root = instance.root;
    let timer = 0;
    let pausedUntil = 0;

    const isActuallyVisible = () => {
      const rect = root.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
      return rect.width > 0 && rect.height > 0 && visibleHeight >= 60;
    };

    const canAdvance = () => {
      return !document.hidden
        && performance.now() >= pausedUntil
        && !document.body.classList.contains("gallery-viewer-open")
        && !instance.drag?.active
        && isActuallyVisible();
    };

    const clearTimer = () => {
      window.clearTimeout(timer);
      timer = 0;
    };

    const schedule = (delay = AUTOPLAY_DELAY) => {
      clearTimer();
      timer = window.setTimeout(tick, delay);
    };

    const tick = () => {
      timer = 0;

      if (canAdvance()) {
        const nextIndex = instance.currentIndex >= instance.slides.length - 1
          ? 0
          : instance.currentIndex + 1;
        instance.goTo(nextIndex, { autoplay: true });
      }

      schedule(AUTOPLAY_DELAY);
    };

    const pauseForManualUse = () => {
      pausedUntil = performance.now() + MANUAL_PAUSE;
      schedule(MANUAL_PAUSE);
    };

    // Cualquier gesto manual conserva prioridad sobre el autoplay.
    root.addEventListener("pointerdown", pauseForManualUse, { passive: true });
    root.addEventListener("touchstart", pauseForManualUse, { passive: true });
    root.addEventListener("wheel", pauseForManualUse, { passive: true });
    root.addEventListener("keydown", pauseForManualUse);

    instance.previousButton?.addEventListener("click", pauseForManualUse);
    instance.nextButton?.addEventListener("click", pauseForManualUse);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearTimer();
      else schedule(1000);
    });

    // Exponer controles mínimos para diagnóstico sin alterar la interfaz.
    instance.autoplayController = {
      start: () => schedule(250),
      stop: clearTimer,
      pause: pauseForManualUse,
      isVisible: isActuallyVisible
    };

    schedule(1500);
  });

  console.info(`Gallery Premium 2027 · Autoplay robusto 2.6.1.2 activo (${instances.length} instancia${instances.length === 1 ? "" : "s"}).`);
})();
