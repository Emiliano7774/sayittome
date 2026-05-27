"use client";

import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import UxModeSwitcher from "@/components/UxModeSwitcher";

export default function HeaderControls() {
  return (
    <div className="flex w-full flex-col items-end gap-1.5 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
      <LanguageSwitcher compact />
      <UxModeSwitcher />
    </div>
  );
}
