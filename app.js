// ══════════════════════════════════════════════════════════════════════════════
// app.js  –  Industry Graph Explorer  (Spiderweb Edition)
// Features:
//   • Persistent full spiderweb graph – all industries visible at once
//   • Satnav navigation – search animates/flies to node, pulses it, no redraw
//   • Right-click context menu – sever (delete) an edge or node connection
//   • Toolbar button – draw mode to create new connections by dragging
//   • Sidebar shows full industry detail + upstream/peer/downstream lists
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── state ─────────────────────────────────────────────────────────────────────
let industriesData  = [];
let linksData       = [];
let nodesDS         = null;   // vis.DataSet
let edgesDS         = null;   // vis.DataSet
let networkInstance = null;
let currentCode     = null;
let drawMode        = false;  // connection-draw mode
let drawFrom        = null;   // source node while drawing
let deletedEdges    = new Set();   // edge ids severed this session
let addedEdges      = [];          // edges added this session

// ── sector palette ────────────────────────────────────────────────────────────
const SECTOR_COLORS = {
  MAN:'#e06c75', WHL:'#e5c07b', RET:'#98c379', HEA:'#56b6c2',
  ICT:'#61afef', AGR:'#a8d8a8', FIN:'#c678dd', ENE:'#d19a66',
  CON:'#be5046', EDU:'#4db6ac', SER:'#9e9e9e', default:'#7f8c8d'
};
const SECTOR_LABELS = {
  MAN:'Manufacturing', WHL:'Wholesale',    RET:'Retail',
  HEA:'Healthcare',    ICT:'ICT / Tech',   AGR:'Agriculture & Food',
  FIN:'Finance',       ENE:'Energy',       CON:'Construction',
  EDU:'Education',     SER:'Services'
};
const sc  = c => SECTOR_COLORS[c] || SECTOR_COLORS.default;
const sl  = c => SECTOR_LABELS[c] || c || 'Other';

// ── tiny helpers ──────────────────────────────────────────────────────────────
const esc   = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const empty = v => { if(!v) return true; const s=String(v).trim(); return !s||s==='undefined'||s==='null'||s==='None'; };
const val   = (v,f='') => empty(v) ? f : String(v).trim();

// ── DATA LOADING ──────────────────────────────────────────────────────────────
async function loadData(){
  const statsEl = document.getElementById('statsLabel');
  try {
    statsEl.textContent = 'Loading data…';
    const manifest      = await axios.get('data/manifest.json').then(r=>r.data);
    const iFiles        = manifest.industryFiles.map(f=>'data/'+f);
    const lFiles        = manifest.linkFiles.map(f=>'data/'+f);
    const [iRes,lRes]   = await Promise.all([
      Promise.all(iFiles.map(f=>axios.get(f).then(r=>r.data))),
      Promise.all(lFiles.map(f=>axios.get(f).then(r=>r.data)))
    ]);
    industriesData = iRes.flat();
    linksData      = lRes.flat();
    statsEl.textContent = `${industriesData.length.toLocaleString()} industries · ${linksData.length.toLocaleString()} links`;
    buildSpiderweb();
  } catch(e){
    console.error(e);
    statsEl.textContent = 'Error loading data';
  }
}

