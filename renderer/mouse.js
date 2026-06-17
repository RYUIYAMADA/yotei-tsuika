// ★ マウスイベント・ドラッグ&ドロップ
import { draggedTaskId } from './state.js';

export function initMouseTracking() {
  document.body.addEventListener('mouseleave', (e) => {
    if (draggedTaskId) return;
    window.api.mouseLeaveWindow();
  });

  document.body.addEventListener('mouseenter', () => {
    window.api.mouseEnterWindow();
  });

  document.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('focus', () => window.api.mouseEnterWindow());
  });
}
