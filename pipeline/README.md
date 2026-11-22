# SIGHTLINE — pipeline agregasi

Pipeline Python yang mengubah data mentah GRID VALORANT (streaming `.zst`,
tidak pernah di-decompress utuh) menjadi agregat JSON kecil di `docs/data/`
yang dimuat frontend statis. Hanya stdlib + `zstandard`.

## Menjalankan

```bash
# Dari repo root. Data mentah ada di luar repo (lisensi hackathon-only).
export STL_DATA_DIR=~/workspace/cloud9/data/raw   # default: ../data/raw
python pipeline/aggregate.py [--limit N] [--heatmap-cap N] [--landing-cap N]
```

- `--limit N`: proses hanya N series pertama (untuk testing).
- Output: `docs/data/{meta,heatmaps,operators,anti-strat,self-scout,landing-zones}.json`
  + `pipeline/VALIDATION.md` (angka validasi run terakhir).
- Durasi run penuh (337 series): ±20–35 menit di VM ini.

## Mendapatkan data mentah (JANGAN git clone starter repo)

Clone repo starter GRID diblokir (risiko eksekusi hook/filter git). Unduh
file individual via HTTPS dan verifikasi ukurannya terhadap GitHub tree API:

```bash
BASE=https://raw.githubusercontent.com/cloud9esports/stl-hackathon-2026-grid-starter/main
curl -o $STL_DATA_DIR/val/series.csv $BASE/val/series.csv
curl -o $STL_DATA_DIR/val/events_<id>_grid.jsonl.zst $BASE/val/events_<id>_grid.jsonl.zst
curl -o $STL_DATA_DIR/supplement/<id>.jsonl.zst $BASE/val-ability-supplements/<id>.jsonl.zst
curl -o $STL_DATA_DIR/meta/teams.csv $BASE/meta/teams.csv   # + players/games/rosters
```

Daftar series yang dipakai: `pipeline/selected_series.csv` + alasannya di
`pipeline/SELECTION.md` (337 series: VCT Americas + Game Changers NA &
Championship + Masters Toronto). **Data mentah TIDAK PERNAH di-commit**
(`.gitignore` mengecualikan `*.zst`/`*.jsonl`); hanya agregat JSON yang
boleh masuk repo.

## Skema output (kontrak dengan frontend)

Semua koordinat ternormalisasi **0–1000** dari `map.bounds` di data
(`(x - min.x) / (max.x - min.x) * 1000`, di-clamp). Nama map Title Case
(`corrode` → `Corrode`). ID tim/pemain adalah **ID string GRID**
(mis. Cloud9 = `"79"`, Cloud9 GC = `"3429"`). Total `docs/data/` ≤ 8 MB.

| File | Isi |
|---|---|
| `meta.json` | `{generated_at, series_count, games_count, rounds_count, events_processed, teams: [{id, name}], players: [{id, name, team_id}], maps: [{name, bounds}], series_ids, heatmap_sampling, ...}` |
| `heatmaps.json` | Array titik cast `{map, team_id, player_id, agent, ability, side, x, y, round_time_bucket}`. `side`: `attack`/`defense`. Bucket: `0-20s`/`20-40s`/`40-60s`/`60s+`/`unknown`. |
| `operators.json` | Array per pemain `{player_id, player_name, team_id, maps: {map: {rounds_with_operator, operator_kills, buy_rate_by_round: {round_number: rate}, setup_positions: [{x, y, side}]}}}`. |
| `anti-strat.json` | Array `{team_id, map, tendency, n, frequency, response}` — respons dari template aturan, bukan LLM. |
| `self-scout.json` | Format sama, hanya untuk Cloud9 (`79`) + Cloud9 GC (`3429`). |
| `landing-zones.json` | Array `{map, team_id, player_id, ability, cast_x, cast_y, est_x, est_y, confidence, method}` — **ESTIMASI** (lihat caveat). |

## Cara kerja

1. **Seleksi** — `select_series()` memfilter `val/series.csv` (lihat
   `SELECTION.md`).
