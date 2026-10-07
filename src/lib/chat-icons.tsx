import {
  AlertTriangle, Bolt, Building2, CalendarDays, Car, Check, Coins, Droplets, HandHeart, Heart, HelpCircle, Home, KeyRound,
  Laugh, Leaf, Package, PartyPopper, Smile, Sparkles, Star, ThumbsUp, Trash2, Wrench, X, type LucideIcon,
} from "lucide-react";

// Loty's own chat icons, used instead of device emojis so the chat looks the same everywhere and
// matches the rest of the app. Messages store a short code like :thumbs-up:.

type Tone = "blue" | "red" | "amber" | "green";
export type ChatIcon = { code: string; label: string; Icon: LucideIcon; tone: Tone; group: "Reactions" | "Building" };

export const CHAT_ICONS: ChatIcon[] = [
  { code: "thumbs-up", label: "Thumbs up", Icon: ThumbsUp, tone: "blue", group: "Reactions" },
  { code: "heart", label: "Heart", Icon: Heart, tone: "red", group: "Reactions" },
  { code: "smile", label: "Smile", Icon: Smile, tone: "blue", group: "Reactions" },
  { code: "laugh", label: "Laugh", Icon: Laugh, tone: "blue", group: "Reactions" },
  { code: "party", label: "Celebrate", Icon: PartyPopper, tone: "amber", group: "Reactions" },
  { code: "thanks", label: "Thanks", Icon: HandHeart, tone: "blue", group: "Reactions" },
  { code: "star", label: "Star", Icon: Star, tone: "amber", group: "Reactions" },
  { code: "check", label: "Done", Icon: Check, tone: "green", group: "Reactions" },
  { code: "cross", label: "No", Icon: X, tone: "red", group: "Reactions" },
  { code: "question", label: "Question", Icon: HelpCircle, tone: "blue", group: "Reactions" },
  { code: "warning", label: "Heads up", Icon: AlertTriangle, tone: "amber", group: "Reactions" },
  { code: "sparkle", label: "Sparkle", Icon: Sparkles, tone: "amber", group: "Reactions" },
  { code: "home", label: "Home", Icon: Home, tone: "blue", group: "Building" },
  { code: "building", label: "Building", Icon: Building2, tone: "blue", group: "Building" },
  { code: "wrench", label: "Repair", Icon: Wrench, tone: "blue", group: "Building" },
  { code: "key", label: "Key", Icon: KeyRound, tone: "amber", group: "Building" },
  { code: "car", label: "Parking", Icon: Car, tone: "blue", group: "Building" },
  { code: "leaf", label: "Garden", Icon: Leaf, tone: "green", group: "Building" },
  { code: "bin", label: "Bins", Icon: Trash2, tone: "blue", group: "Building" },
  { code: "bolt", label: "Power", Icon: Bolt, tone: "amber", group: "Building" },
  { code: "water", label: "Water", Icon: Droplets, tone: "blue", group: "Building" },
  { code: "money", label: "Money", Icon: Coins, tone: "green", group: "Building" },
  { code: "calendar", label: "Date", Icon: CalendarDays, tone: "blue", group: "Building" },
  { code: "package", label: "Delivery", Icon: Package, tone: "amber", group: "Building" },
];
export const ICON_BY_CODE = new Map(CHAT_ICONS.map(i => [i.code, i]));
/** The six quick reactions. */
export const REACTIONS = ["thumbs-up", "heart", "laugh", "thanks", "check", "warning"];
export const ICON_PATTERN = /:([a-z-]{2,20}):/g;

const TONE: Record<Tone, string> = {
  blue: "bg-primary/10 text-primary",
  red: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

/** A Loty icon as a small rounded badge. */
export function LotyIcon({ code, size = "sm", title, onPrimary = false }: { code: string; size?: "sm" | "md" | "lg"; title?: string | undefined; /** On a blue bubble: white icon on a light badge. */ onPrimary?: boolean }) {
  const icon = ICON_BY_CODE.get(code);
  if (!icon) return <>{`:${code}:`}</>;
  const box = { sm: "size-[1.35em] [&_svg]:size-[0.85em]", md: "size-7 [&_svg]:size-4", lg: "size-10 [&_svg]:size-6" }[size];
  return <span role="img" aria-label={icon.label} title={title ?? icon.label} data-loty-icon={code}
    className={`inline-grid shrink-0 place-items-center rounded-full align-[-0.3em] ${box} ${onPrimary ? "bg-primary-foreground/20 text-primary-foreground" : TONE[icon.tone]}`}><icon.Icon strokeWidth={2.25}/></span>;
}
