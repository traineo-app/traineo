export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { userData, raceDate, raceName, totalWeeks } = req.body;

  // Si hi ha data de cursa → carrera. Sinó l'objectiu d'onboarding.
  const objetivo = raceDate ? 'carrera' : (userData?.objetivo || 'forma');

  let weeks;
  if (objetivo === 'carrera' && raceDate) {
    const diff = Math.ceil((new Date(raceDate) - new Date()) / (1000 * 60 * 60 * 24 * 7));
    weeks = Math.max(4, Math.min(diff, 16));
  } else {
    weeks = totalWeeks || 4; // rolling 4 setmanes per defecte
  }

  const objectiveGuidance = {
    carrera: `OBJETIVO: CARRERA (${raceName || 'objetivo competitivo'} el ${raceDate})
- Periodización clásica con fases: Base / Construcción / Específico / Taper / Carrera
- Progresión hasta -2 semanas, taper últimas 1-2 semanas (60% volumen máx)
- Distribución de intensidad según fase`,

    forma: `OBJETIVO: PONERSE EN FORMA (mejora general, sin carrera)
- Ciclo rolling con patrón 3+1 (3 sem progresión + 1 descarga)
- NOMBRE de fases obligatorio: "Ciclo 1 · Semana X/${weeks}" (NUNCA "Base" / "Construcción")
- Intensidad: ~70% Z2, 1 sesión de calidad/semana (tempo o intervalos cortos), opcional 1 Z4
- Fuerza 2x/semana si los días lo permiten
- Progresión: S1 base, S2 +5%, S3 +5-8%, S4 descarga -30%
- Load entre 200-500, sin picos extremos`,

    peso: `OBJETIVO: PERDER PESO Y GANAR ENERGÍA (sin carrera)
- Ciclo rolling con patrón 3+1
- NOMBRE de fases obligatorio: "Ciclo 1 · Semana X/${weeks}"
- MÁS volumen aeróbico (gasto calórico), MENOS intensidad alta
- Intensidad: ~85% Z2 (zona quemagrasa), evitar Z4/Z5
- FUERZA 2-3x/semana para preservar masa muscular
- Variedad: caminar/marcha activa además de los entrenos
- Progresión suave: S1 base, S2 +5%, S3 +5%, S4 descarga -25%
- Load entre 200-450`,

    vuelta: `OBJETIVO: VOLVER DESPUÉS DE UNA PAUSA (sin carrera)
- Ciclo rolling con patrón 3+1 PERO con progresión muy conservadora
- NOMBRE de fases obligatorio: "Ciclo 1 · Semana X/${weeks}"
- Intensidad: ~90% Z1-Z2 las primeras 2 semanas, sin intensidad alta
- A partir de S3 puedes introducir alguna calidad suave si las sensaciones son buenas
- Volumen muy controlado, prioridad NO LESIONARSE
- Progresión: S1 muy suave, S2 +3-5%, S3 +5%, S4 descarga -20%
- Load entre 150-350 (techo bajo, consistencia > picos)`
  };

  const systemPrompt = `Eres un coach experto en periodización adaptada al objetivo del atleta.

${objectiveGuidance[objetivo] || objectiveGuidance.forma}

REGLAS GENERALES:
- Carga (load) 100-700 combinando volumen e intensidad
- Responde SIEMPRE en castellano
- Respeta estrictamente la nomenclatura de fases del objetivo`;

  const ejemploFase = objetivo === 'carrera' ? 'Base 1' : `Ciclo 1 · Semana 1/${weeks}`;

  const userMessage = `Genera plan de ${weeks} semanas para este atleta:
- Disciplinas: ${(userData?.sports || ['running']).join('+')}
- Nivel: ${userData?.nivel || 'intermedio'}
- Días disponibles/semana: ${userData?.dias || 3}
- Volumen base: ${userData?.volum || 4} h/semana
${objetivo === 'carrera'
    ? `- CARRERA: ${raceName} el ${raceDate} (distancia ${userData?.distancia || ''})`
    : `- Objetivo del atleta: ${objetivo}`}

Para cada semana retorna: número, fase, horas totales, carga 100-700, foco en una frase, y los 3-4 títulos principales de sesiones.

Responde SOLO con JSON válido:
{
  "totalWeeks": ${weeks},
  "objetivo": "${objetivo}",
  "weeks": [
    {"weekNum":1,"phase":"${ejemploFase}","totalHours":4.5,"load":320,"focus":"...","sessions":["...","...","..."]}
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
