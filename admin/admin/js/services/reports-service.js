(() => {
  "use strict";

  function normalizeName(value) {
    return String(value || "").trim();
  }

  async function listAllGuests() {
    if (!window.AdminGuestsService) {
      throw new Error("El servicio de Invitados no está disponible.");
    }

    const items = [];
    let page = 1;
    let totalPages = 1;

    do {
      const envelope = await window.AdminGuestsService.listGuests({
        page,
        pageSize: 50,
        order: "nombre",
        direction: "asc",
      });
      items.push(...envelope.data.items);
      totalPages = envelope.data.paginacion.total_paginas || 0;
      page += 1;
    } while (page <= totalPages);

    return items;
  }

  async function getTableReport() {
    if (!window.AdminTablesService) {
      throw new Error("El servicio de Mesas no está disponible.");
    }

    const tablesEnvelope = await window.AdminTablesService.listTables();
    const tables = tablesEnvelope.data.items
      .filter((table) => table.activo)
      .sort((a, b) => a.numero - b.numero);

    const details = await Promise.all(
      tables.map((table) => window.AdminTablesService.getTableDetail(table.id))
    );

    return details.map((envelope) => {
      const table = envelope.data.mesa;
      const assignments = envelope.data.asignaciones
        .slice()
        .sort((a, b) => normalizeName(a.nombre).localeCompare(normalizeName(b.nombre), "es", { sensitivity: "base" }));

      const adults = assignments.reduce((sum, item) => sum + item.adultos, 0);
      const children = assignments.reduce((sum, item) => sum + item.ninos, 0);

      return {
        id: table.id,
        number: table.numero,
        name: table.nombre || `Mesa ${table.numero}`,
        capacity: table.capacidad,
        occupied: table.ocupados,
        available: table.disponibles,
        adults,
        children,
        assignments,
      };
    });
  }

  function buildGuestSummary(guests) {
    const invitation = {
      total: guests.length,
      active: guests.filter((item) => item.activo).length,
      inactive: guests.filter((item) => !item.activo).length,
    };

    const confirmation = {
      attending: guests.filter((item) => item.estado_confirmacion === "asistira").length,
      notAttending: guests.filter((item) => item.estado_confirmacion === "no_asistira").length,
      pending: guests.filter((item) => item.estado_confirmacion === "pendiente").length,
    };

    const attendingGuests = guests.filter((item) => item.estado_confirmacion === "asistira");
    const people = attendingGuests.reduce((acc, item) => {
      acc.adults += item.adultos_confirmados;
      acc.children += item.ninos_confirmados;
      acc.total += item.total_confirmado;
      return acc;
    }, { adults: 0, children: 0, total: 0 });

    return { invitation, confirmation, people };
  }

  async function getReportsData() {
    const [byTable, guests] = await Promise.all([
      getTableReport(),
      listAllGuests(),
    ]);

    return {
      generatedAt: new Date(),
      byTable,
      guests: guests
        .slice()
        .sort((a, b) => normalizeName(a.nombre).localeCompare(normalizeName(b.nombre), "es", { sensitivity: "base" })),
      guestSummary: buildGuestSummary(guests),
    };
  }

  window.AdminReportsService = Object.freeze({ getReportsData });
})();
