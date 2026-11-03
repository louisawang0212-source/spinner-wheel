'use strict';

/**
 * 选项校验：把客户端传来的原始数组规范化为安全的 Option[]。
 * 返回 null 表示非法（数量不足/标签为空等）。
 */
function validateOptions(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length < 2 || raw.length > 50) return null;
  const options = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const label = typeof item.label === 'string' ? item.label.slice(0, 40) : '';
    if (!label.trim()) return null;
    let color = typeof item.color === 'string' ? item.color : '#C9A86A';
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = '#C9A86A';
    let weight = Number(item.weight);
    if (!isFinite(weight) || weight <= 0) weight = 1;
    weight = Math.max(0.0001, weight);
    let icon = item.icon || null;
    if (typeof icon !== 'string') icon = null;
    options.push({
      id: typeof item.id === 'string' ? item.id : 'opt_' + Math.random().toString(36).slice(2, 9),
      label,
      color,
      weight,
      icon,
    });
  }
  return options;
}

/**
 * 按权重随机选中一个下标（服务器权威）。
 */
function weightedPick(options) {
  let total = 0;
  for (const o of options) total += o.weight;
  let r = Math.random() * total;
  for (let i = 0; i < options.length; i++) {
    r -= options[i].weight;
    if (r < 0) return i;
  }
  return options.length - 1;
}

module.exports = { validateOptions, weightedPick };