// ── BUILD FULL SPIDERWEB (called once) ───────────────────────────────────────
function buildSpiderweb(){
  document.getElementById('emptyState').style.display = 'none';

  // ── nodes ──
  const nodes = industriesData.map(ind => ({
    id:          ind.RepCode,
    label:       wrapLabel(ind.NameEnglish, 18),
    group:       ind.Sector,
    color: {
      background: sc(ind.Sector)+'cc',
      border:     sc(ind.Sector),
      highlight:  { background:'#ffffff', border: sc(ind.Sector) },
      hover:      { background:'#fffde7', border: sc(ind.Sector) }
    },
    font:  { size:10, color:'#1a1a2e', face:'Segoe UI', vadjust:-2 },
    size:  14,
    shape: 'dot',
    borderWidth: 1,
    shadow: false,
    title: `<b>${esc(ind.NameEnglish)}</b><br/>#${esc(ind.RepCode)} · ${sl(ind.Sector)}`,
    // stash full object for quick lookup
    _ind: ind
  }));

  // ── edges ──
  const edges = linksData.map((l,i) => {
    const dir   = l.Direction || 'Peer';
    const color = dir==='Upstream' ? '#e6a817' : dir==='Downstream' ? '#28a745' : '#17a2b8';
    return {
      id:     `e${i}`,
      from:   l.FromIndustryCode,
      to:     l.ToIndustryCode,
      color:  { color: color+'66', highlight: color, hover: color },
      width:  1,
      arrows: dir==='Peer' ? '' : 'to',
      dashes: dir==='Peer',
      title:  dir,
      _dir:   dir,
      _str:   l.StrengthScore || 1
    };
  });

  nodesDS = new vis.DataSet(nodes);
  edgesDS = new vis.DataSet(edges);

  const container = document.getElementById('network');
  const options = {
    nodes:  { borderWidth:1, shadow:false },
    edges:  { smooth:{ type:'continuous', roundness:0.2 }, selectionWidth:3 },
    interaction: {
      hover:            true,
      tooltipDelay:     120,
      navigationButtons:true,
      keyboard:         { enabled:true, speed:{ x:8,y:8,zoom:0.02 } },
      multiselect:      true,
      selectConnectedEdges: true
    },
    physics: {
      enabled:     true,
      solver:      'forceAtlas2Based',
      stabilization:{ iterations:300, updateInterval:30 },
      forceAtlas2Based:{
        gravitationalConstant: -50,
        centralGravity:        0.005,
        springLength:          120,
        springConstant:        0.08,
        damping:               0.6
      }
    },
    layout:{ randomSeed:42 }
  };

  if(networkInstance){ networkInstance.destroy(); }
  networkInstance = new vis.Network(container, { nodes:nodesDS, edges:edgesDS }, options);

  // Stop physics after stabilisation to freeze the web
  networkInstance.once('stabilizationIterationsDone', () => {
    networkInstance.setOptions({ physics:{ enabled:false } });
    document.getElementById('physicsBtn').textContent = '▶ Physics OFF';
  });

  // ── node click → select + satnav ──
  networkInstance.on('click', params => {
    if(drawMode){
      handleDrawClick(params);
      return;
    }
    if(params.nodes.length > 0){
      const code = params.nodes[0];
      navigateTo(code);
      const ind = industriesData.find(i=>i.RepCode===code);
      if(ind) searchBox.value = ind.NameEnglish;
    } else if(params.edges.length > 0 && !drawMode){
      highlightEdge(params.edges[0]);
    } else {
      clearHighlight();
    }
  });

  // ── right-click context menu ──
  networkInstance.on('oncontext', params => {
    params.event.preventDefault();
    showContextMenu(params);
  });

  // hide context menu on any network click
  networkInstance.on('click', () => hideContextMenu());
}

// ── SATNAV NAVIGATE ──────────────────────────────────────────────────────────
// Smoothly flies to the node, pulses it, updates sidebar — never rebuilds graph
function navigateTo(repCode){
  const ind = industriesData.find(i=>i.RepCode===repCode);
  if(!ind || !networkInstance) return;

  currentCode = repCode;
  document.getElementById('currentIndustry').textContent = ind.NameEnglish;

  // ── 1. dim everything, then highlight ego + neighbours ──
  const links     = getLinksFor(repCode);
  const neighSet  = new Set(links.map(l=>l._other));
  neighSet.add(repCode);

  // dim all nodes
  nodesDS.forEach(n => {
    const isEgo   = n.id === repCode;
    const isNeigh = neighSet.has(n.id);
    nodesDS.update({
      id:   n.id,
      color:{
        background: isEgo   ? '#ffffff'
                  : isNeigh ? sc(n.group)+'ee'
                  :           sc(n.group)+'22',
        border:     isEgo   ? sc(ind.Sector)
                  : isNeigh ? sc(n.group)
                  :           sc(n.group)+'33',
        highlight:  n.color.highlight,
        hover:      n.color.hover
      },
      borderWidth: isEgo ? 4 : isNeigh ? 2 : 1,
      size: isEgo ? 26 : isNeigh ? 16 : 12,
      shadow: isEgo
    });
  });

  // dim edges
  edgesDS.forEach(e => {
    const connected = e.from===repCode || e.to===repCode;
    edgesDS.update({
      id:    e.id,
      color: connected
        ? { color: edgeColor(e._dir), highlight: edgeColor(e._dir), hover: edgeColor(e._dir) }
        : { color:'#e0e0e033', highlight:'#999', hover:'#999' },
      width: connected ? 2 : 0.5
    });
  });

  // ── 2. animate fly-to (satnav effect) ──
  networkInstance.focus(repCode, {
    scale:     1.6,
    animation: { duration:800, easingFunction:'easeInOutQuad' }
  });

  // ── 3. pulse the ego node (flash border) ──
  pulseNode(repCode, ind.Sector);

  // ── 4. update sidebar ──
  renderSidebar(ind, links);
}

