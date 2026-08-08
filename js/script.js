/**
 * ============================================================
 * INVITACIÓN WEB · JESSICA & MARCOS
 * SCRIPT.JS RECONSTRUIDO · PARTE 1 DE 3
 * ============================================================
 *
 * Incluye:
 *  1. Estructura base y espacio de nombres
 *  2. Configuración global
 *  3. Estado compartido
 *  4. Inicialización segura
 *  5. Helpers reutilizables
 *  6. Apertura del sobre
 *  7. Control de música
 *
 * Las partes 2 y 3 podrán añadirse debajo de este bloque.
 * Cada parte extenderá window.InvitationApp sin duplicar lógica.
 * ============================================================
 */

(() => {
  "use strict";

  /* ============================================================
     1. ESPACIO DE NOMBRES
     ============================================================ */

  const App = window.InvitationApp || {};

  window.InvitationApp = App;

  App.version = "5.0.0";
  App.modules = App.modules || {};
  App.state = App.state || {};
  App.elements = App.elements || {};
  App.helpers = App.helpers || {};
  App.hooks = App.hooks || {
    beforeInit: [],
    afterInit: [],
    invitationOpening: [],
    invitationOpened: []
  };


  /* ============================================================
     2. CONFIGURACIÓN GLOBAL
     ============================================================ */

  App.config = Object.freeze({
    event: Object.freeze({
      name: "Boda de Jessica y Marcos",
      dateISO: "2027-05-01T19:00:00-06:00",
      location: "Jardín Jade, Teyahualco"
    }),

    envelope: Object.freeze({
      cardRevealDelay: 1250,
      contentRevealDelay: 2350,
      introExitDelay: 3150,
      introRemovalDelay: 4100,
      safetyTimeout: 5200
    }),

    music: Object.freeze({
      defaultVolume: 0.52,
      fadeDuration: 900,
      fadeSteps: 18,
      rememberPreference: true,
      storageKey: "jm-wedding-music-preference"
    }),

    selectors: Object.freeze({
      main: "#main",
      sparkleLayer: "#sparkleLayer",

      envelopeIntro: "#envelopeIntro",
      envelope: "#envelope",
      openEnvelopeButton: "#openEnvelope",
      envelopeInstruction: ".envelope-instruction",

      musicButton: "#musicBtn",
      weddingMusic: "#weddingMusic"
    }),

    classes: Object.freeze({
      hidden: "hidden",
      envelopeOpening: "is-opening",
      envelopeOpened: "is-opened",
      introLeaving: "is-leaving",
      mainVisible: "is-visible",
      musicActive: "is-active",
      musicHidden: "is-hidden",
      musicLoading: "is-loading",
      bodyInvitationOpen: "invitation-open"
    })
  });


  /* ============================================================
     3. ESTADO COMPARTIDO
     ============================================================ */

  Object.assign(App.state, {
    initialized: false,
    initializing: false,
    envelopeOpened: false,
    envelopeOpening: false,
    mainRevealed: false,
    musicEnabled: false,
    musicLoading: false,
    musicFadeFrame: null,
    initializationTime: null
  });


  /* ============================================================
     4. HELPERS GENERALES
     ============================================================ */

  /**
   * Consulta segura de un elemento.
   */
  App.helpers.query = function query(selector, context = document) {
    if (!selector || !context) return null;

    try {
      return context.querySelector(selector);
    } catch (error) {
      console.warn(
        `InvitationApp: selector inválido "${selector}".`,
        error
      );
      return null;
    }
  };


  /**
   * Consulta segura de varios elementos.
   */
  App.helpers.queryAll = function queryAll(
    selector,
    context = document
  ) {
    if (!selector || !context) return [];

    try {
      return Array.from(context.querySelectorAll(selector));
    } catch (error) {
      console.warn(
        `InvitationApp: selector inválido "${selector}".`,
        error
      );
      return [];
    }
  };


  /**
   * Espera no bloqueante.
   */
  App.helpers.wait = function wait(milliseconds = 0) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(0, milliseconds));
    });
  };


  /**
   * Limita un número a un rango.
   */
  App.helpers.clamp = window.InviteUtils.clamp;


  /**
   * Actualiza texto solo cuando el elemento existe.
   */
  App.helpers.setText = function setText(element, value) {
    if (element) {
      element.textContent = String(value);
    }
  };


  /**
   * Agrega una clase solo cuando el elemento existe.
   */
  App.helpers.addClass = function addClass(element, className) {
    element?.classList.add(className);
  };


  /**
   * Elimina una clase solo cuando el elemento existe.
   */
  App.helpers.removeClass = function removeClass(
    element,
    className
  ) {
    element?.classList.remove(className);
  };


  /**
   * Alterna una clase solo cuando el elemento existe.
   */
  App.helpers.toggleClass = function toggleClass(
    element,
    className,
    force
  ) {
    element?.classList.toggle(className, force);
  };


  /**
   * Ejecuta una función de forma segura.
   */
  App.helpers.safeCall = function safeCall(
    callback,
    ...argumentsList
  ) {
    if (typeof callback !== "function") return undefined;

    try {
      return callback(...argumentsList);
    } catch (error) {
      console.error("InvitationApp: error de ejecución.", error);
      return undefined;
    }
  };


  /**
   * Ejecuta todos los callbacks registrados en un hook.
   */
  App.helpers.runHook = async function runHook(
    hookName,
    detail = {}
  ) {
    const callbacks = App.hooks[hookName];

    if (!Array.isArray(callbacks)) return;

    for (const callback of callbacks) {
      try {
        await callback(detail);
      } catch (error) {
        console.error(
          `InvitationApp: error en hook "${hookName}".`,
          error
        );
      }
    }
  };


  /**
   * Registra callbacks para fases de inicialización.
   */
  App.registerHook = function registerHook(
    hookName,
    callback
  ) {
    if (
      !Object.prototype.hasOwnProperty.call(App.hooks, hookName) ||
      typeof callback !== "function"
    ) {
      return () => {};
    }

    App.hooks[hookName].push(callback);

    return () => {
      App.hooks[hookName] = App.hooks[hookName].filter(
        (registeredCallback) =>
          registeredCallback !== callback
      );
    };
  };


  /**
   * Emite un evento personalizado desde document.
   */
  App.helpers.emit = function emit(name, detail = {}) {
    document.dispatchEvent(
      new CustomEvent(name, {
        bubbles: false,
        cancelable: false,
        detail
      })
    );
  };


  /**
   * Función debounce reutilizable.
   */
  App.helpers.debounce = function debounce(
    callback,
    delay = 150
  ) {
    let timeoutId = null;

    return (...argumentsList) => {
      window.clearTimeout(timeoutId);

      timeoutId = window.setTimeout(() => {
        callback(...argumentsList);
      }, delay);
    };
  };


  /**
   * Detecta la preferencia de movimiento reducido.
   */
  App.helpers.prefersReducedMotion =
    function prefersReducedMotion() {
      return window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
    };


  /**
   * Inicializa los íconos Lucide cuando la librería existe.
   */
  App.helpers.initializeIcons =
    function initializeIcons(context = document) {
      if (
        window.lucide &&
        typeof window.lucide.createIcons === "function"
      ) {
        try {
          window.lucide.createIcons({
            root: context
          });
        } catch {
          window.lucide.createIcons();
        }
      }
    };


  /* ============================================================
     5. RESOLUCIÓN DE ELEMENTOS DEL DOM
     ============================================================ */

  App.resolveElements = function resolveElements() {
    const selectors = App.config.selectors;

    App.elements.main = App.helpers.query(selectors.main);
    App.elements.sparkleLayer = App.helpers.query(
      selectors.sparkleLayer
    );

    App.elements.envelopeIntro = App.helpers.query(
      selectors.envelopeIntro
    );
    App.elements.envelope = App.helpers.query(
      selectors.envelope
    );
    App.elements.openEnvelopeButton = App.helpers.query(
      selectors.openEnvelopeButton
    );
    App.elements.envelopeInstruction = App.helpers.query(
      selectors.envelopeInstruction
    );

    App.elements.musicButton = App.helpers.query(
      selectors.musicButton
    );
    App.elements.weddingMusic = App.helpers.query(
      selectors.weddingMusic
    );
  };


  /* ============================================================
     6. MÓDULO DE MÚSICA
     ============================================================ */

  App.modules.music = {
    fadeToken: 0,

    initialize() {
      const audio = App.elements.weddingMusic;
      const button = App.elements.musicButton;

      if (!button) return;

      button.addEventListener(
        "click",
        () => this.toggle(),
        { passive: true }
      );

      if (!audio) {
        button.disabled = true;
        button.setAttribute(
          "aria-label",
          "Música no disponible"
        );
        return;
      }

      audio.volume = App.config.music.defaultVolume;

      audio.addEventListener("play", () => {
        App.state.musicEnabled = true;
        App.state.musicLoading = false;
        this.updateButton();
        this.savePreference(true);
      });

      audio.addEventListener("pause", () => {
        App.state.musicEnabled = false;
        App.state.musicLoading = false;
        this.updateButton();
      });

      audio.addEventListener("waiting", () => {
        App.state.musicLoading = true;
        this.updateButton();
      });

      audio.addEventListener("playing", () => {
        App.state.musicLoading = false;
        this.updateButton();
      });

      audio.addEventListener("error", () => {
        App.state.musicEnabled = false;
        App.state.musicLoading = false;
        button.disabled = true;
        button.setAttribute(
          "aria-label",
          "No se pudo cargar la música"
        );
      });

      this.updateButton();
    },

    getSavedPreference() {
      if (!App.config.music.rememberPreference) return null;

      try {
        const savedValue = window.localStorage.getItem(
          App.config.music.storageKey
        );

        if (savedValue === "enabled") return true;
        if (savedValue === "disabled") return false;
      } catch {
        // Algunos navegadores bloquean localStorage.
      }

      return null;
    },

    savePreference(enabled) {
      if (!App.config.music.rememberPreference) return;

      try {
        window.localStorage.setItem(
          App.config.music.storageKey,
          enabled ? "enabled" : "disabled"
        );
      } catch {
        // La invitación continúa sin persistencia.
      }
    },

    updateButton() {
      const button = App.elements.musicButton;

      if (!button) return;

      const active =
        App.state.musicEnabled &&
        !App.elements.weddingMusic?.paused;

      button.classList.toggle(
        App.config.classes.musicActive,
        active
      );

      button.classList.toggle(
        App.config.classes.musicLoading,
        App.state.musicLoading
      );

      button.setAttribute(
        "aria-pressed",
        active ? "true" : "false"
      );

      button.setAttribute(
        "aria-label",
        active
          ? "Desactivar música"
          : "Activar música"
      );
    },

    async play({ fadeIn = true } = {}) {
      const audio = App.elements.weddingMusic;

      if (!audio) return false;

      App.state.musicLoading = true;
      this.updateButton();

      try {
        if (fadeIn) {
          audio.volume = 0;
        }

        await audio.play();

        App.state.musicEnabled = true;
        App.state.musicLoading = false;

        if (fadeIn) {
          await this.fadeTo(
            App.config.music.defaultVolume,
            App.config.music.fadeDuration
          );
        } else {
          audio.volume = App.config.music.defaultVolume;
        }

        this.updateButton();
        return true;
      } catch (error) {
        App.state.musicEnabled = false;
        App.state.musicLoading = false;
        this.updateButton();

        console.info(
          "InvitationApp: el navegador no permitió iniciar la música automáticamente.",
          error
        );

        return false;
      }
    },

    async pause({ fadeOut = true } = {}) {
      const audio = App.elements.weddingMusic;

      if (!audio) return;

      if (fadeOut && !audio.paused) {
        await this.fadeTo(0, 420);
      }

      audio.pause();
      audio.volume = App.config.music.defaultVolume;

      App.state.musicEnabled = false;
      App.state.musicLoading = false;

      this.savePreference(false);
      this.updateButton();
    },

    async toggle() {
      const audio = App.elements.weddingMusic;

      if (!audio || App.state.musicLoading) return;

      if (audio.paused) {
        await this.play({
          fadeIn: true
        });
      } else {
        await this.pause({
          fadeOut: true
        });
      }
    },

    async fadeTo(targetVolume, duration) {
      const audio = App.elements.weddingMusic;

      if (!audio) return;

      const token = ++this.fadeToken;
      const startVolume = audio.volume;
      const finalVolume = App.helpers.clamp(
        targetVolume,
        0,
        1
      );

      const steps = App.config.music.fadeSteps;
      const stepDuration = Math.max(
        16,
        duration / steps
      );

      for (let step = 1; step <= steps; step += 1) {
        if (token !== this.fadeToken) return;

        const progress = step / steps;
        const easedProgress =
          1 - Math.pow(1 - progress, 3);

        audio.volume = App.helpers.clamp(
          startVolume +
            (finalVolume - startVolume) * easedProgress,
          0,
          1
        );

        await App.helpers.wait(stepDuration);
      }

      audio.volume = finalVolume;
    },

    setVisibility(isVisible) {
      const button = App.elements.musicButton;

      if (!button) return;

      button.classList.toggle(
        App.config.classes.musicHidden,
        !isVisible
      );

      button.setAttribute(
        "aria-hidden",
        isVisible ? "false" : "true"
      );

      button.tabIndex = isVisible ? 0 : -1;
    }
  };


  /* ============================================================
     7. MÓDULO DE APERTURA DEL SOBRE
     ============================================================ */

  App.modules.envelope = {
    safetyTimer: null,

    initialize() {
      const button = App.elements.openEnvelopeButton;
      const intro = App.elements.envelopeIntro;
      const main = App.elements.main;

      if (!main) {
        console.error(
          "InvitationApp: no se encontró el contenido principal #main."
        );
        return;
      }

      if (!intro || !button) {
        this.revealMainImmediately();
        return;
      }

      button.addEventListener(
        "click",
        () => this.open(),
        { once: true }
      );

      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.open();
        }
      });

      this.safetyTimer = window.setTimeout(() => {
        if (!App.state.envelopeOpened) {
          console.warn(
            "InvitationApp: se activó la apertura de seguridad."
          );
          this.open({
            playMusic: false,
            accelerated: true
          });
        }
      }, 30000);
    },

    async open({
      playMusic = true,
      accelerated = false
    } = {}) {
      if (
        App.state.envelopeOpening ||
        App.state.envelopeOpened
      ) {
        return;
      }

      const {
        envelopeIntro,
        envelope,
        openEnvelopeButton,
        envelopeInstruction
      } = App.elements;

      const timings = App.config.envelope;
      const motionFactor =
        accelerated ||
        App.helpers.prefersReducedMotion()
          ? 0.18
          : 1;

      App.state.envelopeOpening = true;

      window.clearTimeout(this.safetyTimer);

      if (openEnvelopeButton) {
        openEnvelopeButton.disabled = true;
        openEnvelopeButton.setAttribute(
          "aria-busy",
          "true"
        );
      }

      envelopeInstruction?.setAttribute(
        "aria-hidden",
        "true"
      );

      await App.helpers.runHook(
        "invitationOpening",
        { App }
      );

      App.helpers.emit("invitation:opening", {
        version: App.version
      });

      envelope?.classList.add(
        App.config.classes.envelopeOpening
      );

      document.body.classList.add(
        "invitation-opening"
      );

      if (playMusic) {
        App.modules.music.play({
          fadeIn: true
        });
      }

      await App.helpers.wait(
        timings.cardRevealDelay * motionFactor
      );

      envelope?.classList.add(
        App.config.classes.envelopeOpened
      );

      await App.helpers.wait(
        Math.max(
          0,
          (timings.contentRevealDelay -
            timings.cardRevealDelay) *
            motionFactor
        )
      );

      this.revealMain();

      await App.helpers.wait(
        Math.max(
          0,
          (timings.introExitDelay -
            timings.contentRevealDelay) *
            motionFactor
        )
      );

      envelopeIntro?.classList.add(
        App.config.classes.introLeaving
      );

      await App.helpers.wait(
        Math.max(
          0,
          (timings.introRemovalDelay -
            timings.introExitDelay) *
            motionFactor
        )
      );

      this.finish();
    },

    revealMain() {
      const main = App.elements.main;

      if (!main || App.state.mainRevealed) return;

      App.state.mainRevealed = true;

      main.classList.remove(
        App.config.classes.hidden
      );

      main.removeAttribute("aria-hidden");

      window.requestAnimationFrame(() => {
        main.classList.add(
          App.config.classes.mainVisible
        );

        window.dispatchEvent(new Event("resize"));

        App.helpers.emit("invitation:contentvisible", {
          main
        });
      });
    },

    revealMainImmediately() {
      this.revealMain();

      App.state.envelopeOpened = true;
      App.state.envelopeOpening = false;

      document.body.classList.add(
        App.config.classes.bodyInvitationOpen
      );

      App.modules.music.setVisibility(true);
    },

    async finish() {
      const {
        envelopeIntro,
        openEnvelopeButton
      } = App.elements;

      envelopeIntro?.remove();

      if (openEnvelopeButton) {
        openEnvelopeButton.removeAttribute("aria-busy");
      }

      App.state.envelopeOpened = true;
      App.state.envelopeOpening = false;

      document.body.classList.remove(
        "invitation-opening"
      );

      document.body.classList.add(
        App.config.classes.bodyInvitationOpen
      );

      App.modules.music.setVisibility(true);

      await App.helpers.runHook(
        "invitationOpened",
        { App }
      );

      App.helpers.emit("invitation:opened", {
        version: App.version
      });

      window.dispatchEvent(new Event("resize"));
    }
  };


  /* ============================================================
     8. INICIALIZACIÓN PRINCIPAL
     ============================================================ */

  App.initialize = async function initialize() {
    if (
      App.state.initialized ||
      App.state.initializing
    ) {
      return;
    }

    App.state.initializing = true;
    App.state.initializationTime = Date.now();

    await App.helpers.runHook("beforeInit", { App });

    App.resolveElements();
    App.helpers.initializeIcons();

    App.modules.music.initialize();
    App.modules.music.setVisibility(false);

    App.modules.envelope.initialize();

    App.state.initialized = true;
    App.state.initializing = false;

    await App.helpers.runHook("afterInit", { App });

    App.helpers.emit("invitation:initialized", {
      version: App.version,
      initializedAt: App.state.initializationTime
    });
  };


  /* ============================================================
     9. ARRANQUE SEGURO
     ============================================================ */

  window.InviteUtils.onReady(() => App.initialize());
})();

