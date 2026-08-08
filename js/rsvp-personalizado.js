/* =========================================================
   RSVP PERSONALIZADO
   Cupo limitado por invitación + confirmación por WhatsApp
   ========================================================= */

(() => {
  "use strict";

  const elements = {};
  let invitation = null;

  function getInvitationCode() {
    const params = new URLSearchParams(window.location.search);
    return (params.get("inv") || "").trim().toUpperCase();
  }

  function pluralize(value, singular, plural) {
    return value === 1 ? singular : plural;
  }

  function createOptions(maximum) {

    const fragment = document.createDocumentFragment();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Seleccione...";
    placeholder.disabled = true;
    placeholder.selected = true;

    fragment.appendChild(placeholder);

    for (let value = 0; value <= maximum; value++) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      fragment.appendChild(option);
    }

    return fragment;
  }

  function populateSelect(select, maximum) {

    select.innerHTML = "";

    select.appendChild(createOptions(maximum));

    select.selectedIndex = 0;
    select.classList.remove("has-selection");

    select.addEventListener("change", () => {
      select.classList.toggle(
        "has-selection",
        select.value !== ""
      );
    });
  }

  function showError(message) {
    elements.loading.hidden = true;
    elements.card.hidden = true;
    elements.form.hidden = true;
    elements.error.textContent = message;
    elements.error.hidden = false;
  }

  function renderInvitation(code, record) {
    invitation = {
      code,
      ...record,
    };

    elements.loading.hidden = true;
    elements.error.hidden = true;

    elements.code.value = code;
    elements.guestName.textContent = record.name;
    elements.assignedAdults.textContent = record.adults;
    elements.assignedChildren.textContent = record.children;

    elements.assignedAdultsLabel.textContent = pluralize(
      record.adults,
      "Adulto",
      "Adultos"
    );

    elements.assignedChildrenLabel.textContent = pluralize(
      record.children,
      "Niño",
      "Niños"
    );

    populateSelect(elements.adultCount, record.adults);
    populateSelect(elements.childrenCount, record.children);

    const hasChildren = record.children > 0;
    elements.childrenField.hidden = !hasChildren;
    elements.assignedChildrenBox.hidden = !hasChildren;
    elements.selectGrid?.classList.toggle("is-single-column", !hasChildren);

    elements.card.hidden = false;
    elements.form.hidden = false;
  }

  function buildMessage({ adults, children, guestMessage }) {
    const attending = adults + children > 0;
    const config = window.RSVP_CONFIG || {};

    const lines = [
      `Hola, confirmo mi respuesta para la boda de ${config.coupleNames || "Jessica y Marcos"}.`,
      "",
      `Código: ${invitation.code}`,
      `Invitación: ${invitation.name}`,
      `Respuesta: ${attending ? "Sí asistiremos" : "No podremos asistir"}`,
      `Adultos confirmados: ${adults}`,
      `Niños confirmados: ${children}`,
    ];

    if (guestMessage) {
      lines.push(`Mensaje: ${guestMessage}`);
    }

    return lines.join("\n");
  }

  function validateCounts(adults, children) {
    if (!invitation) {
      return "No se encontró la información de esta invitación.";
    }

    if (!Number.isInteger(adults) || !Number.isInteger(children)) {
      return "Selecciona una cantidad válida de asistentes.";
    }

    if (adults < 0 || adults > invitation.adults) {
      return `El cupo máximo de adultos es ${invitation.adults}.`;
    }

    if (children < 0 || children > invitation.children) {
      return `El cupo máximo de niños es ${invitation.children}.`;
    }

    return "";
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (elements.adultCount.value === "") {

      elements.message.textContent =
        "Selecciona cuántos adultos asistirán.";

      elements.adultCount.focus();

      return;

    }

    if (
      invitation.children > 0 &&
      elements.childrenCount.value === ""
    ) {

      elements.message.textContent =
        "Selecciona cuántos niños asistirán.";

      elements.childrenCount.focus();

      return;

    }

    const adults = Number(elements.adultCount.value);
    const children = invitation.children > 0
      ? Number(elements.childrenCount.value)
      : 0;

    const validationError = validateCounts(adults, children);

    if (validationError) {
      elements.message.textContent = validationError;
      return;
    }

    const config = window.RSVP_CONFIG || {};
    const phone = String(config.whatsappNumber || "").replace(/\D/g, "");

    if (!phone) {
      elements.message.textContent =
        "Falta configurar el número de WhatsApp de los novios.";
      return;
    }

    const message = buildMessage({
      adults,
      children,
      guestMessage: elements.guestMessage.value.trim(),
    });

    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    elements.message.textContent =
      "WhatsApp se abrirá con tu respuesta preparada. Solo falta presionar Enviar.";

    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }

  function initialize() {
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
    elements.guestMessage = document.querySelector("#guestMessage");
    elements.message = document.querySelector("#formMsg");

    if (!elements.form) {
      return;
    }

    const code = getInvitationCode();
    const guests = window.RSVP_GUESTS || {};
    const record = guests[code];

    if (!code) {
      showError(
        "Abre la invitación desde el enlace personalizado que te enviaron los novios."
      );
      return;
    }

    if (!record) {
      showError(
        "El código de esta invitación no es válido. Verifica que el enlace esté completo."
      );
      return;
    }

    renderInvitation(code, record);
    elements.form.addEventListener("submit", handleSubmit);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
