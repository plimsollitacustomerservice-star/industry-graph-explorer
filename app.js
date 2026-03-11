// ── app.js – Industry Graph Explorer ──

let industriesData = [];
let linksData = [];
let networkInstance = null;
let currentCode = null;

// Colour palette per sector code
const SECTOR_COLORS = {
  MAN: '#e06c75',
  WHL: '#e5c07b',
  RET: '#98c379',
  HEA: '#56b6c2',
  ICT: '#61afef',
  AGR: '#a8d8a8',
  FIN: '#c678dd',
  ENE: '#d19a66',
  CON: '#be5046',
  EDU: '#4db6ac',
  SER: '#9e9e9e',
  default: '#7f8c8d'
};

function sectorColor(code) {
  return SECTOR_COLORS[code] || SECTOR_COLORS.default;
}

// ── Load data ──
async function loadData() {
  try {
    const [indRes, lnkRes] = await Promise.all([
      axios.get('data/industries.json'),
      axios.get('data/links.json')
    ]);
    industriesData = indRes.data;
    linksData = lnkRes.data;
    document.getElementById('statsLabel').textContent =
      `${industriesData.length} industries · ${linksData.length} links`;
  } catch (e) {
    console.error('Failed to load data files', e);
  }
}

// ── Search ──
const searchBox = document.getElementById('searchBox');
const resultsDiv = document.getElementById('results');

