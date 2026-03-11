# 🔗 Industry Graph Explorer

An interactive, browser-based tool to search Italian industries and explore their **supply chain / value chain connections** as an interactive mind-map style graph.

Built for **Plimsoll Italia** B2B publishing and market intelligence workflows.

---

## 🌐 Live app

Once GitHub Pages is enabled, your app will be available at:

```
https://plimsollitacustomerservice-star.github.io/industry-graph-explorer/
```

---

## ✨ Features

- **Full-text search** by industry name (English or Italian) or RepCode
- **Interactive graph** showing upstream suppliers, downstream customers, and peer industries
- **Filters**: direction (upstream/downstream/peer), minimum strength score, layout style
- **Sidebar details**: ATECO code, sector, value chain stage, description, neighbour list
- **Clickable nodes**: click any neighbour node to re-centre the graph on that industry
- **Two layouts**: force-directed (mind-map style) and hierarchical (supply chain top-to-bottom)
- **No backend required**: runs entirely in the browser from two JSON files

---

## 📁 File structure

```
industry-graph-explorer/
├── index.html          ← Main app page
├── app.js              ← All app logic (search, graph, filters)
├── data/
│   ├── industries.json ← All industry nodes
│   ├── links.json      ← All supply chain links
│   └── README.md       ← Data format documentation
└── README.md           ← This file
```

---

## 🚀 How to enable GitHub Pages (one-time setup)

1. Go to your repository: https://github.com/plimsollitacustomerservice-star/industry-graph-explorer
2. Click **Settings** (top menu)
3. In the left sidebar, click **Pages**
4. Under **Source**, select **Deploy from a branch**
5. Under **Branch**, choose `main` and folder `/ (root)`
6. Click **Save**
7. Wait 1–2 minutes, then visit: `https://plimsollitacustomerservice-star.github.io/industry-graph-explorer/`

---

## 📊 How to add your real industry data

### Step 1 – Export Industries from your SQL database

Run this SQL query in your database tool (pgAdmin, DBeaver, etc.):

```sql
SELECT
    RepCode,
    "Name - English"       AS NameEnglish,
    "Name - Native"        AS NameNative,
    s.SectorCode           AS Sector,
    ValueChainStage,
    ATECOPrimary,
    LEFT("ReportDefinitionEN", 200) AS Description
FROM Industries i
LEFT JOIN Sectors s ON i.SectorID = s.SectorID
ORDER BY RepCode;
```

Export the result as **CSV**, then convert to JSON at https://www.convertcsv.com/csv-to-json.htm

Save as `data/industries.json`.

### Step 2 – Export Links from IndustryLinks table

```sql
SELECT
    FromIndustryCode,
    ToIndustryCode,
    Direction,
    StrengthScore,
    LinkType
FROM IndustryLinks
ORDER BY StrengthScore DESC;
```

Export as CSV, convert to JSON, save as `data/links.json`.

### Step 3 – Upload to GitHub

1. Open https://github.com/plimsollitacustomerservice-star/industry-graph-explorer/tree/main/data
2. Click `industries.json` → click the **pencil icon** (Edit) → paste your new JSON → click **Commit changes**
3. Repeat for `links.json`
4. Refresh your GitHub Pages URL to see the updated graph

---

## 🎨 Sector colour codes

| Code | Sector | Colour |
|------|--------|--------|
| MAN | Manufacturing | 🔴 Red |
| WHL | Wholesale trade | 🟡 Yellow |
| RET | Retail | 🟢 Green |
| HEA | Healthcare | 🔵 Cyan |
| ICT | Information technology | 🔵 Blue |
| AGR | Agriculture | 🟢 Light green |
| FIN | Finance | 🟣 Purple |
| ENE | Energy | 🟠 Orange |
| CON | Construction | 🟤 Brown |
| EDU | Education | 🩵 Teal |
| SER | Other services | ⚫ Grey |

---

## ❓ FAQ

**Q: The graph is empty after searching.**  
A: Make sure the RepCode in `industries.json` exactly matches the codes used in `links.json`.

**Q: I want to add a new industry.**  
A: Add a new object to `industries.json` following the format in `data/README.md`.

**Q: I want to show Italian names instead of English.**  
A: In `app.js`, replace `ind.NameEnglish` with `ind.NameNative` in the node label line.

**Q: Can I make the app private?**  
A: GitHub Pages requires a public repo on free accounts. To make it private, use GitHub Pro or host via a private Netlify/Vercel deployment.

---

## 🛠️ Tech stack

- [Vis.js Network](https://visjs.github.io/vis-network/docs/network/) – graph rendering
- [Axios](https://axios-http.com/) – JSON loading
- Pure HTML + CSS + JavaScript – no framework, no build step
