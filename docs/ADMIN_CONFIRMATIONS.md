# Módulo Confirmaciones — Fase 1: capa de datos

## Objetivo

Preparar una capa administrativa segura para consultar y corregir confirmaciones sin acceso directo a tablas.

## RPC nuevas

### `admin_listar_confirmaciones(...)`

Listado paginado de confirmaciones existentes.

Filtros:
- búsqueda por nombre, código o grupo;
- grupo;
- estado (`confirmado` / `no_asistira`);
- invitación activa/inactiva;
- páginas de 10, 20 o 50 registros.

El listado no devuelve el mensaje completo.

### `admin_obtener_confirmacion(p_invitado_id)`

Devuelve:
- datos del invitado;
- cupo;
- confirmación vigente;
- mensaje original;
- fechas;
- historial completo de la confirmación.

### `admin_corregir_confirmacion(...)`

Permite al administrador corregir únicamente:
- adultos confirmados;
- niños confirmados.

Requiere:
- motivo obligatorio;
- versión actual para control de concurrencia.

El mensaje original del invitado nunca se altera desde esta RPC.

## Auditoría administrativa

`historial_confirmaciones` conserva:
- origen `invitado` o `administrador`;
- UUID del administrador;
- nombre histórico del administrador;
- motivo;
- valores anteriores;
- valores nuevos;
- fecha/hora.

El trigger identifica una corrección administrativa mediante variables locales de la transacción establecidas exclusivamente por la RPC.

## Reglas importantes

Una corrección administrativa:
- puede realizarse aunque el RSVP público esté cerrado;
- puede realizarse después de la fecha límite;
- puede realizarse sobre una invitación inactiva para corregir el histórico;
- nunca puede exceder el cupo asignado;
- no puede modificar el mensaje original.

El RSVP público conserva exactamente sus reglas normales.

## Pruebas después de ejecutar el SQL

1. Ejecutar el script dos veces para comprobar idempotencia.
2. Confirmar rechazo a `anon`.
3. Confirmar rechazo a usuario autenticado no administrador.
4. Listar confirmaciones como administrador.
5. Validar filtros y paginación.
6. Obtener detalle de una confirmación.
7. Corregir una confirmación con motivo.
8. Verificar `origen = administrador`.
9. Verificar `administrador_nombre`.
10. Confirmar `datos_anteriores` y `datos_nuevos`.
11. Confirmar que el mensaje original se conserva.
12. Intentar exceder adultos/niños asignados: debe fallar.
13. Probar una versión antigua: debe devolver `REGISTRO_DESACTUALIZADO`.
14. Modificar RSVP desde la invitación pública y confirmar `origen = invitado`.
15. Confirmar que el Dashboard continúa funcionando.
16. Confirmar que el módulo Invitados continúa funcionando.

## Siguiente fase

Después de validar esta capa de datos:
- construir `confirmaciones-service.js`;
- reemplazar el placeholder de `confirmaciones-view.js`;
- listado responsive;
- filtros;
- detalle e historial;
- modal de corrección administrativa.
