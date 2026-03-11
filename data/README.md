# Data Files

This folder contains the two data files that power the Industry Graph Explorer.

## industries.json

An array of industry objects. Each object must have these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `RepCode` | string | ✅ | Unique code for the industry (e.g. `LAB001`) |
| `NameEnglish` | string | ✅ | English name of the industry |
| `NameNative` | string | optional | Italian or native language name |
| `Sector` | string | optional | Sector code: `MAN`, `WHL`, `RET`, `HEA`, `ICT`, `AGR`, `FIN`, `ENE`, `CON`, `EDU`, `SER` |
| `ValueChainStage` | string | optional | Stage: `Raw Materials`, `Processing`, `Components`, `Final Manufacturing`, `Distribution`, `Retail`, `Services` |
| `ATECOPrimary` | string | optional | Primary ATECO/NACE code |
| `Description` | string | optional | Short description shown in the sidebar |

### Example
```json
{
  "RepCode": "LAB001",
  "NameEnglish": "Medical Diagnostics Centres",
  "NameNative": "Laboratori Analisi Cliniche",
  "Sector": "HEA",
  "ValueChainStage": "Services",
  "ATECOPrimary": "8610",
  "Description": "Clinical analysis laboratories..."
}
```

## links.json

An array of link objects representing supply/value chain connections between industries.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `FromIndustryCode` | string | ✅ | RepCode of the upstream/supplier industry |
| `ToIndustryCode` | string | ✅ | RepCode of the downstream/customer industry |
| `Direction` | string | ✅ | `Downstream`, `Upstream`, or `Peer` |
| `StrengthScore` | number | optional | 1 (weak) to 5 (critical) |
| `LinkType` | string | optional | Short description of the relationship |

### Example
```json
{
  "FromIndustryCode": "PHR003",
  "ToIndustryCode": "MED002",
  "Direction": "Downstream",
  "StrengthScore": 5,
  "LinkType": "Supplies pharmaceutical products to distributors"
}
```

## How to update the data

1. Export your SQL `Industries` table to a spreadsheet.
2. Add/edit entries following the schema above.
3. Save as JSON (use Excel's export-to-JSON feature or a free converter at https://www.convertcsv.com/csv-to-json.htm).
4. Overwrite `industries.json` and/or `links.json` in this folder on GitHub.
5. The webapp updates automatically on the next browser refresh.
