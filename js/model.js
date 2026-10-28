/* AERIS-GIS — HYSPLIT-style Lagrangian dispersion & trajectory model (runs in the browser).
   Follows the HYSPLIT approach (Stein et al., 2015; Draxler & Hess, 1998):
   • advection: Petterssen predictor–corrector with space/time interpolated NWP winds
   • turbulence: random-displacement model, Kz/Kh from Pasquill stability & mixed-layer depth
   • vertical: terrain-following inside the boundary layer, constant MSL height above it
   • removal: dry deposition (vd), below-cloud wet scavenging, first-order chemical conversion
   • output: 1-h average concentration on a lat/lon grid for a near-surface layer (0–100 m AGL,
     matching the CanSat profiling depth), Gaussian-smoothed like HYSPLIT's puff/particle hybrid (INITD=3). */
(function () {
  'use strict';
  const U = AERIS.U, MET = AERIS.met, D = AERIS.data, DEG = U.DEG, MPD = U.M_PER_DEG;

  /* Pasquill–Gifford stability from wind speed, insolation (local solar time + cloud) — Turner (1964) */
  function stabilityClass(tMs, lon, cloud, ws10) {
    const lst = ((tMs / 3.6e6 + lon / 15) % 24 + 24) % 24;
    const day = lst >= 7 && lst <= 17.5;
    const s = ws10;
    if (day) {
      const strong = lst >= 10 && lst <= 15 && cloud < 50;
      const moderate = !strong && lst >= 8.5 && lst <= 16.5 && cloud < 80;
      const col = strong ? 0 : moderate ? 1 : 2;
      const table = [['A', 'A', 'B'], ['A', 'B', 'C'], ['B', 'B', 'C'], ['C', 'C', 'D'], ['C', 'D', 'D']];
      const row = s < 2 ? 0 : s < 3 ? 1 : s < 5 ? 2 : s < 6 ? 3 : 4;
      return table[row][col];
    }
    const overcast = cloud >= 50;
    if (s < 2) return overcast ? 'E' : 'F';
    if (s < 3) return overcast ? 'E' : 'F';
    if (s < 5) return overcast ? 'D' : 'E';
    return 'D';
  }
  /* Kz within the mixed layer, Kh horizontal (m²/s) */
  const TURB = {
    A: { kz: 200, kh: 2500, name: 'very unstable' }, B: { kz: 120, kh: 2000, name: 'unstable' },
    C: { kz: 60, kh: 1500, name: 'slightly unstable' }, D: { kz: 20, kh: 1000, name: 'neutral' },
    E: { kz: 5, kh: 600, name: 'slightly stable' }, F: { kz: 1.5, kh: 400, name: 'stable' }
  };
  const FREE_TROP = { kz: 0.3, kh: 800 };
  const FORCED = { convective: 'B', neutral: 'D', stable: 'F' };

  /* ------------------------- trajectories ------------------------- */
  const S1 = {}, S2 = {};
  function trajectory(lat, lon, zMSL, startMs, hours, dir = 1, dtMin = 10) {
    const dt = dtMin * 60;
    const n = Math.round(hours * 3600 / dt);
    const pts = [];
    let la = lat, lo = lon, z = zMSL, t = startMs;
    MET.sample(la, lo, z, t, S1);
    if (!S1.valid) return pts;
    pts.push({ t, lat: la, lon: lo, zMSL: z, zAGL: z - S1.terrain, pblh: S1.pblh });
    for (let s = 0; s < n; s++) {
      MET.sample(la, lo, z, t, S1);
      if (!S1.valid) break;
      const cosl = Math.cos(la * DEG);
      const la1 = la + dir * S1.v * dt / MPD, lo1 = lo + dir * S1.u * dt / (MPD * cosl);
      const t1 = t + dir * dt * 1000;
      MET.sample(la1, lo1, z, t1, S2);
      if (!S2.valid) break;
      const u = 0.5 * (S1.u + S2.u), v = 0.5 * (S1.v + S2.v);
      const zagl = z - S1.terrain;
      const inPBL = zagl < S1.pblh;
      la = la + dir * v * dt / MPD;
      lo = lo + dir * u * dt / (MPD * cosl);
      t = t1;
      const terr = MET.terrainAt(la, lo);
      if (!isFinite(terr)) break;
      z = inPBL ? terr + zagl : Math.max(z, terr + 10);
      MET.sample(la, lo, z, t, S1);
      pts.push({ t, lat: la, lon: lo, zMSL: z, zAGL: z - terr, pblh: S1.valid ? S1.pblh : NaN });
    }
    return pts;
  }

  /* start heights are metres above the vent/site ground (like HYSPLIT's m AGL starting heights) */
  function runTrajectories(p) {
    const out = [];
    const colors = ['#e41a1c', '#1f4fd6', '#139a2c', '#8e44ad', '#ff7f00'];
    const shapes = ['triangle', 'square', 'circle', 'diamond', 'triangle'];
    p.points.forEach((pt) => {
      p.heights.forEach((h, k) => {
        const z = pt.groundMSL + h;
        const pts = trajectory(pt.lat, pt.lon, z, p.startMs, p.hours, p.dir, p.dtMin || 10);
        out.push({ origin: pt.name, originId: pt.id, height: h, dir: p.dir, color: colors[k % 5], shape: shapes[k % 5], pts });
      });
    });
    return out;
  }

  /* closest approach of each trajectory to each volcano (source attribution for backward runs) */
  function attribute(trajs, maxKm = 25) {
    const rows = [];
    trajs.forEach((tr) => {
      D.volcanoes.forEach((v) => {
        let best = Infinity, bi = -1;
        tr.pts.forEach((p, i) => {
          const d = U.haversine(p.lat, p.lon, v.lat, v.lon);
          if (d < best) { best = d; bi = i; }
        });
        if (bi >= 0 && best <= maxKm * 1000) {
          const p = tr.pts[bi];
          rows.push({ height: tr.height, volcano: v.name, volcanoId: v.id, distKm: best / 1000,
            hoursBefore: Math.abs(p.t - tr.pts[0].t) / 3600e3, zAGL: p.zAGL, zMSL: p.zMSL, ventElev: v.elev });
        }
      });
    });
    return rows.sort((a, b) => a.distKm - b.distKm);
  }

  /* ------------------------- concentration grid ------------------------- */
  const NICE = [0.01, 0.0125, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.075, 0.1];
  function autoGrid(sources, trajs, hours, resOpt) {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    const add = (la, lo) => { if (la < minLat) minLat = la; if (la > maxLat) maxLat = la; if (lo < minLon) minLon = lo; if (lo > maxLon) maxLon = lo; };
    sources.forEach((s) => add(s.lat, s.lon));
    trajs.forEach((tr) => tr.pts.forEach((p) => add(p.lat, p.lon)));
    const margin = Math.min(2.5, 0.45 + 0.025 * hours);
    minLat -= margin; maxLat += margin; minLon -= margin; maxLon += margin;
    // cap span at 14°, keeping the sources inside
    const cap = 14;
    if (maxLat - minLat > cap) { const c = U.mean(sources.map((s) => s.lat)); minLat = Math.max(minLat, c - cap / 2); maxLat = minLat + cap; }
    if (maxLon - minLon > cap) { const c = U.mean(sources.map((s) => s.lon)); minLon = Math.max(minLon, c - cap / 2); maxLon = minLon + cap; }
    const span = Math.max(maxLat - minLat, maxLon - minLon);
    let res = resOpt > 0 ? resOpt : NICE.find((r) => span / r <= 340) || 0.1;
    const lon0 = Math.floor(minLon / res) * res, latS = Math.floor(minLat / res) * res;
    const nx = Math.ceil((maxLon - lon0) / res), ny = Math.ceil((maxLat - latS) / res);
    return { lon0, latS, latN: latS + ny * res, res, nx, ny };
  }

  /* separable Gaussian blur, σ ≈ 1 cell */
  const K = [0.054, 0.244, 0.403, 0.244, 0.054];
  function blur(a, nx, ny) {
    const tmp = new Float32Array(a.length);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let s = 0;
      for (let k = -2; k <= 2; k++) { const ii = i + k; if (ii >= 0 && ii < nx) s += a[j * nx + ii] * K[k + 2]; }
      tmp[j * nx + i] = s;
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let s = 0;
      for (let k = -2; k <= 2; k++) { const jj = j + k; if (jj >= 0 && jj < ny) s += tmp[jj * nx + i] * K[k + 2]; }
      a[j * nx + i] = s;
    }
  }

  function sampleGrid(grid, arr, lat, lon) {
    const gx = (lon - grid.lon0) / grid.res - 0.5, gy = (grid.latN - lat) / grid.res - 0.5;
    const i0 = Math.floor(gx), j0 = Math.floor(gy);
    if (i0 < 0 || j0 < 0 || i0 >= grid.nx - 1 || j0 >= grid.ny - 1) return NaN;
    const ax = gx - i0, ay = gy - j0, n = grid.nx;
    return arr[j0 * n + i0] * (1 - ax) * (1 - ay) + arr[j0 * n + i0 + 1] * ax * (1 - ay) +
      arr[(j0 + 1) * n + i0] * (1 - ax) * ay + arr[(j0 + 1) * n + i0 + 1] * ax * ay;
  }

  const PROFILE_EDGES = [0, 20, 40, 60, 80, 100, 150, 200, 300, 500];

  /* ------------------------- dispersion run ------------------------- */
  async function runDispersion(p, onProgress, isCancelled) {
    const sp = D.species[p.species];
    const dt = p.dtMin * 60;
    const nSteps = Math.round(p.hours * 3600 / dt);
    const outH = p.outHours || 1;                 // output / averaging interval (h) — HYSPLIT "sampling interval"
    const sph = Math.max(1, Math.round(outH * 3600 / dt));   // time steps per output frame
    let stepsInFrame = 0;
    const layerTop = p.layerTop;
    const srcs = p.sources.filter((s) => s.rate > 0);
    if (!srcs.length) throw new Error('Every selected source has a zero emission rate for ' + sp.label + '.');
    const log = [];
    const tStart = performance.now();

    // particles per source ∝ emission rate (min 400 so weak sources are still resolved)
    const total = srcs.reduce((a, s) => a + s.rate, 0);
    const alloc = srcs.map((s) => Math.max(400, Math.round(p.nPart * s.rate / total)));
    const N = alloc.reduce((a, b) => a + b, 0);
    const lat = new Float64Array(N), lon = new Float64Array(N), z = new Float32Array(N);
    const mass = new Float64Array(N), m0 = new Float64Array(N), tRel = new Float64Array(N);
    const src = new Uint8Array(N), state = new Uint8Array(N);
    const rand = U.mulberry32(p.seed || 20260926), gauss = U.gaussFactory(rand);
    const relMs = p.releaseHours * 3600e3;
    let k = 0, releasedMass = 0;
    srcs.forEach((s, si) => {
      const kgps = s.rate * 1000 / 86400;
      const tot = kgps * p.releaseHours * 3600;
      releasedMass += tot;
      const n = alloc[si];
      for (let q = 0; q < n; q++, k++) {
        tRel[k] = p.startMs + ((q + rand()) / n) * relMs;
        lat[k] = s.lat + gauss() * 150 / MPD;
        lon[k] = s.lon + gauss() * 150 / (MPD * Math.cos(s.lat * DEG));
        z[k] = s.ventMSL + rand() * s.rise;      // vertical line source: vent → vent + plume rise
        mass[k] = m0[k] = tot / n;
        src[k] = si;
      }
    });
    log.push(`Particles: ${N.toLocaleString()} (${srcs.map((s, i) => `${s.name}: ${alloc[i]}`).join(', ')})`);

    // grid extent from quick mean-wind trajectories (like choosing HYSPLIT's grid span)
    const pre = [];
    srcs.forEach((s) => [10, s.rise * 0.5, s.rise + 600].forEach((h) => pre.push({ pts: trajectory(s.lat, s.lon, s.ventMSL + h, p.startMs, p.hours, 1, 20) })));
    const grid = autoGrid(srcs, pre, p.hours, p.res);
    const { nx, ny, res, lon0, latN } = grid;
    const vol = new Float64Array(ny);
    for (let j = 0; j < ny; j++) {
      const lc = latN - (j + 0.5) * res;
      vol[j] = (res * MPD) * (res * MPD * Math.cos(lc * DEG)) * layerTop;
    }
    log.push(`Concentration grid: ${nx} × ${ny} cells @ ${res}° (≈${(res * 111).toFixed(1)} km), layer 0–${layerTop} m AGL`);

    const acc = new Float64Array(nx * ny);
    const maxConc = new Float32Array(nx * ny);
    const arrival = new Float32Array(nx * ny).fill(NaN);
    const thr0 = sp.classes[0];
    const frames = [], snaps = [];
    const recs = D.receptors.map((r) => ({ name: r.name, lat: r.lat, lon: r.lon, series: [], max: 0, tMax: null, arrival: null }));
    const profPts = (p.profilePoints || []).map((pp) => ({ ...pp, cosl: Math.cos(pp.lat * DEG) }));
    const nb = PROFILE_EDGES.length - 1;
    const profAcc = profPts.map(() => new Float64Array(nb));
    const profiles = profPts.map(() => []);
    const SIG_P = 2500, SIG2 = 2 * SIG_P * SIG_P, PNORM = 1 / (Math.PI * SIG2);
    const stabCount = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
    let dry = 0, wet = 0, chem = 0, outDom = 0;
    const A = {}, B = {};
    const dispStride = Math.max(1, Math.ceil(N / 7000));
    const vdz = 75; // deposition layer depth (m)

    for (let s = 0; s < nSteps; s++) {
      const t = p.startMs + s * dt * 1000, tn = t + dt * 1000;
      for (let q = 0; q < N; q++) {
        let st = state[q];
        if (st === 2) continue;
        if (st === 0) { if (tRel[q] <= tn) { state[q] = 1; } else continue; }
        MET.sample(lat[q], lon[q], z[q], t, A);
        if (!A.valid) { state[q] = 2; outDom += mass[q]; continue; }
        const la = lat[q], lo = lon[q], cosl = Math.cos(la * DEG);
        MET.sample(la + A.v * dt / MPD, lo + A.u * dt / (MPD * cosl), z[q], tn, B);
        let u = A.u, v = A.v;
        if (B.valid) { u = 0.5 * (A.u + B.u); v = 0.5 * (A.v + B.v); }
        let zagl = z[q] - A.terrain;
        if (zagl < 0.5) zagl = 0.5;
        const inPBL = zagl < A.pblh;
        let cls = p.turbulence === 'auto' ? stabilityClass(t, lo, A.cloud, A.ws10) : FORCED[p.turbulence];
        if (q % 97 === 0) stabCount[cls]++;
        const T = inPBL ? TURB[cls] : FREE_TROP;
        const sh = Math.sqrt(2 * T.kh * dt);
        const nla = la + (v * dt + sh * gauss()) / MPD;
        const nlo = lo + (u * dt + sh * gauss()) / (MPD * cosl);
        let zn = zagl + Math.sqrt(2 * T.kz * dt) * gauss();
        if (zn < 0) zn = -zn;
        if (inPBL && zn > A.pblh) zn = Math.max(0.5, 2 * A.pblh - zn);
        const terrN = MET.terrainAt(nla, nlo);
        if (!isFinite(terrN)) { state[q] = 2; outDom += mass[q]; continue; }
        let zm = inPBL ? terrN + zn : A.terrain + zn;
        if (zm < terrN + 1) zm = terrN + 1;
        lat[q] = nla; lon[q] = nlo; z[q] = zm;
        const za = zm - terrN;
        let m = mass[q];
        if (p.dry && sp.vd > 0 && za < vdz) { const f = Math.exp(-sp.vd * dt / vdz); dry += m * (1 - f); m *= f; }
        if (p.wet && sp.wetA > 0 && A.precip > 0.05 && za < 4000) {
          const f = Math.exp(-sp.wetA * Math.pow(A.precip, 0.64) * dt); wet += m * (1 - f); m *= f;
        }
        if (p.chem && sp.kchem > 0) {
          const pct = sp.kchem + (A.rh > 70 ? (sp.kchemWet - sp.kchem) * (A.rh - 70) / 30 : 0);
          const f = Math.exp(-pct / 100 / 3600 * dt); chem += m * (1 - f); m *= f;
        }
        mass[q] = m;
        if (m < m0[q] * 1e-4) { state[q] = 2; continue; }
        // accumulate into the 0–layerTop grid (cloud-in-cell)
        if (za <= layerTop) {
          const gx = (nlo - lon0) / res - 0.5, gy = (latN - nla) / res - 0.5;
          const i0 = Math.floor(gx), j0 = Math.floor(gy);
          if (i0 >= 0 && j0 >= 0 && i0 < nx - 1 && j0 < ny - 1) {
            const ax = gx - i0, ay = gy - j0, b0 = j0 * nx + i0;
            acc[b0] += m * (1 - ax) * (1 - ay); acc[b0 + 1] += m * ax * (1 - ay);
            acc[b0 + nx] += m * (1 - ax) * ay; acc[b0 + nx + 1] += m * ax * ay;
          }
        }
        // vertical profile at requested points (e.g. the CanSat site)
        for (let r = 0; r < profPts.length; r++) {
          const P = profPts[r];
          const dy = (nla - P.lat) * MPD, dx = (nlo - P.lon) * MPD * P.cosl;
          if (Math.abs(dx) > 3 * SIG_P || Math.abs(dy) > 3 * SIG_P) continue;
          if (za >= PROFILE_EDGES[nb]) continue;
          let b = 0; while (za >= PROFILE_EDGES[b + 1]) b++;
          profAcc[r][b] += m * PNORM * Math.exp(-(dx * dx + dy * dy) / SIG2) / (PROFILE_EDGES[b + 1] - PROFILE_EDGES[b]);
        }
      }

      stepsInFrame++;
      if ((s + 1) % sph === 0 || s === nSteps - 1) {
        const hIdx = frames.length;
        const tEnd = Math.min(p.startMs + (hIdx + 1) * outH * 3600e3, p.startMs + p.hours * 3600e3);
        const hrsEnd = (tEnd - p.startMs) / 3600e3;
        const nAvg = stepsInFrame;
        stepsInFrame = 0;
        const conc = new Float32Array(nx * ny);
        for (let j = 0; j < ny; j++) {
          const f = 1e9 / (nAvg * vol[j]);
          for (let i = 0; i < nx; i++) conc[j * nx + i] = acc[j * nx + i] * f;
        }
        blur(conc, nx, ny);
        let fmax = 0;
        for (let c = 0; c < conc.length; c++) {
          const val = conc[c];
          if (val > fmax) fmax = val;
          if (val > maxConc[c]) maxConc[c] = val;
          if (val >= thr0 && !(arrival[c] >= 0)) arrival[c] = hrsEnd;
        }
        frames.push({ t: tEnd, conc, max: fmax });
        recs.forEach((r) => {
          const c = sampleGrid(grid, conc, r.lat, r.lon);
          const val = isFinite(c) ? c : null;
          r.series.push(val);
          if (val !== null && val > r.max) { r.max = val; r.tMax = tEnd; }
          if (val !== null && val >= thr0 && r.arrival === null) r.arrival = hrsEnd;
        });
        profPts.forEach((P, r) => {
          profiles[r].push(Array.from(profAcc[r], (x) => x * 1e9 / nAvg));
          profAcc[r].fill(0);
        });
        // particle snapshot for display / animation
        const sl = [], so = [], sz = [], sa = [], ss = [];
        for (let q = 0; q < N; q += dispStride) {
          if (state[q] !== 1) continue;
          const terr = MET.terrainAt(lat[q], lon[q]);
          sl.push(lat[q]); so.push(lon[q]); sz.push(z[q] - (isFinite(terr) ? terr : 0));
          sa.push((tEnd - tRel[q]) / 3600e3); ss.push(src[q]);
        }
        snaps.push({ t: tEnd, lat: Float32Array.from(sl), lon: Float32Array.from(so), z: Float32Array.from(sz), age: Float32Array.from(sa), src: Uint8Array.from(ss) });
        acc.fill(0);
      }
      if (await U.maybeYield(50)) {
        onProgress && onProgress((s + 1) / nSteps);
        if (isCancelled && isCancelled()) throw new Error('Run cancelled by user.');
      }
    }

    let airborne = 0, active = 0;
    for (let q = 0; q < N; q++) if (state[q] === 1) { airborne += mass[q]; active++; }
    const stabTotal = Object.values(stabCount).reduce((a, b) => a + b, 0) || 1;
    const stabMix = Object.entries(stabCount).filter(([, c]) => c > 0).map(([c, n]) => `${c} ${(100 * n / stabTotal).toFixed(0)}%`).join(', ');
    log.push(`Stability mix (Pasquill): ${stabMix}`);
    log.push(`Mass budget: released ${U.fmtSig(releasedMass / 1000)} t · airborne ${U.fmtSig(airborne / 1000)} t · dry dep ${U.fmtSig(dry / 1000)} t · wet dep ${U.fmtSig(wet / 1000)} t · chemical loss ${U.fmtSig(chem / 1000)} t · left domain ${U.fmtSig(outDom / 1000)} t`);
    log.push(`Run time: ${((performance.now() - tStart) / 1000).toFixed(1)} s`);

    const peak = frames.reduce((a, f) => Math.max(a, f.max), 0);
    return {
      id: 'run-' + Date.now(), params: p, species: p.species, sources: srcs, grid, frames, snaps, outH,
      maxConc, arrival, receptors: recs.filter((r) => r.series.some((v) => v !== null)),
      profiles: profPts.map((P, r) => ({ lat: P.lat, lon: P.lon, name: P.name, edges: PROFILE_EDGES, hours: profiles[r] })),
      budget: { released: releasedMass, airborne, dry, wet, chem, outDom }, nParticles: N, active, peak, stabMix, log
    };
  }

  AERIS.model = { runDispersion, runTrajectories, trajectory, attribute, stabilityClass, TURB, sampleGrid, PROFILE_EDGES };
})();