/**
 * ============================================================
 * INVITACIÓN WEB · JESSICA & MARCOS
 * SCRIPT.JS RECONSTRUIDO · PARTE 2 DE 3
 * ============================================================
 * Extiende window.InvitationApp creado en la Parte 1.
 * Incluye:
 *  - Hero Premium
 *  - Premium Motion
 *  - Cuenta regresiva
 *  - Scroll y navegación
 * ============================================================
 */
(() => {
"use strict";

const App = window.InvitationApp;
if (!App) {
  throw new Error("Debe cargarse primero la Parte 1.");
}

/* ============================================================
   HERO PREMIUM
============================================================ */

App.modules.hero = {
  initialize() {
    this.hero = document.querySelector(".hero");
    if (!this.hero) return;

    App.registerHook("invitationOpened", () => this.reveal());

    window.addEventListener("scroll", () => this.parallax(), {
      passive: true
    });
  },

  reveal() {
    this.hero.classList.add("is-visible");
    App.helpers.emit("invitation:heroReady");
  },

  parallax() {
    if (App.helpers.prefersReducedMotion()) return;
    const offset = window.scrollY * 0.15;
    this.hero.style.setProperty("--hero-offset", `${offset}px`);
  }
};

/* ============================================================
   PREMIUM MOTION
============================================================ */

App.modules.motion = {
  observer: null,

  initialize() {
    const items = document.querySelectorAll("[data-motion]");

    this.observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("motion-visible");
        this.observer.unobserve(entry.target);
        App.helpers.emit("invitation:sectionVisible", {
          element: entry.target
        });
      });
    }, {
      threshold: .18
    });

    items.forEach(el => this.observer.observe(el));
  }
};

