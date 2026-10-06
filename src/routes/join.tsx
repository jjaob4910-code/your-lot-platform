import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/join")({
  ssr: false,
  head: () => ({ meta: [{ title: "Join your building | Loty" }] }),
  component: JoinPage,
});

// Invite links look like /join?token=…; sign-in handles both new and existing accounts.
function JoinPage() {
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    window.location.replace(`/auth?invite=${encodeURIComponent(token)}`);
  }, []);
  return null;
}
