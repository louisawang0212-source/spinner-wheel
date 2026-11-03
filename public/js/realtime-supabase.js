'use strict';

// 纯前端实时层：用 Supabase Realtime 的 Broadcast + Presence 替代 Socket.IO 服务器。
// 暴露 window.SpinAPI（事件名与旧的 socket-client 兼容），由 app.js 维护本地状态并通过 broadcast 同步。
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const URL = cfg.URL || '';
  const KEY = cfg.ANON_KEY || '';
  const configured = !!(URL && KEY && window.supabase);

  const handlers = {};
  const on = (ev, cb) => { (handlers[ev] = handlers[ev] || []).push(cb); };
  const emitLocal = (ev, data) => { (handlers[ev] || []).forEach((cb) => cb(data)); };

  const PALETTE = ['#6FA8DC', '#E8B85C', '#81C7A8', '#E29BB4', '#A593D6', '#E8A06B', '#5FBFD0', '#C98FB0', '#9BC17A', '#D6B25E'];
  function colorFor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  let client = null;
  let channel = null;
  let me = null; // { id, name, activeWheelId, color }
  let subscribed = false;

  function ensureClient() {
    if (client) return client;
    client = window.supabase.createClient(URL, KEY);
    return client;
  }

  function getParticipants() {
    if (!channel) return [];
    const st = channel.presenceState();
    const map = {};
    Object.keys(st).forEach((k) => {
      (st[k] || []).forEach((p) => { if (p && p.id) map[p.id] = p; });
    });
    return Object.values(map);
  }

  function track() {
    if (channel && me) channel.track(me);
  }

  function join(roomId, name, participantId) {
    if (!configured) {
      emitLocal('notconfigured', {});
      return;
    }
    me = { id: participantId, name, activeWheelId: null, color: colorFor(participantId) };
    const ch = ensureClient().channel('room:' + roomId, {
      config: { presence: { key: participantId }, broadcast: { self: false } },
    });
    channel = ch;

    ch.on('presence', { event: 'sync' }, () => emitLocal('participants', getParticipants()));
    ch.on('presence', { event: 'join' }, () => emitLocal('participants', getParticipants()));
    ch.on('presence', { event: 'leave' }, () => emitLocal('participants', getParticipants()));

    ['wheels', 'wheelOptions', 'spinStart', 'spinEnd', 'clearHistory', 'state', 'requestState'].forEach((ev) => {
      ch.on('broadcast', { event: ev }, ({ payload }) => emitLocal(ev, payload));
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        subscribed = true;
        await track();
        emitLocal('ready', {});
      }
    });
  }

  function send(ev, payload) {
    if (!channel || !subscribed) return;
    channel.send({ type: 'broadcast', event: ev, payload });
  }

  // 更新在线状态（切转盘 / 改昵称）
  function setActiveWheel(wheelId) {
    if (!me) return;
    me.activeWheelId = wheelId;
    track();
  }
  function setName(name) {
    if (!me) return;
    me.name = name;
    track();
  }

  const api = {
    configured,
    on,
    join,
    setActiveWheel,
    setName,
    broadcastWheels: (wheels, wheelOrder) => send('wheels', { wheels, wheelOrder }),
    broadcastWheelOptions: (wheelId, options) => send('wheelOptions', { wheelId, options }),
    broadcastSpinStart: (p) => send('spinStart', p),
    broadcastSpinEnd: (p) => send('spinEnd', p),
    broadcastClearHistory: () => send('clearHistory', {}),
    requestState: () => send('requestState', {}),
    respondState: (snap) => send('state', snap),
  };

  window.SpinAPI = api;
})();