/* ============================================================
   CUENTA REGRESIVA
============================================================ */

App.modules.countdown = {
  timer: null,

  initialize() {
    this.days = document.querySelector("#days");
    this.hours = document.querySelector("#hours");
    this.minutes = document.querySelector("#minutes");
    this.seconds = document.querySelector("#seconds");

    this.target = new Date(App.config.event.dateISO);

    this.tick();
    this.timer = setInterval(() => this.tick(),1000);
  },

  format(v){
    return String(Math.max(0,v)).padStart(2,"0");
  },

  tick(){

    const now = new Date();
    const diff = this.target - now;

    if(diff<=0){
      clearInterval(this.timer);
      ["days","hours","minutes","seconds"].forEach(k=>{
        this[k] && (this[k].textContent="00");
      });

      App.helpers.emit("invitation:countdownFinished");
      return;
    }

    const d=Math.floor(diff/86400000);
    const h=Math.floor(diff%86400000/3600000);
    const m=Math.floor(diff%3600000/60000);
    const s=Math.floor(diff%60000/1000);

    this.days&&(this.days.textContent=this.format(d));
    this.hours&&(this.hours.textContent=this.format(h));
    this.minutes&&(this.minutes.textContent=this.format(m));
    this.seconds&&(this.seconds.textContent=this.format(s));

    App.helpers.emit("invitation:countdownTick",{
      days:d,
      hours:h,
      minutes:m,
      seconds:s
    });

  }

};

