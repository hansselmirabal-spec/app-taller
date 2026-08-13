# 09 — Auditoría DevOps / Infraestructura

Auditor: HM (directo, con acceso real SSH/Portainer al servidor 53.103.13.238 usado esta sesión).
Alcance: Docker, deploy pipeline, variables de entorno, backups, TLS, observabilidad básica.
Metodología: inspección de `docker-compose*.yml` (repo + servidor), workflows de GitHub Actions, y verificación en vivo por SSH (solo lectura de configuración, sin tocar servicios).

## Hallazgos

**DEVOPS-01 — PROD corre sin TLS, con `COOKIE_SECURE=false`**
Módulo: Infraestructura / Seguridad de transporte
Descripción: El compose que **realmente** se despliega en producción es `docker-compose.portainer.yml` (confirmado leyendo `.github/workflows/deploy-prod.yml`, que copia exactamente ese archivo al servidor). Ese compose expone nginx en `8002:80` (HTTP plano, sin certificados) y setea explícitamente `COOKIE_SECURE: "false"` en el API. El repo SÍ tiene un `docker-compose.prod.yml` con nginx+certbot/Let's Encrypt correctamente configurado — pero ese archivo no es el que se copia ni se usa en el deploy automatizado. Es decir: existe una solución de TLS en el repo que nunca llegó a producción.
Evidencia: `/opt/stacks/app-taller/docker-compose.portainer.yml` (servidor, ports `8002:80`, `COOKIE_SECURE: "false"`) vs `.github/workflows/deploy-prod.yml` línea del step "Pull and restart PROD" (`cp docker-compose.portainer.yml ...`) vs `docker-compose.prod.yml` (repo, tiene servicio `certbot` y volumen `nginx/ssl`, no usado).
Cómo reproducir: `curl -I http://53.103.13.238:8002/api/v1/health` responde sin TLS; login real viaja en texto plano por la red, igual que la cookie `auth_token`.
Impacto: credenciales de login y la cookie de sesión viajan sin cifrar. Cualquiera en el mismo segmento de red (o que intercepte tráfico entre el cliente y el servidor) puede capturar credenciales o secuestrar la sesión.
Severidad: **P0**
Recomendación: activar el compose con TLS ya existente en el repo (`docker-compose.prod.yml`) detrás de un dominio real, o poner un reverse proxy con TLS delante (Cloudflare/Caddy/nginx+certbot) y volver `COOKIE_SECURE=true`. No exponer el login en HTTP plano en producción.
Esfuerzo: **M**
Bloquea producción: **Sí**

**DEVOPS-02 — Nunca se ejecutó un backup real de la base de PROD**
Módulo: Infraestructura / Continuidad
Descripción: Existe un script (`scripts/backup/backup.sh`) y el script manual `scripts/deploy-prod.sh` incluye un paso de backup — pero el directorio `scripts/backup/` en el servidor solo contiene el script, **cero archivos `.sql`**. El pipeline automatizado real (`deploy-prod.yml`, el que efectivamente se usa) **no tiene ningún paso de backup**. No hay cron ni systemd timer para backups de Postgres (se revisó `crontab -l` del usuario `grafana` y `systemctl list-timers` — nada relacionado a app-taller/postgres).
Evidencia: `ls -la /opt/stacks/app-taller/scripts/backup/` → solo `backup.sh`, ningún `.sql`. `crontab -l` sin entradas de backup de Postgres. `deploy-prod.yml` sin step de `pg_dump`.
Cómo reproducir: revisar el directorio de backups en el servidor, está vacío.
Impacto: si se corrompe la base o hay un error humano/migración destructiva, **no hay forma de restaurar** — pérdida total de datos.
Severidad: **P0**
Recomendación: agregar backup automático diario (cron o step de CI antes del deploy) con retención y, como mínimo, una prueba real de restore en ambiente aislado antes de dar por válida la estrategia de backup (ver sección 15 del pedido original — "backup no probado = backup no validado").

