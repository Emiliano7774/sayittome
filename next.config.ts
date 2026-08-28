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
    const p0PrivateNoStore = "private, no-store, max-age=0";
    return [
      {
        source: "/api/admin/p0-abuse-config",
        headers: [{ key: "Cache-Control", value: p0PrivateNoStore }],
      },
      {
        source: "/api/admin/p0-ip-trust-echo",
        headers: [{ key: "Cache-Control", value: p0PrivateNoStore }],
      },
      {
        source: "/api/admin/p0-ip-trust-probe",
        headers: [{ key: "Cache-Control", value: p0PrivateNoStore }],
      },
      {
        source:
          "/((?!_next/static|_next/image|downloads/|icons/|favicon|api/admin/p0-abuse-config|api/admin/p0-ip-trust-echo|api/admin/p0-ip-trust-probe).*)",
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
