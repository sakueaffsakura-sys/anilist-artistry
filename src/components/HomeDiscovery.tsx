import { ArrowRight, Flame, TrendingUp, Trophy } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { HOME_SECTIONS, type HomeSectionKey, type ShelfWork } from "@/lib/home-sections";
import { HScroll, SectionRow, shelfItem } from "@/components/SectionRow";
import { SeriesCard } from "@/components/SeriesCard";

export interface HomeDiscoveryProps {
  sections: Record<HomeSectionKey, ShelfWork[]>;
  favoriteIds: Set<string>;
}

const ICONS = { popular: Trophy, trending: Flame, manhwa: TrendingUp };

export function HomeDiscovery({ sections, favoriteIds }: HomeDiscoveryProps) {
  return <>{HOME_SECTIONS.map(({ key, title }) => {
    const Icon = ICONS[key];
    return (
      <SectionRow key={key} title={title} icon={<Icon />}
        action={<Link to="/catalogo" search={key === "manhwa" ? { kind: "Manhwa", sort: "popular" } : { sort: "popular" }} className="see-all">Ver todas <ArrowRight className="h-3.5 w-3.5" /></Link>}>
        {sections[key].length ? <HScroll>{sections[key].map((item) => <div key={item.id} className={shelfItem}>
          <SeriesCard slug={item.slug} title={item.title} cover={item.cover_url} rating={item.rating} kind={item.kind}
            seriesId={item.id} favorite={favoriteIds.has(item.id)} ageRating={item.age_rating} />
        </div>)}</HScroll> : <p className="py-6 text-sm text-muted-foreground">Nenhuma obra disponível nesta seção.</p>}
      </SectionRow>
    );
  })}</>;
}
