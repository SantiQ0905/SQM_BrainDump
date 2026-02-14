import { Outlet } from "react-router-dom";
import { Sidebar } from "./layout/Sidebar";

export function AppShell() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto flex min-h-screen max-w-5xl">
        <Sidebar />
        <main className="flex-1 px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
