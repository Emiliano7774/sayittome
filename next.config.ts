import type { NextConfig } from "next";
import { execSync } from "node:child_process";

function resolveBuildSha() {
  if (process.env.NEXT_PUBLIC_BUILD_SHA) return process.env.NEXT_PUBLIC_BUILD_SHA;
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  // firebase-admin must resolve as a real package on Cloud Functions. Turbopack
  // rewrites it to hashed aliases (firebase-admin-<hash>) that Firebase SSR
  // packaging often drops (glob skips Windows symlinks) → Linux MODULE_NOT_FOUND.
  // The next bin shim materializes aliases after every build; hosting.predeploy
  // re-materializes + gates the packaged .firebase/<site>/functions artifact.
  serverExternalPackages: [
    "firebase-admin",
    "firebase-admin/app",
    "firebase-admin/auth",
    "firebase-admin/firestore",
  ],
  env: {
    NEXT_PUBLIC_BUILD_SHA: resolveBuildSha(),
    NEXT_PUBLIC_BUILD_AT: process.env.NEXT_PUBLIC_BUILD_AT || "",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.firebasestorage.app",
        pathname: "/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24,
  },
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|downloads/|icons/|favicon).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
