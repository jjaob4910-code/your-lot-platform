import { JUST_JOINED_KEY } from "@/components/welcome-tour";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

// Invite links land here as /auth?invite=<token>. The token rides along with sign-up (the
// database accepts it as the account is created) or is accepted right after signing in.
const inviteFromUrl = () => { try { return new URLSearchParams(window.location.search).get("invite"); } catch { return null; } };

function AuthPage() {
  const navigate = useNavigate();
  const [invite] = useState(() => (typeof window === "undefined" ? null : inviteFromUrl()));
  const [mode, setMode] = useState<"signin" | "signup" | "reset">(() => (typeof window !== "undefined" && inviteFromUrl() ? "signup" : "signin"));
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState<string | null>(null);

  const acceptAndGo = async () => {
    if (invite) {
      const { error } = await supabase.rpc("accept_invite", { _token: invite });
      if (error) toast("We couldn't use that invite link", { description: error.message });
      else { toast("You've joined the building"); try { sessionStorage.setItem(JUST_JOINED_KEY, "1"); } catch { /* storage unavailable */ } }
    }
    navigate({ to: "/dashboard", replace: true });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void acceptAndGo();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
        if (error) throw error;
        setResetSent(email);
        return;
      }
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/dashboard",
            data: { display_name: email.split("@")[0], ...(invite ? { invite } : {}) },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast("Check your email", { description: "Confirm your address to finish creating your account." });
          return;
        }
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await acceptAndGo();
    } catch (error) {
      toast("That didn't work", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "reset" ? "Reset your password." : mode === "signin" ? "Welcome back." : invite ? "You've been invited." : "Create your account.";
  const blurb = mode === "reset"
    ? "Enter your email and we'll send you a link to choose a new password."
    : mode === "signin"
      ? invite ? "Sign in to join the building you've been invited to." : "Sign in to see your levies, repairs and deadlines."
      : invite ? "Create your account to join your building on Loty." : "Owners: use the email your committee has on file for your lot, or the invite link they sent you. Setting up a new building? Create an account and we'll walk you through it.";

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
        <h1 className="text-3xl font-medium tracking-[-0.035em] sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{blurb}</p>
        {resetSent
          ? <div className="soft-shadow mt-8 space-y-3 rounded-3xl border border-border/70 bg-card p-7 text-sm">
              <p>We've sent a reset link to <strong>{resetSent}</strong>. Open it on this device to choose a new password.</p>
              <button type="button" className="text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => { setResetSent(null); setMode("signin"); }}>Back to sign in</button>
            </div>
          : <form onSubmit={submit} className="soft-shadow mt-8 space-y-4 rounded-3xl border border-border/70 bg-card p-7">
              <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></div>
              {mode !== "reset" && <div className="space-y-2">
                <div className="flex items-center justify-between"><Label htmlFor="password">Password</Label>
                  {mode === "signin" && <button type="button" className="text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setMode("reset")}>Forgot your password?</button>}</div>
                <Input id="password" name="password" type="password" required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
              </div>}
              <Button type="submit" className="w-full rounded-full" disabled={busy}>
                {busy ? "One moment" : mode === "reset" ? "Send reset link" : mode === "signin" ? "Sign in" : invite ? "Create account and join" : "Create account"}
              </Button>
              <button type="button" className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setMode(mode === "signup" ? "signin" : mode === "reset" ? "signin" : "signup")}>
                {mode === "signin" ? "No account yet? Create one" : "Already have an account? Sign in"}
              </button>
            </form>}
      </main>
    </div>
  );
}
