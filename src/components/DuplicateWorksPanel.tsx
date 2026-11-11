import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ConfirmDelete } from '@/components/ConfirmDelete';
import { findDuplicateWorks } from '@/lib/work-duplicates';
import { coverUrl } from '@/lib/media';
import { workSaveError } from '@/lib/work-save-error';

export function DuplicateWorksPanel() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const scan = useQuery({
    queryKey: ['admin-duplicate-works'], enabled: open,
    queryFn: async () => {
      const fetchPage = async (offset: number) => {
        const { data, error } = await supabase.from('series')
          .select('id, title, alt_titles, kind, cover_url, published, created_at, chapter_count_total')
          .eq('published', true).order('id').range(offset, offset + 499);
        if (error) throw error;
        return data;
      };
      const works = await fetchPage(0);
      for (let offset = 500; works.length === offset; offset += 500) {
        const next = await fetchPage(offset); works.push(...next);
      }
      return works;
    },
  });
  const groups = useMemo(() => findDuplicateWorks(scan.data ?? []), [scan.data]);
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('series').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('A obra não existe mais ou você não tem permissão para apagá-la.');
    },
    onSuccess: async () => {
      toast.success('Obra apagada.');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-duplicate-works'] }),
        qc.invalidateQueries({ queryKey: ['admin-series'] }),
        qc.invalidateQueries({ queryKey: ['admin-novels'] }),
        qc.invalidateQueries({ queryKey: ['series'] }),
      ]);
    },
    onError: error => toast.error(workSaveError(error, 'Não foi possível apagar a obra.')),
  });
  return <section className="mb-6 border-b border-border pb-5">
    <div className="flex flex-wrap items-center gap-3">
      <Button variant={open ? 'secondary' : 'outline'} onClick={() => setOpen(value => !value)} aria-expanded={open}>
        <Copy className="mr-2 h-4 w-4" /> Obras duplicadas
      </Button>
      {open ? <Button variant="ghost" size="icon" title="Buscar novamente" aria-label="Buscar novamente" disabled={scan.isFetching || remove.isPending} onClick={() => void scan.refetch()}>
        <RefreshCw className={`h-4 w-4 ${scan.isFetching ? 'animate-spin' : ''}`} />
      </Button> : null}
    </div>
    {open ? <div className="mt-5 space-y-5">
      <h2 className="font-heading text-lg font-bold">Obras publicadas repetidas</h2>
      {scan.isPending ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando obras…</p>
        : scan.isError ? <p role="alert" className="text-sm text-destructive">Não foi possível buscar as obras. Tente novamente.</p>
        : <>
          <p role="status" className="text-sm text-muted-foreground">{groups.length} grupos · {groups.reduce((total, group) => total + group.works.length, 0)} obras repetidas · {scan.data?.length ?? 0} publicadas verificadas</p>
          {groups.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma obra publicada duplicada encontrada.</p> : null}
          {groups.map(group => <div key={group.works.map(work => work.id).sort().join(':')} className="border-t border-border pt-4">
            <p className="mb-3 break-words text-sm font-semibold text-primary">Títulos em comum: {group.matches.join(' · ')}</p>
            <div className="divide-y divide-border">
              {group.works.map(work => <div key={work.id} className="flex items-start gap-3 py-3">
                <img src={coverUrl(work.cover_url)} alt={work.title} className="h-20 w-14 shrink-0 rounded-md object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-bold">{work.title}</p>
                  {work.alt_titles ? <p className="mt-1 break-words text-xs text-muted-foreground">Alternativos: {work.alt_titles}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">{work.kind} · {work.chapter_count_total ?? 0} capítulos · Publicada em {new Date(work.created_at).toLocaleDateString('pt-BR')}</p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">ID: {work.id}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                  <Button asChild variant="ghost" size="icon" title="Editar obra"><Link to="/admin/$id" params={{ id: work.id }} aria-label={`Editar ${work.title}`}><Pencil className="h-4 w-4" /></Link></Button>
                  <ConfirmDelete title={`Apagar "${work.title}"?`} description={`Esta cópia (ID: ${work.id}) e seus ${work.chapter_count_total ?? 0} capítulos serão apagados permanentemente. Favoritos, comentários e históricos vinculados também podem ser removidos. As outras obras do grupo serão mantidas.`} onConfirm={() => remove.mutate(work.id)}>
                    <Button variant="ghost" size="icon" title="Apagar esta cópia" aria-label={`Apagar cópia ${work.id}`} disabled={remove.isPending || scan.isFetching}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </ConfirmDelete>
                </div>
              </div>)}
            </div>
          </div>)}
        </>}
    </div> : null}
  </section>;
}
