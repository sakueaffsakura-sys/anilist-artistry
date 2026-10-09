export const MAINTENANCE_MEDIA_MAX_BYTES = 1024 ** 3;

const formats = [
  { extension: "mp4", mime: "video/mp4", kind: "video" },
  { extension: "jpg", mime: "image/jpeg", kind: "image" },
  { extension: "jpeg", mime: "image/jpeg", kind: "image" },
  { extension: "png", mime: "image/png", kind: "image" },
  { extension: "webp", mime: "image/webp", kind: "image" },
] as const;

export function validateMaintenanceMedia(file: Pick<File, "name" | "type" | "size">) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const format = formats.find((item) => item.extension === extension);
  // Some browsers supply no MIME type for MP4; infer only known extensions.
  if (!format || (file.type && file.type !== "application/octet-stream" && file.type !== format.mime)) {
    throw new Error("Escolha um vídeo MP4 ou uma imagem JPG, PNG ou WebP.");
  }
  if (file.size < 1) throw new Error("O arquivo está vazio.");
  if (file.size > MAINTENANCE_MEDIA_MAX_BYTES) throw new Error("O arquivo deve ter até 1 GB.");
  return { ...format, extension: format.extension === "jpeg" ? "jpg" : format.extension };
}