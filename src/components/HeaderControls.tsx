"use client";

import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import UxModeSwitcher from "@/components/UxModeSwitcher";

export default function HeaderControls() {
  return (
    <div className="flex items-center gap-2">
      <LanguageSwitcher compact />
      <UxModeSwitcher />
    </div>
  );
}
