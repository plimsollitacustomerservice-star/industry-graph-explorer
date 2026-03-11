-- =============================================================
-- INDUSTRY GRAPH EXPLORER – DATABASE SCHEMA
-- PostgreSQL 14+ compatible
-- Run this script ONCE to create all tables from scratch.
-- Author: Plimsoll Italia
-- =============================================================

-- Drop order matters (child tables first)
DROP TABLE IF EXISTS IndustryLinks    CASCADE;
DROP TABLE IF EXISTS Industries       CASCADE;
DROP TABLE IF EXISTS ValueChainStages CASCADE;
DROP TABLE IF EXISTS Sectors          CASCADE;


-- -------------------------------------------------------
-- 1. SECTORS
--    High-level groupings (Manufacturing, Healthcare, etc.)
-- -------------------------------------------------------
CREATE TABLE Sectors (
    SectorID        SERIAL          PRIMARY KEY,
    SectorCode      VARCHAR(10)     NOT NULL,
    SectorName_EN   VARCHAR(255)    NOT NULL,
    SectorName_IT   VARCHAR(255),
    ATECOSection    VARCHAR(10),        -- e.g. 'C', 'G46', 'Q'
    Description     TEXT,
    CONSTRAINT uq_sectors_code UNIQUE (SectorCode)
);

COMMENT ON TABLE  Sectors                IS 'High-level sector groupings aligned to ATECO/NACE sections.';
COMMENT ON COLUMN Sectors.SectorCode     IS 'Short code used in the webapp (MAN, WHL, HEA, etc.)';
COMMENT ON COLUMN Sectors.ATECOSection   IS 'Corresponding ATECO/NACE section letter or prefix.';


-- -------------------------------------------------------
-- 2. VALUE CHAIN STAGES
--    Vertical position in the supply/value chain
-- -------------------------------------------------------
CREATE TABLE ValueChainStages (
    StageID     SERIAL          PRIMARY KEY,
    StageName   VARCHAR(50)     NOT NULL,
    SortOrder   SMALLINT        NOT NULL,   -- 10=Raw Materials ... 70=Services
    Description TEXT,
    CONSTRAINT uq_stages_name UNIQUE (StageName)
);

COMMENT ON TABLE  ValueChainStages           IS 'Vertical positions in the supply/value chain (upstream to downstream).';
COMMENT ON COLUMN ValueChainStages.SortOrder IS '10=Raw Materials, 20=Processing, 30=Components, 40=Final Mfg, 50=Distribution, 60=Retail, 70=Services.';


-- -------------------------------------------------------
-- 3. INDUSTRIES
--    One row per Plimsoll study / industry definition
-- -------------------------------------------------------
CREATE TABLE Industries (
    -- Core identity
    RepCode             VARCHAR(50)     PRIMARY KEY,
    NameEnglish         VARCHAR(500)    NOT NULL,
    NameNative          VARCHAR(500),

    -- Classification
    SectorID            INT             REFERENCES Sectors(SectorID) ON DELETE SET NULL,
    StageID             INT             REFERENCES ValueChainStages(StageID) ON DELETE SET NULL,
    ValueChainStage     VARCHAR(50),    -- denormalised text copy for easy read
    ATECOPrimary        VARCHAR(20),    -- first / most relevant ATECO code
    ATECOCodes          TEXT,           -- full comma-separated ATECO list
    NACECode            VARCHAR(10),

    -- Content fields (from Processing Log)
    Description         TEXT,           -- short BI description (<= 200 chars)
    ReportDefinitionEN  TEXT,
    ReportDefinitionIT  TEXT,
    MarketingDefEN      TEXT,
    MarketingDefIT      TEXT,

    -- Search keywords
    KeywordsEN          TEXT,
    KeywordsIT          TEXT,
    KeywordsExcludeEN   TEXT,
    KeywordsExcludeIT   TEXT,
    OrbisBooleanEN      TEXT,
    OrbisBooleanIT      TEXT,

    -- Adjacent industries (raw text from original DB, for reference)
    AdjacentIndustries  TEXT,

    -- Matrix / multi-country fields
    MatrixRepCode       VARCHAR(50),
    MatrixCountry       VARCHAR(10),
    MatrixDir           VARCHAR(255),

    -- Metadata
    Priority            VARCHAR(20),    -- Low / Medium / High
    Source              VARCHAR(50),    -- 'PW', 'ATECO', etc.
    DateLastEdited      DATE,
    CreatedAt           TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt           TIMESTAMP
);

COMMENT ON TABLE  Industries             IS 'One row per Plimsoll study / industry definition. Primary key is RepCode.';
COMMENT ON COLUMN Industries.RepCode     IS 'Unique Plimsoll study code. Must match RepCode in IndustryLinks.';
COMMENT ON COLUMN Industries.ATECOCodes IS 'Full comma-separated list of relevant ATECO codes for this industry.';

-- Full-text search index (PostgreSQL)
CREATE INDEX idx_industries_fts
    ON Industries
    USING GIN (to_tsvector('english', coalesce(NameEnglish,'') || ' ' || coalesce(NameNative,'') || ' ' || coalesce(KeywordsEN,'')));

-- Fast lookup indexes
CREATE INDEX idx_industries_sector   ON Industries (SectorID);
CREATE INDEX idx_industries_stage    ON Industries (StageID);
CREATE INDEX idx_industries_ateco    ON Industries (ATECOPrimary);


