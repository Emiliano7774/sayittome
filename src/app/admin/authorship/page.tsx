"use client";

import AdminAuthorshipRepairPanel from "@/components/admin/panels/AdminAuthorshipRepairPanel";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminAuthorshipPage() {
  return (
    <AdminShell title="Autoría histórica">
      <AdminAuthorshipRepairPanel />
    </AdminShell>
  );
}
