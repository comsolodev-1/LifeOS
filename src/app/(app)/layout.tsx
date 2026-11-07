import { ImportBanner, ImportProvider } from "@/components/import-provider";
import { Sidebar, TabBar } from "@/components/nav";
import { QuickAdd } from "@/components/ui";
import { requireOwnerEmail } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerEmail();
  return (
    <ImportProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 md:pb-10">
          <ImportBanner />
          {children}
        </main>
        <TabBar />
        <QuickAdd />
      </div>
    </ImportProvider>
  );
}
