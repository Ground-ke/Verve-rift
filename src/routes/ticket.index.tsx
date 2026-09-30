import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/ticket/")({
  beforeLoad: () => {
    throw redirect({ to: "/tickets" });
  },
  component: () => null,
});
