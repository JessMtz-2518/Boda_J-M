# Fase 3.5A — Arquitectura de gestión de invitados

## Alcance

Esta fase incorpora exclusivamente la capa de datos para administrar invitaciones existentes. No crea la interfaz, no modifica el RSVP público y no habilita todavía el alta de nuevas invitaciones.

La futura Fase 3.5B añadirá `admin_crear_invitado(...)`. PostgreSQL generará el código y `token_acceso`; el navegador nunca los propondrá manualmente. La acción `creado` ya está permitida en el historial para que ambas fases compartan el mismo modelo de auditoría.

## Flujo de datos

```text
Panel administrativo
        ↓ RPC autenticada
Funciones public.admin_*
        ↓ autorización en cada llamada
private.es_administrador_activo()
        ↓ lectura o mutación controlada
private.admin_invitados_gestion + tablas calificadas
        ↓
Respuesta JSON versionada
```

El navegador no recibe permisos directos sobre `invitados`, `confirmaciones`, `historial_invitados`, `historial_confirmaciones` ni las vistas privadas.

## Convención de respuestas

Todas las RPC devuelven la misma envoltura:

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-08-06T20:00:00+00:00",
  "data": {}
}
```

Los errores funcionales se comunican como excepciones PostgreSQL con mensajes estables, por ejemplo `REGISTRO_DESACTUALIZADO`, `INVITADO_NO_ENCONTRADO` o `CUPO_ADULTOS_MENOR_A_CONFIRMACION`. El frontend deberá traducirlos a mensajes genéricos y nunca presentar detalles técnicos de Supabase.

## Proyección privada

`private.admin_invitados_gestion` centraliza el estado vigente del invitado y su confirmación. Incluye datos sensibles para que las RPC autorizadas puedan entregar un detalle bajo demanda, pero:

- no contiene `token_acceso`;
- no tiene permisos para `anon` ni `authenticated`;
- no sustituye las validaciones de las RPC;
- representa `confirmado` como `asistira` y la ausencia de respuesta como `pendiente`.

## RPC administrativas

### `admin_listar_invitados(...)`

Responsabilidad: búsqueda, filtros, ordenamiento y paginación en servidor.

Parámetros:

| Parámetro | Regla |
|---|---|
| `p_busqueda` | Opcional, se recorta, máximo 100 caracteres; busca nombre, código, grupo y teléfono |
| `p_grupo` | Uno de los cuatro grupos existentes |
| `p_estado` | `pendiente`, `asistira` o `no_asistira` |
| `p_activo` | `true`, `false` o `null` para ambos |
| `p_con_ninos` | Se basa en niños asignados, no en niños confirmados |
| `p_sin_telefono` | `true` sin teléfono; `false` con teléfono |
| `p_con_notas` | `true` con notas; `false` sin notas |
| `p_pagina` | Entero mayor o igual a 1 |
| `p_tamano_pagina` | Solo 10, 20 o 50; predeterminado 20 |
| `p_orden` | `grupo`, `nombre`, `codigo`, `cupo_total`, `estado` o `fecha_actualizacion` |
| `p_direccion` | `asc` o `desc` |

El desempate final siempre usa `invitado_id`, lo que mantiene un orden estable. La lista devuelve `tiene_telefono` y `tiene_notas`, pero no devuelve teléfono, notas, mensaje RSVP ni token.

Contrato resumido:

```json
{
  "data": {
    "items": [
      {
        "invitado_id": 1,
        "codigo": "JM-FM-001",
        "nombre": "Ejemplo",
        "grupo": "Familia Marcos",
        "adultos_asignados": 2,
        "ninos_asignados": 0,
        "cupo_total": 2,
        "estado_confirmacion": "pendiente",
        "adultos_confirmados": 0,
        "ninos_confirmados": 0,
        "total_confirmado": 0,
        "activo": true,
        "tiene_telefono": true,
        "tiene_notas": false,
        "version": "2026-08-06T20:00:00+00:00"
      }
    ],
    "paginacion": {
      "pagina": 1,
      "tamano_pagina": 20,
      "total_registros": 92,
      "total_paginas": 5
    },
    "criterios": {}
  }
}
```

### `admin_obtener_invitado(p_id)`

Entrega bajo demanda:

- nombre, grupo y cupos editables;
- teléfono y notas completos;
- estado activo;
- confirmación vigente, incluido su mensaje;
- `version`, basada en `fecha_actualizacion`, para concurrencia optimista.

No devuelve el token.

```json
{
  "data": {
    "invitado": {
      "invitado_id": 1,
      "codigo": "JM-FM-001",
      "nombre": "Ejemplo",
      "grupo": "Familia Marcos",
      "adultos_asignados": 2,
      "ninos_asignados": 0,
      "cupo_total": 2,
      "telefono": "+52 55 0000 0000",
      "notas": null,
      "activo": true,
      "confirmacion": null,
      "version": "2026-08-06T20:00:00+00:00"
    }
  }
}
```

### `admin_actualizar_invitado(...)`

Modifica únicamente:

- nombre;
- grupo;
- adultos asignados;
- niños asignados;
- teléfono;
- notas.

Requiere `p_motivo` y `p_version`. El proceso bloquea la fila, compara la versión, valida el cupo y realiza actualización más auditoría en una sola transacción.

Si otro administrador modificó la fila, devuelve `REGISTRO_DESACTUALIZADO`. El cliente deberá cerrar o recargar el formulario antes de reintentar; nunca debe sobrescribir silenciosamente la versión nueva.

Una solicitud sin cambios devuelve `actualizado: false`, no cambia la versión y no genera un evento de auditoría.

### `admin_cambiar_estado_invitado(...)`

Activa o desactiva una invitación con motivo y versión obligatorios. No elimina ni altera la confirmación existente. Registra `desactivado` o `reactivado` dentro de la misma transacción.

Una solicitud que coincide con el estado actual devuelve `cambio_aplicado: false` y no genera auditoría.

### `admin_obtener_token_invitacion(p_id, p_proposito)`

Es la única RPC de esta fase que devuelve `token_acceso`. Los propósitos permitidos son:

- `copiar_enlace`;
- `generar_qr`;
- `vista_previa`;
- `whatsapp`.

El token se obtiene únicamente después de una acción explícita. No se registra en auditoría ni se conserva en listados. Una invitación inactiva produce `INVITACION_INACTIVA`, porque su enlace público tampoco puede utilizarse.

El frontend debe usar el token solo para construir la URL canónica con la utilidad ya existente y descartar la referencia cuando finalice la acción.

### `admin_obtener_historial_invitado(p_id)`

Mantiene separados los dos dominios:

```json
{
  "data": {
    "invitado": [],
    "confirmaciones": []
  }
}
```

`invitado` contiene cambios administrativos. `confirmaciones` contiene los eventos existentes del RSVP y sus correcciones administrativas futuras. Ninguno incluye el token del invitado.

## Auditoría

`public.historial_invitados` registra:

- invitado afectado;
- acción: `creado`, `actualizado`, `desactivado` o `reactivado`;
- valores anteriores y nuevos;
- UUID histórico del administrador;
- nombre del administrador al momento del cambio;
- motivo obligatorio de 1 a 1000 caracteres;
- fecha del evento.

`modificado_por` no tiene FK hacia `auth.users`: el historial permanece válido aunque la cuenta de Auth sea eliminada. La FK hacia `invitados` no usa cascada, coherente con la prohibición de eliminación física.

Los objetos `datos_anteriores` y `datos_nuevos` se construyen con listas explícitas de campos. Nunca se serializa la fila completa y nunca se almacena `token_acceso`.

## Concurrencia

La versión pública del registro es `invitados.fecha_actualizacion`. Para actualizar o cambiar el estado:

1. el detalle entrega `version`;
2. el cliente la devuelve sin transformarla;
3. la RPC bloquea la fila con `FOR UPDATE`;
4. la RPC compara la versión recibida con la vigente;
5. una diferencia produce `REGISTRO_DESACTUALIZADO`;
6. una operación exitosa devuelve la versión nueva.

La validación ocurre dentro de PostgreSQL y no depende de la interfaz.

### Concurrencia entre cupo y RSVP

La versión original de `validar_confirmacion()` consultaba el cupo sin bloquear la fila del invitado. Eso permitía que una reducción administrativa y una confirmación concurrente tomaran decisiones utilizando estados diferentes.

`06_admin_invitados.sql` redefine esa función con una corrección mínima de integridad: la lectura de `public.invitados` usa `SELECT ... FOR UPDATE`. No cambia estados, límites, mensajes ni ninguna otra regla funcional del RSVP.

La fila de `invitados` funciona como punto único de serialización:

```text
RSVP UPDATE: PostgreSQL bloquea confirmaciones → trigger bloquea invitados
RSVP INSERT: trigger bloquea invitados
ADMIN:       RPC bloquea invitados → lee confirmaciones mediante MVCC
```

La ruta administrativa no solicita después un bloqueo de fila sobre `confirmaciones`; únicamente lee su versión comprometida. Por ello no existe el ciclo `invitados → confirmaciones` que pudiera enfrentarse al orden del RSVP y producir un deadlock.

Comportamiento concurrente esperado:

- Si el RSVP obtiene y libera primero el bloqueo de `invitados`, la RPC administrativa ve la confirmación nueva y no permite reducir el cupo por debajo de ella.
- Si la RPC administrativa obtiene primero el bloqueo, el RSVP espera. Al continuar, el trigger lee el cupo nuevo y rechaza una confirmación que lo exceda.
- Si un RSVP ya bloqueó `confirmaciones` pero espera `invitados`, el administrador no espera esa fila de confirmación: termina su validación y libera `invitados`; después el RSVP revalida contra el cupo final.

Así se protegen en todo momento las invariantes:

```text
adultos_confirmados <= adultos_asignados
ninos_confirmados <= ninos_asignados
```

## Reglas de cupo

Antes de actualizar se consulta la confirmación vigente. Debe cumplirse:

```text
adultos_asignados_nuevos >= adultos_confirmados
ninos_asignados_nuevos >= ninos_confirmados
```

Reducir por debajo de lo confirmado produce un error funcional. La confirmación deberá corregirse mediante el futuro flujo administrativo correspondiente antes de reducir el cupo.

## Semántica histórica del código y grupo

`codigo` es un identificador histórico e inmutable. Su prefijo (`FM`, `FJ`, `AM` o `AJ`) representa el grupo con el que se creó originalmente la invitación:

- cambiar `grupo` no cambia `codigo`;
- el código anterior nunca se libera ni se reutiliza;
- el listado puede mostrar un código cuyo prefijo ya no coincide con el grupo vigente, y eso es correcto;
- la Fase 3.5B generará códigos según el grupo inicial de creación y resolverá la concurrencia en PostgreSQL.

`orden_grupo` representa una posición relativa dentro del grupo vigente. Si el administrador cambia el grupo, la RPC lo establece en `NULL`: conservar la posición anterior sería semánticamente incorrecto y podría producir empates arbitrarios en el grupo destino. Mientras no exista una herramienta de reordenamiento, los listados mantienen estabilidad mediante `invitado_id`. Si el grupo no cambia, `orden_grupo` se conserva.

## Invitaciones inactivas

- no equivalen a `no_asistira`;
- conservan confirmación e historiales;
- siguen visibles cuando el filtro las incluye;
- su enlace público deja de entregar una invitación válida por la regla ya existente del RSVP;
- no se entrega su token para compartir, QR, WhatsApp o vista previa;
- pueden reactivarse con una acción auditada.

## Seguridad y privacidad

- Todas las RPC son `SECURITY DEFINER` con `search_path = ''`.
- Todas validan `auth.uid()` y `private.es_administrador_activo()`.
- `PUBLIC` y `anon` no pueden ejecutarlas; solo `authenticated` recibe `EXECUTE`.
- RLS permanece activo y no se crean políticas de acceso directo.
- Los identificadores, filtros, versiones y propósitos se validan en servidor.
- El listado minimiza teléfono, notas y mensajes.
- Los nombres y textos recuperados deberán renderizarse con `textContent`.
- El frontend no deberá imprimir errores internos de Supabase.
- El portapapeles y el QR se activarán únicamente mediante una acción del administrador.

## Rendimiento y crecimiento

La paginación y filtros se ejecutan en servidor. Los índices cubren el recorrido principal y las consultas por historial. Los índices existentes de código, nombre y grupo se reutilizan.

La búsqueda flexible con `ILIKE '%texto%'` es suficiente para el volumen actual. Si el padrón crece significativamente, se evaluará `pg_trgm` y un índice GIN en una migración independiente; esta fase no habilita extensiones nuevas.

## Plan de pruebas previo a frontend

### Idempotencia y objetos

1. Ejecutar el script completo una vez.
2. Ejecutarlo nuevamente y confirmar ausencia de duplicados o errores.
3. Verificar tabla, vista, seis RPC, constraints e índices.

### Seguridad

Probar cada RPC como:

- `anon`;
- usuario `authenticated` no registrado;
- administrador inactivo;
- administrador activo.

Los tres primeros deben recibir acceso denegado. Confirmar además que `authenticated` no tenga `SELECT`, `INSERT`, `UPDATE` ni `DELETE` directo sobre tablas o vistas.

### Listado

- valores predeterminados;
- páginas 1 y posteriores;
- tamaños 10, 20 y 50;
- página 0 y tamaños no permitidos;
- búsqueda por nombre, código, grupo y teléfono;
- búsqueda vacía, de 100 caracteres y de 101 caracteres;
- todos los filtros de forma aislada y combinada;
- todos los ordenamientos en ambas direcciones;
- página sin resultados;
- confirmar orden estable por ID;
- confirmar ausencia de token, teléfono, notas y mensaje.

### Detalle

- invitado con y sin confirmación;
- invitado activo e inactivo;
- ID inexistente, nulo y negativo;
- verificar teléfono/notas y ausencia del token.

### Actualización y concurrencia

Realizar todas las pruebas dentro de `begin ... rollback`:

- actualizar cada campo permitido;
- normalizar espacios y valores opcionales vacíos;
- rechazar grupo, teléfono, nombre, notas o cupo inválidos;
- rechazar reducción por debajo de adultos o niños confirmados;
- versión vigente exitosa;
- versión antigua produce `REGISTRO_DESACTUALIZADO`;
- dos sesiones concurrentes sobre el mismo invitado;
- dos administradores editando simultáneamente con la misma versión: solo uno debe completar y el otro debe recibir `REGISTRO_DESACTUALIZADO`;
- un RSVP actualizando su confirmación mientras el administrador intenta reducir adultos o niños;
- un RSVP creando la primera confirmación mientras el administrador intenta reducir adultos o niños;
- ejecutar ambos escenarios anteriores invirtiendo cuál transacción adquiere primero el bloqueo;
- confirmar que el resultado final siempre cumple ambas invariantes de cupo;
- ejecutar las carreras repetidamente y comprobar ausencia de deadlocks y errores `40P01`;
- cambiar de grupo y comprobar que el código se conserva y `orden_grupo` queda en `NULL`;
- solicitud sin cambios no crea auditoría;
- cambio exitoso crea exactamente un evento y nunca contiene token.

### Activación

- desactivar y reactivar;
- motivo o versión ausentes;
- versión antigua;
- repetir el mismo estado;
- confirmar que la confirmación y ambos historiales permanecen intactos;
- confirmar que inactivo no cambia a `no_asistira`.

### Token

- los cuatro propósitos permitidos;
- propósito inválido o nulo;
- invitado inexistente;
- invitado inactivo;
- confirmar que no se genera auditoría y que ninguna otra RPC contiene token.

### Historial

- invitado sin eventos;
- invitado con actualizaciones y cambios de estado;
- invitado con primera respuesta y modificaciones RSVP;
- orden descendente estable;
- separación entre `invitado` y `confirmaciones`.

### Regresión

- `obtener_invitacion(uuid)` y `guardar_confirmacion(...)` conservan firma y permisos;
- Dashboard y sus cuatro RPC no cambian;
- login, logout y modo vista previa siguen funcionando;
- RSVP público permite consultar y actualizar una confirmación válida.

## Riesgos pendientes

- Los errores funcionales de PostgreSQL deben mapearse cuidadosamente en el servicio JavaScript futuro.
- El token existe temporalmente en memoria cuando se solicita; no debe persistirse en almacenamiento o logs.
- Una lista muy grande podría requerir búsqueda trigram en el futuro.
- La creación concurrente de códigos se resolverá en 3.5B con una estrategia transaccional específica; no debe implementarse en el frontend.
- Las correcciones administrativas de confirmaciones pertenecen a una fase posterior y deberán respetar la trazabilidad ya definida.
