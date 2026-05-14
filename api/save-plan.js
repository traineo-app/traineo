export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, userData, sessions, resum } = req.body;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Guarda o actualitza el perfil
    const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify({
        email: email,
        sports: userData.sports,
        dias: userData.dias,
        descanso: userData.descanso,
        nivel: userData.nivel,
        fcmax: userData.fcmax,
        volum: userData.volum,
        objetivo: userData.objetivo,
        carrera: userData.carrera,
        distancia: userData.distancia,
        desnivel: userData.desnivel,
        carrera_fecha: userData.fecha
      })
    });

    const profile = await profileRes.json();
    const profileId = Array.isArray(profile) ? profile[0]?.id : profile?.id;

    if (!profileId) {
      throw new Error('No profile ID returned');
    }

    // Guarda el pla setmanal
    const planRes = await fetch(`${supabaseUrl}/rest/v1/plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        profile_id: profileId,
        sessions: sessions,
        resum: resum,
        setmana: new Date().toISOString().split('T')[0]
      })
    });

    const plan = await planRes.json();

    return res.status(200).json({
      success: true,
      profileId,
      planId: Array.isArray(plan) ? plan[0]?.id : plan?.id
    });

  } catch (error) {
    console.error('Save plan error:', error);
    return res.status(500).json({ error: error.message });
  }
}
