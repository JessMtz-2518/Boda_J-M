/* =========================================================
   GIFT EXPERIENCE
   Mesa de regalos · Aportación económica
   Jessica & Marcos
   ========================================================= */

(() => {
  "use strict";

  const SELECTORS = Object.freeze({
    openButton: "#openBankDetails",
    modal: "#bankDetailsModal",
    dialog: ".gift-modal__dialog",
    closeControls: "[data-close-bank-modal]",
    copyButton: "#copyBankClabe",
    clabe: "#bankClabe",
    message: "#giftCopyMessage"
  });

  const CLASSES = Object.freeze({
    modalOpen: "is-open",
    bodyLocked: "gift-modal-open"
  });

  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(",");

  let openButton = null;
  let modal = null;
  let dialog = null;
  let copyButton = null;
  let clabeElement = null;
  let messageElement = null;
  let closeControls = [];
  let previousFocus = null;
  let closeTimer = 0;

  function isModalOpen() {
    return Boolean(modal?.classList.contains(CLASSES.modalOpen));
  }

  function getFocusableElements() {
    if (!dialog) return [];

    return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter((element) => {
        const styles = window.getComputedStyle(element);
        return (
          styles.visibility !== "hidden" &&
          styles.display !== "none" &&
          !element.hasAttribute("disabled")
        );
      });
  }

  function clearMessage() {
    if (!messageElement) return;
    messageElement.textContent = "";
  }

  function setMessage(text) {
    if (!messageElement) return;
    messageElement.textContent = text;
  }

  function lockBodyScroll() {
    document.body.classList.add(CLASSES.bodyLocked);
  }

  function unlockBodyScroll() {
    document.body.classList.remove(CLASSES.bodyLocked);
  }

  function openModal() {
    if (!modal || !dialog || isModalOpen()) return;

    window.clearTimeout(closeTimer);
    previousFocus = document.activeElement;

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    lockBodyScroll();

    window.requestAnimationFrame(() => {
      modal.classList.add(CLASSES.modalOpen);

      const focusableElements = getFocusableElements();
      const firstFocusable = focusableElements[0] || dialog;

      if (!dialog.hasAttribute("tabindex")) {
        dialog.setAttribute("tabindex", "-1");
      }

      firstFocusable.focus({ preventScroll: true });
    });
  }

  function closeModal() {
    if (!modal || !isModalOpen()) return;

    modal.classList.remove(CLASSES.modalOpen);
    modal.setAttribute("aria-hidden", "true");
    unlockBodyScroll();
    clearMessage();

    closeTimer = window.setTimeout(() => {
      modal.hidden = true;

      if (
        previousFocus &&
        typeof previousFocus.focus === "function" &&
        document.contains(previousFocus)
      ) {
        previousFocus.focus({ preventScroll: true });
      }

      previousFocus = null;
    }, 350);
  }

  function trapFocus(event) {
    if (event.key !== "Tab" || !isModalOpen()) return;

    const focusableElements = getFocusableElements();

    if (!focusableElements.length) {
      event.preventDefault();
      dialog?.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  function normalizeClabe(value) {
    return String(value || "").replace(/\s+/g, "").trim();
  }

  async function copyClabe() {
    if (!clabeElement) return;

    const clabe = normalizeClabe(clabeElement.textContent);

    if (!clabe) {
      setMessage("No se encontró una CLABE para copiar.");
      return;
    }

    try {
      if (
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function" &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(clabe);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = clabe;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";

        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        const copied = document.execCommand("copy");
        textarea.remove();

        if (!copied) {
          throw new Error("El navegador no permitió copiar el texto.");
        }
      }

      setMessage("CLABE copiada correctamente.");
    } catch (error) {
      console.error("Gift Experience: no fue posible copiar la CLABE.", error);
      setMessage("No fue posible copiarla automáticamente. Puedes seleccionarla manualmente.");
    }
  }

  function handleDocumentKeydown(event) {
    if (!isModalOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }

    trapFocus(event);
  }

  function handleModalClick(event) {
    const closeTarget = event.target.closest(SELECTORS.closeControls);

    if (closeTarget) {
      closeModal();
    }
  }

  function initializeGiftExperience() {
    openButton = document.querySelector(SELECTORS.openButton);
    modal = document.querySelector(SELECTORS.modal);
    dialog = modal?.querySelector(SELECTORS.dialog) || null;
    copyButton = document.querySelector(SELECTORS.copyButton);
    clabeElement = document.querySelector(SELECTORS.clabe);
    messageElement = document.querySelector(SELECTORS.message);
    closeControls = modal
      ? Array.from(modal.querySelectorAll(SELECTORS.closeControls))
      : [];

    if (!openButton || !modal || !dialog) {
      console.warn(
        "Gift Experience: faltan elementos obligatorios en el HTML."
      );
      return;
    }

    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");

    openButton.addEventListener("click", openModal);
    modal.addEventListener("click", handleModalClick);
    document.addEventListener("keydown", handleDocumentKeydown);

    closeControls.forEach((control) => {
      control.setAttribute("type", control.getAttribute("type") || "button");
    });

    copyButton?.addEventListener("click", copyClabe);

    console.info("Gift Experience inicializado correctamente.");
  }

  if (window.InviteUtils?.onReady) {
    window.InviteUtils.onReady(initializeGiftExperience);
  } else if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeGiftExperience,
      { once: true }
    );
  } else {
    initializeGiftExperience();
  }
})();