// brief pulsing animation on the selected node
function pulseNode(repCode, sector){
  let tick = 0;
  const id = setInterval(()=>{
    tick++;
    const bright = tick%2===0;
    nodesDS.update({
      id:          repCode,
      borderWidth: bright ? 6 : 4,
      color: {
        background: bright ? sc(sector) : '#ffffff',
        border:     sc(sector),
        highlight:  { background:'#fff', border:sc(sector) },
        hover:      { background:'#fffde7', border:sc(sector) }
      }
    });
    if(tick >= 6){
      clearInterval(id);
      // settle to final state
      nodesDS.update({ id:repCode, background:'#ffffff', borderWidth:4 });
    }
  }, 180);
}

function edgeColor(dir){
  return dir==='Upstream' ? '#e6a817' : dir==='Downstream' ? '#28a745' : '#17a2b8';
}

// ── CLEAR HIGHLIGHT (back to neutral web) ────────────────────────────────────
function clearHighlight(){
  if(!nodesDS) return;
  nodesDS.forEach(n=>{
    const ind = industriesData.find(i=>i.RepCode===n.id);
    if(!ind) return;
    nodesDS.update({
      id:    n.id,
      color: { background:sc(ind.Sector)+'cc', border:sc(ind.Sector),
               highlight:{background:'#fff',border:sc(ind.Sector)},
               hover:{background:'#fffde7',border:sc(ind.Sector)} },
      borderWidth:1, size:14, shadow:false
    });
  });
  edgesDS.forEach(e=>{
    const dir = e._dir || 'Peer';
    edgesDS.update({ id:e.id,
      color:{ color:edgeColor(dir)+'66', highlight:edgeColor(dir), hover:edgeColor(dir) },
      width:1 });
  });
  currentCode = null;
  document.getElementById('currentIndustry').textContent = '';
  document.getElementById('infoBox').innerHTML = '<div id="emptyMsg">Click or search for an industry to explore it.</div>';
}

// ── HIGHLIGHT SINGLE EDGE ─────────────────────────────────────────────────────
function highlightEdge(edgeId){
  const e   = edgesDS.get(edgeId);
  if(!e) return;
  const from = industriesData.find(i=>i.RepCode===e.from);
  const to   = industriesData.find(i=>i.RepCode===e.to);
  let html   = `<div class="d-section">🔗 Edge Details</div>`;
  html += `<div class="d-row"><span class="d-label">Type</span><span class="d-val">${esc(e._dir||e.title||'Peer')}</span></div>`;
  html += `<div class="d-row"><span class="d-label">From</span><span class="d-val">${from?esc(from.NameEnglish):esc(e.from)}</span></div>`;
  html += `<div class="d-row"><span class="d-label">To</span><span class="d-val">${to?esc(to.NameEnglish):esc(e.to)}</span></div>`;
  html += `<div class="d-row"><span class="d-label">Strength</span><span class="d-val">${e._str||1}</span></div>`;
  html += `<div style="margin-top:12px;"><button class="ctx-btn ctx-danger" onclick="severEdge('${edgeId}')">✂ Sever this connection</button></div>`;
  document.getElementById('infoBox').innerHTML = html;
}

