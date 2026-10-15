// analytics.js —— 使用量埋点（localStorage，P0）
// 只进 localStorage，不外发；M4 部署后再加导出/上报
const KEY = 'aragri_events';
const CAP = 500;

export function track(event, data = {}) {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    list.push({ event, data, t: Date.now() });
    if (list.length > CAP) list.splice(0, list.length - CAP);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (e) { /* 隐私模式等场景静默放弃 */ }
}

export function dumpEvents() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
}
