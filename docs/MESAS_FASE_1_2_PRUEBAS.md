# Mesas · Fase 1.2 — Pruebas de configuración inicial

## Estado inicial
1. Abrir Admin > Mesas.
2. Debe mostrar “Aún no has configurado las mesas”.
3. No deben existir mesas precargadas.

## Validación de capacidad
4. Confirmar que “Cupo requerido” coincide con el cupo máximo de invitaciones activas.
5. Capturar una capacidad inferior al cupo requerido.
6. Debe mostrar “Capacidad insuficiente”.
7. Debe indicar cuántos lugares faltan.
8. “Guardar configuración” debe permanecer deshabilitado.
9. Capturar una capacidad igual al cupo requerido: debe permitir avanzar.
10. Capturar capacidad superior: debe mostrar el margen disponible.

## Creación
11. Capturar motivo.
12. Guardar una configuración suficiente.
13. Debe crear automáticamente el número de mesas indicado.
14. Debe mostrar resumen y tarjetas de mesas.
15. Confirmar en Supabase la auditoría `configuracion_inicial`.

## Reconfiguración antes de asignar
16. Pulsar “Editar configuración”.
17. Reducir/aumentar mesas o capacidad conservando capacidad suficiente.
18. Guardar con motivo.
19. Debe actualizar las mesas sin duplicarlas.
20. Confirmar auditoría `reconfigurado`.

## Responsive
21. Probar configuración en iOS.
22. Probar configuración en Android.
23. Confirmar que el teclado no provoque zoom permanente.
24. Confirmar que no haya scroll horizontal.

La reconfiguración bloqueada por asignaciones se probará en la Fase 2, cuando existan asignaciones reales.
