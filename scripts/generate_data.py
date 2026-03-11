import openpyxl, json, random, os, glob
from collections import defaultdict

print('Loading XLSX...')

# Find the XLSX file in data/
xlsx_files = glob.glob('data/*.xlsx') + glob.glob('data/*.xls')
if not xlsx_files:
    raise FileNotFoundError('No XLSX/XLS file found in data/')
xlsx_path = xlsx_files[0]
print(f'Using: {xlsx_path}')

wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
ws = wb.active

def get_sector(name):
    n = str(name).lower()
    if 'wholesale' in n or 'ingrosso' in n or 'distributor' in n: return 'WHL'
    if 'retail' in n or ' shop' in n or ' store' in n: return 'RET'
    if 'health' in n or 'medical' in n or 'hospital' in n or 'pharma' in n: return 'HEA'
    if 'software' in n or 'it service' in n or 'cloud' in n or 'tech' in n: return 'ICT'
    if 'energy' in n or 'solar' in n or 'wind' in n or 'electric power' in n: return 'ENE'
    if 'construct' in n or 'building' in n or 'architect' in n: return 'CON'
    if 'agri' in n or 'food' in n or 'beverage' in n or 'farm' in n: return 'AGR'
    if 'finance' in n or 'bank' in n or 'insurance' in n: return 'FIN'
    if 'education' in n or 'school' in n or 'training' in n or 'learning' in n: return 'EDU'
    if 'manufactur' in n or 'produc' in n or 'fabricat' in n: return 'MAN'
    return 'SER'

def cv(row, idx, maxlen=0):
    try:
        v = row[idx].value
        s = str(v).strip() if v is not None else ''
        if s in ('None', 'nan'): return ''
        return s[:maxlen] if maxlen else s
    except: return ''

print('Parsing industries...')
industries = []
seen = set()
for row in ws.iter_rows(min_row=2):
    rep_raw = row[0].value
    if rep_raw is None: continue
    rep_code = str(int(rep_raw)) if isinstance(rep_raw, float) and rep_raw == int(rep_raw) else str(rep_raw).strip()
    if not rep_code or rep_code in seen: continue
    seen.add(rep_code)
    name_en = cv(row, 2)
    if not name_en: continue
    ateco = cv(row, 4)
    industries.append({
        'RepCode': rep_code,
        'NameEnglish': name_en,
        'NameNative': cv(row, 1, 80),
        'Sector': get_sector(name_en),
        'ATECOPrimary': ateco.split(',')[0].replace(' ', '')[:12] if ateco else '',
        'ATECOAll': ateco[:150],
        'Priority': cv(row, 7) or 'Medium',
        'ReportDefinitionEN': cv(row, 9, 350),
        'MarketingDefinitionEN': cv(row, 11, 250),
        'KeywordsIncludeEN': cv(row, 13, 200),
        'KeywordsIncludeIT': cv(row, 14, 200),
        'OrbisBoolean': cv(row, 17, 250),
        'TradeAssociations': cv(row, 19, 200),
        'AdjacentIndustries': cv(row, 21, 150)
    })

print(f'Loaded {len(industries)} industries')

by_sector = defaultdict(list)
for ind in industries:
    by_sector[ind['Sector']].append(ind)

# Write sector files
os.makedirs('data', exist_ok=True)
all_industry_files = []

for sector, items in by_sector.items():
    test = json.dumps(items[:5], ensure_ascii=False, separators=(',', ':'))
    avg = len(test) / 5
    chunk_size = max(50, int(250_000 / avg))

    if len(items) <= chunk_size:
        fname = f'data/industries_{sector}.json'
        with open(fname, 'w', encoding='utf-8') as f:
            json.dump(items, f, ensure_ascii=False, separators=(',', ':'))
        all_industry_files.append(fname)
        print(f'  {fname}: {len(items)} industries')
    else:
        for i in range(0, len(items), chunk_size):
            n = i // chunk_size + 1
            fname = f'data/industries_{sector}_{n}.json'
            with open(fname, 'w', encoding='utf-8') as f:
                json.dump(items[i:i+chunk_size], f, ensure_ascii=False, separators=(',', ':'))
            all_industry_files.append(fname)
            print(f'  {fname}: {len(items[i:i+chunk_size])} industries')

# Generate links (sector-based peer connections)
print('Generating links...')
random.seed(42)
links = []
link_set = set()
for ind in industries:
    same = [i for i in industries if i['Sector'] == ind['Sector'] and i['RepCode'] != ind['RepCode']]
    if len(same) < 2: continue
    for target in random.sample(same, min(4, len(same))):
        pair = tuple(sorted([ind['RepCode'], target['RepCode']]))
        if pair in link_set: continue
        link_set.add(pair)
        links.append({'FromIndustryCode': ind['RepCode'], 'ToIndustryCode': target['RepCode'],
                      'Direction': 'Peer', 'StrengthScore': random.randint(2, 5)})

print(f'Generated {len(links)} links')

# Write links in chunks of 3000
link_files = []
chunk = 3000
for i in range(0, min(len(links), 12000), chunk):
    n = i // chunk + 1
    fname = f'data/links_{n}.json'
    with open(fname, 'w', encoding='utf-8') as f:
        json.dump(links[i:i+chunk], f, ensure_ascii=False, separators=(',', ':'))
    link_files.append(fname)
    print(f'  {fname}: {len(links[i:i+chunk])} links')

# Write manifest for app.js to discover files
manifest = {
    'industryFiles': sorted([f.replace('data/', '') for f in all_industry_files]),
    'linkFiles': sorted([f.replace('data/', '') for f in link_files]),
    'totalIndustries': len(industries),
    'totalLinks': min(len(links), 12000)
}
with open('data/manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)

print(f'Done. Manifest written with {len(all_industry_files)} industry files and {len(link_files)} link files.')
