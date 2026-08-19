# Chessbook — Checklist para ponerlo en remoto (producción)

Estado analizado contra el código real del repo el 2026-08-17.
Leyenda: ✅ Hecho · ⚠️ Parcial / a confirmar · ❌ Falta

## 1. Backend (FastAPI)

- [x] **Hosting** ✅ — `render.yaml` ya define `chessbook-api` como servicio Docker en Render
      (`backend/Dockerfile`), tal como sugiere la checklist. No hace falta elegir, ya está decidido.
- [ ] **Base de datos gestionada** ⚠️ — `render.yaml` espera un `DATABASE_URL` de Neon Postgres
      puesto a mano en el dashboard (`sync: false`). No es verificable desde el código si la
      instancia de Neon ya existe o sigue siendo un plan. **Confirmar/crear la instancia real.**
- [x] **Variables de entorno** ✅ (para lo que ya existe) — `JWT_SECRET`, `DATABASE_URL`,
      `CORS_ORIGINS` ya están fuera del código (`render.yaml` + `.env.example`).
      ❌ `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` no existen porque Stripe no está integrado
      todavía (ver sección 4).
- [x] **CORS configurado** ✅ — `main.py` lee `CORS_ORIGINS` de env var (no `*`), con default a
      `localhost` en dev y al dominio real de Render en producción. Ya está bien hecho.
- [x] **Migraciones** ✅ — Alembic inicializado de verdad: `backend/alembic/` con la revisión
      inicial generada y verificada contra `models.py` (commits `65d1f2a`, `10efdae`, `5fbb47a`).
      `alembic upgrade head` corre automáticamente al arrancar el contenedor (`backend/Dockerfile`,
      antes de `uvicorn`), tanto en `docker compose` como en Render — ya no depende de acordarse de
      ejecutarlo a mano. `Base.metadata.create_all(bind=engine)` se ha retirado de `main.py`.
      **Importante para adoptar Alembic en una BD ya existente** (creada por el antiguo `create_all()`,
      sin tabla `alembic_version`): `alembic upgrade head` fallará con `DuplicateTable` porque intentará
      recrear tablas que ya existen. En ese caso hay que ejecutar una sola vez
      `alembic stamp f68b422faa99` contra esa BD (marca la revisión inicial como ya aplicada, sin volver
      a correr los `create_table`). En local, la alternativa más simple es borrar el volumen
      (`docker compose down -v`, ver más abajo); esto no aplica a una instancia Neon real con datos.
- [x] **HTTPS** ✅ — automático en Render, nada que configurar. Se confirma solo al desplegar.

## 2. Frontend (React)

- [x] **Build de producción** ✅ — `npm run build` (Vite) ya existe y hay un `frontend/dist/`
      generado en el repo, así que ya se ha probado localmente.
- [x] **Hosting** ✅ — ya decidido: Render static site (`chessbook-frontend` en `render.yaml`),
      alternativa válida a Cloudflare Pages/Vercel que ya listaba la checklist original.
- [x] **Variable de entorno con URL del backend** ✅ (mejor de lo pedido) — no hace falta ninguna,
      el frontend llama a rutas relativas `/api/...` (`frontend/src/utils/api.js`) y Render hace
      rewrite proxy de `/api/*` al backend. Evita el problema de "olvidarse de cambiar `localhost`".
- [ ] **Dominio propio o subdominio** ❌ — de momento usa los `*.onrender.com` por defecto.

## 3. Autenticación

- [ ] Cookies `Secure`/`SameSite` — **N/A tal cual está planteado**: no usan cookies, usan JWT vía
      header `Authorization: Bearer`, con el token guardado en `localStorage`
      (`chessbook_token`). Nota aparte (no pedida en la checklist): `localStorage` es más expuesto
      a XSS que una cookie `httpOnly`; no es bloqueante para lanzar pero merece revisión futura.
- [x] JWT expiración razonable ✅ — 30 días fijos en `auth.py`. ❌ sin refresh token, pero es
      aceptable tal como dice la checklist ("si aplica").
- [x] **Recuperación de contraseña** ✅ — `POST /api/users/forgot-password` genera un token de un
      solo uso (hash SHA-256 almacenado, 60 min de validez) y lo envía por email vía Resend
      (`app/email.py`); `POST /api/users/reset-password` lo valida y actualiza la contraseña.
      Pantallas nuevas en `Login.jsx` ("Forgot password?") y `ResetPassword.jsx`. Limitado a
      5 peticiones/hora por IP (`app/rate_limit.py`) para evitar spam del endpoint.
      **Importante**: sin dominio propio verificado en Resend, el remitente gratuito
      `onboarding@resend.dev` solo puede entregar a la cuenta Resend del propio desarrollador,
      no a usuarios reales — el flujo funciona end-to-end pero solo entregará emails de verdad
      una vez se compre y verifique un dominio (ver sección 2, "Dominio propio"). Sin
      `RESEND_API_KEY` configurada (dev local), el link se escribe al log del backend en vez de
      enviarse por email.
      **Nota**: los usuarios que ya existían antes de este cambio recibieron un email placeholder
      no entregable (`userN-xxxx@chessbook.invalid`, migración `83fbf6fded67`) — no hay pantalla
      para que editen su email todavía, así que no podrán usar la recuperación de contraseña hasta
      que se añada esa opción en una tarea futura.

