import { EmptyState, PageHeader } from "@/components/ui";

export default function Page() {
  return (
    <>
      <PageHeader title="Goals" />
      <EmptyState title="Not built yet" body="Goals, milestones and habits. Planned for Sprint 5." />
    </>
  );
}
