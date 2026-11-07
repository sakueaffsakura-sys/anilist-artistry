import { useEffect, useRef, useState } from "react";
import { CircleDollarSign, Eye, EyeOff, ImagePlus, Send, Smile, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EMOJIS = [
  "😀", "😂", "🤣", "😍", "😎", "🥺", "😭", "😱",
  "🤔", "😴", "🤯", "👏", "🔥", "💯", "❤️", "💀",
  "👍", "👎", "🙏", "✨", "🎉", "⚔️", "🐉", "📖",
];

export interface CommentDraft {
  body: string;
  isSpoiler: boolean;
  image: File | null;
}

interface CommentComposerProps {
  pending: boolean;
  onSubmit: (draft: CommentDraft) => void;
  replyTo?: string | null;
  onCancelReply?: () => void;
}

export function CommentComposer({ pending, onSubmit, replyTo, onCancelReply }: CommentComposerProps) {
  const [body, setBody] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = (body.trim().length > 0 || image !== null) && !pending;

  const pickImage = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Envie apenas imagens.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5 MB).");
      return;
    }
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImage(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setBody((value) => (value + emoji).slice(0, 350));
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = (body.slice(0, start) + emoji + body.slice(end)).slice(0, 350);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = Math.min(start + emoji.length, next.length);
      el.setSelectionRange(pos, pos);
    });
  };

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ body: body.trim(), isSpoiler, image });
    setBody("");
    setIsSpoiler(false);
    clearImage();
    setShowEmojis(false);
    onCancelReply?.();
  };

  const startReply = (username: string) => {
    setBody(`@${username} `);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  };

  // Preenche o campo quando o usuário clica em "Responder" em um comentário.
  useEffect(() => {
    if (replyTo) startReply(replyTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyTo]);

  return (
    <div className="rounded-lg border-2 border-dashed border-border bg-surface/60 p-4 transition-colors focus-within:border-primary/40">
      {replyTo ? (
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          Respondendo a @{replyTo}
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancelar resposta"
            className="rounded-full p-0.5 hover:bg-primary/20"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(event) => setBody(event.target.value.slice(0, 350))}
        placeholder="Escreva seu comentário... (opcional se anexar imagem)"
        maxLength={350}
        rows={3}
        className="mb-3 min-h-20 w-full resize-none rounded-lg border border-border bg-background/40 p-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none"
      />

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => pickImage(event.target.files?.[0] ?? null)}
      />

      {preview ? (
        <div className="relative mb-3 inline-block">
          <img src={preview} alt="Anexo" className="max-h-40 rounded-lg border border-border" />
          <button
            type="button"
            onClick={clearImage}
            className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-destructive text-destructive-foreground shadow"
            title="Remover imagem"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="relative mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowEmojis((value) => !value)}
          aria-expanded={showEmojis}
          title="Figurinhas"
          className={cn(
            "rounded-lg border border-border bg-surface-2 p-2 text-amber-300/90 transition-colors hover:border-primary/40 hover:text-amber-200",
            showEmojis && "border-primary/50",
          )}
        >
          <Smile className="h-[18px] w-[18px]" />
        </button>

        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          title="Anexar imagem"
          className="rounded-lg border border-border bg-surface-2 p-2 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <ImagePlus className="h-[18px] w-[18px]" />
        </button>

        <button
          type="button"
          onClick={() => toast("Super chat em breve!")}
          title="Super chat"
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <CircleDollarSign className="h-4 w-4" /> Super chat
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={isSpoiler}
          onClick={() => setIsSpoiler((value) => !value)}
          title="Spoiler"
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2 text-muted-foreground transition-colors hover:text-foreground",
            isSpoiler && "border-primary/60 bg-primary/15 text-primary",
          )}
        >
          {isSpoiler ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span className="text-xs font-medium">{isSpoiler ? "Spoiler ativo" : "Spoiler"}</span>
        </button>

        {showEmojis ? (
          <div className="absolute left-0 top-full z-20 mt-2 grid w-64 grid-cols-8 gap-1 rounded-lg border border-border bg-popover p-2 shadow-xl">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="rounded-md p-1 text-lg transition-colors hover:bg-surface-2"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground/70">{body.length}/350</span>
        <Button onClick={submit} disabled={!canSubmit} className="font-semibold">
          <Send className="mr-2 h-4 w-4" /> Comentar
        </Button>
      </div>
    </div>
  );
}
