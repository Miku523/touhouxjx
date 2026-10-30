
const fs=require('fs');const p='src/engine/renderer.js';let s=fs.readFileSync(p,'utf8');const E=s.includes('\r\n')?'\r\n':'\n';
function rep(a,b){if(s.split(a).length-1!==1)throw new Error('anchor '+a.slice(0,50));s=s.replace(a,b);}
rep('    this._lowLast = 0;',
'    this._lowLast = 0;'+E+'    this._lowStart = 0;      // 首次开始计时的时刻（前 5s 是启动/开屏，不参与降档）');
rep('    if (!this.lowSpec) return;'+E+'    const n = this._lowSteps.length;'+E+'    const now = performance.now();',
'    if (!this.lowSpec) return;'+E+'    const n = this._lowSteps.length;'+E+'    const now = performance.now();'+E+'    if (!this._lowStart) this._lowStart = now;'+E+'    if (now - this._lowStart < 5000) { this._lowLast = now; return; }   // 启动/开屏阶段的一次性长帧不算');
rep('    if (this._lowEma > 19 && this._lowFrames > 45 && this._lowIdx < n - 1) {',
'    if (this._lowEma > 19 && this._lowFrames > 120 && this._lowIdx < n - 1) {');
rep('    this._lowCooldown = 30;'+E+'    this.fit();',
'    this._lowCooldown = 30;'+E+'    this._lowStart = performance.now();   // 每次变档后重新给 5s 观察期'+E+'    this.fit();');
fs.writeFileSync(p,s);console.log('refined');
