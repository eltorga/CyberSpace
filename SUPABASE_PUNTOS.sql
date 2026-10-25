-- ELTORGA FORO v0.2.5 — Ejecutar en Supabase > SQL Editor.
-- Se puede volver a ejecutar para actualizar la función si se usó la versión de cinco botones.
-- Votos anónimos: un voto por identidad Supabase y publicación.
-- Los visitantes SOLO invocan funciones RPC; no tienen acceso directo a la tabla.

create table if not exists public.eltorga_post_votes (
  post_id text not null check (char_length(post_id) between 1 and 180),
  voter_id uuid not null references auth.users(id) on delete cascade,
  points smallint not null check (points between 1 and 10),
  created_at timestamptz not null default now(),
  constraint eltorga_post_votes_pk primary key (post_id, voter_id)
);

create index if not exists eltorga_post_votes_post_id_idx
  on public.eltorga_post_votes (post_id);

alter table public.eltorga_post_votes enable row level security;
revoke all on table public.eltorga_post_votes from public, anon, authenticated;
-- No crear políticas RLS públicas para esta tabla; las funciones controlan el acceso.

-- Datos agregados públicos, sin exponer la identidad de los votantes.
create or replace function public.eltorga_points_get(p_post_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total bigint;
  v_count bigint;
  v_my_points smallint;
begin
  if p_post_id is null or char_length(p_post_id) not between 1 and 180 then
    raise exception 'Identificador de publicación inválido';
  end if;

  select coalesce(sum(v.points),0)::bigint, count(*)::bigint
    into v_total, v_count
  from public.eltorga_post_votes v
  where v.post_id = p_post_id;

  select v.points into v_my_points
  from public.eltorga_post_votes v
  where v.post_id = p_post_id and v.voter_id = auth.uid();

  return jsonb_build_object('total',v_total,'voters',v_count,'my_points',v_my_points);
end;
$$;

-- Registro atómico: el identificador del votante SIEMPRE viene del JWT,
-- nunca de datos enviados por el navegador. No se permiten actualizar votos.
create or replace function public.eltorga_points_vote(p_post_id text, p_points integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_voter uuid;
  v_inserted integer;
begin
  v_voter := auth.uid();
  if v_voter is null then
    raise exception 'Debes tener una sesión de visitante' using errcode = '28000';
  end if;
  if p_post_id is null or char_length(p_post_id) not between 1 and 180 then
    raise exception 'Identificador de publicación inválido' using errcode = '22023';
  end if;
  if p_points is null or p_points not between 1 and 10 then
    raise exception 'Cantidad de puntos inválida' using errcode = '22023';
  end if;

  insert into public.eltorga_post_votes(post_id,voter_id,points)
  values(p_post_id, v_voter, p_points)
  on conflict (post_id,voter_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    raise exception 'Ya diste puntos a esta publicación' using errcode = '23505';
  end if;

  return jsonb_build_object('ok', true, 'points',p_points);
end;
$$;

-- Limitar explícitamente la ejecución de cada función.
revoke all on function public.eltorga_points_get(text) from public, anon, authenticated;
revoke all on function public.eltorga_points_vote(text,integer) from public, anon, authenticated;
grant execute on function public.eltorga_points_get(text) to anon, authenticated;
grant execute on function public.eltorga_points_vote(text,integer) to authenticated;

-- Ranking público agregado para visualizar estadísticas en el panel local.
-- Solamente devuelve ID y cantidades. No expone datos personales.
create or replace function public.eltorga_points_ranking()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('post_id',x.post_id,'total',x.total,'voters',x.voters)
    order by x.total desc, x.voters desc, x.post_id
  ),'[]'::jsonb)
  from (
    select post_id, sum(points)::bigint as total, count(*)::bigint as voters
    from public.eltorga_post_votes
    group by post_id
    order by sum(points) desc, count(*) desc, post_id
    limit 100
  ) x;
$$;
revoke all on function public.eltorga_points_ranking() from public, anon, authenticated;
grant execute on function public.eltorga_points_ranking() to anon, authenticated;
