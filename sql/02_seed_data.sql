-- =============================================================
-- INDUSTRY GRAPH EXPLORER – SEED DATA
-- Run AFTER 01_create_tables.sql
-- Contains all reference data + the 15 sample industries
-- that match data/industries.json and data/links.json
-- =============================================================


-- -------------------------------------------------------
-- SECTORS
-- -------------------------------------------------------
INSERT INTO Sectors (SectorCode, SectorName_EN, SectorName_IT, ATECOSection, Description) VALUES
  ('MAN', 'Manufacturing',             'Manifattura',                    'C',   'Production of physical goods, from raw processing to finished products.'),
  ('WHL', 'Wholesale Trade',           'Commercio all''ingrosso',        'G46', 'Bulk distribution and logistics to B2B customers.'),
  ('RET', 'Retail Trade',              'Commercio al dettaglio',         'G47', 'Sale of goods directly to end consumers.'),
  ('HEA', 'Healthcare',                'Sanità',                         'Q',   'Medical, clinical and health services.'),
  ('ICT', 'Information Technology',    'Tecnologia dell''informazione',  'J',   'Software, hardware, digital services and platforms.'),
  ('AGR', 'Agriculture',               'Agricoltura',                    'A',   'Farming, fishing, forestry and raw biological production.'),
  ('FIN', 'Finance & Insurance',       'Finanza e Assicurazione',        'K',   'Banking, investment, insurance and financial services.'),
  ('ENE', 'Energy & Utilities',        'Energia e Utenze',               'D',   'Electricity, gas, water production and distribution.'),
  ('CON', 'Construction',              'Costruzioni',                    'F',   'Building, civil engineering and infrastructure.'),
  ('EDU', 'Education & Training',      'Istruzione e Formazione',        'P',   'Schools, universities, online learning and professional training.'),
  ('SER', 'Other Services',            'Altri Servizi',                  'S',   'Personal, community and other business services.')
ON CONFLICT (SectorCode) DO NOTHING;


-- -------------------------------------------------------
-- VALUE CHAIN STAGES
-- -------------------------------------------------------
INSERT INTO ValueChainStages (StageName, SortOrder, Description) VALUES
  ('Raw Materials',       10, 'Extraction and production of primary inputs (mining, agriculture, chemicals).'),
  ('Processing',          20, 'Initial transformation of raw materials into intermediate goods.'),
  ('Components',          30, 'Manufacturing of parts and sub-assemblies used in final products.'),
  ('Final Manufacturing', 40, 'Assembly and production of finished goods ready for sale.'),
  ('Distribution',        50, 'Wholesale logistics and supply chain distribution to resellers or businesses.'),
  ('Retail',              60, 'Direct sale of finished goods to end consumers.'),
  ('Services',            70, 'Professional, technical and support services delivered to businesses or individuals.')
ON CONFLICT (StageName) DO NOTHING;


