'use strict';

(function () {
  const DURATION_FALLBACK = 4200;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // 目标旋转角度：使第 targetIndex 扇区中心停在顶部指针（-π/2）处
  function targetRotation(targetIndex, N, fullSpins) {
    const sector = (2 * Math.PI) / N;
    const center = targetIndex * sector + sector / 2;
    let rot = -Math.PI / 2 - center;
    rot = ((rot % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return rot + (fullSpins || 5) * 2 * Math.PI;
  }

  // 根据背景色亮度选择文字/图标颜色（浅底用深字，深底用白字）
  function contrastColor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#1D1D1F';
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.62 ? '#1D1D1F' : '#FFFFFF';
  }

  // 顶部指针（-π/2）当前指向的扇区下标
  function topIndex(rotation, N) {
    if (N <= 0) return -1;
    const sector = (2 * Math.PI) / N;
    let a = (-Math.PI / 2 - rotation) % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;
    return Math.floor(a / sector) % N;
  }

  class Wheel {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.options = [];
      this.rotation = 0;
      this.size = 320;
      this.spinning = false;
      this.highlightIndex = null; // 中奖/选中高亮的下标
      this.resize();
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const css = this.canvas.clientWidth || 320;
      this.size = css;
      this.canvas.width = Math.round(css * dpr);
      this.canvas.height = Math.round(css * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    setOptions(options) {
      this.options = options || [];
      this.rotation = 0;
      this.highlightIndex = null;
      this.resize();
      this.draw();
    }

    setHighlight(i) {
      this.highlightIndex = (i == null) ? null : i;
      this.draw();
    }

    clearHighlight() {
      this.highlightIndex = null;
      this.draw();
    }

    draw() {
      const ctx = this.ctx;
      const size = this.size;
      const cx = size / 2;
      const cy = size / 2 + 4;      // 略微下移，给顶部指针留出空间
      const r = size / 2 - 26;
      const N = this.options.length;
      ctx.clearRect(0, 0, size, size);
      if (N === 0) return;
      const sector = (2 * Math.PI) / N;

      const resultIndex = this.highlightIndex; // 仅转动落定后设置
      const topIdx = (!this.spinning && resultIndex == null) ? topIndex(this.rotation, N) : -1;

      for (let i = 0; i < N; i++) {
        const a0 = this.rotation + i * sector;
        const a1 = this.rotation + (i + 1) * sector;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, a0, a1);
        ctx.closePath();
        const color = this.options[i].color || '#C9A86A';
        ctx.fillStyle = color;
        ctx.fill();

        // 扇区分隔线（半透明白），让相邻边界清晰
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.stroke();

        // 中奖落定时，非选中扇区轻微压暗以聚焦结果
        if (resultIndex != null && i !== resultIndex) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r, a0, a1);
          ctx.closePath();
          ctx.fillStyle = 'rgba(20,20,22,0.12)';
          ctx.fill();
        }

        const opt = this.options[i];
        const tc = contrastColor(color);
        const mid = a0 + sector / 2;
        const fontSize = Math.max(12, Math.min(17, size / 26));
        const iconSize = size / 16;

        ctx.fillStyle = tc;
        ctx.textBaseline = 'middle';
        ctx.font = '600 ' + fontSize + 'px ' +
          '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';

        const drawIcon = (x, y) => {
          if (!opt.icon || !window.getIconImage) return false;
          const img = window.getIconImage(opt.icon, tc);
          if (!img) return false;
          if (!img.complete) { img.onload = () => this.draw(); return false; }
          ctx.drawImage(img, x, y - iconSize / 2, iconSize, iconSize);
          return true;
        };
        const fitLabel = (maxW) => {
          let label = String(opt.label || '');
          if (ctx.measureText(label).width > maxW) {
            while (label.length > 1 && ctx.measureText(label + '…').width > maxW) label = label.slice(0, -1);
            label += '…';
          }
          return label;
        };

        if (N >= 4) {
          // 扇区较多：文字沿半径方向排列，并翻转朝下的扇区，避免出现倒立的字
          let angle = mid;
          const norm = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          const flip = norm >= Math.PI / 2 && norm < 3 * Math.PI / 2;
          if (flip) angle += Math.PI;

          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle);
          ctx.textAlign = flip ? 'left' : 'right';
          const dir = flip ? -1 : 1;          // 朝外方向
          let textEdge = dir * (r - 14);
          const hasIcon = opt.icon && window.getIconImage;
          if (hasIcon) {
            const iconX = flip ? -(r - 14) : (r - 14 - iconSize);
            if (drawIcon(iconX, 0)) textEdge = dir * (r - 18 - iconSize);
          }
          const maxW = r - 34 - (hasIcon ? iconSize : 0);
          ctx.fillText(fitLabel(maxW), textEdge, 0);
          ctx.restore();
        } else {
          // 扇区很少（1~3 块）：文字水平排在扇区重心，最易读
          const dist = r * 0.6;
          const px = cx + Math.cos(mid) * dist;
          const py = cy + Math.sin(mid) * dist;
          ctx.textAlign = 'center';
          const hasIcon = opt.icon && window.getIconImage;
          const gap = 6;
          const maxW = r * 0.72 - (hasIcon ? iconSize + gap : 0);
          const label = fitLabel(maxW);
          const textW = ctx.measureText(label).width;
          const totalW = textW + (hasIcon ? iconSize + gap : 0);
          const startX = px - totalW / 2;
          if (hasIcon) drawIcon(startX, py);
          ctx.textAlign = 'left';
          ctx.fillText(label, startX + (hasIcon ? iconSize + gap : 0), py);
        }
      }

      // 选中/中奖扇区：只描外弧（静止时为极淡细线，落定中奖时为粗金线），
      // 不描两条半径，避免少扇区时中间出现一条多余的金线
      const ringIndex = (resultIndex != null) ? resultIndex : topIdx;
      if (ringIndex >= 0 && ringIndex < N) {
        const a0 = this.rotation + ringIndex * sector;
        const a1 = this.rotation + (ringIndex + 1) * sector;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 1, a0, a1);
        ctx.lineWidth = (resultIndex != null) ? 5 : 2;
        ctx.strokeStyle = (resultIndex != null) ? '#C9A86A' : 'rgba(201,168,106,0.65)';
        ctx.stroke();
      }

      // 顶部指针（固定不旋转，尖端指向扇区内部，完整落在画布内）
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.22)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#C9A86A';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r + 16);
      ctx.lineTo(cx - 14, cy - r - 12);
      ctx.lineTo(cx + 14, cy - r - 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // 中心圆
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.07, 0, 2 * Math.PI);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.stroke();
      ctx.restore();
    }

    spinTo(targetIndex, duration, onDone) {
      const N = this.options.length;
      if (N === 0) return;
      this.clearHighlight();
      const target = targetRotation(targetIndex, N, 5);
      const start = performance.now();
      const dur = duration || DURATION_FALLBACK;
      this.spinning = true;
      const tick = (now) => {
        const t = Math.min(1, (now - start) / dur);
        this.rotation = easeOutCubic(t) * target;
        this.draw();
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          this.rotation = target % (2 * Math.PI);
          this.spinning = false;
          this.draw();
          if (onDone) onDone();
        }
      };
      requestAnimationFrame(tick);
    }
  }

  window.Wheel = Wheel;
})();
