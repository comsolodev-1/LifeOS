import { EmptyState, PageHeader } from "@/components/ui";

export default function Page() {
  return (
    <>
      <PageHeader title="Calendar" />
      <EmptyState title="Not built yet" body="Day, week and month views, recurring events and schedule photo import. Planned for Sprint 4." />
    </>
  );
}
