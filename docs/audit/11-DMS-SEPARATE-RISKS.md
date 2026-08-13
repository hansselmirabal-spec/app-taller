# 11 — Riesgos de integración DMS (fuera del núcleo, documentado por separado)

Auditor: HM (con contexto directo de sesiones previas de trabajo sobre este módulo).
Alcance: solo documentar dependencias, riesgos y deuda — **no rediseñar ni corregir** (instrucción explícita del pedido, sección 16).

## Dependencias actuales

- El módulo `apps/api/src/modules/dms-sync/` integra con el DMS de Grupo Cóndor de dos formas simultáneas: **sync materializado** (batch, escribe una copia local) y **conexión en vivo** para datos de sucursales/asesores.
- Fuente de datos migrada durante el desarrollo de MySQL `controltiempo.ot_master` (servidor DMS, 53.103.13.113:3306) — reemplazó una vista espejo en SQL Server (`MYSQL_DW.dbo.MasterOT`) que estaba desactualizada. El acceso es **solo lectura**.
- El sistema depende de columnas/estados del DMS externo (`idestado_ot`, `estados_ot.estado`) para determinar qué OTs están abiertas/operativas.

## Riesgos identificados

**DMS-01 — Columna de cierre formal de OT sin resolver**
Descripción: existe un bug pendiente (no corregido en esta sesión, marcado explícitamente como fuera de alcance): el campo `fecha_cierre_ot` se está escribiendo como NULL literal porque no está claro cuál columna real del DMS representa el cierre formal de una OT. Está pendiente de que el usuario confirme la columna correcta contra el negocio real.
Impacto: cualquier reporte/reglas que dependan de "fecha de cierre real de OT" están usando un dato ausente hoy.
Severidad: **P1** (no bloquea el core de Chapería, pero sí cualquier reportería que use esa fecha)
Bloquea producción del CORE: **No** (según alcance explícito de esta auditoría — el CORE es Chapería/Capacidad/Agenda, no la integración DMS completa)

**DMS-02 — Doble fuente de datos (materializado + en vivo) sin regla explícita de cuál gana**
Descripción: al convivir un sync materializado (batch, puede estar desactualizado) con una conexión en vivo, hay riesgo de que dos partes de la UI muestren datos distintos del mismo vehículo/OT según cuál fuente consultaron, sin que quede claro para el usuario cuál es "la verdad" en cada pantalla.
Impacto: confusión operativa, no pérdida de datos.
Severidad: **P2**
Bloquea producción del CORE: **No**

**DMS-03 — Dependencia de un sistema externo fuera de control del equipo**
Descripción: el DMS de Cóndor es un sistema de terceros; cambios de schema, caídas de red o cambios de credenciales de ese lado no están bajo control de este equipo y pueden romper silenciosamente la sincronización.
Impacto: si el DMS cambia sin aviso, la sync puede fallar silenciosamente si no hay alertas (no se auditó si existen alertas de fallo de sync en esta pasada — recomendado como seguimiento).
Severidad: **P2**
Bloquea producción del CORE: **No**

## Conclusión

Ninguno de los riesgos DMS listados bloquea el Go-Live del núcleo (Capacidad/Agenda/Chapería/Seguimiento), que no depende funcionalmente de que el DMS esté 100% resuelto para operar. Se documentan para que no se pierdan de vista, tal como pide explícitamente el alcance de esta auditoría (sección 16: "si alguna dependencia DMS impide realmente que el CORE funcione en producción, señalarla explícitamente" — no es el caso hoy).
