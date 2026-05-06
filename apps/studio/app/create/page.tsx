import { redirect } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { CreateWorkspace } from "../../components/CreateWorkspace";
import { getCurrentUser } from "../../lib/server/auth";

export default async function CreatePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell>
      <main className="page">
        <CreateWorkspace />
      </main>
    </AppShell>
  );
}
