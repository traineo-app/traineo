import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function getMondayISO(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, userData, sessions, resum, weekStartDate } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerit' });

  try {
    // 1. Buscar o crear profile per email
    const { data: existing, error: selErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (selErr) throw selErr;

    let profileId;

    // Camps que mapegem de userData → profiles
    const profileFields = {
      sports: userData?.sports || ['running'],
      dias: userData?.dias ?? 3,
      descanso: userData?.descanso || 'Ninguno',
      nivel: userData?.nivel || 'intermedio',
      fcmax: userData?.fcmax ?? 185,
      volum: userData?.volum ?? 4,
      objetivo: userData?.objetivo || '',
      carrera: userData?.carrera || '',
      distancia: userData?.distancia || '',
      desnivel: userData?.desnivel ?? 0,
      carrera_fecha: userData?.fecha || ''
    };

    if (existing) {
      const { error: updErr } = await supabase
        .from('profiles')
        .update(profileFields)
        .eq('id', existing.id);
      if (updErr) throw updErr;
      profileId = existing.id;
    } else {
      const { data: created, error: insErr } = await supabase
        .from('profiles')
        .insert({ email, ...profileFields })
        .select('id')
        .single();
      if (insErr) throw insErr;
      profileId = created.id;
    }

    // 2. Upsert plan per (profile_id, setmana)
    const setmana = weekStartDate || getMondayISO(new Date());
    const planData = {
      profile_id: profileId,
      setmana,
      sessions: sessions || [],
      resum: resum || ''
    };

    const { data: planResult, error: planErr } = await supabase
      .from('plans')
      .upsert(planData, { onConflict: 'profile_id,setmana' })
      .select()
      .single();
    if (planErr) throw planErr;

    return res.status(200).json({ ok: true, profileId, plan: planResult });
  } catch (e) {
    console.error('save-plan error:', e);
    return res.status(500).json({ error: e.message });
  }
}
