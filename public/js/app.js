'use strict';

(function () {
  const $ = (s) => document.querySelector(s);

  const SPIN_DURATION = 4200; // 转动时长（毫秒），所有人一致以保证动画对齐

  const state = {
    roomId: null,
    name: null,
    participantId: null,
    wheels: [],
    wheelOrder: [],
    activeWheelId: null,
    participants: [],
    history: [],
    spinningWheels: new Set(),
    bootstrapped: false,
  };

  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function genRoomCode(len) {
    len = len || 6;
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    let s = '';
    for (let i = 0; i < len; i++) s += ALPHABET[arr[i] % ALPHABET.length];
    return s;
  }
  function genId(p) {
    return (p || 'id') + '_' + Math.random().toString(36).slice(2, 10);
  }

  // 与 realtime-peerjs.js 的 PALETTE 保持一致（修改时需同步）
  const PALETTE = [
    '#6FA8DC', '#E8B85C', '#81C7A8', '#E29BB4', '#A593D6',
    '#E8A06B', '#5FBFD0', '#C98FB0', '#9BC17A', '#D6B25E',
  ];
  // 取与上一个选项颜色不同的下一个调色板颜色，避免相邻同色
  function nextColor(existing) {
    const last = existing && existing.length ? (existing[existing.length - 1].color || null) : null;
    for (let k = 0; k < PALETTE.length; k++) {
      const c = PALETTE[(k + (existing ? existing.length : 0)) % PALETTE.length];
      if (c !== last) return c;
    }
    return PALETTE[0];
  }

  // 按权重随机返回目标扇区下标（发起者权威：谁转动谁本地计算并广播同一结果）
  function weightedPick(options) {
    const total = options.reduce((s, o) => s + Math.max(0, o.weight || 0), 0);
    if (total <= 0) return Math.floor(Math.random() * options.length);
    let r = Math.random() * total;
    for (let i = 0; i < options.length; i++) {
      const w = Math.max(0, options[i].weight || 0);
      r -= w;
      if (r < 0) return i;
    }
    return options.length - 1;
  }

  let mainWheel, overlayWheel;
  let pickerEl = null;
  let overlayTimer = null;
  let toastTimer = null;

  // ---------- 初始化 ----------
  function init() {
    const params = new URLSearchParams(location.search);
    let room = params.get('room');
    if (!room) {
      room = genRoomCode(6);
      const url = new URL(location.href);
      url.searchParams.set('room', room);
      history.replaceState(null, '', url.toString());
    }
    state.roomId = room;

    state.participantId = sessionStorage.getItem('sw_pid') || genId('u');
    sessionStorage.setItem('sw_pid', state.participantId);
    state.name = sessionStorage.getItem('sw_name') || ('访客' + Math.floor(1000 + Math.random() * 9000));
    sessionStorage.setItem('sw_name', state.name);

    $('#roomCodeText').textContent = room;
    $('#nameInput').value = state.name;

    mainWheel = new window.Wheel($('#wheelCanvas'));
    overlayWheel = new window.Wheel($('#overlayCanvas'));

    $('#spinBtn').addEventListener('click', onSpin);
    $('#nameInput').addEventListener('change', onNameChange);
    $('#copyBtn').addEventListener('click', copyShare);
    $('#roomCode').addEventListener('click', onJoinByCode);
    $('#addWheelBtn').addEventListener('click', onAddWheel);
    $('#addOptionBtn').addEventListener('click', onAddOption);
    $('#deleteWheelBtn').addEventListener('click', onDeleteWheel);
    $('#wheelNameInput').addEventListener('change', onRenameWheel);
    $('#clearHistoryBtn').addEventListener('click', onClearHistory);

    // 移动端：编辑面板底部抽屉
    const mobileEditBtn = $('#mobileEditBtn');
    const drawerBackdrop = $('#drawerBackdrop');
    const panelEl = $('.panel');
    const openDrawer = () => { panelEl.classList.add('drawer-open'); drawerBackdrop.classList.add('show'); };
    const closeDrawer = () => { panelEl.classList.remove('drawer-open'); drawerBackdrop.classList.remove('show'); };
    mobileEditBtn.addEventListener('click', openDrawer);
    drawerBackdrop.addEventListener('click', closeDrawer);

    window.addEventListener('resize', () => {
      mainWheel.resize();
      mainWheel.draw();
      if ($('#overlay').classList.contains('show')) { overlayWheel.resize(); overlayWheel.draw(); }
    });

    // 先用本地缓存（或默认转盘）立即渲染，避免等待实时通道就绪时出现空白页；
    // 此时尚未“锁定”状态，连上房间后若拿到权威快照会覆盖它。
    applySnapshot(loadCache(state.roomId) || defaultRoomState());
    // 先把自己放进在线列表，实时在线状态到达后再被真实列表替换
    state.participants = [{
      id: state.participantId,
      name: state.name,
      activeWheelId: state.activeWheelId,
      color: '#C9A86A',
    }];
    renderAll();

    bindRealtime();
    window.SpinAPI.join(state.roomId, state.name, state.participantId);
  }

  // ---------- 实时事件 ----------
  function bindRealtime() {
    const A = window.SpinAPI;
    A.on('ready', () => {
      A.setActiveWheel(state.activeWheelId);
      bootstrap();
    });
    A.on('wheels', (d) => {
      state.wheels = d.wheels;
      state.wheelOrder = d.wheelOrder;
      if (!state.wheelOrder.includes(state.activeWheelId)) state.activeWheelId = state.wheelOrder[0];
      renderWheels();
      renderOptions();
      renderMainWheel();
      saveCache();
    });
    A.on('wheelOptions', (d) => {
      const w = state.wheels.find((x) => x.id === d.wheelId);
      if (w) w.options = d.options;
      if (d.wheelId === state.activeWheelId) renderOptions();
      else renderWheels();
      if (d.wheelId === state.activeWheelId) renderMainWheel();
      saveCache();
    });
    A.on('participants', (d) => { state.participants = d; renderParticipants(); });
    A.on('history', (d) => { state.history = d.history; renderHistory(); });
    A.on('spinStart', doSpinStart);
    A.on('spinEnd', onSpinEnd);
    A.on('clearHistory', () => { state.history = []; renderHistory(); saveCache(); });
    A.on('state', onState);
    A.on('requestState', onRequestState);
    A.on('disconnected', () => { state.bootstrapped = false; });
  }

  // ---------- 状态自举（无服务器，靠房间内成员互相同步快照） ----------
  function bootstrap() {
    if (state.bootstrapped) return;
    // 界面已在 init 时用缓存/默认值渲染过，这里只负责向房间索取权威快照
    window.SpinAPI.requestState();
    // 若房间无人回应（说明自己是房间里第一个），超时后以当前状态为准并广播出去
    setTimeout(() => {
      if (state.bootstrapped) return;
      state.bootstrapped = true;
      window.SpinAPI.broadcastWheels(state.wheels, state.wheelOrder);
      renderAll();
      saveCache();
    }, 2500);
  }

  function onState(snap) {
    if (state.bootstrapped) return; // 已确定状态后不再被覆盖
    applySnapshot(snap);
    state.bootstrapped = true;
    renderAll();
    saveCache();
  }

  function onRequestState() {
    if (state.bootstrapped && state.wheels.length) {
      window.SpinAPI.respondState({ wheels: state.wheels, wheelOrder: state.wheelOrder, history: state.history });
    }
  }

  function applySnapshot(snap) {
    state.wheels = snap.wheels || [];
    state.wheelOrder = snap.wheelOrder || [];
    state.history = snap.history || [];
    if (!state.wheelOrder.includes(state.activeWheelId)) state.activeWheelId = state.wheelOrder[0] || null;
  }

  function defaultRoomState() {
    const wId = genId('wheel');
    return {
      wheels: [{ id: wId, name: '我的转盘', options: defaultOptions() }],
      wheelOrder: [wId],
      history: [],
    };
  }
  function defaultOptions() {
    return [
      { id: genId('opt'), label: '选项一', color: PALETTE[0], weight: 1, icon: 'star' },
      { id: genId('opt'), label: '选项二', color: PALETTE[2], weight: 1, icon: 'gift' },
    ];
  }

  // ---------- 本地缓存（刷新/重连后恢复视图） ----------
  function cacheKey() { return 'sw_room_' + state.roomId; }
  function saveCache() {
    try {
      localStorage.setItem(cacheKey(), JSON.stringify({
        wheels: state.wheels, wheelOrder: state.wheelOrder, history: state.history,
      }));
    } catch (e) { /* 忽略配额错误 */ }
  }
  function loadCache() {
    try {
      const raw = localStorage.getItem(cacheKey());
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // ---------- 渲染 ----------
  function renderAll() {
    renderWheels();
    renderOptions();
    renderMainWheel();
    renderParticipants();
    renderHistory();
  }

  function activeWheel() {
    return state.wheels.find((w) => w.id === state.activeWheelId) || state.wheels[0];
  }

  function renderWheels() {
    const list = $('#wheelList');
    list.innerHTML = '';
    state.wheelOrder.forEach((id) => {
      const w = state.wheels.find((x) => x.id === id);
      if (!w) return;
      const chip = document.createElement('button');
      chip.className = 'wheel-chip' + (id === state.activeWheelId ? ' active' : '');
      chip.textContent = w.name;
      chip.addEventListener('click', () => {
        state.activeWheelId = id;
        window.SpinAPI.setActiveWheel(id);
        renderWheels();
        renderOptions();
        renderMainWheel();
      });
      list.appendChild(chip);
    });
  }

  function renderOptions() {
    const w = activeWheel();
    $('#wheelNameInput').value = w ? w.name : '';
    $('#deleteWheelBtn').style.display = state.wheelOrder.length > 1 ? '' : 'none';
    const list = $('#optionsList');
    list.innerHTML = '';
    if (!w) return;
    w.options.forEach((opt, idx) => {
      const row = document.createElement('div');
      row.className = 'opt-row';

      const iconBtn = document.createElement('button');
      iconBtn.className = 'icon-btn';
      iconBtn.innerHTML = (opt.icon && window.ICON_LIBRARY)
        ? window.getIconSVG(opt.icon, '#C9A86A')
        : '<span class="plus">+</span>';
      iconBtn.addEventListener('click', (e) => openIconPicker(e, (key) => {
        opt.icon = key;
        emitOptions(w);
        renderOptions();
        renderMainWheel();
      }));

      const label = document.createElement('input');
      label.className = 'opt-label';
      label.value = opt.label;
      label.placeholder = '选项内容';
      label.addEventListener('change', () => { opt.label = label.value; emitOptions(w); renderMainWheel(); });

      const color = document.createElement('input');
      color.type = 'color';
      color.value = opt.color || '#C9A86A';
      color.className = 'opt-color';
      color.addEventListener('change', () => { opt.color = color.value; emitOptions(w); renderMainWheel(); });

      const weight = document.createElement('input');
      weight.type = 'number';
      weight.min = '0.01';
      weight.step = '0.01';
      weight.value = opt.weight;
      weight.className = 'opt-weight';
      weight.title = '权重（概率，越大越容易抽到）';
      weight.addEventListener('change', () => {
        opt.weight = Math.max(0.0001, Number(weight.value) || 1);
        emitOptions(w);
      });

      const del = document.createElement('button');
      del.className = 'opt-del';
      del.textContent = '×';
      del.addEventListener('click', () => {
        w.options.splice(idx, 1);
        emitOptions(w);
        renderOptions();
        renderMainWheel();
      });

      row.append(iconBtn, label, color, weight, del);
      list.appendChild(row);
    });
  }

  function emitOptions(w) {
    w.options.forEach((o) => { if (!o.id) o.id = genId('opt'); });
    window.SpinAPI.broadcastWheelOptions(w.id, w.options);
    saveCache();
  }

  function renderMainWheel() {
    const w = activeWheel();
    $('#activeWheelName').textContent = w ? w.name : '';
    if (w && !mainWheel.spinning) mainWheel.setOptions(w.options);
    updateSpinBtn();
  }

  function renderParticipants() {
    const list = $('#participantsList');
    list.innerHTML = '';
    state.participants.forEach((p) => {
      const el = document.createElement('div');
      el.className = 'participant';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color || '#C9A86A';
      const name = document.createElement('span');
      name.textContent = p.name + (p.id === state.participantId ? '（我）' : '');
      const viewing = document.createElement('span');
      viewing.className = 'viewing';
      const wname = (state.wheels.find((x) => x.id === p.activeWheelId) || {}).name;
      viewing.textContent = wname ? '· 看 ' + wname : '';
      el.append(dot, name, viewing);
      list.appendChild(el);
    });
  }

  function renderHistory() {
    const list = $('#historyList');
    list.innerHTML = '';
    if (!state.history.length) {
      list.innerHTML = '<div class="empty">还没有转动记录</div>';
      return;
    }
    state.history.forEach((h) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      const who = document.createElement('span');
      who.className = 'h-who';
      who.textContent = h.by.name;
      const txt = document.createElement('span');
      txt.className = 'h-txt';
      txt.textContent = ' 在『' + h.wheelName + '』转到了 ';
      const res = document.createElement('span');
      res.className = 'h-res';
      res.textContent = h.label;
      el.append(who, txt, res);
      if (h.icon && window.ICON_LIBRARY) {
        const ic = document.createElement('span');
        ic.innerHTML = window.getIconSVG(h.icon, '#C9A86A');
        el.appendChild(ic);
      }
      const time = document.createElement('span');
      time.className = 'h-time';
      time.textContent = fmtTime(h.ts);
      el.appendChild(time);
      list.appendChild(el);
    });
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    const p = (n) => n.toString().padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // ---------- 动作 ----------
  function onSpin() {
    const w = activeWheel();
    if (!w || !w.options.length) return;
    if (state.spinningWheels.has(w.id)) {
      toast('该转盘正在转动，请稍候');
      return;
    }
    const targetIndex = weightedPick(w.options);
    const by = { id: state.participantId, name: state.name };
    // 本地立即播放（自己收不到自己广播的 spinStart，因为 self:false）
    doSpinStart({ wheelId: w.id, targetIndex, duration: SPIN_DURATION, by });
    window.SpinAPI.broadcastSpinStart({ wheelId: w.id, targetIndex, duration: SPIN_DURATION, by });
  }

  // 播放转动动画（发起者与接收者共用，但只有发起者 finishSpin）
  function doSpinStart(d) {
    state.spinningWheels.add(d.wheelId);
    updateSpinBtn();
    if (d.wheelId === state.activeWheelId) {
      mainWheel.spinTo(d.targetIndex, d.duration, () => {
        mainWheel.setHighlight(d.targetIndex);
        if (d.by.id === state.participantId) finishSpin(d);
      });
    } else {
      showOverlay(d);
    }
  }

  // 发起者动画结束后：本地记录 + 广播结果
  function finishSpin(d) {
    const w = state.wheels.find((x) => x.id === d.wheelId);
    const opt = w && w.options[d.targetIndex];
    const item = {
      id: genId('h'),
      wheelId: d.wheelId,
      targetIndex: d.targetIndex,
      label: opt ? opt.label : '',
      wheelName: w ? w.name : '',
      icon: opt ? opt.icon : null,
      by: d.by,
      ts: Date.now(),
    };
    applyHistoryItem(item);
    window.SpinAPI.broadcastSpinEnd(item);
  }

  function onSpinEnd(item) {
    state.spinningWheels.delete(item.wheelId);
    updateSpinBtn();
    applyHistoryItem(item);
  }

  function applyHistoryItem(item) {
    if (!state.history.find((h) => h.id === item.id)) {
      state.history.unshift(item);
      if (state.history.length > 100) state.history.length = 100;
      renderHistory();
      saveCache();
    }
  }

  function updateSpinBtn() {
    const btn = $('#spinBtn');
    const w = activeWheel();
    if (w && state.spinningWheels.has(w.id)) {
      btn.disabled = true;
      btn.textContent = '转动中…';
    } else {
      btn.disabled = false;
      btn.textContent = w ? '转动『' + w.name + '』' : '转动';
    }
  }

  function onNameChange(e) {
    state.name = e.target.value.trim() || state.name;
    sessionStorage.setItem('sw_name', state.name);
    window.SpinAPI.setName(state.name);
  }

  function onAddWheel() {
    const name = prompt('给新转盘起个名字：', '新转盘');
    if (!name) return;
    const id = genId('wheel');
    state.wheels.push({ id, name, options: defaultOptions() });
    state.wheelOrder.push(id);
    state.activeWheelId = id;
    window.SpinAPI.broadcastWheels(state.wheels, state.wheelOrder);
    window.SpinAPI.setActiveWheel(id);
    renderWheels();
    renderOptions();
    renderMainWheel();
    saveCache();
  }

  function onRenameWheel(e) {
    const w = activeWheel();
    if (w) {
      w.name = e.target.value.trim() || w.name;
      window.SpinAPI.broadcastWheels(state.wheels, state.wheelOrder);
      renderWheels();
      saveCache();
    }
  }

  function onDeleteWheel() {
    const w = activeWheel();
    if (w && state.wheelOrder.length > 1) {
      if (!confirm('确定删除『' + w.name + '』？')) return;
      const idx = state.wheelOrder.indexOf(w.id);
      state.wheelOrder = state.wheelOrder.filter((id) => id !== w.id);
      state.wheels = state.wheels.filter((x) => x.id !== w.id);
      if (!state.wheelOrder.includes(state.activeWheelId)) state.activeWheelId = state.wheelOrder[0];
      window.SpinAPI.broadcastWheels(state.wheels, state.wheelOrder);
      window.SpinAPI.setActiveWheel(state.activeWheelId);
      renderWheels();
      renderOptions();
      renderMainWheel();
      saveCache();
    }
  }

  function onAddOption() {
    const w = activeWheel();
    if (!w) return;
    w.options.push({ id: genId('opt'), label: '新选项', color: nextColor(w.options), weight: 1, icon: null });
    emitOptions(w);
    renderOptions();
    renderMainWheel();
  }

  function onClearHistory() {
    state.history = [];
    window.SpinAPI.broadcastClearHistory();
    renderHistory();
    saveCache();
  }

  function copyShare() {
    navigator.clipboard.writeText(location.href)
      .then(() => toast('分享链接已复制'))
      .catch(() => toast('复制失败，请手动复制地址栏链接'));
  }

  // 手动输入房间号加入朋友的转盘（手机端从顶部"加入"入口点开）
  function onJoinByCode() {
    const input = window.prompt('输入朋友的 6 位房间号：', state.roomId);
    if (input === null) return;
    const code = String(input).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) return;
    if (code.length !== 6) { toast('房间号是 6 位字符'); return; }
    if (code === state.roomId) { toast('你已经在房间里了'); return; }
    saveCache();
    const url = new URL(location.href);
    url.searchParams.set('room', code);
    location.href = url.toString();
  }

  // ---------- 实时转动浮层 ----------
  function showOverlay(d) {
    const ov = $('#overlay');
    ov.classList.add('show');
    $('#overlayText').textContent = d.by.name + ' 正在转『' + d.wheelName + '』';
    $('#overlayResult').textContent = '';
    const wheel = state.wheels.find((x) => x.id === d.wheelId);
    if (wheel) overlayWheel.setOptions(wheel.options);
    overlayWheel.spinTo(d.targetIndex, d.duration, () => {
      overlayWheel.setHighlight(d.targetIndex);
      const opt = wheel && wheel.options[d.targetIndex];
      $('#overlayResult').textContent = d.by.name + ' 转到了 ' + (opt ? opt.label : '');
      clearTimeout(overlayTimer);
      overlayTimer = setTimeout(() => ov.classList.remove('show'), 2600);
    });
  }

  // ---------- 图标选择器 ----------
  function openIconPicker(evt, onPick) {
    closeIconPicker();
    const grid = document.createElement('div');
    const isMobile = window.innerWidth <= 860;
    grid.className = 'icon-picker' + (isMobile ? ' mobile' : '');
    const none = document.createElement('button');
    none.className = 'picker-item';
    none.innerHTML = '<span class="plus">无</span>';
    none.addEventListener('click', () => { onPick(null); closeIconPicker(); });
    grid.appendChild(none);
    Object.keys(window.ICON_LIBRARY).forEach((key) => {
      const b = document.createElement('button');
      b.className = 'picker-item';
      b.innerHTML = window.getIconSVG(key, '#C9A86A');
      b.addEventListener('click', () => { onPick(key); closeIconPicker(); });
      grid.appendChild(b);
    });
    document.body.appendChild(grid);
    if (!isMobile) {
      const r = evt.currentTarget.getBoundingClientRect();
      grid.style.top = (window.scrollY + r.bottom + 6) + 'px';
      grid.style.left = (window.scrollX + r.left) + 'px';
    }
    pickerEl = grid;
    setTimeout(() => document.addEventListener('click', closeIconPicker), 0);
  }
  function closeIconPicker() {
    if (pickerEl) {
      pickerEl.remove();
      pickerEl = null;
      document.removeEventListener('click', closeIconPicker);
    }
  }

  // ---------- Toast ----------
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
