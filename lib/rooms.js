'use strict';

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 去掉易混 0/O/1/I/L

function genRoomId(len = 6) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

function genId(prefix) {
  return (prefix || 'id') + '_' + crypto.randomBytes(6).toString('hex');
}

// 转盘扇区默认协调多彩调色板（iOS 风、低饱和、跨色相，相邻区分明显）
// 注意：前端 public/js/app.js 顶部有一份相同副本，修改时需同步。
const PALETTE = [
  '#6FA8DC', // 蓝
  '#E8B85C', // 金
  '#81C7A8', // 薄荷绿
  '#E29BB4', // 粉
  '#A593D6', // 薰衣草紫
  '#E8A06B', // 暖橙
  '#5FBFD0', // 青蓝
  '#C98FB0', // 玫瑰
  '#9BC17A', // 黄绿
  '#D6B25E', // 麦金
];

// 取与上一个选项颜色不同的下一个调色板颜色，避免相邻扇区同色
function nextColor(existing) {
  const last = existing && existing.length ? (existing[existing.length - 1].color || null) : null;
  for (let k = 0; k < PALETTE.length; k++) {
    const c = PALETTE[(k + (existing ? existing.length : 0)) % PALETTE.length];
    if (c !== last) return c;
  }
  return PALETTE[0];
}

function defaultSampleOptions() {
  return [
    { id: genId('opt'), label: '选项一', color: PALETTE[0], weight: 1, icon: 'star' },
    { id: genId('opt'), label: '选项二', color: PALETTE[2], weight: 1, icon: 'gift' },
  ];
}

const rooms = new Map(); // roomId -> Room

class Room {
  constructor(id) {
    this.id = id;
    this.wheels = new Map();   // wheelId -> Wheel
    this.wheelOrder = [];      // 保持创建顺序
    this.participants = new Map(); // socketId -> Participant
    this.history = [];         // 转动历史，最多 100
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
    this.addWheel('我的转盘', defaultSampleOptions());
  }

  addWheel(name, options) {
    const id = genId('wheel');
    this.wheels.set(id, { id, name, options, spinning: false, createdAt: Date.now() });
    this.wheelOrder.push(id);
    this.lastActivityAt = Date.now();
    return this.wheels.get(id);
  }
}

function getOrCreateRoom(id) {
  let room = rooms.get(id);
  if (!room) {
    room = new Room(id);
    rooms.set(id, room);
  }
  return room;
}

function getRoom(id) {
  return rooms.get(id);
}

function removeRoomIfEmpty(id, io) {
  const room = rooms.get(id);
  if (!room) return;
  const live = io.sockets.adapter.rooms.get(id);
  const noLive = !live || live.size === 0;
  if (noLive && Date.now() - room.lastActivityAt > 30 * 60 * 1000) {
    rooms.delete(id);
  }
}

function cleanupIdleRooms(io) {
  for (const [id, room] of rooms) {
    const live = io.sockets.adapter.rooms.get(id);
    const noLive = !live || live.size === 0;
    if (noLive && Date.now() - room.lastActivityAt > 30 * 60 * 1000) {
      rooms.delete(id);
    }
  }
}

function pickColor(room) {
  const used = new Set([...room.participants.values()].map((p) => p.color));
  const colors = ['#C9A86A', '#7A7A7E', '#A9A9AE', '#BFA46A', '#5C5C60', '#D8C9A6', '#8A8A8E', '#C2B280'];
  for (const c of colors) if (!used.has(c)) return c;
  return colors[Math.floor(Math.random() * colors.length)];
}

function sanitizeName(name) {
  if (typeof name !== 'string') return null;
  const n = name.trim().slice(0, 24);
  return n || null;
}

function serializeWheels(room) {
  return room.wheelOrder.map((id) => {
    const w = room.wheels.get(id);
    return { id: w.id, name: w.name, options: w.options };
  });
}

function snapshot(room) {
  return {
    roomId: room.id,
    wheels: serializeWheels(room),
    wheelOrder: room.wheelOrder,
    participants: [...room.participants.values()],
    history: room.history,
  };
}

module.exports = {
  rooms,
  genRoomId,
  genId,
  PALETTE,
  defaultSampleOptions,
  getOrCreateRoom,
  getRoom,
  removeRoomIfEmpty,
  cleanupIdleRooms,
  pickColor,
  sanitizeName,
  serializeWheels,
  snapshot,
};
