# VOYAGE – web expedic (návrh)

Statický web z `_data/*.json` + `src/*.html` (Jinja2), build `python3 build.py` → `dist/`.
Nasazení: push do `main` → GitHub Action (`.github/workflows/deploy.yml`) → GitHub Pages. Ručně `./deploy.sh`.

- Expedice: `_data/expedice.json` (od/do ISO, termin_text, kapacita, volna_mista, cena, program, galerie, skryta).
  Každá viditelná má stránku `/expedice/<slug>/`, proběhlé jdou do archivu (build i main.js podle data).
- Administrace: `/admin/` přes webhunter-admin (id `voyage`), zapisuje `_data/*.json` a `img/uploads/…`.
  Přihlášky z formulářů: `POST /api/voyage/form` (formStore → sekce Přihlášky v adminu).
- Fotky v `img/` jsou WebP; build přidá `-sm` (640 px) pro srcset.
