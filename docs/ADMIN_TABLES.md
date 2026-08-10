# Mesas — Fase 1: configuración y modelo base

## Configuración inicial desde el módulo

La migración **no crea ninguna mesa automáticamente**.

Al abrir Mesas por primera vez, el panel deberá mostrar el estado:

**Aún no has configurado las mesas del evento.**

El administrador capturará:

- número de mesas;
- capacidad inicial por mesa;
- motivo de configuración.

Ejemplo para la boda:

- 27 mesas;
- 10 lugares por mesa;
- capacidad total calculada: 270.

Al guardar se generan automáticamente `Mesa 1` a `Mesa 27`.

Esto permite probar el flujo real desde cero y evita valores hardcodeados en la base.


## Validación obligatoria de capacidad

Antes de crear o reconfigurar las mesas, PostgreSQL calcula el **cupo máximo del padrón activo**:

`sum(adultos_asignados + ninos_asignados)` de todas las invitaciones con `activo = true`.

La configuración solo puede guardarse cuando:

`número de mesas × capacidad por mesa >= cupo máximo de invitados activos`

Ejemplo:

- 20 mesas × 10 = 200 lugares;
- cupo activo = 240;
- resultado: **CAPACIDAD_INSUFICIENTE**;
- faltan 40 lugares;
- la configuración no se guarda.

En cambio:

- 27 mesas × 10 = 270 lugares;
- cupo activo = 240;
- margen = +30;
- la configuración puede guardarse.

Esta regla vive en PostgreSQL, por lo que no puede omitirse desde DevTools ni llamando directamente a la RPC.

El frontend podrá usar los campos:

- `cupo_invitados_activos`;
- `margen_capacidad`;
- `capacidad_suficiente`;

para mostrar la validación en tiempo real y mantener deshabilitado **Guardar configuración** cuando la capacidad sea insuficiente.


## Regla de reconfiguración masiva

La carga general puede modificarse mientras **no exista ninguna asignación activa de invitados**.

Por ejemplo, antes de comenzar a sentar invitados será posible cambiar:

- 27 mesas × 10 personas;
- 25 mesas × 10 personas;
- 27 mesas × 12 personas;
- 30 mesas × 8 personas.

En cuanto exista al menos una asignación activa:

`admin_configurar_mesas(...)`

rechazará la operación con:

`CONFIGURACION_BLOQUEADA_ASIGNACIONES_ACTIVAS`

No se borran automáticamente asignaciones.

## Reconfiguración sin borrado físico

Si se reduce el número de mesas, las mesas sobrantes de la configuración general quedan `activo = false`.

Si luego se incrementa nuevamente, pueden reactivarse.

Esto preserva:

- IDs;
- historial;
- futuras referencias de asignación.

## Estructura de asignaciones

`public.asignaciones_mesa` permite dividir una invitación entre varias mesas.

Ejemplo para una confirmación de 3 adultos + 1 niño:

- Mesa 4 → 2 adultos
- Mesa 5 → 1 adulto + 1 niño

La Fase 1 crea la estructura pero **todavía no habilita la RPC de asignación**. Esa lógica se implementará en la siguiente fase con validaciones transaccionales.

## Tablas nuevas

### `public.configuracion_mesas`
Configuración global de carga base.

### `public.mesas`
Catálogo de mesas.

### `public.asignaciones_mesa`
Asignaciones de personas confirmadas a mesas.

### `public.historial_mesas`
Auditoría futura de configuración, mesas y asignaciones.

Todas tienen RLS habilitado y no conceden acceso directo a `anon` ni `authenticated`.

## RPC disponibles en Fase 1

### `admin_obtener_configuracion_mesas()`
Devuelve:
- número de mesas;
- capacidad inicial;
- capacidad inicial total;
- mesas activas;
- capacidad actual;
- si existen asignaciones;
- si la configuración puede modificarse;
- versión para concurrencia.

### `admin_configurar_mesas(...)`
Reconfigura cantidad y capacidad base solo si no existen asignaciones activas.

Requiere:
- número de mesas;
- capacidad;
- motivo obligatorio;
- versión actual.

Registra auditoría.

### `admin_resumen_mesas()`
Devuelve:
- mesas activas;
- capacidad total;
- personas confirmadas;
- personas asignadas;
- pendientes de asignar;
- lugares disponibles.

### `admin_listar_mesas()`
Devuelve cada mesa con:
- capacidad;
- ocupados;
- disponibles;
- porcentaje;
- estado `disponible`, `casi_llena` o `completa`.

## Pruebas después de ejecutar el SQL

1. Ejecutar `09_admin_mesas.sql`.
2. Ejecutarlo una segunda vez para comprobar idempotencia.
3. Confirmar que `public.configuracion_mesas` esté vacía.
4. Confirmar que `public.mesas` esté vacía.
5. `admin_obtener_configuracion_mesas()` debe devolver `configurado = false`.
6. Confirmar que también devuelve el `cupo_invitados_activos`.
7. Intentar guardar una capacidad inferior al cupo activo: debe devolver `CAPACIDAD_INSUFICIENTE` y no crear mesas.
8. Capturar una configuración suficiente, por ejemplo 27 mesas de 10 lugares.
9. Confirmar 27 mesas activas, capacidad total 270 y margen correcto.
10. Confirmar auditoría `configuracion_inicial`.
11. Reconfigurar antes de asignar invitados y confirmar auditoría `reconfigurado`.
12. Después de crear una asignación activa, confirmar que la reconfiguración masiva quede bloqueada.

## Siguiente fase

**Mesas — Fase 2: asignación de invitados**

Se agregarán:
- listado de asistentes pendientes;
- asignar mesa;
- dividir una invitación;
- retirar/reasignar;
- validación de capacidad;
- validación contra confirmación vigente;
- actualización automática de lugares pendientes;
- detalle de cada mesa.
