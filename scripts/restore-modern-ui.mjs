import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const root = "c:/Users/emibe/sayittome-web";

function gitShow(commit, rel) {
  const buf = execSync(`git -C "${root}" show ${commit}:${rel}`, { encoding: "buffer" });
  return buf.toString("utf8");
}

function save(rel, text) {
  writeFileSync(join(root, rel), Buffer.from(text, "utf8"));
}

// ModernHome — fb29472 literal
save("src/components/modern/ModernHome.tsx", gitShow("fb29472", "src/components/modern/ModernHome.tsx"));

// ModernShuffleCard — 92b58d1 + cover fields
let shuffle = gitShow("92b58d1", "src/components/modern/ModernShuffleCard.tsx");
shuffle = shuffle.replace(
  "  const href = story.hasActive && story.storyPath ? story.storyPath : `/u/${encodeURIComponent(profile.username)}`;\n\n  return (",
  "  const href = story.hasActive && story.storyPath ? story.storyPath : `/u/${encodeURIComponent(profile.username)}`;\n  const coverImage = profile.coverPhoto || profile.photo;\n\n  return (",
);
shuffle = shuffle.replace(
  `        {profile.photo ? (
          <>
            <img
              src={profile.photo}`,
  `        {profile.coverVideo ? (
          <>
            <video
              src={profile.coverVideo}
              className={[
                "absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]",
                profile.blurPhoto ? "blur-2xl scale-110" : "",
              ].join(" ")}
              autoPlay
              muted
              loop
              playsInline
            />
            {profile.blurPhoto ? (
              <SensitiveBlurOverlay label="Contenido moderado" />
            ) : null}
          </>
        ) : coverImage ? (
          <>
            <img
              src={coverImage}`,
);
save("src/components/modern/ModernShuffleCard.tsx", shuffle);

// ModernPublicProfile — 92b58d1 + portada + isOwner
let profile = gitShow("92b58d1", "src/components/modern/ModernPublicProfile.tsx");
profile = profile.replace(
  "  fotoPrincipal: string;\n  fotos?: string[];",
  "  fotoPrincipal: string;\n  fotoPortada?: string;\n  videoPortada?: string;\n  fotos?: string[];",
);
profile = profile.replace(
  `            {profile.fotoPrincipal ? (
              <>
                <img
                  src={profile.fotoPrincipal}
                  alt={profile.username}
                  className={[
                    "h-full w-full object-cover",
                    blurPhoto ? "blur-2xl scale-110" : "",
                  ].join(" ")}
                />
                {blurPhoto ? <SensitiveBlurOverlay label="Foto moderada" /> : null}
              </>
            ) : (`,
  `            {profile.videoPortada ? (
              <>
                <video
                  src={profile.videoPortada}
                  className={[
                    "h-full w-full object-cover",
                    blurPhoto ? "blur-2xl scale-110" : "",
                  ].join(" ")}
                  autoPlay
                  muted
                  loop
                  playsInline
                />
                {blurPhoto ? <SensitiveBlurOverlay label="Portada moderada" /> : null}
              </>
            ) : profile.fotoPortada || profile.fotoPrincipal ? (
              <>
                <img
                  src={profile.fotoPortada || profile.fotoPrincipal}
                  alt={profile.username}
                  className={[
                    "h-full w-full object-cover",
                    blurPhoto ? "blur-2xl scale-110" : "",
                  ].join(" ")}
                />
                {blurPhoto ? <SensitiveBlurOverlay label="Foto moderada" /> : null}
              </>
            ) : (`,
);
profile = profile.replace(
  "<VerifiedLinkBubble username={profile.username} />",
  "<VerifiedLinkBubble username={profile.username} isOwner={isOwner} />",
);
save("src/components/modern/ModernPublicProfile.tsx", profile);

console.log("restored modern UI files (utf8)");
