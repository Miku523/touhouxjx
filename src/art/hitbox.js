/**
 * 判定点（当身）显示：东方风的小红点 + 呼吸光晕 + 旋转刻度环。
 *
 * 只在按住 Shift 的「低速移动」状态绘制，用来告诉玩家真正的受伤判定
 * 比立绘小得多；魔理沙的判定点比灵梦再小一点。
 */

/** '#rrggbb' + alpha → 'rgba(...)'；也接受已是 rgba 的字符串 */
function withAlpha(hex, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x 判定圆心
 * @param {number} y
 * @param {number} r 判定半径（= 实际碰撞半径）
 * @param {number} t 动画时间（秒）
 * @param {string} [accent] 角色主色
 */
export function drawHitbox(ctx, x, y, r, t, accent = '#ff5ea8') {
  ctx.save();
  ctx.translate(x, y);

  // 呼吸光晕
  const pulse = 0.5 + 0.5 * Math.sin(t * 5.2);
  const glowR = r * (3.0 + pulse * 0.55);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, glowR);
  g.addColorStop(0, 'rgba(255,255,255,0.34)');
  g.addColorStop(0.45, withAlpha(accent, 0.20));
  g.addColorStop(1, withAlpha(accent, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, glowR, 0, Math.PI * 2);
  ctx.fill();

  // 旋转虚线环：白色为主，任何背景上都看得清
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([3.5, 3.5]);
  ctx.lineDashOffset = -t * 26;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.95, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // 角色色外环，弱化但补一层识别度
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.5, 0, Math.PI * 2);
  ctx.stroke();

  // 四向刻度
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#ffffff';
  for (let i = 0; i < 4; i++) {
    const a = t * 1.6 + (i * Math.PI) / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(c * r * 1.55, s * r * 1.55);
    ctx.lineTo(c * r * 1.95, s * r * 1.95);
    ctx.stroke();
  }

  // 深色衬底 + 白芯 + 角色色内点 = 真正的判定圆（亮背景不糊）
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#120a1e';
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.02, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.98;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.46, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
