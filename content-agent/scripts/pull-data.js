// Pulls @calma.education's full post history + competitor recent posts +
// follower counts from Instagram via Apify, ranks posts by views/engagement,
// and writes the cleaned result to dashboard/data.json.
//
// Usage:
//   npm run pull-data:test   (tiny sample: validates token + actors cheaply)
//   npm run pull-data        (full pull)

import { writeFileSync, mkdirSync } from "node:fs";

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
if (!APIFY_TOKEN) {
  console.error("Missing APIFY_API_TOKEN. Set it in content-agent/.env");
  process.exit(1);
}

const API = "https://api.apify.com/v2";

const MY_USERNAME = "calma.education";
const ALL_COMPETITORS = [
  "IHadAMiscarriage",
  "pregnancyafterlosssupport",
  "maternidad.arcoiris",
  "mitribuperinatal",
  "dueloyarcoiris",
  "dra_yaritza",
];

const isTest = process.argv.includes("--test");
const MY_RESULTS_LIMIT = isTest ? 5 : Number(process.env.MY_RESULTS_LIMIT || 100);
const COMPETITOR_RESULTS_LIMIT = isTest ? 3 : Number(process.env.COMPETITOR_RESULTS_LIMIT || 15);
const COMPETITORS = isTest ? ALL_COMPETITORS.slice(0, 2) : ALL_COMPETITORS;

async function apifyFetch(path, opts = {}) {
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}token=${APIFY_TOKEN}`;
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apify request failed (${res.status}) for ${path.split("?")[0]}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function runActor(actorSlug, input) {
  const { data: run } = await apifyFetch(`/acts/${actorSlug}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  let status = run.status;
  const runId = run.id;
  const startedAt = Date.now();

  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
    if (Date.now() - startedAt > 10 * 60 * 1000) {
      throw new Error(`${actorSlug} run ${runId} did not finish within 10 minutes (client-side timeout)`);
    }
    await new Promise((r) => setTimeout(r, 4000));
    const { data } = await apifyFetch(`/actor-runs/${runId}`);
    status = data.status;
  }

  const { data: finalRun } = await apifyFetch(`/actor-runs/${runId}`);
  if (status !== "SUCCEEDED") {
    throw new Error(`${actorSlug} run ${runId} ended with status ${status}. Check console.apify.com for the log.`);
  }

  return apifyFetch(`/datasets/${finalRun.defaultDatasetId}/items?clean=true`);
}

function scorePost(raw) {
  const views = raw.videoViewCount ?? raw.videoPlayCount ?? null;
  if (typeof views === "number") {
    return { score: views, metricType: "views" };
  }
  const likes = raw.likesCount ?? 0;
  const comments = raw.commentsCount ?? 0;
  // No true view count available for image/carousel posts on this actor.
  // Fall back to an engagement-weighted estimate and mark it as such so
  // downstream consumers (dashboard, Analyst) never mistake it for views.
  return { score: likes + comments * 2, metricType: "engagement_estimate" };
}

function normalizePost(raw) {
  const { score, metricType } = scorePost(raw);
  return {
    id: raw.id ?? raw.shortCode ?? null,
    shortCode: raw.shortCode ?? null,
    url: raw.url ?? null,
    type: raw.type ?? null, // Image, Video, Sidecar
    caption: typeof raw.caption === "string" ? raw.caption.slice(0, 300) : "",
    timestamp: raw.timestamp ?? null,
    likesCount: raw.likesCount ?? null,
    commentsCount: raw.commentsCount ?? null,
    videoViewCount: raw.videoViewCount ?? null,
    videoPlayCount: raw.videoPlayCount ?? null,
    rankScore: score,
    metricType,
  };
}

function isRealPost(raw) {
  // The actor returns an error placeholder (no shortCode/type) instead of
  // throwing when a profile can't be scraped (private, wrong handle, rate
  // limited, etc). Never treat that placeholder as a real 0-engagement post.
  return Boolean(raw && raw.type && (raw.shortCode || raw.id));
}

