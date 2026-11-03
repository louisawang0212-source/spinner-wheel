'use strict';

(function () {
  const $ = (s) => document.querySelector(s);

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

  // 与 lib/rooms.js 的 PALETTE 保持一致（修改时需同步）
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

  let mainWheel, overlayWheel;
  let pickerEl = null;
  let overlayTimer = null;
  let toastTimer = null;
  let pendingNewWheel = false;

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

    $('#roomCode').textContent = room;
    $('#nameInput').value = state.name;

    mainWheel = new window.Wheel($('#wheelCanvas'));
    overlayWheel = new window.Wheel($('#overlayCanvas'));

    $('#spinBtn').addEventListener('click', onSpin);
    $('#nameInput').addEventListener('change', onNameChange);
    $('#copyBtn').addEventListener('click', copyShare);
    $('#addWheelBtn').addEventListener('click', onAddWheel);
    $('#addOptionBtn').addEventListener('click', onAddOption);
    $('#deleteWheelBtn').addEventListener('click', onDeleteWheel);
    $('#wheelNameInput').addEventListener('change', onRenameWheel);
    $('#clearHistoryBtn').addEventListener('click', () => window.SpinAPI.clearHistory(state.roomId));

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

    bindSocket();
    window.SpinAPI.join(state.roomId, state.name, state.participantId);
  }

  // ---------- 实时事件 ----------
  function bindSocket() {
    const A = window.SpinAPI;
    A.on('state', applyState);
    A.on('wheels', (d) => {
      state.wheels = d.wheels;
      state.wheelOrder = d.wheelOrder;
      if (!state.wheelOrder.includes(state.activeWheelId)) state.activeWheelId = state.wheelOrder[0];
      if (pendingNewWheel && state.wheelOrder.length) {
        state.activeWheelId = state.wheelOrder[state.wheelOrder.length - 1];
        pendingNewWheel = false;
        window.SpinAPI.setActiveWheel(state.roomId, state.activeWheelId);
      }
      renderWheels();
      renderOptions();
      renderMainWheel();
    });
    A.on('wheelOptions', (d) => {
      const w = state.wheels.find((x) => x.id === d.wheelId);
      if (w) w.options = d.options;
      if (d.wheelId === state.activeWheelId) renderOptions();
      else renderWheels();
      if (d.wheelId === state.activeWheelId) renderMainWheel();
    });
    A.on('participants', (d) => { state.participants = d.participants; renderParticipants(); });
    A.on('history', (d) => { state.history = d.history; renderHistory(); });
    A.on('spinStart', onSpinStart);
    A.on('spinEnd', onSpinEnd);
    A.on('error', (d) => toast(d.message || '操作失败'));

    A.socket.on('connect', () => {
      // 断线重连后重新加入（保留昵称与身份）
      window.SpinAPI.join(state.roomId, state.name, state.participantId);
    });
  }

  function applyState(d) {
    const prev = state.activeWheelId;
    state.wheels = d.wheels;
    state.wheelOrder = d.wheelOrder;
    state.participants = d.participants;
    state.history = d.history;
    if (!state.wheelOrder.includes(state.activeWheelId)) {
      state.activeWheelId = state.wheelOrder[0];
    }
    // 重连/改名后恢复之前选看的转盘
    if (prev && state.wheelOrder.includes(prev)) {
      state.activeWheelId = prev;
      window.SpinAPI.setActiveWheel(state.roomId, prev);
    }
    renderAll();
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
        window.SpinAPI.setActiveWheel(state.roomId, id);
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
    window.SpinAPI.updateOptions(state.roomId, w.id, w.options);
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
    if (!w) return;
    if (state.spinningWheels.has(w.id)) {
      toast('该转盘正在转动，请稍候');
      return;
    }
    window.SpinAPI.spin(state.roomId, w.id);
  }

  function onSpinStart(d) {
    state.spinningWheels.add(d.wheelId);
    updateSpinBtn();
    if (d.wheelId === state.activeWheelId) {
      mainWheel.spinTo(d.targetIndex, d.duration, () => mainWheel.setHighlight(d.targetIndex));
    } else {
      showOverlay(d);
    }
  }

  function onSpinEnd(d) {
    state.spinningWheels.delete(d.wheelId);
    updateSpinBtn();
    if (!state.history.find((h) => h.id === d.id)) {
      state.history.unshift(d);
      if (state.history.length > 100) state.history.length = 100;
    }
    if (d.wheelId !== state.activeWheelId) hideOverlay(d);
    renderHistory();
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
    window.SpinAPI.join(state.roomId, state.name, state.participantId);
  }

  function onAddWheel() {
    const name = prompt('给新转盘起个名字：', '新转盘');
    if (name) {
      pendingNewWheel = true;
      window.SpinAPI.createWheel(state.roomId, name);
    }
  }

  function onRenameWheel(e) {
    const w = activeWheel();
    if (w) window.SpinAPI.renameWheel(state.roomId, w.id, e.target.value.trim() || w.name);
  }

  function onDeleteWheel() {
    const w = activeWheel();
    if (w && state.wheelOrder.length > 1) {
      if (confirm('确定删除『' + w.name + '』？')) window.SpinAPI.deleteWheel(state.roomId, w.id);
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

  function copyShare() {
    navigator.clipboard.writeText(location.href)
      .then(() => toast('分享链接已复制'))
      .catch(() => toast('复制失败，请手动复制地址栏链接'));
  }

  // ---------- 实时转动浮层 ----------
  function showOverlay(d) {
    const ov = $('#overlay');
    ov.classList.add('show');
    $('#overlayText').textContent = d.by.name + ' 正在转『' + d.wheelName + '』';
    $('#overlayResult').textContent = '';
    const wheel = state.wheels.find((x) => x.id === d.wheelId);
    if (wheel) overlayWheel.setOptions(wheel.options);
    overlayWheel.spinTo(d.targetIndex, d.duration, () => overlayWheel.setHighlight(d.targetIndex));
  }
  function hideOverlay(d) {
    if (d) $('#overlayResult').textContent = d.by.name + ' 转到了 ' + d.label;
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => $('#overlay').classList.remove('show'), 2600);
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
