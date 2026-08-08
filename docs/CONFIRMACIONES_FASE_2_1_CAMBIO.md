# Confirmaciones · Fase 2.1

Cambio de UX:

- `Ver detalle` muestra únicamente:
  - estado actual;
  - cupo;
  - mensaje original;
  - fechas;
  - historial.
- Dentro del detalle aparece `Corregir confirmación`.
- La corrección abre un modal independiente.
- Al guardar una corrección:
  - se cierra el modal;
  - se actualiza el listado;
  - se muestra confirmación de éxito;
  - NO se abre automáticamente otro modal.

No hay cambios en SQL ni en las RPC.
