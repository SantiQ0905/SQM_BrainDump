import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import "./index.css";
import { RequireAdminKey } from "./app/RequireAdminKey";
import { AppShell } from "./app/AppShell";
import { InboxPage } from "./features/inbox/InboxPage";

const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/inbox" replace /> },
  {
    path: "/",
    element: (
      <RequireAdminKey>
        <AppShell />
      </RequireAdminKey>
    ),
    children: [{ path: "inbox", element: <InboxPage /> }],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
