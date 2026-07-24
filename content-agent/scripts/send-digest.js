// Builds a content digest from dashboard/data.json and sends it to your
// Telegram bot. If TELEGRAM_CHAT_ID isn't set yet, this fetches it
// automatically via getUpdates (you must have messaged the bot at least
// once first) and saves it into .env for next time.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN. Set it in content-agent/.env");
  process.exit(1);
}

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function getChatId() {
  if (process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;

  console.log("No TELEGRAM_CHAT_ID set — looking it up via getUpdates...");
  const res = await fetch(`${TG_API}/getUpdates`);
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`getUpdates failed: ${json.description || "unknown error"}`);
  }
  const updates = json.result;
  if (!updates || updates.length === 0) {
    throw new Error(
      "No messages found. Open Telegram, message your bot once (any text), then run this again."
    );
  }
  const chatId = updates[updates.length - 1].message.chat.id;
  console.log(`Found chat id: ${chatId} — saving to .env`);

  const envPath = ".env";
  const envText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const updated = envText.includes("TELEGRAM_CHAT_ID=")
    ? envText.replace(/TELEGRAM_CHAT_ID=.*/g, `TELEGRAM_CHAT_ID=${chatId}`)
    : envText + `\nTELEGRAM_CHAT_ID=${chatId}\n`;
  writeFileSync(envPath, updated);

  return String(chatId);
}

function formatCompact(n) {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
}

function buildDigest(data) {
  const acc = data.account;
  const competitors = (data.competitors || []).filter((c) => !c.fetchError);
  const reelCompetitors = competitors.filter((c) => c.topPosts[0] && c.topPosts[0].metricType === "views");
  const topPost = acc.topPosts && acc.topPosts[0];

  const withRates = acc.posts.filter(
    (p) => typeof p.likesCount === "number" && typeof p.commentsCount === "number" && acc.followersCount
  );
  const avgEngagementRate =
    withRates.length > 0
      ? (withRates.reduce((sum, p) => sum + (p.likesCount + p.commentsCount) / acc.followersCount, 0) /
          withRates.length) *
        100
      : null;

  const lines = [];
  lines.push(`📊 *CALMA — Resumen de contenido*`);
  lines.push(`_@${acc.username} · ${new Date(data.generatedAt).toLocaleDateString("es-ES")}_`);
  lines.push("");
  lines.push(`👥 Seguidores: *${formatCompact(acc.followersCount)}*`);
  if (avgEngagementRate !== null) {
    lines.push(`💬 Interacción promedio: *${avgEngagementRate.toFixed(1)}%* de tus seguidores por publicación`);
  }
  lines.push("");

  if (topPost) {
    lines.push(`🏆 *Tu publicación destacada*`);
    lines.push(
      `${formatCompact(topPost.rankScore)} ${topPost.metricType === "views" ? "vistas" : "interacciones (estimado)"} — [ver publicación](${topPost.url})`
    );
    lines.push("");
  }

  lines.push(`💡 *Idea recomendada (Pilar 2 — Comprensión)*`);
  lines.push(
    reelCompetitors.length > 0
      ? `El formato reel está funcionando en ${reelCompetitors.length} de ${competitors.length} cuentas de referencia. Cadencia real: carrusel lunes/jueves, reel martes/viernes/sábado — prioriza un reel esta semana sobre miedo anticipatorio o hipervigilancia perinatal tras una pérdida.`
      : "Sigue variando formatos — aún no hay un patrón claro en las cuentas de referencia."
  );
  lines.push("");

  lines.push(`✍️ *Ángulo de hook*`);
  lines.push(
    `"El miedo que sientes no es exagerado. Es tu manera de intentar mantener a tu bebé a salvo."\n_En CALMA creemos que esto no es una falla tuya — es tu mente cuidándote con la información que tiene._`
  );
  lines.push("");

  lines.push(`🎠 *Idea de carrusel (estructura fija: Gancho → Reconocimiento → Explicación → Evidencia → Reflexión → Invitación)*`);
  lines.push(`"Por qué revisas los síntomas más de lo que quisieras" — 6 slides.`);
  lines.push("");

  lines.push(`📣 *CTA sugerido*`);
  lines.push(`"🌿 Guarda este carrusel para releerlo en un día en que la alerta se sienta más fuerte, y compártelo con alguien que también lo necesite."`);

  return lines.join("\n");
}

async function sendMessage(chatId, text) {
  const res = await fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`sendMessage failed: ${json.description || "unknown error"}`);
  }
  return json;
}

async function main() {
  if (!existsSync("dashboard/data.json")) {
    console.error("dashboard/data.json not found. Run the data pull script first (npm run pull-data).");
    process.exit(1);
  }
  const data = JSON.parse(readFileSync("dashboard/data.json", "utf8"));

  const chatId = await getChatId();
  const digest = buildDigest(data);

  console.log("Sending digest to Telegram...");
  await sendMessage(chatId, digest);
  console.log("Sent. Check your Telegram.");
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
