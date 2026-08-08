/* =========================================================
   RSVP CON SUPABASE
   Actua solo con tokens UUID. Los codigos locales siguen siendo
   atendidos por rsvp-personalizado.js como respaldo heredado.
   ========================================================= */

(() => {
  "use strict";

  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const elements = {};
  let invitation = null;
  let tokenAcceso = "";
  let submitting = false;

  function readToken() {
    return (new URLSearchParams(window.location.search).get("inv") || "").trim();
  }

  function valueFrom(record, names, fallback = null) {
    for (const name of names) {
      if (record?.[name] !== undefined && record[name] !== null) {
        return record[name];
      }
    }

    return fallback;
  }

  function toCount(value) {
    const count = Number(value);
    return Number.isInteger(count) && count >= 0 ? count : 0;
  }

  function normalizeInvitation(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    const confirmation = valueFrom(record, ["confirmacion", "confirmation"], {});
    const source = confirmation && typeof confirmation === "object"
      ? confirmation
      : {};

    const confirmedAdults = valueFrom(
      source,
      ["adultos_confirmados", "adultos", "adults", "confirmed_adults"],
      valueFrom(record, ["adultos_confirmados", "confirmed_adults"])
    );
    const confirmedChildren = valueFrom(
      source,
      ["ninos_confirmados", "ninos", "niños", "children", "confirmed_children"],
      valueFrom(record, ["ninos_confirmados", "confirmed_children"])
    );
    const hasConfirmation =
      Object.keys(source).length > 0 ||
      confirmedAdults !== null ||
      confirmedChildren !== null ||
      Boolean(valueFrom(record, ["estado_confirmacion", "confirmation_status"]));

    return {
      name: String(valueFrom(record, ["nombre", "name", "invitado_nombre"], "Invitado")),
      adults: toCount(valueFrom(record, ["adultos", "adults", "adultos_asignados"], 0)),
      children: toCount(valueFrom(record, ["ninos", "niños", "children", "ninos_asignados"], 0)),
      confirmedAdults,
      confirmedChildren,
      hasConfirmation,
      message: String(valueFrom(source, ["mensaje", "message"],
        valueFrom(record, ["mensaje_confirmacion", "confirmation_message"], "")) || ""),
    };
  }

  function pluralize(value, singular, plural) {
    return value === 1 ? singular : plural;
  }

  function populateSelect(select, maximum, selectedValue = null) {
    const fragment = document.createDocumentFragment();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Seleccione...";
    placeholder.disabled = true;
    placeholder.selected = selectedValue === null || selectedValue === undefined;
    fragment.appendChild(placeholder);

    for (let value = 0; value <= maximum; value += 1) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = String(value);
      option.selected = Number(selectedValue) === value;
      fragment.appendChild(option);
    }

    select.replaceChildren(fragment);
    select.classList.toggle("has-selection", select.value !== "");
  }

  function mountCounter(select, maximum, selectedValue = 0) {
    const initialValue = Math.min(
      Math.max(Number(selectedValue) || 0, 0),
      maximum
    );
    let counter = select.nextElementSibling;

    if (!counter?.classList.contains("rsvp-counter")) {
      counter = document.createElement("div");
      counter.className = "rsvp-counter";
      counter.innerHTML = `
        <button class="rsvp-counter-button" type="button" data-counter-action="decrease" aria-label="Restar una persona">−</button>
        <div class="rsvp-counter-value" aria-live="polite">
          <strong>0</strong>
          <span></span>
        </div>
        <button class="rsvp-counter-button" type="button" data-counter-action="increase" aria-label="Agregar una persona">+</button>
      `;
      select.insertAdjacentElement("afterend", counter);
    }

    const valueElement = counter.querySelector("strong");
    const maximumElement = counter.querySelector(".rsvp-counter-value span");
    const decreaseButton = counter.querySelector('[data-counter-action="decrease"]');
    const increaseButton = counter.querySelector('[data-counter-action="increase"]');

    function updateValue(nextValue, animate = true) {
      const value = Math.min(Math.max(nextValue, 0), maximum);
      select.value = String(value);
      valueElement.textContent = String(value);
      maximumElement.textContent = `MÁX. ${maximum}`;
      decreaseButton.disabled = value <= 0;
      increaseButton.disabled = value >= maximum;

      if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        valueElement.classList.remove("is-changing");
        void valueElement.offsetWidth;
        valueElement.classList.add("is-changing");
      }
    }

    if (!counter.dataset.initialized) {
      decreaseButton.addEventListener("click", () => {
        updateValue(Number(select.value) - 1);
      });
      increaseButton.addEventListener("click", () => {
        updateValue(Number(select.value) + 1);
      });
      counter.dataset.initialized = "true";
    }

    select.hidden = true;
    counter.hidden = false;
    updateValue(initialValue, false);
    return counter;
  }

  function setLoading(active, message = "Consultando tu invitacion...") {
    elements.loading.textContent = message;
    elements.loading.hidden = !active;
  }

  function showError(message) {
    setLoading(false);
    elements.card.hidden = true;
    elements.form.hidden = true;
    elements.error.textContent = message;
    elements.error.hidden = false;
  }

  function renderInvitation(record) {
    invitation = record;

    setLoading(false);
    elements.error.hidden = true;
    elements.code.value = tokenAcceso;
    elements.guestName.textContent = record.name;
    elements.assignedAdults.textContent = record.adults;
    elements.assignedChildren.textContent = record.children;
    elements.assignedAdultsLabel.textContent = pluralize(record.adults, "Adulto", "Adultos");
    elements.assignedChildrenLabel.textContent = pluralize(record.children, "Nino", "Ninos");

    const selectedAdults = record.hasConfirmation
      ? toCount(record.confirmedAdults)
      : 0;
    const selectedChildren = record.hasConfirmation
      ? toCount(record.confirmedChildren)
      : 0;

    populateSelect(elements.adultCount, record.adults, selectedAdults);
    populateSelect(elements.childrenCount, record.children, selectedChildren);
    elements.adultCounter = mountCounter(
      elements.adultCount,
      record.adults,
      selectedAdults
    );
    elements.childrenCounter = mountCounter(
      elements.childrenCount,
      record.children,
      selectedChildren
    );

    elements.guestMessage.value = "";
    elements.messageField.hidden = record.hasConfirmation;
    elements.existingConfirmationNotice.hidden = !record.hasConfirmation;
    elements.submitButton.textContent = record.hasConfirmation
      ? "Actualizar asistencia"
      : "Confirmar asistencia";

    const hasChildren = record.children > 0;
    elements.childrenField.hidden = !hasChildren;
    elements.assignedChildrenBox.hidden = !hasChildren;
    elements.selectGrid?.classList.toggle("is-single-column", !hasChildren);

    elements.card.hidden = false;
    elements.form.hidden = false;
  }

  function validateCounts(adults, children) {
    if (!Number.isInteger(adults) || !Number.isInteger(children)) {
      return "Selecciona una cantidad valida de asistentes.";
    }

    if (adults < 0 || adults > invitation.adults) {
      return `El cupo maximo de adultos es ${invitation.adults}.`;
    }

    if (children < 0 || children > invitation.children) {
      return `El cupo maximo de ninos es ${invitation.children}.`;
    }

    return "";
  }

  function buildWhatsAppMessage({ adults, children, guestMessage }) {
    const attending = adults + children > 0;
    const coupleNames = window.RSVP_CONFIG?.coupleNames || "Jessica y Marcos";
    const lines = [
      `Hola, confirmo mi respuesta para la boda de ${coupleNames}.`,
      "",
      `Invitacion: ${invitation.name}`,
      `Respuesta: ${attending ? "Si asistiremos" : "No podremos asistir"}`,
      `Adultos confirmados: ${adults}`,
      `Ninos confirmados: ${children}`,
    ];

    if (guestMessage) {
      lines.push(`Mensaje: ${guestMessage}`);
    }

    return lines.join("\n");
  }

  function openWhatsApp(payload) {
    const phone = String(window.RSVP_CONFIG?.whatsappNumber || "").replace(/\D/g, "");

    if (!phone) {
      elements.message.textContent =
        "La confirmacion se guardo, pero falta configurar el numero de WhatsApp.";
      return;
    }

    const message = buildWhatsAppMessage(payload);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const whatsappWindow = window.open(url, "_blank", "noopener,noreferrer");

    if (!whatsappWindow) {
      elements.message.innerHTML = "";
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Confirmacion guardada. Abrir WhatsApp";
      elements.message.appendChild(link);
      return;
    }

    elements.message.textContent =
      "Confirmacion guardada. WhatsApp se abrio con tu respuesta preparada.";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (submitting) {
      return;
    }

    if (elements.adultCount.value === "") {
      elements.message.textContent = "Selecciona cuantos adultos asistiran.";
      elements.adultCount.focus();
      return;
    }

    if (invitation.children > 0 && elements.childrenCount.value === "") {
      elements.message.textContent = "Selecciona cuantos ninos asistiran.";
      elements.childrenCount.focus();
      return;
    }

    const payload = {
      adults: Number(elements.adultCount.value),
      children: invitation.children > 0 ? Number(elements.childrenCount.value) : 0,
      guestMessage: elements.guestMessage.value.trim(),
    };
    const validationError = validateCounts(payload.adults, payload.children);

    if (validationError) {
      elements.message.textContent = validationError;
      return;
    }

    submitting = true;
    elements.submitButton.disabled = true;
    elements.submitButton.setAttribute("aria-busy", "true");
    elements.message.textContent = "Guardando tu confirmacion...";

    try {
      await window.InvitadosService.guardarConfirmacion({
        tokenAcceso,
        adultos: payload.adults,
        ninos: payload.children,
        mensaje: invitation.hasConfirmation
          ? invitation.message
          : payload.guestMessage,
      });

      openWhatsApp({
        ...payload,
        guestMessage: invitation.hasConfirmation ? "" : payload.guestMessage,
      });

      const normalButtonText = invitation.hasConfirmation
        ? "Actualizar asistencia"
        : "Confirmar asistencia";
      elements.submitButton.textContent = invitation.hasConfirmation
        ? "¡Listo! Tu asistencia fue actualizada"
        : "¡Listo! Tu asistencia fue confirmada";
      window.setTimeout(() => {
        elements.submitButton.textContent = normalButtonText;
      }, 1800);
    } catch (error) {
      console.error("RSVP Supabase:", error);
      elements.message.textContent =
        "No fue posible guardar tu confirmacion. Intenta nuevamente.";
    } finally {
      submitting = false;
      elements.submitButton.disabled = false;
      elements.submitButton.removeAttribute("aria-busy");
    }
  }

  function resolveElements() {
    elements.loading = document.querySelector("#rsvpLoading");
    elements.card = document.querySelector("#rsvpInvitationCard");
    elements.error = document.querySelector("#rsvpAccessError");
    elements.form = document.querySelector("#rsvpForm");
    elements.code = document.querySelector("#invitationCode");
    elements.guestName = document.querySelector("#rsvpGuestName");
    elements.assignedAdults = document.querySelector("#assignedAdults");
    elements.assignedChildren = document.querySelector("#assignedChildren");
    elements.assignedAdultsLabel = document.querySelector("#assignedAdultsLabel");
    elements.assignedChildrenLabel = document.querySelector("#assignedChildrenLabel");
    elements.assignedChildrenBox = document.querySelector("#assignedChildrenBox");
    elements.adultCount = document.querySelector("#adultCount");
    elements.childrenCount = document.querySelector("#childrenCount");
    elements.childrenField = document.querySelector("#childrenField");
    elements.selectGrid = document.querySelector(".rsvp-select-grid");
    elements.messageField = document.querySelector(".rsvp-message-field");
    elements.guestMessage = document.querySelector("#guestMessage");
    elements.message = document.querySelector("#formMsg");
    elements.submitButton = elements.form?.querySelector('button[type="submit"]');

    elements.existingConfirmationNotice = document.querySelector(
      "#rsvpExistingConfirmationNotice"
    );

    if (!elements.existingConfirmationNotice && elements.messageField) {
      const notice = document.createElement("p");
      notice.id = "rsvpExistingConfirmationNotice";
      notice.className = "rsvp-whatsapp-note rsvp-existing-confirmation";
      notice.hidden = true;
      notice.append(
        "✓ Ya habíamos recibido tu confirmación.",
        document.createElement("br"),
        document.createElement("br"),
        "Si deseas hacer algún cambio,",
        document.createElement("br"),
        "puedes actualizarla aquí."
      );
      elements.existingConfirmationNotice = notice;
    }

    if (elements.existingConfirmationNotice && elements.selectGrid) {
      elements.selectGrid.insertAdjacentElement(
        "beforebegin",
        elements.existingConfirmationNotice
      );
    }

    return Object.values(elements).every(Boolean);
  }

  async function initialize() {
    tokenAcceso = readToken();

    // Los codigos JM-* siguen usando completamente el RSVP heredado.
    if (!UUID_PATTERN.test(tokenAcceso)) {
      return;
    }

    if (!resolveElements()) {
      return;
    }

    setLoading(true);
    elements.card.hidden = true;
    elements.form.hidden = true;
    elements.error.hidden = true;

    try {
      const rawInvitation = await window.InvitadosService.obtenerInvitacion(tokenAcceso);
      const normalizedInvitation = normalizeInvitation(rawInvitation);

      if (!normalizedInvitation) {
        showError("No encontramos una invitacion activa para este enlace.");
        return;
      }

      renderInvitation(normalizedInvitation);
      elements.form.addEventListener("submit", handleSubmit, { capture: true });
    } catch (error) {
      console.error("RSVP Supabase:", error);
      showError("No fue posible consultar tu invitacion. Intenta nuevamente.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
