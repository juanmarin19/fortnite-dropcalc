# Fortnite Drop Calculator

Calculadora de drops para Fortnite: marcás dónde querés caer y por dónde pasa el bus, y te
calcula **dónde saltar**, cuándo se despliega el planeador, cuándo se corta y cuándo se reabre,
con el tiempo de reapertura.

**Todo el cálculo corre en tu navegador.** No hay backend, ni API, ni login, ni se manda nada a
ningún servidor: es una carpeta de archivos estáticos.

## Cómo se usa

1. Un clic en el mapa marca el **destino** (el pin rojo).
2. Dos clics más marcan la **entrada** y la **salida** del bus (los dos círculos, arrastrables
   para ajustarlos).
3. Con el tercer clic ya te dibuja la ruta: 🔵 salto · 🪂 despliegue · ✂️ corte · 🟣 reapertura.

Los botones son **Limpiar bus** (vuelve a marcar el bus sin perder el destino) y **Limpiar todo**.

## El modelo

Está todo en `app.js`, en una sola constante por concepto.

| Concepto | Valor |
| --- | --- |
| Velocidad del bus | 73,3 uTitan/s |
| Caída libre (y caída tras el corte) | 48 uTitan/s |
| Planeador | 34 uTitan/s |
| Unidad | 1 uTitan = 104 unidades del juego |
| Caída directa | si la distancia al destino es ≤ 100 uTitan |
| Reparto (drop largo) | 58% freefall · 28% glide · 8% cut-fall · 6% glide final |
| Punto de salto | el que minimiza tiempoBus + tiempoAire, de entre 400 candidatos sobre la línea del bus |
| Rutas dibujadas | hasta 3, separadas al menos 0,03 en `t` (posición sobre el bus) |
| Rótulo Re-Open | el instante real en que se llega a ese marcador |

Dos detalles que conviene tener claros:

- **El punto de salto no es el punto del bus más cercano al destino.** El mínimo está donde el
  destino queda a `acos(vAire / vBus) ≈ 55°` del rumbo del bus; el punto de máxima cercanía está
  a 90° y cae *más adelante*, así que saltar ahí cuesta tiempo. Medido sobre 20.000 casos:
  +7,3 s de mediana y hasta +94,8 s de tiempo de llegada.
- **El rótulo Re-Open**: la fórmula clásica (`bus + caída libre + primer planeo`) apunta al
  instante del *corte*, no al de la reapertura, y queda corta en `t_cutfall` (12,8 s en el caso de
  prueba: dice 199 s para un punto que se alcanza a los 212,2 s). Acá se usa el instante real; si
  lo querés con la fórmula clásica, se cambia en `app.js`:
  `const BADGE_MODE = 'titan';`

## Correrlo en local

No necesita build ni dependencias, sólo un servidor estático cualquiera:

```bash
node serve.cjs        # -> http://127.0.0.1:8099   (PORT=xxxx para cambiar el puerto)
```

También podés abrir `index.html` directamente en el navegador (los tiles del mapa necesitan
internet).

## Publicarlo en GitHub Pages

No hace falta construir nada: el repo ya es la página.

**Settings → Pages → Source: _Deploy from a branch_ → Branch: `main` / `/ (root)` → Save.**

En un minuto queda en `https://<usuario>.github.io/fortnite-dropcalc/`.

## Mapa

Los tiles se enlazan directo desde fortnite.gg (`maps/{version}/{z}/{x}/{y}.webp`), que son los
más nítidos para esta isla. La versión que está puesta es la **42.30**. Cuando Fortnite cambie de
temporada hay que mirar `window.Data.map` en fortnite.gg y actualizar `TILE_VERSION` en `app.js`.

## Actualizar Leaflet

`vendor/` ya viene con Leaflet 1.9.4. Si querés volver a bajarlo:

```bash
node tools/vendor-leaflet.cjs
```

## Créditos y licencias

- Código: **MIT** — ver [LICENSE](LICENSE).
- [Leaflet](https://leafletjs.com) 1.9.4, BSD-2-Clause, incluido en `vendor/`.
- Iconos de despliegue y corte (`vendor/icons/paraplu.png` y `cut.png`): arte de
  [titandropm.com](https://titandropm.com/map/dropcalc), incluidos en el repo sólo para que los
  marcadores queden idénticos a los de ese sitio. Su servidor sirve las imágenes con
  `Cross-Origin-Resource-Policy: same-origin`, así que enlazarlas desde otra página no funciona.
  Si preferís no redistribuirlas, hay que redibujarlas.
- Tiles del mapa: © fortnite.gg / Epic Games. No se redistribuyen, se enlazan.
- Fortnite es una marca de Epic Games. Este proyecto no está afiliado a Epic Games.
