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

// ── IOT state ─────────────────────────────────────────────────────────────────
let iotMode         = false;
let iotNodes        = [];   // ea20_iot_nodes.json
let iotSectorLinks  = [];   // ea20_iot_sector_links.json
let iotGva          = [];   // ea20_iot_gva.json
let iotLoaded       = false;
let iotHovered      = null;
let iotSelected     = null;
let iotAnimFrame    = null;

// ── sector palette (existing graph) ──────────────────────────────────────────
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

// ── IOT sector palette (EA20) ─────────────────────────────────────────────────
const IOT_SECTOR_COLORS = {
  'Agri & Mining':        '#27AE60',
  'Manufacturing':        '#E74C3C',
  'Energy & Construction':'#F39C12',
  'Trade & Transport':    '#2980B9',
  'ICT & Hospitality':    '#16A085',
  'Finance & RE':         '#D35400',
  'Professional Svcs':    '#8E44AD',
  'Public & Health':      '#2471A3',
  'Other':                '#7F8C8D'
};
const iotColor = s => IOT_SECTOR_COLORS[s] || '#7F8C8D';

// ── tiny helpers ──────────────────────────────────────────────────────────────
const esc   = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const empty = v => { if(!v) return true; const s=String(v).trim(); return !s||s==='undefined'||s==='null'||s==='None'; };
const val   = (v,f='') => empty(v) ? f : String(v).trim();
const fmtBn = v => v >= 1000 ? (v/1000).toFixed(1)+'T€' : v.toFixed(0)+'B€';

// ══════════════════════════════════════════════════════════════════════════════
// DATA LOADING
// ══════════════════════════════════════════════════════════════════════════════
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
// TOGGLE VIEWS
// ══════════════════════════════════════════════════════════════════════════════
function toggleIotView(){
  iotMode = !iotMode;
  const btn = document.getElementById('iotBtn');

  document.getElementById('network').style.display    = iotMode ? 'none' : 'block';
  document.getElementById('sidebar').style.display    = iotMode ? 'none' : 'flex';
  document.getElementById('legend').style.display     = iotMode ? 'none' : 'block';
  document.getElementById('filterbar').style.display  = iotMode ? 'none' : 'flex';

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
  canvas.width  = wrap.clientWidth  - (document.getElementById('iotSidebar').clientWidth || 280);
  canvas.height = wrap.clientHeight;
  if(iotLoaded) drawIotSpiderweb();
}
window.addEventListener('resize', () => { if(iotMode) resizeIotCanvas(); });

function getSectors(){
  return Object.keys(IOT_SECTOR_COLORS);
}