## 4. Pagos (Stripe)

- [ ] Todo ❌ — no hay ninguna integración de Stripe en el repo, ni backend ni frontend
      (cuenta live, producto/price, Checkout, webhook, páginas de éxito/cancelación: nada existe
      todavía).

## 5. Email transaccional

- [ ] ⚠️ **Parcial** — Resend ya está integrado (`app/email.py`, dependencia `resend` en
      `pyproject.toml`), pero de momento solo se usa para el reset de contraseña (§3). ❌ Sin
      email de bienvenida al registrarse, sin recibo (depende de Stripe, §4). El mismo bloqueo de
      dominio propio que afecta a la recuperación de contraseña aplica aquí: sin dominio verificado
      en Resend, no se puede enviar a usuarios reales.

## 6. Monitorización mínima

- [x] Logs ✅ — vienen gratis por defecto en el panel de Render, nada que configurar.
- [ ] Sentry ❌ — no integrado. Opcional según la checklist, pero recomendable antes de cobrar.

## 7. Legal/confianza mínima

- [ ] Términos de Servicio ❌ — no existe la página en el frontend.
- [ ] Política de Privacidad ❌ — no existe la página en el frontend.
- [ ] Aviso de cobro/cancelación ❌ — depende de que exista Stripe primero.

## 8. Backups

- [ ] ⚠️ Depende del proveedor real de la BD (Neon, mencionado en `render.yaml`). No es
      verificable desde el código — **confirmar manualmente en el dashboard de Neon** si el plan
      elegido incluye backups/point-in-time recovery, no asumirlo.

## 9. Fiabilidad en producción

- [ ] ⚠️ **Mitigación de código hecha; causa raíz sigue pendiente** — "Problems" (y cualquier
      pantalla que llame al backend nada más cargar) podía fallar por conexión en producción:
      causa confirmada en `frontend/src/utils/api.js`, el backend corre en el plan **free** de
      Render, que se duerme tras ~15 min de inactividad y tarda hasta ~1 minuto en despertar.
      Ya implementado (commits `b2b8e3d` y `5c36961`): un ping de calentamiento a `/api/health`
      nada más cargar la app, y el presupuesto de reintentos de `req()` ampliado para cubrir un
      arranque en frío completo. Esto es mitigación de código, no la solución de fondo — la causa
      raíz real (plan free de Render) sigue sin resolverse; ver "Orden de prioridad" más abajo,
      que ya lo enmarca así.

## 10. Alcance del producto — retirar minijuegos

- [x] **Quitar "Portal Chess", "Grandes Maestros" y "Compendio"** ✅ — eliminado en la limpieza de
      producción (commit `a03e788`, "Remove Portal Chess, Grandes Maestros, and Compendio
      minigames"). Era un roguelike de ajedrez construido sobre
      `PortalChess.jsx`/`PortalChessGM.jsx` (más `Compendium.jsx`, que era solo la pantalla de
      referencia de ese roguelike, no del repertorio de aperturas), sin ninguna dependencia del
      backend ni de la BD.

---

## Orden de prioridad real (ajustado al estado encontrado)

El backend/frontend en sí ya están más cerca de "listos para desplegar" de lo que la checklist
genérica sugiere — `render.yaml`, CORS y el proxy de API ya están bien resueltos. Los huecos
reales están en otro sitio:

1. ~~**Alembic real**~~ ✅ hecho — ver §1 "Migraciones". El siguiente bloqueante real es el punto 2.
2. **Confirmar la instancia de Neon** y hacer el primer deploy real de backend+frontend en Render
   para verificar que arranca en remoto con la BD gestionada de verdad.
3. **Mitigar los fallos de conexión en producción** (sección 9) — código rápido (warm-up ping +
   ampliar la ventana de reintentos) que se puede hacer ya; ver plan de ejecución. La solución de
   fondo (salir del plan free de Render) depende del punto 2 y de tener ya ingresos.
4. **Retirar los minijuegos** (sección 10) — reduce superficie a probar/mantener antes de cobrar;
   no bloquea nada de lo demás, se puede hacer en paralelo.
5. ~~**Recuperación de contraseña**~~ ✅ hecho — ver §3. Entrega real de emails a usuarios sigue
   bloqueada por el dominio propio (§2), igual que el resto de este punto 7.
6. **Stripe** completo (cuenta live, producto, Checkout, webhook, páginas éxito/cancelación).
7. **Email transaccional** — Resend ya integrado (§5), falta el email de bienvenida y el recibo
   (depende del punto 6).
8. **Legal mínimo** (Términos + Privacidad + aviso de cobro).
9. **Backups** — confirmar en el dashboard de Neon, no asumir.
10. **Sentry** — opcional, después de lo anterior.

Dominio propio (sección 2) es cosmético y puede ir en paralelo o después del primer deploy
funcional; no bloquea nada del resto.

**Plan de ejecución detallado** (puntos 3 y 4, ya totalmente especificados y listos para
implementar): `docs/superpowers/plans/2026-08-17-production-cleanup.md`.
