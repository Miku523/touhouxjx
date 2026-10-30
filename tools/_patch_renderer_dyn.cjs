
const fs=require('fs');const p='src/engine/renderer.js';let s=fs.readFileSync(p,'utf8');const E=s.includes('\r\n')?'\r\n':'\n';
function rep(a,b){if(s.split(a).length-1!==1)throw new Error('anchor '+a.slice(0,40));s=s.replace(a,b);}
rep('    this.softwareRaster = detectSoftwareRaster();'+E+'    this.lowSpec = this.softwareRaster;',
'    this.softwareRaster = detectSoftwareRaster();'+E+'    this.lowSpec = this.softwareRaster;'+E+'    // 低配动态 backing：软件光栅下按帧时间在 0.75 -> 0.67 -> 0.60 -> 0.55 之间降档。'+E+'    // 像素数是软件光栅唯一有效的旋钮（perf.md §1.5：1.0=21.7ms、0.75=15.9、0.67=12.6、0.60=10.8、0.55 约 9ms）。'+E+'    this._lowSteps = [0.75, 0.67, 0.60, 0.55];'+E+'    this._lowIdx = 0;'+E+'    this.lowBacking = this._lowSteps[0];'+E+'    this._lowEma = 0;'+E+'    this._lowFrames = 0;'+E+'    this._lowCooldown = 0;'+E+'    this._lowLast = 0;');
rep('    const floor = this.lowSpec ? 0.75 : 1.25;'+E+'    const cap = this.lowSpec ? 0.75 : 2.5;',
'    const floor = this.lowSpec ? this.lowBacking : 1.25;'+E+'    const cap = this.lowSpec ? this.lowBacking : 2.5;');
rep('  begin(bgColor) {'+E+'    const ctx = this.ctx;',
'  begin(bgColor) {'+E+'    this._tuneLowBacking();'+E+'    const ctx = this.ctx;');
rep('  /** 诊断信息快照（供测试断言，不影响渲染逻辑） */',
'  /**'+E+'   * 低配动态 backing：按帧间隔 EMA 决定是否再降一档（只降不升）。'+E+'   * 预算 19ms（约 52fps）触发降档；刚变档的 30 帧不计入，避开改 canvas 尺寸后的首帧长帧。'+E+'   */'+E+'  _tuneLowBacking() {'+E+'    if (!this.lowSpec) return;'+E+'    const n = this._lowSteps.length;'+E+'    const now = performance.now();'+E+'    if (!this._lowLast) { this._lowLast = now; return; }'+E+'    const dt = now - this._lowLast;'+E+'    this._lowLast = now;'+E+'    if (dt <= 0 || dt > 400) return;   // 切后台 / 一次性长卡顿不计入'+E+'    if (this._lowCooldown > 0) { this._lowCooldown--; return; }'+E+'    this._lowEma = this._lowEma ? this._lowEma * 0.9 + dt * 0.1 : dt;'+E+'    this._lowFrames++;'+E+'    if (this._lowEma > 19 && this._lowFrames > 45 && this._lowIdx < n - 1) {'+E+'      this._lowIdx++;'+E+'      this._applyLowBacking();'+E+'    }'+E+'  }'+E+''+E+'  _applyLowBacking() {'+E+'    this.lowBacking = this._lowSteps[this._lowIdx];'+E+'    this._lowEma = 0;'+E+'    this._lowFrames = 0;'+E+'    this._lowCooldown = 30;'+E+'    this.fit();'+E+'    this._syncInfo();'+E+'    this.skipPostFrames(2);'+E+'  }'+E+''+E+'  /** 诊断信息快照（供测试断言，不影响渲染逻辑） */');
rep('      mode: this.lowSpec ? \'soft\' : \'gpu\','+E+'      backing: this.backing,',
'      mode: this.lowSpec ? \'soft\' : \'gpu\','+E+'      backing: this.backing,'+E+'      lowBacking: this.lowBacking,');
fs.writeFileSync(p,s);console.log('patched dynamic low backing');
