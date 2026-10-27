import { Link } from "@tanstack/react-router";
import { Baby } from "lucide-react";
import { Button } from "@/components/ui/button";

export function KidsBlocked() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div className="max-w-sm space-y-4">
        <Baby className="mx-auto h-12 w-12 text-primary" />
        <h1 className="font-display text-2xl font-extrabold">Obra indisponível neste perfil</h1>
        <p className="text-muted-foreground">Este perfil infantil só mostra obras com a classificação permitida.</p>
        <div className="flex justify-center gap-2">
          <Button asChild><Link to="/">Voltar ao início</Link></Button>
          <Button asChild variant="outline"><Link to="/perfis">Trocar perfil</Link></Button>
        </div>
      </div>
    </div>
  );
}
