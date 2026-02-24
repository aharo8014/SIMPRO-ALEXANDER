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

## Funcionalidades incluidas

- Flujo de decisiones por día (1 a 7).
- Eventos operativos diarios del caso.
- Cálculo diario de producción buena, cumplimiento, eficiencia, costos y puntaje.
- Entregas obligatorias en días 3, 5 y 7.
- Cierre semanal con KPI final y diagnóstico automático.
- Generación de PDF automático al finalizar (jsPDF) con resumen y resultados diarios.
- Semáforo de desempeño en el PDF.
