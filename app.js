// ══════════════════════════════════════════════════════════════════════════════
// app.js  –  Industry Graph Explorer  (Spiderweb + IOT Edition)
// Features:
//   • Persistent full spiderweb graph – all industries visible at once
//   • Satnav navigation – search animates/flies to node, pulses it, no redraw
//   • Right-click context menu – sever (delete) an edge or node connection
//   • Toolbar button – draw mode to create new connections by dragging
//   • Sidebar shows full industry detail + upstream/peer/downstream lists
//   • IOT Spiderweb view – EA20 2023 Eurostat sector flows radial canvas
//   • GVA sidebar panel with ranked bar list
//   • Dark / Light theme toggle
//   • Master file fallback – loads industries_master.json if chunked files fail
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── state ─────────────────────────────────────────────────────────────────────
let industriesData  = [];
let linksData       = [];
let nodesDS         = null;
let edgesDS         = null;
let networkInstance = null;
let currentCode     = null;
let drawMode        = false;
let drawFrom        = null;
let deletedEdges    = new Set();
let addedEdges      = [];

// ── fast lookup maps ──────────────────────────────────────────────────────────
let indByCode   = new Map();
let linksByCode = new Map();

function registerIndustry(ind){
  indByCode.set(ind.RepCode, ind);
}

function registerLink(link){
  if (!link._id) {
    link._id = `l_${link.FromIndustryCode}_${link.ToIndustryCode}_${linksData.length}`;
  }
  if (!linksByCode.has(link.FromIndustryCode)) linksByCode.set(link.FromIndustryCode, []);
  if (!linksByCode.has(link.ToIndustryCode))   linksByCode.set(link.ToIndustryCode,   []);
  linksByCode.get(link.FromIndustryCode).push(link);
  linksByCode.get(link.ToIndustryCode).push(link);
}

// ── IOT state ─────────────────────────────────────────────────────────────────
let iotMode        = false;
let iotNodes       = [];
let iotSectorLinks = [];
let iotGva         = [];
let iotLoaded      = false;
let iotHovered     = null;
let iotSelected    = null;
let iotAnimFrame   = null;

// ── sector palette ────────────────────────────────────────────────────────────
const SECTOR_COLORS = {
  MAN:'#e06c75', WHL:'#e5c07b', RET:'#98c379', HEA:'#56b6c2',
  ICT:'#61afef', AGR:'#a8d8a8', FIN:'#c678dd', ENE:'#d19a66',
  CON:'#be5046', EDU:'#4db6ac', SER:'#9e9e9e', default:'#7f8c8d'
};
const SECTOR_LABELS = {
  MAN:'Manufacturing', WHL:'Wholesale',  RET:'Retail',
  HEA:'Healthcare',    ICT:'ICT / Tech', AGR:'Agriculture & Food',
  FIN:'Finance',       ENE:'Energy',     CON:'Construction',
  EDU:'Education',     SER:'Services'
};
const sc = c => SECTOR_COLORS[c] || SECTOR_COLORS.default;
const sl = c => SECTOR_LABELS[c] || c || 'Other';

// ── IOT sector palette (EA20) ─────────────────────────────────────────────────
const IOT_SECTOR_COLORS = {
  'Agri & Mining':         '#27AE60',
  'Manufacturing':         '#E74C3C',
  'Energy & Construction': '#F39C12',
  'Trade & Transport':     '#2980B9',
  'ICT & Hospitality':     '#16A085',
  'Finance & RE':          '#D35400',
  'Professional Svcs':     '#8E44AD',
  'Public & Health':       '#2471A3',
  'Other':                 '#7F8C8D'
};
const iotColor = s => IOT_SECTOR_COLORS[s] || '#7F8C8D';

// ── tiny helpers ──────────────────────────────────────────────────────────────
const esc   = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const empty = v => { if(!v) return true; const s=String(v).trim(); return !s||s==='undefined'||s==='null'||s==='None'; };
const val   = (v,f='') => empty(v) ? f : String(v).trim();
const fmtBn = v => v >= 1000 ? (v/1000).toFixed(1)+'T€' : v.toFixed(0)+'B€';

// ══════════════════════════════════════════════════════════════════════════════
// DARK / LIGHT THEME
// ══════════════════════════════════════════════════════════════════════════════
let _darkMode = true;

