# src/data/off/

Generated and kept current by `scripts/import_off_bulk.py` (§6.1, one-time) and
`scripts/sync_off_delta.py` (§6.2, ongoing) — not checked in yet, since both need
network access this repo's sandbox environment blocks (huggingface.co and
static.openfoodfacts.org respectively — see each script's module docstring for the
full explanation and what's actually been verified vs. not).

To populate this directory for the first time, run (after
`pip install -r scripts/requirements.txt`):

```
python scripts/import_off_bulk.py
```

This produces:

- **off_seed.json** — an array of `OFFFoodItem` (§4.2): India-tagged or
  curated-brand-matched OFF products (§6.1's filter).

After that, `scripts/sync_off_delta.py` keeps it current — this is what
`.github/workflows/off-sync.yml` runs on a schedule. It also produces/maintains:

- **sync-meta.json** — `{lastDeltaAppliedDate, lastFullReimportDate}` (§6.2), read and
  written by every sync run to decide whether to apply deltas or fall back to a full
  reimport (the "fortnight safety net").

You can run the delta sync manually too: `python scripts/sync_off_delta.py`. On a
repo that's never run the bulk import, this correctly falls back to a full reimport on
its own (no separate first-time setup step needed) — see
`sync_off_delta.py`'s `decide_sync_action`.
