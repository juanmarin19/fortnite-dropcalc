/* Vuelve a bajar Leaflet 1.9.4 a vendor/ (para actualizarlo o rehacerlo).
   Uso:  node tools/vendor-leaflet.cjs

   No hace falta para correr la página: vendor/ ya está en el repo. */
const fs = require('fs');
const path = require('path');

const BASE = 'https://unpkg.com/leaflet@1.9.4/dist';
const OUT = path.join(__dirname, '..', 'vendor');

const FILES = [
  ['leaflet.js', 'leaflet.js'],
  ['leaflet.css', 'leaflet.css'],
  ['images/marker-icon.png', 'images/marker-icon.png'],
  ['images/marker-shadow.png', 'images/marker-shadow.png'],
  ['images/layers.png', 'images/layers.png'],
  ['images/layers-2x.png', 'images/layers-2x.png'],
];

(async () => {
  for (const [from, to] of FILES) {
    const dest = path.join(OUT, to);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const res = await fetch(`${BASE}/${from}`);
    if (!res.ok) throw new Error(`${from}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) throw new Error(`${from}: sospechosamente chico (${buf.length} bytes)`);
    fs.writeFileSync(dest, buf);
    console.log(`ok  ${to}  (${(buf.length / 1024).toFixed(1)} KB)`);
  }
  console.log(`\nvendor/ listo (${FILES.length} archivos)`);
})();