searchBox.addEventListener('input', () => {
  const q = searchBox.value.trim().toLowerCase();
  resultsDiv.innerHTML = '';
  if (!q) { resultsDiv.style.display = 'none'; return; }

  const matches = industriesData.filter(i =>
    i.RepCode.toLowerCase().includes(q) ||
    i.NameEnglish.toLowerCase().includes(q)
  ).slice(0, 20);

  if (!matches.length) { resultsDiv.style.display = 'none'; return; }

  matches.forEach(item => {
    const div = document.createElement('div');
    div.innerHTML =
      `<span class="res-code">${item.RepCode}</span> ` +
      `<span class="res-name">– ${item.NameEnglish}</span>`;
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
  if (!e.target.closest('#searchWrap')) resultsDiv.style.display = 'none';
});

// ── Build and render graph ──
function loadGraph(code) {
  currentCode = code;
  const dir = document.getElementById('filterDir').value;
  const minStr = parseInt(document.getElementById('filterStr').value, 10);
  const layout = document.getElementById('layoutSel').value;

  const center = industriesData.find(i => i.RepCode === code);
  if (!center) return;

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('currentIndustry').textContent = center.NameEnglish;

  // Filter links
  let relevantLinks = linksData.filter(l =>
    (l.FromIndustryCode === code || l.ToIndustryCode === code) &&
    (dir === 'all' || l.Direction === dir) &&
    (l.StrengthScore >= minStr)
  );

  // Collect node codes
  const nodeCodes = new Set([code]);
  relevantLinks.forEach(l => { nodeCodes.add(l.FromIndustryCode); nodeCodes.add(l.ToIndustryCode); });

  // Build vis nodes
  const visNodes = [];
  nodeCodes.forEach(nc => {
    const ind = industriesData.find(i => i.RepCode === nc);
    if (!ind) return;
    const isCenter = nc === code;
    visNodes.push({
      id: nc,
      label: ind.NameEnglish,
      color: {
        background: isCenter ? '#1a2e4a' : sectorColor(ind.Sector),
        border: isCenter ? '#a0c4ff' : '#fff',
        highlight: { background: '#a0c4ff', border: '#1a2e4a' }
      },
      font: { color: isCenter ? '#fff' : '#222', size: isCenter ? 14 : 12 },
      size: isCenter ? 20 : 12,
      borderWidth: isCenter ? 3 : 1,
      title: `${ind.NameEnglish}\nSector: ${ind.Sector || '–'}\nStage: ${ind.ValueChainStage || '–'}`
    });
  });

  // Build vis edges
  const visEdges = relevantLinks.map((l, idx) => ({
    id: idx,
    from: l.FromIndustryCode,
    to: l.ToIndustryCode,
    label: l.Direction || '',
    arrows: l.Direction === 'Peer' ? '' : 'to',
    dashes: l.Direction === 'Peer',
    width: l.StrengthScore || 1,
    color: {
      color: l.Direction === 'Downstream' ? '#28a745' :
             l.Direction === 'Upstream'   ? '#ffc107' : '#17a2b8',
      opacity: 0.8
    },
    font: { size: 10, align: 'middle' },
    title: `${l.Direction || 'Related'} · Strength: ${l.StrengthScore || '–'}`
  }));

  // Options
  const options = {
    nodes: { shape: 'dot', font: { face: 'Segoe UI, Arial' } },
    edges: { smooth: { type: 'dynamic' }, font: { face: 'Segoe UI, Arial' } },
    physics: layout === 'hierarchical' ? { enabled: false } : {
      stabilization: { iterations: 200 },
      barnesHut: { gravitationalConstant: -4000, springLength: 120 }
    },
    layout: layout === 'hierarchical' ? {
      hierarchical: { direction: 'UD', sortMethod: 'directed', levelSeparation: 120 }
    } : {},
    interaction: { hover: true, tooltipDelay: 200 }
  };

  const container = document.getElementById('network');
  if (networkInstance) networkInstance.destroy();
  networkInstance = new vis.Network(
    container,
    { nodes: new vis.DataSet(visNodes), edges: new vis.DataSet(visEdges) },
    options
  );

  // Click a neighbor node → reload graph on that node
  networkInstance.on('click', params => {
    if (params.nodes.length > 0) {
      const clicked = params.nodes[0];
      if (clicked !== currentCode) loadGraph(clicked);
    }
  });

  // Show details in sidebar
  showDetails(center, relevantLinks);
}

function showDetails(ind, links) {
  const upstream   = links.filter(l => l.ToIndustryCode   === ind.RepCode && l.Direction === 'Downstream');
  const downstream = links.filter(l => l.FromIndustryCode === ind.RepCode && l.Direction === 'Downstream');
  const peers      = links.filter(l => l.Direction === 'Peer');

  function neighborList(arr, codeField, label) {
    if (!arr.length) return '';
    return `<div class="neighbors"><strong>${label}</strong>` +
      arr.map(l => {
        const nc = l[codeField];
        const ni = industriesData.find(i => i.RepCode === nc);
        return `<div class="neighbor-item" onclick="loadGraph('${nc}')">
          ${ni ? ni.NameEnglish : nc}
          <span class="tag ${label.includes('Upstream') ? 'dir-upstream' : label.includes('Downstream') ? 'dir-downstream' : 'dir-peer'}">${l.StrengthScore || '–'}</span>
        </div>`;
      }).join('') +
    '</div>';
  }

  document.getElementById('infoBox').innerHTML = `
    <div class="field"><span class="label">RepCode:</span> ${ind.RepCode}</div>
    <div class="field"><span class="label">Name:</span> ${ind.NameEnglish}</div>
    ${ind.NameNative ? `<div class="field"><span class="label">Native:</span> ${ind.NameNative}</div>` : ''}
    <div class="field"><span class="label">Sector:</span> ${ind.Sector || '–'}</div>
    <div class="field"><span class="label">Value Chain Stage:</span> ${ind.ValueChainStage || '–'}</div>
    ${ind.ATECOPrimary ? `<div class="field"><span class="label">ATECO:</span> ${ind.ATECOPrimary}</div>` : ''}
    ${ind.Description ? `<div class="field"><span class="label">Description:</span><br/><small>${ind.Description}</small></div>` : ''}
    ${neighborList(upstream,   'FromIndustryCode', '⬆ Upstream suppliers')}
    ${neighborList(downstream, 'ToIndustryCode',   '⬇ Downstream customers')}
    ${neighborList(peers,      'ToIndustryCode',   '↔ Peer / adjacent')}
  `;
}

// Re-render on filter change
['filterDir','filterStr','layoutSel'].forEach(id =>
  document.getElementById(id).addEventListener('change', () => {
    if (currentCode) loadGraph(currentCode);
  })
);

// Init
loadData();
