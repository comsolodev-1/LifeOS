import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { TaskList } from "@/components/task-list";
import { getProject } from "@/lib/dal/projects";
import { blockedTaskIds, listTasks } from "@/lib/dal/tasks";
import { requireOwnerId } from "@/lib/session";
import { TaskForm } from "../../tasks/task-form";
import { removeProject } from "../actions";
import { EditProjectForm } from "../project-forms";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    const ownerId = await requireOwnerId();
    const project = await getProject(ownerId, id);
    if (!project) data = "missing" as const;
    else data = { project, items: await listTasks(ownerId, { projectId: id }), blocked: [...(await blockedTaskIds(ownerId))] };
  } catch {
    data = null;
  }
  if (data === "missing") notFound();
  if (data === null) {
    return (
      <>
        <PageHeader title="Project" />
        <ErrorState message="Could not load this project. Refresh in a few seconds." />
      </>
    );
  }
  const { project, items, blocked } = data;
  return (
    <>
      <Link href="/projects" className="mb-3 inline-block text-sm text-accent">Back to projects</Link>
      <PageHeader title={project.name} />
      <div className="space-y-5">
        <EditProjectForm id={project.id} name={project.name} status={project.status} />
        <TaskForm projects={[]} fixedProjectId={project.id} />
        {items.length === 0 ? <EmptyState title="No tasks yet" body="Add one above." /> : <TaskList tasks={items} blocked={blocked} />}
        <form action={removeProject}>
          <input type="hidden" name="id" value={project.id} />
          <button className="min-h-11 w-full rounded-lg border border-red-400/60 text-sm text-red-500">Delete project (tasks are kept)</button>
        </form>
      </div>
    </>
  );
}
