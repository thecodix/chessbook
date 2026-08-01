# Modo Sparring — Plan de implementación

Este plan añade un **modo nuevo, "Sparring"**, sin tocar el modo SM-2 lineal existente.
Ambos modos deben poder coexistir y compartir componentes de tablero.

Objetivo del modo Sparring: en vez de repasar la línea completa desde la raíz, el
usuario arranca en una posición intermedia conocida de su repertorio y juega contra
un rival que NO está obligado a seguir el libro del usuario — puede jugar cualquier
movimiento razonable. Esto testea reconocimiento de posición y comprensión, no solo
memoria de secuencia.

---

## Fase 0 — Verificación de estado actual (hacer primero, no asumir)

Antes de escribir código nuevo, inspeccionar:

1. Esquema de la tabla/modelo del árbol de repertorio (¿cómo se guardan nodos, FEN,
movimientos, padre/hijo?).
2. Esquema de las tarjetas SM-2 (¿qué campos tiene cada tarjeta: intervalo, ease
factor, repeticiones, next_review_date?).
3. Estructura actual de `Train.jsx` y qué endpoints consume.
4. Si ya existe integración con Stockfish (WebWorker) en el proyecto o si hay que
añadirla desde cero.

Reportar hallazgos antes de continuar a la Fase 1 si algo no coincide con lo asumido
en este documento.

---

## Fase 1 — Modelo de datos (backend)

No se necesita tabla nueva si el árbol de repertorio ya guarda nodos individuales
con su FEN. Añadir:

- Campo opcional en la tarjeta SM-2 (o tabla nueva `sparring_stats`) para trackear
aciertos/fallos en modo sparring por separado del modo lineal:

- `node_id`
- `sparring_attempts`
- `sparring_correct`
- `last_sparring_result` (correct | acceptable | wrong)

Razón de separarlo de las stats SM-2 normales: el modo sparring no debe alterar el
intervalo de repetición espaciada del modo lineal, para no contaminar el algoritmo
de repaso principal. Se usa como señal adicional de refuerzo, no como sustituto.

---

## Fase 2 — Lógica de selección de posición (backend)

Endpoint: `GET /sparring/next?color=white|black&min_rating_range=&max_rating_range=`

Algoritmo de selección:

1. Filtrar nodos del árbol de repertorio del usuario que:

- No sean nodos raíz (profundidad >= 2, para que ya haya contexto de apertura).
- Correspondan al color solicitado (el usuario mueve en ese turno).
2. Ponderar por probabilidad de selección:

- Peso mayor a nodos con `sparring_attempts` bajo (poco practicados en este modo).
- Peso mayor a nodos con SM-2 "maduro" (ease factor alto / repeticiones altas),
ya que ahí es donde tiene sentido testear reconocimiento fuera de contexto.
- Peso menor a nodos con `last_sparring_result == wrong` reciente (evitar
frustración repetida seguida; dejar que vuelva tras cooldown).
3. Devolver: FEN del nodo, `node_id`, color a mover, y el subárbol de movimientos
válidos según el repertorio del usuario desde ese nodo (para comparar después).

---

## Fase 3 — Lógica del "rival" (backend o frontend, decidir según latencia)

El rival no sigue el libro del usuario. Opciones, de más simple a más completa:

**Opción A (recomendada para v1):** el rival elige aleatoriamente entre las
respuestas que YA existen en el árbol de repertorio del usuario para ese nodo
(si el usuario tiene 3 líneas distintas anotadas contra 1.e4, el rival elige una
al azar). Ventaja: cero dependencia de motor externo, reutiliza datos existentes.
Limitación: no cubre líneas fuera del repertorio ya cargado.

**Opción B (v2):** integrar Stockfish WebWorker para que el rival juegue el mejor
movimiento o un movimiento aleatorio entre los N mejores (para variar). Requiere
más trabajo de integración pero da cobertura real fuera del repertorio conocido.

Empezar con Opción A. Dejar la interfaz de "elegir movimiento rival" como una
función intercambiable (`chooseOpponentMove(fen, repertoireNode)`) para poder
enchufar Stockfish más adelante sin reescribir el resto.

---

## Fase 4 — Evaluación del movimiento del usuario (backend)

Endpoint: `POST /sparring/evaluate`
Body: `{ node_id, fen_before, move_played }`

Lógica de clasificación:

