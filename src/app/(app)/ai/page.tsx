import { EmptyState, PageHeader } from "@/components/ui";

export default function Page() {
  return (
    <>
      <PageHeader title="AI Assistant" />
      <EmptyState title="Not built yet" body="Chat with approved memory and confirm-before-write suggestions. Requires the Privacy Gateway from Sprint 1b. Planned for Sprint 3." />
    </>
  );
}
