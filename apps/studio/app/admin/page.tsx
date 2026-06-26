import { redirect } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { AdminWorkspace } from "../../components/AdminWorkspace";
import { getCurrentUser } from "../../lib/server/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "admin") {
    redirect("/create");
  }

  return (
    <AppShell>
      <AdminWorkspace />
    </AppShell>
  );
}
