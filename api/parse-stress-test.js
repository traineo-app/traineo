import Anthropic from "@anthropic-ai/sdk";

export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) return res.status(400).json({ error: 'No PDF provided' });

    const base64Data = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64Data }
          },
          {
            type: 'text',
            text: `Eres un fisiólogo del deporte experto en interpretar pruebas de esfuerzo. Analiza este PDF y extrae los datos REALES medidos (no inventes ni extrapoles).

CONCEPTOS CLAVE A DETECTAR:

**Frecuencias cardíacas:**
- FCmax: Frecuencia cardíaca máxima alcanzada (latidos por minuto)
- FCrep / FC reposo: si aparece
- Umbral aeróbico = VT1 = LT1 = "primer umbral" = "umbral 1" (en bpm)
- Umbral anaeróbico = VT2 = LT2 = "segundo umbral" = "FUMB" = "umbral funcional" (en bpm)

**Zonas de entrenamiento (CRÍTICO):**
Las zonas se nombran Z1-Z5 (o Zona 1-5). Cada zona tiene un rango de FC (bpm) y a veces un rango de ritmo o velocidad.

DEFINICIÓN ESTRICTA:
- **Z1** = recuperación = 50-60% FCmax = más lento que VT1
- **Z2** = ENDURANCE / RESISTENCIA AERÓBICA BASE = 60-70% FCmax = JUSTO POR DEBAJO de VT1
- **Z3** = tempo = 70-80% FCmax = entre VT1 y VT2
- **Z4** = umbral = 80-90% FCmax = en torno a VT2
- **Z5** = VO2max = 90-100% FCmax = por encima de VT2

**Ritmos (segundos por kilómetro):**
- "ritme_z2" es el ritmo MEDIO de la Zona 2 / Aerobic Base / Endurance.
- Si el PDF da rango ("5:00 a 5:30/km" o "5:00-5:30"), devuelve el MEDIO: 5:15/km = 315 segundos.
- Si está en km/h: convierte (12 km/h = 3600/12 = 300 s/km).
- NUNCA confundas Z2 con Z1 (Z1 es más lento) ni con Z3 (Z3 es más rápido).
- Si el PDF tiene VAM (velocidad aeróbica máxima): Z2 = ~65-72% de VAM aproximadamente.
- Si el PDF SOLO da FCs por zona pero NO ritmos, devuelve ritme_z2 = null.

**Para "ritme_5k" y "ritme_10k":**
Solo si el PDF da explícitamente un test/predicción para esas distancias. NO calcules a partir de Z2.

**Para "zones_fc":**
Devuelve los rangos en bpm que aparecen en el PDF. Si Z2 va de 144 a 156 bpm → "z2":[144,156].
Si solo hay 3 zonas, deja las que faltan como null.

DEVUELVE SOLO ESTE JSON (sin markdown, sin explicaciones):

{
  "edat": null,
  "pes": null,
  "alcada": null,
  "fcmax": null,
  "fcrep": null,
  "vo2max": null,
  "umbral_aerobic": null,
  "umbral_anaerobic": null,
  "ritme_5k": null,
  "ritme_10k": null,
  "ritme_z2": null,
  "vam": null,
  "ftp": null,
  "zones_fc": null,
  "zones_pace": null,
  "tipus_test": "running",
  "observacions": ""
}

Si una dada NO aparece claramente en el PDF, déjala como null (no inventes).
"zones_pace" es {"z1":[min,max], "z2":[min,max], ...} en segundos/km si hay ritmos por zona.
Si el PDF NO es una prueba de esfuerzo, devuelve {"error":"no_es_prova_esforc"}.`
          }
        ]
      }]
    });

    let responseText = '';
    for (const block of message.content) {
      if (block.type === 'text') responseText += block.text;
    }
    responseText = responseText.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();

    const data = JSON.parse(responseText);
    if (data.error === 'no_es_prova_esforc') {
      return res.status(400).json({ error: 'El PDF no parece ser una prueba de esfuerzo' });
    }

    // Si tenemos zones_pace.z2 pero no ritme_z2 directo, calculamos el medio
    if (!data.ritme_z2 && data.zones_pace?.z2 && Array.isArray(data.zones_pace.z2)) {
      const [a, b] = data.zones_pace.z2;
      if (a && b) data.ritme_z2 = Math.round((a + b) / 2);
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Parse stress test error:', error);
    return res.status(500).json({ error: error.message || 'Error procesando PDF' });
  }
}
