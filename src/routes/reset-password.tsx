import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Choose a new password | Loty" }] }),
  component: ResetPasswordPage,
});

// The emailed reset link signs the person in for this one purpose; here they pick a new password.
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) { toast("The two passwords don't match"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast("Could not change your password", { description: error.message }); return; }
    toast("Password changed");
    navigate({ to: "/dashboard", replace: true });
  };

  return <div className="relative isolate flex min-h-screen flex-col bg-background">
    <Toaster/>
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16">
      <h1 className="text-3xl font-medium tracking-[-0.035em] sm:text-4xl">Choose a new password.</h1>
      {ready
        ? <form onSubmit={submit} className="soft-shadow mt-8 space-y-4 rounded-3xl border border-border/70 bg-card p-7">
            <div className="space-y-2"><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" required minLength={6} autoComplete="new-password"/></div>
            <div className="space-y-2"><Label htmlFor="confirm">Type it again</Label><Input id="confirm" name="confirm" type="password" required minLength={6} autoComplete="new-password"/></div>
            <Button type="submit" className="w-full rounded-full" disabled={busy}>{busy ? "One moment" : "Save new password"}</Button>
          </form>
        : <p className="mt-4 text-sm leading-6 text-muted-foreground">This page works from the link in your reset email. If it has expired, <Link to="/auth" className="underline">ask for a new one</Link>.</p>}
    </main>
  </div>;
}