-- -------------------------------------------------------
-- 4. INDUSTRY LINKS
--    Supply / value chain connections between industries
-- -------------------------------------------------------
CREATE TABLE IndustryLinks (
    LinkID              BIGSERIAL       PRIMARY KEY,
    FromIndustryCode    VARCHAR(50)     NOT NULL REFERENCES Industries(RepCode) ON DELETE CASCADE,
    ToIndustryCode      VARCHAR(50)     NOT NULL REFERENCES Industries(RepCode) ON DELETE CASCADE,

    -- Relationship metadata
    Direction           VARCHAR(20)     NOT NULL
                            CHECK (Direction IN ('Downstream','Upstream','Peer')),
    LinkType            VARCHAR(255),   -- e.g. 'Supplies raw materials to'
    StrengthScore       SMALLINT        CHECK (StrengthScore BETWEEN 1 AND 5),

    -- Classification / evidence
    ATECOFrom           VARCHAR(20),    -- ATECO of supplier industry
    ATECOTo             VARCHAR(20),    -- ATECO of customer industry
    EvidenceSource      VARCHAR(255),   -- 'AdjacentIndustries', 'OECD SUT 2020', 'Domain expert'
    Notes               TEXT,

    -- Audit
    CreatedAt           TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt           TIMESTAMP,

    -- Prevent exact duplicate links of the same type
    CONSTRAINT uq_link UNIQUE (FromIndustryCode, ToIndustryCode, COALESCE(LinkType,''))
);

COMMENT ON TABLE  IndustryLinks                  IS 'Supply/value chain connections between industries. One row = one directional link.';
COMMENT ON COLUMN IndustryLinks.Direction        IS 'Downstream = From supplies To. Upstream = To supplies From. Peer = lateral.';
COMMENT ON COLUMN IndustryLinks.StrengthScore    IS '1=Marginal, 2=Relevant, 3=Significant, 4=Important, 5=Critical.';
COMMENT ON COLUMN IndustryLinks.EvidenceSource   IS 'Where this link was inferred from (field, SUT, expert, etc.)';

-- Fast lookup indexes
CREATE INDEX idx_links_from      ON IndustryLinks (FromIndustryCode);
CREATE INDEX idx_links_to        ON IndustryLinks (ToIndustryCode);
CREATE INDEX idx_links_direction ON IndustryLinks (Direction);
CREATE INDEX idx_links_strength  ON IndustryLinks (StrengthScore DESC);


-- -------------------------------------------------------
-- 5. HELPER VIEW: value chain summary per industry
-- -------------------------------------------------------
CREATE OR REPLACE VIEW vw_IndustryValueChain AS
SELECT
    i.RepCode,
    i.NameEnglish,
    i.NameNative,
    i.ATECOPrimary,
    s.SectorCode,
    s.SectorName_EN,
    v.StageName         AS ValueChainStage,
    v.SortOrder         AS StageOrder,
    COUNT(DISTINCT ld.ToIndustryCode)   AS DownstreamCount,
    COUNT(DISTINCT lu.FromIndustryCode) AS UpstreamCount,
    COUNT(DISTINCT lp.ToIndustryCode)   AS PeerCount
FROM Industries i
LEFT JOIN Sectors          s  ON i.SectorID = s.SectorID
LEFT JOIN ValueChainStages v  ON i.StageID  = v.StageID
LEFT JOIN IndustryLinks    ld ON i.RepCode  = ld.FromIndustryCode AND ld.Direction = 'Downstream'
LEFT JOIN IndustryLinks    lu ON i.RepCode  = lu.ToIndustryCode   AND lu.Direction = 'Downstream'
LEFT JOIN IndustryLinks    lp ON i.RepCode  = lp.FromIndustryCode AND lp.Direction = 'Peer'
GROUP BY
    i.RepCode, i.NameEnglish, i.NameNative, i.ATECOPrimary,
    s.SectorCode, s.SectorName_EN, v.StageName, v.SortOrder;

COMMENT ON VIEW vw_IndustryValueChain IS 'Summary view: each industry with sector, stage, and upstream/downstream/peer counts.';


-- -------------------------------------------------------
-- 6. HELPER VIEW: full link details with industry names
-- -------------------------------------------------------
CREATE OR REPLACE VIEW vw_LinkDetails AS
SELECT
    il.LinkID,
    il.FromIndustryCode,
    f.NameEnglish       AS FromNameEN,
    f.ATECOPrimary      AS FromATECO,
    sf.SectorCode       AS FromSector,
    vf.StageName        AS FromStage,
    il.Direction,
    il.StrengthScore,
    il.LinkType,
    il.ToIndustryCode,
    t.NameEnglish       AS ToNameEN,
    t.ATECOPrimary      AS ToATECO,
    st.SectorCode       AS ToSector,
    vt.StageName        AS ToStage,
    il.EvidenceSource
FROM IndustryLinks il
JOIN Industries          f   ON il.FromIndustryCode = f.RepCode
JOIN Industries          t   ON il.ToIndustryCode   = t.RepCode
LEFT JOIN Sectors        sf  ON f.SectorID = sf.SectorID
LEFT JOIN Sectors        st  ON t.SectorID = st.SectorID
LEFT JOIN ValueChainStages vf ON f.StageID  = vf.StageID
LEFT JOIN ValueChainStages vt ON t.StageID  = vt.StageID;

COMMENT ON VIEW vw_LinkDetails IS 'Full link detail: both industry names, sectors, stages, direction and strength.';
