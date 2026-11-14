# Algerian delivery reference data

The generated register contains **69 wilayas and 1541 communes**. It combines factual place names
from the [ONS June 2021 geographical code](https://www.ons.dz/IMG/pdf/code_geo_2021.pdf), the
[2026 territorial law 26-06](https://www.joradp.dz/FTP/jo-francais/2026/F2026025.pdf) (printed
pages 4–9), and [decree 26-206 naming wilayas 59–69](https://www.joradp.dz/FTP/jo-francais/2026/F2026040.pdf)
(printed page 5). The sources' SHA-256 digests are embedded in the generated module.

`build-register.py` extracts the bilingual 2021 tables and applies the 108 commune transfers
specified by the 2026 law. Spelling equivalences are explicit and parent-scoped; fuzzy matching
is not accepted. French/Arabic commune names retain the ONS labels. New wilaya Arabic labels
use the corresponding capital commune. The ONS heading extraction reverses 51 into 15 for
Ouled Djellal, while the rendered heading and commune rows show 51; this is explicitly corrected.
Bordj Badji Mokhtar's wrapped French heading is reconstructed. Both were visually checked.

Commune keys `ons2021-WWCC` preserve their source identity; they are **not invented 2026 official
codes**. Application UUIDs are deterministic within this dataset version. Changing a register
requires a new dataset version and an explicit rate-migration policy, never overwriting old
checkout/order snapshots. Administrative transitions do not establish a courier's service area.

Reproduce using the three official PDFs and Python with `pypdf`:

```sh
python tools/locations/build-register.py ONS_2021.pdf JO_2026_25.pdf JO_2026_40.pdf
pnpm exec prettier --write packages/backend/commerce/src/algeria-register.generated.ts
```

The local API imports this as **inactive reference preview** data only when local checkout is
explicitly enabled. It never seeds prices, enables commercial checkout, or changes old synthetic
destinations. Import refuses conflicting provenance or identities. Sellers configure coverage,
prices and the seller/courier COD collector. Commune rules override wilaya defaults, including
explicit exclusions; inheritance can be restored without deleting historical rate rows.
