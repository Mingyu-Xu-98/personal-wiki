import { redirect } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { KnowledgeWorkspace } from "../../components/KnowledgeWorkspace";
import { getCurrentUser } from "../../lib/server/auth";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell>
      <KnowledgeWorkspace />
    </AppShell>
  );
}
