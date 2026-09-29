import { FileText, Film, Link2, Music, Package, Shapes } from "lucide-react";
import type { AssetKind } from "@/lib/assets";

export const KIND_ICON: Record<AssetKind, typeof FileText> = {
  imagem: Shapes, video: Film, documento: FileText, template: Package, texto: FileText, audio: Music, link: Link2,
};
