# G-Metrics — reglas de trabajo (leer antes de tocar nada)

App PWA (HTML + `app.js` + `styles.css`, Firebase) para un preparador físico. Idioma de la app y de la conversación: **español rioplatense**. El usuario no es técnico: explicar en lenguaje simple, con detalle, sin jerga.

## Publicar
- **Publicar = `node tools/release.js "qué cambió"`**. Hace, en orden: revisión estática → testing completo → versión de caché → commit → pull --rebase → push a `main`. Vercel despliega solo desde `main` (~1 min).
- **Nunca** hacer `git push` a mano ni subir archivos por la web de GitHub. **Nunca** publicar si `check.js` o `test.js` fallan (el script ya lo impide; no saltearlo).
- No tocar a mano `?v=` de `index.html` ni `CACHE_NAME` de `sw.js`: lo estampa `release.js`.
- Después de publicar, avisar al usuario con qué cambió y que puede tardar ~1 minuto; si tiene la app instalada, cerrar y reabrir.

## Departamento de testing (`tools/`)
- `node tools/check.js` — revisión estática (rápida): sintaxis, **todo botón (`onclick=…`) debe tener su función exportada a `window`**, versión de caché coherente, nada de archivos de prueba versionados.
- `node tools/test.js --quick` — 1 tamaño, para iterar. `node tools/test.js` — completo: escritorio 1280 oscuro, iPad 768 claro, celular 390 oscuro; **admin** (`harness/regress.js`) y **atleta** (`harness/athlete.js`). Usa la app REAL con Firebase falso (`harness/firebase_*.js`) y datos de prueba (`harness/seed_full.js`). Necesita Edge o Chrome (variable `BROWSER_PATH` si hace falta) y `npm install` dentro de `tools/` la primera vez.
- **Re-testing**: cada bug que se arregla suma su caso a `regress.js` o `athlete.js` (que falle antes del arreglo y pase después). Probar siempre **dos veces, en escenarios distintos**; no decir "ya está" sin haberlo corrido.
- Todo lo que se prueba es local y falso: **jamás tocar datos reales ni borrar nada de producción**. El código no debe mencionar `__db` / `__testUser`.
- Para ver algo con los ojos: `node tools/harness/server.js` (puerto 8735, después `node tools/harness/build.js`) y abrir `http://localhost:8735/`; sembrar datos con el contenido de `seed_full.js`.

## Reglas de código
- Estado global `S`; las pantallas son strings HTML dibujados por `renderMain()`; todo `onclick="fn()"` exige `window.fn = fn` (el `check.js` lo verifica).
- Guardados: usar `updateDocSafe` (FieldPath para claves con `.`/`/`), nunca escribir en un documento que no sea el del atleta en pantalla. Al cargar "en nombre de" un atleta, escribir en `personal/{uid del atleta}` y releer para confirmar.
- Nada de texto menor a 11 px, contraste legible en claro y oscuro, sin scroll horizontal de la página en 390 px, sin la palabra `undefined`/`NaN` en pantalla.
- **Cero carteles explicativos** (letra chica que explica para qué sirve algo). Solo mensajes de "no hay datos" y diálogos de confirmación para acciones destructivas. Los botones "?" de ayuda se conservan.
- Íconos de línea en vez de emojis decorativos (caritas de wellness y deportes se mantienen).
- Mantener la identidad de G-Metrics (acento navy); no copiar colores ni funciones de otras apps (Forza AR tiene la suya).
- Botones de volver: cada pantalla nueva debe volver al paso anterior real (ver `data-back` y `getNavSnapshot`/`applyNavSnapshot`).

## Datos (resumen)
`personal/{uid}`: `history["w{semanaAbsoluta}-{sesión}"]`, `_sessionLogs`, `wellness[fecha]`, `injuries`, `routineOverrides`, `coachNotes`, `oneRM`. `users/{uid}`: `assignedRoutine`, `routineAssignmentHistory[]` (fases con `startDate`). `routines/{id}` (con `ownerUid` si es propia de un atleta). Los registros de una fase anterior (fecha < inicio de la fase actual) se archivan con prefijo `p{n}-`.
