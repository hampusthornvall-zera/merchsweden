import * as THREE from 'https://unpkg.com/three@0.184.0/build/three.module.js';

const GW = 100, GH = 115, TS = 2;
const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });

function heightField(img, prof) {
  const c = document.createElement('canvas'); c.width = GW; c.height = GH;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, GW, GH);
  const a = x.getImageData(0, 0, GW, GH).data, N = GW * GH, d = new Float32Array(N), id = (i, j) => j * GW + i;
  for (let i = 0; i < N; i++) d[i] = a[i * 4 + 3] > 140 ? 1e6 : 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const k = id(i, j); if (!d[k]) continue;
    if (!i || !j || i === GW - 1 || j === GH - 1) { d[k] = 1; continue; }
    d[k] = Math.min(d[k], d[id(i - 1, j)] + 1, d[id(i, j - 1)] + 1, d[id(i - 1, j - 1)] + 1.414, d[id(i + 1, j - 1)] + 1.414); }
  for (let j = GH - 1; j >= 0; j--) for (let i = GW - 1; i >= 0; i--) { const k = id(i, j); if (!d[k] || !i || !j || i === GW - 1 || j === GH - 1) continue;
    d[k] = Math.min(d[k], d[id(i + 1, j)] + 1, d[id(i, j + 1)] + 1, d[id(i + 1, j + 1)] + 1.414, d[id(i - 1, j + 1)] + 1.414); }
  let maxD = 1; for (let i = 0; i < N; i++) if (d[i] > maxD) maxD = d[i];
  let z = new Float32Array(N);
  for (let i = 0; i < N; i++) { if (!d[i]) continue; const dd = d[i] - 1, e = Math.min(dd / prof.r, 1), edge = 1 - (1 - e) * (1 - e);
    z[i] = edge * (prof.e + prof.g * Math.sqrt(dd / maxD)); }
  for (let p = 0; p < 2; p++) { const o = new Float32Array(N);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) continue; s += z[id(ii, jj)]; n++; }
      o[id(i, j)] = d[id(i, j)] ? s / n : 0; }
    z = o; }
  return z;
}

function buildGeo(z, back) {
  const g = new THREE.PlaneGeometry(400, 460, GW - 1, GH - 1), p = g.attributes.position, uv = g.attributes.uv;
  for (let k = 0; k < p.count; k++) { const ix = k % GW, iy = (k / GW) | 0;
    if (back) { p.setZ(k, -z[iy * GW + (GW - 1 - ix)]); uv.setX(k, 1 - uv.getX(k)); } else p.setZ(k, z[k]); }
  if (back) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k]; ix[k] = ix[k + 1]; ix[k + 1] = t; } }
  g.computeVertexNormals();
  return g;
}

function drawArt(ctx, layers, area, cssW) {
  if (!layers || !layers.length) return Promise.resolve();
  const u = 400 / (cssW || 400), [al, at, aw, ah] = area;
  ctx.save(); ctx.scale(TS, TS);
  ctx.beginPath(); ctx.rect(al * 4, at * 4.6, aw * 4, ah * 4.6); ctx.clip();
  return Promise.all(layers.map(l => l.type === 'image' ? loadImg(l.src).catch(() => null) : null)).then(imgs => {
    layers.forEach((l, i) => {
      const cx = (al + aw * l.x / 100) * 4, cy = (at + ah * l.y / 100) * 4.6;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate((l.rot || 0) * Math.PI / 180);
      if (l.type === 'text') { ctx.font = Math.round(28 * l.scale) * u + "px '" + l.font + "'"; ctx.fillStyle = l.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l.text, 0, 0); }
      else if (imgs[i]) { const w = 110 * l.scale * u, h = w * imgs[i].height / imgs[i].width; ctx.drawImage(imgs[i], -w / 2, -h / 2, w, h); }
      ctx.restore();
    });
    ctx.restore();
  });
}

export class Garment3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(16, 400 / 460, 10, 10000);
    this.cam.position.set(0, 0, (460 * 1.2 / 2) / Math.tan(THREE.MathUtils.degToRad(8)));
    this.cam.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xcfcac0, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(-300, 420, 700); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 1.3); rim.position.set(420, 160, -600); this.scene.add(rim);
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.angle = 0; this.showArt = false; this.sides = null;
  }
  resize(w, h) { if (!w || !h) return; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.draw(); }
  async set(front, back, prof, mp) {
    const tok = this._tok = (this._tok || 0) + 1;
    const [fi, bi] = await Promise.all([loadImg(front), loadImg(back)]);
    if (tok !== this._tok) return;
    const mk = (img, isBack) => {
      const base = document.createElement('canvas'); base.width = 400 * TS; base.height = 460 * TS; base.getContext('2d').drawImage(img, 0, 0, base.width, base.height);
      const tc = document.createElement('canvas'); tc.width = base.width; tc.height = base.height; tc.getContext('2d').drawImage(base, 0, 0);
      const tex = new THREE.CanvasTexture(tc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const mesh = new THREE.Mesh(buildGeo(heightField(img, prof), isBack), new THREE.MeshStandardMaterial({ map: tex, alphaTest: .5, side: THREE.DoubleSide, roughness: mp.rough, metalness: mp.metal }));
      return { base, tc, tex, mesh };
    };
    const sides = { front: mk(fi, false), back: mk(bi, true) };
    this.group.children.forEach(m => { m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); });
    this.group.clear(); this.group.add(sides.front.mesh, sides.back.mesh);
    this.sides = sides; this._artKey = null;
    await this.compose();
  }
  setArt(art) { this.art = art; return this.compose(); }
  setShowArt(v) { if (this.showArt === v) return; this.showArt = v; this.compose(); }
  async compose() {
    if (!this.sides) return this.draw();
    const key = this.showArt ? JSON.stringify(this.art || null) : 'none';
    if (key === this._artKey) return this.draw();
    this._artKey = key;
    for (const s of ['front', 'back']) {
      const S = this.sides[s], ctx = S.tc.getContext('2d');
      ctx.clearRect(0, 0, S.tc.width, S.tc.height); ctx.drawImage(S.base, 0, 0);
      if (this.showArt && this.art) await drawArt(ctx, this.art.layers[s], this.art.area, this.art.cssW);
      S.tex.needsUpdate = true;
    }
    this.draw();
  }
  setAngle(a) { this.angle = a; this.draw(); }
  draw() { this.group.rotation.y = THREE.MathUtils.degToRad(this.angle); this.r.render(this.scene, this.cam); }
  dispose() { this.group.children.forEach(m => { m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); }); this.r.dispose(); }
}
