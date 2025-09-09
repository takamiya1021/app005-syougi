const SENTE = 1, GOTE = -1;
let state = null;
let selectedFrom = null; // {x,y}
let selectedDrop = null; // 'P','L',...

function usiFromXY(x, y) {
  const file = 9 - x;
  const rank = String.fromCharCode('a'.charCodeAt(0) + y);
  return `${file}${rank}`;
}

function xyFromUSI(usi2) {
  const file = parseInt(usi2[0], 10);
  const rank = usi2[1];
  return { x: 9 - file, y: rank.charCodeAt(0) - 'a'.charCodeAt(0) };
}

function pieceLabel(p) {
  const names = {
    1: '歩', 2: '香', 3: '桂', 4: '銀', 5: '金', 6: '角', 7: '飛', 8: '玉',
    9: 'と', 10: '成香', 11: '成桂', 12: '成銀', 13: '馬', 14: '竜',
  };
  const side = p > 0 ? 'sente' : 'gote';
  const base = Math.abs(p);
  return { text: names[base] || '?', side };
}

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  // 画面は x:8..0 を左->右で描画（日本式の9筋->1筋）
  for (let y = 0; y < 9; y++) {
    for (let rx = 8; rx >= 0; rx--) {
      const x = rx; // 内部座標
      const sq = document.createElement('div');
      sq.className = `sq ${(x + y) % 2 ? 'dark' : 'light'}`;
      sq.dataset.x = x; sq.dataset.y = y;
      // 駒
      const p = state.board[x][y];
      if (p !== 0) {
        const span = document.createElement('span');
        const lab = pieceLabel(p);
        span.textContent = (p > 0 ? '▲' : '△') + lab.text;
        span.className = `piece ${lab.side}`;
        sq.appendChild(span);
      }
      sq.addEventListener('click', () => onSquareClick(x, y, sq));
      board.appendChild(sq);
    }
  }
  renderHands();
  renderStatus();
  renderLegalList();
}

function renderStatus() {
  const st = document.getElementById('status');
  const turn = state.side === SENTE ? '先手(▲)' : '後手(△)';
  st.textContent = `手番: ${turn}` + (state.over ? ` / 終局: ${state.over}` : '');
}

function renderHands() {
  const sList = document.getElementById('hand-sente-list');
  const gList = document.getElementById('hand-gote-list');
  sList.innerHTML = '';
  gList.innerHTML = '';
  const order = [7,6,5,4,3,2,1]; // 飛角金銀桂香歩
  const map = { 'R':'飛', 'B':'角', 'G':'金', 'S':'銀', 'N':'桂', 'L':'香', 'P':'歩' };
  const letterById = {1:'P',2:'L',3:'N',4:'S',5:'G',6:'B',7:'R'};
  for (const side of [SENTE, GOTE]) {
    const hands = state.hands[String(side)] || {};
    for (const pid of order) {
      const cnt = hands[pid] || 0;
      if (!cnt) continue;
      const btn = document.createElement('button');
      const letter = letterById[pid];
      btn.className = 'hand-btn' + (selectedDrop === letter ? ' sel' : '');
      btn.textContent = (side === SENTE ? '▲' : '△') + map[letter] + ` x${cnt}`;
      btn.addEventListener('click', () => onHandClick(letter));
      (side === SENTE ? sList : gList).appendChild(btn);
    }
  }
}

function renderLegalList() {
  const pre = document.getElementById('legal');
  pre.textContent = state.legal.join('\n');
}

function clearHighlights() {
  document.querySelectorAll('.sq.sel, .sq.hi').forEach(e => e.classList.remove('sel', 'hi'));
  document.querySelectorAll('.hand-btn.sel').forEach(e => e.classList.remove('sel'));
}

function highlightMovesFrom(srcUSI) {
  const dests = new Set();
  for (const u of state.legal) {
    if (u.startsWith(srcUSI)) {
      // u: srcdst or srcdst+
      const dst = u.slice(2, 4);
      dests.add(dst);
    }
  }
  for (const d of dests) {
    const { x, y } = xyFromUSI(d);
    const sq = findSquare(x, y);
    if (sq) sq.classList.add('hi');
  }
}

function highlightDrops(letter) {
  const dests = new Set();
  for (const u of state.legal) {
    if (u.startsWith(letter + '*')) {
      const dst = u.split('*')[1];
      dests.add(dst);
    }
  }
  for (const d of dests) {
    const { x, y } = xyFromUSI(d);
    const sq = findSquare(x, y);
    if (sq) sq.classList.add('hi');
  }
}

