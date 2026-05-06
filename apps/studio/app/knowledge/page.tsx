import { redirect } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { KnowledgeWorkspace } from "../../components/KnowledgeWorkspace";
import { getCurrentUser } from "../../lib/server/auth";

export default async function KnowledgePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell>
      <main className="page">
        <KnowledgeWorkspace />
      </main>
    </AppShell>
  );
}