function applyTheme(dark){
  _darkMode = dark;
  const root = document.documentElement;
  if(dark){
    root.style.setProperty('--bg','#0d1117');
    root.style.setProperty('--bg2','#161b22');
    root.style.setProperty('--bg3','#21262d');
    root.style.setProperty('--border','#30363d');
    root.style.setProperty('--text','#e6edf3');
    root.style.setProperty('--text2','#c9d1d9');
    root.style.setProperty('--muted','#8b949e');
    document.body.style.background = '#0d1117';
    document.body.style.color      = '#e6edf3';
  } else {
    root.style.setProperty('--bg','#ffffff');
    root.style.setProperty('--bg2','#f6f8fa');
    root.style.setProperty('--bg3','#eaeef2');
    root.style.setProperty('--border','#d0d7de');
    root.style.setProperty('--text','#1f2328');
    root.style.setProperty('--text2','#24292f');
    root.style.setProperty('--muted','#57606a');
    document.body.style.background = '#ffffff';
    document.body.style.color      = '#1f2328';
  }
  const btn = document.getElementById('themeBtn');
  if(btn) btn.textContent = dark ? '☀ Light' : '🌙 Dark';
  if(iotMode && iotLoaded) drawIotSpiderweb();
}

function toggleTheme(){ applyTheme(!_darkMode); }

// ══════════════════════════════════════════════════════════════════════════════
// DATA LOADING  (with master-file fallback)
// ══════════════════════════════════════════════════════════════════════════════
function processIndustries(data){
  indByCode   = new Map();
  linksByCode = new Map();
  industriesData = data;
  industriesData.forEach(ind => {
    registerIndustry(ind);
    ind._searchBlob = [
      ind.RepCode||'', ind.NameEnglish||'', ind.NameNative||'',
      ind.ATECOPrimary||'', ind.ATECOAll||'',
      ind.KeywordsIncludeEN||'', ind.KeywordsIncludeIT||''
    ].join(' ').toLowerCase();
  });
}

function processLinks(data){
  linksData = data;
  linksData.forEach((l, idx) => {
    l._id = l._id || `l_${idx}`;
    registerLink(l);
  });
}

async function loadData(){
  const statsEl = document.getElementById('statsLabel');
  statsEl.textContent = 'Loading data…';

  let manifest;
  try {
    manifest = await axios.get('data/manifest.json').then(r => r.data);
  } catch(e) {
    statsEl.textContent = '❌ Could not load manifest.json';
    console.error('Manifest load failed:', e);
    return;
  }

  // ── Step 1: try loading chunked industry + link files in parallel ────────
  let industriesLoaded = false;
  try {
    const iFiles = manifest.industryFiles.map(f => 'data/' + f);
    const lFiles = manifest.linkFiles.map(f => 'data/' + f);
    const [iRes, lRes] = await Promise.all([
      Promise.all(iFiles.map(f => axios.get(f).then(r => r.data))),
      Promise.all(lFiles.map(f => axios.get(f).then(r => r.data)))
    ]);
    processIndustries(iRes.flat());
    processLinks(lRes.flat());
    industriesLoaded = true;
    console.log(`✅ Loaded ${industriesData.length} industries from chunked files.`);
  } catch(e) {
    console.warn('⚠️ Chunked industry files failed, trying master file fallback…', e);
  }

  // ── Step 2: fallback to industries_master.json if chunked load failed ─────
  if(!industriesLoaded && manifest.masterFile){
    try {
      statsEl.textContent = 'Chunked load failed – trying master file…';
      const masterData = await axios.get('data/' + manifest.masterFile).then(r => r.data);
      processIndustries(masterData);
      console.log(`✅ Loaded ${industriesData.length} industries from master file fallback.`);

      // Still try to load links even if industries came from master
      try {
        const lFiles = manifest.linkFiles.map(f => 'data/' + f);
        const lRes   = await Promise.all(lFiles.map(f => axios.get(f).then(r => r.data)));
        processLinks(lRes.flat());
      } catch(le){
        console.warn('⚠️ Link files also failed – graph will have no edges.', le);
        linksData = [];
      }
      industriesLoaded = true;
    } catch(fe){
      statsEl.textContent = '❌ Both chunked files and master fallback failed.';
      console.error('Master file fallback failed:', fe);
      return;
    }
  }

  statsEl.textContent = `${industriesData.length.toLocaleString()} industries · ${linksData.length.toLocaleString()} links`;
  buildSpiderweb();
}