/* ============================================================
   SCROLL / NAVEGACIÓN
============================================================ */

App.modules.navigation = {

  initialize(){

    document.querySelectorAll("[data-scroll]").forEach(button=>{

      button.addEventListener("click",event=>{

        event.preventDefault();

        const selector=button.dataset.scroll;
        const target=document.querySelector(selector);

        if(!target)return;

        const y=target.getBoundingClientRect().top+window.scrollY-20;

        window.scrollTo({
          top:y,
          behavior:"smooth"
        });

      });

    });

    window.addEventListener("scroll",
      App.helpers.debounce(()=>{

        App.helpers.emit("invitation:scrollChanged",{
          scrollY:window.scrollY
        });

      },40),
      {passive:true}
    );

  }

};

/* ============================================================
   HOOK DE INICIALIZACIÓN
============================================================ */

App.registerHook("afterInit",()=>{

  App.modules.hero.initialize();
  App.modules.motion.initialize();
  App.modules.countdown.initialize();
  App.modules.navigation.initialize();

});

})();


/**
 * ============================================================
 * INVITACIÓN WEB · JESSICA & MARCOS
 * SCRIPT.JS RECONSTRUIDO · PARTE 3 DE 3
 * ============================================================
 * Requiere Parte 1 y Parte 2.
 * Incluye:
 *  - Gallery Premium 2027 se carga desde su módulo estable independiente
 *  - Integración Timeline Premium
 *  - Observadores globales
 *  - Limpieza de recursos
 *  - API pública
 * ============================================================
 */
