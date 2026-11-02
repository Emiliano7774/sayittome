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
  // Isolated Windows release worktrees may share node_modules via a junction.
  // Include both directories in Turbopack's filesystem root only during QA/build.
  ...(process.env.SAYITTOME_ISOLATED_TURBO_ROOT
    ? { turbopack: { root: process.env.SAYITTOME_ISOLATED_TURBO_ROOT } }
    : {}),
  // firebase-admin must not be statically imported into the SSR graph.
  // Turbopack rewrites import("firebase-admin/…") → firebase-admin-<hash>
  // externals that Firebase packaging drops on Linux GCF → MODULE_NOT_FOUND.
  // Load Admin only via src/lib/admin/firebaseAdminNative (opaque require).
  // Deploy gates FAIL if any firebase-admin-<hash> remains in .next/server.
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
    // Compatibility fallback for Firebase Hosting's packaged Next image handler.
    // The primary remotePatterns remain the restrictive source policy.
    domains: ["firebasestorage.googleapis.com", "storage.googleapis.com"],
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
        // Navigation HTML only. API routes own their cache/privacy headers.
        source: "/((?!api/|_next/static|_next/image|downloads/|icons/|favicon).*)",
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