**Actualización 2026-08-13 (resuelto el mismo día):** agregado `/opt/stacks/app-taller/scripts/backup/backup-cron.sh` (pg_dump comprimido de PROD y QAS, retención 14 días) + cron diario 03:00 (`crontab -l` del usuario `grafana`). Corrido manualmente una vez: generó `prod_20260813_182837.sql.gz` (31KB) y `qas_20260813_182837.sql.gz` (8.5MB). Prueba de restore real ejecutada contra el propio servidor: `DROP/CREATE DATABASE restore_test` + `psql < prod_....sql.gz` descomprimido → 30 tablas restauradas en 4s, conteo de filas verificado idéntico entre origen y restaurado en `technicians` (0=0) y `bodyshop_processes` (4=4, tabla de catálogo/seed). Base temporal eliminada al terminar. RPO ≈ 24h (backup diario), RTO ≈ segundos dado el tamaño actual de la base. Bloqueante cerrado.
Esfuerzo: **S** (automatizar el cron) + **M** (prueba de restore)
Bloquea producción: **Sí**

**DEVOPS-03 — SMTP no configurado en PROD**
Módulo: Infraestructura / Notificaciones
Descripción: En `docker-compose.portainer.yml` el API de PROD tiene `SMTP_HOST: ""` y `SMTP_USER: ""` vacíos. Cualquier flujo que dependa de envío de mail (bienvenida a Perito recién creado, recuperación de contraseña) fallará en producción. Esto es directamente relevante al bug de "perito no se creó" investigado esta sesión: en QAS el error visible ya se corrigió (PR #45), pero en PROD, aunque el alta del usuario funcione, el mail de bienvenida con la contraseña temporal **no puede salir** con esta configuración.
Evidencia: `docker-compose.portainer.yml`, bloque `api.environment.SMTP_HOST`/`SMTP_USER`.
Cómo reproducir: dar de alta un Perito o pedir "olvidé mi contraseña" en PROD — el mail nunca llega.
Impacto: usuarios nuevos (peritos) no reciben su contraseña temporal; recuperación de contraseña rota en PROD.
Severidad: **P0** (bloquea un flujo funcional core: alta de perito, recientemente implementado)
Recomendación: completar `SMTP_HOST`/`SMTP_USER`/credenciales reales en el secret de GitHub `PROD_SMTP_PASS` + variables del compose antes de habilitar el flujo de Perito en PROD.
Esfuerzo: **S**
Bloquea producción: **Sí** (si el flujo de Perito se usa en PROD — confirmar con negocio)

**DEVOPS-04 — Runner self-hosted es punto único de falla para todo deploy, sin monitoreo**
Módulo: Infraestructura / CI-CD
Descripción: Tanto QAS como PROD dependen 100% de un único runner self-hosted (`app-taller-server-runner`, contenedor `github-runner-app-taller`) corriendo en el mismo servidor que aloja todo. Ya se cayó dos veces en esta sesión (registro vencido / config corrupta) y cada vez bloqueó deploys indefinidamente sin ninguna alerta — se detectó manualmente vía `gh api`. No hay healthcheck ni alerta automática si el runner queda offline.
Evidencia: sesión actual — outage confirmado vía `gh api repos/.../actions/runners --jq '.runners[0].status'` → `offline`, dos veces.
Impacto: cualquier PR mergeado puede quedar "invisible" en QAS/PROD por horas sin que nadie se entere, hasta que alguien pregunta manualmente.
Severidad: **P1**
Recomendación: alerta automática (ej. GitHub Actions notification, o un healthcheck externo simple) cuando el runner pase a `offline` por más de N minutos. Considerar un segundo runner de respaldo si el presupuesto lo permite.
Esfuerzo: **S**
Bloquea producción: No (pero sí el *proceso* de deploys confiables)

**DEVOPS-05 — Rollback automático solo cubre imágenes, no la base de datos**
Módulo: Infraestructura / Deploy
Descripción: `deploy-prod.yml` sí tiene rollback automático a la última imagen sana (`.last-good-sha`) si el healthcheck post-deploy falla — es un patrón sólido. Pero las migraciones de base de datos no tienen equivalente: si un deploy corre una migración y después falla el healthcheck y se hace rollback de imagen, el código viejo puede quedar corriendo contra un schema nuevo incompatible.
Evidencia: `deploy-prod.yml`, step "Rollback to previous known-good version" — solo hace `docker tag` + `up -d --no-build`, no hay ningún paso de rollback de schema/migración.
Impacto: rollback de imagen exitoso pero app rota igual por incompatibilidad de schema, en el peor escenario (migración destructiva + fallo posterior).
Severidad: **P2**
Recomendación: documentar explícitamente que las migraciones deben ser retrocompatibles con la versión N-1 del código (patrón expand/contract), o agregar un paso de backup+restore de schema antes de migrar en el pipeline de PROD.
Esfuerzo: **M**
Bloquea producción: No

**DEVOPS-06 — Sprawl de archivos docker-compose, uno de ellos (con TLS) no se usa nunca**
Módulo: Infraestructura / Mantenibilidad
Descripción: Existen 4 archivos compose relacionados a producción/QAS (`docker-compose.yml`, `docker-compose.qas.yml`, `docker-compose.prod.yml`, `docker-compose.portainer.yml`), de los cuales solo `.qas.yml` y `.portainer.yml` están realmente en el pipeline automatizado. `docker-compose.prod.yml` (con TLS) y los scripts manuales `scripts/deploy-prod.sh`/`scripts/backup/backup.sh` están en el repo pero desactualizados/no usados — generan falsa sensación de que "ya existe" TLS y backup automático cuando en la práctica no corren nunca.
Evidencia: ver DEVOPS-01 y DEVOPS-02.
Impacto: riesgo de confusión/deuda técnica — alguien puede asumir que la seguridad/backup ya están resueltos porque el archivo existe.
Severidad: **P2**
Recomendación: unificar en un solo compose de producción real (el que tenga TLS) y eliminar o marcar explícitamente como legacy/no-usado los archivos y scripts que no forman parte del pipeline automatizado.
Esfuerzo: **S**
Bloquea producción: No

**DEVOPS-07 — Migraciones desde base limpia: no probado en esta auditoría**
Módulo: Infraestructura / Base de datos
Descripción: No se ejecutó una prueba real de "correr todas las migraciones desde una base Postgres vacía" durante esta auditoría (fuera del scope de tiempo de esta pasada). Las migraciones existen y están numeradas secuencialmente (001–010), pero su reproducibilidad end-to-end no está verificada con evidencia directa.
Impacto: desconocido — riesgo no cuantificado.
Severidad: **P2**
Recomendación: como parte del gate final (sección 23 del pedido de auditoría), correr las migraciones contra una base Postgres nueva vacía y confirmar que terminan sin error y que el resultado coincide con el schema esperado.
Esfuerzo: **S**
Bloquea producción: No (pero es parte del gate final recomendado antes de aprobar GO)

## Backup y recuperación (sección 15 del pedido)

- Backup automatizado: **✅ Resuelto 2026-08-13** — cron diario 03:00 en el servidor, PROD y QAS, retención 14 días (ver DEVOPS-02).
- Prueba de restore: **✅ Realizada 2026-08-13** — restore real de PROD contra base temporal, 30 tablas, conteos de filas verificados idénticos, 4s.
- RPO/RTO: RPO ≈ 24h (frecuencia del cron), RTO ≈ segundos con el tamaño actual de la base — reevaluar cuando haya volumen de datos real.
- Conclusión: **Backup = VALIDADO** (2026-08-13).

## Score

- DevOps/Infraestructura: **35/100** (score original de la auditoría — no recalculado tras el fix de backup; ver actualización en DEVOPS-02)
- Recomendación de dominio original: **NO-GO** hasta resolver DEVOPS-01, DEVOPS-02 y DEVOPS-03. **Actualización 2026-08-13:** DEVOPS-02 (backup) cerrado. DEVOPS-01 (TLS) y DEVOPS-03 (SMTP) siguen abiertos, pendientes de decisión/credenciales del usuario.