-- -------------------------------------------------------
-- INDUSTRIES  (15 sample rows – matches data/industries.json)
-- -------------------------------------------------------
INSERT INTO Industries (
    RepCode, NameEnglish, NameNative,
    SectorID, StageID, ValueChainStage, ATECOPrimary,
    Description, Priority
) VALUES

  -- Healthcare chain
  ('LAB001',
   'Medical Diagnostics Centres',
   'Laboratori Analisi Cliniche',
   (SELECT SectorID FROM Sectors WHERE SectorCode = 'HEA'),
   (SELECT StageID FROM ValueChainStages WHERE StageName = 'Services'),
   'Services', '8610',
   'Clinical analysis laboratories performing laboratory testing on patient samples for disease diagnosis.',
   'Medium'),

  ('MED002',
   'Distribution of Medical Equipment',
   'Distribuzione Apparecchiature Mediche',
   (SELECT SectorID FROM Sectors WHERE SectorCode = 'WHL'),
   (SELECT StageID FROM ValueChainStages WHERE StageName = 'Distribution'),
   'Distribution', '4646',
   'Wholesale supply, logistics and commercialisation of medical devices and surgical equipment.',
   'Medium'),

  ('PHR003',
   'Pharmaceutical Manufacturers',
   'Produttori Farmaceutici',
   (SELECT SectorID FROM Sectors WHERE SectorCode = 'MAN'),
   (SELECT StageID FROM ValueChainStages WHERE StageName = 'Final Manufacturing'),
   'Final Manufacturing', '2120',
   'Manufacturing and promotion of pharmaceutical products and medicinal articles.',
   'Medium'),

  ('DIS004',
   'Disinfectant Manufacturers',
   'Produttori di Disinfettanti',
   (SELECT SectorID FROM Sectors WHERE SectorCode = 'MAN'),
   (SELECT StageID FROM ValueChainStages WHERE StageName = 'Processing'),
   'Processing', '2020',
   'Production of chemical preparations to eliminate microorganisms on surfaces and environments.',
   'Medium'),

  ('DSP005',
   'Disposable Goods',
   'Beni Monouso',
   (SELECT SectorID FROM Sectors WHERE SectorCode = 'MAN'),
   (SELECT StageID FROM ValueChainStages WHERE StageName = 'Final Manufacturing'),
   'Final Manufacturing', '2222',
   'Manufacturing of single-use products from plastics, paper and compostable materials.',
   'Medium'),

  -- Digital / Technology chain
  ('DIG006',
   'Digital Signage',
   'Segnaletica Digitale',
   (SELECT SectorID FROM Sectors WHERE SectorCode = 'MAN'),
   (SELECT StageID FROM ValueChainStages WHERE StageName = 'Final Manufacturing'),
   'Final Manufacturing', '2620',
   'Manufacturing and assembly of electronic display systems for public information and advertising.',
   'Medium'),

  ('DIT007',
   'Digital Technology',
   'Tecnologia Digitale',
   (SELECT SectorID FROM Sectors WHERE SectorCode = 'ICT'),
   (SELECT StageID FROM ValueChainStages WHERE StageName = 'Components'),
   'Components', '2812',
   'Development, production and integration of advanced digital manufacturing technologies.',
   'Medium'),

  ('DPL008',
   'Distribution Panels',
   'Quadri di Distribuzione',
   (SELECT SectorID FROM Sectors WHERE SectorCode = 'MAN'),
   (SELECT StageID FROM ValueChainStages WHERE StageName = 'Components'),
   'Components', '2711',
   'Design, assembly and production of electrical distribution equipment.',
   'Medium'),

  -- Retail
  ('DSC009',
   'Discount Stores',
   'Negozi di Sconto',
   (SELECT SectorID FROM Sectors WHERE SectorCode = 'RET'),
   (SELECT StageID FROM ValueChainStages WHERE StageName = 'Retail'),
   'Retail', '4711',
   'Retail enterprises selling consumer goods at reduced prices through high-volume business models.',
   'Medium'),

  -- Education / Social
  ('DLR010',
   'Distance Learning',
   'Apprendimento a Distanza',
   (SELECT SectorID FROM Sectors WHERE SectorCode = 'EDU'),
   (SELECT StageID FROM ValueChainStages WHERE StageName = 'Services'),
   'Services', '8559',
   'Educational services delivered remotely via digital platforms.',
   'Medium'),

  ('DIS011',
   'Disability Special Needs',
   'Disabilità e Bisogni Speciali',
   (SELECT SectorID FROM Sectors WHERE SectorCode = 'SER'),
   (SELECT StageID FROM ValueChainStages WHERE StageName = 'Services'),
   'Services', '8810',
   'Organisations providing support services, assistive technologies and rehabilitation for persons with disabilities.',
   'Medium'),

  -- Metals / Materials chain
  ('ALU012',
   'Aluminium Die-Casting',
   'Pressofusione Alluminio',
   (SELECT SectorID FROM Sectors WHERE SectorCode = 'MAN'),
   (SELECT StageID FROM ValueChainStages WHERE StageName = 'Components'),
   'Components', '2442',
   'Metal casting process using aluminium alloys under high pressure into mold cavities.',
   'Medium'),

  ('ALF013',
   'Aluminium Fabricators',
   'Fabbricanti di Alluminio',
   (SELECT SectorID FROM Sectors WHERE SectorCode = 'MAN'),
   (SELECT StageID FROM ValueChainStages WHERE StageName = 'Processing'),
   'Processing', '2442',
   'Fabrication and processing of aluminium products including extrusions and structural components.',
   'Medium'),

  -- Media / Print
  ('WMG014',
   'Wholesale of Magazines and Newspapers',
   'Commercio Ingrosso Riviste e Giornali',
   (SELECT SectorID FROM Sectors WHERE SectorCode = 'WHL'),
   (SELECT StageID FROM ValueChainStages WHERE StageName = 'Distribution'),
   'Distribution', '4640',
   'Wholesale distribution of printed media including magazines, newspapers and periodicals.',
   'Medium'),

  -- Chemicals
  ('CHE015',
   'Chemical Raw Materials',
   'Materie Prime Chimiche',
   (SELECT SectorID FROM Sectors WHERE SectorCode = 'MAN'),
   (SELECT StageID FROM ValueChainStages WHERE StageName = 'Raw Materials'),
   'Raw Materials', '2010',
   'Production and supply of basic chemical substances used in downstream manufacturing.',
   'High')