function drawIotSpiderweb(){
  const canvas = document.getElementById('iotCanvas');
  if(!canvas) return;
  const ctx  = canvas.getContext('2d');
  const W    = canvas.width;
  const H    = canvas.height;
  if(!W || !H) return;

  ctx.clearRect(0,0,W,H);

  const sectors  = getSectors();
  const n        = sectors.length;
  const cx       = W / 2;
  const cy       = H / 2;
  const R        = Math.min(W, H) * 0.36;

  // Pre-compute node positions
  const pos = {};
  sectors.forEach((s, i) => {
    const angle = (2 * Math.PI * i / n) - Math.PI / 2;
    pos[s] = {
      x:     cx + R * Math.cos(angle),
      y:     cy + R * Math.sin(angle),
      angle: angle,
      label: s
    };
  });

  // ── Compute max flow for scaling ──
  const maxFlow = Math.max(...iotSectorLinks.map(l => l.value_bn));

  // ── Draw flow lines ──
  iotSectorLinks.forEach(link => {
    const from = pos[link.source];
    const to   = pos[link.target];
    if(!from || !to) return;

    const isActive = (iotSelected === link.source || iotSelected === link.target ||
                      iotHovered  === link.source || iotHovered  === link.target);
    const isSelected = (iotSelected && (iotSelected===link.source || iotSelected===link.target));

    const t = link.value_bn / maxFlow;
    const alpha = isActive ? 0.8 : (iotSelected ? 0.06 : 0.18 + t*0.45);
    const lineW = isActive ? 1.5 + t*14 : 0.5 + t*10;

    // colour from source sector
    const hex   = iotColor(link.source);
    const r     = parseInt(hex.slice(1,3),16);
    const g     = parseInt(hex.slice(3,5),16);
    const b     = parseInt(hex.slice(5,7),16);

    ctx.save();
    ctx.beginPath();
    // slight curve via centre
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(
      cx + (from.x + to.x - 2*cx) * 0.18,
      cy + (from.y + to.y - 2*cy) * 0.18,
      to.x, to.y
    );
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.lineWidth   = lineW;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // arrowhead
    if(isActive || t > 0.3){
      const dx  = to.x - from.x;
      const dy  = to.y - from.y;
      const len = Math.sqrt(dx*dx+dy*dy);
      const ux  = dx/len; const uy = dy/len;
      const mx  = (from.x+to.x)/2; const my=(from.y+to.y)/2;
      const aSize = isActive ? 8 : 5;
      ctx.beginPath();
      ctx.moveTo(mx + ux*aSize, my + uy*aSize);
      ctx.lineTo(mx - ux*aSize - uy*aSize*0.6, my - uy*aSize + ux*aSize*0.6);
      ctx.lineTo(mx - ux*aSize + uy*aSize*0.6, my - uy*aSize - ux*aSize*0.6);
      ctx.closePath();
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha+0.1})`;
      ctx.fill();
    }
    ctx.restore();
  });

  // ── Draw nodes ──
  sectors.forEach(s => {
    const p      = pos[s];
    const isHov  = iotHovered  === s;
    const isSel  = iotSelected === s;
    const isDim  = iotSelected && !isSel;
    const color  = iotColor(s);
    const radius = isSel ? 28 : isHov ? 24 : 18;
    const alpha  = isDim ? 0.3 : 1.0;

    ctx.save();
    ctx.globalAlpha = alpha;

    // glow for selected
    if(isSel){
      ctx.shadowColor = color;
      ctx.shadowBlur  = 22;
    }

    // node circle
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, 2*Math.PI);
    const hex = color;
    const r2  = parseInt(hex.slice(1,3),16);
    const g2  = parseInt(hex.slice(3,5),16);
    const b2  = parseInt(hex.slice(5,7),16);
    ctx.fillStyle   = `rgba(${r2},${g2},${b2},0.85)`;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = isSel ? 3 : 1.5;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    // label
    const labelR  = R + 42;
    const lx      = cx + labelR * Math.cos(p.angle);
    const ly      = cy + labelR * Math.sin(p.angle);
    const words   = s.split(' & ');
    ctx.font      = isSel ? 'bold 13px Segoe UI' : '12px Segoe UI';
    ctx.fillStyle = isDim ? '#484f58' : '#e6edf3';
    ctx.textAlign = lx < cx - 10 ? 'right' : lx > cx + 10 ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    words.forEach((word, wi) => {
      const offset = (wi - (words.length-1)/2) * 15;
      ctx.fillText(word, lx, ly + offset);
    });

    ctx.restore();
  });

  // ── Centre label ──
  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  if(iotSelected){
    // show selected sector total supply/use
    const node = iotNodes.find(n => n.sector === iotSelected);
    const supplyTotal = iotNodes.filter(n=>n.sector===iotSelected).reduce((s,n)=>s+n.total_supply_mio_eur,0);
    const useTotal    = iotNodes.filter(n=>n.sector===iotSelected).reduce((s,n)=>s+n.total_use_mio_eur,0);
    const outFlows    = iotSectorLinks.filter(l=>l.source===iotSelected).reduce((s,l)=>s+l.value_bn,0);
    const inFlows     = iotSectorLinks.filter(l=>l.target===iotSelected).reduce((s,l)=>s+l.value_bn,0);
    ctx.font      = 'bold 15px Segoe UI';
    ctx.fillStyle = iotColor(iotSelected);
    ctx.fillText(iotSelected, cx, cy - 28);
    ctx.font      = '12px Segoe UI';
    ctx.fillStyle = '#8b949e';
    ctx.fillText(`▶ Out: ${fmtBn(outFlows)}`, cx, cy - 8);
    ctx.fillText(`◀ In:  ${fmtBn(inFlows)}`,  cx, cy + 10);
    ctx.fillStyle = '#484f58';
    ctx.font      = '11px Segoe UI';
    ctx.fillText('Click to deselect', cx, cy + 30);
  } else {
    ctx.font      = 'bold 14px Segoe UI';
    ctx.fillStyle = '#f0883e';
    ctx.fillText('EA20 · 2023', cx, cy - 12);
    ctx.font      = '12px Segoe UI';
    ctx.fillStyle = '#484f58';
    ctx.fillText('IOT Sector Flows', cx, cy + 10);
  }
  ctx.restore();
}

// ── Hit detection ─────────────────────────────────────────────────────────────
function getIotSectorAtXY(mx, my){
  const canvas  = document.getElementById('iotCanvas');
  const W = canvas.width; const H = canvas.height;
  const sectors = getSectors();
  const n  = sectors.length;
  const cx = W/2; const cy = H/2;
  const R  = Math.min(W,H)*0.36;
  for(let i=0; i<n; i++){
    const angle = (2*Math.PI*i/n) - Math.PI/2;
    const nx = cx + R*Math.cos(angle);
    const ny = cy + R*Math.sin(angle);
    const dist = Math.sqrt((mx-nx)**2 + (my-ny)**2);
    if(dist < 28) return sectors[i];
  }
  return null;
}

// ── Canvas mouse events ───────────────────────────────────────────────────────
function setupIotCanvasEvents(){
  const canvas  = document.getElementById('iotCanvas');
  const tooltip = document.getElementById('iotTooltip');

  canvas.addEventListener('mousemove', e => {
    if(!iotLoaded) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = getIotSectorAtXY(mx, my);
    iotHovered = hit;
    canvas.style.cursor = hit ? 'pointer' : 'default';

    if(hit){
      const outFlows = iotSectorLinks.filter(l=>l.source===hit);
      const inFlows  = iotSectorLinks.filter(l=>l.target===hit);
      const totalOut = outFlows.reduce((s,l)=>s+l.value_bn,0);
      const totalIn  = inFlows.reduce((s,l)=>s+l.value_bn,0);
      const topOut   = outFlows.sort((a,b)=>b.value_bn-a.value_bn).slice(0,3);
      const topIn    = inFlows.sort((a,b)=>b.value_bn-a.value_bn).slice(0,3);
      let html = `<strong>${hit}</strong><br/>`;
      html += `<span style="color:#8b949e">Total output: ${fmtBn(totalOut)}</span><br/>`;
      html += `<span style="color:#8b949e">Total input: ${fmtBn(totalIn)}</span>`;
      if(topOut.length){
        html += `<br/><span style="color:#3fb950;font-size:11px">▶ Sells most to: `+topOut.map(l=>`${l.target} (${fmtBn(l.value_bn)})`).join(', ')+`</span>`;
      }
      if(topIn.length){
        html += `<br/><span style="color:#d29922;font-size:11px">◀ Buys most from: `+topIn.map(l=>`${l.source} (${fmtBn(l.value_bn)})`).join(', ')+`</span>`;
      }
      tooltip.innerHTML = html;
      tooltip.style.display = 'block';
      tooltip.style.left = Math.min(e.clientX - rect.left + 16, canvas.width - 280) + 'px';
      tooltip.style.top  = Math.max(e.clientY - rect.top  - 10, 8) + 'px';
    } else {
      tooltip.style.display = 'none';
    }
    drawIotSpiderweb();
  });

  canvas.addEventListener('mouseleave', () => {
    iotHovered = null;
    tooltip.style.display = 'none';
    drawIotSpiderweb();
  });

  canvas.addEventListener('click', e => {
    if(!iotLoaded) return;
    const rect = canvas.getBoundingClientRect();
    const hit  = getIotSectorAtXY(e.clientX-rect.left, e.clientY-rect.top);
    iotSelected = (hit === iotSelected) ? null : hit;
    highlightGvaList(iotSelected);
    drawIotSpiderweb();
  });
}

// ── GVA sidebar ───────────────────────────────────────────────────────────────
function buildGvaList(){
  const list   = document.getElementById('gvaList');
  const maxGva = iotGva[0] ? iotGva[0].gva_bn : 1;
  list.innerHTML = iotGva.map((item,i) => {
    const c   = iotColor(item.sector);
    const pct = (item.gva_bn / maxGva * 100).toFixed(1);
    return `<div class="gva-item" data-sector="${item.sector}" onclick="selectIotSector('${item.sector}')">
      <div class="gva-dot" style="background:${c}"></div>
      <span class="gva-name">${item.label}</span>
      <div class="gva-bar-wrap"><div class="gva-bar" style="width:${pct}%;background:${c}"></div></div>
      <span class="gva-val">${fmtBn(item.gva_bn)}</span>
    </div>`;
  }).join('');
}

function highlightGvaList(sector){
  document.querySelectorAll('.gva-item').forEach(el => {
    el.style.background = (sector && el.dataset.sector === sector) ? '#21262d' : '';
    el.style.borderLeft = (sector && el.dataset.sector === sector) ? `3px solid ${iotColor(sector)}` : '';
  });
}

function selectIotSector(sector){
  iotSelected = (iotSelected === sector) ? null : sector;
  highlightGvaList(iotSelected);
  drawIotSpiderweb();
}

// ── IOT legend ────────────────────────────────────────────────────────────────
function buildIotLegend(){
  const leg = document.getElementById('iotLegend');
  const rows = Object.entries(IOT_SECTOR_COLORS).map(([s,c]) =>
    `<div class="iot-leg-row"><div class="iot-leg-dot" style="background:${c}"></div>${s}</div>`
  ).join('');
  leg.innerHTML = '<h3>Macro Sector</h3>' + rows +
    '<div style="margin-top:8px;font-size:10px;color:#484f58;">Line width ∝ flow value</div>';
}

// ══════════════════════════════════════════════════════════════════════════════
// BUILD FULL SPIDERWEB (vis.js – existing graph)
// ══════════════════════════════════════════════════════════════════════════════
function buildSpiderweb(){
  document.getElementById('emptyState').style.display = 'none';

  const nodes = industriesData.map(ind => ({
    id:    ind.RepCode,
    label: wrapLabel(ind.NameEnglish, 18),
    group: ind.Sector,
    color: {
      background: sc(ind.Sector)+'cc', border: sc(ind.Sector),
      highlight:  { background:'#ffffff', border:sc(ind.Sector) },
      hover:      { background:'#fffde7', border:sc(ind.Sector) }
    },
    font:  { size:10, color:'#1a1a2e', face:'Segoe UI', vadjust:-2 },
    size:  14, shape:'dot', borderWidth:1, shadow:false,
    title: `<b>${esc(ind.NameEnglish)}</b><br/>#${esc(ind.RepCode)} · ${sl(ind.Sector)}`,
    _ind:  ind
  }));

  const edges = linksData.map((l,i) => {
    const dir   = l.Direction||'Peer';
    const color = dir==='Upstream'?'#e6a817':dir==='Downstream'?'#28a745':'#17a2b8';
    return {
      id:`e${i}`, from:l.FromIndustryCode, to:l.ToIndustryCode,
      color:{ color:color+'66', highlight:color, hover:color },
      width:1, arrows:dir==='Peer'?'':'to', dashes:dir==='Peer',
      title:dir, _dir:dir, _str:l.StrengthScore||1
    };
  });

  nodesDS = new vis.DataSet(nodes);
  edgesDS = new vis.DataSet(edges);

  const container = document.getElementById('network');
  const options = {
    nodes:  { borderWidth:1, shadow:false },
    edges:  { smooth:{ type:'continuous', roundness:0.2 }, selectionWidth:3 },
    interaction: {
      hover:true, tooltipDelay:120, navigationButtons:true,
      keyboard:{ enabled:true, speed:{ x:8,y:8,zoom:0.02 } },
      multiselect:true, selectConnectedEdges:true
    },
    physics: {
      enabled:true, solver:'forceAtlas2Based',
      stabilization:{ iterations:300, updateInterval:30 },
      forceAtlas2Based:{
        gravitationalConstant:-50, centralGravity:0.005,
        springLength:120, springConstant:0.08, damping:0.6
      }
    },
    layout:{ randomSeed:42 }
  };

  if(networkInstance){ networkInstance.destroy(); }
  networkInstance = new vis.Network(container, { nodes:nodesDS, edges:edgesDS }, options);

  networkInstance.once('stabilizationIterationsDone', () => {
    networkInstance.setOptions({ physics:{ enabled:false } });
    document.getElementById('physicsBtn').textContent = '▶ Physics OFF';
  });

  networkInstance.on('click', params => {
    if(drawMode){ handleDrawClick(params); return; }
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

  networkInstance.on('oncontext', params => {
    params.event.preventDefault();
    showContextMenu(params);
  });

  networkInstance.on('click', () => hideContextMenu());

  // Set up IOT canvas events after DOM is ready
  setupIotCanvasEvents();
}

// ══════════════════════════════════════════════════════════════════════════════
// SATNAV + HIGHLIGHT (existing graph)
// ══════════════════════════════════════════════════════════════════════════════
function navigateTo(repCode){
  const ind = industriesData.find(i=>i.RepCode===repCode);
  if(!ind || !networkInstance) return;
  currentCode = repCode;
  document.getElementById('currentIndustry').textContent = ind.NameEnglish;
  const links    = getLinksFor(repCode);
  const neighSet = new Set(links.map(l=>l._other));
  neighSet.add(repCode);
  nodesDS.forEach(n => {
    const isEgo   = n.id===repCode;
    const isNeigh = neighSet.has(n.id);
    nodesDS.update({ id:n.id, color:{
      background: isEgo?'#ffffff':isNeigh?sc(n.group)+'ee':sc(n.group)+'22',
      border: isEgo?sc(ind.Sector):isNeigh?sc(n.group):sc(n.group)+'33',
      highlight:n.color.highlight, hover:n.color.hover
    }, borderWidth:isEgo?4:isNeigh?2:1, size:isEgo?26:isNeigh?16:12, shadow:isEgo });
  });
  edgesDS.forEach(e => {
    const connected = e.from===repCode||e.to===repCode;
    edgesDS.update({ id:e.id,
      color: connected?{ color:edgeColor(e._dir), highlight:edgeColor(e._dir), hover:edgeColor(e._dir) }
                      :{ color:'#e0e0e033', highlight:'#999', hover:'#999' },
      width: connected?2:0.5 });
  });
  networkInstance.focus(repCode, { scale:1.6, animation:{ duration:800, easingFunction:'easeInOutQuad' } });
  pulseNode(repCode, ind.Sector);
  renderSidebar(ind, links);
}

function pulseNode(repCode, sector){
  let tick=0;
  const id = setInterval(()=>{
    tick++;
    const bright=tick%2===0;
    nodesDS.update({ id:repCode, borderWidth:bright?6:4,
      color:{ background:bright?sc(sector):'#ffffff', border:sc(sector),
        highlight:{background:'#fff',border:sc(sector)}, hover:{background:'#fffde7',border:sc(sector)} }
    });
    if(tick>=6){ clearInterval(id); nodesDS.update({ id:repCode, background:'#ffffff', borderWidth:4 }); }
  },180);
}

function edgeColor(dir){
  return dir==='Upstream'?'#e6a817':dir==='Downstream'?'#28a745':'#17a2b8';
}

function clearHighlight(){
  if(!nodesDS) return;
  nodesDS.forEach(n=>{
    const ind=industriesData.find(i=>i.RepCode===n.id); if(!ind) return;
    nodesDS.update({ id:n.id,
      color:{ background:sc(ind.Sector)+'cc', border:sc(ind.Sector),
        highlight:{background:'#fff',border:sc(ind.Sector)}, hover:{background:'#fffde7',border:sc(ind.Sector)} },
      borderWidth:1, size:14, shadow:false });
  });
  edgesDS.forEach(e=>{
    const dir=e._dir||'Peer';
    edgesDS.update({ id:e.id,
      color:{ color:edgeColor(dir)+'66', highlight:edgeColor(dir), hover:edgeColor(dir) }, width:1 });
  });
  currentCode=null;
  document.getElementById('currentIndustry').textContent='';
  document.getElementById('infoBox').innerHTML='<div id="emptyMsg">Click or search for an industry to explore it.</div>';
}

function highlightEdge(edgeId){
  const e=edgesDS.get(edgeId); if(!e) return;
  const from=industriesData.find(i=>i.RepCode===e.from);
  const to=industriesData.find(i=>i.RepCode===e.to);
  let html=`<div class="d-section">🔗 Edge Details</div>`;
  html+=`<div class="d-row"><span class="d-label">Type</span><span class="d-val">${esc(e._dir||e.title||'Peer')}</span></div>`;
  html+=`<div class="d-row"><span class="d-label">From</span><span class="d-val">${from?esc(from.NameEnglish):esc(e.from)}</span></div>`;
  html+=`<div class="d-row"><span class="d-label">To</span><span class="d-val">${to?esc(to.NameEnglish):esc(e.to)}</span></div>`;
  html+=`<div class="d-row"><span class="d-label">Strength</span><span class="d-val">${e._str||1}</span></div>`;
  html+=`<div style="margin-top:12px;"><button class="ctx-btn ctx-danger" onclick="severEdge('${edgeId}')">✂ Sever this connection</button></div>`;
  document.getElementById('infoBox').innerHTML=html;
}

function getLinksFor(repCode){
  const dirF=document.getElementById('filterDir').value;
  const strF=parseInt(document.getElementById('filterStr').value)||1;
  const res=[];
  linksData.forEach(l=>{
    if((l.StrengthScore||1)<strF) return;
    if(deletedEdges.has(l._eid)) return;
    let dir=null, other=null;
    if(l.FromIndustryCode===repCode){ dir=l.Direction||'Peer'; other=l.ToIndustryCode; }
    else if(l.ToIndustryCode===repCode){
      if(l.Direction==='Downstream') dir='Upstream';
      else if(l.Direction==='Upstream') dir='Downstream';
      else dir=l.Direction||'Peer';
      other=l.FromIndustryCode;
    }
    if(!dir) return;
    if(dirF!=='all'&&dir!==dirF) return;
    res.push({...l, _dir:dir, _other:other});
  });
  return res;
}

function severEdge(edgeId){
  edgesDS.remove(edgeId); deletedEdges.add(edgeId);
  document.getElementById('infoBox').innerHTML='<p style="color:#c0392b;font-size:13px;">✂ Connection severed.</p><p style="font-size:12px;color:#888">Click Reset to restore all connections.</p>';
  hideContextMenu();
}

function toggleDrawMode(){
  drawMode=!drawMode; drawFrom=null;
  const btn=document.getElementById('drawBtn');
  btn.textContent=drawMode?'✏ Drawing… (click 2 nodes)':'✏ Add Connection';
  btn.style.background=drawMode?'#2ecc71':'';
  btn.style.color=drawMode?'#fff':'';
  document.getElementById('network').style.cursor=drawMode?'crosshair':'default';
}

function handleDrawClick(params){
  if(!params.nodes.length) return;
  const code=params.nodes[0];
  if(!drawFrom){
    drawFrom=code;
    nodesDS.update({ id:code, borderWidth:5, color:{ background:'#f39c12', border:'#e67e22',
      highlight:{background:'#fff',border:'#e67e22'}, hover:{background:'#fffde7',border:'#e67e22'} } });
    document.getElementById('drawBtn').textContent='✏ Now click TARGET node';
  } else if(drawFrom!==code){
    const dir=prompt(`Connect "${drawFrom}" → "${code}"\n\nEnter direction:\n  1 = Upstream\n  2 = Peer\n  3 = Downstream`,'2');
    const dirMap={'1':'Upstream','2':'Peer','3':'Downstream'};
    const dirVal=dirMap[dir]||'Peer';
    const newId=`added_${Date.now()}`;
    const color=edgeColor(dirVal);
    const newEdge={ id:newId, from:drawFrom, to:code,
      color:{color,highlight:color,hover:color}, width:2,
      arrows:dirVal==='Peer'?'':'to', dashes:dirVal==='Peer',
      title:dirVal, _dir:dirVal, _str:3 };
    edgesDS.add(newEdge);
    addedEdges.push(newEdge);
    linksData.push({ FromIndustryCode:drawFrom, ToIndustryCode:code, Direction:dirVal, StrengthScore:3, _eid:newId });
    const fromInd=industriesData.find(i=>i.RepCode===drawFrom);
    if(fromInd) nodesDS.update({ id:drawFrom, borderWidth:1,
      color:{ background:sc(fromInd.Sector)+'cc', border:sc(fromInd.Sector),
        highlight:{background:'#fff',border:sc(fromInd.Sector)}, hover:{background:'#fffde7',border:sc(fromInd.Sector)} } });
    drawFrom=null;
    toggleDrawMode();
  }
}

function showContextMenu(params){
  hideContextMenu();
  const menu=document.getElementById('ctxMenu');
  const items=[];
  if(params.nodes.length>0){
    const code=params.nodes[0];
    const ind=industriesData.find(i=>i.RepCode===code);
    items.push(`<div class="ctx-title">${ind?esc(ind.NameEnglish):code}</div>`);
    items.push(`<div class="ctx-item" onclick="navigateTo('${code}');hideContextMenu()">🔍 Inspect this industry</div>`);
    items.push(`<div class="ctx-item" onclick="severAllEdges('${code}');hideContextMenu()">✂ Sever ALL connections</div>`);
    items.push(`<div class="ctx-item" onclick="isolateNode('${code}');hideContextMenu()">🎯 Isolate (dim others)</div>`);
  } else if(params.edges.length>0){
    const eid=params.edges[0];
    const edge=edgesDS.get(eid);
    items.push(`<div class="ctx-title">Edge: ${edge?(edge._dir||'Peer'):eid}</div>`);
    items.push(`<div class="ctx-item ctx-danger" onclick="severEdge('${eid}')">✂ Sever this connection</div>`);
    if(edge) items.push(`<div class="ctx-item" onclick="flipEdge('${eid}')">↔ Flip direction</div>`);
  } else {
    items.push(`<div class="ctx-item" onclick="clearHighlight();hideContextMenu()">🔄 Reset highlight</div>`);
    items.push(`<div class="ctx-item" onclick="togglePhysics();hideContextMenu()">⚛ Toggle physics</div>`);
  }
  menu.innerHTML=items.join('');
  const rect=document.getElementById('network').getBoundingClientRect();
  menu.style.left=Math.min(params.event.clientX,rect.right-200)+'px';
  menu.style.top=Math.min(params.event.clientY,rect.bottom-160)+'px';
  menu.style.display='block';
}
function hideContextMenu(){ document.getElementById('ctxMenu').style.display='none'; }
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ hideContextMenu(); if(drawMode) toggleDrawMode(); } });

