import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const root = "c:/Users/emibe/sayittome-web";

function gitShow(commit, rel) {
  const buf = execSync(`git -C "${root}" show ${commit}:${rel}`, { encoding: "buffer" });
  if (buf.length > 1 && buf[1] === 0) return buf.toString("utf16le");
  return buf.toString("utf8");
}

function save(rel, text) {
  writeFileSync(join(root, rel), Buffer.from(text, "utf8"));
}

function verifyUtf8(rel) {
  const buf = readFileSync(join(root, rel));
  if (buf.length > 1 && buf[1] === 0) {
    throw new Error(`${rel} is UTF-16LE after write — fix encoding`);
  }
}

execSync("node scripts/write-modern-identity-card.mjs", { cwd: root, stdio: "inherit" });
execSync("node scripts/write-modern-home.mjs", { cwd: root, stdio: "inherit" });
execSync("node scripts/write-modern-public-profile.mjs", { cwd: root, stdio: "inherit" });

// globals.css from fb29472 if drifted
const globalsRef = gitShow("fb29472", "src/app/globals.css");
const globalsCur = readFileSync(join(root, "src/app/globals.css"), "utf8");
if (globalsRef.trim() !== globalsCur.trim()) {
  save("src/app/globals.css", globalsRef);
  console.log("restored globals.css from fb29472");
}

// modern-shuffle-client — capture-aligned stats + compact stories + MODERN badge
save("src/app/shuffle/modern-shuffle-client.tsx", `"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useSyncExternalStore } from "react";

import ModernPageHeader from "@/components/modern/ModernPageHeader";
import ModernShuffleGrid from "@/components/modern/ModernShuffleGrid";
import ModernStoriesBar from "@/components/modern/ModernStoriesBar";
import ModernUxBadge from "@/components/modern/ModernUxBadge";
import { useShufflePool } from "@/hooks/useShufflePool";
import {
  getShuffleSlotsVersion,
  getVisibleShuffleProfiles,
  subscribeAllShuffleSlots,
} from "@/lib/shuffle/shuffleSlotsStore";
import {
  getCachedStoryGroups,
  getStoriesIndexVersion,
  subscribeStoriesIndex,
} from "@/lib/stories/storiesIndexStore";

export default function ModernShuffleClient() {
  const pool = useShufflePool();

  useSyncExternalStore(subscribeAllShuffleSlots, getShuffleSlotsVersion, getShuffleSlotsVersion);
  useSyncExternalStore(subscribeStoriesIndex, getStoriesIndexVersion, getStoriesIndexVersion);

  const visible = getVisibleShuffleProfiles();
  const onlineVisible = visible.filter((p) => p.showOnline).length;
  const withStories = getCachedStoryGroups().length;

  return (
    <main data-scroll-root className="min-h-screen bg-black pb-32 text-white">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8">
        <ModernPageHeader
          title="Shuffle"
          subtitle="Perfiles activos, historias recientes y gente conectada en tiempo real."
          showBadge={false}
          actions={
            <>
              <Link
                href="/stories/new"
                className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-black shadow-[0_0_30px_rgba(124,58,237,.35)]"
              >
                + Historia
              </Link>
              <Link
                href="/chats"
                className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-black"
              >
                Chats
              </Link>
              <ModernUxBadge />
            </>
          }
        />

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatPill label="PERFILES" value={pool.totalLive} tone="neutral" />
          <StatPill label="ONLINE" value={onlineVisible} tone="green" />
          <StatPill label="CON HISTORIAS" value={withStories} tone="violet" />
          <StatPill label="ACTIVOS 1H" value={visible.length} tone="neutral" />
        </div>

        <ModernStoriesBar compact />

        <div className="mt-5 flex items-center rounded-full border border-white/10 bg-[#0c0c0c] px-5 py-3.5">
          <Search size={20} className="shrink-0 text-white/30" />
          <input
            value={pool.search}
            onChange={(e) => pool.handleSearchChange(e.target.value)}
            placeholder="Buscar perfiles..."
            className="w-full bg-transparent px-3 text-base font-bold outline-none placeholder:text-white/30"
          />
        </div>

        {pool.loading && visible.length === 0 ? (
          <div className="flex h-[50vh] items-center justify-center">
            <p className="text-2xl font-black text-white/35">Cargando perfiles...</p>
          </div>
        ) : !pool.listReady && visible.length === 0 ? (
          <div className="flex h-[50vh] flex-col items-center justify-center text-center">
            <p className="text-2xl font-black text-white/35">No hay perfiles para mostrar.</p>
            {pool.errorText ? (
              <p className="mt-3 font-bold text-white/40">{pool.errorText}</p>
            ) : null}
          </div>
        ) : (
          <div className="mt-5" onClick={pool.handleListClick}>
            <ModernShuffleGrid />
          </div>
        )}
      </div>
    </main>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "violet" | "neutral";
}) {
  const toneClass =
    tone === "green"
      ? "border-green-500/25 bg-green-500/10 text-green-300"
      : tone === "violet"
        ? "border-violet-500/25 bg-violet-500/10 text-violet-200"
        : "border-white/10 bg-white/[0.03] text-white/70";

  return (
    <div className={\`rounded-2xl border px-4 py-3 \${toneClass}\`}>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs font-black tracking-[0.14em] opacity-80">{label}</p>
    </div>
  );
}
`);

for (const [rel, commit] of [
  ["src/components/stories/StoryRing.tsx", "92b58d1"],
  ["src/components/stories/StoriesTray.tsx", "92b58d1"],
  ["src/app/login/page.tsx", "92b58d1"],
]) {
  try {
    save(rel, gitShow(commit, rel));
  } catch (e) {
    console.warn("skip", rel, e.message);
  }
}

for (const rel of [
  "src/components/modern/ModernIdentityCard.tsx",
  "src/components/modern/ModernHome.tsx",
  "src/components/modern/ModernPublicProfile.tsx",
  "src/app/shuffle/modern-shuffle-client.tsx",
]) {
  verifyUtf8(rel);
}

console.log("restored modern visual ecosystem (utf8)");
