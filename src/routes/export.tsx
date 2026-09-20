import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/export")({ component: () => <Navigate to="/" /> });
