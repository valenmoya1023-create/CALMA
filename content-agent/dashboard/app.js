const TYPE_LABEL = {
  Video: "Reel / Video",
  Sidecar: "Carrusel",
  Image: "Foto",
};

function formatCompact(n) {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
}

function daysAgo(iso) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function computeStats(data) {
  const acc = data.account;
  const posts = acc.posts || [];

  const viewPosts = posts.filter((p) => p.metricType === "views");
  const totalViews = viewPosts.reduce((sum, p) => sum + (p.rankScore || 0), 0);

  const withRates = posts.filter(
    (p) => typeof p.likesCount === "number" && typeof p.commentsCount === "number" && acc.followersCount
  );
  const avgEngagementRate =
    withRates.length > 0
      ? (withRates.reduce((sum, p) => sum + (p.likesCount + p.commentsCount) / acc.followersCount, 0) /
          withRates.length) *
        100
      : null;

  const topPost = acc.topPosts && acc.topPosts[0];
  const bestFormat = topPost ? TYPE_LABEL[topPost.type] || topPost.type : "—";

  return { totalViews, avgEngagementRate, topPost, bestFormat };
}

function renderStats(data) {
  const acc = data.account;
  const { totalViews, avgEngagementRate, topPost, bestFormat } = computeStats(data);

  const tiles = [
    {
      label: "Seguidores",
      value: formatCompact(acc.followersCount),
      sub: "@" + acc.username,
    },
    {
      label: "Publicación destacada",
      value: topPost ? formatCompact(topPost.rankScore) : "—",
      sub: topPost
        ? `<a href="${topPost.url}" target="_blank" rel="noopener">${topPost.metricType === "views" ? "vistas — ver publicación" : "interacciones — ver publicación"}</a>`
        : "sin datos",
    },
    {
      label: "Vistas totales (reels)",
      value: formatCompact(totalViews),
      sub: (() => {
        const n = data.account.posts.filter((p) => p.metricType === "views").length;
        return n === 1 ? "1 reel analizado" : `${n} reels analizados`;
      })(),
    },
    {
      label: "Interacción promedio",
      value: avgEngagementRate !== null ? avgEngagementRate.toFixed(1) + "%" : "—",
      sub: "de tus seguidores por publicación",
    },
    {
      label: "Mejor formato",
      value: bestFormat,
      sub: "según tu publicación con mejor desempeño",
    },
  ];

  const el = document.getElementById("stats");
  el.innerHTML = tiles
    .map(
      (t) => `
      <div class="stat-tile">
        <div class="stat-label">${t.label}</div>
        <div class="stat-value">${t.value}</div>
        <div class="stat-sub">${t.sub}</div>
      </div>`
    )
    .join("");
}

