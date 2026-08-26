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
    const activeGuests = guests.filter((item) => item.activo);

    const invitation = {
      total: guests.length,
      active: activeGuests.length,
      inactive: guests.filter((item) => !item.activo).length,
    };

    // Las bajas administrativas no participan en pendientes ni estadísticas de asistencia.
    const confirmation = {
      attending: activeGuests.filter((item) => item.estado_confirmacion === "asistira").length,
      notAttending: activeGuests.filter((item) => item.estado_confirmacion === "no_asistira").length,
      pending: activeGuests.filter((item) => item.estado_confirmacion === "pendiente").length,
    };

    const attendingGuests = activeGuests.filter((item) => item.estado_confirmacion === "asistira");
    const people = attendingGuests.reduce((acc, item) => {
      acc.adults += item.adultos_confirmados;
      acc.children += item.ninos_confirmados;
      acc.total += item.total_confirmado;
      return acc;
    }, { adults: 0, children: 0, total: 0 });

    return { invitation, confirmation, people };
  }

  async function getReportsData() {
    const [
      byTable,
      guests,
      planner,
      essentials,
      godparents,
      finance,
      contracts,
    ] = await Promise.all([
      getTableReport(),
      listAllGuests(),
      window.AdminPlannerService?.getSummary?.() || Promise.resolve(null),
      window.AdminEssentialsService?.getSummary?.() || Promise.resolve(null),
      window.AdminGodparentsService?.getSummary?.() || Promise.resolve(null),
      window.AdminFinanceService?.getSummary?.() || Promise.resolve(null),
      window.AdminContractsService?.getSummary?.() || Promise.resolve(null),
    ]);

    const guestSummary = buildGuestSummary(guests);
    const totalCapacity = byTable.reduce((sum, table) => sum + Number(table.capacity || 0), 0);
    const assigned = byTable.reduce((sum, table) => sum + Number(table.occupied || 0), 0);

    const tableSummary = {
      tables: byTable.length,
      capacity: totalCapacity,
      assigned,
      unassigned: Math.max(0, Number(guestSummary.people.total || 0) - assigned),
      available: Math.max(0, totalCapacity - assigned),
    };

    const essentialsSummary = essentials?.resumen || {};
    const godparentSummary = godparents?.summary || {};
    const plannerSummary = planner?.summary || {};
    const financeSummary = finance?.summary || {};
    const contractsSummary = contracts?.summary || {};

    return {
      generatedAt: new Date(),
      byTable,
      guests: guests
        .slice()
        .sort((a, b) => normalizeName(a.nombre).localeCompare(normalizeName(b.nombre), "es", { sensitivity: "base" })),
      guestSummary,
      tableSummary,
      organizationSummary: {
        planner: {
          total: Number(plannerSummary.total || 0),
          completed: Number(plannerSummary.completed || 0),
          pending: Number(plannerSummary.pending || 0),
          inProgress: Number(plannerSummary.inProgress || 0),
          overdue: Number(plannerSummary.overdue || 0),
          progress: Number(plannerSummary.progress || 0),
        },
        essentials: {
          total: Number(essentialsSummary.total || 0),
          defined: Number(essentialsSummary.listos || 0) + Number(essentialsSummary.contratados || 0),
          prospects: Number(essentialsSummary.en_decision || 0),
          pending: Number(essentialsSummary.por_definir || 0),
        },
        godparents: {
          total: Number(godparentSummary.total || 0),
          confirmed: Number(godparentSummary.confirmados || 0),
          pending: Number(godparentSummary.por_definir || 0),
        },
      },
      financeSummary: {
        budget: Number(financeSummary.budget || 0),
        contracted: Number(financeSummary.contracted || 0),
        paid: Number(financeSummary.paid || 0),
        pendingPayment: Number(financeSummary.pendingPayment || 0),
        available: Number(financeSummary.available || 0),
        contracts: {
          signed: Number(contractsSummary.signed || 0),
          awaitingSignature: Number(contractsSummary.awaitingSignature || 0),
          reviewing: Number(contractsSummary.reviewing || 0),
          withoutContract: Number(contractsSummary.withoutContract || 0),
        },
      },
    };
  }

  window.AdminReportsService = Object.freeze({ getReportsData });
})();
