'use strict';

// 纯前端实时层：用 PeerJS 公共信令做 P2P 实时同步，无需注册账号、无需配置 key。
// 架构：同一房间第一个打开的人充当“主机(hub)”，其余人连接主机；主机负责中转广播与在线状态。
// 主机离开时，剩余成员自动重新选举出新主机，房间继续可用。
// 暴露 window.SpinAPI（事件名/方法与旧版兼容），app.js 维持本地状态并通过 broadcast 同步。
(function () {
  const handlers = {};
  const on = (ev, cb) => { (handlers[ev] = handlers[ev] || []).push(cb); };
  const emitLocal = (ev, data) => { (handlers[ev] || []).forEach((cb) => { try { cb(data); } catch (e) { console.error(e); } }); };

  const PALETTE = ['#6FA8DC', '#E8B85C', '#81C7A8', '#E29BB4', '#A593D6', '#E8A06B', '#5FBFD0', '#C98FB0', '#9BC17A', '#D6B25E'];
  function colorFor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  const EXCLUDE_RELAY = { requestState: true }; // 该事件仅主机处理，不中转

  let roomId = null;
  let me = null;
  let peer = null;          // 当前 Peer（hub 或 client）
  let role = null;          // 'hub' | 'client'
  let hubConn = null;       // client：与主机的连接
  let clientConns = [];     // hub：与各客户端的连接
  let participants = {};    // hub：id -> { user, last }
  let connectTimer = null;
  let readyFired = false;
  let hbTimer = null;

  const hubId = () => 'sw-hub-' + roomId.toUpperCase();
  const clientId = () => 'sw-c-' + roomId.toUpperCase() + '-' + Math.random().toString(36).slice(2, 8);

  function destroyPeer(p) { try { if (p && p.destroy) p.destroy(); } catch (e) { /* ignore */ } }
  function sendTo(conn, msg) { try { if (conn && conn.open) conn.send(msg); } catch (e) { /* ignore */ } }

  // ---------- 启动：先尝试当主机，失败则当客户端 ----------
  function start() {
    readyFired = false;
    if (!window.Peer) { console.error('PeerJS 未加载（需要联网）'); return; }
    const p = new Peer(hubId());
    peer = p;
    p.on('open', () => becomesHub(p));
    p.on('error', (err) => {
      if (err && err.type === 'unavailable-id') {
        destroyPeer(p);
        becomesClient();
      } else {
        destroyPeer(p);
        setTimeout(start, 1200);
      }
    });
  }

  function becomesHub(p) {
    role = 'hub';
    peer = p;
    clientConns = [];
    participants = {};
    p.on('connection', (conn) => onClientConnection(conn));
    p.on('error', (err) => { console.warn('hub err', err); });
    fireReady();
  }

  function onClientConnection(conn) {
    conn.on('open', () => {
      clientConns.push(conn);
      conn.metaUserId = null;
      conn.on('data', (msg) => onHubData(conn, msg));
      conn.on('close', () => removeClient(conn));
      conn.on('error', () => removeClient(conn));
      sendTo(conn, { t: 'participants', list: participantsList() });
    });
  }

  function removeClient(conn) {
    if (conn && conn.metaUserId) delete participants[conn.metaUserId];
    clientConns = clientConns.filter((c) => c !== conn);
    broadcastParticipants();
  }

  function onHubData(conn, msg) {
    if (!msg || !msg.t) return;
    if (msg.t === 'hello' || msg.t === 'presence') {
      if (msg.user && msg.user.id) {
        conn.metaUserId = msg.user.id;
        upsertUser(msg.user);
      }
      return;
    }
    if (msg.t === 'ev') {
      const ev = msg.ev;
      const payload = msg.payload;
      emitLocal(ev, payload); // 主机本地也要响应（如别人转动时显示浮层）
      if (!EXCLUDE_RELAY[ev]) {
        clientConns.forEach((c) => { if (c !== conn) sendTo(c, msg); });
      }
    }
  }

  function becomesClient() {
    role = 'client';
    const p = new Peer(clientId());
    peer = p;
    const conn = p.connect(hubId(), { reliable: true });
    hubConn = conn;
    conn.on('open', () => {
      sendTo(conn, { t: 'hello', user: Object.assign({}, me) });
      fireReady();
    });
    conn.on('data', (msg) => onClientData(msg));
    conn.on('close', () => onHubLost());
    conn.on('error', () => onHubLost());
    p.on('error', (err) => {
      if (err && err.type === 'unavailable-id') { destroyPeer(p); becomesClient(); }
      else { onHubLost(); }
    });
    startHeartbeat();
  }

  function onHubLost() {
    role = null;
    hubConn = null;
    stopHeartbeat();
    emitLocal('disconnected', {});
    clearTimeout(connectTimer);
    connectTimer = setTimeout(() => { destroyPeer(peer); start(); }, 300 + Math.random() * 900);
  }

  function onClientData(msg) {
    if (!msg || !msg.t) return;
    if (msg.t === 'participants') { emitLocal('participants', msg.list || []); return; }
    if (msg.t === 'ev') emitLocal(msg.ev, msg.payload);
  }

  function relayOut(ev, payload) {
    const msg = { t: 'ev', ev, payload };
    if (role === 'hub') clientConns.forEach((c) => sendTo(c, msg));
    else if (role === 'client' && hubConn) sendTo(hubConn, msg);
  }

  function upsertUser(user) {
    if (user && user.id) { participants[user.id] = { user, last: Date.now() }; broadcastParticipants(); }
  }
  function broadcastParticipants() {
    const list = participantsList();
    clientConns.forEach((c) => sendTo(c, { t: 'participants', list }));
  }
  function participantsList() {
    const now = Date.now();
    const arr = [];
    Object.keys(participants).forEach((id) => {
      const e = participants[id];
      if (now - e.last < 60000) arr.push(e.user);
    });
    if (me && !arr.find((u) => u.id === me.id)) arr.push(Object.assign({}, me));
    return arr;
  }

  function startHeartbeat() {
    stopHeartbeat();
    hbTimer = setInterval(() => { if (role === 'client' && hubConn) sendTo(hubConn, { t: 'presence', user: Object.assign({}, me) }); }, 15000);
  }
  function stopHeartbeat() { if (hbTimer) { clearInterval(hbTimer); hbTimer = null; } }

  function fireReady() { if (readyFired) return; readyFired = true; emitLocal('ready', {}); }

  function updateSelf() {
    if (!me) return;
    if (role === 'hub') upsertUser(Object.assign({}, me));
    else if (role === 'client' && hubConn) sendTo(hubConn, { t: 'presence', user: Object.assign({}, me) });
  }

  // ---------- 对外 API（与 app.js 兼容） ----------
  function join(rid, name, pid) {
    roomId = rid;
    me = { id: pid, name, activeWheelId: null, color: colorFor(pid) };
    start();
  }

  const api = {
    configured: true,
    on,
    join,
    setActiveWheel: (id) => { if (!me) return; me.activeWheelId = id; updateSelf(); },
    setName: (name) => { if (!me) return; me.name = name; updateSelf(); },
    broadcastWheels: (wheels, wheelOrder) => relayOut('wheels', { wheels, wheelOrder }),
    broadcastWheelOptions: (wheelId, options) => relayOut('wheelOptions', { wheelId, options }),
    broadcastSpinStart: (p) => relayOut('spinStart', p),
    broadcastSpinEnd: (p) => relayOut('spinEnd', p),
    broadcastClearHistory: () => relayOut('clearHistory', {}),
    requestState: () => relayOut('requestState', {}),
    respondState: (snap) => relayOut('state', snap),
  };

  window.SpinAPI = api;
})();