// ── GET LINKS FOR A NODE ──────────────────────────────────────────────────────
function getLinksFor(repCode){
  const dirF = document.getElementById('filterDir').value;
  const strF = parseInt(document.getElementById('filterStr').value)||1;
  const res  = [];
  linksData.forEach(l=>{
    if((l.StrengthScore||1) < strF) return;
    if(deletedEdges.has(l._eid)) return;
    let dir=null, other=null;
    if(l.FromIndustryCode===repCode){ dir=l.Direction||'Peer'; other=l.ToIndustryCode; }
    else if(l.ToIndustryCode===repCode){
      if(l.Direction==='Downstream')     dir='Upstream';
      else if(l.Direction==='Upstream')  dir='Downstream';
      else                               dir=l.Direction||'Peer';
      other=l.FromIndustryCode;
    }
    if(!dir) return;
    if(dirF!=='all' && dir!==dirF) return;
    res.push({...l, _dir:dir, _other:other});
  });
  return res;
}

// ── SEVER CONNECTION ──────────────────────────────────────────────────────────
function severEdge(edgeId){
  edgesDS.remove(edgeId);
  deletedEdges.add(edgeId);
  document.getElementById('infoBox').innerHTML = '<p style="color:#c0392b;font-size:13px;">✂ Connection severed.</p><p style="font-size:12px;color:#888">Click Reset to restore all connections.</p>';
  hideContextMenu();
}

// ── CREATE CONNECTION (draw mode) ─────────────────────────────────────────────
function toggleDrawMode(){
  drawMode  = !drawMode;
  drawFrom  = null;
  const btn = document.getElementById('drawBtn');
  btn.textContent = drawMode ? '✏ Drawing… (click 2 nodes)' : '✏ Add Connection';
  btn.style.background = drawMode ? '#2ecc71' : '';
  btn.style.color      = drawMode ? '#fff'    : '';
  document.getElementById('network').style.cursor = drawMode ? 'crosshair' : 'default';
}

function handleDrawClick(params){
  if(!params.nodes.length) return;
  const code = params.nodes[0];
  if(!drawFrom){
    drawFrom = code;
    nodesDS.update({ id:code, borderWidth:5, color:{ background:'#f39c12', border:'#e67e22',
      highlight:{background:'#fff',border:'#e67e22'}, hover:{background:'#fffde7',border:'#e67e22'} } });
    document.getElementById('drawBtn').textContent = `✏ Now click TARGET node`;
  } else if(drawFrom !== code){
    // ask direction
    const dir = prompt(
      `Connect "${drawFrom}" → "${code}"\n\nEnter direction:\n  1 = Upstream\n  2 = Peer\n  3 = Downstream`,
      '2'
    );
    const dirMap = {'1':'Upstream','2':'Peer','3':'Downstream'};
    const dirVal = dirMap[dir] || 'Peer';
    const newId  = `added_${Date.now()}`;
    const color  = edgeColor(dirVal);
    const newEdge = {
      id:     newId,
      from:   drawFrom,
      to:     code,
      color:  { color, highlight:color, hover:color },
      width:  2,
      arrows: dirVal==='Peer' ? '' : 'to',
      dashes: dirVal==='Peer',
      title:  dirVal,
      _dir:   dirVal,
      _str:   3
    };
    edgesDS.add(newEdge);
    addedEdges.push(newEdge);
    linksData.push({ FromIndustryCode:drawFrom, ToIndustryCode:code, Direction:dirVal, StrengthScore:3, _eid:newId });
    // restore source node style
    const fromInd = industriesData.find(i=>i.RepCode===drawFrom);
    if(fromInd) nodesDS.update({ id:drawFrom, borderWidth:1,
      color:{ background:sc(fromInd.Sector)+'cc', border:sc(fromInd.Sector),
        highlight:{background:'#fff',border:sc(fromInd.Sector)},
        hover:{background:'#fffde7',border:sc(fromInd.Sector)} } });
    drawFrom = null;
    toggleDrawMode();
  }
}

