# SIGHTLINE — Testing Notes

## Cara menjalankan lokal

```bash
cd docs/
python3 -m http.server 8000
# buka http://127.0.0.1:8000/
```

Tidak ada build step, tidak ada dependensi CDN — semua file self-contained.
Data dibaca dari `data/*.json` (agregat pipeline) dengan fallback otomatis
ke `data/mock/*.json` per file. Flag `USE_MOCK` di `js/data.js`
(`false` = coba data nyata dulu; `true` = selalu mock).

## Hasil tes — 23 Nov 2026 (~06:00 WIB)

### 1. Sintaks JavaScript — `node --check` ✅
- `js/maps.js` — OK
- `js/data.js` — OK
- `js/app.js` — OK

### 2. Validasi JSON mock — `python3 -m json.tool` ✅
- `data/mock/meta.json` — OK (3 tim, 15 pemain, 2 map)
- `data/mock/heatmaps.json` — OK (304 titik cast)
- `data/mock/operators.json` — OK (2 profil pemain)
- `data/mock/anti-strat.json` — OK (4 kartu)
- `data/mock/self-scout.json` — OK (2 kartu)
- `data/mock/landing-zones.json` — OK (3 zona estimasi)

### 3. Smoke test HTTP — `python3 -m http.server` + curl ✅
Semua aset mengembalikan HTTP 200:
- `/`, `/index.html`, `/css/style.css`
- `/js/maps.js`, `/js/data.js`, `/js/app.js`
- `/data/mock/meta.json`, `/data/mock/heatmaps.json`,
  `/data/mock/operators.json`, `/data/mock/anti-strat.json`,
  `/data/mock/self-scout.json`, `/data/mock/landing-zones.json`
- `/data/meta.json` mengembalikan 404 sesuai harapan (agregat pipeline
  belum ada) — loader fallback ke mock menangani kasus ini.

## Belum / tidak bisa diverifikasi di VM ini
- **Tampilan visual di browser** (render SVG heatmap, layout responsif,
  kualitas desain): butuh cek browser nyata — belum dilakukan.
- **Alur interaksi end-to-end** (klik filter → heatmap berubah, toggle
  self-scout, print scout card): logika ditulis dan sintaks lolos,
  tapi belum diuji klik-per-klik di browser.
- **GitHub Pages live**: setelah push, verifikasi URL Pages menampilkan
  aplikasi dengan data mock.
- **Data nyata pipeline**: loader fallback belum teruji terhadap
  `docs/data/*.json` asli (belum ada saat tes ini).
