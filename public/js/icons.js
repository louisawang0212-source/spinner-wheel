'use strict';

/**
 * 默认金色单色线性图标库。
 * 每个值为 SVG 的"内部标记"，使用 __C__ 作为颜色占位符（fill 或 stroke），
 * 渲染时将其替换为目标颜色（面板用金色，转盘上按对比度取白/黑）。
 * viewBox 统一为 0 0 24 24。
 */
const ICON_LIBRARY = {
  star: '<path fill="__C__" d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.9 6.2 20.5l1.1-6.5L2.6 9.4l6.5-.9z"/>',
  gift: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="16" height="11" rx="1.5"/><line x1="4" y1="13" x2="20" y2="13"/><line x1="12" y1="9" x2="12" y2="20"/><path d="M12 9C12 9 9 4 6.5 5.6S7 9 12 9zM12 9c0 0 3-5 5.5-3.4S17 9 12 9z"/></g>',
  trophy: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/><line x1="12" y1="13" x2="12" y2="17"/><path d="M8.5 20h7M9 17h6v3H9z"/></g>',
  coin: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M9.4 9.8c0-1.3 1.2-1.8 2.6-1.8s2.6.6 2.6 1.9c0 2.5-5.2 1.2-5.2 3.5 0 1.2 1.2 1.9 2.6 1.9s2.6-.5 2.6-1.8"/></g>',
  heart: '<path fill="__C__" d="M12 20.4l-1.5-1.4C5.4 14.6 3 12.4 3 9.5 3 7.1 4.9 5.1 7.3 5.1c1.5 0 2.9.8 3.7 2.1.8-1.3 2.2-2.1 3.7-2.1 2.4 0 4.3 2 4.3 4.4 0 2.9-2.4 5.1-7.5 9.5z"/>',
  pizza: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3 21 19a1 1 0 0 1-1.3 1.3L12 16 4.3 20.3A1 1 0 0 1 3 19z"/><circle cx="11" cy="11" r="1"/><circle cx="14.2" cy="14" r="1"/></g>',
  burger: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linecap="round"><path d="M4 8c0-3 3.6-4 8-4s8 1 8 4"/><line x1="4" y1="12" x2="20" y2="12"/><path d="M4 16c0 2.2 3.6 3 8 3s8-.8 8-3"/></g>',
  coffee: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2"/><path d="M8 3v2M11 3v2M14 3v2"/></g>',
  drink: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10l-1.4 16H8.4z"/><line x1="13" y1="4" x2="16.5" y2="9"/></g>',
  cake: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20h14v-7H5z"/><path d="M5 13c1.5 0 1.5-2 3-2s1.5 2 3 2 1.5-2 3-2 1.5 2 3 2"/><line x1="12" y1="11" x2="12" y2="6"/><circle cx="12" cy="4.6" r="1.1" fill="__C__" stroke="none"/></g>',
  apple: '<path fill="__C__" d="M12 7c-1.3-1.7-3.5-2.1-4.8-.9-1.6 1.4-1.7 3.9-.3 5.9 1.1 1.7 2.8 2.9 4 2.8.3-1.5-.2-3 .4-4.3-.4-1.6.1-3.4 1.7-3.5zM14.8 5.4c1.6-.2 3 .8 3.5 2.1.7 1.6.1 3.3-1.1 4.6-1.1 1.4-2.8 2.4-3.9 2.2-.2-1.7.5-3.3-.3-4.7-.6-1.1.1-3 1.8-4.2z"/>',
  game: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="9" rx="4.5"/><line x1="7" y1="11" x2="7" y2="14"/><line x1="5.5" y1="12.5" x2="8.5" y2="12.5"/><circle cx="16" cy="12.5" r="1.2" fill="__C__" stroke="none"/></g>',
  movie: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="1.5"/><line x1="7" y1="5" x2="7" y2="19"/><line x1="17" y1="5" x2="17" y2="19"/></g>',
  music: '<path fill="__C__" d="M9 4v11.6a3 3 0 1 0 2 2.8V8l8-2v7.6a3 3 0 1 0 2 2.8V4z"/>',
  sport: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2 2.5 14 0 16M12 4c-2.5 2-2.5 14 0 16"/></g>',
  travel: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l9-2 9 2-9 2z"/><path d="M12 11V5M9 5h6M12 15v4M9 19h6"/></g>',
  book: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linejoin="round"><path d="M5 4h9a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M16 6a2 2 0 0 1 2 2v12H7"/></g>',
  camera: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="12" cy="13" r="3.2"/><path d="M8 7l1.5-2h5L16 7"/></g>',
  gem: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linejoin="round"><path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18M9 4 7 9l5 11M15 4l2 5-5 11"/></g>',
  crown: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linejoin="round"><path d="M4 8l3 9h10l3-9-5 4-4-6-4 6z"/></g>',
  ticket: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linejoin="round"><path d="M4 7h16v4a2 2 0 0 0 0 4v2H4v-2a2 2 0 0 0 0-4z"/><line x1="13" y1="7" x2="13" y2="17"/></g>',
  home: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linejoin="round"><path d="M4 11l8-6 8 6"/><path d="M6 10v9h12v-9"/></g>',
  car: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linejoin="round"><path d="M4 14l1.5-4h13L20 14v3H4z"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/></g>',
  question: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.6 1.4c0 1.6-2 2-2 3.2"/><circle cx="12" cy="17.2" r="0.7" fill="__C__" stroke="none"/></g>',
  people: '<g fill="none" stroke="__C__" stroke-width="1.8"><circle cx="9" cy="9" r="2.6"/><circle cx="16" cy="10" r="2"/><path d="M4.5 18c0-2.8 2.2-5 4.5-5s4.5 2.2 4.5 5M14 18c0-2-1.5-3.6 3-3.6s3 1.6 3 3.6"/></g>',
  sun: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17 17l1.4 1.4M18.5 5.5L17 7M7 17l-1.4 1.4"/></g>',
  moon: '<path fill="__C__" d="M15 4a8 8 0 1 0 5 11 6 6 0 0 1-5-11z"/>',
  bell: '<g fill="none" stroke="__C__" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17V10a6 6 0 0 1 12 0v7l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></g>',
};

const _imgCache = {};

function getIconSVG(key, color) {
  const inner = ICON_LIBRARY[key];
  if (!inner) return null;
  const c = color || '#C9A86A';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">' +
    inner.replace(/__C__/g, c) + '</svg>';
}

function getIconImage(key, color) {
  if (!ICON_LIBRARY[key]) return null;
  const k = key + '|' + (color || '#C9A86A');
  if (_imgCache[k]) return _imgCache[k];
  const svg = getIconSVG(key, color);
  const img = new Image();
  img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  _imgCache[k] = img;
  return img;
}

window.ICON_LIBRARY = ICON_LIBRARY;
window.getIconImage = getIconImage;
window.getIconSVG = getIconSVG;
