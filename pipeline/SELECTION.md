# Series selection — SIGHTLINE pipeline

Dipilih dari `val/series.csv` (857 series) dengan aturan di `aggregate.py`
(`EVENT_PREFIXES`): semua series yang nama event-nya diawali salah satu:

- `VCT Americas` — liga Cloud9 sendiri (fokus utama scouting).
- `Game Changers NA` — liga Cloud9 GC.
- `Game Changers Championship` — kejuaraan dunia GC (lawan-lawan top GC).
- `VALORANT Masters` — turnamen internasional (Masters Toronto).

Alasan: SIGHTLINE adalah konsol scouting untuk pelatih C9 VAL + C9 GC,
jadi dataset mencakup semua lawan yang relevan di liga mereka plus
panggung internasional. Tidak ada penambahan region Game Changers lain:
total sudah jauh di atas minimum 60 series.

Total terpilih: **337 series**.

## Per event

- Game Changers Championship - 2025: 18
- Game Changers NA - Kickoff 2026: 14
- Game Changers NA - Split 1 2025: 48
- Game Changers NA - Split 1 2026: 59
- Game Changers NA - Split 2 2025: 59
- Game Changers NA - Split 2 2026: 9
- VALORANT Masters - Masters Toronto: 24
- VCT Americas - Kickoff 2025: 22
- VCT Americas - Stage 1 2025: 42
- VCT Americas - Stage 2 2025: 42

## Daftar lengkap

Lihat `selected_series.csv` (series_id, event, stage, jadwal, tim).
File events + ability supplement untuk series ini diunduh via HTTPS
individual dari starter repo (BUKAN git clone — lihat README.md) dan
disimpan di luar repo (`$STL_DATA_DIR`), TIDAK PERNAH di-commit.
