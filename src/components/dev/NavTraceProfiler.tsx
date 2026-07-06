"use client";

import { Profiler, type ReactNode } from "react";

import { isNavTraceEnabled, navTraceCommit } from "@/lib/perf/navTrace";

export default function NavTraceProfiler({ children }: { children: ReactNode }) {
  if (!isNavTraceEnabled()) return children;

  return (
    <Profiler
      id="sayittome-nav"
      onRender={() => {
        navTraceCommit();
      }}
    >
      {children}
    </Profiler>
  );
}
