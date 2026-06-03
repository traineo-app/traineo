import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function buildUserData(profile) {
  return {
    // Base
    sports: profile.sports || [],
    dias: profile.dias,
    descanso: profile.descanso,
    nivel: profile.nivel,
    fcmax: profile.fcmax,
    volum: profile.volum,
    objetivo: profile.objetivo,
    carrera: profile.carrera,
    distancia: profile.distancia,
    desnivel: profile.desnivel,
    fecha: profile.carrera_fecha,
    // Personal
    edat: profile.edat ?? null,
    alcada: profile.alcada ?? null,
    pes: profile.pes ?? null,
    fcrep: profile.fcrep ?? null,
    genere: profile.genere || '',
    // Rendiment / ritmes
    pacez2: profile.pacez2 ?? null,
    ftp: profile.ftp ?? null,
    race5k: profile.race5k ?? null,
    race10k: profile.race10k ?? null,
    // Objectius de cursa (camelCase, com els espera plan-completo)
    ritmeObj: profile.ritme_obj ?? null,
    velObj: profile.vel_obj ?? null,
    tempsObj: profile.temps_obj ?? null,
    // Gimnàs (tots dos noms per compatibilitat coach/session-detail)
    musculos: profile.musculos || [],
    objGym: profile.obj_gym || '',
    equipamiento: profile.equipamiento || '',
    gymUbi: profile.gym_ubi || '',
    gym_ubi: profile.gym_ubi || '',
    gymMat: profile.gym_mat || [],
    gym_mat: profile.gym_mat || [],
    // LA FOTO de l'atleta (context d'on venim) — sempre disponible
    stravaStats: profile.strava_stats || null,
    stressTestData: profile.stress_test_data || null
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'Email requerit' });
  try {
    const { data: profile, error: pErr } = await supabase
      .from('profiles').select('*').eq('email', email).maybeSingle();
    if (pErr) throw pErr;
    if (!profile) return res.status(200).json({ profile: null, plan: null, weeks: [] });
    const { data: weeks, error: wErr } = await supabase
      .from('plans')
      .select('*')
      .eq('profile_id', profile.id)
      .order('setmana', { ascending: false });
    if (wErr) throw wErr;
    const latest = weeks && weeks.length > 0 ? weeks[0] : null;
    return res.status(200).json({
      profile: profile,
      plan: {  // retrocompat amb index.html
        userData: buildUserData(profile),
        sessions: latest?.sessions || null,
        resum: latest?.resum || '',
        setmana: latest?.setmana || null
      },
      weeks: weeks || [],
      periodization: profile.periodization || null
    });
  } catch (e) {
    console.error('get-plan error:', e);
    return res.status(500).json({ error: e.message });
  }
}
