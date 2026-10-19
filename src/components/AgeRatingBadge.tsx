import { OctagonAlert, OctagonX, Shield, ShieldAlert, ShieldCheck, ShieldPlus, type LucideIcon } from "lucide-react";
import { ageRatingLabel, ageRatingShort, isAgeRating, type AgeRating } from "@/lib/age-ratings";
import { cn } from "@/lib/utils";

const AGE_ICONS: Record<AgeRating, LucideIcon> = {
  L: ShieldCheck,
  "10": Shield,
  "12": ShieldPlus,
  "14": ShieldAlert,
  "16": OctagonAlert,
  "18": OctagonX,
};

const AGE_SOFT: Record<AgeRating, string> = {
  L: "border-age-l/45 bg-age-l/15 text-age-l",
  "10": "border-age-10/45 bg-age-10/15 text-age-10",
  "12": "border-age-12/45 bg-age-12/15 text-age-12",
  "14": "border-age-14/45 bg-age-14/15 text-age-14",
  "16": "border-age-16/45 bg-age-16/15 text-age-16",
  "18": "border-age-18/50 bg-age-18/15 text-age-18",
};

const AGE_SOLID: Record<AgeRating, string> = {
  L: "border-age-l bg-age-l text-age-ink",
  "10": "border-age-10 bg-age-10 text-age-ink",
  "12": "border-age-12 bg-age-12 text-age-ink",
  "14": "border-age-14 bg-age-14 text-age-ink",
  "16": "border-age-16 bg-age-16 text-foreground",
  "18": "border-age-18 bg-age-18 text-foreground",
};

const AGE_SIZES = {
  sm: "gap-1 rounded-md border px-1.5 py-0.5 text-[10px]",
  md: "gap-1.5 rounded-lg border px-2.5 py-1 text-[11px]",
} as const;

const AGE_ICON_SIZES = { sm: "h-3 w-3", md: "h-3.5 w-3.5" } as const;

type Props = {
  value: string | null | undefined;
  size?: keyof typeof AGE_SIZES;
  variant?: "soft" | "solid";
  className?: string;
};

export function AgeRatingBadge({ value, size = "md", variant = "soft", className }: Props) {
  if (!isAgeRating(value)) return null;
  const Icon = AGE_ICONS[value];
  return (
    <span
      title={ageRatingLabel(value)}
      className={cn(
        "inline-flex shrink-0 items-center font-bold uppercase leading-none tracking-wide",
        AGE_SIZES[size],
        variant === "solid" ? AGE_SOLID[value] : AGE_SOFT[value],
        className,
      )}
    >
      <Icon className={cn("shrink-0", AGE_ICON_SIZES[size])} aria-hidden="true" />
      {ageRatingShort(value)}
    </span>
  );
}
