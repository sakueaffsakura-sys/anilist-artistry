import { SubscriptionSeal } from "@/components/SubscriptionSeal";

export type Badge = { id: string; name: string; image_url: string };

/**
 * Fileira de selos ao lado do nome do usuário: selo de assinatura,
 * selos extras (emblemas) e o selo de cargo ADMIN.
 */
export function UserBadges({
  tier,
  badges,
  isAdmin,
  size = 24,
  variant = "tile",
}: {
  tier?: string | null | undefined;
  badges?: Badge[] | undefined;
  isAdmin?: boolean | undefined;
  size?: number;
  /** "tile": selos em quadradinhos (caixa de selos). "inline": só os ícones, colados ao nome. */
  variant?: "tile" | "inline";
}) {
  const extra = badges ?? [];
  const inline = variant === "inline";
  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5 align-middle">
      <SubscriptionSeal tier={tier} size={size} />
      {extra.map((badge) =>
        inline ? (
          <img
            key={badge.id}
            src={badge.image_url}
            alt={badge.name}
            title={badge.name}
            style={{ width: size, height: size }}
            className="block shrink-0 object-contain drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
            loading="lazy"
          />
        ) : (
          <span
            key={badge.id}
            title={badge.name}
            className="grid shrink-0 place-items-center rounded-lg border border-border bg-surface-2/70 p-1.5 shadow-[var(--shadow-card)] transition-transform motion-safe:hover:-translate-y-0.5"
          >
            <img
              src={badge.image_url}
              alt={badge.name}
              style={{ width: size, height: size }}
              className="block object-contain"
              loading="lazy"
            />
          </span>
        ),
      )}
      {isAdmin ? (
        <span
          title="Administrador"
          className={
            inline
              ? "inline-flex h-5 shrink-0 cursor-help items-center rounded-md border border-primary/40 bg-primary/15 px-1.5 text-[11px] font-bold leading-none text-primary"
              : "inline-flex h-8 shrink-0 cursor-help items-center rounded-md border border-primary/40 bg-primary/15 px-2.5 text-xs font-bold leading-none text-primary shadow-[var(--shadow-card)]"
          }
        >
          Admin
        </span>
      ) : null}
    </span>
  );
}
