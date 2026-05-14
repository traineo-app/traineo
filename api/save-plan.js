export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  const { email, userData, sessions, resum } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    // Primer comprova si el perfil ja existeix
    const checkRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    const existing = await checkRes.json();
    let profileId = null;

    if (existing && existing.length > 0) {
      // Perfil ja existeix — actualitza'l
      profileId = existing[0].id;
      await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${profileId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({
            sports: userData?.sports || [],
            dias: userData?.dias || 3,
            descanso: userData?.descanso || 'Ninguno',
            nivel: userData?.nivel || 'Intermedio',
            fcmax: userData?.fcmax || 185,
            volum: userData?.volum || 4,
            objetivo: userData?.objetivo || '',
            carrera: userData?.carrera || '',
            distancia: userData?.distancia || '',
            desnivel: userData?.desnivel || 0,
            carrera_fecha: userData?.fecha || ''
          })
        }
      );
    } else {
      // Perfil nou — crea'l
      const insertRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            email: email,
            sports: userData?.sports || [],
            dias: userData?.dias || 3,
            descanso: userData?.descanso || 'Ninguno',
            nivel: userData?.nivel || 'Intermedio',
            fcmax: userData?.fcmax || 185,
            volum: userData?.volum || 4,
            objetivo: userData?.objetivo || '',
            carrera: userData?.carrera || '',
            distancia: userData?.distancia || '',
            desnivel: userData?.desnivel || 0,
            carrera_fecha: userData?.fecha || ''
          })
        }
      );
      const inserted = await insertRes.json();
      profileId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
    }

    if (!profileId) {
      return res.status(500).json({ error: 'Could not get profile ID' });
    }

    // Guarda el pla
    const planRes = await fetch(
      `${supabaseUrl}/rest/v1/plans`,
      {
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
          resum: resum || '',
          setmana: new Date().toISOString().split('T')[0]
        })
      }
    );

    const plan = await planRes.json();
    const planId = Array.isArray(plan) ? plan[0]?.id : plan?.id;

    return res.status(200).json({ success: true, profileId, planId });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
