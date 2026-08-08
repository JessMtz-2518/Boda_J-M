/* =========================================================
   JESSICA & MARCOS · UTILIDADES COMPARTIDAS
   Fase 2 · Entrega 2.2
   ========================================================= */

(() => {
  "use strict";

  const readyQueue = [];
  let readyListening = false;
  let readyResolved = document.readyState !== "loading";

  function flushReadyQueue() {
    if (readyResolved) return;
    readyResolved = true;

    while (readyQueue.length) {
      const callback = readyQueue.shift();
      try {
        callback();
      } catch (error) {
        window.setTimeout(() => { throw error; });
      }
    }
  }

  function onReady(callback) {
    if (typeof callback !== "function") return;

    if (readyResolved || document.readyState !== "loading") {
      readyResolved = true;
      callback();
      return;
    }

    readyQueue.push(callback);

    if (!readyListening) {
      readyListening = true;
      document.addEventListener("DOMContentLoaded", flushReadyQueue, {
        once: true
      });
    }
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function debounce(callback, delay = 100) {
    let timer = 0;

    return function debounced(...args) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback.apply(this, args), delay);
    };
  }

  function rafThrottle(callback) {
    let scheduled = false;
    let latestArgs = [];
    let latestContext = null;

    return function throttled(...args) {
      latestArgs = args;
      latestContext = this;

      if (scheduled) return;
      scheduled = true;

      window.requestAnimationFrame(() => {
        scheduled = false;
        callback.apply(latestContext, latestArgs);
      });
    };
  }

  window.InviteUtils = Object.freeze({
    clamp,
    debounce,
    onReady,
    rafThrottle
  });
})();
