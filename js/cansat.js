/* AERIS-GIS — CanSat mission simulator (Project AERIS proposal §IV, D.2–D.9).
   Drone ascent → servo release at 100 m AGL → canopy inflation → ~4 m/s descent with wind drift →
   1 Hz sensor sampling (with datasheet response lags / noise) → LoRa telemetry with CRC-16 →
   microSD backup → post-flight completeness, packet-delivery and per-flight regression statistics. */
(function () {
  'use strict';
  const U = AERIS.U, D = AERIS.data, MET = AERIS.met, MODEL = AERIS.model, DEG = U.DEG;
  const G = 9.80665, RD = 287.05, Z0 = 0.3;

  const esat = (Tc) => 6.112 * Math.exp(17.62 * Tc / (243.12 + Tc)); // hPa (Magnus)
  function airDensity(P, Tc, RH) {
    const e = (RH / 100) * esat(Tc);
    const Tv = (Tc + 273.15) / (1 - 0.378 * e / P);
    return P * 100 / (RD * Tv);
  }
  const terminalVelocity = (m, cd, rho, d) => Math.sqrt(2 * m * G / (rho * cd * Math.PI * d * d / 4));
  const canopyForSpeed = (m, cd, rho, v) => Math.sqrt(4 * (2 * m * G / (rho * cd * v * v)) / Math.PI);

  /* Briggs (1973) rural dispersion coefficients for the local hot-spring vent plume */
  function briggs(cls, x) {
    const sy = { A: 0.22, B: 0.16, C: 0.11, D: 0.08, E: 0.06, F: 0.04 }[cls] * x / Math.sqrt(1 + 0.0001 * x);
    let sz;
    switch (cls) {
      case 'A': sz = 0.20 * x; break;
      case 'B': sz = 0.12 * x; break;
      case 'C': sz = 0.08 * x / Math.sqrt(1 + 0.0002 * x); break;
      case 'D': sz = 0.06 * x / Math.sqrt(1 + 0.0015 * x); break;
      case 'E': sz = 0.03 * x / (1 + 0.0003 * x); break;
      default: sz = 0.016 * x / (1 + 0.0003 * x);
    }
    return [Math.hypot(sy, 5), Math.hypot(sz, 2)];
  }

  /* ---------------- environment at the site for a given time ---------------- */
  function buildEnv(pt, tMs, cfg, results) {
    const V = (k, dir) => MET.pointValue(pt, k, tMs, dir);
    const lst = ((tMs / 3.6e6 + cfg.site.lon / 15) % 24 + 24) % 24;
    const env = {
      t: tMs, lst, source: pt.source,
      T2: V('temperature_2m'), RH2: V('relative_humidity_2m'), Ps: V('surface_pressure'),
      precip: V('precipitation'), wcode: V('weather_code'), vis: V('visibility'), cape: V('cape'),
      cloud: V('cloud_cover'), pblh: V('boundary_layer_height'), gust10: V('wind_gusts_10m'),
      wind: [10, 80, 120].map((z) => ({ z, ws: V('wind_speed_' + z + 'm'), wd: V('wind_direction_' + z + 'm', true) })),
      groundElev: pt.elev
    };
    if (!isFinite(env.Ps)) env.Ps = 1013.25 * Math.exp(-(pt.elev || 0) / 8400);
    if (!isFinite(env.T2)) env.T2 = 28;
    if (!isFinite(env.RH2)) env.RH2 = 80;
    if (!isFinite(env.cloud)) env.cloud = 50;
    if (!isFinite(env.gust10)) env.gust10 = env.wind[0].ws * 1.7;
    env.wind.forEach((w) => { if (!isFinite(w.ws)) { w.ws = 2; w.wd = 90; } });
    const aq = (k) => MET.aqValue(pt, k, tMs);
    env.pm25 = isFinite(aq('pm2_5')) ? aq('pm2_5') : 12;
    env.pm10 = isFinite(aq('pm10')) ? aq('pm10') : 20;
    env.so2bg = isFinite(aq('sulphur_dioxide')) ? aq('sulphur_dioxide') : 2;   // µg/m³ (CAMS)
    env.co2bg = isFinite(aq('carbon_dioxide')) ? aq('carbon_dioxide') : 425;   // ppm (CAMS)
    env.aqSource = pt.aq ? pt.aq.source : 'assumed background';
    env.cls = MODEL.stabilityClass(tMs, cfg.site.lon, env.cloud, env.wind[0].ws);
    // regional volcanic plume profiles (from dispersion runs covering this time, near the site)
    env.regional = {};
    env.regionalInfo = [];
    Object.values(results || {}).forEach((res) => {
      if (!res || !res.profiles || !res.profiles.length) return;
      const pr = res.profiles[0];
      if (U.haversine(pr.lat, pr.lon, cfg.site.lat, cfg.site.lon) > 3000) return;
      const h = Math.floor((tMs - res.params.startMs) / ((res.outH || 1) * 3600e3));
      if (h < 0 || h >= pr.hours.length) return;
      const bins = pr.hours[h], edges = pr.edges;
      const centers = edges.slice(0, -1).map((e, i) => (e + edges[i + 1]) / 2);
      env.regional[res.species] = (z) => {
        if (z <= centers[0]) return bins[0];
        for (let i = 1; i < centers.length; i++) if (z <= centers[i]) {
          const f = (z - centers[i - 1]) / (centers[i] - centers[i - 1]);
          return bins[i - 1] + (bins[i] - bins[i - 1]) * f;
        }
        return bins[bins.length - 1];
      };
      env.regionalInfo.push(`${D.species[res.species].label} from ${res.sources.map((s) => s.name).join(' + ')} (run ${U.fmtUTC(res.params.startMs)})`);
    });
    return env;
  }

  /* ---------------- vertical structure of the true atmosphere ---------------- */
  function stabWeight(lst) { // +1 convective day, −1 nocturnal inversion
    if (lst >= 9 && lst <= 16) return 1;
    if (lst >= 19 || lst <= 6) return -1;
    if (lst > 6 && lst < 9) return -1 + 2 * (lst - 6) / 3;
    return 1 - 2 * (lst - 16) / 3;
  }
  function tempAt(env, z) {
    const zz = Math.max(z, 2), w = stabWeight(env.lst);
    const ln = Math.log(zz / 2) / Math.log(50);
    return w >= 0 ? env.T2 - 0.0098 * (zz - 2) - w * 1.2 * ln
      : env.T2 - 0.0098 * (zz - 2) * (1 + w) + (-w) * 2.5 * ln;
  }
  function presAt(env, z) {
    const Tm = (tempAt(env, 2) + tempAt(env, Math.max(z, 2))) / 2 + 273.15;
    return env.Ps * Math.exp(-G * z / (RD * Tm * 1.006));
  }
  function rhAt(env, z) {
    const e2 = env.RH2 / 100 * esat(env.T2);
    const e = e2 * presAt(env, z) / env.Ps;
    return U.clamp(100 * e / esat(tempAt(env, z)), 5, 100);
  }
  function windUV(env, z) {
    const L = env.wind;
    const uv = L.map((w) => U.wsWdToUV(w.ws, w.wd));
    if (z <= L[0].z) {
      const f = U.clamp(Math.log(Math.max(z, 0.3) / Z0) / Math.log(L[0].z / Z0), 0, 1);
      return [uv[0][0] * f, uv[0][1] * f];
    }
    for (let i = 1; i < L.length; i++) if (z <= L[i].z) {
      const f = Math.log(z / L[i - 1].z) / Math.log(L[i].z / L[i - 1].z);
      return [uv[i - 1][0] + (uv[i][0] - uv[i - 1][0]) * f, uv[i - 1][1] + (uv[i][1] - uv[i - 1][1]) * f];
    }
    const n = L.length - 1;
    const alpha = U.clamp(Math.log(Math.max(L[n].ws, 0.1) / Math.max(L[n - 1].ws, 0.1)) / Math.log(L[n].z / L[n - 1].z), 0, 0.5);
    const f = Math.pow(z / L[n].z, alpha);
    return [uv[n][0] * f, uv[n][1] * f];
  }
  function localPlume(env, cfg, key, x, y, z) {
    const Q = cfg.vent.q[key];
    if (!(Q > 0)) return 0;
    const [u, v] = windUV(env, 10);
    const s = Math.max(0.5, Math.hypot(u, v));
    const ux = u / s, uy = v / s;
    const dx = x - cfg.vent.x, dy = y - cfg.vent.y;
    const xd = dx * ux + dy * uy, yd = -dx * uy + dy * ux;
    if (xd < 1) return 0;
    const [sy, sz] = briggs(env.cls, xd);
    const H = cfg.vent.H;
    const c = Q / (2 * Math.PI * s * sy * sz) * Math.exp(-yd * yd / (2 * sy * sy)) *
      (Math.exp(-((z - H) ** 2) / (2 * sz * sz)) + Math.exp(-((z + H) ** 2) / (2 * sz * sz)));
    return c * 1e6; // g/m³ -> µg/m³
  }
  function truthAt(env, cfg, x, y, z) {
    const w = stabWeight(env.lst);
    const pmShape = w >= 0 ? 1 - 0.08 * z / 100 : 0.35 + 0.65 * Math.exp(-z / 70);
    const reg = (sp) => (env.regional[sp] ? env.regional[sp](z) : 0);
    const so2ug = env.so2bg + reg('SO2') + localPlume(env, cfg, 'SO2', x, y, z);
    const h2sug = 0.15 + reg('H2S') + localPlume(env, cfg, 'H2S', x, y, z);
    const co2ex = (reg('CO2') + localPlume(env, cfg, 'CO2', x, y, z)) / 1800;
    const resp = w < 0 ? 12 * Math.exp(-z / 40) * (-w) : 3 * Math.exp(-z / 30);
    return {
      T: tempAt(env, z), RH: rhAt(env, z), P: presAt(env, z),
      so2ppb: so2ug * 24.45 / 64.066, h2sppb: h2sug * 24.45 / 34.08, co2: env.co2bg + resp + co2ex,
      pm25: env.pm25 * pmShape, pm10: env.pm10 * pmShape
    };
  }

  /* ---------------- flight dynamics ---------------- */
  function fly(cfg, env, rand, gauss, perturb) {
    const pz = perturb || {};
    const rho = airDensity(env.Ps, env.T2, env.RH2) * (pz.rho || 1);
    const mass = cfg.mass * (pz.mass || 1), cd = cfg.cd * (pz.cd || 1);
    const Acan = Math.PI * cfg.canopyD ** 2 / 4, CdAbody = 0.8 * Math.PI * 0.033 ** 2;
    const windScale = pz.wind || 1, windRot = pz.rot || 0;
    const sigG = Math.max(0.3, (env.gust10 - env.wind[0].ws) / 2.5) * (pz.gust || 1);
    const tAsc = cfg.releaseAGL / cfg.ascentRate;
    const tRel = cfg.preSec + tAsc + cfg.hoverSec;
    const dt = pz.dt || 0.05;
    let t = 0, x = 0, y = 0, z = 0, vz = 0, vx = 0, vy = 0, gx = 0, gy = 0;
    let phase = 'PRE', landed = false, tLand = NaN;
    const track = [], samples = [];
    let nextSample = 0, nextTrack = 0;
    const tEnd = tRel + 120;
    const rot = (u, v) => {
      const c = Math.cos(windRot * DEG), s = Math.sin(windRot * DEG);
      return [(u * c + v * s) * windScale, (-u * s + v * c) * windScale];
    };
    while (t <= tEnd) {
      if (t >= nextSample - 1e-9) {
        samples.push({ t: Math.round(t), x, y, z, vz, phase });
        nextSample += 1;
        if (landed && t > tLand + cfg.landedSec) break;
      }
      if (!pz.fast && t >= nextTrack - 1e-9) { track.push([x, y, z, t]); nextTrack += 0.5; }
      if (t < cfg.preSec) { phase = 'PRE'; }
      else if (t < cfg.preSec + tAsc) { phase = 'ASCENT'; z = (t - cfg.preSec) * cfg.ascentRate; x = 0.3 * Math.sin(t / 3); y = 0.3 * Math.cos(t / 4); }
      else if (t < tRel) { phase = 'HOVER'; z = cfg.releaseAGL; x = 0.4 * Math.sin(t / 2.7); y = 0.4 * Math.cos(t / 3.1); }
      else if (!landed) {
        const tr = t - tRel;
        phase = tr < cfg.inflation ? 'RELEASE' : 'DESCENT';
        const a = Math.min(1, (tr / cfg.inflation) ** 2);
        const CdA = CdAbody + cd * Acan * a;
        vz += (G - 0.5 * rho * CdA * vz * vz / mass) * dt;
        z -= vz * dt;
        const e = Math.exp(-dt / 5), k = Math.sqrt(1 - e * e);
        gx = gx * e + sigG * k * gauss(); gy = gy * e + sigG * k * gauss();
        let [wu, wv] = windUV(env, Math.max(z, 0.5));
        [wu, wv] = rot(wu, wv);
        const tau = 0.8;
        vx += ((wu + gx) - vx) * dt / tau; vy += ((wv + gy) - vy) * dt / tau;
        x += vx * dt; y += vy * dt;
        if (z <= 0) { z = 0; landed = true; tLand = t; phase = 'LANDED'; vz = 0; vx = 0; vy = 0; if (pz.fast) break; }
      } else phase = 'LANDED';
      t += dt;
    }
    const vt = terminalVelocity(mass, cd, rho, cfg.canopyD);
    return { samples, track, tRel, tLand, land: [x, y], rho, vt };
  }

  /* ---------------- sensors, packets, telemetry ---------------- */
  function simulate(cfg, env, seed = 1) {
    const rand = U.mulberry32(seed), gauss = U.gaussFactory(rand);
    const F = fly(cfg, env, rand, gauss);
    const S = D.sensors;
    const lag = (t90) => 1 - Math.exp(-1 / (t90 / 2.303));
    const bias = { co2: gauss() * S.co2.biasSd, T: gauss() * S.bme.sdT, RH: gauss() * S.bme.sdRH, P: gauss() * 0.8, gpsV: gauss() * S.gps.vBiasSd };
    const h2sGain = 1 + gauss() * 0.05;
    const tr0 = truthAt(env, cfg, 0, 0, 0);
    const st = { so2: tr0.so2ppb / 1000, h2s: tr0.h2sppb / 1000, co2: tr0.co2, pm25: tr0.pm25, pm10: tr0.pm10, T: tr0.T, RH: tr0.RH };
    const gs = cfg.gs, siteElev = env.groundElev || 0;
    let P0 = null, p0acc = [], gpsBiasWalk = bias.gpsV, prevTruthZ = 0;
    const recs = [];
    F.samples.forEach((s, i) => {
      const tru = truthAt(env, cfg, s.x, s.y, s.z);
      // first-order sensor response (t90 from datasheets)
      st.so2 += (tru.so2ppb / 1000 - st.so2) * lag(S.so2.t90);
      st.h2s += ((tru.h2sppb + S.h2s.crossSO2 * tru.so2ppb) / 1000 - st.h2s) * lag(S.h2s.t90);
      st.co2 += (tru.co2 - st.co2) * lag(S.co2.t90);
      st.pm25 += (tru.pm25 - st.pm25) * lag(S.pm.t90);
      st.pm10 += (tru.pm10 - st.pm10) * lag(S.pm.t90);
      st.T += (tru.T - st.T) * (1 - Math.exp(-1 / S.bme.tauT));
      st.RH += (tru.RH - st.RH) * (1 - Math.exp(-1 / S.bme.tauRH));
      const q = (v, r) => Math.round(v / r) * r;
      const rhF = Math.min(0.95, st.RH / 100);
      const grow = 1 + 0.25 * rhF * rhF / (1 - rhF);   // hygroscopic growth -> optical PM over-read
      const so2 = Math.max(0, q(st.so2 + gauss() * S.so2.noise, S.so2.res));
      const h2sRaw = Math.max(0, q(st.h2s * h2sGain + gauss() * S.h2s.noise, S.h2s.res));
      const co2 = Math.max(0, q(st.co2 + bias.co2 + gauss() * S.co2.noise, 1));
      const pm25 = Math.max(0, q(st.pm25 * grow * (1 + gauss() * S.pm.noiseRel) + gauss() * S.pm.noiseAbs, 1));
      const pm10 = Math.max(pm25, q(st.pm10 * (1 + (grow - 1) * 0.6) * (1 + gauss() * S.pm.noiseRel) + gauss() * S.pm.noiseAbs, 1));
      const T = q(st.T + bias.T + gauss() * 0.05, 0.01);
      const RH = U.clamp(q(st.RH + bias.RH + gauss() * 0.3, 0.1), 0, 100);
      const P = q(tru.P + bias.P + gauss() * S.bme.pNoise, 0.01);
      if (s.phase === 'PRE') { p0acc.push(P); P0 = U.mean(p0acc); }
      const altB = 44330 * (1 - Math.pow(P / P0, 0.190295));      // firmware: standard barometric formula
      gpsBiasWalk = 0.95 * gpsBiasWalk + 0.05 * bias.gpsV + gauss() * 0.4;
      const altG = prevTruthZ + gpsBiasWalk + gauss() * S.gps.vNoise;   // 1 s latency
      prevTruthZ = s.z;
      const [la, lo] = U.offsetLL(cfg.site.lat, cfg.site.lon, s.x + gauss() * S.gps.hNoise, s.y + gauss() * S.gps.hNoise);
      const [tla, tlo] = U.offsetLL(cfg.site.lat, cfg.site.lon, s.x, s.y);
      const vbat = 8.25 - 0.0012 * s.t - 0.03 * rand() + gauss() * 0.005;
      const flags = (1) | (1 << 1) | (h2sRaw < S.h2s.lod ? 1 << 2 : 0) | ({ PRE: 0, ASCENT: 1, HOVER: 2, RELEASE: 3, DESCENT: 4, LANDED: 5 }[s.phase] << 4);
      const seq = i + 1;
      const body = ['AERIS', seq, s.t, la.toFixed(6), lo.toFixed(6), altB.toFixed(1), altG.toFixed(1), so2.toFixed(3), h2sRaw.toFixed(2),
        co2.toFixed(0), pm25.toFixed(0), pm10.toFixed(0), T.toFixed(2), RH.toFixed(1), P.toFixed(2), vbat.toFixed(2),
        flags.toString(16).toUpperCase().padStart(2, '0')].join(',');
      const crc = U.crc16(body).toString(16).toUpperCase().padStart(4, '0');
      // LoRa link: slant range to the ground station, line-of-sight rule, logistic reception model
      const [gx, gy] = [gs.x, gs.y];
      const dist = Math.hypot(s.x - gx, s.y - gy, s.z - 1.5);
      const los = s.z > 2 || dist < 120 ? 1 : 0;
      const pRx = 1 / (1 + Math.exp(-(cfg.lora.b0 + cfg.lora.b1 * dist + cfg.lora.b2 * los)));
      const rx = rand() < pRx;
      recs.push({
        seq, met: s.t, phase: s.phase, lat: la, lon: lo, tlat: tla, tlon: tlo, x: s.x, y: s.y,
        altTrue: s.z, altBaro: altB, altGps: altG, so2, so2ppb: so2 * 1000, h2s: h2sRaw, h2sLOD: h2sRaw < S.h2s.lod, co2, pm25, pm10, T, RH, P, vbat,
        flags: flags.toString(16).toUpperCase().padStart(2, '0'), crc, line: body + '*' + crc, rx, dist, pRx, vz: s.vz,
        truth: { so2ppb: tru.so2ppb, h2sppb: tru.h2sppb, co2: tru.co2, pm25: tru.pm25, pm10: tru.pm10, T: tru.T, RH: tru.RH, P: tru.P },
        utc: env.t + (s.t - F.tRel) * 1000, mslGround: siteElev
      });
    });
    return summarise(cfg, env, F, recs);
  }

  function summarise(cfg, env, F, recs) {
    const desc = recs.filter((r) => r.phase === 'DESCENT' || r.phase === 'RELEASE');
    const stable = recs.filter((r) => r.phase === 'DESCENT' && r.met - F.tRel > 2);
    const rate = U.linreg(stable.map((r) => r.met), stable.map((r) => r.altBaro));
    const rx = recs.filter((r) => r.rx).length;
    const rxDesc = desc.filter((r) => r.rx).length;
    // gaps > 3 s in the ground-station log (proposal D.3 rule)
    let gaps = 0, run = 0;
    recs.forEach((r) => { if (!r.rx) run++; else { if (run >= 3) gaps++; run = 0; } });
    if (run >= 3) gaps++;
    const air = recs.filter((r) => r.altTrue > 0.5 && r.phase !== 'PRE');
    const rmse = (k) => Math.sqrt(U.mean(air.map((r) => (r[k] - r.altTrue) ** 2)));
    const [lat, lon] = U.offsetLL(cfg.site.lat, cfg.site.lon, F.land[0], F.land[1]);
    const regress = {};
    const vars = [['so2ppb', 'SO₂ (ppb)'], ['h2s', 'H₂S (ppm)'], ['co2', 'CO₂ (ppm)'], ['pm25', 'PM2.5 (µg/m³)'], ['pm10', 'PM10 (µg/m³)'],
      ['T', 'Temperature (°C)'], ['RH', 'Rel. humidity (%)'], ['P', 'Pressure (hPa)']];
    vars.forEach(([k, label]) => {
      const r = U.linreg(desc.map((d) => d.altBaro), desc.map((d) => d[k]));
      regress[k] = { label, slope100: r.slope * 100, intercept: r.intercept, r2: r.r2, n: r.n };
    });
    return {
      cfg, env, recs, track: F.track.map(([x, y, z, t]) => ({ x, y, z, t, ll: U.offsetLL(cfg.site.lat, cfg.site.lon, x, y) })),
      tRel: F.tRel, tLand: F.tLand, descentTime: F.tLand - F.tRel, vtTheory: F.vt, rho: F.rho,
      landing: { x: F.land[0], y: F.land[1], lat, lon, dist: Math.hypot(F.land[0], F.land[1]),
        brg: (Math.atan2(F.land[0], F.land[1]) / DEG + 360) % 360 },
      stats: {
        packets: recs.length, received: rx, pdr: rx / recs.length, descentSamples: desc.length, pdrDescent: desc.length ? rxDesc / desc.length : NaN,
        gaps3s: gaps, descentRate: -rate.slope, altRmseBaro: rmse('altBaro'), altRmseGps: rmse('altGps'),
        maxSO2: Math.max(...desc.map((r) => r.so2ppb), 0), maxH2S: Math.max(...desc.map((r) => r.h2s), 0),
        completenessSD: 1, completenessGround: desc.length ? rxDesc / desc.length : NaN
      },
      regress
    };
  }

  /* ---------------- Monte-Carlo landing dispersion ---------------- */
  function monteCarlo(cfg, env, n = 300, seed = 7) {
    const rand = U.mulberry32(seed), gauss = U.gaussFactory(rand);
    const pts = [], paths = [];
    for (let i = 0; i < n; i++) {
      const F = fly(cfg, env, rand, gauss, {
        fast: true, dt: 0.1, cd: 1 + gauss() * 0.07, mass: 1 + gauss() * 0.03, wind: Math.max(0.3, 1 + gauss() * 0.15),
        rot: gauss() * 12, gust: 1 + Math.abs(gauss()) * 0.3, rho: 1 + gauss() * 0.01
      });
      pts.push(F.land);
      // keep a sample of full descent paths (release → touchdown) for the "possible paths" cone
      if (paths.length < 60) paths.push(F.samples.filter((s) => s.t >= F.tRel - 1).map((s) => [s.x, s.y, s.z]).concat([[F.land[0], F.land[1], 0]]));
    }
    const mx = U.mean(pts.map((p) => p[0])), my = U.mean(pts.map((p) => p[1]));
    let sxx = 0, syy = 0, sxy = 0;
    pts.forEach(([x, y]) => { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); });
    sxx /= n - 1; syy /= n - 1; sxy /= n - 1;
    const tr = (sxx + syy) / 2, det = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
    const l1 = tr + det, l2 = Math.max(tr - det, 1e-6), th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const k = Math.sqrt(5.991); // 95 % (χ², 2 dof)
    const a = k * Math.sqrt(l1), b = k * Math.sqrt(l2);
    const ellipse = (pad) => {
      const out = [];
      for (let i = 0; i <= 72; i++) {
        const f = i / 72 * 2 * Math.PI, A = a + pad, B = b + pad;
        out.push([mx + A * Math.cos(f) * Math.cos(th) - B * Math.sin(f) * Math.sin(th), my + A * Math.cos(f) * Math.sin(th) + B * Math.sin(f) * Math.cos(th)]);
      }
      return out;
    };
    // exclusion zone = convex hull of (50 m circle round launch) ∪ (95 % ellipse buffered by 50 m)
    const circ = []; for (let i = 0; i < 48; i++) { const f = i / 48 * 2 * Math.PI; circ.push([50 * Math.cos(f), 50 * Math.sin(f)]); }
    const hull = convexHull(circ.concat(ellipse(cfg.exclusion)));
    const toLL = (arr) => arr.map(([x, y]) => U.offsetLL(cfg.site.lat, cfg.site.lon, x, y));
    return {
      points: pts, pointsLL: toLL(pts), paths, pathsLL: paths.map((p) => toLL(p)),
      ellipseXY: ellipse(0), exclusionXY: hull,
      mean: [mx, my], meanLL: U.offsetLL(cfg.site.lat, cfg.site.lon, mx, my),
      meanDist: Math.hypot(mx, my), meanBrg: (Math.atan2(mx, my) / DEG + 360) % 360,
      a, b, theta: th, ellipseLL: toLL(ellipse(0)), exclusionLL: toLL(hull),
      maxDist: Math.max(...pts.map((p) => Math.hypot(p[0], p[1])))
    };
  }
  function convexHull(points) {
    const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    p.forEach((q) => { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }

  /* ---------------- go / no-go (proposal D.8 weather & abort criteria) ---------------- */
  function goNoGo(cfg, env, siteSO2ppb) {
    const [u, v] = windUV(env, cfg.releaseAGL);
    const wsRel = Math.hypot(u, v);
    const checks = [
      { item: `Sustained wind at release altitude (${cfg.releaseAGL} m) ≤ 10 m/s`, value: `${wsRel.toFixed(1)} m/s`, ok: wsRel <= 10 },
      { item: 'Surface wind (10 m) ≤ 10 m/s', value: `${env.wind[0].ws.toFixed(1)} m/s, gusts ${env.gust10.toFixed(1)}`, ok: env.wind[0].ws <= 10, warn: env.gust10 > 12 },
      { item: 'No precipitation', value: `${(env.precip || 0).toFixed(1)} mm/h`, ok: !(env.precip >= 0.1) },
      { item: 'No lightning risk (thunderstorm code / CAPE)', value: `WMO code ${isFinite(env.wcode) ? env.wcode : '—'}, CAPE ${U.fmtNum(env.cape)} J/kg`, ok: !(env.wcode >= 95), warn: env.cape > 2000 },
      { item: 'Visibility ≥ 2 km (visual line of sight)', value: isFinite(env.vis) ? `${(env.vis / 1000).toFixed(1)} km` : '—', ok: !(env.vis < 2000) },
      { item: 'Release altitude ≤ 122 m AGL (CAAP 400 ft ceiling)', value: `${cfg.releaseAGL} m`, ok: cfg.releaseAGL <= 122 },
      { item: 'Crew SO₂ exposure below WHO 10-min guideline (191 ppb)', value: isFinite(siteSO2ppb) ? `${siteSO2ppb.toFixed(1)} ppb modelled` : 'no dispersion run', ok: !(siteSO2ppb > 191), warn: siteSO2ppb > 75 }
    ];
    const fail = checks.some((c) => !c.ok), warn = checks.some((c) => c.warn);
    return { checks, verdict: fail ? 'NO-GO' : warn ? 'CAUTION' : 'GO', wsRel };
  }

  AERIS.cansat = { airDensity, terminalVelocity, canopyForSpeed, buildEnv, simulate, monteCarlo, goNoGo, windUV, truthAt, tempAt, localPlume, briggs };
})();
