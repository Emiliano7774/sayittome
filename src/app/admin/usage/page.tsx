"use client";

import AdminShell from "@/components/admin/AdminShell";
import AdminUsagePanel from "@/components/admin/AdminUsagePanel";

export default function AdminUsagePage() {
  return (
    <AdminShell title="Uso de la app">
      <AdminUsagePanel />
    </AdminShell>
  );
}
