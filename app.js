// ── app.js – Industry Graph Explorer ──────────────────────────────────────

let industriesData = [];   // all loaded industry objects
let linksData      = [];   // all loaded link objects
let networkInstance = null;
let currentCode    = null; // RepCode of selected industry

// ── Sector colours ─────────────────────────────────────────────────────────
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
function sectorColor(code){ return SECTOR_COLORS[code] || SECTOR_COLORS.default; }
function sectorLabel(code){ return SECTOR_LABELS[code] || code || 'Other'; }

// ── Helpers ─────────────────────────────────────────────────────────────────
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function empty(v){
  if(!v) return true;
  const s = String(v).trim();
  return s==='' || s==='undefined' || s==='null' || s==='None' || s==='[null]';
}

function val(v, fallback=''){
  return empty(v) ? fallback : String(v).trim();
}

// ── DATA LOADING ─────────────────────────────────────────────────────────────
async function loadData(){
  const statsEl = document.getElementById('statsLabel');
  try {
    statsEl.textContent = 'Loading…';
    const manifest = await axios.get('data/manifest.json').then(r => r.data);
    const industryFiles = manifest.industryFiles.map(f => 'data/' + f);
    const linkFiles     = manifest.linkFiles.map(f => 'data/' + f);

    const [indResults, linkResults] = await Promise.all([
      Promise.all(industryFiles.map(f => axios.get(f).then(r => r.data))),
      Promise.all(linkFiles.map(f => axios.get(f).then(r => r.data)))
    ]);

    industriesData = indResults.flat();
    linksData      = linkResults.flat();
    statsEl.textContent =
      `${industriesData.length.toLocaleString()} industries · ${linksData.length.toLocaleString()} links`;
  } catch(e){
    console.error('Failed to load data', e);
    statsEl.textContent = 'Error loading data – check console';
  }
}

// ── SEARCH ───────────────────────────────────────────────────────────────────
const searchBox  = document.getElementById('searchBox');
const resultsDiv = document.getElementById('results');

searchBox.addEventListener('input', () => {
  const q = searchBox.value.trim().toLowerCase();
  resultsDiv.innerHTML = '';
  if(!q){ resultsDiv.style.display='none'; return; }

  const matches = industriesData.filter(i =>
    i.RepCode.toLowerCase().includes(q) ||
    i.NameEnglish.toLowerCase().includes(q) ||
    (i.NameNative  && i.NameNative.toLowerCase().includes(q)) ||
    (i.ATECOPrimary && i.ATECOPrimary.includes(q)) ||
    (i.ATECOAll    && i.ATECOAll.includes(q)) ||
    (i.KeywordsIncludeEN && i.KeywordsIncludeEN.toLowerCase().includes(q))
  ).slice(0, 25);

  if(!matches.length){ resultsDiv.style.display='none'; return; }

  matches.forEach(item => {
    const div = document.createElement('div');
    const sc  = sectorColor(item.Sector);
    div.innerHTML =
      `<span class="res-code">${esc(item.RepCode)}</span> `+
      `<span class="res-name">– ${esc(item.NameEnglish)}</span>`+
      `<span class="res-sector" style="background:${sc}22;color:${sc};border:1px solid ${sc}55">`+
        `${esc(item.Sector)}</span>`;
    div.addEventListener('mousedown', e => {
      e.preventDefault();
      selectIndustry(item.RepCode);
      resultsDiv.style.display = 'none';
      searchBox.value = item.NameEnglish;
    });
    resultsDiv.appendChild(div);
  });
  resultsDiv.style.display = 'block';
});

document.addEventListener('click', e => {
  if(!document.getElementById('searchWrap').contains(e.target)){
    resultsDiv.style.display = 'none';
  }
});

// ── RESET ────────────────────────────────────────────────────────────────────
document.getElementById('resetBtn').addEventListener('click', resetPage);

function resetPage(){
  currentCode = null;
  searchBox.value = '';
  resultsDiv.innerHTML = '';
  resultsDiv.style.display = 'none';
  document.getElementById('currentIndustry').textContent = '';
  document.getElementById('infoBox').innerHTML = '<div id="emptyMsg">Search for an industry above to begin.</div>';
  document.getElementById('emptyState').style.display = 'block';
  if(networkInstance){ networkInstance.destroy(); networkInstance = null; }
  document.getElementById('filterDir').value = 'all';
  document.getElementById('filterStr').value = '1';
  document.getElementById('layoutSel').value = 'physics';
}

// ── FILTER / LAYOUT LISTENERS ─────────────────────────────────────────────
document.getElementById('filterDir').addEventListener('change', () => { if(currentCode) buildGraph(currentCode); });
document.getElementById('filterStr').addEventListener('change', () => { if(currentCode) buildGraph(currentCode); });
document.getElementById('layoutSel').addEventListener('change', () => { if(currentCode) buildGraph(currentCode); });

