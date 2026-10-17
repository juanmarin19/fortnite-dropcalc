/* =============================================================================
   Fortnite Drop Calculator — calculadora de drops del bus
   -----------------------------------------------------------------------------
   Todo el cálculo corre en el navegador: no hay backend ni API.

   Modelo (el mismo que usa Titan Dropcalc):
     · 3 clics: destino, entrada del bus y salida del bus (el 3º calcula).
     · 400 puntos candidatos repartidos sobre la línea del bus: t = l / 399.
     · Cada candidato se evalúa como tiempo de bus + tiempo de vuelo, y las
       rutas se ordenan por tiempo total de llegada.
     · Vuelo: si la distancia al destino es <= 100 uTitan, una sola caída libre;
       si no, se reparte 58% freefall / 28% glide / 8% cut-fall / 6% glide final.
     · Se dibujan hasta 3 rutas, separadas al menos 0.03 en t.
     · Velocidades: bus 73.3 · caída libre 48 · planeo 34 (uTitan/s), y
       1 uTitan = 104 unidades del juego.
   ============================================================================= */
(function () {
  'use strict';

  /* ======================= 1. MODELO (idéntico al original) ================= */

  const U = 104; // unidad base: i = distancia / 104
  const V_BUS = 73.3; // divisor de velocidad del bus
  const V_FREE = 48; // caída libre y cut-fall
  const V_GLIDE = 34; // planeo
  const CANDIDATES = 400; // muestras sobre la línea del bus
  const MIN_SEP_T = 0.03; // separación mínima en t (posición sobre el bus)
  const MAX_ROUTES = 3;
  const FR = { ff: 0.58, glide1: 0.28, cut: 0.08, glide2: 0.06 };

  const ROUTE_COLORS = ['#5b7fff', '#facc15', '#c0c0c0']; // línea 100
  const WIGGLE = [0, 0.05, -0.05]; // línea 512

  /* d(e, t, r) = { x: e.x + t.x*r*104, y: e.y + t.y*r*104 }  — línea 101-103 */
  function d(p, n, r) {
    return { x: p.x + n.x * r * U, y: p.y + n.y * r * U };
  }

  /* Evalúa un punto de salto concreto. Devuelve null si el salto coincide con
     el destino (o === 0). — líneas 449-490 */
  function evaluate(jump, landing, busStart) {
    const dx = landing.x - jump.x;
    const dy = landing.y - jump.y;
    const o = Math.sqrt(dx * dx + dy * dy);
    if (o === 0) return null;

    const n = { x: dx / o, y: dy / o };
    const i = o / U;
    const t_bus =
      Math.sqrt(Math.pow(jump.x - busStart.x, 2) + Math.pow(jump.y - busStart.y, 2)) / U / V_BUS;

    let c = t_bus;
    let deployPoint = null;
    let cutPoint = null;
    let reopenPoint = null;
    let reopenSeconds = null; // instante en que se llega al punto de reapertura
    const segments = [];

    if (i <= 100) {
      /* rama corta: una sola caída libre */
      const r = i / V_FREE;
      c += r;
      segments.push({ type: 'freefall', from: jump, to: landing, time: r });
    } else {
      /* reparto fijo 58 / 28 / 8 / 6 */
      const rFF = FR.ff * i;
      const rGL = FR.glide1 * i;
      const rCF = FR.cut * i;
      const rGL2 = FR.glide2 * i;

      const tFF = rFF / V_FREE;
      c += tFF;
      deployPoint = d(jump, n, rFF);
      segments.push({ type: 'freefall', from: jump, to: deployPoint, time: tFF });

      const tGL = rGL / V_GLIDE;
      c += tGL;
      cutPoint = d(deployPoint, n, rGL);
      segments.push({ type: 'glide', from: deployPoint, to: cutPoint, time: tGL });

      const tCF = rCF / V_FREE;
      c += tCF;
      reopenPoint = d(cutPoint, n, rCF);
      reopenSeconds = c; // acá se llega al marcador de reapertura
      segments.push({ type: 'cut-fall', from: cutPoint, to: reopenPoint, time: tCF });

      const tGL2 = rGL2 / V_GLIDE;
      c += tGL2;
      segments.push({ type: 'glide', from: reopenPoint, to: landing, time: tGL2 });
    }

    return {
      jumpPoint: jump,
      deployPoint: deployPoint,
      cutPoint: cutPoint,
      reopenPoint: reopenPoint,
      landingPoint: landing,
      totalTime: c,
      t_bus: t_bus,
      t_freefall: segments[0].time,
      reopenSeconds: reopenSeconds,
      segments: segments,
      reachable: true,
    };
  }

  /* Barrido de 400 candidatos + selección de las 3 mejores rutas. — 444-500 */
  function computeRoutes(landing, busStart, busEnd) {
    const all = [];
    for (let l = 0; l < CANDIDATES; l++) {
      const t = l / (CANDIDATES - 1);
      const jump = {
        x: busStart.x + (busEnd.x - busStart.x) * t,
        y: busStart.y + (busEnd.y - busStart.y) * t,
      };
      const ev = evaluate(jump, landing, busStart);
      if (ev) all.push(Object.assign({}, ev, { t: t, jumpPoint: jump }));
    }

    all.sort(function (a, b) {
      return a.totalTime - b.totalTime;
    });

    const out = [];
    for (const e of all) {
      if (out.every((s) => Math.abs(s.t - e.t) >= MIN_SEP_T)) {
        out.push(e);
        if (out.length === MAX_ROUTES) break;
      }
    }
    if (out.length < MAX_ROUTES) {
      for (const e of all) {
        if (out.indexOf(e) === -1) {
          out.push(e);
          if (out.length === MAX_ROUTES) break;
        }
      }
    }
    return out;
  }

  /* Etiqueta del original: bus + caída libre + primer planeo.
     OJO: eso es el instante en que se CORTA el planeador, y el marcador está
     dibujado en el punto de REAPERTURA, que se alcanza t_cutfall más tarde. */
  function originalLabelSeconds(route) {
    const g = route.segments.find((s) => s.type === 'glide' && s.to !== route.landingPoint);
    return Math.round(route.t_freefall + route.t_bus + (g ? g.time : 0));
  }

  /* Qué muestra el rótulo del marcador Re-Open:
       'reopen' = el instante real en que se llega a ese marcador (por defecto).
       'titan'  = la fórmula original, que apunta al corte del planeador y por eso
                  queda corta en t_cutfall: 12,8 s en el caso de prueba (dice 199 s
                  para un punto que se alcanza a los 212,2 s).                    */
  const BADGE_MODE = 'reopen';

  function reopenLabelSeconds(route) {
    if (route.reopenSeconds == null) return originalLabelSeconds(route);
    return BADGE_MODE === 'titan' ? originalLabelSeconds(route) : Math.round(route.reopenSeconds);
  }

  /* ======================= 2. MAPA ========================================= */

  const WORLD = 2600960;
  const HALF = 1300480;
  const BOUNDS = [
    [-HALF, -HALF],
    [HALF, HALF],
  ];

  const CRS = Object.assign({}, L.CRS.Simple, {
    code: 'BU',
    projection: L.Projection.LonLat,
    transformation: new L.Transformation(1 / WORLD, 0.5, -1 / WORLD, 0.5),
    scale: (z) => 256 * Math.pow(2, z),
    zoom: (z) => Math.log(z / 256) / Math.LN2,
    infinite: true,
  });

  const map = L.map('map', {
    crs: CRS,
    minZoom: 0,
    maxZoom: 7,
    zoomControl: false,
    attributionControl: false,
    zoomSnap: 0.5,
    zoomDelta: 0.5,
    maxBounds: BOUNDS,
    maxBoundsViscosity: 0.8,
  });

  /* ---- Teselas -------------------------------------------------------------
     Se enlazan directo desde fortnite.gg, que son las más nítidas para esta
     isla (su z=3 ya la cubre con 8x8 teselas). Su pirámide va de z=3 a z=8.
     Cuando Fortnite cambie de temporada hay que actualizar TILE_VERSION mirando
     `window.Data.map` en fortnite.gg.                                          */
  const TILE_VERSION = '42.30';

  const capaFgg = L.tileLayer(
    'https://fortnite.gg/maps/' + TILE_VERSION + '/{z}/{x}/{y}.webp',
    {
      tileSize: 256,
      minZoom: 0,
      maxZoom: 7,
      minNativeZoom: 3, // su pirámide empieza en z=3
      maxNativeZoom: 7,
      bounds: BOUNDS,
      noWrap: true,
      keepBuffer: 2,
      updateWhenIdle: true,
    },
  );
  capaFgg.addTo(map);

  map.fitBounds(BOUNDS, { padding: [12, 12], animate: false });

  /* ======================= 3. DIBUJO ====================================== */

  const layers = {
    landing: null,
    busStart: null,
    busEnd: null,
    busLine: null,
    routes: [],
  };

  /* Curva de los trazados secundarios — líneas 526-542 */
  function bow(from, to, r) {
    const ax = to.x - from.x;
    const ay = to.y - from.y;
    const o = Math.sqrt(ax * ax + ay * ay);
    const n = Math.max(20, Math.floor(o / 120));
    const ix = -ay / o;
    const iy = ax / o;
    const c = o * r;
    const pts = [];
    for (let t = 0; t <= n; t++) {
      const rr = t / n;
      const x = from.x + ax * rr;
      const y = from.y + ay * rr;
      const f = Math.sin(rr * Math.PI) * c;
      pts.push([y + iy * f, x + ix * f]); // [lat = y, lng = x]
    }
    return pts;
  }

  function pinIcon(color) {
    return L.divIcon({
      className: '',
      html:
        '<svg class="mk-pin" width="28" height="40" viewBox="0 0 28 40">' +
        '<path d="M14,38 C14,38 26,22 26,14 A12,12 0 0,0 2,14 C2,22 14,38 14,38 Z" fill="' +
        color +
        '" stroke="#fff" stroke-width="2"/>' +
        '<circle cx="14" cy="14" r="5" fill="#fff"/></svg>',
      iconSize: [28, 40],
      iconAnchor: [14, 40],
    });
  }

  function busPointIcon(color) {
    return L.divIcon({
      className: '',
      html:
        '<div style="width:18px;height:18px;background:' +
        color +
        ';border:2px solid #fff;border-radius:50%;box-shadow:0 0 8px ' +
        color +
        '80;"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  /* Iconos de los marcadores: los mismos archivos que usa el original
     (vendor/icons/paraplu.png y cut.png, arte de titandropm.com) y con el mismo
     tamaño, sombra y opacidad. kind = 'paraplu' (se despliega) | 'cut' (se corta). */
  function iconMarker(size, kind, badgeColor, badgeText, dim) {
    const img =
      '<img src="vendor/icons/' +
      kind +
      '.png" alt="" style="width:' +
      size +
      'px;height:' +
      size +
      'px;object-fit:contain;filter:drop-shadow(0 0 4px rgba(0,0,0,0.5));' +
      (dim ? 'opacity:0.7;' : '') +
      '">';
    return L.divIcon({
      className: '',
      html:
        '<div class="mk-icon">' +
        img +
        (badgeText
          ? '<div class="mk-badge" style="border:1px solid ' +
            badgeColor +
            '">' +
            badgeText +
            '</div>'
          : '') +
        '</div>',
      iconSize: [size, badgeText ? size + 20 : size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  function clearRoutes() {
    layers.routes.forEach((l) => map.removeLayer(l));
    layers.routes = [];
  }

  /* Trazado de las rutas — líneas 503-621 */
  function drawRoutes(routes) {
    clearRoutes();

    routes.forEach(function (route, k) {
      const primary = k === 0;
      const color = ROUTE_COLORS[k];
      const wig = WIGGLE[k];

      route.segments.forEach(function (seg) {
        const isLastGlide = seg.type === 'glide' && seg.to === route.landingPoint;

        let dash;
        let weight = primary ? 2.5 : 2;
        let opacity = primary ? 0.9 : 0.55;

        if (seg.type !== 'freefall' && (seg.type !== 'glide' || isLastGlide)) {
          if (seg.type === 'cut-fall') {
            weight = primary ? 2.5 : 2;
          } else if (isLastGlide) {
            dash = '6,5';
            weight = primary ? 2 : 1.5;
            opacity = primary ? 0.7 : 0.45;
          }
        } else {
          dash = '10,8';
          weight = primary ? 3 : 2.2;
        }

        const lineColor = isLastGlide ? '#94a3b8' : color;
        const pts =
          wig !== 0
            ? bow(seg.from, seg.to, wig)
            : [
                [seg.from.y, seg.from.x],
                [seg.to.y, seg.to.x],
              ];

        layers.routes.push(
          L.polyline(pts, {
            color: lineColor,
            weight: weight,
            opacity: opacity,
            dashArray: dash,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(map),
        );
      });

      /* punto de salto */
      const js = primary ? 14 : 10;
      layers.routes.push(
        L.marker([route.jumpPoint.y, route.jumpPoint.x], {
          interactive: false,
          zIndexOffset: primary ? 1200 : 900,
          icon: L.divIcon({
            className: '',
            html:
              '<div style="width:' +
              js +
              'px;height:' +
              js +
              'px;background:' +
              color +
              ';border:' +
              (primary ? 2 : 1) +
              'px solid #fff;border-radius:50%;box-shadow:0 0 8px ' +
              color +
              '80;"></div>',
            iconSize: [js, js],
            iconAnchor: [js / 2, js / 2],
          }),
        }).addTo(map),
      );

      /* DEPLOY */
      if (route.deployPoint) {
        const ds = primary ? 32 : 22;
        layers.routes.push(
          L.marker([route.deployPoint.y, route.deployPoint.x], {
            interactive: false,
            zIndexOffset: primary ? 1250 : 1050,
            icon: iconMarker(ds, 'paraplu', '#22c55e', primary ? 'DEPLOY' : '', !primary),
          }).addTo(map),
        );
      }

      /* CUT */
      if (route.cutPoint) {
        const cs = primary ? 32 : 22;
        layers.routes.push(
          L.marker([route.cutPoint.y, route.cutPoint.x], {
            interactive: false,
            zIndexOffset: primary ? 1100 : 1050,
            icon: iconMarker(cs, 'cut', '#a3e635', primary ? 'CUT' : '', !primary),
          }).addTo(map),
        );
      }

      /* Re-Open (sólo la ruta principal) — líneas 602-620 */
      if (route.reopenPoint && primary) {
        layers.routes.push(
          L.marker([route.reopenPoint.y, route.reopenPoint.x], {
            interactive: false,
            zIndexOffset: 1150,
            icon: L.divIcon({
              className: '',
              html:
                '<div class="mk-reopen"><div class="ring"></div>' +
                '<div class="lbl">Re-Open at ~' +
                reopenLabelSeconds(route) +
                's</div></div>',
              iconSize: [14, 36],
              iconAnchor: [7, 7],
            }),
          }).addTo(map),
        );
      }
    });
  }

  function drawLanding(p) {
    if (layers.landing) map.removeLayer(layers.landing);
    layers.landing = L.marker([p.y, p.x], {
      icon: pinIcon(state.color),
      zIndexOffset: 1000,
    }).addTo(map);
  }

  function drawBusPoint(which, p) {
    const old = which === 'start' ? layers.busStart : layers.busEnd;
    if (old) map.removeLayer(old);
    const color = which === 'start' ? '#00c8ff' : '#5b7fff';
    const mk = L.marker([p.y, p.x], {
      icon: busPointIcon(color),
      draggable: true,
      zIndexOffset: 800,
    }).addTo(map);
    mk.on('dragend', function () {
      const ll = mk.getLatLng();
      if (which === 'start') state.busStart = { x: ll.lng, y: ll.lat };
      else state.busEnd = { x: ll.lng, y: ll.lat };
      drawBusLine();
      recompute();
    });
    if (which === 'start') layers.busStart = mk;
    else layers.busEnd = mk;
  }

  /* Línea del bus: halo + trazo discontinuo — líneas 418-437 */
  function drawBusLine() {
    if (layers.busLine) map.removeLayer(layers.busLine);
    const a = state.busStart;
    const b = state.busEnd;
    if (!a || !b) return;
    layers.busLine = L.layerGroup([
      L.polyline(
        [
          [a.y, a.x],
          [b.y, b.x],
        ],
        { color: '#00d4ff', weight: 12, opacity: 0.2, lineCap: 'round', lineJoin: 'round' },
      ),
      L.polyline(
        [
          [a.y, a.x],
          [b.y, b.x],
        ],
        {
          color: '#00d4ff',
          weight: 5,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
          dashArray: '18, 14',
        },
      ),
    ]).addTo(map);
  }

  /* ======================= 4. ESTADO E INTERACCIÓN ======================== */

  const state = {
    landing: null,
    busStart: null,
    busEnd: null,
    color: '#ef4444', // color por defecto del destino (línea 337)
    mode: 2, // 2 = destino, 3 = puntos del bus, 4 = ruta calculada
    routes: [],
  };

  const $ = (id) => document.getElementById(id);

  const HINTS = {
    dest: 'Clic en el mapa: destino',
    bus1: 'Clic: punto 1 del bus',
    bus2: 'Clic: punto 2 del bus',
    done: 'Clic: nuevo destino',
  };

  function setHint() {
    $('hint').textContent =
      state.mode === 2
        ? HINTS.dest
        : state.mode === 3
          ? state.busStart
            ? HINTS.bus2
            : HINTS.bus1
          : HINTS.done;
  }

  function recompute() {
    if (!state.landing || !state.busStart || !state.busEnd) {
      state.routes = [];
      clearRoutes();
      return;
    }
    state.routes = computeRoutes(state.landing, state.busStart, state.busEnd);
    drawRoutes(state.routes);
  }

  function resetBus() {
    if (layers.busStart) map.removeLayer(layers.busStart);
    if (layers.busEnd) map.removeLayer(layers.busEnd);
    if (layers.busLine) map.removeLayer(layers.busLine);
    layers.busStart = layers.busEnd = layers.busLine = null;
    state.busStart = state.busEnd = null;
    state.routes = [];
    clearRoutes();
    setHint();
  }

  function resetAll() {
    resetBus();
    if (layers.landing) map.removeLayer(layers.landing);
    layers.landing = null;
    state.landing = null;
    state.mode = 2;
    setHint();
  }

  /* Cargar un destino + línea de bus de golpe (usado por la API de prueba). */
  function load(dest, busStart, busEnd) {
    resetAll();
    state.landing = dest;
    drawLanding(dest);
    state.busStart = busStart;
    state.busEnd = busEnd;
    drawBusPoint('start', busStart);
    drawBusPoint('end', busEnd);
    drawBusLine();
    state.mode = 4;
    recompute();
    setHint();
  }

  /* Mismo comportamiento que las líneas 656-674 */
  map.on('click', function (e) {
    const t = { x: e.latlng.lng, y: e.latlng.lat };

    if (state.mode === 2) {
      resetBus();
      state.landing = t;
      drawLanding(t);
      state.mode = 3;
      setHint();
      return;
    }

    if (state.mode === 3) {
      if (!state.busStart) {
        state.busStart = t;
        drawBusPoint('start', t);
        setHint();
        return;
      }
      state.busEnd = t;
      drawBusPoint('end', t);
      drawBusLine();
      recompute();
      state.mode = 4;
      setHint();
      return;
    }

    /* modo 4: el original NO hace nada aquí; nosotros reiniciamos el destino */
    resetBus();
    state.landing = t;
    drawLanding(t);
    state.mode = 3;
    setHint();
  });

  /* ======================= 5. BOTONES ===================================== */

  $('clearAll').addEventListener('click', resetAll);
  $('clearBus').addEventListener('click', function () {
    resetBus();
    if (state.landing) state.mode = 3;
    setHint();
  });

  setHint();

  /* API mínima para verificar desde la consola o con Playwright */
  window.DROPCALC = {
    computeRoutes: computeRoutes,
    evaluate: evaluate,
    originalLabelSeconds: originalLabelSeconds,
    reopenLabelSeconds: reopenLabelSeconds,
    state: state,
    map: map,
    capas: { fgg: capaFgg },
    load: load,
    /* Caso de prueba: destino al sur, bus de oeste a este */
    loadDemo: function () {
      load(
        { x: -154940, y: -477520 },
        { x: -909320, y: 215900 },
        { x: 795020, y: 129540 },
      );
    },
  };
})();
