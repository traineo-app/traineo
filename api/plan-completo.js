export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userData, raceDate, raceName, totalWeeks } = req.body;

  let weeks;
  if (raceDate) {
    const diff = Math.ceil((new Date(raceDate) - new Date()) / (1000 * 60 * 60 * 24 * 7));
    weeks = Math.max(4, Math.min(diff, 16));
  } else {
    weeks = totalWeeks || 8;
  }

  const systemPrompt = `Eres un coach experto en periodización de entrenamiento. Generas planes plurisemanales con progresión inteligente.

REGLAS:
- Periodización clásica: bloques de 4 semanas (3 progresión + 1 recuperación)
- Si hay carrera: progresión hasta -2 semanas, taper -1 y semana de carrera
- Volumen aumenta gradualmente 5-10% por semana en bloques de carga
- Semana antes de carrera = 60% del volumen máximo (taper)
- Cada bloque tiene fase clara: Base / Construcción / Específico / Taper / Carrera
- Carga (load) es valor 100-700 combinando volumen e intensidad
- Responde SIEMPRE en castellano`;

  const userMessage = `Genera plan de ${weeks} semanas para este atleta:
- Disciplinas: ${(userData?.sports || ['running']).join('+')}
- Nivel: ${userData?.nivel || 'intermedio'}
- Días disponibles/semana: ${userData?.dias || 3}
- Volumen base: ${userData?.volum || 4} h/semana
${raceDate ? `- CARRERA: ${raceName} el ${raceDate} (distancia ${userData?.distancia || ''})` : '- Sin carrera específica, mejora general'}

Para cada semana retorna: número, fase, horas totales, carga 100-700, foco en una frase, y los 3-4 títulos principales de sesiones.

Responde SOLO con JSON válido:
{
  "totalWeeks": ${weeks},
  "weeks": [
    {"weekNum":1,"phase":"Base 1","totalHours":4.5,"load":320,"focus":"Construir base aeróbica en Z2","sessions":["Rodaje Z2 45'","Fuerza inferior 50'","Rodaje largo 60'"]}
  ],
  "resumen":"Resumen general del plan en 2 frases"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const data = await response.json();
    const text = data.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Plan completo error:', error);
    return res.status(500).json({ error: error.message });
  }
}
