"use client";

import AdminModerationWorkspace from "@/components/admin/AdminModerationWorkspace";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminModerationPage() {
  return (
    <AdminShell title="Moderación">
      <AdminModerationWorkspace />
    </AdminShell>
  );
}
