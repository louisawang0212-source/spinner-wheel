'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const {
  genId,
  getOrCreateRoom,
  getRoom,
  removeRoomIfEmpty,
  cleanupIdleRooms,
  pickColor,
  sanitizeName,
  serializeWheels,
  snapshot,
  defaultSampleOptions,
} = require('./lib/rooms');
const { validateOptions, weightedPick } = require('./lib/spin');

const SPIN_DURATION_MS = parseInt(process.env.SPIN_DURATION_MS || '4200', 10);
const RESULT_PAUSE_MS = parseInt(process.env.RESULT_PAUSE_MS || '900', 10);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// 根路径由 express.static 自动返回 public/index.html；
// 链接采用 /?room= 查询参数，无需额外路由。

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

function who(socket, room) {
  const p = room.participants.get(socket.id);
  return p ? { id: p.id, name: p.name } : { id: socket.id, name: '某人' };
}

function rand4() {
  return Math.floor(1000 + Math.random() * 9000);
}

io.on('connection', (socket) => {
  socket.on('room:join', ({ roomId, name, participantId } = {}) => {
    if (!roomId || typeof roomId !== 'string') return;
    const room = getOrCreateRoom(roomId);
    const firstWheelId = room.wheelOrder[0];
    const pid = participantId && typeof participantId === 'string' ? participantId : socket.id;
    room.participants.set(socket.id, {
      id: pid,
      name: sanitizeName(name) || '访客' + rand4(),
      color: pickColor(room),
      activeWheelId: firstWheelId,
      joinedAt: Date.now(),
    });
    socket.data.roomId = roomId;
    socket.join(roomId);
    socket.emit('room:state', snapshot(room));
    io.to(roomId).emit('room:participants', { roomId, participants: [...room.participants.values()] });
  });

  socket.on('room:createWheel', ({ roomId, name } = {}) => {
    const room = getRoom(roomId);
    if (!room) return;
    room.addWheel(sanitizeName(name) || '新转盘', defaultSampleOptions());
    io.to(roomId).emit('room:wheels', { roomId, wheels: serializeWheels(room), wheelOrder: room.wheelOrder });
  });

  socket.on('room:renameWheel', ({ roomId, wheelId, name } = {}) => {
    const room = getRoom(roomId);
    if (!room) return;
    const wheel = room.wheels.get(wheelId);
    if (!wheel) return;
    wheel.name = sanitizeName(name) || wheel.name;
    room.lastActivityAt = Date.now();
    io.to(roomId).emit('room:wheels', { roomId, wheels: serializeWheels(room), wheelOrder: room.wheelOrder });
  });

  socket.on('room:deleteWheel', ({ roomId, wheelId } = {}) => {
    const room = getRoom(roomId);
    if (!room) return;
    if (room.wheelOrder.length <= 1) {
      return socket.emit('room:error', { code: 'LAST_WHEEL', message: '至少保留一个转盘' });
    }
    if (!room.wheels.has(wheelId)) return;
    room.wheels.delete(wheelId);
    room.wheelOrder = room.wheelOrder.filter((id) => id !== wheelId);
    for (const p of room.participants.values()) {
      if (p.activeWheelId === wheelId) p.activeWheelId = room.wheelOrder[0];
    }
    room.lastActivityAt = Date.now();
    io.to(roomId).emit('room:wheels', { roomId, wheels: serializeWheels(room), wheelOrder: room.wheelOrder });
    io.to(roomId).emit('room:participants', { roomId, participants: [...room.participants.values()] });
  });

  socket.on('room:updateOptions', ({ roomId, wheelId, options } = {}) => {
    const room = getRoom(roomId);
    if (!room) return;
    const wheel = room.wheels.get(wheelId);
    if (!wheel) return;
    const valid = validateOptions(options);
    if (!valid) {
      return socket.emit('room:error', { code: 'BAD_OPTIONS', message: '选项不合法（需 2~50 项，标签非空）' });
    }
    wheel.options = valid;
    room.lastActivityAt = Date.now();
    io.to(roomId).emit('room:wheelOptions', { roomId, wheelId, options: wheel.options });
  });

  socket.on('room:setActiveWheel', ({ roomId, wheelId } = {}) => {
    const room = getRoom(roomId);
    if (!room) return;
    const p = room.participants.get(socket.id);
    if (!p || !room.wheels.has(wheelId)) return;
    p.activeWheelId = wheelId;
    room.lastActivityAt = Date.now();
    io.to(roomId).emit('room:participants', { roomId, participants: [...room.participants.values()] });
  });

  socket.on('room:spin', ({ roomId, wheelId } = {}) => {
    const room = getRoom(roomId);
    if (!room) return;
    const wheel = room.wheels.get(wheelId);
    if (!wheel) return;
    if (wheel.spinning) {
      return socket.emit('room:error', { code: 'BUSY', message: '该转盘转动中，请稍候' });
    }
    if (wheel.options.length < 2) {
      return socket.emit('room:error', { code: 'TOO_FEW', message: '至少需要 2 个选项' });
    }
    const targetIndex = weightedPick(wheel.options);
    wheel.spinning = true;
    const by = who(socket, room);
    const startedAt = Date.now();
    io.to(roomId).emit('room:spinStart', {
      wheelId,
      wheelName: wheel.name,
      targetIndex,
      duration: SPIN_DURATION_MS,
      by,
      startedAt,
    });
    setTimeout(() => {
      if (!wheel.spinning) return; // 房间已被清理等极端情况
      const opt = wheel.options[targetIndex];
      const res = {
        id: genId('spin'),
        wheelId,
        wheelName: wheel.name,
        targetIndex,
        label: opt.label,
        icon: opt.icon || null,
        by,
        ts: Date.now(),
      };
      room.history.unshift(res);
      if (room.history.length > 100) room.history.length = 100;
      wheel.spinning = false;
      room.lastActivityAt = Date.now();
      io.to(roomId).emit('room:spinEnd', res);
      io.to(roomId).emit('room:participants', { roomId, participants: [...room.participants.values()] });
    }, SPIN_DURATION_MS + RESULT_PAUSE_MS);
  });

  socket.on('room:clearHistory', ({ roomId } = {}) => {
    const room = getRoom(roomId);
    if (!room) return;
    room.history = [];
    room.lastActivityAt = Date.now();
    io.to(roomId).emit('room:history', { roomId, history: room.history });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = getRoom(roomId);
    if (!room) return;
    room.participants.delete(socket.id);
    io.to(roomId).emit('room:participants', { roomId, participants: [...room.participants.values()] });
    room.lastActivityAt = Date.now();
    removeRoomIfEmpty(roomId, io);
  });
});

setInterval(() => cleanupIdleRooms(io), 5 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Spinner wheel running on http://localhost:${PORT}`);
});
