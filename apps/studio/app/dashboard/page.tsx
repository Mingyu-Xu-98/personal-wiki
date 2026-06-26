import { redirect } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { SiteWorkspace } from "../../components/SiteWorkspace";
import { getCurrentUser } from "../../lib/server/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell>
      <SiteWorkspace />
    </AppShell>
  );
}
