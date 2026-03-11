// ── app.js – Industry Graph Explorer ──

let industriesData = [];
let linksData = [];
let networkInstance = null;
let currentCode = null;

const SECTOR_COLORS = {
  MAN:'#e06c75', WHL:'#e5c07b', RET:'#98c379', HEA:'#56b6c2',
  ICT:'#61afef', AGR:'#a8d8a8', FIN:'#c678dd', ENE:'#d19a66',
  CON:'#be5046', EDU:'#4db6ac', SER:'#9e9e9e', default:'#7f8c8d'
};
const SECTOR_LABELS = {
  MAN:'Manufacturing', WHL:'Wholesale', RET:'Retail', HEA:'Healthcare',
  ICT:'ICT / Tech', AGR:'Agriculture & Food', FIN:'Finance', ENE:'Energy',
  CON:'Construction', EDU:'Education', SER:'Services'
};
function sectorColor(code){ return SECTOR_COLORS[code]||SECTOR_COLORS.default; }

// ── Load data ──────────────────────────────────────────────────────────────
async function loadData(){
  try {
    const industryFiles = [
      'data/industries_AGR.json','data/industries_CON.json',
      'data/industries_EDU.json','data/industries_ENE.json',
      'data/industries_FIN.json','data/industries_HEA.json',
      'data/industries_ICT.json','data/industries_MAN_1.json',
      'data/industries_MAN_2.json','data/industries_RET.json',
      'data/industries_SER_1.json','data/industries_SER_2.json',
      'data/industries_SER_3.json','data/industries_SER_4.json',
      'data/industries_SER_5.json','data/industries_WHL.json'
    ];
    const [indResults, linksResult] = await Promise.all([
      Promise.all(industryFiles.map(f => axios.get(f).then(r => r.data))),
      axios.get('data/links.json').then(r => r.data)
    ]);
    industriesData = indResults.flat();
    linksData = linksResult;
    document.getElementById('statsLabel').textContent =
      `${industriesData.length.toLocaleString()} industries \u00b7 ${linksData.length.toLocaleString()} links`;
    console.log(`\u2713 Loaded ${industriesData.length} industries, ${linksData.length} links`);
  } catch(e){
    console.error('Failed to load data files', e);
    document.getElementById('statsLabel').textContent = 'Error loading data \u2013 check console';
  }
}

// ── Search ─────────────────────────────────────────────────────────────────
const searchBox = document.getElementById('searchBox');
const resultsDiv = document.getElementById('results');

searchBox.addEventListener('input', () => {
  const q = searchBox.value.trim().toLowerCase();
  resultsDiv.innerHTML = '';
  if(!q){ resultsDiv.style.display='none'; return; }

  const matches = industriesData.filter(i =>
    i.RepCode.toLowerCase().includes(q) ||
    i.NameEnglish.toLowerCase().includes(q) ||
    (i.NameNative && i.NameNative.toLowerCase().includes(q)) ||
    (i.ATECOPrimary && i.ATECOPrimary.includes(q)) ||
    (i.KeywordsIncludeEN && i.KeywordsIncludeEN.toLowerCase().includes(q)) ||
    (i.ATECOAll && i.ATECOAll.includes(q))
  ).slice(0,25);

  if(!matches.length){ resultsDiv.style.display='none'; return; }
  matches.forEach(item => {
    const div = document.createElement('div');
    div.innerHTML =
      `<span class="res-code">${item.RepCode}</span> `+
      `<span class="res-name">\u2013 ${item.NameEnglish}</span>`+
      `<span style="float:right;font-size:10px;color:#888;">${SECTOR_LABELS[item.Sector]||item.Sector||''}</span>`;
    div.onclick = () => {
      searchBox.value = item.NameEnglish;
      resultsDiv.style.display = 'none';
      loadGraph(item.RepCode);
    };
    resultsDiv.appendChild(div);
  });
  resultsDiv.style.display = 'block';
});
document.addEventListener('click', e => {
  if(!e.target.closest('#searchWrap')) resultsDiv.style.display='none';
});

