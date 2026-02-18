import { Outlet } from "react-router-dom";
import { Sidebar } from "./layout/Sidebar";

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-app text-primary transition-colors duration-200">
      <Sidebar />
      <main className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