// ── SELECT INDUSTRY (main entry point) ───────────────────────────────────────
function selectIndustry(repCode){
  const ind = industriesData.find(i => i.RepCode === repCode);
  if(!ind) return;
  currentCode = repCode;
  document.getElementById('currentIndustry').textContent = ind.NameEnglish;
  document.getElementById('emptyState').style.display = 'none';
  renderSidebar(ind);
  buildGraph(repCode);
}

// ── SIDEBAR RENDERER ─────────────────────────────────────────────────────────
function renderSidebar(ind){
  const sc = sectorColor(ind.Sector);

  // Collect connections
  const links = getLinks(ind.RepCode);
  const upstream   = links.filter(l => l._dir === 'Upstream');
  const peers      = links.filter(l => l._dir === 'Peer');
  const downstream = links.filter(l => l._dir === 'Downstream');

  let html = '';

  // ── Identity block ──
  html += `<span class="d-repcode">#${esc(ind.RepCode)}</span>`;
  html += `<div class="d-title">${esc(ind.NameEnglish)}</div>`;
  if(!empty(ind.NameNative))
    html += `<div class="d-native">${esc(ind.NameNative)}</div>`;

  html += `<span class="sector-pill" style="background:${sc}22;color:${sc};border:1px solid ${sc}66">
    ${esc(sectorLabel(ind.Sector))}</span>`;

  // Priority + Status badges
  html += '<div class="d-badges">';
  if(!empty(ind.Priority)){
    const pcls = ind.Priority==='High' ? 'priority-high' : ind.Priority==='Low' ? 'priority-low' : 'priority-med';
    html += `<span class="priority-badge ${pcls}">⚡ ${esc(ind.Priority)} priority</span>`;
  }
  if(!empty(ind.ReportDefinitionEN) && ind.ReportDefinitionEN.length < 30)
    html += `<span class="status-badge">📄 ${esc(ind.ReportDefinitionEN)}</span>`;
  if(!empty(ind.MarketingDefinitionEN) && ind.MarketingDefinitionEN.length < 30)
    html += `<span class="status-badge">📣 ${esc(ind.MarketingDefinitionEN)}</span>`;
  if(!empty(ind.ValueChainStage))
    html += `<span class="status-badge">🔗 ${esc(ind.ValueChainStage)}</span>`;
  html += '</div>';

  // ── Classification ──
  html += '<div class="d-section">📌 Classification</div>';

  // ATECO codes
  if(!empty(ind.ATECOPrimary) || !empty(ind.ATECOAll)){
    const allCodes = val(ind.ATECOAll) || val(ind.ATECOPrimary);
    const chips = allCodes.split(/[,;|\s]+/).filter(Boolean).map(c =>
      `<span class="ateco-chip">${esc(c.trim())}</span>`
    ).join('');
    html += `<div class="d-row">
      <span class="d-label">ATECO / NACE</span>
      <span class="d-val">${chips || '<em class="empty-val">—</em>'}</span></div>`;
  } else {
    html += `<div class="d-row"><span class="d-label">ATECO / NACE</span><span class="d-val empty-val">Not assigned</span></div>`;
  }

  // Sector
  html += `<div class="d-row"><span class="d-label">Sector</span>
    <span class="d-val">${esc(sectorLabel(ind.Sector))} <em style="color:#aaa">(${esc(ind.Sector)})</em></span></div>`;

  // ── Description ──
  const defEN = val(ind.ReportDefinitionEN);
  const defMkt = val(ind.MarketingDefinitionEN);
  const hasLongDef = defEN.length > 60 || defMkt.length > 60;

  if(defEN.length > 30 || defMkt.length > 30){
    html += '<div class="d-section">📝 Definition</div>';
    if(defEN.length > 30){
      const longEN = defEN.length > 200;
      html += `<div class="collapsible-wrap">
        <div class="ctext ${longEN ? 'collapsed' : ''}" id="def-en">${esc(defEN)}</div>
        ${longEN ? '<span class="toggle-btn" onclick="toggleText(\'def-en\', this)">Show more ▼</span>' : ''}
      </div>`;
    }
    if(defMkt.length > 30 && defMkt !== defEN){
      const longMK = defMkt.length > 200;
      html += `<div style="margin-top:6px;" class="collapsible-wrap">
        <div class="ctext ${longMK ? 'collapsed' : ''}" id="def-mkt">${esc(defMkt)}</div>
        ${longMK ? '<span class="toggle-btn" onclick="toggleText(\'def-mkt\', this)">Show more ▼</span>' : ''}
      </div>`;
    }
  }

  // ── Keywords ──
  const kwEN = val(ind.KeywordsIncludeEN);
  const kwIT = val(ind.KeywordsIncludeIT);
  if(kwEN || kwIT){
    html += '<div class="d-section">🏷️ Keywords</div>';
    if(kwEN){
      const tags = kwEN.split(/[,;|]+/).filter(Boolean).map(k =>
        `<span class="kw-tag">${esc(k.trim())}</span>`
      ).join('');
      html += `<div class="d-row"><span class="d-label">EN</span><span class="d-val">${tags}</span></div>`;
    }
    if(kwIT){
      const tags = kwIT.split(/[,;|]+/).filter(Boolean).map(k =>
        `<span class="kw-tag" style="background:#fff8f0;border-color:#f5c89a;color:#7d4000">${esc(k.trim())}</span>`
      ).join('');
      html += `<div class="d-row"><span class="d-label">IT</span><span class="d-val">${tags}</span></div>`;
    }
  }

  // ── Orbis Boolean ──
  const orb = val(ind.OrbisBoolean);
  if(orb){
    html += '<div class="d-section">🔍 Orbis Boolean</div>';
    html += `<div class="orbis-box">${esc(orb)}</div>`;
  }

  // ── Trade Associations ──
  const tra = val(ind.TradeAssociations);
  if(tra){
    html += '<div class="d-section">🏛️ Trade Associations</div>';
    html += `<div style="font-size:12px;line-height:1.7;">${esc(tra).replace(/;/g,'<br/>')}</div>`;
  }

  // ── Connections ──
  html += `<div class="d-section">🔗 Connections (${links.length} total)</div>`;

  if(!links.length){
    html += '<div class="no-links">No connections found for this industry.</div>';
  } else {

    // Upstream
    if(upstream.length){
      html += `<div class="conn-group">
        <div class="conn-group-label conn-upstream">▲ Upstream <span class="conn-count">(${upstream.length})</span></div>`;
      upstream.forEach(l => {
        const other = industriesData.find(i => i.RepCode === l._other);
        const oname = other ? other.NameEnglish : l._other;
        html += `<div class="neighbor-item upstream" onclick="selectIndustry('${esc(l._other)}')">
          <span>${esc(oname)}</span>
          <span class="neighbor-code">#${esc(l._other)}</span></div>`;
      });
      html += '</div>';
    }

    // Peers
    if(peers.length){
      html += `<div class="conn-group">
        <div class="conn-group-label conn-peer">↔ Peers <span class="conn-count">(${peers.length})</span></div>`;
      peers.forEach(l => {
        const other = industriesData.find(i => i.RepCode === l._other);
        const oname = other ? other.NameEnglish : l._other;
        html += `<div class="neighbor-item peer" onclick="selectIndustry('${esc(l._other)}')">
          <span>${esc(oname)}</span>
          <span class="neighbor-code">#${esc(l._other)}</span></div>`;
      });
      html += '</div>';
    }

    // Downstream
    if(downstream.length){
      html += `<div class="conn-group">
        <div class="conn-group-label conn-downstream">▼ Downstream <span class="conn-count">(${downstream.length})</span></div>`;
      downstream.forEach(l => {
        const other = industriesData.find(i => i.RepCode === l._other);
        const oname = other ? other.NameEnglish : l._other;
        html += `<div class="neighbor-item downstream" onclick="selectIndustry('${esc(l._other)}')">
          <span>${esc(oname)}</span>
          <span class="neighbor-code">#${esc(l._other)}</span></div>`;
      });
      html += '</div>';
    }
  }

  document.getElementById('infoBox').innerHTML = html;
}

