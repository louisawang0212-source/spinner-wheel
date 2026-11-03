'use strict';

(function () {
  const socket = io();

  const handlers = {};
  const EVENTS = ['state', 'wheels', 'wheelOptions', 'spinStart', 'spinEnd', 'participants', 'history', 'error'];
  EVENTS.forEach((ev) => {
    socket.on('room:' + ev, (data) => {
      (handlers[ev] || []).forEach((cb) => cb(data));
    });
  });

  const api = {
    socket,
    on(ev, cb) {
      (handlers[ev] = handlers[ev] || []).push(cb);
    },
    join(roomId, name, participantId) {
      socket.emit('room:join', { roomId, name, participantId });
    },
    createWheel(roomId, name) {
      socket.emit('room:createWheel', { roomId, name });
    },
    renameWheel(roomId, wheelId, name) {
      socket.emit('room:renameWheel', { roomId, wheelId, name });
    },
    deleteWheel(roomId, wheelId) {
      socket.emit('room:deleteWheel', { roomId, wheelId });
    },
    updateOptions(roomId, wheelId, options) {
      socket.emit('room:updateOptions', { roomId, wheelId, options });
    },
    setActiveWheel(roomId, wheelId) {
      socket.emit('room:setActiveWheel', { roomId, wheelId });
    },
    spin(roomId, wheelId) {
      socket.emit('room:spin', { roomId, wheelId });
    },
    clearHistory(roomId) {
      socket.emit('room:clearHistory', { roomId });
    },
  };

  window.SpinAPI = api;
})();