function findSquare(x, y) {
  return document.querySelector(`.sq[data-x="${x}"][data-y="${y}"]`);
}

function onSquareClick(x, y, el) {
  if (state.over) return;
  const p = state.board[x][y];
  const side = state.side;
  const srcUSI = usiFromXY(x, y);

  // ドロップ待ち → ここに打つ
  if (selectedDrop) {
    const u = `${selectedDrop}*${srcUSI}`;
    if (!state.legal.includes(u)) return; // 合法手以外は無視
    playUSI(u);
    selectedDrop = null;
    clearHighlights();
    return;
  }

  // すでにfrom選択済み → to として解釈
  if (selectedFrom) {
    const from = usiFromXY(selectedFrom.x, selectedFrom.y);
    let u = from + srcUSI;
    const plus = from + srcUSI + '+';
    const hasPlain = state.legal.includes(u);
    const hasProm = state.legal.includes(plus);
    if (!hasPlain && !hasProm) {
      // 別の自駒を選び直し
      selectedFrom = null;
      clearHighlights();
      if (p * side > 0) {
        selectedFrom = { x, y };
        el.classList.add('sel');
        highlightMovesFrom(srcUSI);
      }
      return;
    }
    if (hasPlain && hasProm) {
      if (confirm('成りますか？')) u = plus; // 成り
    } else if (hasProm) {
      u = plus; // 強制成り
    }
    playUSI(u);
    selectedFrom = null;
    clearHighlights();
    return;
  }

  // from 未選択 → 自駒なら選択して候補ハイライト
  if (p * side > 0) {
    selectedFrom = { x, y };
    clearHighlights();
    el.classList.add('sel');
    highlightMovesFrom(srcUSI);
  }
}

function onHandClick(letter) {
  if (state.over) return;
  selectedFrom = null;
  clearHighlights();
  selectedDrop = letter;
  highlightDrops(letter);
  // ボタンも選択表示
  document.querySelectorAll('.hand-btn').forEach(btn => {
    if (btn.textContent.includes('飛') && letter === 'R') btn.classList.add('sel');
    if (btn.textContent.includes('角') && letter === 'B') btn.classList.add('sel');
    if (btn.textContent.includes('金') && letter === 'G') btn.classList.add('sel');
    if (btn.textContent.includes('銀') && letter === 'S') btn.classList.add('sel');
    if (btn.textContent.includes('桂') && letter === 'N') btn.classList.add('sel');
    if (btn.textContent.includes('香') && letter === 'L') btn.classList.add('sel');
    if (btn.textContent.includes('歩') && letter === 'P') btn.classList.add('sel');
  });
}

async function playUSI(usi) {
  const res = await fetch('/api/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usi }) });
  const js = await res.json();
  if (!res.ok || !js.ok) {
    alert('指し手エラー: ' + (js.error || res.statusText));
    return;
  }
  state = js.state;
  renderBoard();
}

async function aiMove() {
  const res = await fetch('/api/ai_move', { method: 'POST' });
  const js = await res.json();
  if (!res.ok || !js.ok) {
    alert('AIエラー: ' + (js.error || res.statusText));
    return;
  }
  state = js.state;
  renderBoard();
}

async function resetGame() {
  const res = await fetch('/api/reset', { method: 'POST' });
  const js = await res.json();
  state = js.state;
  selectedFrom = null; selectedDrop = null;
  renderBoard();
}

async function loadState() {
  const [cfgRes, stRes] = await Promise.all([
    fetch('/api/config'),
    fetch('/api/state'),
  ]);
  const cfg = await cfgRes.json();
  state = await stRes.json();
  document.getElementById('ai-side').value = cfg.ai_side;
  document.getElementById('ai-depth').value = cfg.ai_depth;
  renderBoard();
}

async function saveConfig() {
  const ai_side = document.getElementById('ai-side').value;
  const ai_depth = parseInt(document.getElementById('ai-depth').value, 10) || 3;
  await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ai_side, ai_depth }) });
}

function bindUI() {
  document.getElementById('send-move').addEventListener('click', async () => {
    const u = document.getElementById('usi').value.trim();
    if (u) await playUSI(u);
  });
  document.getElementById('ai-move').addEventListener('click', aiMove);
  document.getElementById('reset').addEventListener('click', resetGame);
  document.getElementById('save-config').addEventListener('click', async () => { await saveConfig(); await loadState(); })
}

window.addEventListener('DOMContentLoaded', async () => {
  bindUI();
  await loadState();
});

