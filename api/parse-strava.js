import Papa from 'papaparse';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
};

const SPORT_MAP = {
  'Run': 'running', 'Trail Run': 'trail', 'Ride': 'ciclismo',
  'Mountain Bike Ride': 'ciclismo', 'Gravel Ride': 'ciclismo',
  'Virtual Ride': 'ciclismo', 'E-Bike Ride': 'ciclismo',
  'Swim': 'natacion', 'Open Water Swim': 'natacion',
  'Weight Training': 'gimnasio', 'Workout': 'gimnasio', 'Yoga': 'gimnasio',
  'Hike': 'trail', 'Walk': 'walking'
};

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

function paceFmt(sec) {
  if (!sec) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { csvText, fileName } = req.body;
    if (!csvText) return res.status(400).json({ error: 'No CSV text provided' });

    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const activities = parsed.data;
    if (activities.length === 0) return res.status(400).json({ error: 'CSV vacío' });

    const sample = activities[0];
    const cols = Object.keys(sample);
    const findCol = (...cands) => cols.find(c => cands.some(x => c.toLowerCase().includes(x.toLowerCase())));

    const colDate = findCol('Activity Date', 'fecha de la actividad', 'Data');
    const colType = findCol('Activity Type', 'tipo de actividad', 'Tipus');
    const colDist = findCol('Distance', 'distancia', 'distància');
    const colTime = findCol('Elapsed Time', 'tiempo transcurrido', 'temps transcorregut');
    const colMovTime = findCol('Moving Time', 'tiempo en movimiento', 'temps en moviment');
    const colElev = findCol('Elevation Gain', 'desnivel', 'desnivell');
    const colHRavg = findCol('Average Heart Rate', 'frecuencia cardíaca media', 'frecuencia cardiaca media', 'avg heart rate', 'frecuencia cardiaca mitjana');
    const colHRmax = findCol('Max Heart Rate', 'frecuencia cardíaca máxima', 'frecuencia cardiaca maxima', 'max heart rate');

    if (!colDate || !colType || !colDist) {
      return res.status(400).json({ error: 'No se reconoce el formato del CSV', cols_detected: cols.slice(0, 20) });
    }

    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const twoMonthsAgo = new Date(); twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    let recent6mo = [], recent2mo = [];
    for (const a of activities) {
      const dateStr = a[colDate];
      if (!dateStr) continue;
      const date = new Date(dateStr);
      if (isNaN(date)) continue;
      if (date >= sixMonthsAgo) recent6mo.push({ ...a, _date: date });
      if (date >= twoMonthsAgo) recent2mo.push({ ...a, _date: date });
    }

    const totalDistance6mo = recent6mo.reduce((s, a) => s + (num(a[colDist]) || 0), 0);
    const totalTime6mo = recent6mo.reduce((s, a) => s + (num(a[colTime]) || 0), 0);
    const avgWeeklyKm = Math.round(totalDistance6mo / 26 * 10) / 10;
    const avgWeeklyHours = Math.round(totalTime6mo / 3600 / 26 * 10) / 10;

    const sportCounts = {}, sportVolume = {};
    recent6mo.forEach(a => {
      const m = SPORT_MAP[a[colType]] || 'otros';
      sportCounts[m] = (sportCounts[m] || 0) + 1;
      sportVolume[m] = (sportVolume[m] || 0) + (num(a[colDist]) || 0);
    });

    // ANÁLISIS DE FRECUENCIA CARDÍACA ===================================
    const runs6mo = recent6mo.filter(a => /Run/i.test(a[colType] || ''));
    const rides6mo = recent6mo.filter(a => /Ride/i.test(a[colType] || ''));
    
    let maxHRever_run = 0, maxHRever_bike = 0;
    const hrRuns = [], hrRides = [];

    for (const r of runs6mo) {
      const avgHR = colHRavg ? num(r[colHRavg]) : null;
      const maxHR = colHRmax ? num(r[colHRmax]) : null;
      const km = num(r[colDist]);
      const sec = num(r[colMovTime]) || num(r[colTime]);
      if (maxHR && sec && sec > 1200 && maxHR > maxHRever_run) maxHRever_run = maxHR;
      if (avgHR && km && sec && km > 1 && sec > 0) {
        hrRuns.push({ avgHR, maxHR, km, sec, pacePerKm: sec / km });
      }
    }
    for (const r of rides6mo) {
      const maxHR = colHRmax ? num(r[colHRmax]) : null;
      const sec = num(r[colMovTime]) || num(r[colTime]);
      const avgHR = colHRavg ? num(r[colHRavg]) : null;
      if (maxHR && sec && sec > 1800 && maxHR > maxHRever_bike) maxHRever_bike = maxHR;
      if (avgHR) hrRides.push({ avgHR, maxHR, sec });
    }

    const maxHRever = Math.max(maxHRever_run, maxHRever_bike);
    const fcmaxFromStrava = maxHRever > 0 ? maxHRever : null;

    // Detectar ritme Z2 real: agafa runs amb avgHR a la zona Z2 estimada
    let z2PaceFromHR_sec = null, z2HRavg = null, z2RunsCount = 0;
    if (maxHRever_run && hrRuns.length > 0) {
      const z2Lower = maxHRever_run * 0.55;
      const z2Upper = maxHRever_run * 0.72;
      const z2Runs = hrRuns.filter(r => r.avgHR >= z2Lower && r.avgHR <= z2Upper && r.km >= 4);
      if (z2Runs.length >= 3) {
        z2PaceFromHR_sec = Math.round(z2Runs.reduce((s, r) => s + r.pacePerKm, 0) / z2Runs.length);
        z2HRavg = Math.round(z2Runs.reduce((s, r) => s + r.avgHR, 0) / z2Runs.length);
        z2RunsCount = z2Runs.length;
      }
    }

    // Detectar ritme Z3/Z4 (alta intensitat)
    let z4PaceFromHR_sec = null, z4RunsCount = 0;
    if (maxHRever_run && hrRuns.length > 0) {
      const z4Lower = maxHRever_run * 0.85;
      const z4Runs = hrRuns.filter(r => r.avgHR >= z4Lower && r.km >= 1);
      if (z4Runs.length >= 2) {
        z4PaceFromHR_sec = Math.round(z4Runs.reduce((s, r) => s + r.pacePerKm, 0) / z4Runs.length);
        z4RunsCount = z4Runs.length;
      }
    }

    // BEST PERFORMANCES ============================
    let longestRun = 0, bestPace5K = null, bestPace10K = null;
    for (const r of runs6mo) {
      const km = num(r[colDist]);
      const sec = num(r[colMovTime]) || num(r[colTime]);
      if (!km || !sec) continue;
      if (km > longestRun) longestRun = km;
      const pace = sec / km;
      if (km >= 4.8 && km <= 5.5 && (!bestPace5K || pace < bestPace5K)) bestPace5K = pace;
      if (km >= 9.5 && km <= 11 && (!bestPace10K || pace < bestPace10K)) bestPace10K = pace;
    }
    const best5K = bestPace5K ? Math.round(bestPace5K) : null;
    const best10K = bestPace10K ? Math.round(bestPace10K) : null;

    let longestRide = 0;
    for (const r of rides6mo) {
      const km = num(r[colDist]);
      if (km && km > longestRide) longestRide = km;
    }

    const last4weeks = recent6mo.filter(a => (Date.now() - a._date.getTime()) < 28 * 24 * 60 * 60 * 1000);
    const last4wKm = last4weeks.reduce((s, a) => s + (num(a[colDist]) || 0), 0);
    const last4wHours = last4weeks.reduce((s, a) => s + (num(a[colTime]) || 0), 0) / 3600;

    return res.status(200).json({
      success: true,
      data: {
        fileName: fileName || 'strava.zip',
        totalActivities: activities.length,
        recentActivities6mo: recent6mo.length,
        recentActivities2mo: recent2mo.length,
        avgWeeklyKm,
        avgWeeklyHours,
        last4Weeks: {
          km: Math.round(last4wKm * 10) / 10,
          hours: Math.round(last4wHours * 10) / 10,
          weeklyAvgHours: Math.round(last4wHours / 4 * 10) / 10
        },
        sportCounts,
        sportVolume,
        running: {
          totalActivities: runs6mo.length,
          longestKm: Math.round(longestRun * 10) / 10,
          best5K_sec: best5K,
          best10K_sec: best10K,
          best5K_pace: paceFmt(best5K),
          best10K_pace: paceFmt(best10K)
        },
        cycling: {
          totalActivities: rides6mo.length,
          longestKm: Math.round(longestRide * 10) / 10
        },
        heartRate: {
          maxEverRun: maxHRever_run || null,
          maxEverBike: maxHRever_bike || null,
          maxEver: maxHRever || null,
          fcmaxEstimate: fcmaxFromStrava,
          runsWithHR: hrRuns.length,
          ridesWithHR: hrRides.length,
          z2: {
            paceFromHR_sec: z2PaceFromHR_sec,
            paceFromHR: paceFmt(z2PaceFromHR_sec),
            avgHR: z2HRavg,
            runsCount: z2RunsCount
          },
          z4: {
            paceFromHR_sec: z4PaceFromHR_sec,
            paceFromHR: paceFmt(z4PaceFromHR_sec),
            runsCount: z4RunsCount
          }
        }
      }
    });
  } catch (error) {
    console.error('Parse Strava error:', error);
    return res.status(500).json({ error: error.message || 'Error procesando CSV' });
  }
}
