import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import "./index.css";
import { RequireAdminKey } from "./app/RequireAdminKey";
import { AppShell } from "./app/AppShell";
import { InboxPage } from "./features/inbox/InboxPage";
import { TasksPage } from "./features/tasks/TasksPage";
import { NotesPage } from "./features/notes/NotesPage";
import { BookmarksPage } from "./features/bookmarks/BookmarksPage";
import { LinesPage } from "./features/lines/LinesPage";

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
      { path: "inbox", element: <InboxPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "notes", element: <NotesPage /> },
      { path: "bookmarks", element: <BookmarksPage /> },
      { path: "journal", element: <LinesPage bucket="journal" /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
