# Mesas · Fase 2.1 — Backend de asignaciones

## Objetivo

Habilitar la asignación segura de asistentes confirmados a mesas.

## Reglas implementadas

Una asignación solo puede realizarse cuando:

- la mesa existe y está activa;
- la invitación existe y está activa;
- existe una confirmación vigente;
- la confirmación tiene estado `confirmado`;
- adultos asignados no exceden adultos confirmados;
- niños asignados no exceden niños confirmados;
- la mesa tiene capacidad suficiente;
- la cantidad total asignada es mayor que cero;
- se captura un motivo administrativo.

## Invitaciones divididas

Una misma invitación puede distribuirse entre varias mesas.

Ejemplo:

- confirmación: 3 adultos + 1 niño;
- Mesa 2: 2 adultos;
- Mesa 8: 1 adulto + 1 niño.

El sistema calcula lo ya asignado en otras mesas antes de aceptar una nueva asignación.

## Reconfiguración general

En cuanto exista la primera asignación activa, la función existente:

`private.hay_asignaciones_mesa_activas()`

hará que la reconfiguración masiva de Mesas quede bloqueada automáticamente.

## RPC nuevas

### `admin_listar_pendientes_mesa(p_busqueda, p_grupo)`

Devuelve únicamente invitados activos con confirmación `confirmado` y personas pendientes de asignar.

Incluye:

- confirmados;
- ya asignados;
- pendientes;
- grupo;
- código;
- nombre.

### `admin_obtener_detalle_mesa(p_mesa_id)`

Devuelve:

- capacidad;
- ocupación;
- lugares disponibles;
- asignaciones activas de la mesa.

### `admin_asignar_mesa(...)`

Crea o actualiza la asignación del invitado en esa mesa.

Valida cupo de la mesa y confirmación vigente.

### `admin_retirar_asignacion_mesa(...)`

Realiza retiro lógico de la asignación.

No borra físicamente el registro.

### `admin_historial_mesas(p_limite)`

Devuelve el historial reciente de configuración y asignaciones.

## Auditoría

Se registran:

- `asignado`;
- `reasignado`;
- `asignacion_retirada`;

con:

- administrador;
- motivo;
- datos anteriores;
- datos nuevos;
- fecha/hora.

## Pruebas recomendadas

1. Ejecutar `10_admin_asignaciones_mesas.sql`.
2. Ejecutarlo nuevamente para validar idempotencia.
3. Consultar pendientes: deben aparecer solo asistentes confirmados.
4. Asignar 1 persona a una mesa.
5. Confirmar que `Editar configuración` quede bloqueado.
6. Confirmar ocupación de la mesa.
7. Intentar exceder capacidad de la mesa: debe rechazarse.
8. Intentar asignar más adultos/niños que los confirmados: debe rechazarse.
9. Dividir una invitación entre dos mesas.
10. Confirmar que desaparezca de pendientes cuando quede totalmente asignada.
11. Retirar una asignación y confirmar que reaparezca como pendiente.
12. Revisar `historial_mesas`.
