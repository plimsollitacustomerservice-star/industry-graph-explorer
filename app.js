// ══════════════════════════════════════════════════════════════════════════════
// app.js  –  Industry Graph Explorer  (UX Enhanced Edition)
// New in this build:
//   1.  Ego-network highlight on node click (non-neighbours dimmed)
//   2.  '/' keyboard shortcut to focus search
//   3.  Copy Orbis Boolean button
//   4.  Arrow-key + Enter keyboard navigation in search dropdown
//   5.  Back / Forward history (← →)
//   6.  URL hash state  (#code=IND001)
//   7.  Starred industries (localStorage)
//   8.  Export connections to CSV
//   9.  ATECO chip click-through filter
//  10.  Loading progress bar
//  11.  Sidebar resize handle (drag)
//  12.  Inline annotation notes (localStorage)
//  13.  "Focus" button in sidebar re-centres graph on current node
//  14.  Search dropdown initialised at DOM-ready (not inside buildSpiderweb)
// Patches:
//  FIX-A. Priority badge reads CommercialPriority (falls back to Priority)
//  FIX-B. Definition prefers MarketingDefinitionEN over status-word fields
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
let activeSector    = 'all';
let activeAteco     = null;
let _navHistory     = [];
let _navIdx         = -1;
let _skipHashUpdate = false;
let _searchResultIdx = -1;
let _starred        = new Set(JSON.parse(localStorage.getItem('ige_starred')||'[]'));
let _notes          = JSON.parse(localStorage.getItem('ige_notes')||'{}');

// ── fast lookup maps ──────────────────────────────────────────────────────────
let indByCode   = new Map();
let linksByCode = new Map();

function registerIndustry(ind){
  indByCode.set(ind.RepCode, ind);
}
function registerLink(link){
  if (!link._id) link._id = `l_${link.FromIndustryCode}_${link.ToIndustryCode}_${linksData.length}`;
  if (!linksByCode.has(link.FromIndustryCode)) linksByCode.set(link.FromIndustryCode, []);
  if (!linksByCode.has(link.ToIndustryCode))   linksByCode.set(link.ToIndustryCode,   []);
  linksByCode.get(link.FromIndustryCode).push(link);
  linksByCode.get(link.ToIndustryCode).push(link);
}

// ── IOT state ─────────────────────────────────────────────────────────────────
let iotMode=false, iotNodes=[], iotSectorLinks=[], iotGva=[], iotLoaded=false;
let iotHovered=null, iotSelected=null, iotAnimFrame=null;

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

const esc   = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const empty = v => { if(!v) return true; const s=String(v).trim(); return !s||s==='undefined'||s==='null'||s==='None'; };
const val   = (v,f='') => empty(v) ? f : String(v).trim();
const fmtBn = v => v >= 1000 ? (v/1000).toFixed(1)+'T€' : v.toFixed(0)+'B€';

// ══════════════════════════════════════════════════════════════════════════════
// #10  PROGRESS BAR
// ══════════════════════════════════════════════════════════════════════════════
function showProgress(pct){
  let bar = document.getElementById('ige_progress');
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'ige_progress';
    Object.assign(bar.style, {
      position:'fixed', top:'0', left:'0', height:'3px',
      background:'#58a6ff', zIndex:'9999', transition:'width .3s ease'
    });
    document.body.prepend(bar);
  }
  bar.style.width = pct + '%';
  if(pct >= 100) setTimeout(() => bar.remove(), 400);
}

// ══════════════════════════════════════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════════════════════════════════════
let _darkMode = true;
function applyTheme(dark){
  _darkMode = dark;
  const root = document.documentElement;
  if(dark){
    root.style.setProperty('--bg','#0d1117'); root.style.setProperty('--bg2','#161b22');
    root.style.setProperty('--bg3','#21262d'); root.style.setProperty('--border','#30363d');
    root.style.setProperty('--text','#e6edf3'); root.style.setProperty('--text2','#c9d1d9');
    root.style.setProperty('--muted','#8b949e');
    document.body.style.background='#0d1117'; document.body.style.color='#e6edf3';
  } else {
    root.style.setProperty('--bg','#ffffff'); root.style.setProperty('--bg2','#f6f8fa');
    root.style.setProperty('--bg3','#eaeef2'); root.style.setProperty('--border','#d0d7de');
    root.style.setProperty('--text','#1f2328'); root.style.setProperty('--text2','#24292f');
    root.style.setProperty('--muted','#57606a');
    document.body.style.background='#ffffff'; document.body.style.color='#1f2328';
  }
  const btn = document.getElementById('themeBtn');
  if(btn) btn.textContent = dark ? '☀ Light' : '🌙 Dark';
  if(iotMode && iotLoaded) drawIotSpiderweb();
}
function toggleTheme(){ applyTheme(!_darkMode); }

