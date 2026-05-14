export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sports, dias, descanso, nivel, fcmax, volum, objetivo, carrera, distancia, desnivel } = req.body;

  const fc = fcmax || 185;
  const z2min = Math.round(fc * 0.60);
  const z2max = Math.round(fc * 0.70);
  const z3min = Math.round(fc * 0.70);
  const z3max = Math.round(fc * 0.80);

  const systemPrompt = `Ets un coach esportiu personal especialitzat en running, ciclisme, triatló i entrenament de força.

La teva filosofia:
- L'atleta amateur té vida fora de l'esport. La família i la feina sempre van primer.
- Mai bronques. Si l'atleta no ha pogut entrenar, el primer missatge és sempre benvinguda, no retret.
- Explica sempre el per què de cada sessió.
- La consistència és més important que la intensitat.
- Força i endurance s'han d'integrar com un sistema únic de càrrega.

Regles de periodització:
- 80% del volum en Z1-Z2 (aeròbic base)
- 20% en Z3-Z5 (qualitat)
- Cada 3 setmanes de càrrega, 1 setmana de recuperació
- La força de cames mai va el dia abans d'un rodatge llarg

To: proper, directe, com un amic que és coach. Usa sempre castellà.`;

  const userMessage = `Genera un pla d'entrenament setmanal per a aquest atleta:

- Disciplines: ${(sports || ['running']).join(', ')}
- Dies disponibles: ${dias || 3} dies
- Dia de descans fix: ${descanso || 'cap'}
- Nivell: ${nivel || 'intermedi'}
- FC màxima: ${fc} bpm
- Z2: ${z2min}-${z2max} bpm
- Z3: ${z3min}-${z3max} bpm
- Volum actual: ${volum || 4}h/setmana
- Objectiu: ${objetivo || 'estar en forma'}
${carrera ? `- Carrera objectiu: ${carrera} ${distancia} ${desnivel > 0 ? '+' + desnivel + 'm D+' : ''}` : ''}

Respon ÚNICAMENT amb un JSON vàlid amb aquest format exacte, sense cap text addicional:
{
  "setmana": [
    {
      "dia": "Lu",
      "rest": false,
      "icon": "🏃",
      "title": "Rodaje Z2",
      "sub": "45 min · 132-148 bpm",
      "why": "Construyes base aeróbica. El entreno más importante de la semana.",
      "tags": ["Running", "Z2", "~6 km"],
      "duracio_min": 45
    }
  ],
  "resum": "Frase curta del coach explicant el pla d'aquesta setmana"
}

Genera exactament 7 dies (Lu, Ma, Mi, Ju, Vi, Sá, Do). Els dies de descans porten rest: true, icon: '💤', title: 'Descanso'.`;

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
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const data = await response.json();
    const text = data.content[0].text;

    const clean = text.replace(/```json|```/g, '').trim();
    const plan = JSON.parse(clean);

    return res.status(200).json(plan);
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Error generant el pla' });
  }
}