1. Si `move_played` coincide con un movimiento existente en el árbol de repertorio
del usuario desde ese nodo → `correct`. Actualizar `sparring_stats`.
2. Si no coincide pero es de las Opción A (dentro de líneas conocidas por rival) →
n/a, esto es la respuesta del rival, no la del usuario — aclarar que esta
evaluación es solo sobre el movimiento del USUARIO.
3. Si no está en el árbol:

- v1 (sin motor): marcar como `unknown`, no penalizar duro, sugerir revisar la
línea y añadirla al repertorio si es razonable.
- v2 (con Stockfish): evaluar centipawn loss respecto al mejor movimiento.
Si pérdida < umbral configurable (ej. 50 centipawns) → `acceptable`.
Si pérdida mayor → `wrong`.
4. Devolver clasificación + el siguiente movimiento del rival (si la partida sigue).

---

## Fase 5 — Frontend (Train.jsx / nuevo componente)

- Crear `SparringMode.jsx` reutilizando el tablero de `Train.jsx` (extraer el
componente de tablero a uno compartido si aún no está separado de la lógica).
- Flujo:

1. Selector de color y rango de dificultad → llama a `/sparring/next`.
2. Renderiza tablero desde el FEN devuelto, en el turno correspondiente.
3. Usuario mueve con chess.js → llama a `/sparring/evaluate`.
4. Muestra feedback visual (verde = correct, amarillo = acceptable, rojo = wrong)
y el movimiento de respuesta del rival si aplica.
5. Al terminar la línea (rama del árbol se acaba o N movimientos), muestra resumen
de la sesión (aciertos/fallos) y ofrece repetir con nueva posición.
- Añadir una pestaña o toggle en la UI existente entre "Modo lineal (SM-2)" y
"Modo Sparring", sin mezclar el estado de ambos modos.

---

## Fase 6 — Testing y rollout

1. Probar con un repertorio pequeño de prueba (5-10 nodos) antes de usar el
repertorio real completo, para validar que la ponderación de selección no
siempre devuelve el mismo nodo.
2. Verificar que las stats de sparring NO afectan el intervalo SM-2 del modo lineal
(test explícito: jugar sparring varias veces sobre un nodo y confirmar que
`next_review_date` del modo lineal no cambia).
3. Feature flag o rama separada hasta validar UX antes de mergear a main.

---

## Orden sugerido de implementación

1. Fase 0 (auditoría) — obligatorio primero.
2. Fase 1 (modelo de datos) + Fase 2 (selección de posición) — backend puro,
testeable con curl/Postman antes de tocar frontend.
3. Fase 3 Opción A (rival simple) + Fase 4 v1 (evaluación sin motor).
4. Fase 5 (frontend).
5. Fase 6 (testing).
6. Iterar a Opción B / v2 (Stockfish) solo si el v1 valida que el modo es útil.

---

## Análisis de Fase 0 (hecho contra el código real del proyecto)

Antes de picar código, esto es lo que realmente hay en el repo hoy, comparado con lo
que este documento asume:

1. **No existe un "árbol de repertorio" con nodos/FEN/padre-hijo.** El modelo real
([`backend/app/models.py`](backend/app/models.py)) es plano:

   ```python
   class Opening(Base):        # id, name, color, description
   class Line(Base):           # opening_id, position, label, moves: JSON (lista de SAN), idea
   class LineProgress(Base):   # user_id, line_id, ease_factor, interval_days, repetitions, next_review, retention
   ```

   Cada `Line` es un array de SAN de una secuencia completa (~8-14 plies). No hay FEN
   guardado ni tabla de nodos — el FEN de una posición intermedia se deriva en el
   **cliente**, reproduciendo `line.moves` con chess.js (`buildHistory` en
   [`frontend/src/utils/chess.js`](frontend/src/utils/chess.js)).

2. **Las tarjetas SM-2 son por `Line` completa, no por nodo.** `LineProgress` tiene
una fila por `(user_id, line_id)`, no por posición intermedia. Hay que decidir
explícitamente que la madurez SM-2 se hereda de la línea entera a todas sus
posiciones intermedias, porque hoy no existe otra granularidad.

3. **`Train.jsx` no existe.** La pantalla equivalente es
[`frontend/src/screens/Study.jsx`](frontend/src/screens/Study.jsx), que ya tiene
modo "study" + modo "drill" (repaso guiado), botones de calidad SM-2, y usa el
componente compartido [`frontend/src/components/Board.jsx`](frontend/src/components/Board.jsx)
(también usado por `Problems.jsx` y `Endgames.jsx`) — el requisito de "componente de
tablero compartido" ya está resuelto de fábrica.

