import { Flame, TrendingUp, Trophy } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { HOME_SECTIONS, type HomeSectionKey, type ShelfWork } from "@/lib/home-sections";
import { HScroll, SectionRow } from "@/components/SectionRow";
import { SeriesCard } from "@/components/SeriesCard";
import { Button } from "@/components/ui/button";

export interface HomeDiscoveryProps {
  sections: Record<HomeSectionKey, ShelfWork[]>;
  favoriteIds: Set<string>;
}

const ICONS = { popular: Trophy, trending: Flame, manhwa: TrendingUp };

export function HomeDiscovery({ sections, favoriteIds }: HomeDiscoveryProps) {
  return <>{HOME_SECTIONS.map(({ key, title }) => {
    const Icon = ICONS[key];
    return <div key={key} className="cv-auto">
      <SectionRow title={title} icon={<Icon className="h-5 w-5" />}
        action={<Button asChild variant="ghost" size="sm" className="text-primary"><Link to="/catalogo" search={key === "manhwa" ? { kind: "Manhwa" } : {}}>Ver todas</Link></Button>}>
        {sections[key].length ? <HScroll>{sections[key].map((item) => <div key={item.id} className="w-[160px] shrink-0">
          <SeriesCard slug={item.slug} title={item.title} cover={item.cover_url} rating={item.rating}
            seriesId={item.id} favorite={favoriteIds.has(item.id)} ageRating={item.age_rating} />
        </div>)}</HScroll> : <p className="py-6 text-sm text-muted-foreground">Nenhuma obra disponível nesta seção.</p>}
      </SectionRow>
    </div>;
  })}</>;
}