// ── CONTEXT MENU (right-click) ─────────────────────────────────────────────────
function showContextMenu(params){
  hideContextMenu();
  const menu  = document.getElementById('ctxMenu');
  const items = [];

  if(params.nodes.length > 0){
    const code = params.nodes[0];
    const ind  = industriesData.find(i=>i.RepCode===code);
    items.push(`<div class="ctx-title">${ind ? esc(ind.NameEnglish) : code}</div>`);
    items.push(`<div class="ctx-item" onclick="navigateTo('${code}');hideContextMenu()">🔍 Inspect this industry</div>`);
    items.push(`<div class="ctx-item" onclick="severAllEdges('${code}');hideContextMenu()">✂ Sever ALL connections</div>`);
    items.push(`<div class="ctx-item" onclick="isolateNode('${code}');hideContextMenu()">🎯 Isolate (dim others)</div>`);
  } else if(params.edges.length > 0){
    const eid  = params.edges[0];
    const edge = edgesDS.get(eid);
    items.push(`<div class="ctx-title">Edge: ${edge ? (edge._dir||'Peer') : eid}</div>`);
    items.push(`<div class="ctx-item ctx-danger" onclick="severEdge('${eid}')">✂ Sever this connection</div>`);
    if(edge){
      items.push(`<div class="ctx-item" onclick="flipEdge('${eid}')">↔ Flip direction</div>`);
    }
  } else {
    items.push(`<div class="ctx-item" onclick="clearHighlight();hideContextMenu()">🔄 Reset highlight</div>`);
    items.push(`<div class="ctx-item" onclick="togglePhysics();hideContextMenu()">⚛ Toggle physics</div>`);
  }

  menu.innerHTML = items.join('');
  // position near pointer
  const rect = document.getElementById('network').getBoundingClientRect();
  menu.style.left    = Math.min(params.event.clientX, rect.right  - 200) + 'px';
  menu.style.top     = Math.min(params.event.clientY, rect.bottom - 160) + 'px';
  menu.style.display = 'block';
}

function hideContextMenu(){
  document.getElementById('ctxMenu').style.display = 'none';
}
document.addEventListener('keydown', e => { if(e.key==='Escape'){ hideContextMenu(); if(drawMode) toggleDrawMode(); } });

// ── EDGE OPERATIONS ───────────────────────────────────────────────────────────
function severAllEdges(repCode){
  const toRemove = edgesDS.get({ filter: e => e.from===repCode || e.to===repCode }).map(e=>e.id);
  toRemove.forEach(id => deletedEdges.add(id));
  edgesDS.remove(toRemove);
}

function flipEdge(eid){
  const e = edgesDS.get(eid);
  if(!e) return;
  const newDir  = e._dir==='Upstream' ? 'Downstream' : e._dir==='Downstream' ? 'Upstream' : 'Peer';
  const color   = edgeColor(newDir);
  edgesDS.update({ id:eid, from:e.to, to:e.from, _dir:newDir, title:newDir,
    arrows: newDir==='Peer' ? '' : 'to',
    dashes: newDir==='Peer',
    color:  { color:color+'66', highlight:color, hover:color } });
  hideContextMenu();
}

function isolateNode(repCode){
  navigateTo(repCode);
}

// ── PHYSICS TOGGLE ────────────────────────────────────────────────────────────
function togglePhysics(){
  if(!networkInstance) return;
  const btn = document.getElementById('physicsBtn');
  const cur = btn.textContent.includes('OFF');
  networkInstance.setOptions({ physics:{ enabled: cur } });
  btn.textContent = cur ? '▶ Physics ON' : '▶ Physics OFF';
}

// ── SEARCH ────────────────────────────────────────────────────────────────────
const searchBox  = document.getElementById('searchBox');
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
    (i.ATECOAll && i.ATECOAll.includes(q)) ||
    (i.KeywordsIncludeEN && i.KeywordsIncludeEN.toLowerCase().includes(q))
  ).slice(0,25);
  if(!matches.length){ resultsDiv.style.display='none'; return; }
  matches.forEach(item => {
    const div = document.createElement('div');
    const c   = sc(item.Sector);
    div.innerHTML =
      `<span class="res-code">${esc(item.RepCode)}</span> `+
      `<span class="res-name">– ${esc(item.NameEnglish)}</span>`+
      `<span class="res-sector" style="background:${c}22;color:${c};border:1px solid ${c}55">${esc(item.Sector)}</span>`;
    div.addEventListener('mousedown', e => {
      e.preventDefault();
      resultsDiv.style.display='none';
      searchBox.value = item.NameEnglish;
      navigateTo(item.RepCode);   // ← satnav fly-to
    });
    resultsDiv.appendChild(div);
  });
  resultsDiv.style.display='block';
});
document.addEventListener('click', e=>{
  if(!document.getElementById('searchWrap').contains(e.target)) resultsDiv.style.display='none';
});

