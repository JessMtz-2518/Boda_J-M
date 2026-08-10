# Estadísticas · Fase 1 — Pruebas

Esta fase reutiliza exclusivamente las RPC administrativas ya existentes del Dashboard:

- `admin_dashboard_resumen()`
- `admin_dashboard_estadisticas_grupo()`
- `admin_estadisticas_evolucion()`

No se agregó SQL y no se modificaron Dashboard, Invitados, Confirmaciones, login ni RSVP público.

## Validaciones funcionales

1. Abrir `Admin > Estadísticas`.
2. Confirmar carga de:
   - invitaciones activas;
   - porcentaje de respuesta;
   - asistentes confirmados;
   - porcentaje de ocupación.
3. Confirmar que el bloque secundario muestra:
   - pendientes;
   - asistirán;
   - no asistirán;
   - cupo aún no confirmado.
4. Comparar las cifras contra Dashboard.
5. Verificar distribución Asistirán / No asistirán / Pendientes.
6. Revisar los cuatro grupos:
   - Familia Marcos;
   - Familia Jess;
   - Amigos Marcos;
   - Amigos Jess.
7. Confirmar respuesta y ocupación por grupo.
8. Confirmar adultos/niños y asistentes por grupo.
9. Revisar última confirmación y tiempo promedio de respuesta.
10. Verificar la evolución de 30 días y su tabla accesible.
11. Pulsar `Actualizar` y comprobar que los datos se refrescan sin duplicarse.
12. Probar responsive en escritorio, iOS y Android.
13. Confirmar que no exista scroll horizontal en móvil.
14. Cerrar sesión desde Estadísticas y comprobar protección de ruta.

## Nota funcional

`Cupo aún no confirmado` representa:

`cupo total reservado - asistentes actualmente confirmados`

No significa necesariamente que esos lugares estén liberados: las invitaciones pendientes todavía podrían utilizarlos.