(() => {
"use strict";

const App = window.InvitationApp;
if (!App) throw new Error("Debe cargarse primero la Parte 1.");

/* ============================================================
   TIMELINE PREMIUM
============================================================ */

App.modules.timeline = {

  initialized:false,

  initialize(){

    if(this.initialized) return;
    this.initialized=true;

    if(window.TimelinePremium){

      try{

        this.instance = new window.TimelinePremium({
          root: document.querySelector(".timeline-premium")
        });

      }catch(error){
        console.error("Timeline Premium:",error);
      }

    }

  }

};

/* ============================================================
   OBSERVADORES GLOBALES
============================================================ */

App.modules.lifecycle = {

  initialize(){

    document.addEventListener("visibilitychange",()=>{

      if(document.hidden){

        if(!App.elements.weddingMusic?.paused){

          App.modules.music.pause({
            fadeOut:true
          });

        }

      }

    });

    window.addEventListener("beforeunload",()=>{

      this.destroy();

    });

  },

  destroy(){

    try{

      App.modules.motion.observer?.disconnect();

    }catch{}

    try{

      App.modules.timeline.instance?.destroy?.();

    }catch{}

    try{

      clearInterval(App.modules.countdown.timer);

    }catch{}

  }

};

/* ============================================================
   API PÚBLICA
============================================================ */

App.openInvitation = ()=>App.modules.envelope.open();

App.playMusic = ()=>App.modules.music.play();

App.pauseMusic = ()=>App.modules.music.pause();

App.toggleMusic = ()=>App.modules.music.toggle();


App.refreshTimeline = ()=>{

  App.modules.timeline.instance?.refresh?.();

};

/* ============================================================
   INTEGRACIÓN FINAL
============================================================ */

App.registerHook("afterInit",()=>{

  App.modules.timeline.initialize();
  App.modules.lifecycle.initialize();

});

/* ============================================================
   INFORMACIÓN
============================================================ */

console.info(
`InvitationApp v${App.version}
Proyecto Premium inicializado correctamente.`
);

})();