function rankPosts(rawPosts) {
  const real = rawPosts.filter(isRealPost);
  const errorItems = rawPosts.filter((r) => !isRealPost(r));
  return {
    posts: real.map(normalizePost).sort((a, b) => b.rankScore - a.rankScore),
    fetchError: errorItems.length > 0 ? (errorItems[0].error ?? errorItems[0].errorDescription ?? "actor returned no valid posts") : null,
  };
}

async function main() {
  console.log(`[${isTest ? "TEST" : "FULL"} RUN]`);

  console.log(`Pulling posts for @${MY_USERNAME} (limit ${MY_RESULTS_LIMIT})...`);
  const myPostsRaw = await runActor("apify~instagram-scraper", {
    directUrls: [`https://www.instagram.com/${MY_USERNAME}/`],
    resultsType: "posts",
    resultsLimit: MY_RESULTS_LIMIT,
  });
  const my = rankPosts(myPostsRaw);
  console.log(
    my.fetchError ? `  -> FAILED: ${my.fetchError}` : `  -> got ${my.posts.length} posts`
  );

  const competitors = [];
  for (const handle of COMPETITORS) {
    console.log(`Pulling recent posts for @${handle} (limit ${COMPETITOR_RESULTS_LIMIT})...`);
    const raw = await runActor("apify~instagram-scraper", {
      directUrls: [`https://www.instagram.com/${handle}/`],
      resultsType: "posts",
      resultsLimit: COMPETITOR_RESULTS_LIMIT,
    });
    const result = rankPosts(raw);
    console.log(
      result.fetchError ? `  -> FAILED: ${result.fetchError}` : `  -> got ${result.posts.length} posts`
    );
    competitors.push({ username: handle, ...result });
  }

  console.log(`Pulling follower counts for ${1 + COMPETITORS.length} profiles...`);
  const profiles = await runActor("apify~instagram-profile-scraper", {
    usernames: [MY_USERNAME, ...COMPETITORS],
  });
  const followerCountByUsername = {};
  for (const p of profiles) {
    const uname = p.username ?? p.account;
    if (uname) followerCountByUsername[uname.toLowerCase()] = p.followersCount ?? null;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    isTestRun: isTest,
    account: {
      username: MY_USERNAME,
      followersCount: followerCountByUsername[MY_USERNAME.toLowerCase()] ?? null,
      postsFetched: my.posts.length,
      fetchError: my.fetchError,
      topPosts: my.posts.slice(0, 10),
      posts: my.posts,
    },
    competitors: competitors.map((c) => ({
      username: c.username,
      followersCount: followerCountByUsername[c.username.toLowerCase()] ?? null,
      postsFetched: c.posts.length,
      fetchError: c.fetchError,
      topPosts: c.posts.slice(0, 5),
    })),
  };

  mkdirSync("dashboard", { recursive: true });
  writeFileSync("dashboard/data.json", JSON.stringify(output, null, 2));
  console.log("Saved dashboard/data.json");

  console.log("\n--- Summary ---");
  console.log(`My followers: ${output.account.followersCount}`);
  console.log(`My posts fetched: ${output.account.postsFetched}`);
  if (output.account.fetchError) {
    console.log(`  WARNING: could not fetch my posts (${output.account.fetchError})`);
  } else if (output.account.topPosts[0]) {
    const top = output.account.topPosts[0];
    console.log(`My top post: ${top.url} (${top.metricType}=${top.rankScore})`);
  }
  for (const c of output.competitors) {
    const top = c.topPosts[0];
    if (c.fetchError) {
      console.log(`@${c.username}: FAILED TO FETCH (${c.fetchError}) -- followers: ${c.followersCount ?? "?"}`);
    } else {
      console.log(
        `@${c.username}: ${c.followersCount ?? "?"} followers, top post ${
          top ? `${top.url} (${top.metricType}=${top.rankScore})` : "no posts fetched"
        }`
      );
    }
  }
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
