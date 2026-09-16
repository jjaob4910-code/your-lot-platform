import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Sign in | Loty" },
    { name: "description", content: "Sign in to your Loty account to run your owners corporation: levies, compliance, repairs and records." },
    { property: "og:title", content: "Sign in | Loty" },
    { property: "og:description", content: "Sign in to run your owners corporation with Loty." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setBusy(true);
    try {
      if (mode === "signup") {
        const role = String(form.get("role") ?? "Owner");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard", data: { role, display_name: email.split("@")[0] } },
        });
        if (error) throw error;
        if (!data.session) {
          toast("Check your email", { description: "Confirm your address to finish creating your account." });
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast("That didn't work", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative isolate flex min-h-screen flex-col bg-background">
      <Toaster />
      <header className="border-b border-border/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold">
            <span className="grid size-5 grid-cols-2 gap-0.5">{[0, 1, 2, 3].map(i => <span key={i} className="rounded-[2px] bg-primary" />)}</span>Loty
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16">
        <h1 className="text-3xl font-medium tracking-[-0.035em] sm:text-4xl">
          {mode === "signin" ? "Welcome back." : "Create your account."}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {mode === "signin"
            ? "Sign in to see your levies, repairs and deadlines."
            : "Owners see their own lot. Committee members run the whole building."}
        </p>
        <form onSubmit={submit} className="soft-shadow mt-8 space-y-4 rounded-3xl border border-border/70 bg-card p-7">
          <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></div>
          <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} /></div>
          {mode === "signup" && (
            <div className="space-y-2">
              <Label>I am</Label>
              <Select name="role" defaultValue="Owner">
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Owner">An owner</SelectItem>
                  <SelectItem value="Committee">A committee member</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <Button type="submit" className="w-full rounded-full" disabled={busy}>
            {busy ? "One moment" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          <button type="button" className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "No account yet? Create one" : "Already have an account? Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}