4. **Stockfish existe, pero no como WebWorker de frontend.** Es un proceso UCI
persistente en el **backend** (`app.state.stockfish`, gestionado con un
`asyncio.Lock`, arrancado en `main.py::startup_stockfish()`), usado hoy solo por
`analysis.py`. La Fase 3 Opción B de este plan asume "integrar Stockfish WebWorker"
en el navegador — no hace falta ni conviene: ya hay un motor vivo en el servidor
con su propio ciclo de vida. Meter un segundo motor en el cliente duplicaría
infraestructura.

5. **Ya existe una lógica de "árbol implícito por prefijo"** en
`games.py::_compute_gaps` (usada para el feature de coverage-gaps): agrupa todas
las `Line` de una `Opening` por prefijo de movimientos compartido
(`coverage[prefix_tuple][move] = [labels]`). Es exactamente el algoritmo que la
Fase 2 necesita para "encontrar posiciones intermedias y qué líneas pasan por
ahí" — reutilizable en vez de reinventarlo.

6. **Ya existe un helper para FEN-desde-prefijo en el backend:** `_fen_from_prefix(prefix)`
en `games.py`, que reproduce SAN vía `python-chess`. Cubre exactamente lo que Fase 2
necesita para "devolver el FEN del nodo" sin guardar FEN en la tabla.

### Correcciones de diseño por fase

- **Fase 1**: en vez de `node_id`, la clave natural de un "nodo sparring" es
`(line_id, ply_index)`, no una fila de árbol. `sparring_stats` debería tener PK
compuesta `(user_id, line_id, ply_index)`. Correcto en separar esto de
`LineProgress` para no contaminar el SM-2 lineal.

- **Fase 2**: falta contemplar que, al no haber árbol real, un mismo prefijo de
movimientos puede repetirse en varias `Line` de la misma `Opening` (p. ej. las
líneas del Dragón comparten el prefijo `e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6`).
Para que el "rival libre" (Fase 3 Opción A) tenga sentido, la selección de nodo
debería **priorizar explícitamente prefijos donde ≥2 líneas divergen** — en los
nodos donde solo hay una línea registrada, la Opción A degenera exactamente al
modo drill actual (cero valor añadido, el rival "elige aleatoriamente" entre una
sola opción).

- **Fase 3 Opción A**: coherente con el dato disponible, pero su cobertura real
depende de cuánta ramificación exista en el catálogo (24 líneas en 5 aperturas
actualmente — mejor que antes, pero sigue siendo poco denso en varios puntos).
Medir esto en Fase 0/6 antes de prometer valor de "testear reconocimiento":
contar cuántos prefijos con profundidad≥2 tienen realmente ≥2 continuaciones
distintas.

- **Fase 4 punto 1**: "si coincide con un movimiento existente en el árbol desde
ese nodo" debería comparar contra **todas** las líneas del usuario para ese
color que comparten el prefijo, no solo la línea de origen del nodo — el usuario
puede transponer a otra línea conocida por el mismo prefijo. Reutilizar
`stripSan`/`_strip` (ya existen en frontend y backend) para la comparación, no
reimplementar.

- **Autenticación**: falta explícitamente en el plan. Todos los routers de
progreso personal (`problems.py`, `endgames.py`, `repertoire.py`) usan
`Depends(get_current_user)`. `/sparring/next` y `/sparring/evaluate` deben
seguir el mismo patrón desde v1.

- **Convención de API**: montar bajo `/api/sparring/...` (como los demás routers
en `main.py`) y usar `alias_generator=to_camel` en los schemas Pydantic, igual
que el resto del backend.

### Resumen

La arquitectura conceptual del plan (separar sparring stats de SM-2, rival no
determinista, empezar sin motor) es sólida y bien secuenciada. El problema es que
asume un modelo de "árbol de nodos con FEN" que no existe — el repertorio real es
una lista de `Line`s planas. Esto no invalida el plan, pero cambia el diseño de
datos (Fase 1: clave compuesta `line_id`+`ply_index` en vez de `node_id`) y abre
una advertencia real de UX (Fase 2/3: la Opción A solo aporta valor donde ya hay
ramificación real, y hoy eso es limitado). Recomendado: actualizar el recuento de
"cuántos nodos con divergencia real" existen en el catálogo antes de construir la
Fase 5 completa.
