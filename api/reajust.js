// api/reajust.js — readaptació dins de la setmana amb metodologia del soci
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const anthropic = new Anthropic();

const METHODOLOGY = fs.readFileSync(
  path.join(process.cwd(), "coach-methodology.md"),
  "utf8"
);

const BASE_INSTRUCTIONS = `Eres el coach IA de traineo. Tu metodología completa está en el CERVELL DEL COACH que sigue — síguela siempre.

Tu trabajo aquí: el atleta ha hecho un cambio en su semana en curso. Debes REDISTRIBUIR la diferencia de carga al resto de la semana, manteniendo la coherencia de la metodología.

REGLA #1 — DÍAS DEL ATLETA SON INMUTABLES:
Días con "canviat":true o "completed":true:
- Devuelve title, duracio_min (=min recibido), custom, tags EXACTAMENTE iguales
- Solo puedes ajustar "why" para explicar por qué encaja
- NO los toques bajo ningún concepto

REGLA #2 — REDISTRIBUCIÓN cuando hay déficit/superávit:
- delta > 0 → FALTAN minutos → AÑADE minutos repartidos en 1-3 días NO modificados ni completados
- delta < 0 → SOBRAN minutos → REDUCE minutos en 1-3 días NO modificados ni completados
- Prefiere ajustar días de la misma disciplina
- Los días que TÚ ajustes: marca "canviat":true y en "why" pon "Compensa el cambio del [día]"

REGLA #3 — COHERENCIA CON LA METODOLOGÍA:
- Aplica la distribución de intensidad, la lógica de carga/recuperación y los principios del CERVELL DEL COACH
- Nunca dos días de alta intensidad seguidos si puedes reorganizar
- Reparte los días de entrenamiento, no los agrupes todos seguidos

OUTPUT en castellano, JSON válido sin markdown.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { planActual, canvi, userData } = req.body;

    const fc = userData?.fcmax || 185;
    const z2min = Math.round(fc * 0.60);
    const z2max = Math.round(fc * 0.70);

    const targetMinutes = (userData?.volum || 4) * 60;
    const currentMinutes = planActual.reduce((sum, d) => sum + (d.rest ? 0 : (d.duracio_min || 0)), 0);
    const delta = targetMinutes - currentMinutes;
    const needsRedistribution = Math.abs(delta) >= 15;

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

    const userMessage = `Plan actual (con cambio del atleta YA aplicado):
${JSON.stringify(planSimple)}

Cambio del atleta: ${canvi}

CÁLCULO DE CARGA:
- Volumen objetivo semanal: ${targetMinutes} min (${userData?.volum || 4} horas)
- Volumen actual (después del cambio): ${currentMinutes} min
- Delta: ${delta > 0 ? '+' : ''}${delta} min
${needsRedistribution ? `\n⚠ REDISTRIBUCIÓN OBLIGATORIA: ${delta > 0 ? `Añade ${Math.abs(delta)} min` : `Reduce ${Math.abs(delta)} min`} repartidos en días NO modificados.` : '\n✓ Volumen dentro del rango, sin redistribución necesaria.'}

REGLA INVIOLABLE: Días con "canviat":true mantienen EXACTAMENTE: mismo title, mismo min → duracio_min, mismo custom, mismos tags.

Datos atleta: FC max ${fc}, Z2 ${z2min}-${z2max}, ${userData?.dias || 3} días/sem, ${(userData?.sports || ['running']).join('+')}, nivel ${userData?.nivel || 'intermedio'}

Aplica tu metodología y devuelve SOLO JSON válido:
{
  "setmana": [
    {"dia":"Lu","rest":false,"icon":"🏃","title":"...","sub":"...","why":"...","tags":[...],"duracio_min":45,"canviat":false,"custom":null}
  ],
  "missatge": "Frase corta sobre la redistribución (máx 14 palabras)",
  "resum": "Resumen breve"
}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1800,
      system: [
        { type: "text", text: BASE_INSTRUCTIONS },
        { type: "text", text: METHODOLOGY, cache_control: { type: "ephemeral" } }
      ],
      messages: [{ role: 'user', content: userMessage }]
    });

    let reply = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
    reply = reply.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

    const result = JSON.parse(reply);
    return res.status(200).json(result);

  } catch (error) {
    console.error('Reajust error:', error);
    return res.status(500).json({ error: error.message });
  }
}

export const config = { maxDuration: 60 };
