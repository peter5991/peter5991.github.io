// passthrough.js — AR 取景背景:优先真实摄像头(后置),失败回退桌面静图
// 渲染层透明(alpha),背景由本模块的 <video>/静图 div 提供(屏幕空间,不参与 3D)
import { track } from '../analytics.js?v=20261012103238';

const HINTS = {
  NotAllowedError: '摄像头权限被拒——请在浏览器设置里允许本站使用相机',
  NotFoundError: '找不到摄像头设备',
  NotReadableError: '摄像头被其他应用占用——关掉其他相机应用再试',
  OverconstrainedError: '摄像头不支持请求的参数',
  SecurityError: '需要 https 安全环境才能开摄像头',
};

// container: #camLayer(canvas 的父级)。返回 { mode:'camera'|'image', stop() }
export async function startPassthrough(container) {
  let video = null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false,
    });
    video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    await video.play();
    container.prepend(video);
    track('ar_passthrough', { mode: 'camera' });
    return { mode: 'camera', video, stop() { stream.getTracks().forEach((t) => t.stop()); } };
  } catch (err) {
    const msg = HINTS[err?.name] || ('摄像头不可用: ' + (err?.message || err));
    track('ar_passthrough', { mode: 'image', err: err?.name || String(err) });
    container.style.backgroundImage = 'url(./ar-game/desk-bg.jpg?v=20261012103238)';
    return { mode: 'image', video: null, error: msg, stop() {} };
  }
}