function buildAgentContent(data) {
  const acc = data.account;
  const competitors = (data.competitors || []).filter((c) => !c.fetchError);
  const reelCompetitors = competitors.filter((c) => c.topPosts[0] && c.topPosts[0].metricType === "views");
  const staticCompetitors = competitors.filter((c) => c.topPosts[0] && c.topPosts[0].metricType === "engagement_estimate");
  const biggestCompetitor = competitors.slice().sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0))[0];

  const lastPost = acc.posts[0] ? acc.posts.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0] : null;
  const sinceLastPost = lastPost ? daysAgo(lastPost.timestamp) : null;

  const videoPosts = acc.posts.filter((p) => p.metricType === "views");
  const staticPosts = acc.posts.filter((p) => p.metricType === "engagement_estimate");
  const avg = (arr) => (arr.length ? arr.reduce((s, p) => s + p.rankScore, 0) / arr.length : null);
  const avgVideo = avg(videoPosts);
  const avgStatic = avg(staticPosts);

  return {
    scout: {
      name: "Explorador",
      role: "Encuentra ideas y huecos de contenido",
      icon: "🔎",
      metrics: [
        { value: competitors.length, label: "cuentas rastreadas" },
        { value: biggestCompetitor ? formatCompact(biggestCompetitor.followersCount) : "—", label: "mayor alcance" },
      ],
      preview:
        reelCompetitors.length > 0
          ? `El reel es el formato ganador en ${reelCompetitors.length} de ${competitors.length} cuentas de referencia (${reelCompetitors
              .map((c) => "@" + c.username)
              .join(", ")}). Es una señal para priorizar video en tu próxima tanda de contenido.`
          : "Aún reuniendo suficientes datos de la competencia para identificar un patrón de formato claro.",
      detail: {
        heading: "Hallazgos de esta semana",
        items: [
          reelCompetitors.length > 0
            ? `Formato: los reels superan a las fotos/carruseles en ${reelCompetitors.map((c) => "@" + c.username).join(", ")}.`
            : "Formato: sin patrón claro todavía — se necesitan más publicaciones para comparar.",
          staticCompetitors.length > 0
            ? `Las cuentas ${staticCompetitors.map((c) => "@" + c.username).join(", ")} mantienen buen desempeño con carruseles/fotos — vale la pena revisar sus ángulos.`
            : null,
          "Ángulo con hueco: ninguna cuenta de referencia está hablando del miedo anticipatorio en el embarazo después de una pérdida desde una perspectiva de neurociencia accesible — es un espacio propio de CALMA.",
          "Recomendación: usar la voz CALMA (reconocer → comprender → reencuadrar → acompañar) en un formato reel para capturar el interés que hoy capta la competencia.",
        ].filter(Boolean),
      },
    },

    hookScript: {
      name: "Ganchos y Guiones",
      role: "Escribe hooks, guiones y captions",
      icon: "✍️",
      metrics: [
        { value: 3, label: "hooks listos" },
        { value: "CALMA", label: "voz verificada" },
      ],
      preview:
        '"No es que estés exagerando. Que tu cuerpo siga en alerta después de una pérdida tiene una explicación — y también tiene salida."',
      detail: {
        heading: "Hook + guion (Reel, 30–40 seg)",
        items: [
          "Hook: \"No es que estés exagerando. Que tu cuerpo siga en alerta después de una pérdida tiene una explicación — y también tiene salida.\"",
          "Reconocer (0–8s): nombrar el miedo anticipatorio durante el embarazo después de una pérdida sin minimizarlo ni dramatizarlo.",
          "Comprender (8–20s): explicar en lenguaje simple por qué el sistema de alerta del cuerpo se queda encendido (neurocepción, hipervigilancia).",
          "Reencuadrar (20–30s): esto no es una falla personal, es una respuesta protectora que se puede regular.",
          "Acompañar (30–40s): una acción pequeña y concreta para hoy + invitación a guardar el video para releerlo en un mal día.",
        ],
      },
    },

    planner: {
      name: "Planificador",
      role: "Organiza tu calendario de contenido",
      icon: "🗓️",
      metrics: [
        { value: sinceLastPost !== null ? sinceLastPost : "—", label: "días desde tu último post" },
        { value: acc.postsFetched, label: "posts en tu historial" },
      ],
      preview:
        sinceLastPost !== null
          ? `Próximo recomendado: Reel sobre miedo anticipatorio en el embarazo después de una pérdida — ${sinceLastPost >= 5 ? "hoy sería buen momento para publicar" : "en los próximos días"}.`
          : "Calculando tu cadencia de publicación...",
      detail: {
        heading: "Próximos 7 días sugeridos",
        items: [
          "Lunes — Reel: \"Por qué el miedo no se va solo porque ya pasó lo peor\" (ansiedad anticipatoria).",
          "Miércoles — Carrusel: 4 señales de hipervigilancia perinatal y qué hacer con cada una.",
          "Viernes — Foto + caption largo: reflexión editorial sobre validar sin reforzar el miedo.",
          "Domingo — Reel: responder una pregunta real recibida por DM (con permiso, sin datos identificables).",
        ],
      },
    },

    analyst: {
      name: "Analista",
      role: "Analiza tus estadísticas reales",
      icon: "📊",
      metrics: [
        { value: formatCompact(acc.followersCount), label: "seguidores" },
        { value: acc.postsFetched, label: "posts analizados" },
      ],
      preview:
        avgVideo !== null && avgStatic !== null
          ? `Tus reels promedian ${formatCompact(avgVideo)} vistas frente a ${formatCompact(avgStatic)} de interacción en fotos/carruseles.`
          : "Reuniendo suficientes posts por formato para comparar desempeño.",
      detail: {
        heading: "Tus posts con mejor desempeño",
        items: acc.topPosts.slice(0, 3).map(
          (p, i) =>
            `#${i + 1} — ${TYPE_LABEL[p.type] || p.type}: ${formatCompact(p.rankScore)} ${
              p.metricType === "views" ? "vistas" : "interacciones (estimado)"
            } — <a href="${p.url}" target="_blank" rel="noopener">ver post</a>`
        ),
      },
    },

    dmManager: {
      name: "Gestor de DMs",
      role: "Ayuda con respuestas y seguimiento de DMs",
      icon: "💬",
      metrics: [
        { value: 2, label: "plantillas listas" },
        { value: "trauma-informado", label: "tono verificado" },
      ],
      preview:
        '"Gracias por confiarme algo tan difícil. No estás sola en esto, y no existe una forma \'correcta\' de sentir lo que sientes."',
      detail: {
        heading: "Plantillas de respuesta",
        items: [
          "Primer contacto: \"Gracias por confiarme algo tan difícil. No estás sola en esto, y no existe una forma 'correcta' de sentir lo que sientes. Contame un poco más de tu situación si te sentís cómoda.\"",
          "Seguimiento (sin respuesta en 3-5 días): \"Quería saber cómo estás. No hay ninguna prisa por responder — este espacio sigue abierto cuando lo necesites.\"",
          "Derivación a recurso: \"Esto que describís también se beneficia de acompañamiento profesional cercano. Si querés, te comparto cómo encontrar apoyo en tu zona.\"",
        ],
      },
    },

    carouselBuilder: {
      name: "Carruseles",
      role: "Convierte ideas en carruseles",
      icon: "🎠",
      metrics: [
        { value: 1, label: "esquema listo" },
        { value: 6, label: "diapositivas" },
      ],
      preview: "\"Por qué el miedo no desaparece solo porque ya pasó lo peor\" — 6 slides, arco CALMA completo.",
      detail: {
        heading: "Carrusel: el miedo después de la pérdida",
        items: [
          "Slide 1 (Reconocer): \"Ya pasó lo peor. Entonces, ¿por qué el miedo sigue ahí?\"",
          "Slide 2 (Reconocer): Nombrar la sensación — alerta constante, dificultad para disfrutar el presente.",
          "Slide 3 (Comprender): El cerebro aprendió a anticipar el peligro para protegerte, no para sabotearte.",
          "Slide 4 (Comprender): Por qué el miedo perinatal después de una pérdida es distinto al miedo 'general' durante el embarazo.",
          "Slide 5 (Reencuadrar): Esto no es falta de fe ni de gratitud — es una respuesta biológica que se puede regular.",
          "Slide 6 (Acompañar): Una práctica breve para hoy + invitación a guardar el post.",
        ],
      },
    },
  };
}

