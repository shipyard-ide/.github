#!/usr/bin/env bun
/**
 * Scrapes PR video bot comments from shipyard-ide repos and updates profile/README.md.
 * Run: bun scripts/update-readme.ts
 */
import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

const ORG = "shipyard-ide";

const REPOS = [
  "my_android_confetti_app",
  "my_expo_instacart",
  "my_expo_pokedex",
  "my_flutter_pokedex_app",
  "my_flutter_sparkler_app",
  "my_flutter_stopwatch",
  "my_flutter_twitter_app",
  "my_ios_calendar",
  "my_ios_health_app",
  "my_ios_pizza_app",
  "my_ios_spotify",
  "my_ios_weather_app",
  "my_rn_instacart",
] as const;

type Repo = (typeof REPOS)[number];

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 30_000 }).trim();
  } catch {
    return "";
  }
}

function getFramework(repo: Repo): string {
  if (repo.startsWith("my_flutter_")) return "Flutter";
  if (repo.startsWith("my_expo_")) return "Expo / React Native";
  if (repo.startsWith("my_rn_")) return "React Native";
  if (repo.startsWith("my_ios_")) return "SwiftUI";
  if (repo.startsWith("my_android_")) return "Android (Kotlin)";
  return "—";
}

function isCrossPlatform(repo: Repo): boolean {
  return (
    repo.startsWith("my_flutter_") ||
    repo.startsWith("my_expo_") ||
    repo.startsWith("my_rn_")
  );
}

function getDisplayName(repo: string): string {
  const prefixes = ["my_flutter_", "my_expo_", "my_rn_", "my_ios_", "my_android_"];
  for (const p of prefixes) {
    if (repo.startsWith(p)) {
      repo = repo.slice(p.length);
      break;
    }
  }
  return repo
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface PRInfo {
  number: number;
  title: string;
  url: string;
}

interface CommentBody {
  body: string;
}

type VideoStatus =
  | { kind: "both"; ios: string; android: string }
  | { kind: "ios_only"; ios: string }
  | { kind: "android_only"; android: string }
  | { kind: "single"; video: string }
  | { kind: "filming" }
  | { kind: "pending" };

function extractVideos(comments: CommentBody[]): VideoStatus {
  const videoRe = /https:\/\/github\.com\/user-attachments\/assets\/[a-f0-9-]+/g;

  for (let i = comments.length - 1; i >= 0; i--) {
    const body = comments[i].body;
    if (!body.includes("shipyard-pr-video-bot")) continue;

    const vids = body.match(videoRe) ?? [];
    const hasTable = body.includes("<table>");
    const hasIOS = body.includes("<strong>iOS</strong>");
    const hasAndroid = body.includes("<strong>Android</strong>");

    if (vids.length === 0) {
      return { kind: body.includes("filming") ? "filming" : "pending" };
    }

    if (hasTable && hasIOS && hasAndroid && vids.length >= 2) {
      return { kind: "both", ios: vids[0], android: vids[1] };
    }
    if (hasTable && hasIOS) return { kind: "ios_only", ios: vids[0] };
    if (hasTable && hasAndroid) return { kind: "android_only", android: vids[0] };
    return { kind: "single", video: vids[0] };
  }

  return { kind: "pending" };
}

function buildVideoCell(status: VideoStatus, cross: boolean): string {
  switch (status.kind) {
    case "both":
      return [
        "<table><tr>",
        `<td align="center"><b>iOS</b><br><video src="${status.ios}" width="240"></video></td>`,
        `<td align="center"><b>Android</b><br><video src="${status.android}" width="240"></video></td>`,
        "</tr></table>",
      ].join("");

    case "ios_only":
      if (!cross) return `<video src="${status.ios}" width="300"></video>`;
      return [
        "<table><tr>",
        `<td align="center"><b>iOS</b><br><video src="${status.ios}" width="280"></video></td>`,
        `<td align="center"><b>Android</b><br>⏳</td>`,
        "</tr></table>",
      ].join("");

    case "android_only":
      if (!cross) return `<video src="${status.android}" width="300"></video>`;
      return [
        "<table><tr>",
        `<td align="center"><b>iOS</b><br>⏳</td>`,
        `<td align="center"><b>Android</b><br><video src="${status.android}" width="280"></video></td>`,
        "</tr></table>",
      ].join("");

    case "single":
      return `<video src="${status.video}" width="300"></video>`;
    case "filming":
      return "🎬 *Filming...*";
    case "pending":
      return "⏳ *Pending*";
  }
}

// ── Main ──

const rows: string[] = [];

for (const repo of REPOS) {
  process.stderr.write(`Scraping ${repo}...`);

  // Get open PR
  const prRaw = run(`gh pr list --repo ${ORG}/${repo} --limit 1 --json number,title,url`);
  const prList: PRInfo[] = prRaw ? JSON.parse(prRaw) : [];

  if (prList.length === 0) {
    console.error(" no open PR, skipping");
    continue;
  }

  const pr = prList[0];

  // Get bot comments
  const commentsRaw = run(
    `gh api repos/${ORG}/${repo}/issues/${pr.number}/comments --paginate`
  );
  // Paginated responses concatenate JSON arrays: ][
  const cleaned = commentsRaw.replace(/\]\s*\[/g, ",");
  const comments: CommentBody[] = cleaned ? JSON.parse(cleaned) : [];

  const status = extractVideos(comments);
  const framework = getFramework(repo);
  const displayName = getDisplayName(repo);
  const cross = isCrossPlatform(repo);
  const videoCell = buildVideoCell(status, cross);

  rows.push(
    `| **${displayName}** | \`${framework}\` | [${pr.title}](${pr.url}) | ${videoCell} |`
  );

  console.error(` PR #${pr.number} → ${status.kind}`);
}

// Build README
const timestamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
const tableRows = rows.join("\n");

const readme = `<div align="center">

# Shippy

**AI-powered PR video previews for mobile apps**

Stop forcing reviewers to build your app just to see a UI change.
Shippy automatically records a video of your mobile code in action and posts it to your PR.

**[Install Shippy →](https://github.com/apps/shippy-agent)**

Then just open or push to a PR — Shippy handles the rest.

Flutter · React Native · Expo · SwiftUI · Android

---

</div>

### 📱 Demo Gallery

Real PRs. Real apps. Every video below was **automatically generated** by Shippy — no human touched a simulator.

| App | Framework | Pull Request | Video Preview |
|:----|:----------|:-------------|:--------------|
${tableRows}

---

<div align="center">

**[Install Shippy on your repo →](https://github.com/apps/shippy-agent)**

Just install the GitHub app and push to a PR. That's it.

<sub>Last updated ${timestamp} · Refreshed automatically twice daily</sub>

</div>
`;

const readmePath = join(dirname(import.meta.dirname!), "profile", "README.md");
mkdirSync(dirname(readmePath), { recursive: true });
writeFileSync(readmePath, readme);

console.error(`\nREADME updated with ${rows.length} rows`);