2. **Events pass (per series)** — streaming `.zst`: lacak game/map/round
   aktif, snapshot pemain di `game-started-round` (agent dari `character`,
   inventory Operator, posisi), titik cast di `player-used-ability`,
   kill Operator di `player-killed-player`, pickup di
   `player-pickedUp-item`. Sinyal per-round (cast, sel penempatan,
   pemegang Operator) di-flush saat round berikutnya dimulai.
3. **Supplement pass (per series)** — join `grid_event_id` →
   `player-used-ability` (hanya record `in_grid=true`); untuk ability
   lempar, proyeksi balistik → `landing-zones.json`.
4. **Agregasi** — kartu anti-strat/self-scout dari counter per-round;
   profil Operator dari bukti kepemilikan; heatmap/landing zone lewat
   reservoir sampling per map (cap 3000/250, seed 42) + downsampling
   sistematis bila total melebihi budget 8 MB.
5. **Validasi** — angka ditulis ke `VALIDATION.md`.

## Caveat data (jujur — baca sebelum memakai agregat)

1. **Bucket waktu round bersifat perkiraan.** GRID tidak memberi waktu
   round yang andal per event (`gameClock` melompat dan kadang negatif),
   jadi bucket dihitung dari `occurredAt` envelope relatif terhadap awal
   round proper (akhir freezetime bila event-nya masuk akal — 20–45 detik
   setelah round dimulai — jika tidak, round start + 30 detik). Cast saat
   buy phase dihitung sebagai `0-20s`. `occurredAt` kadang tertunda
   (teramati: freezetime-end round 1 series 2841238 tertunda 131 detik),
   sehingga sebagian kecil titik bisa salah bucket.
2. **Landing zone adalah ESTIMASI.** Model: kecepatan proyektil nominal
   per kelas ability + velocity pemain + gravitasi 800 u/s², tanah datar
   150 unit di bawah titik lempar. GRID tidak mempublikasikan kecepatan
   proyektil per ability, jadi confidence dibatasi ≤ 0.75 dan setiap item
   berlabel `method` yang menjelaskan asumsi ini. Hanya ability lempar
   berbusur balistik yang dimodelkan (daftar di `landing.py`); smoke
   berbasis peta, wall, drone, proyektil lurus/bergerak, dan teleport
   TIDAK disertakan.
3. **Kepemilikan Operator dari bukti, bukan asumsi.** Sumber utama:
   snapshot inventory di `game-started-round`/`game-ended-round` +
   `player-pickedUp-item` (id `operator`). Kill Operator dipakai sebagai
   bukti fallback bila tidak ada snapshot (jumlah round fallback dicatat
   di `VALIDATION.md`). `buy_rate_by_round[round_number]` = share game
   di mana pemain memegang Operator pada nomor round itu di map itu.
4. **Kartu anti-strat: frekuensi ability diukur terhadap round saat tim
   memainkan agent itu** (bukan semua round), dan harus mengalahkan
   baseline global pasangan (agent, ability) sebesar ≥ 0.15 — agar ability
   rutin (Astra menaruh star tiap round) tidak menjadi "kecenderungan".
   Ability dengan baseline > 0.90 dikecualikan. Sektor penempatan memakai
   referensi grid netral (A1–E5), karena data tidak memuat nama site.
   Minimum n = 5 round; maksimal 5 kartu per tim+map.
5. **Sampling heatmap.** Semua titik cast dihitung, tapi hanya sampel
   reservoir per map yang disimpan (cap 3000/map) agar total ≤ 8 MB.
   Jumlah total vs tersimpan dicatat di `meta.json.heatmap_sampling`.
   Reservoir bersifat uniform random (seed 42) — distribusi per
   tim/ability dalam sampel mengikuti distribusi aslinya.
6. **Agent `unknown`.** Agent diambil dari field `character` di
   state-lengkap; bila sebuah cast terjadi sebelum snapshot state-lengkap
   pertama di sebuah game (jarang), agent dicatat `unknown`.
7. **Nama tim/pemain** berasal dari event; bila tidak ada di event,
   dilengkapi dari `meta/*.csv`. Nama tim di event kadang bersufiks
   `(2)` (penanda GRID untuk tim kedua di series) — nama dari meta CSV
   (tanpa sufiks) lebih diutamakan bila tersedia.
