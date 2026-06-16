"use client";

import AdminSystemPanel from "@/components/admin/panels/AdminSystemPanel";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminSystemPage() {
  return (
    <AdminShell title="Sistema">
      <AdminSystemPanel />
    </AdminShell>
  );
}
