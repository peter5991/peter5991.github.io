// timeline.js — 讲解时间轴:JSON(参数初值 + 补间表 + 字幕 + 参与门)→ 任意时刻 T 的参数快照
// 闭式求值:snapshot(T) 只依赖 T,可任意拖动/跳转,同一 T 画面恒等(D3 铁律延续)
// gates(参与门)不进 snapshot:播放时钟走到 t 即停住,等交互放行;seek 越过即视为已通过
const EASE = {
  linear: (k) => k,
  in: (k) => k * k * k,
  out: (k) => 1 - Math.pow(1 - k, 3),
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  back: (k) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); }
};

export async function loadTimeline(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' 加载失败: HTTP ' + res.status);
  const tl = await res.json();
  validate(tl);
  // 按参数分组、按起点排序,求值时逐段串联
  const tracks = {};
  for (const tw of tl.tweens) (tracks[tw.p] ||= []).push(tw);
  for (const k in tracks) tracks[k].sort((a, b) => a.t - b.t);
  tl.snapshot = (T) => {
    const out = { ...tl.params };
    for (const p in tracks) {
      let v = tl.params[p];
      for (const tw of tracks[p]) {
        if (T < tw.t) break;
        const k = tw.dur > 0 ? Math.min((T - tw.t) / tw.dur, 1) : 1;
        v = v + (tw.to - v) * EASE[tw.ease || 'linear'](k);
      }
      out[p] = v;
    }
    return out;
  };
  tl.captionAt = (T) => tl.captions.find((c) => T >= c.t && T < c.t + c.dur) || null;
  tl.chapterAt = (T) => tl.chapters.filter((c) => T >= c.t).pop();
  tl.gates = (tl.gates || []).slice().sort((a, b) => a.t - b.t);
  tl.nextGate = (T, cleared) => tl.gates.find((g) => !cleared.has(g.id) && T < g.t) || null;
  return tl;
}

// 内容错误直接抛:未声明参数、未知缓动、同参数补间重叠(重叠会让串联求值失去闭式含义)
function validate(tl) {
  const errs = [];
  const last = {};
  for (const tw of [...tl.tweens].sort((a, b) => a.t - b.t)) {
    if (!(tw.p in tl.params)) errs.push(`补间引用未声明参数 ${tw.p}`);
    if (tw.ease && !EASE[tw.ease]) errs.push(`未知缓动 ${tw.ease}(${tw.p}@${tw.t})`);
    if (last[tw.p] !== undefined && tw.t < last[tw.p] - 1e-6) errs.push(`参数 ${tw.p} 补间重叠 @${tw.t}`);
    last[tw.p] = tw.t + tw.dur;
  }
  for (const g of tl.gates || []) {
    if (typeof g.t !== 'number' || g.t < 0 || g.t > tl.duration) errs.push(`参与门 ${g.id} 的 t 越界`);
    if (!g.id || !g.prompt || !g.button) errs.push(`参与门缺 id/prompt/button(${g.id})`);
  }
  if (errs.length) throw new Error('时间轴 JSON 校验失败:\n' + errs.join('\n'));
}
