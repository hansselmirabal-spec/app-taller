---
description: >
  Procesa una idea narrativa del usuario activando los agentes necesarios.
  Uso: /idea <descripción en lenguaje natural>
  Ejemplo: /idea quiero que el sistema avise cuando un técnico queda sobrecargado
argument-hint: "<descripción de la funcionalidad en lenguaje natural>"
---

# Comando /idea

HM recibe la idea y ejecuta este protocolo:

1. Traducir la idea a funcional técnico en 1 línea
2. Identificar qué agentes son necesarios (solo los relevantes)
3. Lanzar los agentes necesarios — en paralelo si no hay dependencias
4. Sintetizar outputs en un response coherente
5. Registrar decisión en CLAUDE.md

## Reglas de paralelismo para ideas
- SA + AUTO-BIZ → siempre paralelo (no se bloquean entre sí)
- BACK + UX → paralelo si la idea tiene impacto en ambos
- ARCH → siempre antes de BACK y UX si hay cambio en schema o API
- QA → siempre al final, después de SA y ARCH

## Formato de respuesta
```
[HM] Idea: {traducción funcional en 1 línea}
Agentes activados: {lista}

[SA] {casos de uso o reglas afectadas — si aplica}
[AUTO-BIZ] {validación de negocio — si aplica}
[ARCH] {impacto en schema o API — si aplica}
[BACK] {lógica o endpoint necesario — si aplica}
[UX] {componente o estado UI — si aplica}
[QA] {criterio de aceptación — si aplica}

[HM] Registrado en CLAUDE.md. Próximo paso: {acción concreta}
```
