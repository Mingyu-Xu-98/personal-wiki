import { redirect } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { SiteWorkspace } from "../../components/SiteWorkspace";
import { getCurrentUser } from "../../lib/server/auth";

export default async function SitePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell>
      <main className="page">
        <SiteWorkspace />
      </main>
    </AppShell>
  );
}
