/**
 * Invitación Web V5 · Entrega 2.5.2
 * Sistema de Iluminación Premium
 */
(() => {
  "use strict";

  const layer = document.getElementById("sparkleLayer");
  if (!layer) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reducedMotion.matches) return;

  const state = {
    started: false,
    paused: false,
    sparkleTimer: 0,
    resizeTimer: 0,
    activeSparkles: 0,
    config: null,
    layers: {}
  };

  const random = (min, max) => Math.random() * (max - min) + min;
  const randomInt = (min, max) => Math.floor(random(min, max + 1));

  function getConfig() {
    const width = window.innerWidth;
    if (width <= 700) {
      return { glowCount: 2, particleCount: 16, maxSparkles: 4, sparkleDelay: [1100, 1900] };
    }
    if (width <= 1100) {
      return { glowCount: 3, particleCount: 26, maxSparkles: 5, sparkleDelay: [950, 1700] };
    }
    return { glowCount: 4, particleCount: 38, maxSparkles: 7, sparkleDelay: [800, 1450] };
  }

  function createLayer(className) {
    const node = document.createElement("div");
    node.className = className;
    node.setAttribute("aria-hidden", "true");
    return node;
  }

  function setupLayers() {
    layer.replaceChildren();
    layer.classList.add("premium-atmosphere");

    state.layers.glow = createLayer("atmosphere-glow-layer");
    state.layers.particle = createLayer("atmosphere-particle-layer");
    state.layers.sparkle = createLayer("atmosphere-sparkle-layer");

    layer.append(state.layers.glow, state.layers.particle, state.layers.sparkle);
  }

  function buildGlows() {
    const fragment = document.createDocumentFragment();
    const positions = [
      [14, 18], [84, 26], [24, 82], [82, 78]
    ];

    for (let i = 0; i < state.config.glowCount; i += 1) {
      const glow = document.createElement("span");
      const [x, y] = positions[i] || [random(12, 88), random(12, 88)];
      glow.className = "atmosphere-glow";
      glow.style.setProperty("--glow-x", `${x + random(-4, 4)}%`);
      glow.style.setProperty("--glow-y", `${y + random(-5, 5)}%`);
      glow.style.setProperty("--glow-size", `${random(34, 52)}vmax`);
      glow.style.setProperty("--glow-duration", `${random(20, 31).toFixed(1)}s`);
      glow.style.setProperty("--glow-delay", `${random(-12, 0).toFixed(1)}s`);
      fragment.appendChild(glow);
    }
    state.layers.glow.replaceChildren(fragment);
  }

  function buildParticles() {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < state.config.particleCount; i += 1) {
      const particle = document.createElement("span");
      particle.className = "atmosphere-particle";
      particle.style.left = `${random(4, 96).toFixed(2)}%`;
      particle.style.top = `${random(5, 95).toFixed(2)}%`;
      particle.style.setProperty("--particle-size", `${random(1, 2.7).toFixed(2)}px`);
      particle.style.setProperty("--particle-duration", `${random(10, 18).toFixed(1)}s`);
      particle.style.setProperty("--particle-delay", `${random(-18, 0).toFixed(1)}s`);
      particle.style.setProperty("--particle-drift-x", `${random(-18, 18).toFixed(1)}px`);
      particle.style.setProperty("--particle-drift-y", `${random(-42, -18).toFixed(1)}px`);
      particle.style.setProperty("--particle-opacity", random(.18, .48).toFixed(2));
      fragment.appendChild(particle);
    }
    state.layers.particle.replaceChildren(fragment);
  }

  function createSparkle() {
    if (state.paused || document.hidden || state.activeSparkles >= state.config.maxSparkles) return;

    const sparkle = document.createElement("span");
    const ray = document.createElement("span");
    const duration = random(3.6, 5.2);

    sparkle.className = "atmosphere-sparkle";
    ray.className = "atmosphere-sparkle-ray";
    sparkle.appendChild(ray);

    sparkle.style.left = `${random(5, 95).toFixed(2)}%`;
    sparkle.style.top = `${random(7, 93).toFixed(2)}%`;
    sparkle.style.setProperty("--sparkle-size", `${random(22, window.innerWidth <= 700 ? 34 : 48).toFixed(1)}px`);
    sparkle.style.setProperty("--sparkle-duration", `${duration.toFixed(2)}s`);
    sparkle.style.setProperty("--sparkle-opacity", random(.52, .82).toFixed(2));
    sparkle.style.setProperty("--sparkle-rotation", `${random(-22, 22).toFixed(1)}deg`);

    state.activeSparkles += 1;
    state.layers.sparkle.appendChild(sparkle);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      sparkle.remove();
      state.activeSparkles = Math.max(0, state.activeSparkles - 1);
    };
    sparkle.addEventListener("animationend", cleanup, { once: true });
    window.setTimeout(cleanup, duration * 1000 + 250);
  }

  function scheduleSparkle() {
    window.clearTimeout(state.sparkleTimer);
    if (state.paused) return;
    const [min, max] = state.config.sparkleDelay;
    state.sparkleTimer = window.setTimeout(() => {
      createSparkle();
      scheduleSparkle();
    }, randomInt(min, max));
  }

  function setPaused(value) {
    state.paused = Boolean(value);
    layer.classList.toggle("is-paused", state.paused);
    if (state.paused) {
      window.clearTimeout(state.sparkleTimer);
    } else if (state.started) {
      scheduleSparkle();
    }
  }

  function rebuild() {
    state.config = getConfig();
    buildGlows();
    buildParticles();
    scheduleSparkle();
  }

  function start() {
    if (state.started) return;
    state.started = true;
    setupLayers();
    rebuild();

    requestAnimationFrame(() => layer.classList.add("is-active"));

    for (let i = 0; i < Math.min(4, state.config.maxSparkles); i += 1) {
      window.setTimeout(createSparkle, 250 + (i * 420));
    }
  }

  document.addEventListener("visibilitychange", () => setPaused(document.hidden));

  window.addEventListener("resize", () => {
    window.clearTimeout(state.resizeTimer);
    state.resizeTimer = window.setTimeout(rebuild, 250);
  }, { passive: true });

  // El sistema espera a que la invitación principal sea visible.
  const main = document.getElementById("main");
  if (!main || !main.classList.contains("hidden")) {
    start();
  } else {
    const observer = new MutationObserver(() => {
      if (!main.classList.contains("hidden")) {
        observer.disconnect();
        start();
      }
    });
    observer.observe(main, { attributes: true, attributeFilter: ["class"] });
  }

  window.PremiumAtmosphere = Object.freeze({ pause: () => setPaused(true), resume: () => setPaused(false) });
})();
