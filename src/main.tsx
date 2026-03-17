import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import "./index.css";
import { ThemeProvider } from "./app/ThemeContext";
import { RequireAdminKey } from "./app/RequireAdminKey";
import { AppShell } from "./app/AppShell";
import { InboxPage } from "./features/inbox/InboxPage";
import { TasksPage } from "./features/tasks/TasksPage";
import { NotesPage } from "./features/notes/NotesPage";
import { BookmarksPage } from "./features/bookmarks/BookmarksPage";
import { LinesPage } from "./features/lines/LinesPage";
import { HabitTrackerPage } from "./features/habits/HabitTrackerPage";
import { MoodTrackerPage } from "./features/mood/MoodTrackerPage";
import { MetricsPage } from "./features/metrics/MetricsPage";
import { BudgetPage } from "./features/budget/BudgetPage";
import { BudgetSetupPage } from "./features/budget/BudgetSetupPage";

const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/inbox" replace /> },
  {
    path: "/",
    element: (
      <RequireAdminKey>
        <AppShell />
      </RequireAdminKey>
    ),
    children: [
      { path: "inbox",     element: <InboxPage /> },
      { path: "tasks",     element: <TasksPage /> },
      { path: "notes",     element: <NotesPage /> },
      { path: "bookmarks", element: <BookmarksPage /> },
      { path: "journal",   element: <LinesPage bucket="journal" /> },
      { path: "habits",    element: <HabitTrackerPage /> },
      { path: "mood",      element: <MoodTrackerPage /> },
      { path: "metrics",   element: <MetricsPage /> },
      { path: "budget",    element: <BudgetPage /> },
      { path: "budget/setup", element: <BudgetSetupPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>
);