// ── Collapsible toggle ──────────────────────────────────────────────────────
function toggleText(id, btn){
  const el = document.getElementById(id);
  if(!el) return;
  if(el.classList.contains('collapsed')){
    el.classList.replace('collapsed','expanded');
    btn.textContent = 'Show less ▲';
  } else {
    el.classList.replace('expanded','collapsed');
    btn.textContent = 'Show more ▼';
  }
}

// ── Get links for a RepCode ─────────────────────────────────────────────────
function getLinks(repCode){
  const dirFilter = document.getElementById('filterDir').value;
  const strFilter = parseInt(document.getElementById('filterStr').value) || 1;

  const result = [];
  linksData.forEach(l => {
    if((l.StrengthScore || 1) < strFilter) return;
    let dir = null, other = null;
    if(l.FromIndustryCode === repCode){
      dir   = l.Direction || 'Peer';
      other = l.ToIndustryCode;
    } else if(l.ToIndustryCode === repCode){
      // reverse direction
      if(l.Direction === 'Downstream') dir = 'Upstream';
      else if(l.Direction === 'Upstream') dir = 'Downstream';
      else dir = l.Direction || 'Peer';
      other = l.FromIndustryCode;
    }
    if(!dir) return;
    if(dirFilter !== 'all' && dir !== dirFilter) return;
    result.push({ ...l, _dir: dir, _other: other });
  });
  return result;
}