// ══════════════════════════════════════════════════════════════════════════════
// #6  URL HASH STATE
// ══════════════════════════════════════════════════════════════════════════════
function pushHash(code){
  if(_skipHashUpdate) return;
  history.replaceState(null,'', code ? `#code=${encodeURIComponent(code)}` : '#');
}
function readHash(){
  const m = location.hash.match(/[#&]code=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
window.addEventListener('hashchange', () => {
  const code = readHash();
  if(code && code !== currentCode) navigateTo(code, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// #5  BACK / FORWARD HISTORY
// ══════════════════════════════════════════════════════════════════════════════
function historyPush(code){
  _navHistory = _navHistory.slice(0, _navIdx + 1);
  _navHistory.push(code);
  _navIdx = _navHistory.length - 1;
  updateNavBtns();
}
function historyBack(){
  if(_navIdx <= 0) return;
  _navIdx--;
  _skipHashUpdate = true;
  navigateTo(_navHistory[_navIdx], true);
  _skipHashUpdate = false;
  pushHash(_navHistory[_navIdx]);
  updateNavBtns();
}
function historyForward(){
  if(_navIdx >= _navHistory.length - 1) return;
  _navIdx++;
  _skipHashUpdate = true;
  navigateTo(_navHistory[_navIdx], true);
  _skipHashUpdate = false;
  pushHash(_navHistory[_navIdx]);
  updateNavBtns();
}
function updateNavBtns(){
  const b = document.getElementById('navBack');
  const f = document.getElementById('navFwd');
  if(b) b.disabled = _navIdx <= 0;
  if(f) f.disabled = _navIdx >= _navHistory.length - 1;
}

// ══════════════════════════════════════════════════════════════════════════════
// #7  STARRED INDUSTRIES
// ══════════════════════════════════════════════════════════════════════════════
function toggleStar(code){
  if(_starred.has(code)) _starred.delete(code);
  else _starred.add(code);
  localStorage.setItem('ige_starred', JSON.stringify([..._starred]));
  renderSidebar(currentCode);
  renderStarredFilter();
}
function renderStarredFilter(){
  const el = document.getElementById('starredCount');
  if(el) el.textContent = _starred.size > 0 ? `⭐ ${_starred.size}` : '';
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTOR FILTER
// ══════════════════════════════════════════════════════════════════════════════
function applySectorFilter(){
  activeSector = document.getElementById('filterSector').value;
  activeAteco  = null;
  _applyVisibility();
}

function applyAtecoFilter(code){
  activeAteco  = (activeAteco === code) ? null : code;
  activeSector = 'all';
  document.getElementById('filterSector').value = 'all';
  _applyVisibility();
}

function _applyVisibility(){
  if(!nodesDS) return;
  const updates = industriesData.map(ind => {
    let visible = true;
    if(activeSector !== 'all') visible = ind.Sector === activeSector;
    if(activeAteco){
      const codes = [val(ind.ATECOPrimary), ...val(ind.ATECOAll).split(/[,;]/).map(s=>s.trim())].filter(Boolean);
      visible = codes.some(c => c === activeAteco || c.startsWith(activeAteco+'.')||activeAteco.startsWith(c+'.'));
    }
    return {
      id: ind.RepCode, hidden: !visible,
      color: visible
        ? { background:sc(ind.Sector)+'33', border:sc(ind.Sector), highlight:{ background:sc(ind.Sector)+'66', border:sc(ind.Sector) } }
        : { background:'transparent', border:'transparent', highlight:{ background:'transparent', border:'transparent' } }
    };
  });
  nodesDS.update(updates);
  if(edgesDS){
    const edgeUpdates = linksData.filter(l=>!deletedEdges.has(l._id)).map(l => {
      const fInd = indByCode.get(l.FromIndustryCode);
      const tInd = indByCode.get(l.ToIndustryCode);
      const fVis = _nodeVisible(fInd);
      const tVis = _nodeVisible(tInd);
      return { id:l._id, hidden: !(fVis && tVis) };
    });
    edgesDS.update(edgeUpdates);
  }
  const visN = industriesData.filter(i => _nodeVisible(i)).length;
  const statsEl = document.getElementById('statsLabel');
  if(activeSector === 'all' && !activeAteco){
    statsEl.textContent = `${industriesData.length.toLocaleString()} industries · ${linksData.length.toLocaleString()} links`;
  } else {
    const label = activeAteco ? `ATECO ${activeAteco}` : sl(activeSector);
    statsEl.textContent = `Showing ${visN.toLocaleString()} / ${industriesData.length.toLocaleString()} · ${label}`;
  }
  if(currentCode){
    const cur = indByCode.get(currentCode);
    if(cur && !_nodeVisible(cur)) clearHighlight();
  }
}

function _nodeVisible(ind){
  if(!ind) return false;
  if(activeSector !== 'all' && ind.Sector !== activeSector) return false;
  if(activeAteco){
    const codes = [val(ind.ATECOPrimary), ...val(ind.ATECOAll).split(/[,;]/).map(s=>s.trim())].filter(Boolean);
    return codes.some(c => c === activeAteco || c.startsWith(activeAteco+'.')||activeAteco.startsWith(c+'.'));
  }
  return true;
}

// ══════════════════════════════════════════════════════════════════════════════
// DATA LOADING
// ══════════════════════════════════════════════════════════════════════════════
function processIndustries(data){
  indByCode = new Map(); linksByCode = new Map();
  industriesData = data;
  industriesData.forEach(ind => {
    registerIndustry(ind);
    ind._searchBlob = [ind.RepCode||'',ind.NameEnglish||'',ind.NameNative||'',
      ind.ATECOPrimary||'',ind.ATECOAll||'',ind.KeywordsIncludeEN||'',ind.KeywordsIncludeIT||''
    ].join(' ').toLowerCase();
  });
}
function processLinks(data){
  linksData = data;
  linksData.forEach((l,idx) => { l._id = l._id || `l_${idx}`; registerLink(l); });
}

async function loadData(){
  const statsEl = document.getElementById('statsLabel');
  statsEl.textContent = 'Loading data…';
  showProgress(5);
  let manifest;
  try {
    manifest = await axios.get('data/manifest.json').then(r=>r.data);
  } catch(e) {
    statsEl.textContent = '❌ Could not load manifest.json';
    return;
  }
  showProgress(20);
  let industriesLoaded = false;
  try {
    const iFiles = manifest.industryFiles.map(f=>'data/'+f);
    const lFiles = manifest.linkFiles.map(f=>'data/'+f);
    const total  = iFiles.length + lFiles.length;
    let done = 0;
    const fetchWithProgress = url => axios.get(url).then(r=>{ done++; showProgress(20 + Math.round(done/total*70)); return r.data; });
    const [iRes, lRes] = await Promise.all([
      Promise.all(iFiles.map(fetchWithProgress)),
      Promise.all(lFiles.map(fetchWithProgress))
    ]);
    processIndustries(iRes.flat());
    processLinks(lRes.flat());
    industriesLoaded = true;
  } catch(e) { console.warn('⚠️ Chunked files failed, trying master…', e); }

  if(!industriesLoaded && manifest.masterFile){
    try {
      showProgress(50);
      const masterData = await axios.get('data/'+manifest.masterFile).then(r=>r.data);
      processIndustries(masterData);
      const lRes = await Promise.all(manifest.linkFiles.map(f=>axios.get('data/'+f).then(r=>r.data)));
      processLinks(lRes.flat());
      industriesLoaded = true;
    } catch(fe) { statsEl.textContent = '❌ Both chunked files and master fallback failed.'; return; }
  }
  showProgress(100);
  statsEl.textContent = `${industriesData.length.toLocaleString()} industries · ${linksData.length.toLocaleString()} links`;
  buildSpiderweb();
  const hashCode = readHash();
  if(hashCode && indByCode.has(hashCode)) setTimeout(()=>navigateTo(hashCode,true),300);
}

async function loadIotData(){
  if(iotLoaded) return;
  try {
    const [nodes,slinks,gva] = await Promise.all([
      axios.get('data/ea20_iot_nodes.json').then(r=>r.data),
      axios.get('data/ea20_iot_sector_links.json').then(r=>r.data),
      axios.get('data/ea20_iot_gva.json').then(r=>r.data)
    ]);
    iotNodes=nodes; iotSectorLinks=slinks; iotGva=gva; iotLoaded=true;
    document.getElementById('iotStatLine').textContent=`${nodes.length} NACE nodes · ${slinks.length} sector flows`;
    buildGvaList(); buildIotLegend(); drawIotSpiderweb();
  } catch(e){ document.getElementById('iotStatLine').textContent='Error loading IOT data'; }
}

// ══════════════════════════════════════════════════════════════════════════════
// #14  SEARCH – initialised at DOM-ready, works before graph loads
// ══════════════════════════════════════════════════════════════════════════════
function initSearch(){
  const searchBox  = document.getElementById('searchBox');
  const resultsDiv = document.getElementById('results');
  if(!searchBox || !resultsDiv) return;

  function renderDropdown(q){
    _searchResultIdx = -1;
    resultsDiv.innerHTML = '';
    if(!q){ resultsDiv.style.display='none'; return; }
    const matches = industriesData
      .filter(i => i._searchBlob && i._searchBlob.includes(q)
        && (activeSector==='all' || i.Sector===activeSector))
      .slice(0,25);
    if(!matches.length){ resultsDiv.style.display='none'; return; }
    matches.forEach((item,idx) => {
      const div = document.createElement('div');
      div.dataset.idx = idx;
      const c = sc(item.Sector);
      div.innerHTML =
        `<span class="res-code">${esc(item.RepCode)}</span> `+
        `<span class="res-name">– ${esc(item.NameEnglish)}</span>`+
        `<span class="res-sector" style="background:${c}22;color:${c};border:1px solid ${c}55">${esc(item.Sector)}</span>`;
      div.addEventListener('mousedown', e => {
        e.preventDefault();
        resultsDiv.style.display='none';
        searchBox.value = item.NameEnglish;
        navigateTo(item.RepCode);
      });
      resultsDiv.appendChild(div);
    });
    resultsDiv._matches = matches;
    resultsDiv.style.display='block';
  }

  searchBox.addEventListener('input', () => renderDropdown(searchBox.value.trim().toLowerCase()));

  // #4 arrow-key navigation
  searchBox.addEventListener('keydown', e => {
    const items = resultsDiv.querySelectorAll('div');
    if(e.key==='ArrowDown'){
      e.preventDefault();
      _searchResultIdx = Math.min(_searchResultIdx+1, items.length-1);
      _highlightItem(items);
    } else if(e.key==='ArrowUp'){
      e.preventDefault();
      _searchResultIdx = Math.max(_searchResultIdx-1, -1);
      _highlightItem(items);
    } else if(e.key==='Enter'){
      if(_searchResultIdx >= 0){
        e.preventDefault();
        const m = resultsDiv._matches || [];
        if(m[_searchResultIdx]){
          resultsDiv.style.display='none';
          searchBox.value = m[_searchResultIdx].NameEnglish;
          navigateTo(m[_searchResultIdx].RepCode);
        }
      } else {
        const m = resultsDiv._matches || [];
        if(m[0]){
          e.preventDefault();
          resultsDiv.style.display='none';
          searchBox.value = m[0].NameEnglish;
          navigateTo(m[0].RepCode);
        }
      }
    } else if(e.key==='Escape'){
      resultsDiv.style.display='none';
      searchBox.blur();
    }
  });

  function _highlightItem(items){
    items.forEach((el,i) => { el.style.background = i===_searchResultIdx ? '#30363d' : ''; });
    if(items[_searchResultIdx]) items[_searchResultIdx].scrollIntoView({block:'nearest'});
  }

  document.addEventListener('click', e => {
    if(!document.getElementById('searchWrap').contains(e.target))
      resultsDiv.style.display='none';
  });

  document.addEventListener('keydown', e => {
    if(e.key==='/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA'){
      e.preventDefault();
      searchBox.focus();
      searchBox.select();
    }
    if(e.key==='ArrowLeft'  && (e.altKey||e.metaKey)) historyBack();
    if(e.key==='ArrowRight' && (e.altKey||e.metaKey)) historyForward();
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SPIDERWEB GRAPH
// ══════════════════════════════════════════════════════════════════════════════
function buildSpiderweb(){
  const nodes = industriesData.map(ind => ({
    id:    ind.RepCode,
    label: wrapLabel(ind.NameEnglish||ind.RepCode),
    title: `<b>${esc(ind.RepCode)}</b><br>${esc(ind.NameEnglish)}`,
    color: { background:sc(ind.Sector)+'33', border:sc(ind.Sector), highlight:{ background:sc(ind.Sector)+'66', border:sc(ind.Sector) } },
    font:  { color:'#e6edf3', size:11 },
    shape: 'dot', size: 14
  }));
  const edges = linksData.filter(l=>!deletedEdges.has(l._id)).map(l => {
    const dir = l.Direction||'Peer';
    const col = dir==='Upstream'?'#d29922': dir==='Downstream'?'#3fb950':'#58a6ff';
    return {
      id:l._id, from:l.FromIndustryCode, to:l.ToIndustryCode,
      color:{ color:col+'88', highlight:col, hover:col },
      width: Math.max(1,(l.StrengthScore||1)*0.7),
      dashes: dir==='Peer',
      arrows: dir!=='Peer' ? { to:{ enabled:true, scaleFactor:0.5 } } : undefined,
      title: `${dir} · strength ${l.StrengthScore||'?'}`
    };
  });
  addedEdges.forEach(e=>edges.push(e));
  nodesDS = new vis.DataSet(nodes);
  edgesDS = new vis.DataSet(edges);
  const container = document.getElementById('network');
  networkInstance = new vis.Network(container, { nodes:nodesDS, edges:edgesDS }, {
    physics:{ enabled:false, stabilization:{ iterations:200 } },
    interaction:{ hover:true, tooltipDelay:300 },
    layout:{ randomSeed:42 }
  });
  document.getElementById('emptyState').style.display='none';

  _initSidebarResize();

  const searchBox  = document.getElementById('searchBox');
  const resultsDiv = document.getElementById('results');
  document.getElementById('resetBtn').onclick = () => {
    searchBox.value='';
    resultsDiv.style.display='none';
    document.getElementById('filterSector').value='all';
    activeSector='all'; activeAteco=null;
    _applyVisibility();
    clearHighlight();
    networkInstance.fit({ animation:{ duration:600, easingFunction:'easeInOutQuad' } });
  };

  const navBack = document.getElementById('navBack');
  const navFwd  = document.getElementById('navFwd');
  if(navBack) navBack.onclick = historyBack;
  if(navFwd)  navFwd.onclick  = historyForward;
  updateNavBtns();

  document.getElementById('filterDir').onchange = () => renderSidebar(currentCode);
  document.getElementById('filterStr').onchange = () => renderSidebar(currentCode);

  networkInstance.on('click', params => {
    if(drawMode && drawFrom && params.nodes.length > 0){
      const toCode = params.nodes[0];
      if(toCode !== drawFrom){
        const newEdge = {
          id:`added_${drawFrom}_${toCode}_${Date.now()}`,
          from:drawFrom, to:toCode,
          color:{ color:'#bc8cff88', highlight:'#bc8cff', hover:'#bc8cff' },
          width:1.5, dashes:false,
          arrows:{ to:{ enabled:true, scaleFactor:0.5 } },
          title:'User-added connection'
        };
        edgesDS.add(newEdge); addedEdges.push(newEdge);
      }
      drawFrom=null; toggleDrawMode(false); return;
    }
    if(params.nodes.length > 0){
      const code = params.nodes[0];
      document.getElementById('searchBox').value = indByCode.get(code)?.NameEnglish || code;
      navigateTo(code);
    } else if(params.edges.length > 0 && !drawMode){
      highlightEdge(params.edges[0]);
    } else {
      clearHighlight();
      _clearEgoHighlight();
    }
  });
  networkInstance.on('oncontext', params => { params.event.preventDefault(); showContextMenu(params); });
  networkInstance.on('click', () => hideContextMenu());
  setupIotCanvasEvents();
}

// ══════════════════════════════════════════════════════════════════════════════
// #1  EGO-NETWORK HIGHLIGHT
// ══════════════════════════════════════════════════════════════════════════════
function _applyEgoHighlight(code){
  if(!nodesDS || !edgesDS) return;
  const neighbours = new Set([code]);
  (linksByCode.get(code)||[]).forEach(l => {
    if(!deletedEdges.has(l._id)){
      neighbours.add(l.FromIndustryCode);
      neighbours.add(l.ToIndustryCode);
    }
  });
  const nodeUpdates = industriesData.map(ind => ({
    id: ind.RepCode,
    opacity: neighbours.has(ind.RepCode) ? 1 : 0.12
  }));
  nodesDS.update(nodeUpdates);
  const edgeUpdates = (edgesDS.get() || []).map(e => ({
    id: e.id,
    color: (neighbours.has(e.from) && neighbours.has(e.to))
      ? undefined
      : { color:'rgba(100,100,100,0.06)', highlight:'rgba(100,100,100,0.06)', hover:'rgba(100,100,100,0.06)' }
  }));
  edgesDS.update(edgeUpdates);
}

function _clearEgoHighlight(){
  if(!nodesDS || !edgesDS) return;
  const nodeUpdates = industriesData.map(ind => ({ id:ind.RepCode, opacity:1 }));
  nodesDS.update(nodeUpdates);
  const edgeUpdates = linksData.filter(l=>!deletedEdges.has(l._id)).map(l => {
    const dir = l.Direction||'Peer';
    const col = dir==='Upstream'?'#d29922':dir==='Downstream'?'#3fb950':'#58a6ff';
    return { id:l._id, color:{ color:col+'88', highlight:col, hover:col } };
  });
  edgesDS.update(edgeUpdates);
}

// ══════════════════════════════════════════════════════════════════════════════
// NAVIGATE + HISTORY
// ══════════════════════════════════════════════════════════════════════════════
function navigateTo(code, fromHistory){
  currentCode = code;
  document.getElementById('currentIndustry').textContent = code;
  if(!fromHistory) historyPush(code);
  pushHash(code);
  if(networkInstance && nodesDS && nodesDS.get(code)){
    networkInstance.focus(code, { scale:1.4, animation:{ duration:700, easingFunction:'easeInOutQuad' } });
    networkInstance.selectNodes([code]);
    pulseNode(code);
    _applyEgoHighlight(code);
  }
  renderSidebar(code);
}

function pulseNode(code){
  const orig = nodesDS.get(code);
  if(!orig) return;
  let t=0;
  const iv = setInterval(()=>{ t++; nodesDS.update({ id:code, size:14+Math.sin(t*0.5)*8 }); if(t>18){ clearInterval(iv); nodesDS.update({ id:code, size:14 }); } },60);
}

function highlightEdge(edgeId){
  const e = edgesDS.get(edgeId);
  if(!e) return;
  const fI = indByCode.get(e.from), tI = indByCode.get(e.to);
  document.getElementById('infoBox').innerHTML =
    `<div class="d-section">Edge</div>`+
    `<div class="d-row"><span class="d-label">From</span><span class="d-val">${esc(fI?.NameEnglish||e.from)}</span></div>`+
    `<div class="d-row"><span class="d-label">To</span><span class="d-val">${esc(tI?.NameEnglish||e.to)}</span></div>`+
    `<div class="d-row"><span class="d-label">Type</span><span class="d-val">${esc(e.title||'')}</span></div>`;
}

function clearHighlight(){
  currentCode=null;
  document.getElementById('currentIndustry').textContent='';
  document.getElementById('infoBox').innerHTML='<div id="emptyMsg">Search or click a node to explore.</div>';
  if(networkInstance){ networkInstance.unselectAll(); }
  _clearEgoHighlight();
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
    if(dirFilter!=='all' && l.Direction!==dirFilter) return false;
    if((l.StrengthScore||1) < strFilter) return false;
    return true;
  });
  const upstream   = links.filter(l=>l.Direction==='Upstream');
  const peer       = links.filter(l=>l.Direction==='Peer');
  const downstream = links.filter(l=>l.Direction==='Downstream');

  const c  = sc(ind.Sector);

  // ✏ FIX-A: Read CommercialPriority first, fall back to Priority field.
  // Strips non-alpha chars so timestamps/dates never accidentally match.
  const _pvRaw = val(ind.CommercialPriority, val(ind.Priority,''));
  const pv = _pvRaw.toLowerCase().replace(/[^a-z]/g,'');
  const priBadge = pv==='high'
    ? `<span class="priority-badge priority-high">High</span>`
    : pv==='medium'||pv==='med'
    ? `<span class="priority-badge priority-med">Medium</span>`
    : pv==='low'
    ? `<span class="priority-badge priority-low">Low</span>` : '';

  const vcs = val(ind.ValueChainStage);
  const vcsBadge = vcs ? `<span class="status-badge">${esc(vcs)}</span>` : '';

  const allAteco = [val(ind.ATECOPrimary), ...val(ind.ATECOAll).split(/[,;]/).map(s=>s.trim())]
    .filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
  const atecoHtml = allAteco.map(a=>
    `<span class="ateco-chip" style="cursor:pointer" onclick="applyAtecoFilter('${esc(a)}')" title="Filter to ATECO ${esc(a)}">${esc(a)}</span>`
  ).join('') || '<span class="empty-val">—</span>';

  const kwEN = val(ind.KeywordsIncludeEN).split(/[,;]/).map(s=>s.trim()).filter(Boolean);
  const kwIT = val(ind.KeywordsIncludeIT).split(/[,;]/).map(s=>s.trim()).filter(Boolean);
  const kwHtml = [...kwEN,...kwIT].map(k=>`<span class="kw-tag">${esc(k)}</span>`).join('') || '<span class="empty-val">—</span>';

  // ✏ FIX-B: Prefer MarketingDefinitionEN; only fall back to ReportDefinitionEN
  // if it contains a real description (not a status word like "Completed").
  const _STATUS_WORD = /^(completed|pending|in progress|done|none|n\/a|yes|no)$/i;
  const _reportDef = val(ind.ReportDefinitionEN);
  const _marketDef = val(ind.MarketingDefinitionEN);
  const defEN = (!_reportDef || _STATUS_WORD.test(_reportDef.trim())) ? _marketDef : _reportDef;

  const defHtml = defEN
    ? `<div class="collapsible-wrap"><div class="ctext collapsed" id="ctext_${code}">${esc(defEN)}</div>`+
      `<span class="toggle-btn" onclick="toggleCollapse('ctext_${code}',this)">▼ Show more</span></div>`
    : '<span class="empty-val">—</span>';

  const orbis = val(ind.OrbisBoolean);
  const orbisHtml = orbis
    ? `<div style="position:relative">`+
      `<div class="orbis-box" id="orbis_${code}">${esc(orbis)}</div>`+
      `<button onclick="_copyOrbis('${code}')" title="Copy to clipboard" style="position:absolute;top:4px;right:4px;padding:2px 7px;font-size:10px;border:1px solid #30363d;border-radius:4px;background:#21262d;color:#8b949e;cursor:pointer" id="cpBtn_${code}">📋</button>`+
      `</div>`
    : '<span class="empty-val">—</span>';

  const ta = val(ind.TradeAssociations);
  const taHtml = ta ? esc(ta) : '<span class="empty-val">—</span>';

  const isStarred = _starred.has(code);
  const starBtn = `<button onclick="toggleStar('${code}')" title="${isStarred?'Unstar':'Star'} this industry" style="background:none;border:none;cursor:pointer;font-size:16px;padding:0 4px;">${isStarred?'⭐':'☆'}</button>`;
  const focusBtn = `<button onclick="_focusCurrent()" title="Re-centre graph on this node" style="background:#21262d;border:1px solid #30363d;border-radius:4px;padding:2px 8px;font-size:11px;color:#58a6ff;cursor:pointer">🎯 Focus</button>`;
  const exportBtn = `<button onclick="_exportConnections('${code}')" title="Export connections to CSV" style="background:#21262d;border:1px solid #30363d;border-radius:4px;padding:2px 8px;font-size:11px;color:#3fb950;cursor:pointer">⬇ Export CSV</button>`;

  const existingNote = _notes[code] || '';
  const noteHtml =
    `<div class="d-section">My Notes</div>`+
    `<div class="d-row"><span class="d-val" style="flex:1">`+
    `<textarea id="note_${code}" rows="3" style="width:100%;background:#21262d;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;font-size:12px;padding:6px;resize:vertical" placeholder="Add private notes…" onblur="_saveNote('${code}')">${esc(existingNote)}</textarea>`+
    `</span></div>`;

  function connItem(l){
    const otherCode = l.ToIndustryCode===code ? l.FromIndustryCode : l.ToIndustryCode;
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
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
      <span class="d-repcode">${esc(ind.RepCode)}</span>
      ${starBtn} ${focusBtn} ${exportBtn}
    </div>
    <div class="d-title">${esc(val(ind.NameEnglish,ind.RepCode))}</div>
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
    ${noteHtml}
    <div class="d-section">Connections (${links.length})</div>
    <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <div class="conn-group" style="flex:1">
        <div class="conn-group-label conn-upstream">▲ Upstream <span class="conn-count">(${upstream.length})</span></div>${upHtml}
      </div>
    </div>
    <div class="conn-group">
      <div class="conn-group-label conn-peer">↔ Peer <span class="conn-count">(${peer.length})</span></div>${peerHtml}
    </div>
    <div class="conn-group">
      <div class="conn-group-label conn-downstream">▼ Downstream <span class="conn-count">(${downstream.length})</span></div>${downHtml}
    </div>
  `;
}

// ── #3 Copy Orbis Boolean ────────────────────────────────────────────────────
function _copyOrbis(code){
  const ind = indByCode.get(code);
  if(!ind) return;
  navigator.clipboard.writeText(val(ind.OrbisBoolean)).then(() => {
    const btn = document.getElementById(`cpBtn_${code}`);
    if(btn){ btn.textContent='✔'; setTimeout(()=>{ btn.textContent='📋'; },1500); }
  });
}

// ── #13 Focus current node ───────────────────────────────────────────────────
function _focusCurrent(){
  if(!currentCode || !networkInstance) return;
  networkInstance.focus(currentCode, { scale:2, animation:{ duration:500, easingFunction:'easeInOutQuad' } });
}

// ── #8 Export connections CSV ────────────────────────────────────────────────
function _exportConnections(code){
  const ind = indByCode.get(code);
  if(!ind) return;
  const rows = [['RepCode','Name','Direction','StrengthScore','Sector']];
  (linksByCode.get(code)||[]).filter(l=>!deletedEdges.has(l._id)).forEach(l => {
    const otherCode = l.ToIndustryCode===code ? l.FromIndustryCode : l.ToIndustryCode;
    const o = indByCode.get(otherCode);
    rows.push([otherCode, o?.NameEnglish||'', l.Direction||'', l.StrengthScore||'', o?.Sector||'']);
  });
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `connections_${code}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── #12 Save inline note ─────────────────────────────────────────────────────
function _saveNote(code){
  const el = document.getElementById(`note_${code}`);
  if(!el) return;
  const txt = el.value.trim();
  if(txt) _notes[code] = txt;
  else delete _notes[code];
  localStorage.setItem('ige_notes', JSON.stringify(_notes));
}

function toggleCollapse(id,btn){
  const el = document.getElementById(id);
  if(!el) return;
  const collapsed = el.classList.contains('collapsed');
  el.classList.toggle('collapsed',!collapsed);
  el.classList.toggle('expanded',collapsed);
  btn.textContent = collapsed ? '▲ Show less' : '▼ Show more';
}

// ── #11 Sidebar resize handle ─────────────────────────────────────────────────
function _initSidebarResize(){
  const sidebar = document.getElementById('sidebar');
  if(!sidebar || document.getElementById('sidebarResizer')) return;
  const handle = document.createElement('div');
  handle.id = 'sidebarResizer';
  Object.assign(handle.style, {
    width:'5px', cursor:'col-resize', background:'transparent',
    flexShrink:'0', transition:'background .15s'
  });
  handle.addEventListener('mouseenter',()=>handle.style.background='#58a6ff66');
  handle.addEventListener('mouseleave',()=>handle.style.background='transparent');
  sidebar.after(handle);
  let startX, startW;
  handle.addEventListener('mousedown', e => {
    startX = e.clientX; startW = sidebar.offsetWidth;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', () => document.removeEventListener('mousemove', onDrag), { once:true });
  });
  function onDrag(e){
    const newW = Math.max(200, Math.min(600, startW + (e.clientX - startX)));
    sidebar.style.width = newW + 'px';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DRAW MODE / PHYSICS
// ══════════════════════════════════════════════════════════════════════════════
let _physicsOn = false;
function togglePhysics(){
  _physicsOn=!_physicsOn;
  networkInstance&&networkInstance.setOptions({ physics:{ enabled:_physicsOn } });
  document.getElementById('physicsBtn').textContent=_physicsOn?'⏸ Physics ON':'▶ Physics OFF';
}
function toggleDrawMode(forceOff){
  drawMode = forceOff===false ? false : !drawMode;
  drawFrom=null;
  const btn=document.getElementById('drawBtn');
  btn.textContent=drawMode?'✔ Drawing…':'✏ Add Connection';
  btn.style.borderColor=drawMode?'#3fb950':'';
  btn.style.color=drawMode?'#3fb950':'';
  if(drawMode){
    networkInstance&&networkInstance.on('selectNode',params=>{ if(!drawMode)return; if(!drawFrom)drawFrom=params.nodes[0]; });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTEXT MENU
// ══════════════════════════════════════════════════════════════════════════════
function showContextMenu(params){
  const menu=document.getElementById('ctxMenu');
  const x=params.event.clientX, y=params.event.clientY;
  let html='';
  if(params.nodes.length>0){
    const code=params.nodes[0], ind=indByCode.get(code);
    html=`<div class="ctx-title">${esc(ind?.NameEnglish||code)}</div>`+
         `<div class="ctx-item" onclick="navigateTo('${code}');hideContextMenu()">📋 View details</div>`+
         `<div class="ctx-item" onclick="toggleStar('${code}');hideContextMenu()">${_starred.has(code)?'★ Unstar':'☆ Star'} industry</div>`+
         `<div class="ctx-item" onclick="_exportConnections('${code}');hideContextMenu()">⬇ Export connections</div>`+
         `<div class="ctx-item ctx-danger" onclick="removeNode('${code}');hideContextMenu()">✕ Remove node</div>`;
  } else if(params.edges.length>0){
    const eid=params.edges[0];
    html=`<div class="ctx-title">Edge</div>`+
         `<div class="ctx-item ctx-danger" onclick="removeEdge('${eid}');hideContextMenu()">✕ Remove connection</div>`;
  } else return;
  menu.innerHTML=html;
  menu.style.display='block';
  menu.style.left=x+'px'; menu.style.top=y+'px';
}
function hideContextMenu(){ document.getElementById('ctxMenu').style.display='none'; }
function removeNode(code){
  const links=linksByCode.get(code)||[];
  links.forEach(l=>{ deletedEdges.add(l._id); edgesDS&&edgesDS.remove(l._id); });
  nodesDS&&nodesDS.remove(code);
}
function removeEdge(eid){ deletedEdges.add(eid); edgesDS&&edgesDS.remove(eid); }

// ══════════════════════════════════════════════════════════════════════════════
// TOGGLE VIEWS
// ══════════════════════════════════════════════════════════════════════════════
function toggleIotView(){
  iotMode=!iotMode;
  const btn=document.getElementById('iotBtn');
  document.getElementById('network').style.display   = iotMode?'none':'block';
  document.getElementById('sidebar').style.display   = iotMode?'none':'flex';
  document.getElementById('legend').style.display    = iotMode?'none':'block';
  document.getElementById('filterbar').style.display = iotMode?'none':'flex';
  if(iotMode){
    document.getElementById('iotView').classList.add('active');
    document.getElementById('iotSidebar').classList.add('active');
    document.getElementById('iotLegend').style.display='block';
    btn.textContent='🕸 Graph View'; btn.style.borderColor='#58a6ff'; btn.style.color='#58a6ff';
    loadIotData(); setTimeout(resizeIotCanvas,50);
  } else {
    document.getElementById('iotView').classList.remove('active');
    document.getElementById('iotSidebar').classList.remove('active');
    document.getElementById('iotLegend').style.display='none';
    btn.textContent='🌐 IOT Spiderweb'; btn.style.borderColor='#f0883e'; btn.style.color='#f0883e';
    if(iotAnimFrame){ cancelAnimationFrame(iotAnimFrame); iotAnimFrame=null; }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// IOT SPIDERWEB CANVAS
// ══════════════════════════════════════════════════════════════════════════════
function resizeIotCanvas(){
  const canvas=document.getElementById('iotCanvas');
  const wrap  =document.getElementById('iotView');
  canvas.width =wrap.clientWidth-(document.getElementById('iotSidebar').clientWidth||280);
  canvas.height=wrap.clientHeight;
  if(iotLoaded) drawIotSpiderweb();
}
window.addEventListener('resize',()=>{ if(iotMode) resizeIotCanvas(); });

function getSectors(){ return Object.keys(IOT_SECTOR_COLORS); }

function drawIotSpiderweb(){
  const canvas=document.getElementById('iotCanvas');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;
  if(!W||!H) return;
  ctx.clearRect(0,0,W,H);
  const sectors=getSectors(), n=sectors.length;
  const cx=W/2, cy=H/2, R=Math.min(W,H)*0.36;
  const pos={};
  sectors.forEach((s,i)=>{ const a=(2*Math.PI*i/n)-Math.PI/2; pos[s]={ x:cx+R*Math.cos(a), y:cy+R*Math.sin(a), angle:a }; });
  const maxFlow=Math.max(...iotSectorLinks.map(l=>l.value_bn||0))||1;
  iotSectorLinks.forEach(link=>{
    const from=pos[link.source], to=pos[link.target];
    if(!from||!to) return;
    const isActive=(iotSelected===link.source||iotSelected===link.target||iotHovered===link.source||iotHovered===link.target);
    const t=(link.value_bn||0)/maxFlow;
    const alpha=isActive?0.8:(iotSelected?0.06:0.18+t*0.45);
    const lineW=isActive?1.5+t*14:0.5+t*10;
    const hex=iotColor(link.source), r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(from.x,from.y);
    ctx.quadraticCurveTo(cx+(from.x+to.x-2*cx)*0.18,cy+(from.y+to.y-2*cy)*0.18,to.x,to.y);
    ctx.strokeStyle=`rgba(${r},${g},${b},${alpha})`; ctx.lineWidth=lineW; ctx.lineCap='round'; ctx.stroke();
    if(isActive||t>0.3){
      const dx=to.x-from.x, dy=to.y-from.y, len=Math.sqrt(dx*dx+dy*dy)||1;
      const ux=dx/len, uy=dy/len, mx=(from.x+to.x)/2, my=(from.y+to.y)/2, aSize=isActive?8:5;
      ctx.beginPath();
      ctx.moveTo(mx+ux*aSize,my+uy*aSize);
      ctx.lineTo(mx-ux*aSize-uy*aSize*0.6,my-uy*aSize+ux*aSize*0.6);
      ctx.lineTo(mx-ux*aSize+uy*aSize*0.6,my-uy*aSize-ux*aSize*0.6);
      ctx.closePath(); ctx.fillStyle=`rgba(${r},${g},${b},${alpha+0.1})`; ctx.fill();
    }
    ctx.restore();
  });
  sectors.forEach(s=>{
    const p=pos[s], isSel=iotSelected===s, isHov=iotHovered===s, isDim=iotSelected&&!isSel;
    const color=iotColor(s), radius=isSel?28:isHov?24:18;
    ctx.save(); ctx.globalAlpha=isDim?0.3:1.0;
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
    ctx.textAlign=lx<cx-10?'right':lx>cx+10?'left':'center'; ctx.textBaseline='middle';
    words.forEach((word,wi)=>{ ctx.fillText(word,lx,ly+(wi-(words.length-1)/2)*15); });
    ctx.restore();
  });
  ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
  if(iotSelected){
    const outF=iotSectorLinks.filter(l=>l.source===iotSelected).reduce((s,l)=>s+(l.value_bn||0),0);
    const inF =iotSectorLinks.filter(l=>l.target===iotSelected).reduce((s,l)=>s+(l.value_bn||0),0);
    ctx.font='bold 15px Segoe UI'; ctx.fillStyle=iotColor(iotSelected); ctx.fillText(iotSelected,cx,cy-28);
    ctx.font='12px Segoe UI'; ctx.fillStyle='#8b949e';
    ctx.fillText(`▶ Out: ${fmtBn(outF)}`,cx,cy-8); ctx.fillText(`◀ In: ${fmtBn(inF)}`,cx,cy+10);
    ctx.fillStyle='#484f58'; ctx.font='11px Segoe UI'; ctx.fillText('Click to deselect',cx,cy+30);
  } else {
    ctx.font='bold 14px Segoe UI'; ctx.fillStyle='#f0883e'; ctx.fillText('EA20 · 2023',cx,cy-12);
    ctx.font='12px Segoe UI'; ctx.fillStyle='#484f58'; ctx.fillText('IOT Sector Flows',cx,cy+10);
  }
  ctx.restore();
}

function getIotSectorAtXY(mx,my){
  const canvas=document.getElementById('iotCanvas');
  const W=canvas.width,H=canvas.height,sectors=getSectors(),n=sectors.length;
  const cx=W/2,cy=H/2,R=Math.min(W,H)*0.36;
  for(let i=0;i<n;i++){
    const a=(2*Math.PI*i/n)-Math.PI/2, sx=cx+R*Math.cos(a), sy=cy+R*Math.sin(a);
    if(Math.sqrt((mx-sx)**2+(my-sy)**2)<28) return sectors[i];
  }
  return null;
}
function selectIotSector(s){ iotSelected=(s===iotSelected)?null:s; highlightGvaList(iotSelected); drawIotSpiderweb(); }

function setupIotCanvasEvents(){
  const canvas=document.getElementById('iotCanvas'), tooltip=document.getElementById('iotTooltip');
  if(!canvas) return;
  canvas.addEventListener('mousemove',e=>{
    if(!iotLoaded) return;
    const rect=canvas.getBoundingClientRect();
    const hit=getIotSectorAtXY(e.clientX-rect.left,e.clientY-rect.top);
    iotHovered=hit;
    if(hit){
      const topOut=iotSectorLinks.filter(l=>l.source===hit).sort((a,b)=>(b.value_bn||0)-(a.value_bn||0)).slice(0,3);
      const topIn =iotSectorLinks.filter(l=>l.target===hit).sort((a,b)=>(b.value_bn||0)-(a.value_bn||0)).slice(0,3);
      const totalOut=topOut.reduce((s,l)=>s+(l.value_bn||0),0);
      const totalIn =topIn.reduce((s,l)=>s+(l.value_bn||0),0);
      let txt=`${hit}\nTotal output: ${fmtBn(totalOut)}\nTotal input: ${fmtBn(totalIn)}`;
      if(topOut.length) txt+=`\n▶ Sells to: `+topOut.map(l=>`${l.target} (${fmtBn(l.value_bn)})`).join(', ');
      if(topIn.length)  txt+=`\n◀ Buys from: `+topIn.map(l=>`${l.source} (${fmtBn(l.value_bn)})`).join(', ');
      tooltip.innerText=txt; tooltip.style.display='block';
      tooltip.style.left=Math.min(e.clientX-rect.left+16,canvas.width-280)+'px';
      tooltip.style.top =Math.max(e.clientY-rect.top-10,8)+'px';
    } else { tooltip.style.display='none'; }
    drawIotSpiderweb();
  });
  canvas.addEventListener('mouseleave',()=>{ iotHovered=null; tooltip.style.display='none'; drawIotSpiderweb(); });
  canvas.addEventListener('click',e=>{
    if(!iotLoaded) return;
    const rect=canvas.getBoundingClientRect();
    selectIotSector(getIotSectorAtXY(e.clientX-rect.left,e.clientY-rect.top));
  });
}

function buildGvaList(){
  const list=document.getElementById('gvaList'), maxGva=iotGva[0]?.gva_bn||1;
  list.innerHTML=iotGva.map((item,i)=>{
    const c=iotColor(item.sector), pct=(item.gva_bn/maxGva*100).toFixed(1);
    return `<div class="gva-item" id="gva_${i}" onclick="selectIotSector('${item.sector}')">`+
      `<div class="gva-dot" style="background:${c}"></div>`+
      `<span class="gva-name">${esc(item.sector)}</span>`+
      `<div class="gva-bar-wrap"><div class="gva-bar" style="width:${pct}%;background:${c}"></div></div>`+
      `<span class="gva-val">${fmtBn(item.gva_bn)}</span></div>`;
  }).join('');
}
function highlightGvaList(sel){
  document.querySelectorAll('.gva-item').forEach(el=>{
    el.style.opacity=sel?(el.onclick?.toString().includes(sel)?'1':'0.35'):'1';
  });
}
function buildIotLegend(){
  const leg=document.getElementById('iotLegend');
  const rows=Object.entries(IOT_SECTOR_COLORS).map(([s,c])=>
    `<div class="iot-leg-row"><div class="iot-leg-dot" style="background:${c}"></div><span>${esc(s)}</span></div>`
  ).join('');
  leg.innerHTML=`<h3>Macro Sector</h3>${rows}`;
}

function wrapLabel(name,max=18){
  const words=String(name).split(' '); const lines=[]; let line='';
  words.forEach(w=>{ if((line+' '+w).trim().length>max&&line){ lines.push(line); line=w; } else line=(line+' '+w).trim(); });
  if(line) lines.push(line);
  return lines.slice(0,3).join('\n');
}

// ── BOOTSTRAP ─────────────────────────────────────────────────────────────────
applyTheme(true);
initSearch();   // #14 – wire up search immediately, before data loads
loadData();
renderStarredFilter();
