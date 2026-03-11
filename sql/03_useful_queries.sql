-- =============================================================
-- INDUSTRY GRAPH EXPLORER – USEFUL BI QUERIES
-- Run these against your database for business intelligence.
-- =============================================================


-- ───────────────────────────────────────────────────────────────
-- 1. SEARCH: find industries matching a keyword (full-text)
-- ───────────────────────────────────────────────────────────────
SELECT RepCode, NameEnglish, ATECOPrimary, ValueChainStage
FROM Industries
WHERE to_tsvector('english', coalesce(NameEnglish,'') || ' ' || coalesce(KeywordsEN,''))
      @@ plainto_tsquery('english', 'medical equipment')  -- << change search term here
ORDER BY NameEnglish;


-- ───────────────────────────────────────────────────────────────
-- 2. UPSTREAM: all Tier-1 suppliers for a given industry
-- ───────────────────────────────────────────────────────────────
SELECT
    f.RepCode           AS SupplierCode,
    f.NameEnglish       AS SupplierName,
    f.ATECOPrimary      AS SupplierATECO,
    sf.SectorCode       AS SupplierSector,
    vf.StageName        AS SupplierStage,
    il.StrengthScore,
    il.LinkType
FROM IndustryLinks il
JOIN Industries          f   ON il.FromIndustryCode = f.RepCode
LEFT JOIN Sectors        sf  ON f.SectorID = sf.SectorID
LEFT JOIN ValueChainStages vf ON f.StageID  = vf.StageID
WHERE il.ToIndustryCode = 'MED002'      -- << change RepCode here
  AND il.Direction      = 'Downstream'
ORDER BY il.StrengthScore DESC;


-- ───────────────────────────────────────────────────────────────
-- 3. DOWNSTREAM: all customers for a given industry
-- ───────────────────────────────────────────────────────────────
SELECT
    t.RepCode           AS CustomerCode,
    t.NameEnglish       AS CustomerName,
    t.ATECOPrimary      AS CustomerATECO,
    st.SectorCode       AS CustomerSector,
    vt.StageName        AS CustomerStage,
    il.StrengthScore,
    il.LinkType
FROM IndustryLinks il
JOIN Industries          t   ON il.ToIndustryCode   = t.RepCode
LEFT JOIN Sectors        st  ON t.SectorID = st.SectorID
LEFT JOIN ValueChainStages vt ON t.StageID  = vt.StageID
WHERE il.FromIndustryCode = 'CHE015'    -- << change RepCode here
  AND il.Direction        = 'Downstream'
ORDER BY il.StrengthScore DESC;


-- ───────────────────────────────────────────────────────────────
-- 4. TIER-2: suppliers of suppliers (two hops upstream)
-- ───────────────────────────────────────────────────────────────
WITH Tier1Suppliers AS (
    SELECT FromIndustryCode AS SupplierCode
    FROM   IndustryLinks
    WHERE  ToIndustryCode = 'LAB001'    -- << change RepCode here
      AND  Direction      = 'Downstream'
)
SELECT
    'Tier-2'                AS Tier,
    f.RepCode               AS SupplierCode,
    f.NameEnglish           AS SupplierName,
    sf.SectorCode           AS Sector,
    vf.StageName            AS Stage,
    il2.StrengthScore,
    il2.ToIndustryCode      AS DirectCustomerCode
FROM   IndustryLinks il2
JOIN   Industries          f   ON il2.FromIndustryCode = f.RepCode
LEFT JOIN Sectors        sf  ON f.SectorID = sf.SectorID
LEFT JOIN ValueChainStages vf ON f.StageID  = vf.StageID
WHERE  il2.ToIndustryCode IN (SELECT SupplierCode FROM Tier1Suppliers)
  AND  il2.Direction = 'Downstream'
ORDER BY il2.StrengthScore DESC;


-- ───────────────────────────────────────────────────────────────
-- 5. ADJACENT MARKETS: industries sharing >= 2 suppliers with a target
-- ───────────────────────────────────────────────────────────────
WITH TargetSuppliers AS (
    SELECT FromIndustryCode
    FROM   IndustryLinks
    WHERE  ToIndustryCode = 'LAB001'    -- << change RepCode here
      AND  Direction      = 'Downstream'
)
SELECT
    il.ToIndustryCode   AS AdjacentCode,
    i.NameEnglish       AS AdjacentName,
    s.SectorCode        AS Sector,
    COUNT(DISTINCT il.FromIndustryCode) AS SharedSuppliers
FROM   IndustryLinks il
JOIN   Industries i  ON il.ToIndustryCode = i.RepCode
LEFT JOIN Sectors s  ON i.SectorID        = s.SectorID
WHERE  il.FromIndustryCode IN (SELECT FromIndustryCode FROM TargetSuppliers)
  AND  il.ToIndustryCode   <> 'LAB001'   -- exclude the target itself
  AND  il.Direction        = 'Downstream'
GROUP BY il.ToIndustryCode, i.NameEnglish, s.SectorCode
HAVING COUNT(DISTINCT il.FromIndustryCode) >= 2
ORDER BY SharedSuppliers DESC;


-- ───────────────────────────────────────────────────────────────
-- 6. FULL VALUE CHAIN MAP for a sector (e.g. Healthcare)
-- ───────────────────────────────────────────────────────────────
SELECT * FROM vw_IndustryValueChain
WHERE  SectorCode = 'HEA'              -- << change sector code here
ORDER BY StageOrder, NameEnglish;


-- ───────────────────────────────────────────────────────────────
-- 7. EXPORT for webapp: generate industries.json payload
-- ───────────────────────────────────────────────────────────────
-- In psql: \copy (SELECT ...) TO 'industries.json'
-- Or use pgAdmin "Save as JSON" option.
SELECT json_agg(row_to_json(t)) FROM (
    SELECT
        i.RepCode,
        i.NameEnglish,
        i.NameNative,
        s.SectorCode            AS "Sector",
        v.StageName             AS "ValueChainStage",
        i.ATECOPrimary,
        LEFT(i.Description,200) AS "Description"
    FROM Industries i
    LEFT JOIN Sectors          s ON i.SectorID = s.SectorID
    LEFT JOIN ValueChainStages v ON i.StageID  = v.StageID
    ORDER BY i.RepCode
) t;


-- ───────────────────────────────────────────────────────────────
-- 8. EXPORT for webapp: generate links.json payload
-- ───────────────────────────────────────────────────────────────
SELECT json_agg(row_to_json(t)) FROM (
    SELECT
        FromIndustryCode,
        ToIndustryCode,
        Direction,
        StrengthScore,
        LinkType
    FROM IndustryLinks
    ORDER BY StrengthScore DESC
) t;
