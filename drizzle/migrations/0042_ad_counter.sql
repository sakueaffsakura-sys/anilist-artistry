-- Migration 0042: contagem de capítulos lidos para anúncios intersticiais (Unity Ads).
--
-- Backup: antes de aplicar, exportar public.profiles, auth.users e public.chapters (sem alterar dados).
--
-- Regra: 1 intersticial a cada 5 capítulos DISTINTOS lidos, antes do 6º, 11º, 16º...
-- VIP = papel admin OU profiles.subscription_tier <> 'none'. VIP nunca recebe show_ad = true.
-- O app só obedece ao servidor: ad_state(), ad_record_read(), ad_ack_ad().
-- Limitação conhecida: ad_ack_ad() confia no cliente (o app pode ser modificado para pular anúncios).

create table if not exists public.ad_reads (
  user_id    uuid not null references auth.users(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

create table if not exists public.ad_counter (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  last_ad_at_reads integer not null default 0 check (last_ad_at_reads >= 0)
);

alter table public.ad_reads   enable row level security;
alter table public.ad_counter enable row level security;

-- Leitura só da própria conta. Sem políticas de INSERT/UPDATE/DELETE: a escrita ocorre só pelas funções abaixo.
drop policy if exists "ad_reads own select" on public.ad_reads;
create policy "ad_reads own select" on public.ad_reads
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "ad_counter own select" on public.ad_counter;
create policy "ad_counter own select" on public.ad_counter
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.ad_reads   from anon, authenticated;
revoke all on public.ad_counter from anon, authenticated;
grant select on public.ad_reads   to authenticated;
grant select on public.ad_counter to authenticated;

create or replace function public.ad_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  v_vip boolean;
  v_reads integer;
  v_last integer;
  v_show boolean;
begin
  if uid is null then
    return jsonb_build_object('vip', false, 'reads', 0, 'show_ad', false);
  end if;

  v_vip := public.has_role(uid, 'admin'::public.app_role)
           or coalesce((select p.subscription_tier from public.profiles p where p.id = uid), 'none') <> 'none';

  select count(*)::integer into v_reads from public.ad_reads r where r.user_id = uid;
  select coalesce((select c.last_ad_at_reads from public.ad_counter c where c.user_id = uid), 0) into v_last;

  v_show := (not v_vip) and v_reads >= 5 and v_reads % 5 = 0 and v_last < v_reads;
  return jsonb_build_object('vip', v_vip, 'reads', v_reads, 'show_ad', v_show);
end;
$$;

create or replace function public.ad_record_read(_chapter uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return public.ad_state();
  end if;
  if not exists (select 1 from public.chapters c where c.id = _chapter) then
    raise exception 'Capítulo não encontrado';
  end if;
  insert into public.ad_reads (user_id, chapter_id)
  values (auth.uid(), _chapter)
  on conflict do nothing;
  return public.ad_state();
end;
$$;

create or replace function public.ad_ack_ad()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  v_reads integer;
begin
  if uid is null then
    return public.ad_state();
  end if;
  select count(*)::integer into v_reads from public.ad_reads r where r.user_id = uid;
  insert into public.ad_counter (user_id, last_ad_at_reads)
  values (uid, v_reads)
  on conflict (user_id) do update set last_ad_at_reads = excluded.last_ad_at_reads;
  return public.ad_state();
end;
$$;

-- Permissões: anon só consulta o estado (zeros, sem dados privados); registrar e confirmar exigem login.
revoke all on function public.ad_state()            from public;
revoke all on function public.ad_record_read(uuid)  from public;
revoke all on function public.ad_ack_ad()           from public;
grant execute on function public.ad_state()           to anon, authenticated;
grant execute on function public.ad_record_read(uuid) to authenticated;
grant execute on function public.ad_ack_ad()          to authenticated;

-- Rollback (NÃO executar automaticamente; use somente se precisar desfazer):
-- revoke execute on function public.ad_ack_ad() from authenticated;
-- revoke execute on function public.ad_record_read(uuid) from authenticated;
-- revoke execute on function public.ad_state() from anon, authenticated;
-- drop function if exists public.ad_ack_ad();
-- drop function if exists public.ad_record_read(uuid);
-- drop function if exists public.ad_state();
-- drop table if exists public.ad_counter;
-- drop table if exists public.ad_reads;