function severAllEdges(repCode){
  const toRemove=edgesDS.get({ filter:e=>e.from===repCode||e.to===repCode }).map(e=>e.id);
  toRemove.forEach(id=>deletedEdges.add(id));
  edgesDS.remove(toRemove);
}
function flipEdge(eid){
  const e=edgesDS.get(eid); if(!e) return;
  const newDir=e._dir==='Upstream'?'Downstream':e._dir==='Downstream'?'Upstream':'Peer';
  const color=edgeColor(newDir);
  edgesDS.update({ id:eid, from:e.to, to:e.from, _dir:newDir, title:newDir,
    arrows:newDir==='Peer'?'':'to', dashes:newDir==='Peer',
    color:{ color:color+'66', highlight:color, hover:color } });
  hideContextMenu();
}
function isolateNode(repCode){ navigateTo(repCode); }

function togglePhysics(){
  if(!networkInstance) return;
  const btn=document.getElementById('physicsBtn');
  const cur=btn.textContent.includes('OFF');
  networkInstance.setOptions({ physics:{ enabled:cur } });
  btn.textContent=cur?'▶ Physics ON':'▶ Physics OFF';
}

// ── SEARCH ────────────────────────────────────────────────────────────────────
const searchBox=document.getElementById('searchBox');
const resultsDiv=document.getElementById('results');
searchBox.addEventListener('input',()=>{
  const q=searchBox.value.trim().toLowerCase();
  resultsDiv.innerHTML='';
  if(!q){ resultsDiv.style.display='none'; return; }
  const matches=industriesData.filter(i=>
    i.RepCode.toLowerCase().includes(q)||
    i.NameEnglish.toLowerCase().includes(q)||
    (i.NameNative&&i.NameNative.toLowerCase().includes(q))||
    (i.ATECOPrimary&&i.ATECOPrimary.includes(q))||
    (i.ATECOAll&&i.ATECOAll.includes(q))||
    (i.KeywordsIncludeEN&&i.KeywordsIncludeEN.toLowerCase().includes(q))
  ).slice(0,25);
  if(!matches.length){ resultsDiv.style.display='none'; return; }
  matches.forEach(item=>{
    const div=document.createElement('div');
    const c=sc(item.Sector);
    div.innerHTML=`<span class="res-code">${esc(item.RepCode)}</span> `+
      `<span class="res-name">– ${esc(item.NameEnglish)}</span>`+
      `<span class="res-sector" style="background:${c}22;color:${c};border:1px solid ${c}55">${esc(item.Sector)}</span>`;
    div.addEventListener('mousedown',e=>{
      e.preventDefault();
      resultsDiv.style.display='none';
      searchBox.value=item.NameEnglish;
      navigateTo(item.RepCode);
    });
    resultsDiv.appendChild(div);
  });
  resultsDiv.style.display='block';
});
document.addEventListener('click',e=>{
  if(!document.getElementById('searchWrap').contains(e.target)) resultsDiv.style.display='none';
});

