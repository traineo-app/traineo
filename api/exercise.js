export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'Name required' });

  // Mapeig castellà → anglès
  const map = {
    'sentadilla': 'squat',
    'dominadas': 'pull up',
    'flexiones': 'push up',
    'plancha': 'plank',
    'hip thrust': 'hip thrust',
    'romanian deadlift': 'romanian deadlift',
    'press de banca': 'bench press',
    'press militar': 'overhead press',
    'remo con mancuerna': 'dumbbell row',
    'curl de bíceps': 'bicep curl',
    'dips': 'dips',
    'sentadilla búlgara': 'bulgarian split squat',
    'step-up': 'step up',
    'elevación de talones': 'calf raise',
    'bird dog': 'bird dog',
    'dead bug': 'dead bug',
    'zancadas': 'lunge'
  };

  const query = map[name.toLowerCase()] || name.toLowerCase();

  try {
    const response = await fetch(
      `https://exercisedb.p.rapidapi.com/exercises/name/${encodeURIComponent(query)}?limit=1`,
      {
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com'
        }
      }
    );
    const data = await response.json();
    if (data && data.length > 0) {
      return res.status(200).json({
        gif: data[0].gifUrl,
        name: data[0].name,
        muscle: data[0].target,
        equipment: data[0].equipment
      });
    }
    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
