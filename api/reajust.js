export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { planActual, canvi, userData } = req.body;

  const fc = userData?.fcmax || 185;
  const z2min = Math.round(fc * 0.60);
  const z2max = Math.round(fc * 0.70);

  const planSimple = planActual.map(d => ({
    dia: d.day,
    title: d.title,
    rest: d.rest || false,
    min: d.duracio_min || 45,
    tags: d.tags || [],
    canviat: d.canviat || false,
    custom: d.custom || null,
    completed: d.completed || false
  }));

  const systemPrompt = `Eres un coach experto. Reajustas planes adaptando el entorno SIN tocar los días que el atleta ha modificado.

REGLA #1 INVIOLABLE:
Los días con "canviat":true son INMUTABLES. Tu trabajo NO es "afinarlos" ni "mejorarlos". Tu trabajo es RESPETARLOS.

Para los días con "canviat":true:
- Devuelve title EXACTAMENTE igual
- Devuelve "duracio_min" EXACTAMENTE igual al "min" que recibes
- Devuelve "custom" EXACTAMENTE igual (con sus km, pace, speed, elev)
- Devuelve tags EXACTAMENTE iguales
- Solo puedes ajustar "why" para explicar por qué encaja

Para los días con "completed":true: igual de inmutables.

REGLAS SECUNDARIAS (solo para días NO modificados ni completados):
- 80% Z2, 20% calidad
- Evita dos días duros seguidos si hay forma de reorganizar otros días
- Si el atleta ha hecho un día más corto/largo, redistribuye los minutos en los días NO tocados
- Nunca redistribuyas carga a un día con "canviat":true

OUTPUT:
- Responde SIEMPRE en castellano
- "why" máx 1 frase corta
- Mantén "canviat":true Y "custom" intactos para los días que el atleta tocó`;

  const userMessage = `Plan actual (con cambios del atleta YA aplicados):
${JSON.stringify(planSimple)}

Cambio del atleta: ${canvi}

REGLA INVIOLABLE: Los días con "canviat":true ya están como el atleta los quiere. Devuélvelos EXACTAMENTE iguales:
- mismo title
- mismo min → duracio_min
- mismo objeto custom
- mismos tags
NO afines sus números bajo ningún concepto.

Datos: FC max ${fc}, Z2 ${z2min}-${z2max}, ${userData?.dias || 3} días, ${(userData?.sports || ['running']).join('+')}, nivel ${userData?.nivel || 'intermedio'}

SOLO JSON válido:
{
  "setmana": [
    {"dia":"Lu","rest":false,"icon":"🏃","title":"...","sub":"...","why":"...","tags":[...],"duracio_min":45,"canviat":false,"custom":null}
  ],
  "missatge": "Frase corta máx 12 palabras",
  "resum": "Resumen breve"
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
