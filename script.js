/* Tigre da Sorte — jogo original, totalmente local e com moedas fictícias. */
(() => {
  'use strict';

  const INITIAL_BALANCE = 2000;
  const BET_VALUES = [10, 20, 50, 100, 200];
  const STORAGE_KEY = 'tigre-da-sorte-demo-v1';
  const SYMBOLS = [
    { id: 'tiger',    label: 'Tigre dourado',   image: 'assets/tiger.svg',    weight: 8,  multiplier: 18 },
    { id: 'ingot',    label: 'Ouro da sorte',   image: 'assets/ingot.svg',    weight: 12, multiplier: 12 },
    { id: 'envelope', label: 'Envelope da sorte',image:'assets/envelope.svg', weight: 16, multiplier: 8 },
    { id: 'lantern',  label: 'Lanterna',        image: 'assets/lantern.svg',  weight: 20, multiplier: 6 },
    { id: 'orange',   label: 'Laranja',         image: 'assets/orange.svg',   weight: 23, multiplier: 5 },
    { id: 'bamboo',   label: 'Bambu',           image: 'assets/bamboo.svg',   weight: 26, multiplier: 4 }
  ];
  const WIN_LINES = [
    { name: 'Linha superior', positions: [0, 1, 2] },
    { name: 'Linha central', positions: [3, 4, 5] },
    { name: 'Linha inferior', positions: [6, 7, 8] },
    { name: 'Diagonal ↘', positions: [0, 4, 8] },
    { name: 'Diagonal ↗', positions: [6, 4, 2] }
  ];
  const number = value => Math.round(value).toLocaleString('pt-BR');
  const $ = id => document.getElementById(id);
  const slots = Array.from(document.querySelectorAll('.slot'));
  const els = {
    balance: $('balance'), betAmount: $('betAmount'), betMinus: $('betMinus'), betPlus: $('betPlus'),
    spinBtn: $('spinBtn'), spinText: $('spinText'), statusText: $('statusText'),
    gameStatus: document.querySelector('.game-status'), winPanel: $('winPanel'),
    lastWin: $('lastWin'), resetBtn: $('resetBtn'), soundBtn: $('soundBtn'),
    toast: $('toast'), confetti: $('confetti'), historyList: $('historyList'),
    roundCount: $('roundCount'), bestWin: $('bestWin'),
    rulesBtn: $('rulesBtn'), closeRules: $('closeRules'),
    rulesDialog: $('rulesDialog'), understoodBtn: $('understoodBtn')
  };
  let state = { balance: INITIAL_BALANCE, betIndex: 1, rounds: 0, bestWin: 0, lastWin: 0, history: [], sound: false };
  let spinning = false;
  let audioContext = null;
  let toastTimer;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return;
      if (Number.isFinite(saved.balance) && saved.balance >= 0) state.balance = Math.floor(saved.balance);
      if (Number.isInteger(saved.betIndex) && saved.betIndex >= 0 && saved.betIndex < BET_VALUES.length) state.betIndex = saved.betIndex;
      if (Number.isInteger(saved.rounds) && saved.rounds >= 0) state.rounds = saved.rounds;
      if (Number.isFinite(saved.bestWin) && saved.bestWin >= 0) state.bestWin = Math.floor(saved.bestWin);
      if (Number.isFinite(saved.lastWin) && saved.lastWin >= 0) state.lastWin = Math.floor(saved.lastWin);
      if (Array.isArray(saved.history)) state.history = saved.history.slice(0, 5).filter(h => h && Number.isFinite(h.bet) && Number.isFinite(h.win));
      state.sound = Boolean(saved.sound);
    } catch (_) { /* Browsers can disable or clear localStorage. */ }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* Still playable. */ }
  }
  function randomInt(max) {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const buffer = new Uint32Array(1);
      window.crypto.getRandomValues(buffer);
      return Math.floor(buffer[0] / 4294967296 * max);
    }
    return Math.floor(Math.random() * max);
  }
  const totalWeight = SYMBOLS.reduce((total, item) => total + item.weight, 0);
  function pickSymbol() {
    let selection = randomInt(totalWeight);
    for (const symbol of SYMBOLS) {
      if (selection < symbol.weight) return symbol;
      selection -= symbol.weight;
    }
    return SYMBOLS[SYMBOLS.length - 1];
  }
  function playTone(freq, duration = .11, type = 'sine', vol = .027, delay = 0) {
    if (!state.sound) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContext) audioContext = new AudioCtx();
      if (audioContext.state === 'suspended') audioContext.resume();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime + delay;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(vol, now + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + .02);
    } catch (_) { /* Never interfere with gameplay for sound failures. */ }
  }
  function playWinSound() {
    [523,659,784,1047].forEach((freq,i) => playTone(freq,.23,'triangle',.039,i*.11));
  }
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('visible'), 2800);
  }
  function setStatus(text, winning = false) {
    els.statusText.textContent = text;
    els.gameStatus.classList.toggle('is-winning', winning);
  }
  function renderHistory() {
    if (!state.history.length) {
      els.historyList.innerHTML = '<li class="history-empty">Sua primeira rodada aparecerá aqui.</li>';
      return;
    }
    els.historyList.replaceChildren();
    state.history.forEach((entry,index) => {
      const li = document.createElement('li');
      const left = document.createElement('span');
      const right = document.createElement('strong');
      left.textContent = `#${state.rounds - index} · Aposta ${number(entry.bet)}`;
      right.textContent = entry.win > 0 ? `+${number(entry.win)}` : `−${number(entry.bet)}`;
      right.className = entry.win > 0 ? 'is-positive' : 'is-negative';
      li.append(left,right);
      els.historyList.append(li);
    });
  }
  function render() {
    const bet = BET_VALUES[state.betIndex];
    els.balance.textContent = number(state.balance);
    els.betAmount.textContent = number(bet);
    els.roundCount.textContent = number(state.rounds);
    els.bestWin.textContent = number(state.bestWin);
    els.lastWin.textContent = number(state.lastWin);
    els.betMinus.disabled = spinning || state.betIndex === 0;
    els.betPlus.disabled = spinning || state.betIndex === BET_VALUES.length - 1;
    els.spinBtn.disabled = spinning || state.balance < bet;
    els.resetBtn.disabled = spinning;
    els.soundBtn.classList.toggle('is-on', state.sound);
    els.soundBtn.setAttribute('aria-pressed', String(state.sound));
    els.soundBtn.setAttribute('aria-label', state.sound ? 'Desativar som' : 'Ativar som');
    renderHistory();
  }
  function updateCell(index,symbol) {
    const image = slots[index].querySelector('img');
    image.src = symbol.image;
    image.alt = symbol.label;
  }
  function clearWinStyles() {
    slots.forEach(slot => slot.classList.remove('is-winning'));
    els.winPanel.classList.remove('is-winning');
    els.gameStatus.classList.remove('is-winning');
  }
  function evaluate(grid,bet) {
    let total = 0;
    const matches = [];
    for (const line of WIN_LINES) {
      const [a,b,c] = line.positions;
      if (grid[a].id === grid[b].id && grid[b].id === grid[c].id) {
        const payout = bet * grid[a].multiplier;
        total += payout;
        matches.push({ name: line.name, positions: line.positions, payout, symbol: grid[a] });
      }
    }
    return { total, matches };
  }
  function animateReels(grid) {
    return new Promise(resolve => {
      let completed = 0;
      const animationTime = reducedMotion.matches ? 90 : 760;
      for (let column = 0; column < 3; column++) {
        const indices = [column,column+3,column+6];
        indices.forEach(index => slots[index].classList.add('is-spinning'));
        const interval = setInterval(() => indices.forEach(index => updateCell(index,pickSymbol())),85);
        setTimeout(() => {
          clearInterval(interval);
          indices.forEach(index => {
            updateCell(index,grid[index]);
            slots[index].classList.remove('is-spinning');
          });
          playTone(470 + column * 110,.11,'triangle',.028);
          completed += 1;
          if (completed === 3) resolve();
        }, animationTime + column * (reducedMotion.matches ? 50 : 310));
      }
    });
  }
  function burstConfetti() {
    if (reducedMotion.matches) return;
    const colors = ['#ffe48d','#ffab30','#ff6a5a','#fff5c6','#f7d15f'];
    for (let index = 0; index < 45; index++) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.style.left = `${randomInt(100)}%`;
      piece.style.background = colors[randomInt(colors.length)];
      piece.style.setProperty('--duration',`${1.6 + randomInt(16) / 10}s`);
      piece.style.animationDelay = `${randomInt(5) / 10}s`;
      els.confetti.append(piece);
      setTimeout(() => piece.remove(),3500);
    }
  }
  async function spin() {
    if (spinning) return;
    const bet = BET_VALUES[state.betIndex];
    if (state.balance < bet) {
      setStatus('SALDO INSUFICIENTE · RECARREGUE AS MOEDAS');
      showToast('Recarregue seu saldo virtual para continuar.');
      return;
    }
    spinning = true;
    state.balance -= bet;
    state.lastWin = 0;
    clearWinStyles();
    setStatus('GIRANDO... BOA SORTE!');
    els.spinBtn.classList.add('is-spinning');
    els.spinText.textContent = 'GIRANDO...';
    render();
    save();
    playTone(330,.15,'triangle');
    const result = Array.from({ length: 9 }, pickSymbol);
    try {
      await animateReels(result);
      const { total, matches } = evaluate(result,bet);
      state.balance += total;
      state.lastWin = total;
      state.bestWin = Math.max(state.bestWin,total);
      state.rounds += 1;
      state.history.unshift({ bet,win:total });
      state.history = state.history.slice(0,5);
      if (matches.length) {
        for (const line of matches) line.positions.forEach(position => slots[position].classList.add('is-winning'));
        els.winPanel.classList.add('is-winning');
        setStatus(matches.length > 1 ? `${matches.length} LINHAS PREMIADAS! +${number(total)} MOEDAS` : `VOCÊ GANHOU ${number(total)} MOEDAS!`,true);
        playWinSound();
        burstConfetti();
      } else {
        setStatus('NÃO FOI DESSA VEZ · TENTE NOVAMENTE!');
        playTone(240,.14,'sine',.017);
      }
    } finally {
      spinning = false;
      els.spinBtn.classList.remove('is-spinning');
      els.spinText.textContent = 'GIRAR AGORA';
      render();
      save();
      if (state.balance < BET_VALUES[state.betIndex]) showToast('Saldo baixo? Use “Recarregar saldo de teste”.');
    }
  }
  function changeBet(step) {
    if (spinning) return;
    state.betIndex = Math.min(BET_VALUES.length - 1,Math.max(0,state.betIndex + step));
    playTone(560,.06);
    render();
    save();
  }
  function resetDemo() {
    if (spinning) return;
    if (state.rounds > 0 && !window.confirm('Reiniciar o saldo e apagar o histórico de teste?')) return;
    const sound = state.sound;
    state = { balance: INITIAL_BALANCE, betIndex: 1, rounds: 0, bestWin: 0, lastWin: 0, history: [], sound };
    clearWinStyles();
    setStatus('ALINHE 3 SÍMBOLOS PARA GANHAR');
    render();
    save();
    showToast('Saldo virtual recarregado! Boa diversão.');
  }
  function openRules() { if (!els.rulesDialog.open) els.rulesDialog.showModal(); }
  function closeRules() { if (els.rulesDialog.open) els.rulesDialog.close(); }

  els.spinBtn.addEventListener('click', spin);
  els.betMinus.addEventListener('click', () => changeBet(-1));
  els.betPlus.addEventListener('click', () => changeBet(1));
  els.resetBtn.addEventListener('click', resetDemo);
  els.soundBtn.addEventListener('click', () => {
    state.sound = !state.sound;
    playTone(680,.12);
    save();
    render();
  });
  els.rulesBtn.addEventListener('click',openRules);
  els.closeRules.addEventListener('click',closeRules);
  els.understoodBtn.addEventListener('click',closeRules);
  els.rulesDialog.addEventListener('click',event => { if (event.target === els.rulesDialog) closeRules(); });
  document.addEventListener('keydown',event => {
    if (event.code !== 'Space' || event.repeat || els.rulesDialog.open) return;
    if (event.target instanceof HTMLElement && (event.target.closest('button,a,input,textarea,select') || event.target.isContentEditable)) return;
    event.preventDefault();
    spin();
  });

  $('year').textContent = new Date().getFullYear();
  restore();
  render();
})();