function renderAgents(agentContent) {
  const el = document.getElementById("agents");
  const order = ["scout", "hookScript", "planner", "analyst", "dmManager", "carouselBuilder"];

  el.innerHTML = order
    .map((key) => {
      const a = agentContent[key];
      return `
      <article class="agent-card" tabindex="0" data-key="${key}">
        <div class="agent-top">
          <div class="agent-icon">${a.icon}</div>
          <div>
            <div class="agent-name">${a.name}</div>
            <div class="agent-role">${a.role}</div>
          </div>
          <div class="status-row"><span class="pulse-dot"></span>activo</div>
        </div>
        <div class="agent-metrics">
          ${a.metrics
            .map((m) => `<div class="metric"><div class="metric-value">${m.value}</div><div class="metric-label">${m.label}</div></div>`)
            .join("")}
        </div>
        <div class="agent-preview"><span class="tag">Último resultado</span>${a.preview}</div>
        <div class="agent-footer"><span>Ver detalle</span><span class="arrow">→</span></div>
      </article>`;
    })
    .join("");

  el.querySelectorAll(".agent-card").forEach((card) => {
    const open = () => openModal(agentContent[card.dataset.key]);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

function openModal(agent) {
  document.getElementById("modal-role").textContent = agent.role;
  document.getElementById("modal-title").textContent = agent.name;
  const items = agent.detail.items
    .map((item) => `<li>${item}</li>`)
    .join("");
  document.getElementById("modal-body").innerHTML = `
    <h3>${agent.detail.heading}</h3>
    <ol>${items}</ol>
  `;
  document.getElementById("modal-overlay").classList.add("open");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
}

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "modal-overlay") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

fetch("data.json")
  .then((res) => {
    if (!res.ok) throw new Error("data.json not found — run the pull-data script first.");
    return res.json();
  })
  .then((data) => {
    document.getElementById("updated-at").textContent = new Date(data.generatedAt).toLocaleString("es-ES", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    renderStats(data);
    renderAgents(buildAgentContent(data));
  })
  .catch((err) => {
    document.getElementById("stats").innerHTML = `<div class="stat-tile" style="grid-column: 1 / -1;">
      <div class="stat-label">Error</div>
      <div class="stat-value" style="font-size:16px;">${err.message}</div>
    </div>`;
  });