// ── RESET ─────────────────────────────────────────────────────────────────────
document.getElementById('resetBtn').addEventListener('click', resetPage);
function resetPage(){
  currentCode    = null;
  drawMode       = false;
  drawFrom       = null;
  deletedEdges   = new Set();
  addedEdges     = [];
  searchBox.value = '';
  resultsDiv.innerHTML = '';
  resultsDiv.style.display = 'none';
  document.getElementById('currentIndustry').textContent = '';
  document.getElementById('filterDir').value = 'all';
  document.getElementById('filterStr').value = '1';
  const drawBtn = document.getElementById('drawBtn');
  drawBtn.textContent  = '✏ Add Connection';
  drawBtn.style.background = '';
  drawBtn.style.color      = '';
  document.getElementById('network').style.cursor = 'default';
  hideContextMenu();
  clearHighlight();
  // restore all severed edges
  const restored = linksData.map((l,i)=>{
    const dir   = l.Direction||'Peer';
    const color = edgeColor(dir);
    return { id:`e${i}`, from:l.FromIndustryCode, to:l.ToIndustryCode,
      color:{ color:color+'66', highlight:color, hover:color },
      width:1, arrows:dir==='Peer'?'':'to', dashes:dir==='Peer',
      title:dir, _dir:dir, _str:l.StrengthScore||1 };
  });
  if(edgesDS){ edgesDS.clear(); edgesDS.add(restored); }
}

// ── FILTER LISTENERS ──────────────────────────────────────────────────────────
document.getElementById('filterDir').addEventListener('change', ()=>{ if(currentCode) navigateTo(currentCode); });
document.getElementById('filterStr').addEventListener('change', ()=>{ if(currentCode) navigateTo(currentCode); });

