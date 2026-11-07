import type React from "react";
import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { FramedAvatar } from "@/components/FramedAvatar";
import { CommentContent } from "@/components/CommentContent";
import { CommentReactions } from "@/components/CommentReactions";
import { UserBadges, type Badge } from "@/components/UserBadges";

export type CommentAuthor = {
  username: string;
  avatar_url: string | null;
  level?: number | null;
  avatar_frame?: string | null;
  subscription_tier?: string | null;
  is_admin?: boolean;
  badges?: Badge[];
};

export type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  is_spoiler?: boolean | null;
  image_url?: string | null;
  parent_id?: string | null;
  parent?: { id: string; username: string; excerpt?: string } | null;
  author: CommentAuthor | null;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${date} às ${time}`;
}

export function CommentItem({
  comment,
  userId,
  onReply,
  footerExtra,
}: {
  comment: CommentRow;
  userId?: string | undefined;
  onReply?: ((comment: CommentRow) => void) | undefined;
  footerExtra?: React.ReactNode;
}) {
  const author = comment.author;
  const username = author?.username ?? "leitor";
  const level = Math.max(1, Number(author?.level ?? 1));
  const usernames = [username, comment.parent?.username].filter((n): n is string => Boolean(n));

  return (
    <li className="relative -mx-3 -my-1 scroll-mt-32 rounded-lg p-3">
      <div className="relative z-[1] flex items-start gap-3">
        <Link
          to="/u/$username"
          params={{ username }}
          title="Ver perfil"
          className="w-11 shrink-0 overflow-visible rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <FramedAvatar
            src={author?.avatar_url ?? null}
            frame={author?.avatar_frame ?? null}
            size={44}
            className="transition-all hover:ring-2 hover:ring-primary/50 rounded-full"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <Link
              to="/u/$username"
              params={{ username }}
              title="Ver perfil"
              className="shrink-0 truncate text-sm font-semibold text-foreground transition-colors hover:text-primary"
            >
              {username}
            </Link>
            <span
              title={`Nível ${level}`}
              className="inline-flex h-[18px] shrink-0 items-center justify-center gap-1 rounded-full border border-amber-400/30 bg-gradient-to-r from-amber-500/80 to-orange-500/80 px-1.5 text-[10px] font-semibold tracking-wide text-amber-100 shadow-[0_0_10px_rgba(245,158,11,0.4)] backdrop-blur-sm"
            >
              <span className="h-1 w-1 shrink-0 rounded-full bg-amber-300" />
              <span className="leading-none tabular-nums">{level}</span>
            </span>
            <UserBadges
              tier={author?.subscription_tier}
              badges={author?.badges}
              isAdmin={author?.is_admin}
            />
            <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-white/35">
              {formatDate(comment.created_at)}
            </span>
          </div>
          {comment.parent ? (
            <div className="mb-1.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <MessageSquare className="h-3 w-3 shrink-0 text-primary/70" />
              <span className="shrink-0">respondendo a</span>
              <Link to="/u/$username" params={{ username: comment.parent.username }} className="shrink-0 font-semibold text-primary hover:underline">
                @{comment.parent.username}
              </Link>
              {comment.parent.excerpt ? (
                <>
                  <span className="shrink-0 opacity-50">—</span>
                  <span className="truncate italic opacity-70">{comment.parent.excerpt}{comment.parent.excerpt.length >= 60 ? "…" : ""}</span>
                </>
              ) : null}
            </div>
          ) : null}
          <CommentContent
            body={comment.body}
            isSpoiler={comment.is_spoiler ?? null}
            imageUrl={comment.image_url ?? null}
            usernames={usernames}
          />
          <div className="relative z-10 mt-2 flex flex-wrap items-center gap-4 pt-1">
            <CommentReactions commentId={comment.id} userId={userId} />
            {onReply ? (
              <button
                type="button"
                onClick={() => onReply(comment)}
                className="flex items-center gap-1.5 whitespace-nowrap text-xs text-white/40 transition-colors hover:text-foreground"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Responder</span>
              </button>
            ) : null}
            {footerExtra}
          </div>
        </div>
      </div>
    </li>
  );
}
