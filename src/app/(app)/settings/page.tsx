import { EmptyState, PageHeader } from "@/components/ui";

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" />
      <EmptyState title="Not built yet" body="Privacy mode, data export and AI notices. Planned for Sprint 7." />
    </>
  );
}
