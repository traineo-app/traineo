import fs from 'fs';
import path from 'path';

// Cold start: llegeix la metodologia un cop, reutilitzable a totes les invocacions del lambda
let METHODOLOGY = '';
try {
  METHODOLOGY = fs.readFileSync(path.join(process.cwd(), 'coach-methodology.md'), 'utf-8');
  console.log('coach-methodology.md cargada:', METHODOLOGY.length, 'chars');
} catch (e) {
  console.warn('coach-methodology.md NO encontrada en', process.cwd(), '- usando fallback');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { userData, raceDate, raceName, totalWeeks } = req.body;

  const objetivo = raceDate ? 'carrera' : (userData?.objetivo || 'forma');

  let weeks;
  if (objetivo === 'carrera' && raceDate) {
    const diff = Math.ceil((new Date(raceDate) - new Date()) / (1000 * 60 * 60 * 24 * 7));
    weeks = Math.max(4, Math.min(diff, 16));
  } else {
    weeks = totalWeeks || 4;
  }

  const objectiveGuidance = {
    carrera: `OBJETIVO ACTUAL: CARRERA (${raceName || 'objetivo competitivo'} el ${raceDate})
- Aplica la periodización descrita en tu metodología: Base → Construcción → Específico → Taper → Carrera
- Progresión hasta -2 semanas, taper últimas 1-2 semanas (~60% volumen máx)
- Distribución de intensidad según fase y según los principios de tu metodología`,

    forma: `OBJETIVO ACTUAL: PONERSE EN FORMA (mejora general, SIN carrera)
- Como no hay pico objetivo, usa ciclo rolling 3+1 (3 sem progresión + 1 descarga)
- NOMBRE de fases obligatorio: "Ciclo 1 · Semana X/${weeks}" (NUNCA "Base 1" / "Construcción")
- Aplica los principios de intensidad y distribución de tu metodología
- Progresión: S1 base, S2 +5%, S3 +5-8%, S4 descarga -30%`,

    peso: `OBJETIVO ACTUAL: PERDER PESO Y GANAR ENERGÍA (SIN carrera)
- Ciclo rolling 3+1
- NOMBRE de fases obligatorio: "Ciclo 1 · Semana X/${weeks}"
- Más volumen aeróbico, menos intensidad máxima
- Mayor peso a Z2, incluir trabajo de fuerza para preservar masa muscular
- Progresión suave: S1 base, S2 +5%, S3 +5%, S4 descarga -25%`,

    vuelta: `OBJETIVO ACTUAL: VOLVER DESPUÉS DE UNA PAUSA (SIN carrera)
- Ciclo rolling 3+1 con progresión MUY conservadora
- NOMBRE de fases obligatorio: "Ciclo 1 · Semana X/${weeks}"
- Primeras 2 semanas casi exclusivamente Z1-Z2
- Prioridad: NO LESIONARSE, construir consistencia
- Progresión: S1 muy suave, S2 +3-5%, S3 +5%, S4 descarga -20%`
  };

  // System com a array: bloc 1 cacheable (metodologia), bloc 2 dinàmic (objectiu)
  const systemBlocks = [];
  if (METHODOLOGY) {
    systemBlocks.push({
      type: 'text',
      text: `METODOLOGÍA DEL COACH (autoridad principal — sigue estos principios SIEMPRE):\n\n${METHODOLOGY}`,
      cache_control: { type: 'ephemeral' }
    });
  }
  systemBlocks.push({
    type: 'text',
    text: `Eres un coach experto en periodización siguiendo la metodología anterior.

${objectiveGuidance[objetivo] || objectiveGuidance.forma}

REGLAS DE SALIDA:
- Carga (load) 100-700 combinando volumen e intensidad
- Responde SIEMPRE en castellano
- Respeta estrictamente la nomenclatura de fases del objetivo
- Devuelve SOLO JSON válido sin preámbulo ni markdown`
  });

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

Responde SOLO con JSON válido (sin markdown, sin texto extra):
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
        max_tokens: 4000,
        system: systemBlocks,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error', response.status, errText);
      return res.status(500).json({ error: 'AI error ' + response.status, detail: errText.slice(0, 500) });
    }

    const data = await response.json();
    if (!data.content?.[0]?.text) {
      console.error('Respuesta inesperada:', JSON.stringify(data).slice(0, 500));
      return res.status(500).json({ error: 'Respuesta inesperada del modelo' });
    }

    const text = data.content[0].text;
    // Parsing robust: clean → fallback regex
    let result;
    try {
      result = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e1) {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error('Sin JSON en respuesta. Inicio:', text.slice(0, 300));
        return res.status(500).json({ error: 'El modelo no devolvió JSON', preview: text.slice(0, 200) });
      }
      try { result = JSON.parse(match[0]); }
      catch (e2) {
        console.error('JSON inválido tras regex:', e2.message, 'Texto:', text.slice(0, 300));
        return res.status(500).json({ error: 'JSON inválido del modelo' });
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Plan completo crash:', error);
    return res.status(500).json({ error: error.message });
  }
}
