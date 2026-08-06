(() => {
  "use strict";

  const { onReady, rafThrottle } = window.InviteUtils;
  const preloaded = new Set();

  function preloadImage(src) {
    if (!src || preloaded.has(src)) return;
    preloaded.add(src);
    const image = new Image();
    image.decoding = "async";
    image.src = src;
  }

  function initializeSmartGalleryPreload() {
    const gallery = document.querySelector("[data-gallery-2027]");
    if (!gallery) return;

    const images = Array.from(gallery.querySelectorAll("img"));
    if (!images.length) return;

    images.slice(0, 3).forEach((image) => preloadImage(image.currentSrc || image.src));

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const index = images.indexOf(entry.target);
          [index - 1, index, index + 1, index + 2]
            .filter((position) => position >= 0 && position < images.length)
            .forEach((position) => {
              const image = images[position];
              preloadImage(image.currentSrc || image.src);
            });
        });
      }, { rootMargin: "350px 0px", threshold: 0.01 });

      images.forEach((image) => observer.observe(image));
    }

    gallery.addEventListener("pointerup", rafThrottle((event) => {
      const image = event.target.closest("img");
      if (!image) return;
      const index = images.indexOf(image);
      [index - 1, index + 1]
        .filter((position) => position >= 0 && position < images.length)
        .forEach((position) => {
          const neighbor = images[position];
          preloadImage(neighbor.currentSrc || neighbor.src);
        });
    }), { passive: true });
  }

  onReady(initializeSmartGalleryPreload);
})();
