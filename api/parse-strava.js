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
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

// Strava CSV exports distance in METERS — always divide by 1000 for km
function metersToKm(v) {
  const n = num(v);
  return n !== null ? Math.round(n / 1000 * 100) / 100 : null;
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
    const findCol = (...cands) =>
      cols.find(c => cands.some(x => c.toLowerCase().includes(x.toLowerCase())));

    const colDate    = findCol('Activity Date', 'fecha de la actividad');
    const colType    = findCol('Activity Type', 'tipo de actividad');
    const colDist    = findCol('Distance');           // in METERS
    const colMovTime = findCol('Moving Time');         // in seconds
    const colTime    = findCol('Elapsed Time');        // in seconds
    const colElev    = findCol('Elevation Gain');
    const colHRavg   = findCol('Average Heart Rate');
    const colHRmax   = findCol('Max Heart Rate');

    if (!colDate || !colType || !colDist) {
      return res.status(400).json({
        error: 'Formato CSV no reconocido',
        cols_detected: cols.slice(0, 20)
      });
    }

    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const recent6mo = [];
    for (const a of activities) {
      if (!a[colDate]) continue;
      const date = new Date(a[colDate]);
      if (isNaN(date) || date < sixMonthsAgo) continue;
      recent6mo.push({ ...a, _date: date });
    }

    // Volume (distances in km, times in hours)
    const totalKm6mo = recent6mo.reduce((s, a) => s + (metersToKm(a[colDist]) || 0), 0);
    const totalSec6mo = recent6mo.reduce((s, a) => s + (num(a[colMovTime]) || num(a[colTime]) || 0), 0);
    const avgWeeklyKm = Math.round(totalKm6mo / 26 * 10) / 10;
    const avgWeeklyHours = Math.round(totalSec6mo / 3600 / 26 * 10) / 10;

    // Sport distribution
    const sportCounts = {}, sportVolume = {};
    recent6mo.forEach(a => {
      const m = SPORT_MAP[a[colType]] || 'otros';
      sportCounts[m] = (sportCounts[m] || 0) + 1;
      sportVolume[m] = (sportVolume[m] || 0) + (metersToKm(a[colDist]) || 0);
    });

    // RUNNING ANALYSIS ====================================================
    const runs6mo = recent6mo.filter(a => /Run/i.test(a[colType] || ''));
    const rides6mo = recent6mo.filter(a => /Ride/i.test(a[colType] || ''));

    // Best 5K / 10K (distance in km after conversion)
    let longestRun = 0, bestPace5K = null, bestPace10K = null;
    for (const r of runs6mo) {
      const km = metersToKm(r[colDist]);
      const sec = num(r[colMovTime]) || num(r[colTime]);
      if (!km || !sec || km <= 0) continue;
      if (km > longestRun) longestRun = km;
      const pace = sec / km; // sec/km
      if (km >= 4.8 && km <= 5.5 && (!bestPace5K || pace < bestPace5K)) bestPace5K = pace;
      if (km >= 9.5 && km <= 11.0 && (!bestPace10K || pace < bestPace10K)) bestPace10K = pace;
    }

    // HEART RATE ANALYSIS ==================================================
    let maxHRever_run = 0, maxHRever_bike = 0;
    const hrRuns = [];

    for (const r of runs6mo) {
      const avgHR  = colHRavg ? num(r[colHRavg]) : null;
      const maxHR  = colHRmax ? num(r[colHRmax]) : null;
      const km     = metersToKm(r[colDist]);
      const sec    = num(r[colMovTime]) || num(r[colTime]);
      const elev   = num(r[colElev]) || 0;
      // Track max HR only from runs > 20 min (avoid warm-up artifacts)
      if (maxHR && sec && sec > 1200 && maxHR > maxHRever_run) maxHRever_run = maxHR;
      if (avgHR && km && km > 1 && sec && sec > 0) {
        hrRuns.push({ avgHR, maxHR, km, sec, pacePerKm: sec / km, elev });
      }
    }
    for (const r of rides6mo) {
      const maxHR = colHRmax ? num(r[colHRmax]) : null;
      const sec   = num(r[colMovTime]) || num(r[colTime]);
      if (maxHR && sec && sec > 1800 && maxHR > maxHRever_bike) maxHRever_bike = maxHR;
    }

    const maxHRever = Math.max(maxHRever_run, maxHRever_bike) || null;

    // FCmax estimation: if user consistently trains at high % of observed max,
    // real FCmax is likely higher than observed. Adjust upward.
    let fcmaxEstimate = null;
    if (maxHRever_run) {
      const avgHRall = hrRuns.reduce((s, r) => s + r.avgHR, 0) / hrRuns.length;
      const avgPctOfObserved = avgHRall / maxHRever_run;
      // If avg training HR > 75% of observed max → likely haven't hit true FCmax
      // Estimate: avg training HR ÷ 0.78 (assuming avg training is ~Z3, ~78% FCmax)
      if (avgPctOfObserved > 0.73) {
        fcmaxEstimate = Math.round(avgHRall / 0.74);
      } else {
        fcmaxEstimate = maxHRever_run;
      }
    }

    // Z2 pace from HR: runs with avg HR at 60-72% of estimated FCmax
    // Use estimated FCmax if available, else fall back to observed max
    const fcmaxForZones = fcmaxEstimate || maxHRever_run;
    let z2PaceSec = null, z2AvgHR = null, z2RunsCount = 0;
    let z4PaceSec = null, z4RunsCount = 0;

    if (fcmaxForZones && hrRuns.length > 0) {
      const z2Lo = fcmaxForZones * 0.60;
      const z2Hi = fcmaxForZones * 0.72;
      const z2Runs = hrRuns.filter(r => r.avgHR >= z2Lo && r.avgHR <= z2Hi && r.km >= 4);
      if (z2Runs.length >= 2) {
        z2PaceSec  = Math.round(z2Runs.reduce((s, r) => s + r.pacePerKm, 0) / z2Runs.length);
        z2AvgHR    = Math.round(z2Runs.reduce((s, r) => s + r.avgHR, 0) / z2Runs.length);
        z2RunsCount = z2Runs.length;
      }

      const z4Runs = hrRuns.filter(r => r.avgHR >= fcmaxForZones * 0.85 && r.km >= 1);
      if (z4Runs.length >= 2) {
        z4PaceSec   = Math.round(z4Runs.reduce((s, r) => s + r.pacePerKm, 0) / z4Runs.length);
        z4RunsCount = z4Runs.length;
      }
    }

    // Last 4 weeks
    const last4wCutoff = new Date(); last4wCutoff.setDate(last4wCutoff.getDate() - 28);
    const last4w = recent6mo.filter(a => a._date >= last4wCutoff);
    const last4wHours = last4w.reduce((s, a) => s + (num(a[colMovTime]) || 0), 0) / 3600;

    // Longest ride
    let longestRide = 0;
    for (const r of rides6mo) {
      const km = metersToKm(r[colDist]);
      if (km && km > longestRide) longestRide = km;
    }

    return res.status(200).json({
      success: true,
      data: {
        fileName: fileName || 'strava.zip',
        totalActivities: activities.length,
        recentActivities6mo: recent6mo.length,
        avgWeeklyKm,
        avgWeeklyHours,
        last4Weeks: {
          km:               Math.round(last4w.reduce((s, a) => s + (metersToKm(a[colDist]) || 0), 0) * 10) / 10,
          hours:            Math.round(last4wHours * 10) / 10,
          weeklyAvgHours:   Math.round(last4wHours / 4 * 10) / 10
        },
        sportCounts,
        sportVolume,
        running: {
          totalActivities: runs6mo.length,
          longestKm:       Math.round(longestRun * 10) / 10,
          best5K_sec:      bestPace5K ? Math.round(bestPace5K) : null,
          best10K_sec:     bestPace10K ? Math.round(bestPace10K) : null,
          best5K_pace:     paceFmt(bestPace5K ? Math.round(bestPace5K) : null),
          best10K_pace:    paceFmt(bestPace10K ? Math.round(bestPace10K) : null)
        },
        cycling: {
          totalActivities: rides6mo.length,
          longestKm:       Math.round(longestRide * 10) / 10
        },
        heartRate: {
          maxEverRun:       maxHRever_run || null,
          maxEverBike:      maxHRever_bike || null,
          maxEver:          maxHRever,
          fcmaxEstimate:    fcmaxEstimate,
          fcmaxNote:        fcmaxEstimate && fcmaxEstimate > (maxHRever_run || 0)
                              ? 'FCmax estimada superior a la observada (entrenos no han llegado al máximo absoluto)'
                              : 'FCmax basada en HR máxima registrada',
          runsWithHR:       hrRuns.length,
          avgTrainingHR:    hrRuns.length ? Math.round(hrRuns.reduce((s, r) => s + r.avgHR, 0) / hrRuns.length) : null,
          z2: {
            paceFromHR_sec: z2PaceSec,
            paceFromHR:     paceFmt(z2PaceSec),
            avgHR:          z2AvgHR,
            runsCount:      z2RunsCount
          },
          z4: {
            paceFromHR_sec: z4PaceSec,
            paceFromHR:     paceFmt(z4PaceSec),
            runsCount:      z4RunsCount
          }
        }
      }
    });
  } catch (error) {
    console.error('Parse Strava error:', error);
    return res.status(500).json({ error: error.message || 'Error procesando CSV' });
  }
}
