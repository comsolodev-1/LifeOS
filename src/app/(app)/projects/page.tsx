import { EmptyState, PageHeader } from "@/components/ui";

export default function Page() {
  return (
    <>
      <PageHeader title="Projects" />
      <EmptyState title="Not built yet" body="Projects and task links. Planned for Sprint 2." />
    </>
  );
}