// ── SIDEBAR RENDERER ──────────────────────────────────────────────────────────
function renderSidebar(ind, links){
  const c          = sc(ind.Sector);
  const upstream   = links.filter(l=>l._dir==='Upstream');
  const peers      = links.filter(l=>l._dir==='Peer');
  const downstream = links.filter(l=>l._dir==='Downstream');

  let html = '';
  html += `<span class="d-repcode">#${esc(ind.RepCode)}</span>`;
  html += `<div class="d-title">${esc(ind.NameEnglish)}</div>`;
  if(!empty(ind.NameNative)) html += `<div class="d-native">${esc(ind.NameNative)}</div>`;
  html += `<span class="sector-pill" style="background:${c}22;color:${c};border:1px solid ${c}66">${esc(sl(ind.Sector))}</span>`;

  html += '<div class="d-badges">';
  if(!empty(ind.Priority)){
    const pc = ind.Priority==='High'?'priority-high':ind.Priority==='Low'?'priority-low':'priority-med';
    html += `<span class="priority-badge ${pc}">⚡ ${esc(ind.Priority)}</span>`;
  }
  if(!empty(ind.ValueChainStage)) html += `<span class="status-badge">🔗 ${esc(ind.ValueChainStage)}</span>`;
  html += '</div>';

  // Classification
  html += '<div class="d-section">📌 Classification</div>';
  const allCodes = val(ind.ATECOAll) || val(ind.ATECOPrimary);
  if(allCodes){
    const chips = allCodes.split(/[,;|\s]+/).filter(Boolean)
      .map(c=>`<span class="ateco-chip">${esc(c.trim())}</span>`).join('');
    html += `<div class="d-row"><span class="d-label">ATECO/NACE</span><span class="d-val">${chips}</span></div>`;
  } else {
    html += `<div class="d-row"><span class="d-label">ATECO/NACE</span><span class="d-val empty-val">—</span></div>`;
  }
  html += `<div class="d-row"><span class="d-label">Sector</span><span class="d-val">${esc(sl(ind.Sector))}</span></div>`;

  // Definition
  const defEN  = val(ind.ReportDefinitionEN);
  const defMkt = val(ind.MarketingDefinitionEN);
  if(defEN.length > 30 || defMkt.length > 30){
    html += '<div class="d-section">📝 Definition</div>';
    if(defEN.length > 30){
      const long = defEN.length > 200;
      html += `<div class="collapsible-wrap"><div class="ctext ${long?'collapsed':''}" id="def-en">${esc(defEN)}</div>
        ${long?'<span class="toggle-btn" onclick="toggleText(\'def-en\',this)">Show more ▼</span>':''}</div>`;
    }
    if(defMkt.length > 30 && defMkt!==defEN){
      const long = defMkt.length > 200;
      html += `<div class="collapsible-wrap" style="margin-top:6px"><div class="ctext ${long?'collapsed':''}" id="def-mkt">${esc(defMkt)}</div>
        ${long?'<span class="toggle-btn" onclick="toggleText(\'def-mkt\',this)">Show more ▼</span>':''}</div>`;
    }
  }

  // Keywords
  const kwEN = val(ind.KeywordsIncludeEN);
  const kwIT = val(ind.KeywordsIncludeIT);
  if(kwEN||kwIT){
    html += '<div class="d-section">🏷️ Keywords</div>';
    if(kwEN){
      const tags = kwEN.split(/[,;|]+/).filter(Boolean).map(k=>`<span class="kw-tag">${esc(k.trim())}</span>`).join('');
      html += `<div class="d-row"><span class="d-label">EN</span><span class="d-val">${tags}</span></div>`;
    }
    if(kwIT){
      const tags = kwIT.split(/[,;|]+/).filter(Boolean).map(k=>`<span class="kw-tag" style="background:#fff8f0;border-color:#f5c89a;color:#7d4000">${esc(k.trim())}</span>`).join('');
      html += `<div class="d-row"><span class="d-label">IT</span><span class="d-val">${tags}</span></div>`;
    }
  }

  // Orbis Boolean
  const orb = val(ind.OrbisBoolean);
  if(orb) html += `<div class="d-section">🔍 Orbis Boolean</div><div class="orbis-box">${esc(orb)}</div>`;

  // Trade Associations
  const tra = val(ind.TradeAssociations);
  if(tra) html += `<div class="d-section">🏛️ Trade Associations</div><div style="font-size:12px;line-height:1.7">${esc(tra).replace(/;/g,'<br/>')}</div>`;

  // Connections grouped by direction
  html += `<div class="d-section">🔗 Connections (${links.length})</div>`;
  if(!links.length){
    html += '<div class="no-links">No connections found.</div>';
  } else {
    const renderGroup = (arr, label, cls, icon) => {
      if(!arr.length) return '';
      let g = `<div class="conn-group"><div class="conn-group-label ${cls}">${icon} ${label} <span class="conn-count">(${arr.length})</span></div>`;
      arr.forEach(l=>{
        const o = industriesData.find(i=>i.RepCode===l._other);
        const n = o ? o.NameEnglish : l._other;
        g += `<div class="neighbor-item ${cls.replace('conn-','')}" onclick="navigateTo('${esc(l._other)}')">
          <span>${esc(n)}</span><span class="neighbor-code">#${esc(l._other)}</span></div>`;
      });
      return g+'</div>';
    };
    html += renderGroup(upstream,  'Upstream',   'conn-upstream',   '▲');
    html += renderGroup(peers,     'Peers',      'conn-peer',       '↔');
    html += renderGroup(downstream,'Downstream', 'conn-downstream', '▼');
  }

  // Quick sever button
  html += `<div style="margin-top:16px">
    <button class="ctx-btn ctx-danger" onclick="severAllEdges('${esc(ind.RepCode)}')">✂ Sever all connections</button>
  </div>`;

  document.getElementById('infoBox').innerHTML = html;
}

// ── COLLAPSIBLE TOGGLE ────────────────────────────────────────────────────────
function toggleText(id,btn){
  const el = document.getElementById(id); if(!el) return;
  if(el.classList.contains('collapsed')){
    el.classList.replace('collapsed','expanded'); btn.textContent='Show less ▲';
  } else {
    el.classList.replace('expanded','collapsed'); btn.textContent='Show more ▼';
  }
}

// ── LABEL WRAPPER ─────────────────────────────────────────────────────────────
function wrapLabel(name, max=18){
  const words = String(name).split(' ');
  const lines = []; let line = '';
  words.forEach(w=>{
    if((line+' '+w).trim().length > max && line){ lines.push(line); line=w; }
    else line=(line+' '+w).trim();
  });
  if(line) lines.push(line);
  return lines.slice(0,3).join('\n');
}

// ── BOOTSTRAP ─────────────────────────────────────────────────────────────────
loadData();
