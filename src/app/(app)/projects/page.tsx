import Link from "next/link";
import { EmptyState, ErrorState, NotConfigured, PageHeader } from "@/components/ui";
import { isDbConfigured } from "@/db";
import { listProjects } from "@/lib/dal/projects";
import { requireOwnerId } from "@/lib/session";
import { NewProjectForm } from "./project-forms";

export default async function ProjectsPage() {
  if (!isDbConfigured()) {
    return (
      <>
        <PageHeader title="Projects" />
        <NotConfigured vars={["DATABASE_URL"]} />
      </>
    );
  }
  let items: Awaited<ReturnType<typeof listProjects>> | null = null;
  try {
    items = await listProjects(await requireOwnerId());
  } catch {
    items = null;
  }
  return (
    <>
      <PageHeader title="Projects" />
      <div className="space-y-4">
        <NewProjectForm />
        {items === null ? (
          <ErrorState message="Could not load projects. Refresh in a few seconds." />
        ) : items.length === 0 ? (
          <EmptyState title="No projects" body="Create one above, then assign tasks to it." />
        ) : (
          <ul className="space-y-2">
            {items.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="block rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="text-xs text-muted">{p.status}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full bg-accent" style={{ width: p.total ? `${Math.round((p.done / p.total) * 100)}%` : "0%" }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">{p.done} of {p.total} tasks done</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
