/* AERIS-GIS — reference data: volcanic sources, receptors, pollutant properties, CanSat hardware */
(function () {
  'use strict';
  const D = {};

  /* PHIVOLCS-listed volcanoes. Coordinates/elevations: Smithsonian GVP / PHIVOLCS.
     Emission rates (tonnes/day) are SCENARIO defaults for modelling, NOT measurements —
     replace them with the latest PHIVOLCS bulletin (or your own flux estimate) before a run. */
  D.volcanoes = [
    { id: 'apo', name: 'Mt. Apo', lat: 6.9870, lon: 125.2700, elev: 2954, prov: 'Davao del Sur / Cotabato',
      status: 'Potentially active', priority: true, kind: 'Stratovolcano — summit solfataras & fumaroles',
      emis: { SO2: 40, H2S: 25, CO2: 600 }, rise: 300,
      note: 'Highest peak in the Philippines. Persistent solfataric degassing near the summit; Mt. Apo geothermal field on the NW flank (Kidapawan).' },
    { id: 'leonard', name: 'Mt. Leonard Kniaseff', lat: 7.3817, lon: 126.0467, elev: 1190, prov: 'Davao de Oro (Mabini – Maco)',
      status: 'Active', priority: true, kind: 'Stratovolcano with 2 km caldera (Lake Leonard)',
      emis: { SO2: 8, H2S: 15, CO2: 300 }, rise: 150,
      note: 'Last eruption ~120 AD ± 100 yr. Its hydrothermal system feeds the Mainit hot springs ~13 km to the north — the AERIS CanSat field site.' },
    { id: 'taal', name: 'Taal', lat: 14.002, lon: 120.993, elev: 311, prov: 'Batangas', status: 'Active', emis: { SO2: 3000, H2S: 40, CO2: 5000 }, rise: 800, kind: 'Caldera / lake volcano' },
    { id: 'mayon', name: 'Mayon', lat: 13.257, lon: 123.685, elev: 2462, prov: 'Albay', status: 'Active', emis: { SO2: 1500, H2S: 20, CO2: 3000 }, rise: 600, kind: 'Stratovolcano' },
    { id: 'kanlaon', name: 'Kanlaon', lat: 10.412, lon: 123.132, elev: 2435, prov: 'Negros Occidental / Oriental', status: 'Active', emis: { SO2: 2500, H2S: 30, CO2: 4000 }, rise: 700, kind: 'Stratovolcano' },
    { id: 'bulusan', name: 'Bulusan', lat: 12.770, lon: 124.050, elev: 1565, prov: 'Sorsogon', status: 'Active', emis: { SO2: 300, H2S: 10, CO2: 800 }, rise: 400, kind: 'Stratovolcano' },
    { id: 'hibok', name: 'Hibok-Hibok', lat: 9.203, lon: 124.673, elev: 1332, prov: 'Camiguin', status: 'Active', emis: { SO2: 5, H2S: 5, CO2: 100 }, rise: 150, kind: 'Stratovolcano / lava domes' },
    { id: 'pinatubo', name: 'Pinatubo', lat: 15.130, lon: 120.350, elev: 1445, prov: 'Zambales / Tarlac / Pampanga', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 50 }, rise: 100, kind: 'Stratovolcano (caldera lake)' },
    { id: 'musuan', name: 'Musuan (Calayo)', lat: 7.877, lon: 125.068, elev: 646, prov: 'Bukidnon', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Lava dome' },
    { id: 'ragang', name: 'Ragang', lat: 7.700, lon: 124.500, elev: 2815, prov: 'Lanao del Sur / Cotabato', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Stratovolcano' },
    { id: 'makaturing', name: 'Makaturing', lat: 7.647, lon: 124.320, elev: 1940, prov: 'Lanao del Sur', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Stratovolcano' },
    { id: 'matutum', name: 'Matutum', lat: 6.370, lon: 125.070, elev: 2286, prov: 'South Cotabato', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Stratovolcano' },
    { id: 'parker', name: 'Parker (Melibengoy)', lat: 6.113, lon: 124.892, elev: 1784, prov: 'South Cotabato', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Stratovolcano (caldera lake)' },
    { id: 'jolo', name: 'Jolo Group (Bud Dajo)', lat: 6.013, lon: 121.057, elev: 620, prov: 'Sulu', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Volcanic field' },
    { id: 'cabalian', name: 'Cabalian', lat: 10.287, lon: 125.221, elev: 945, prov: 'Southern Leyte', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Stratovolcano' },
    { id: 'biliran', name: 'Biliran', lat: 11.558, lon: 124.513, elev: 1340, prov: 'Biliran', status: 'Active', emis: { SO2: 0, H2S: 5, CO2: 50 }, rise: 100, kind: 'Stratovolcano' },
    { id: 'isarog', name: 'Isarog', lat: 13.658, lon: 123.380, elev: 1966, prov: 'Camarines Sur', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Stratovolcano' },
    { id: 'banahaw', name: 'Banahaw', lat: 14.070, lon: 121.480, elev: 2169, prov: 'Laguna / Quezon', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Stratovolcano' },
    { id: 'sanpablo', name: 'San Pablo Volcanic Field', lat: 14.120, lon: 121.300, elev: 1090, prov: 'Laguna / Batangas', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Maar field' },
    { id: 'ambalatungan', name: 'Ambalatungan Group', lat: 17.311, lon: 121.104, elev: 2329, prov: 'Kalinga', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Volcanic complex' },
    { id: 'cagua', name: 'Cagua', lat: 18.222, lon: 122.123, elev: 1133, prov: 'Cagayan', status: 'Active', emis: { SO2: 0, H2S: 5, CO2: 0 }, rise: 100, kind: 'Stratovolcano' },
    { id: 'camiguinbab', name: 'Camiguin de Babuyanes', lat: 18.830, lon: 121.860, elev: 712, prov: 'Cagayan', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Stratovolcano' },
    { id: 'didicas', name: 'Didicas', lat: 19.077, lon: 122.202, elev: 244, prov: 'Cagayan', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Island volcano' },
    { id: 'babuyan', name: 'Babuyan Claro', lat: 19.523, lon: 121.940, elev: 1180, prov: 'Cagayan', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Stratovolcano' },
    { id: 'smith', name: 'Smith', lat: 19.534, lon: 121.917, elev: 688, prov: 'Cagayan', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Cinder cone' },
    { id: 'iraya', name: 'Iraya', lat: 20.469, lon: 122.010, elev: 1009, prov: 'Batanes', status: 'Active', emis: { SO2: 0, H2S: 0, CO2: 0 }, rise: 100, kind: 'Stratovolcano' }
  ];
  D.volcanoById = (id) => D.volcanoes.find((v) => v.id === id);

  /* Receptor towns (population centres) used for exposure time series */
  D.receptors = [
    // Davao de Oro — nearest to Mt. Leonard Kniaseff
    ['Nabunturan', 7.6078, 125.9661], ['Mawab', 7.5068, 125.9322], ['Maco', 7.3625, 125.8553],
    ['Maragusan', 7.3131, 126.1528], ['New Bataan', 7.5464, 126.1428], ['Compostela', 7.6739, 126.0886],
    ['Montevista', 7.7031, 125.9878], ['Monkayo', 7.8267, 126.0539], ['Pantukan', 7.1264, 125.8983],
    // Davao region — Mt. Apo sector
    ['Davao City', 7.0731, 125.6128], ['Digos', 6.7497, 125.3572], ['Kidapawan', 7.0083, 125.0894],
    ['Makilala', 6.9611, 125.0886], ['Bansalan', 6.7906, 125.2142], ['Santa Cruz', 6.8342, 125.4131],
    ['Tagum', 7.4478, 125.8078], ['Panabo', 7.3081, 125.6842], ['Samal', 7.0764, 125.7092], ['Mati', 6.9551, 126.2166],
    // rest of Mindanao
    ['General Santos', 6.1128, 125.1717], ['Koronadal', 6.5031, 124.8469], ['Cotabato City', 7.2236, 124.2464],
    ['Cagayan de Oro', 8.4542, 124.6319], ['Iligan', 8.2280, 124.2452], ['Marawi', 7.9986, 124.2928],
    ['Malaybalay', 8.1575, 125.1278], ['Valencia', 7.9064, 125.0942], ['Butuan', 8.9475, 125.5406],
    ['Bislig', 8.2150, 126.3217], ['Surigao City', 9.7843, 125.4888], ['Mambajao', 9.2504, 124.7156],
    // Visayas / Luzon (other volcano sectors)
    ['Cebu City', 10.3157, 123.8854], ['Tacloban', 11.2447, 125.0048], ['Bacolod', 10.6765, 122.9509],
    ['Canlaon City', 10.3864, 123.2206], ['La Carlota', 10.4222, 122.9214], ['Sorsogon City', 12.9742, 124.0058],
    ['Legazpi', 13.1391, 123.7438], ['Naga', 13.6218, 123.1948], ['Tagaytay', 14.1153, 120.9621],
    ['Batangas City', 13.7565, 121.0583], ['Manila', 14.5995, 120.9842], ['Angeles', 15.1450, 120.5887]
  ].map(([name, lat, lon]) => ({ name, lat, lon }));

  /* CanSat field site (Project AERIS proposal §IV-A, D.8) */
  D.site = {
    name: 'Mainit & Toyozu Hot Spring',
    lat: 7.4964, lon: 126.0431,
    desc: 'Brgy. Mainit / Bukal, Nabunturan, Davao de Oro — launch & recovery lot. Replace with the surveyed coordinates of the vacant lot.'
  };

  /* Pollutant properties. Concentration classes are in µg/m³ (1-h average, 0–layer-top AGL). */
  D.species = {
    SO2: {
      id: 'SO2', label: 'SO₂', name: 'Sulfur dioxide', mw: 64.066,
      vd: 0.005,            // dry deposition velocity (m/s)
      kchem: 1.0,           // gas-phase oxidation to sulfate (%/h), dry air
      kchemWet: 5.0,        // aqueous-phase oxidation at RH≈100 % (%/h)
      wetA: 3e-5,           // below-cloud scavenging Λ = A·P^0.64 (s⁻¹, P in mm/h)
      displayUnit: 'ppb',
      classes: [1, 10, 40, 80, 180, 500],
      notes: { 40: 'WHO 2021 24-h AQG', 80: 'DENR NAAQGV annual', 180: 'DENR NAAQGV 24-h', 500: 'WHO 10-min guideline' }
    },
    H2S: {
      id: 'H2S', label: 'H₂S', name: 'Hydrogen sulfide', mw: 34.08,
      vd: 0.002, kchem: 2.0, kchemWet: 2.0, wetA: 4e-6,
      displayUnit: 'ppb',
      classes: [1, 7, 20, 42, 100, 150],
      notes: { 7: 'WHO odour nuisance (30-min)', 42: '≈30 ppb CA 1-h standard', 150: 'WHO 24-h guideline' }
    },
    CO2: {
      id: 'CO2', label: 'CO₂', name: 'Carbon dioxide (volcanic excess)', mw: 44.01,
      vd: 0, kchem: 0, kchemWet: 0, wetA: 0,
      displayUnit: 'ppm', excess: true,
      classes: [0.5, 1, 5, 20, 100, 1000].map((ppm) => ppm * 44.01 / 24.45 * 1000),
      notes: {}
    }
  };
  /* µg/m³ -> ppb (25 °C, 1 atm); CO2 shown in ppm */
  D.toMixing = function (sp, ug) {
    const ppb = ug * 24.45 / D.species[sp].mw;
    return sp === 'CO2' ? ppb / 1000 : ppb;
  };
  D.mixUnit = (sp) => (sp === 'CO2' ? 'ppm' : 'ppb');

  D.ramps = {
    YlOrRd: ['#ffffb2', '#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'],
    HYSPLIT: ['#00c8ff', '#00d200', '#ffee00', '#ff9900', '#ff0000', '#b000ff'],
    Magma: ['#fcfdbf', '#fe9f6d', '#de4968', '#8c2981', '#3b0f70', '#000004'],
    Viridis: ['#fde725', '#7ad151', '#22a884', '#2a788e', '#414487', '#440154']
  };

  /* Particle height classes (m AGL) — HYSPLIT-style particle colouring */
  D.heightClasses = [
    { max: 100, color: '#d7191c', label: '0 – 100 m (CanSat layer)' },
    { max: 500, color: '#fd8d3c', label: '100 – 500 m' },
    { max: 1000, color: '#e6c229', label: '500 – 1000 m' },
    { max: 2000, color: '#1a9641', label: '1000 – 2000 m' },
    { max: 1e9, color: '#2b83ba', label: '> 2000 m' }
  ];

  /* CanSat hardware from the AERIS proposal (Tables 2–5) with manufacturer datasheet behaviour */
  D.sensors = {
    so2: { part: 'Alphasense SO2-B4', unit: 'ppm', t90: 20, noise: 0.004, res: 0.001, lod: 0.005, note: 'Electrochemical, via transimpedance amplifier. Indicative until lab-calibrated against certified gas.' },
    h2s: { part: 'MQ-136', unit: 'ppm', t90: 30, noise: 0.15, res: 0.01, lod: 1.0, crossSO2: 0.25, note: 'Metal-oxide; datasheet range 1–200 ppm, so ambient ppb-level H₂S reads below the limit of detection. Cross-sensitive to SO₂.' },
    co2: { part: 'MH-Z19B NDIR', unit: 'ppm', t90: 120, noise: 5, res: 1, biasSd: 20, note: 't90 < 120 s: a 25 s descent does not let the reading settle, so the vertical CO₂ profile is heavily smoothed.' },
    pm: { part: 'Plantower PMS5003', unit: 'µg/m³', t90: 10, noiseRel: 0.05, noiseAbs: 1.5, res: 1, note: 'Optical scattering; over-reads in humid air (hygroscopic growth). Tryner et al. report ≈70 % PM2.5 over-estimate.' },
    bme: { part: 'Bosch BME280', tauT: 8, tauRH: 3, sdT: 0.3, sdRH: 1.5, pNoise: 0.06, note: 'Temperature lags because of the enclosure. Barometric altitude from the standard formula under-reads by ~5 % in 30 °C air.' },
    gps: { part: 'u-blox NEO-6M', hNoise: 1.5, vNoise: 2.5, vBiasSd: 4, rateHz: 1, note: '2.5 m CEP horizontal; vertical error typically 5–10 m.' },
    radio: { part: 'SX1278 LoRa 433 MHz', note: 'Packets at 1 Hz with CRC-16. Reception modelled with the proposal’s logistic range model P = 1/(1+e^-(β0+β1·d+β2·LOS)).' }
  };

  /* Monthly climatological flow used only when live meteorology is unavailable (offline fallback).
     dir = direction wind blows FROM (deg), spd in m/s, for 10 m / 925 / 850 / 700 hPa over Mindanao. */
  D.climatology = {
    regimes: {
      amihan: { name: 'Northeast monsoon (Amihan)', lv: [[50, 4.0], [60, 7], [70, 7], [80, 6]] },
      habagat: { name: 'Southwest monsoon (Habagat)', lv: [[235, 3.0], [240, 5], [250, 6], [260, 5]] },
      easterly: { name: 'Easterly trade winds (transition)', lv: [[100, 2.5], [100, 4], [100, 4], [90, 5]] }
    },
    byMonth: ['amihan', 'amihan', 'amihan', 'easterly', 'easterly', 'habagat', 'habagat', 'habagat', 'habagat', 'easterly', 'amihan', 'amihan']
  };

  window.AERIS.data = D;
})();
