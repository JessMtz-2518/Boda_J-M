# Ajuste Dashboard + Estadísticas

Se eliminó de la gráfica de evolución el bloque desplegable:

`Consultar resumen y datos de los 30 dias`

El ajuste impacta tanto Dashboard como Estadísticas porque ambas pantallas reutilizan
el componente `admin/js/components/dashboard/evolution-chart.js`.

No se modificaron consultas, RPC, cálculos ni datos de la gráfica.
