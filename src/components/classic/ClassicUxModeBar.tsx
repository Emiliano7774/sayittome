"use client";

import UxModeSwitcher from "@/components/UxModeSwitcher";

export default function ClassicUxModeBar({ className = "" }: { className?: string }) {
  return (
    <div className={`flex w-full max-w-full items-center justify-end overflow-x-auto ${className}`}>
      <UxModeSwitcher />
    </div>
  );
}