// ── GRAPH BUILDER ────────────────────────────────────────────────────────────
function buildGraph(repCode){
  const ind = industriesData.find(i => i.RepCode === repCode);
  if(!ind) return;

  const links = getLinks(repCode);

  // Nodes
  const nodesArr = [{
    id:    repCode,
    label: wrapLabel(ind.NameEnglish),
    color: { background: sectorColor(ind.Sector), border: '#333', highlight: { background: '#fff', border: sectorColor(ind.Sector) } },
    font:  { size: 13, color: '#fff', face: 'Segoe UI' },
    size:  28,
    shape: 'ellipse',
    borderWidth: 3,
    title: `<b>${ind.NameEnglish}</b><br/>#${repCode} | ${sectorLabel(ind.Sector)}`,
    _repCode: repCode
  }];

  const edgesArr = [];
  const seen = new Set([repCode]);

  links.forEach(l => {
    const other = industriesData.find(i => i.RepCode === l._other);
    if(!other) return;
    if(!seen.has(l._other)){
      seen.add(l._other);
      nodesArr.push({
        id:    l._other,
        label: wrapLabel(other.NameEnglish),
        color: { background: sectorColor(other.Sector)+'bb', border: sectorColor(other.Sector), highlight: { background: '#fff', border: sectorColor(other.Sector) } },
        font:  { size: 11, color: '#111', face: 'Segoe UI' },
        size:  18,
        shape: 'dot',
        title: `<b>${other.NameEnglish}</b><br/>#${l._other} | ${sectorLabel(other.Sector)}`,
        _repCode: l._other
      });
    }

    const edgeColor = l._dir === 'Upstream' ? '#e6a817' : l._dir === 'Downstream' ? '#28a745' : '#17a2b8';
    edgesArr.push({
      from:   l._dir === 'Upstream' ? l._other : repCode,
      to:     l._dir === 'Upstream' ? repCode  : l._other === repCode ? l._other : l._other,
      arrows: l._dir === 'Peer' ? '' : 'to',
      color:  { color: edgeColor, highlight: edgeColor },
      width:  Math.max(1, (l.StrengthScore || 1)),
      title:  l._dir,
      dashes: l._dir === 'Peer',
      smooth: { type: 'dynamic' }
    });
  });

  const container = document.getElementById('network');
  if(networkInstance){ networkInstance.destroy(); networkInstance = null; }

  const useHierarchical = document.getElementById('layoutSel').value === 'hierarchical';

  const options = {
    nodes: { borderWidth: 1, shadow: true },
    edges: { smooth: { type: 'dynamic' } },
    interaction: { hover: true, tooltipDelay: 150, navigationButtons: true, keyboard: true },
    physics: useHierarchical ? { enabled: false } : {
      enabled: true,
      stabilization: { iterations: 150 },
      barnesHut: { gravitationalConstant: -8000, springLength: 160, springConstant: 0.04 }
    },
    layout: useHierarchical ? {
      hierarchical: { enabled: true, direction: 'LR', sortMethod: 'directed', levelSeparation: 200, nodeSpacing: 100 }
    } : { randomSeed: 42 }
  };

  networkInstance = new vis.Network(
    container,
    { nodes: new vis.DataSet(nodesArr), edges: new vis.DataSet(edgesArr) },
    options
  );

  // ── Click on a graph node → select that industry ──
  networkInstance.on('click', params => {
    if(params.nodes && params.nodes.length > 0){
      const clickedCode = params.nodes[0];
      if(clickedCode !== currentCode){
        selectIndustry(clickedCode);
        searchBox.value = (industriesData.find(i => i.RepCode === clickedCode) || {}).NameEnglish || clickedCode;
      }
    }
  });

  // ── Double-click to focus ──
  networkInstance.on('doubleClick', params => {
    if(params.nodes && params.nodes.length > 0){
      networkInstance.focus(params.nodes[0], { scale: 1.4, animation: true });
    }
  });
}

// ── Label wrapper (max 20 chars per line) ───────────────────────────────────
function wrapLabel(name, maxChars=20){
  const words = String(name).split(' ');
  const lines = []; let line = '';
  words.forEach(w => {
    if((line + ' ' + w).trim().length > maxChars && line){
      lines.push(line); line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  });
  if(line) lines.push(line);
  return lines.slice(0,3).join('\n');
}

// ── Bootstrap ───────────────────────────────────────────────────────────────
loadData();
