export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { planActual, canvi, userData } = req.body;

  const fc = userData?.fcmax || 185;
  const z2min = Math.round(fc * 0.60);
  const z2max = Math.round(fc * 0.70);

  // Versió simplificada del pla per estalviar tokens
  const planSimple = planActual.map(d => ({
    dia: d.day,
    title: d.title,
    rest: d.rest || false,
    min: d.duracio_min || 45,
    tags: d.tags || []
  }));

  const systemPrompt = `Eres un coach experto. Reajustas planes de entrenamiento de forma rápida y precisa.

REGLAS:
- Nunca fuerza piernas el día antes de rodaje largo
- Nunca dos días alta intensidad seguidos
- 80% Z2, 20% calidad
- Si reduces tiempo un día, redistribuye a otros
- Si marcas descanso, la carga va al día con menos volumen
- Responde SIEMPRE en castellano
- Sé conciso en "why" (máx 1 frase corta)`;

  const userMessage = `Plan actual:
${JSON.stringify(planSimple)}

Cambio del atleta: ${canvi}

Datos: FC max ${fc}, Z2 ${z2min}-${z2max}, ${userData?.dias || 3} días, ${(userData?.sports || ['running']).join('+')}, nivel ${userData?.nivel || 'intermedio'}

Reajusta el plan. Responde SOLO con JSON válido sin texto adicional:
{
  "setmana": [
    {"dia":"Lu","rest":false,"icon":"🏃","title":"...","sub":"45 min · Z2","why":"...","tags":["Running","Z2"],"duracio_min":45,"canviat":false}
  ],
  "missatge": "Frase corta sobre el reajuste",
  "resum": "Resumen breve"
}

Marca "canviat":true solo en días modificados.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
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
    console.error('Reajust error:', error);
    return res.status(500).json({ error: error.message });
  }
}