// ── RESET ─────────────────────────────────────────────────────────────────────
document.getElementById('resetBtn').addEventListener('click',resetPage);
function resetPage(){
  currentCode=null; drawMode=false; drawFrom=null;
  deletedEdges=new Set(); addedEdges=[];
  searchBox.value=''; resultsDiv.innerHTML=''; resultsDiv.style.display='none';
  document.getElementById('currentIndustry').textContent='';
  document.getElementById('filterDir').value='all';
  document.getElementById('filterStr').value='1';
  const drawBtn=document.getElementById('drawBtn');
  drawBtn.textContent='✏ Add Connection'; drawBtn.style.background=''; drawBtn.style.color='';
  document.getElementById('network').style.cursor='default';
  hideContextMenu(); clearHighlight();
  const restored=linksData.map((l,i)=>{
    const dir=l.Direction||'Peer'; const color=edgeColor(dir);
    return { id:`e${i}`, from:l.FromIndustryCode, to:l.ToIndustryCode,
      color:{ color:color+'66', highlight:color, hover:color },
      width:1, arrows:dir==='Peer'?'':'to', dashes:dir==='Peer',
      title:dir, _dir:dir, _str:l.StrengthScore||1 };
  });
  if(edgesDS){ edgesDS.clear(); edgesDS.add(restored); }
}

