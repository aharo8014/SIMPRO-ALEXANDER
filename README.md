# SIMPRO-7 | Simulador PROANDES

Simulador web (7 días) con estética tipo Netflix para administrar producción, inventarios, calidad, mantenimiento y compras en el caso **PROANDES Manufacturing S.A.**

## Ejecutar

Opción simple:
- Abrir `index.html` en navegador.

Opción servidor local:
```bash
python3 -m http.server 8000
```
Luego visita `http://localhost:8000`.

## Mejoras implementadas

- Simulación más retadora: la eficiencia ya no se mantiene igual, varía por día según eventos, decisiones y brechas.
- Rangos diarios visibles para P1/P2/P3, horas extra y mantenimiento preventivo.
- Penalización explícita por operar fuera de rango (impacta eficiencia, costos y puntaje).
- Historial con indicador de **brecha vs rango** para entender cuánto faltó o cuánto se excedió.
- Cierre semanal con validación de nombre obligatorio antes de generar PDF.
- PDF más estético (portada visual, secciones mejoradas, resumen ejecutivo, resultados diarios y recomendaciones).