ON CONFLICT (RepCode) DO NOTHING;


-- -------------------------------------------------------
-- INDUSTRY LINKS  (18 links – matches data/links.json)
-- -------------------------------------------------------
INSERT INTO IndustryLinks (
    FromIndustryCode, ToIndustryCode,
    Direction, StrengthScore, LinkType, EvidenceSource
) VALUES

  -- Healthcare / Pharma supply chain
  ('PHR003', 'MED002', 'Downstream', 5, 'Supplies pharmaceutical products to distributors',   'Domain expert'),
  ('MED002', 'LAB001', 'Downstream', 4, 'Supplies medical equipment to diagnostic labs',      'AdjacentIndustries'),
  ('PHR003', 'LAB001', 'Downstream', 3, 'Supplies reagents and consumables to labs',          'AdjacentIndustries'),
  ('CHE015', 'PHR003', 'Downstream', 5, 'Supplies chemical raw materials to pharma',          'OECD SUT 2020'),
  ('CHE015', 'DIS004', 'Downstream', 5, 'Supplies chemical base to disinfectant manufacturers','OECD SUT 2020'),
  ('DIS004', 'LAB001', 'Downstream', 3, 'Supplies disinfectants to medical labs',              'AdjacentIndustries'),
  ('DIS004', 'MED002', 'Downstream', 2, 'Supplies disinfectants via medical equipment distributors','AdjacentIndustries'),
  ('DSP005', 'LAB001', 'Downstream', 3, 'Supplies disposable consumables to labs',             'AdjacentIndustries'),
  ('DSP005', 'MED002', 'Downstream', 2, 'Supplies disposable goods via medical distribution',  'AdjacentIndustries'),

  -- Metals / Electronics chain
  ('ALF013', 'ALU012', 'Downstream', 4, 'Supplies fabricated aluminium to die-casters',        'Domain expert'),
  ('ALU012', 'DPL008', 'Downstream', 3, 'Supplies die-cast aluminium components to panel makers','AdjacentIndustries'),
  ('DIT007', 'DIG006', 'Downstream', 4, 'Supplies digital technology components to signage manufacturers','AdjacentIndustries'),
  ('DPL008', 'DIG006', 'Downstream', 2, 'Supplies distribution panels to digital signage installations','AdjacentIndustries'),
  ('DIG006', 'DSC009', 'Downstream', 2, 'Supplies signage systems to discount retailers',      'AdjacentIndustries'),
  ('WMG014', 'DSC009', 'Downstream', 1, 'Distributes print media to retail outlets',           'Domain expert'),

  -- Education / Social
  ('DLR010', 'DIS011', 'Peer',       3, 'Adjacent: distance learning platforms used for disability training','AdjacentIndustries'),
  ('DIT007', 'DLR010', 'Downstream', 4, 'Supplies digital technology infrastructure to distance learning','AdjacentIndustries'),
  ('MED002', 'DIS011', 'Downstream', 3, 'Supplies assistive medical devices to disability sector','AdjacentIndustries')

ON CONFLICT DO NOTHING;


-- -------------------------------------------------------
-- QUICK VERIFICATION QUERIES (run after seeding)
-- -------------------------------------------------------
-- SELECT COUNT(*) FROM Sectors;           -- expected: 11
-- SELECT COUNT(*) FROM ValueChainStages;  -- expected: 7
-- SELECT COUNT(*) FROM Industries;        -- expected: 15
-- SELECT COUNT(*) FROM IndustryLinks;     -- expected: 18
-- SELECT * FROM vw_IndustryValueChain ORDER BY StageOrder, NameEnglish;
-- SELECT * FROM vw_LinkDetails ORDER BY StrengthScore DESC;
