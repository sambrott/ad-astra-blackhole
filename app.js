const PHRASE = "LOSS OF SIGNAL ";
const MAX_DPR = 2;
const DISC_COUNT = 96;
const PARTICLE_COUNT = 3328;
const FONT_PREFIX = '400 ';
const FONT_SUFFIX = 'px "IBM Plex Mono", monospace';

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInExpo = (t) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1)));

/** Top “full phrase” band: fewer labels, longer runs only (less clutter). */
const TOP_FULL_FRAC = 0.028;
const TOP_FULL_MIN = 28;
const TOP_LEN_MIN = 8;
const TOP_LEN_MAX = 14;

class BlackHole extends HTMLElement {
  connectedCallback() {
    this.canvas = this.querySelector(".js-canvas");
    this.ctx = this.canvas.getContext("2d", { alpha: false }) || this.canvas.getContext("2d");
    this.tick = this.tick.bind(this);
    this.onResize = this.onResize.bind(this);
    this.bins = Array.from({ length: 27 }, () => []);
    this.ready();
  }

  async ready() {
    await document.fonts.ready;
    this.resize();
    window.addEventListener("resize", this.onResize);
    requestAnimationFrame(this.tick);
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this.onResize);
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
  }

  onResize() {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.resize(), 100);
  }

  resize() {
    const rect = this.getBoundingClientRect();
    const dpi = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.render = {
      width: rect.width,
      height: rect.height,
      dpi,
      x: rect.width * 0.5,
      y: 0,
      w: rect.width,
      h: rect.height,
    };
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpi));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpi));
    this.makeDiscs();
    this.makeParticles();
  }

  makeDiscs() {
    const discs = [];
    for (let i = 0; i < DISC_COUNT; i++) {
      discs.push(this.mapDisc({ p: i / DISC_COUNT }));
    }
    this.discs = discs;
  }

  slicePhrase(start, len) {
    let out = "";
    for (let i = 0; i < len; i++) out += PHRASE[(start + i) % PHRASE.length];
    return out;
  }

  breakText(input, strength) {
    const out = [];
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      const r = Math.random();
      if (ch === " ") {
        out.push(r < strength * 0.35 ? "  " : " ");
        continue;
      }
      if (r < strength * 0.08) continue;
      if (r < strength * 0.2) out.push("_");
      else if (r < strength * 0.34) out.push(" ");
      else out.push(ch);
    }
    return out
      .join("")
      .replace(/\bLOSS\b/g, "LOS_S")
      .replace(/\bOF\b/g, "O_F")
      .replace(/\bSIGNAL\b/g, "SIG_NAL");
  }

  /** Same damage loop as `breakText`, without word-splitting regex (top band only). */
  breakTextLight(input, strength) {
    const out = [];
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      const r = Math.random();
      if (ch === " ") {
        out.push(r < strength * 0.35 ? "  " : " ");
        continue;
      }
      if (r < strength * 0.08) continue;
      if (r < strength * 0.2) out.push("_");
      else if (r < strength * 0.34) out.push(" ");
      else out.push(ch);
    }
    return out.join("");
  }

  sampleParticle(discs) {
    const d = discs[(Math.random() * discs.length) | 0];
    const depth = d.sx * d.sy;
    const legibility = Math.pow(Math.max(0.0001, depth), 0.55);
    const len =
      legibility > 0.55 ? 4 + ((Math.random() * 5) | 0) :
      legibility > 0.25 ? 2 + ((Math.random() * 4) | 0) :
      1 + ((Math.random() * 3) | 0);
    const a = Math.random() * Math.PI * 2;
    const p = Math.random();
    const angle = a + Math.PI * 2 * p;
    const px = d.x + Math.cos(angle) * d.w;
    const py = d.y + Math.sin(angle) * d.h + d.h;
    return { d, a, p, depth, legibility, len, px, py };
  }

  makeParticles() {
    const { w, h } = this.render;
    const tape = PHRASE.length;
    const topY = h * 0.36;
    const maxTop = Math.max(TOP_FULL_MIN, Math.floor(PARTICLE_COUNT * TOP_FULL_FRAC));
    this.fullWordTarget = maxTop;
    this.topY = topY;
    const particles = [];
    const discs = this.discs;
    let guard = 0;

    while (particles.length < maxTop && guard++ < 120000) {
      const s = this.sampleParticle(discs);
      if (s.py >= topY) continue;
      if (Math.random() > 0.48) continue;
      const len = TOP_LEN_MIN + ((Math.random() * (TOP_LEN_MAX - TOP_LEN_MIN + 1)) | 0);
      const cx = Math.max(0, Math.min(w, s.px));
      const start =
        ((Math.floor((cx / w) * tape * 10) % (tape * 64)) + tape * 64) % (tape * 64);
      const tBand = s.py / topY;
      const subtle = 0.02 + tBand * tBand * 0.09;
      const text = this.breakTextLight(this.slicePhrase(start, len), subtle);
      particles.push({
        d: s.d,
        a: s.a,
        p: s.p,
        o: 0.35 + Math.random() * 0.65,
        full: true,
        len,
        text,
      });
    }

    guard = 0;
    while (particles.length < PARTICLE_COUNT && guard++ < 200000) {
      const s = this.sampleParticle(discs);
      if (s.py < topY) continue;
      const damage = 0.14 + (1 - s.legibility) * 0.78;
      const startR = (Math.random() * tape * 64) | 0;
      particles.push({
        d: s.d,
        a: s.a,
        p: s.p,
        o: 0.35 + Math.random() * 0.65,
        full: false,
        len: s.len,
        text: this.breakText(this.slicePhrase(startR, s.len), damage),
      });
    }

    let g3 = 0;
    while (particles.length < PARTICLE_COUNT && g3++ < 800000) {
      const s = this.sampleParticle(discs);
      if (s.py < topY) continue;
      const damage = 0.14 + (1 - s.legibility) * 0.78;
      const startR = (Math.random() * tape * 64) | 0;
      particles.push({
        d: s.d,
        a: s.a,
        p: s.p,
        o: 0.35 + Math.random() * 0.65,
        full: false,
        len: s.len,
        text: this.breakText(this.slicePhrase(startR, s.len), damage),
      });
    }
    while (particles.length < PARTICLE_COUNT) {
      const s = this.sampleParticle(discs);
      const damage = 0.14 + (1 - s.legibility) * 0.78;
      const startR = (Math.random() * tape * 64) | 0;
      particles.push({
        d: s.d,
        a: s.a,
        p: s.p,
        o: 0.35 + Math.random() * 0.65,
        full: false,
        len: s.len,
        text: this.breakText(this.slicePhrase(startR, s.len), damage),
      });
    }

    this.particles = particles;
  }

  mapDisc(d) {
    d.sx = 1 - easeOutCubic(d.p);
    d.sy = 1 - easeOutExpo(d.p);
    d.w = this.render.w * d.sx;
    d.h = this.render.h * d.sy;
    d.x = this.render.x;
    d.y = this.render.y + d.p * this.render.h;
    return d;
  }

  moveDiscs() {
    for (let i = 0; i < this.discs.length; i++) {
      const d = this.discs[i];
      d.p = (d.p + 0.0003) % 1;
      this.mapDisc(d);
      const p = d.sx * d.sy;
      d.a = p < 0.01 ? Math.pow(Math.min(p / 0.01, 1), 3) : p > 0.2 ? 1 - Math.min((p - 0.2) / 0.8, 1) : 1;
    }
  }

  moveParticles() {
    for (let i = 0; i < this.particles.length; i++) {
      const dot = this.particles[i];
      const depth = dot.d.sx * dot.d.sy;
      dot.p = (dot.p + 0.00045 * easeInExpo(1 - depth)) % 1;
    }
  }

  particleXY(dot) {
    const angle = dot.a + Math.PI * 2 * dot.p;
    return {
      px: dot.d.x + Math.cos(angle) * dot.d.w,
      py: dot.d.y + Math.sin(angle) * dot.d.h + dot.d.h,
    };
  }

  demoteParticle(dot) {
    const tape = PHRASE.length;
    const depth = dot.d.sx * dot.d.sy;
    const legibility = Math.pow(Math.max(0.0001, depth), 0.55);
    const len =
      legibility > 0.55 ? 4 + ((Math.random() * 5) | 0) :
      legibility > 0.25 ? 2 + ((Math.random() * 4) | 0) :
      1 + ((Math.random() * 3) | 0);
    const damage = 0.14 + (1 - legibility) * 0.78;
    const startR = (Math.random() * tape * 64) | 0;
    dot.len = len;
    dot.text = this.breakText(this.slicePhrase(startR, len), damage);
    dot.full = false;
  }

  promoteParticle(dot) {
    const { w, h } = this.render;
    const tape = PHRASE.length;
    const topY = this.topY;
    const { px, py } = this.particleXY(dot);
    const len = TOP_LEN_MIN + ((Math.random() * (TOP_LEN_MAX - TOP_LEN_MIN + 1)) | 0);
    const cx = Math.max(0, Math.min(w, px));
    const start =
      ((Math.floor((cx / w) * tape * 10) % (tape * 64)) + tape * 64) % (tape * 64);
    const tBand = Math.min(1, py / topY);
    const subtle = 0.02 + tBand * tBand * 0.09;
    dot.len = len;
    dot.text = this.breakTextLight(this.slicePhrase(start, len), subtle);
    dot.full = true;
  }

  /** Keep ~`fullWordTarget` full-word labels in the top band as motion moves particles. */
  replenishFullWords() {
    const { w, h } = this.render;
    const topY = this.topY;
    const target = this.fullWordTarget;
    const particles = this.particles;
    let fullInTop = 0;
    const promotePool = [];
    const demoteIdx = [];

    for (let i = 0; i < particles.length; i++) {
      const dot = particles[i];
      const { px, py } = this.particleXY(dot);
      if (dot.full) {
        if (py < topY) fullInTop++;
        else demoteIdx.push(i);
      } else if (py < topY) promotePool.push(i);
    }

    for (let j = 0; j < demoteIdx.length; j++) {
      this.demoteParticle(particles[demoteIdx[j]]);
    }

    let need = target - fullInTop;
    if (need <= 0 || !promotePool.length) return;
    const n = Math.min(need, promotePool.length, 8);
    for (let k = 0; k < n; k++) {
      const ri = (Math.random() * promotePool.length) | 0;
      const idx = promotePool.splice(ri, 1)[0];
      this.promoteParticle(particles[idx]);
    }
  }

  draw() {
    const { ctx } = this;
    const bins = this.bins;
    for (let i = 0; i < bins.length; i++) bins[i].length = 0;

    const topY = this.topY;
    for (let i = 0; i < this.particles.length; i++) {
      const dot = this.particles[i];
      const alpha = dot.d.a * dot.o;
      if (alpha < 0.02) continue;
      const depth = dot.d.sx * dot.d.sy;
      const fs = Math.round(5 + depth * 26);
      const bin = Math.min(bins.length - 1, Math.max(0, fs - 5));
      const angle = dot.a + Math.PI * 2 * dot.p;
      const px = dot.d.x + Math.cos(angle) * dot.d.w;
      const py = dot.d.y + Math.sin(angle) * dot.d.h + dot.d.h;
      if (py < topY && !dot.full) continue;
      bins[bin].push({
        x: px,
        y: py,
        a: alpha,
        t: dot.text,
      });
    }

    ctx.fillStyle = "#f2f2f2";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    for (let i = 0; i < bins.length; i++) {
      const batch = bins[i];
      if (!batch.length) continue;
      ctx.font = FONT_PREFIX + (i + 5) + FONT_SUFFIX;
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        ctx.globalAlpha = item.a;
        ctx.fillText(item.t, item.x, item.y);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawDiscs() {
    const { ctx } = this;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < this.discs.length; i++) {
      const d = this.discs[i];
      ctx.globalAlpha = d.a * 0.9;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y + d.h, d.w, d.h, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  tick() {
    if (!this.render) {
      requestAnimationFrame(this.tick);
      return;
    }
    const { ctx, canvas, render } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(render.dpi, render.dpi);
    this.moveDiscs();
    this.moveParticles();
    this.replenishFullWords();
    this.drawDiscs();
    this.draw();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    requestAnimationFrame(this.tick);
  }
}

customElements.define("black-hole", BlackHole);
