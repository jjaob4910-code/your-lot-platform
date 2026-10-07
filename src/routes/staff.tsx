import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STAFF_DOMAIN } from "@/lib/portfolio";

export const Route = createFileRoute("/staff")({
  ssr: false,
  head: () => ({ meta: [{ title: "Loty staff sign in | Loty" }, { name: "robots", content: "noindex" }] }),
  component: StaffSignIn,
});

// Loty staff sign in with a Staff ID and passcode. Behind the scenes each Staff ID is a normal
// Supabase account at <id>@staff.loty.app (created in Supabase), so passwords and rate limits
// work as usual; staff never see or type that address.
function StaffSignIn() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const id = String(f.get("staff_id") ?? "").trim().toLowerCase();
    const passcode = String(f.get("passcode") ?? "");
    if (!/^[a-z0-9.-]{2,40}$/.test(id)) { setError("Staff IDs use letters, numbers, dots and dashes."); return; }
    setBusy(true); setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: `${id}@${STAFF_DOMAIN}`, password: passcode });
    if (signInError) { setBusy(false); setError(/rate|too many/i.test(signInError.message) ? "Too many tries. Wait a minute and try again." : "That Staff ID or passcode isn't right."); return; }
    const { data: staff } = await supabase.rpc("is_loty_staff");
    if (staff !== true) {
      await supabase.auth.signOut();
      setBusy(false); setError("This account isn't Loty staff. Ask a Loty admin to add it.");
      return;
    }
    navigate({ to: "/portfolio", replace: true });
  };

  return <div className="relative isolate flex min-h-screen flex-col bg-background">
    <header className="border-b border-border/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold">
          <span className="grid size-5 grid-cols-2 gap-0.5">{[0, 1, 2, 3].map(i => <span key={i} className="rounded-[2px] bg-primary"/>)}</span>Loty
        </Link>
      </div>
    </header>
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Loty team only</p>
      <h1 className="mt-3 text-3xl font-medium tracking-[-0.035em] sm:text-4xl">Staff sign in</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Use your Loty Staff ID and passcode to open the Loty dashboard.</p>
      <form onSubmit={e => void submit(e)} className="soft-shadow mt-8 space-y-4 rounded-3xl border border-border/70 bg-card p-7" data-staff-form>
        <div className="space-y-2"><Label htmlFor="staff_id">Staff ID</Label>
          <Input id="staff_id" name="staff_id" required autoComplete="username" autoCapitalize="none" spellCheck={false} onChange={() => setError(null)}/></div>
        <div className="space-y-2"><Label htmlFor="passcode">Passcode</Label>
          <Input id="passcode" name="passcode" type="password" required autoComplete="current-password" onChange={() => setError(null)}/></div>
        {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
        <Button type="submit" className="w-full rounded-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        <Link to="/auth" className="block text-center text-xs text-muted-foreground underline-offset-4 hover:underline">Not Loty staff? Sign in here</Link>
      </form>
    </main>
  </div>;
}