async function loadIotData(){
  if(iotLoaded) return;
  try {
    const [nodes, slinks, gva] = await Promise.all([
      axios.get('data/ea20_iot_nodes.json').then(r=>r.data),
      axios.get('data/ea20_iot_sector_links.json').then(r=>r.data),
      axios.get('data/ea20_iot_gva.json').then(r=>r.data)
    ]);
    iotNodes       = nodes;
    iotSectorLinks = slinks;
    iotGva         = gva;
    iotLoaded      = true;
    document.getElementById('iotStatLine').textContent =
      `${nodes.length} NACE nodes · ${slinks.length} sector flows`;
    buildGvaList();
    buildIotLegend();
    drawIotSpiderweb();
  } catch(e){
    console.error('IOT load error', e);
    document.getElementById('iotStatLine').textContent = 'Error loading IOT data';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SPIDERWEB GRAPH
// ══════════════════════════════════════════════════════════════════════════════
function buildSpiderweb(){
  const nodes = industriesData.map(ind => ({
    id:    ind.RepCode,
    label: wrapLabel(ind.NameEnglish||ind.RepCode),
    title: `<b>${esc(ind.RepCode)}</b><br>${esc(ind.NameEnglish)}`,
    color: { background: sc(ind.Sector)+'33', border: sc(ind.Sector), highlight:{ background:sc(ind.Sector)+'66', border:sc(ind.Sector) } },
    font:  { color:'#e6edf3', size:11 },
    shape: 'dot',
    size:  14
  }));

  const edges = linksData
    .filter(l => !deletedEdges.has(l._id))
    .map(l => {
      const dir = l.Direction||'Peer';
      const col = dir==='Upstream'?'#d29922': dir==='Downstream'?'#3fb950':'#58a6ff';
      return {
        id:    l._id,
        from:  l.FromIndustryCode,
        to:    l.ToIndustryCode,
        color: { color:col+'88', highlight:col, hover:col },
        width: Math.max(1, (l.StrengthScore||1)*0.7),
        dashes: dir==='Peer',
        arrows: dir!=='Peer' ? { to:{ enabled:true, scaleFactor:0.5 } } : undefined,
        title: `${dir} · strength ${l.StrengthScore||'?'}`
      };
    });

  addedEdges.forEach(e => edges.push(e));

  nodesDS = new vis.DataSet(nodes);
  edgesDS = new vis.DataSet(edges);

  const container = document.getElementById('network');
  networkInstance = new vis.Network(container, { nodes:nodesDS, edges:edgesDS }, {
    physics:{ enabled:false, stabilization:{ iterations:200 } },
    interaction:{ hover:true, tooltipDelay:300 },
    layout:{ randomSeed:42 }
  });

  document.getElementById('emptyState').style.display = 'none';

  // ── Search ────────────────────────────────────────────────────────────────
  const searchBox  = document.getElementById('searchBox');
  const resultsDiv = document.getElementById('results');
  searchBox.addEventListener('input',()=>{
    const q = searchBox.value.trim().toLowerCase();
    resultsDiv.innerHTML = '';
    if(!q){ resultsDiv.style.display='none'; return; }
    const matches = industriesData
      .filter(i => i._searchBlob && i._searchBlob.includes(q))
      .slice(0,25);
    if(!matches.length){ resultsDiv.style.display='none'; return; }
    matches.forEach(item=>{
      const div = document.createElement('div');
      const c   = sc(item.Sector);
      div.innerHTML =
        `<span class="res-code">${esc(item.RepCode)}</span> `+
        `<span class="res-name">– ${esc(item.NameEnglish)}</span>`+
        `<span class="res-sector" style="background:${c}22;color:${c};border:1px solid ${c}55">${esc(item.Sector)}</span>`;
      div.addEventListener('mousedown', e => {
        e.preventDefault();
        resultsDiv.style.display = 'none';
        searchBox.value = item.NameEnglish;
        navigateTo(item.RepCode);
      });
      resultsDiv.appendChild(div);
    });
    resultsDiv.style.display = 'block';
  });
  document.addEventListener('click', e => {
    if(!document.getElementById('searchWrap').contains(e.target))
      resultsDiv.style.display='none';
  });

  // ── Reset ─────────────────────────────────────────────────────────────────
  document.getElementById('resetBtn').onclick = () => {
    searchBox.value = '';
    resultsDiv.style.display = 'none';
    clearHighlight();
    networkInstance.fit({ animation:{ duration:600, easingFunction:'easeInOutQuad' } });
  };

  // ── Filter bar ────────────────────────────────────────────────────────────
  document.getElementById('filterDir').onchange = () => renderSidebar(currentCode);
  document.getElementById('filterStr').onchange = () => renderSidebar(currentCode);

  // ── Node / edge click ─────────────────────────────────────────────────────
  networkInstance.on('click', params => {
    if(drawMode && drawFrom && params.nodes.length > 0){
      const toCode = params.nodes[0];
      if(toCode !== drawFrom){
        const newEdge = {
          id: `added_${drawFrom}_${toCode}_${Date.now()}`,
          from: drawFrom, to: toCode,
          color:{ color:'#bc8cff88', highlight:'#bc8cff', hover:'#bc8cff' },
          width:1.5, dashes:false,
          arrows:{ to:{ enabled:true, scaleFactor:0.5 } },
          title:'User-added connection'
        };
        edgesDS.add(newEdge);
        addedEdges.push(newEdge);
      }
      drawFrom = null;
      toggleDrawMode(false);
      return;
    }
    if(params.nodes.length > 0){
      const code = params.nodes[0];
      searchBox.value = indByCode.get(code)?.NameEnglish || code;
      navigateTo(code);
    } else if(params.edges.length > 0 && !drawMode){
      highlightEdge(params.edges[0]);
    } else {
      clearHighlight();
    }
  });

  networkInstance.on('oncontext', params => {
    params.event.preventDefault();
    showContextMenu(params);
  });
  networkInstance.on('click', () => hideContextMenu());

  setupIotCanvasEvents();
}

// ══════════════════════════════════════════════════════════════════════════════
// SATNAV + HIGHLIGHT
// ══════════════════════════════════════════════════════════════════════════════
function navigateTo(code){
  currentCode = code;
  document.getElementById('currentIndustry').textContent = code;
  if(networkInstance && nodesDS && nodesDS.get(code)){
    networkInstance.focus(code, { scale:1.4, animation:{ duration:700, easingFunction:'easeInOutQuad' } });
    networkInstance.selectNodes([code]);
    pulseNode(code);
  }
  renderSidebar(code);
}

function pulseNode(code){
  const orig = nodesDS.get(code);
  if(!orig) return;
  let t = 0;
  const iv = setInterval(()=>{
    t++;
    nodesDS.update({ id:code, size: 14 + Math.sin(t*0.5)*8 });
    if(t > 18){ clearInterval(iv); nodesDS.update({ id:code, size:14 }); }
  }, 60);
}

function highlightEdge(edgeId){
  const e = edgesDS.get(edgeId);
  if(!e) return;
  const fromInd = indByCode.get(e.from);
  const toInd   = indByCode.get(e.to);
  document.getElementById('infoBox').innerHTML =
    `<div class="d-section">Edge</div>`+
    `<div class="d-row"><span class="d-label">From</span><span class="d-val">${esc(fromInd?.NameEnglish||e.from)}</span></div>`+
    `<div class="d-row"><span class="d-label">To</span><span class="d-val">${esc(toInd?.NameEnglish||e.to)}</span></div>`+
    `<div class="d-row"><span class="d-label">Type</span><span class="d-val">${esc(e.title||'')}</span></div>`;
}

function clearHighlight(){
  currentCode = null;
  document.getElementById('currentIndustry').textContent = '';
  document.getElementById('infoBox').innerHTML = '<div id="emptyMsg">Search or click a node to explore.</div>';
  if(networkInstance){ networkInstance.unselectAll(); }
}

// ══════════════════════════════════════════════════════════════════════════════
// SIDEBAR RENDERER
// ══════════════════════════════════════════════════════════════════════════════
function renderSidebar(code){
  if(!code) return;
  const ind = indByCode.get(code);
  if(!ind){ document.getElementById('infoBox').innerHTML='<div class="no-links">Industry not found.</div>'; return; }

  const dirFilter = document.getElementById('filterDir').value;
  const strFilter = parseInt(document.getElementById('filterStr').value)||1;

  const links = (linksByCode.get(code)||[]).filter(l => {
    if(deletedEdges.has(l._id)) return false;
    if(dirFilter !== 'all' && l.Direction !== dirFilter) return false;
    if((l.StrengthScore||1) < strFilter) return false;
    return true;
  });

  const upstream   = links.filter(l => l.Direction==='Upstream');
  const peer       = links.filter(l => l.Direction==='Peer');
  const downstream = links.filter(l => l.Direction==='Downstream');

  const c  = sc(ind.Sector);
  const pv = val(ind.Priority,'').toLowerCase();
  const priBadge = pv === 'high'
    ? `<span class="priority-badge priority-high">High</span>`
    : pv === 'medium' || pv === 'med'
    ? `<span class="priority-badge priority-med">Medium</span>`
    : pv ? `<span class="priority-badge priority-low">${esc(val(ind.Priority))}</span>` : '';

  const vcs = val(ind.ValueChainStage);
  const vcsBadge = vcs ? `<span class="status-badge">${esc(vcs)}</span>` : '';

  const allAteco = [val(ind.ATECOPrimary), ...val(ind.ATECOAll).split(/[,;]/).map(s=>s.trim())]
    .filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
  const atecoHtml = allAteco.map(a=>`<span class="ateco-chip">${esc(a)}</span>`).join('')
    || '<span class="empty-val">—</span>';

  const kwEN = val(ind.KeywordsIncludeEN).split(/[,;]/).map(s=>s.trim()).filter(Boolean);
  const kwIT = val(ind.KeywordsIncludeIT).split(/[,;]/).map(s=>s.trim()).filter(Boolean);
  const kwHtml = [...kwEN,...kwIT].map(k=>`<span class="kw-tag">${esc(k)}</span>`).join('')
    || '<span class="empty-val">—</span>';

  const defEN = val(ind.ReportDefinitionEN) || val(ind.MarketingDefinitionEN);
  const defHtml = defEN
    ? `<div class="collapsible-wrap"><div class="ctext collapsed" id="ctext_${code}">${esc(defEN)}</div>`+
      `<span class="toggle-btn" onclick="toggleCollapse('ctext_${code}',this)">▼ Show more</span></div>`
    : '<span class="empty-val">—</span>';

  const orbis = val(ind.OrbisBoolean);
  const orbisHtml = orbis ? `<div class="orbis-box">${esc(orbis)}</div>` : '<span class="empty-val">—</span>';

  const ta = val(ind.TradeAssociations);
  const taHtml = ta ? esc(ta) : '<span class="empty-val">—</span>';

  function connItem(l){
    const otherCode = l.ToIndustryCode === code ? l.FromIndustryCode : l.ToIndustryCode;
    const otherInd  = indByCode.get(otherCode);
    const name      = otherInd?.NameEnglish || otherCode;
    const dir       = (l.Direction||'Peer').toLowerCase();
    return `<div class="neighbor-item ${dir}" onclick="navigateTo('${otherCode}')">
      <span>${esc(name)}</span><span class="neighbor-code">${esc(otherCode)}</span>
    </div>`;
  }

  const upHtml   = upstream.length   ? upstream.map(connItem).join('')   : '<div class="no-links">None</div>';
  const peerHtml = peer.length       ? peer.map(connItem).join('')       : '<div class="no-links">None</div>';
  const downHtml = downstream.length ? downstream.map(connItem).join('') : '<div class="no-links">None</div>';

  document.getElementById('infoBox').innerHTML = `
    <span class="d-repcode">${esc(ind.RepCode)}</span>
    <div class="d-title">${esc(val(ind.NameEnglish, ind.RepCode))}</div>
    <div class="d-native">${esc(val(ind.NameNative,''))}</div>
    <div class="d-badges">
      <span class="sector-pill" style="background:${c}22;color:${c};border:1px solid ${c}55">${sl(ind.Sector)}</span>
      ${priBadge}${vcsBadge}
    </div>
    <div class="d-section">Classification</div>
    <div class="d-row"><span class="d-label">ATECO codes</span><span class="d-val">${atecoHtml}</span></div>
    <div class="d-section">Definition</div>
    <div class="d-row"><span class="d-val" style="flex:1">${defHtml}</span></div>
    <div class="d-section">Keywords</div>
    <div class="d-row"><span class="d-val" style="flex:1">${kwHtml}</span></div>
    <div class="d-section">Orbis Boolean</div>
    <div class="d-row"><span class="d-val" style="flex:1">${orbisHtml}</span></div>
    <div class="d-section">Trade Associations</div>
    <div class="d-row"><span class="d-val" style="flex:1">${taHtml}</span></div>
    <div class="d-section">Connections (${links.length})</div>
    <div class="conn-group">
      <div class="conn-group-label conn-upstream">▲ Upstream <span class="conn-count">(${upstream.length})</span></div>
      ${upHtml}
    </div>
    <div class="conn-group">
      <div class="conn-group-label conn-peer">↔ Peer <span class="conn-count">(${peer.length})</span></div>
      ${peerHtml}
    </div>
    <div class="conn-group">
      <div class="conn-group-label conn-downstream">▼ Downstream <span class="conn-count">(${downstream.length})</span></div>
      ${downHtml}
    </div>
  `;
}

function toggleCollapse(id, btn){
  const el = document.getElementById(id);
  if(!el) return;
  const collapsed = el.classList.contains('collapsed');
  el.classList.toggle('collapsed', !collapsed);
  el.classList.toggle('expanded',  collapsed);
  btn.textContent = collapsed ? '▲ Show less' : '▼ Show more';
}

// ══════════════════════════════════════════════════════════════════════════════
// DRAW MODE / PHYSICS
// ══════════════════════════════════════════════════════════════════════════════
let _physicsOn = false;
function togglePhysics(){
  _physicsOn = !_physicsOn;
  networkInstance && networkInstance.setOptions({ physics:{ enabled:_physicsOn } });
  document.getElementById('physicsBtn').textContent = _physicsOn ? '⏸ Physics ON' : '▶ Physics OFF';
}

function toggleDrawMode(forceOff){
  drawMode = forceOff === false ? false : !drawMode;
  drawFrom = null;
  const btn = document.getElementById('drawBtn');
  btn.textContent      = drawMode ? '✔ Drawing…' : '✏ Add Connection';
  btn.style.borderColor = drawMode ? '#3fb950' : '';
  btn.style.color       = drawMode ? '#3fb950' : '';
  if(drawMode){
    networkInstance && networkInstance.on('selectNode', params => {
      if(!drawMode) return;
      if(!drawFrom) drawFrom = params.nodes[0];
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTEXT MENU
// ══════════════════════════════════════════════════════════════════════════════
function showContextMenu(params){
  const menu = document.getElementById('ctxMenu');
  const x = params.event.clientX;
  const y = params.event.clientY;
  let html = '';
  if(params.nodes.length > 0){
    const code = params.nodes[0];
    const ind  = indByCode.get(code);
    html = `<div class="ctx-title">${esc(ind?.NameEnglish||code)}</div>`+
           `<div class="ctx-item" onclick="navigateTo('${code}');hideContextMenu()">📋 View details</div>`+
           `<div class="ctx-item ctx-danger" onclick="removeNode('${code}');hideContextMenu()">✕ Remove node</div>`;
  } else if(params.edges.length > 0){
    const eid = params.edges[0];
    html = `<div class="ctx-title">Edge</div>`+
           `<div class="ctx-item ctx-danger" onclick="removeEdge('${eid}');hideContextMenu()">✕ Remove connection</div>`;
  } else { return; }
  menu.innerHTML = html;
  menu.style.display = 'block';
  menu.style.left = x+'px';
  menu.style.top  = y+'px';
}
function hideContextMenu(){ document.getElementById('ctxMenu').style.display='none'; }

function removeNode(code){
  const links = linksByCode.get(code)||[];
  links.forEach(l => { deletedEdges.add(l._id); edgesDS && edgesDS.remove(l._id); });
  nodesDS && nodesDS.remove(code);
}
function removeEdge(eid){
  deletedEdges.add(eid);
  edgesDS && edgesDS.remove(eid);
}

// ══════════════════════════════════════════════════════════════════════════════
// TOGGLE VIEWS
// ══════════════════════════════════════════════════════════════════════════════
function toggleIotView(){
  iotMode = !iotMode;
  const btn = document.getElementById('iotBtn');
  document.getElementById('network').style.display   = iotMode ? 'none' : 'block';
  document.getElementById('sidebar').style.display   = iotMode ? 'none' : 'flex';
  document.getElementById('legend').style.display    = iotMode ? 'none' : 'block';
  document.getElementById('filterbar').style.display = iotMode ? 'none' : 'flex';
  if(iotMode){
    document.getElementById('iotView').classList.add('active');
    document.getElementById('iotSidebar').classList.add('active');
    document.getElementById('iotLegend').style.display = 'block';
    btn.textContent = '🕸 Graph View';
    btn.style.borderColor = '#58a6ff'; btn.style.color = '#58a6ff';
    loadIotData();
    setTimeout(resizeIotCanvas, 50);
  } else {
    document.getElementById('iotView').classList.remove('active');
    document.getElementById('iotSidebar').classList.remove('active');
    document.getElementById('iotLegend').style.display = 'none';
    btn.textContent = '🌐 IOT Spiderweb';
    btn.style.borderColor = '#f0883e'; btn.style.color = '#f0883e';
    if(iotAnimFrame){ cancelAnimationFrame(iotAnimFrame); iotAnimFrame=null; }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// IOT SPIDERWEB – CANVAS RADIAL RENDERER
// ══════════════════════════════════════════════════════════════════════════════
function resizeIotCanvas(){
  const canvas = document.getElementById('iotCanvas');
  const wrap   = document.getElementById('iotView');
  canvas.width  = wrap.clientWidth - (document.getElementById('iotSidebar').clientWidth || 280);
  canvas.height = wrap.clientHeight;
  if(iotLoaded) drawIotSpiderweb();
}
window.addEventListener('resize', () => { if(iotMode) resizeIotCanvas(); });

function getSectors(){ return Object.keys(IOT_SECTOR_COLORS); }

function drawIotSpiderweb(){
  const canvas = document.getElementById('iotCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  if(!W || !H) return;
  ctx.clearRect(0,0,W,H);

  const sectors = getSectors();
  const n = sectors.length;
  const cx = W/2, cy = H/2;
  const R  = Math.min(W,H) * 0.36;

  const pos = {};
  sectors.forEach((s,i) => {
    const angle = (2*Math.PI*i/n) - Math.PI/2;
    pos[s] = { x: cx+R*Math.cos(angle), y: cy+R*Math.sin(angle), angle };
  });

  const maxFlow = Math.max(...iotSectorLinks.map(l=>l.value_bn||0)) || 1;

  iotSectorLinks.forEach(link => {
    const from = pos[link.source], to = pos[link.target];
    if(!from||!to) return;
    const isActive = (iotSelected===link.source||iotSelected===link.target||iotHovered===link.source||iotHovered===link.target);
    const t = (link.value_bn||0)/maxFlow;
    const alpha = isActive ? 0.8 : (iotSelected ? 0.06 : 0.18+t*0.45);
    const lineW = isActive ? 1.5+t*14 : 0.5+t*10;
    const hex = iotColor(link.source);
    const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(from.x,from.y);
    ctx.quadraticCurveTo(cx+(from.x+to.x-2*cx)*0.18, cy+(from.y+to.y-2*cy)*0.18, to.x, to.y);
    ctx.strokeStyle=`rgba(${r},${g},${b},${alpha})`;
    ctx.lineWidth=lineW; ctx.lineCap='round'; ctx.stroke();
    if(isActive||t>0.3){
      const dx=to.x-from.x, dy=to.y-from.y, len=Math.sqrt(dx*dx+dy*dy)||1;
      const ux=dx/len, uy=dy/len;
      const mx=(from.x+to.x)/2, my=(from.y+to.y)/2;
      const aSize=isActive?8:5;
      ctx.beginPath();
      ctx.moveTo(mx+ux*aSize, my+uy*aSize);
      ctx.lineTo(mx-ux*aSize-uy*aSize*0.6, my-uy*aSize+ux*aSize*0.6);
      ctx.lineTo(mx-ux*aSize+uy*aSize*0.6, my-uy*aSize-ux*aSize*0.6);
      ctx.closePath();
      ctx.fillStyle=`rgba(${r},${g},${b},${alpha+0.1})`; ctx.fill();
    }
    ctx.restore();
  });

  sectors.forEach(s => {
    const p = pos[s];
    const isSel = iotSelected===s, isHov = iotHovered===s, isDim = iotSelected&&!isSel;
    const color = iotColor(s);
    const radius = isSel ? 28 : isHov ? 24 : 18;
    ctx.save();
    ctx.globalAlpha = isDim ? 0.3 : 1.0;
    if(isSel){ ctx.shadowColor=color; ctx.shadowBlur=22; }
    ctx.beginPath(); ctx.arc(p.x,p.y,radius,0,2*Math.PI);
    const hex=color, r2=parseInt(hex.slice(1,3),16), g2=parseInt(hex.slice(3,5),16), b2=parseInt(hex.slice(5,7),16);
    ctx.fillStyle=`rgba(${r2},${g2},${b2},0.85)`; ctx.fill();
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=isSel?3:1.5; ctx.stroke();
    ctx.shadowBlur=0;
    const labelR=R+42, lx=cx+labelR*Math.cos(p.angle), ly=cy+labelR*Math.sin(p.angle);
    const words=s.split(' & ');
    ctx.font=isSel?'bold 13px Segoe UI':'12px Segoe UI';
    ctx.fillStyle=isDim?'#484f58':'#e6edf3';
    ctx.textAlign=lx<cx-10?'right':lx>cx+10?'left':'center';
    ctx.textBaseline='middle';
    words.forEach((word,wi)=>{ ctx.fillText(word, lx, ly+(wi-(words.length-1)/2)*15); });
    ctx.restore();
  });

  ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
  if(iotSelected){
    const outFlows=iotSectorLinks.filter(l=>l.source===iotSelected).reduce((s,l)=>s+(l.value_bn||0),0);
    const inFlows =iotSectorLinks.filter(l=>l.target===iotSelected).reduce((s,l)=>s+(l.value_bn||0),0);
    ctx.font='bold 15px Segoe UI'; ctx.fillStyle=iotColor(iotSelected);
    ctx.fillText(iotSelected,cx,cy-28);
    ctx.font='12px Segoe UI'; ctx.fillStyle='#8b949e';
    ctx.fillText(`▶ Out: ${fmtBn(outFlows)}`,cx,cy-8);
    ctx.fillText(`◀ In: ${fmtBn(inFlows)}`,cx,cy+10);
    ctx.fillStyle='#484f58'; ctx.font='11px Segoe UI';
    ctx.fillText('Click to deselect',cx,cy+30);
  } else {
    ctx.font='bold 14px Segoe UI'; ctx.fillStyle='#f0883e';
    ctx.fillText('EA20 · 2023',cx,cy-12);
    ctx.font='12px Segoe UI'; ctx.fillStyle='#484f58';
    ctx.fillText('IOT Sector Flows',cx,cy+10);
  }
  ctx.restore();
}

function getIotSectorAtXY(mx,my){
  const canvas=document.getElementById('iotCanvas');
  const W=canvas.width, H=canvas.height;
  const sectors=getSectors(), n=sectors.length;
  const cx=W/2, cy=H/2, R=Math.min(W,H)*0.36;
  for(let i=0;i<n;i++){
    const angle=(2*Math.PI*i/n)-Math.PI/2;
    const sx=cx+R*Math.cos(angle), sy=cy+R*Math.sin(angle);
    if(Math.sqrt((mx-sx)**2+(my-sy)**2)<28) return sectors[i];
  }
  return null;
}

function selectIotSector(s){
  iotSelected = (s===iotSelected) ? null : s;
  highlightGvaList(iotSelected);
  drawIotSpiderweb();
}

function setupIotCanvasEvents(){
  const canvas  = document.getElementById('iotCanvas');
  const tooltip = document.getElementById('iotTooltip');
  if(!canvas) return;
  canvas.addEventListener('mousemove', e => {
    if(!iotLoaded) return;
    const rect = canvas.getBoundingClientRect();
    const hit  = getIotSectorAtXY(e.clientX-rect.left, e.clientY-rect.top);
    iotHovered = hit;
    if(hit){
      const topOut = iotSectorLinks.filter(l=>l.source===hit).sort((a,b)=>(b.value_bn||0)-(a.value_bn||0)).slice(0,3);
      const topIn  = iotSectorLinks.filter(l=>l.target===hit).sort((a,b)=>(b.value_bn||0)-(a.value_bn||0)).slice(0,3);
      const totalOut = topOut.reduce((s,l)=>s+(l.value_bn||0),0);
      const totalIn  = topIn.reduce((s,l)=>s+(l.value_bn||0),0);
      let txt = `${hit}\nTotal output: ${fmtBn(totalOut)}\nTotal input: ${fmtBn(totalIn)}`;
      if(topOut.length) txt += `\n▶ Sells to: `+topOut.map(l=>`${l.target} (${fmtBn(l.value_bn)})`).join(', ');
      if(topIn.length)  txt += `\n◀ Buys from: `+topIn.map(l=>`${l.source} (${fmtBn(l.value_bn)})`).join(', ');
      tooltip.innerText = txt;
      tooltip.style.display = 'block';
      tooltip.style.left = Math.min(e.clientX-rect.left+16, canvas.width-280)+'px';
      tooltip.style.top  = Math.max(e.clientY-rect.top-10, 8)+'px';
    } else {
      tooltip.style.display='none';
    }
    drawIotSpiderweb();
  });
  canvas.addEventListener('mouseleave', ()=>{ iotHovered=null; tooltip.style.display='none'; drawIotSpiderweb(); });
  canvas.addEventListener('click', e=>{
    if(!iotLoaded) return;
    const rect=canvas.getBoundingClientRect();
    selectIotSector(getIotSectorAtXY(e.clientX-rect.left, e.clientY-rect.top));
  });
}

// ── GVA sidebar ───────────────────────────────────────────────────────────────
function buildGvaList(){
  const list   = document.getElementById('gvaList');
  const maxGva = iotGva[0]?.gva_bn || 1;
  list.innerHTML = iotGva.map((item,i) => {
    const c   = iotColor(item.sector);
    const pct = (item.gva_bn/maxGva*100).toFixed(1);
    return `<div class="gva-item" id="gva_${i}" onclick="selectIotSector('${item.sector}')">
      <div class="gva-dot" style="background:${c}"></div>
      <span class="gva-name">${esc(item.sector)}</span>
      <div class="gva-bar-wrap"><div class="gva-bar" style="width:${pct}%;background:${c}"></div></div>
      <span class="gva-val">${fmtBn(item.gva_bn)}</span>
    </div>`;
  }).join('');
}

function highlightGvaList(sel){
  document.querySelectorAll('.gva-item').forEach(el => {
    el.style.opacity = sel ? (el.onclick?.toString().includes(sel) ? '1' : '0.35') : '1';
  });
}

function buildIotLegend(){
  const leg = document.getElementById('iotLegend');
  const rows = Object.entries(IOT_SECTOR_COLORS).map(([s,c])=>
    `<div class="iot-leg-row"><div class="iot-leg-dot" style="background:${c}"></div><span>${esc(s)}</span></div>`
  ).join('');
  leg.innerHTML = `<h3>Macro Sector</h3>${rows}`;
}

// ── label helper ──────────────────────────────────────────────────────────────
function wrapLabel(name, max=18){
  const words=String(name).split(' ');
  const lines=[]; let line='';
  words.forEach(w=>{
    if((line+' '+w).trim().length>max&&line){ lines.push(line); line=w; }
    else line=(line+' '+w).trim();
  });
  if(line) lines.push(line);
  return lines.slice(0,3).join('\n');
}

// ── BOOTSTRAP ─────────────────────────────────────────────────────────────────
applyTheme(true);
loadData();
