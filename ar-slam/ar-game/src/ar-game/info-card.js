// info-card.js — 轻量信息卡(DOM):标题 + 大白话要点 + “即将上线”角标;开启时软引导镜头转向该簇
import { track } from '../analytics.js?v=20261012104101';

export function createInfoCard(ui, rig) {
  let current = null;

  function open(spot) {
    current = spot;
    ui.cardName.textContent = spot.title;
    ui.cardLines.innerHTML = '';
    for (const line of spot.lines) {
      const li = document.createElement('li');
      li.textContent = line;
      ui.cardLines.appendChild(li);
    }
    ui.infoCard.classList.add('on');
    // 软引导:保留用户当前方位(只把目标移向该簇并轻抬镜头),不抢着改方向
    const [x, y, z] = spot.point;
    const cp = rig.camera.position;
    const az = Math.atan2(cp.x - x, cp.z - z);
    rig.suggest(x + Math.sin(az) * 1.5, Math.max(y + 1.0, cp.y), z + Math.cos(az) * 1.5, x, y + 0.05, z);
    track('ar_card_open', { id: spot.id });
  }
  function close() {
    if (!current) return;
    ui.infoCard.classList.remove('on');
    track('ar_card_close', { id: current.id });
    current = null;
  }
  ui.btnCardClose.addEventListener('click', close);

  return { open, close, get current() { return current; } };
}