// ── FILTER LISTENERS ──────────────────────────────────────────────────────────
document.getElementById('filterDir').addEventListener('change',()=>{ if(currentCode) navigateTo(currentCode); });
document.getElementById('filterStr').addEventListener('change',()=>{ if(currentCode) navigateTo(currentCode); });

// ── SIDEBAR RENDERER ──────────────────────────────────────────────────────────
function renderSidebar(ind, links){
  const c=sc(ind.Sector);
  const upstream=links.filter(l=>l._dir==='Upstream');
  const peers=links.filter(l=>l._dir==='Peer');
  const downstream=links.filter(l=>l._dir==='Downstream');
  let html='';
  html+=`<span class="d-repcode">#${esc(ind.RepCode)}</span>`;
  html+=`<div class="d-title">${esc(ind.NameEnglish)}</div>`;
  if(!empty(ind.NameNative)) html+=`<div class="d-native">${esc(ind.NameNative)}</div>`;
  html+=`<span class="sector-pill" style="background:${c}22;color:${c};border:1px solid ${c}66">${esc(sl(ind.Sector))}</span>`;
  html+='<div class="d-badges">';
  if(!empty(ind.Priority)){
    const pc=ind.Priority==='High'?'priority-high':ind.Priority==='Low'?'priority-low':'priority-med';
    html+=`<span class="priority-badge ${pc}">⚡ ${esc(ind.Priority)}</span>`;
  }
  if(!empty(ind.ValueChainStage)) html+=`<span class="status-badge">🔗 ${esc(ind.ValueChainStage)}</span>`;
  html+='</div>';
  html+='<div class="d-section">📌 Classification</div>';
  const allCodes=val(ind.ATECOAll)||val(ind.ATECOPrimary);
  if(allCodes){
    const chips=allCodes.split(/[,;|\s]+/).filter(Boolean).map(c=>`<span class="ateco-chip">${esc(c.trim())}</span>`).join('');
    html+=`<div class="d-row"><span class="d-label">ATECO/NACE</span><span class="d-val">${chips}</span></div>`;
  } else {
    html+=`<div class="d-row"><span class="d-label">ATECO/NACE</span><span class="d-val empty-val">—</span></div>`;
  }
  html+=`<div class="d-row"><span class="d-label">Sector</span><span class="d-val">${esc(sl(ind.Sector))}</span></div>`;
  const defEN=val(ind.ReportDefinitionEN); const defMkt=val(ind.MarketingDefinitionEN);
  if(defEN.length>30||defMkt.length>30){
    html+='<div class="d-section">📝 Definition</div>';
    if(defEN.length>30){
      const long=defEN.length>200;
      html+=`<div class="collapsible-wrap"><div class="ctext ${long?'collapsed':''}" id="def-en">${esc(defEN)}</div>${long?'<span class="toggle-btn" onclick="toggleText(\'def-en\',this)">Show more ▼</span>':''}</div>`;
    }
    if(defMkt.length>30&&defMkt!==defEN){
      const long=defMkt.length>200;
      html+=`<div class="collapsible-wrap" style="margin-top:6px"><div class="ctext ${long?'collapsed':''}" id="def-mkt">${esc(defMkt)}</div>${long?'<span class="toggle-btn" onclick="toggleText(\'def-mkt\',this)">Show more ▼</span>':''}</div>`;
    }
  }
  const kwEN=val(ind.KeywordsIncludeEN); const kwIT=val(ind.KeywordsIncludeIT);
  if(kwEN||kwIT){
    html+='<div class="d-section">🏷️ Keywords</div>';
    if(kwEN){ const tags=kwEN.split(/[,;|]+/).filter(Boolean).map(k=>`<span class="kw-tag">${esc(k.trim())}</span>`).join(''); html+=`<div class="d-row"><span class="d-label">EN</span><span class="d-val">${tags}</span></div>`; }
    if(kwIT){ const tags=kwIT.split(/[,;|]+/).filter(Boolean).map(k=>`<span class="kw-tag" style="background:#fff8f0;border-color:#f5c89a;color:#7d4000">${esc(k.trim())}</span>`).join(''); html+=`<div class="d-row"><span class="d-label">IT</span><span class="d-val">${tags}</span></div>`; }
  }
  const orb=val(ind.OrbisBoolean);
  if(orb) html+=`<div class="d-section">🔍 Orbis Boolean</div><div class="orbis-box">${esc(orb)}</div>`;
  const tra=val(ind.TradeAssociations);
  if(tra) html+=`<div class="d-section">🏛️ Trade Associations</div><div style="font-size:12px;line-height:1.7">${esc(tra).replace(/;/g,'<br/>')}</div>`;
  html+=`<div class="d-section">🔗 Connections (${links.length})</div>`;
  if(!links.length){
    html+='<div class="no-links">No connections found.</div>';
  } else {
    const renderGroup=(arr,label,cls,icon)=>{
      if(!arr.length) return '';
      let g=`<div class="conn-group"><div class="conn-group-label ${cls}">${icon} ${label} <span class="conn-count">(${arr.length})</span></div>`;
      arr.forEach(l=>{
        const o=industriesData.find(i=>i.RepCode===l._other);
        const n=o?o.NameEnglish:l._other;
        g+=`<div class="neighbor-item ${cls.replace('conn-','')}" onclick="navigateTo('${esc(l._other)}')"><span>${esc(n)}</span><span class="neighbor-code">#${esc(l._other)}</span></div>`;
      });
      return g+'</div>';
    };
    html+=renderGroup(upstream,'Upstream','conn-upstream','▲');
    html+=renderGroup(peers,'Peers','conn-peer','↔');
    html+=renderGroup(downstream,'Downstream','conn-downstream','▼');
  }
  html+=`<div style="margin-top:16px"><button class="ctx-btn ctx-danger" onclick="severAllEdges('${esc(ind.RepCode)}')">✂ Sever all connections</button></div>`;
  document.getElementById('infoBox').innerHTML=html;
}

function toggleText(id,btn){
  const el=document.getElementById(id); if(!el) return;
  if(el.classList.contains('collapsed')){ el.classList.replace('collapsed','expanded'); btn.textContent='Show less ▲'; }
  else { el.classList.replace('expanded','collapsed'); btn.textContent='Show more ▼'; }
}

function wrapLabel(name,max=18){
  const words=String(name).split(' ');
  const lines=[]; let line='';
  words.forEach(w=>{ if((line+' '+w).trim().length>max&&line){ lines.push(line); line=w; } else line=(line+' '+w).trim(); });
  if(line) lines.push(line);
  return lines.slice(0,3).join('\n');
}

// ── BOOTSTRAP ─────────────────────────────────────────────────────────────────
loadData();
