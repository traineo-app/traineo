import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'Email requerit' });

  try {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(200).json({ plan: null });

    return res.status(200).json({
      plan: {
        userData: data.user_data,
        currentWeek: data.current_week,
        nextWeek: data.next_week,
        pastWeeks: data.past_weeks || [],
        weekStartDate: data.week_start_date,
        // retrocompat
        sessions: data.sessions,
        resum: data.resum
      }
    });
  } catch (e) {
    console.error('get-plan error:', e);
    return res.status(500).json({ error: e.message });
  }
}
