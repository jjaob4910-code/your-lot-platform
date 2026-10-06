import { useEffect, useState } from "react";
import { Copy, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/** Makes a one-use invite link (valid 30 days) for an owner's lot, a committee seat or a building manager, to copy or email. */
export function InviteDialog({ open, onOpenChange, schemeId, role, lot, buildingName }: {
  open: boolean; onOpenChange: (v: boolean) => void; schemeId?: string | undefined; role: "Owner" | "Committee" | "Manager";
  lot?: { id: string; lot_number: number; owner_name: string | null; owner_email: string | null } | null; buildingName?: string | undefined;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !schemeId) return;
    setLink(null); setError(null);
    void supabase.rpc("create_invite", { _scheme: schemeId, _role: role, _lot: lot?.id ?? null }).then(({ data, error: e }) => {
      if (e || !data) { setError(e?.message ?? "Could not make an invite link"); return; }
      setLink(`${window.location.origin}/join?token=${data}`);
    });
  }, [open, schemeId, role, lot?.id]);

  const who = role === "Owner" ? (lot ? `the owner of Lot ${lot.lot_number}` : "an owner") : role === "Manager" ? "a building manager" : "a committee member";
  const subject = `Join ${buildingName ?? "our building"} on Loty`;
  const body = [
    `Hi${lot?.owner_name ? ` ${lot.owner_name.split(" ")[0]}` : ""},`, "",
    role === "Owner"
      ? `Our owners corporation now uses Loty for levies, repairs, meetings and documents. Use this link to set up your account and see ${lot ? `Lot ${lot.lot_number}'s` : "your"} levies and the building's notices:`
      : role === "Manager"
        ? `Our committee would like you to manage ${buildingName ?? "our building"} on Loty, where we keep our levies, repairs, insurance, meetings and records. Use this link to set up your account:`
        : "You've been added to the committee on Loty. Use this link to set up your account:",
    "", link ?? "", "", "The link works once and lasts 30 days.",
  ].join("\n");

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); toast("Invite link copied"); }
    catch { toast("Select the link and copy it", { description: "Your browser didn't allow copying." }); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle className="font-display tracking-[-0.02em]">Invite {who}</DialogTitle>
        <DialogDescription>Send them this link. It works once, lasts 30 days, and {role === "Owner" ? "links their account to the lot" : role === "Manager" ? "lets them run this building day to day, with the same access as the committee" : "gives them committee access to this building"}.</DialogDescription>
      </DialogHeader>
      {error ? <p className="text-sm text-destructive">{error}</p>
        : <div className="space-y-3">
            <Input readOnly value={link ?? "Making a link…"} aria-label="Invite link" onFocus={e => e.currentTarget.select()}/>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="rounded-full" disabled={!link} onClick={() => void copy()}><Copy className="size-3.5"/>Copy link</Button>
              <Button type="button" variant="outline" className="rounded-full" disabled={!link} asChild={!!link}>
                {link ? <a href={`mailto:${encodeURIComponent(lot?.owner_email ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}><Mail className="size-3.5"/>Email it</a> : <span><Mail className="size-3.5"/>Email it</span>}
              </Button>
            </div>
            {role === "Owner" && lot?.owner_email && <p className="text-[12px] text-muted-foreground">They can also just sign up with {lot.owner_email}; Loty links that email to the lot automatically.</p>}
          </div>}
    </DialogContent>
  </Dialog>;
}