// ── Build and render graph ─────────────────────────────────────────────────
function loadGraph(code){
  currentCode = code;
  const dir    = document.getElementById('filterDir').value;
  const minStr = parseInt(document.getElementById('filterStr').value, 10);
  const layout = document.getElementById('layoutSel').value;

  const center = industriesData.find(i => i.RepCode === code);
  if(!center) return;

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('currentIndustry').textContent = center.NameEnglish;

  let relevantLinks = linksData.filter(l =>
    (l.FromIndustryCode === code || l.ToIndustryCode === code) &&
    (dir === 'all' || l.Direction === dir) &&
    (l.StrengthScore >= minStr)
  );

  const nodeCodes = new Set([code]);
  relevantLinks.forEach(l => { nodeCodes.add(l.FromIndustryCode); nodeCodes.add(l.ToIndustryCode); });

  const visNodes = [];
  nodeCodes.forEach(nc => {
    const ind = industriesData.find(i => i.RepCode === nc);
    if(!ind) return;
    const isCenter = nc === code;
    visNodes.push({
      id: nc,
      label: ind.NameEnglish.length > 30 ? ind.NameEnglish.slice(0,28)+'\u2026' : ind.NameEnglish,
      color:{
        background: isCenter ? '#1a2e4a' : sectorColor(ind.Sector),
        border: isCenter ? '#a0c4ff' : '#fff',
        highlight:{ background:'#a0c4ff', border:'#1a2e4a' }
      },
      font:{ color: isCenter ? '#fff' : '#222', size: isCenter ? 14 : 12 },
      size: isCenter ? 22 : 13,
      borderWidth: isCenter ? 3 : 1,
      title:`<b>${ind.NameEnglish}</b><br>Sector: ${SECTOR_LABELS[ind.Sector]||ind.Sector||'\u2013'}<br>Stage: ${ind.ValueChainStage||'\u2013'}<br>ATECO: ${ind.ATECOPrimary||'\u2013'}`
    });
  });

  const visEdges = relevantLinks.map((l,idx) => ({
    id: idx,
    from: l.FromIndustryCode, to: l.ToIndustryCode,
    label: l.Direction||'',
    arrows: l.Direction==='Peer' ? '' : 'to',
    dashes: l.Direction==='Peer',
    width: l.StrengthScore||1,
    color:{
      color: l.Direction==='Downstream' ? '#28a745' :
             l.Direction==='Upstream'   ? '#ffc107' : '#17a2b8',
      opacity: 0.8
    },
    font:{ size:10, align:'middle' },
    title:`${l.Direction||'Related'} \u00b7 Strength: ${l.StrengthScore||'\u2013'}`
  }));

  const options = {
    nodes:{ shape:'dot', font:{ face:'Segoe UI, Arial' } },
    edges:{ smooth:{ type:'dynamic' }, font:{ face:'Segoe UI, Arial' } },
    physics: layout==='hierarchical' ? { enabled:false } : {
      stabilization:{ iterations:200 },
      barnesHut:{ gravitationalConstant:-4000, springLength:120 }
    },
    layout: layout==='hierarchical' ? {
      hierarchical:{ direction:'UD', sortMethod:'directed', levelSeparation:120 }
    } : {},
    interaction:{ hover:true, tooltipDelay:200 }
  };

  const container = document.getElementById('network');
  if(networkInstance) networkInstance.destroy();
  networkInstance = new vis.Network(
    container,
    { nodes: new vis.DataSet(visNodes), edges: new vis.DataSet(visEdges) },
    options
  );
  networkInstance.on('click', params => {
    if(params.nodes.length > 0){
      const clicked = params.nodes[0];
      if(clicked !== currentCode) loadGraph(clicked);
    }
  });

  showDetails(center, relevantLinks);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function escHtml(str){
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const CHAR_THRESHOLD = 140;
let _toggleCounter = 0;

function collapsible(text, isCode){
  if(!text || text==='nan' || !text.trim()) return '<span class="empty-val">—</span>';
  if(text.length <= CHAR_THRESHOLD){
    return isCode
      ? `<div class="orbis-box">${escHtml(text)}</div>`
      : `<span>${escHtml(text)}</span>`;
  }
  const id = 'ct' + (++_toggleCounter);
  const content = isCode
    ? `<div class="orbis-box">${escHtml(text)}</div>`
    : escHtml(text);
  return `<div class="collapsible-wrap">
    <div id="${id}" class="ctext collapsed">${content}</div>
    <span class="toggle-btn" onclick="toggleField('${id}',this)">&#9660; Show more</span>
  </div>`;
}

function toggleField(id, btn){
  const el = document.getElementById(id);
  if(!el) return;
  const isCol = el.classList.contains('collapsed');
  el.classList.toggle('collapsed', !isCol);
  el.classList.toggle('expanded',   isCol);
  btn.innerHTML = isCol ? '&#9650; Show less' : '&#9660; Show more';
}

function atecoChips(raw){
  if(!raw||!raw.trim()) return '<span class="empty-val">—</span>';
  return raw.split(',').map(c=>c.trim()).filter(Boolean)
    .map(c=>`<span class="ateco-chip">${escHtml(c)}</span>`).join(' ');
}

function kwTags(raw){
  if(!raw||!raw.trim()) return '<span class="empty-val">—</span>';
  return raw.split(',').map(k=>k.trim()).filter(Boolean)
    .map(k=>`<span class="kw-tag">${escHtml(k)}</span>`).join(' ');
}

function row(label, html){
  return `<div class="d-row"><div class="d-label">${label}</div><div class="d-val">${html}</div></div>`;
}

function section(title){
  return `<div class="d-section">${title}</div>`;
}

// ── Detail panel ───────────────────────────────────────────────────────────
function showDetails(ind, links){
  const upstream   = links.filter(l => l.ToIndustryCode   === ind.RepCode && l.Direction==='Downstream');
  const downstream = links.filter(l => l.FromIndustryCode === ind.RepCode && l.Direction==='Downstream');
  const peers      = links.filter(l => l.Direction==='Peer');

  function neighborList(arr, codeField, label, cls){
    if(!arr.length) return '';
    return `<div class="neighbors"><strong>${label}</strong>`+
      arr.map(l => {
        const nc = l[codeField];
        const ni = industriesData.find(i => i.RepCode===nc);
        return `<div class="neighbor-item" onclick="loadGraph('${nc}')">
          ${ni ? escHtml(ni.NameEnglish) : nc}
          <span class="tag ${cls}">${l.StrengthScore||'\u2013'}</span>
        </div>`;
      }).join('')+
    '</div>';
  }

  const sc = sectorColor(ind.Sector);
  const priorityClass = {'High':'priority-high','Medium':'priority-med','Low':'priority-low'}[ind.Priority]||'priority-med';

  document.getElementById('infoBox').innerHTML = `

    <!-- ── Header ── -->
    <div class="d-header">
      <div class="d-repcode">${escHtml(ind.RepCode)}</div>
      ${ind.Priority ? `<span class="priority-badge ${priorityClass}">${ind.Priority}</span>` : ''}
    </div>
    <div class="d-title">${escHtml(ind.NameEnglish)}</div>
    ${ind.NameNative && ind.NameNative !== ind.NameEnglish && ind.NameNative !== 'nan'
      ? `<div class="d-native">${escHtml(ind.NameNative)}</div>` : ''}
    <div class="sector-pill" style="background:${sc}22;border:1px solid ${sc};color:${sc};">
      ${escHtml(SECTOR_LABELS[ind.Sector]||ind.Sector||'\u2013')}&nbsp;&#183;&nbsp;${escHtml(ind.ValueChainStage||'\u2013')}
    </div>

    <!-- ── Classification ── -->
    ${section('&#128196; Classification')}
    ${row('RepCode',         `<code>${escHtml(ind.RepCode)}</code>`)}
    ${row('Priority',        `<span class="priority-badge ${priorityClass}">${escHtml(ind.Priority||'—')}</span>`)}
    ${row('Sector',          `<span class="sector-badge" style="background:${sc}22;border:1px solid ${sc};color:${sc};">${escHtml(SECTOR_LABELS[ind.Sector]||ind.Sector||'—')}</span>`)}
    ${row('Value chain',     escHtml(ind.ValueChainStage||'—'))}
    ${row('ATECO primary',   `<span class="ateco-chip">${escHtml(ind.ATECOPrimary||'—')}</span>`)}
    ${row('ATECO all',       atecoChips(ind.ATECOAll))}

    <!-- ── Definition ── -->
    ${section('&#128214; Definition')}
    ${row('Report (EN)',     collapsible(ind.ReportDefinitionEN, false))}
    ${row('Marketing (EN)', collapsible(ind.MarketingDefinitionEN, false))}

    <!-- ── Search Intelligence ── -->
    ${section('&#128269; Search Intelligence')}
    ${row('Keywords (EN)',   kwTags(ind.KeywordsIncludeEN))}
    ${row('Keywords (IT)',   kwTags(ind.KeywordsIncludeIT))}
    ${row('Orbis Boolean',   collapsible(ind.OrbisBoolean, true))}

    <!-- ── Associations ── -->
    ${section('&#127968; Associations & Boundaries')}
    ${row('Trade assoc.',   collapsible(ind.TradeAssociations, false))}
    ${row('Adjacent',       kwTags(ind.AdjacentIndustries))}

    <!-- ── Value chain links ── -->
    ${section('&#128279; Value Chain Links')}
    ${neighborList(upstream,   'FromIndustryCode', '&#11014; Upstream Suppliers',   'dir-upstream')}
    ${neighborList(downstream, 'ToIndustryCode',   '&#11015; Downstream Customers', 'dir-downstream')}
    ${neighborList(peers,      'ToIndustryCode',   '&#8596; Peer / Adjacent',       'dir-peer')}
    ${!upstream.length && !downstream.length && !peers.length
      ? '<div class="no-links">No linked industries found for current filters.</div>' : ''}
  `;
}

['filterDir','filterStr','layoutSel'].forEach(id =>
  document.getElementById(id).addEventListener('change', () => {
    if(currentCode) loadGraph(currentCode);
  })
);

loadData();
