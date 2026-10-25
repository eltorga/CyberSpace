-- ELTORGA FORO v0.2.6 — ejecutar en SQL Editor DESPUES de puntos v0.2.5.
-- Re-ejecutable: NO borra comentarios ni puntos. Comentarios solo texto Markdown.
-- La autenticación de invitados y GitHub se configura desde Authentication del Dashboard.

create table if not exists public.eltorga_comment_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
create table if not exists public.eltorga_comments (
  id uuid primary key default gen_random_uuid(),
  post_id text not null check (char_length(post_id) between 1 and 180),
  parent_id uuid references public.eltorga_comments(id) on delete set null,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 2 and 45),
  avatar_url text not null default '',
  is_github boolean not null default false,
  body text not null check (char_length(body) between 2 and 4000),
  status text not null default 'published' check (status in ('published','hidden','deleted')),
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists eltorga_comments_post_status_idx on public.eltorga_comments(post_id,status,created_at);
create index if not exists eltorga_comments_author_time_idx on public.eltorga_comments(author_id,created_at desc);
create index if not exists eltorga_comments_parent_idx on public.eltorga_comments(parent_id);
alter table public.eltorga_comments enable row level security;
alter table public.eltorga_comment_admins enable row level security;
revoke all on public.eltorga_comments from public,anon,authenticated;
revoke all on public.eltorga_comment_admins from public,anon,authenticated;
-- Acceso SOLO mediante RPC; nunca acceso directo de clientes a las tablas.

create or replace function public.eltorga_comments_list(p_post_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'post_id',c.post_id,'parent_id',c.parent_id,'name',c.author_name,
    'avatar',c.avatar_url,'github',c.is_github,'body',c.body,
    'created_at',c.created_at,'updated_at',c.updated_at,'featured',c.featured,
    'mine',coalesce(c.author_id=auth.uid(),false)
  ) order by c.created_at asc),'[]'::jsonb)
  from public.eltorga_comments c
  where c.post_id=p_post_id and c.status='published'
    and p_post_id is not null and char_length(p_post_id) between 1 and 180;
$$;

create or replace function public.eltorga_comments_create(
  p_post_id text, p_body text, p_nickname text default null, p_parent_id uuid default null
) returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_anon boolean; v_github boolean; v_name text; v_avatar text;
  v_id uuid; v_meta jsonb; v_provider text;
begin
  if v_user is null then raise exception 'Inicia una sesión de invitado o de GitHub' using errcode='28000';end if;
  if p_post_id is null or char_length(p_post_id) not between 1 and 180 then raise exception 'Post inválido' using errcode='22023'; end if;
  if p_body is null or char_length(trim(p_body)) not between 2 and 4000 then raise exception 'El comentario debe tener entre 2 y 4000 caracteres' using errcode='22023'; end if;
  if (select count(*) from public.eltorga_comments where author_id=v_user and created_at>now()-interval '30 seconds')>0 then
    raise exception 'Espera 30 segundos para volver a comentar' using errcode='P0001';
  end if;
  v_anon := coalesce((auth.jwt()->>'is_anonymous')::boolean,true);
  if (select count(*) from public.eltorga_comments where author_id=v_user and created_at>now()-interval '1 day') >= (case when v_anon then 20 else 100 end) then
    raise exception 'Has alcanzado el límite diario de comentarios' using errcode='P0001';
  end if;
  select raw_user_meta_data,raw_app_meta_data->>'provider'
  into v_meta,v_provider from auth.users where id=v_user;
  v_github := not v_anon and v_provider='github';
  if v_github then
    v_name := coalesce(nullif(left(trim(v_meta->>'user_name'),45),''),nullif(left(trim(v_meta->>'preferred_username'),45),''),'Usuario GitHub');
    v_avatar := coalesce(v_meta->>'avatar_url','');
    if v_avatar !~ '^https://avatars[.]githubusercontent[.]com/' then v_avatar:=''; end if;
  else
    v_name := trim(coalesce(p_nickname,''));
    if char_length(v_name) not between 2 and 45 then raise exception 'Introduce un apodo de 2 a 45 caracteres' using errcode='22023'; end if;
    v_avatar:='';
  end if;
  if p_parent_id is not null and not exists(
    select 1 from public.eltorga_comments where id=p_parent_id and post_id=p_post_id and status='published'
  ) then raise exception 'Respuesta original no disponible' using errcode='22023'; end if;
  insert into public.eltorga_comments(post_id,parent_id,author_id,author_name,avatar_url,is_github,body)
  values(p_post_id,p_parent_id,v_user,v_name,v_avatar,v_github,trim(p_body)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.eltorga_comments_edit(p_id uuid,p_body text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare v_anon boolean := coalesce((auth.jwt()->>'is_anonymous')::boolean,true);
begin
  if auth.uid() is null or v_anon then raise exception 'Solo cuentas conectadas pueden editar comentarios' using errcode='28000'; end if;
  if p_body is null or char_length(trim(p_body)) not between 2 and 4000 then raise exception 'Longitud inválida' using errcode='22023'; end if;
  update public.eltorga_comments set body=trim(p_body),updated_at=now()
    where id=p_id and author_id=auth.uid() and is_github=true and status='published';
  return found;
end;
$$;

create or replace function public.eltorga_comments_remove_own(p_id uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'No hay sesión' using errcode='28000';end if;
  update public.eltorga_comments set status='deleted',body='[Comentario eliminado]',updated_at=now(),featured=false
  where id=p_id and author_id=auth.uid() and status='published';
  return found;
end;
$$;

create or replace function public.eltorga_comments_is_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.eltorga_comment_admins a
    join auth.users u on u.id=a.user_id
    where a.user_id=auth.uid() and u.raw_app_meta_data->>'provider'='github'
      and coalesce((auth.jwt()->>'is_anonymous')::boolean,true)=false
  );
$$;

create or replace function public.eltorga_comments_admin_list(p_limit integer default 150)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not public.eltorga_comments_is_admin() then raise exception 'No autorizado' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb)
    into v_result from (
      select id,post_id,parent_id,author_name,avatar_url,is_github,body,status,featured,created_at,updated_at
      from public.eltorga_comments order by created_at desc limit least(greatest(coalesce(p_limit,150),1),300)
    ) q;
  return v_result;
end;
$$;

create or replace function public.eltorga_comments_moderate(p_id uuid,p_action text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
  if not public.eltorga_comments_is_admin() then raise exception 'No autorizado' using errcode='42501';end if;
  if p_action not in ('hide','publish','delete','feature','unfeature') then raise exception 'Acción inválida' using errcode='22023';end if;
  if p_action='hide' then update public.eltorga_comments set status='hidden',updated_at=now(),featured=false where id=p_id;
  elsif p_action='publish' then update public.eltorga_comments set status='published',updated_at=now() where id=p_id;
  elsif p_action='delete' then update public.eltorga_comments set status='deleted',body='[Comentario eliminado]',featured=false,updated_at=now() where id=p_id;
  elsif p_action='feature' then update public.eltorga_comments set featured=true where id=p_id and status='published';
  elsif p_action='unfeature' then update public.eltorga_comments set featured=false where id=p_id;
  end if;
  return found;
end;
$$;

-- Contadores combinados para listados (puntos + comentarios), una sola consulta por lote.
-- Requiere SUPABASE_PUNTOS.sql de v0.2.5 ya ejecutado.
create or replace function public.eltorga_forum_metrics(p_post_ids text[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if p_post_ids is null or array_length(p_post_ids,1)>200 then raise exception 'Solicita 200 posts o menos' using errcode='22023';end if;
  select coalesce(jsonb_agg(jsonb_build_object('post_id',s.id,'points',s.points,'comments',s.comments)),'[]'::jsonb)
  into v_result
  from (
    select p.id,
      (select coalesce(sum(v.points),0)::bigint from public.eltorga_post_votes v where v.post_id=p.id) as points,
      (select count(*)::bigint from public.eltorga_comments c where c.post_id=p.id and c.status='published') as comments
    from (select distinct unnest(p_post_ids) as id) p where char_length(p.id) between 1 and 180
  ) s;
  return v_result;
end;
$$;

revoke all on function public.eltorga_comments_list(text) from public,anon,authenticated;
revoke all on function public.eltorga_comments_create(text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.eltorga_comments_edit(uuid,text) from public,anon,authenticated;
revoke all on function public.eltorga_comments_remove_own(uuid) from public,anon,authenticated;
revoke all on function public.eltorga_comments_is_admin() from public,anon,authenticated;
revoke all on function public.eltorga_comments_admin_list(integer) from public,anon,authenticated;
revoke all on function public.eltorga_comments_moderate(uuid,text) from public,anon,authenticated;
revoke all on function public.eltorga_forum_metrics(text[]) from public,anon,authenticated;
grant execute on function public.eltorga_comments_list(text) to anon,authenticated;
grant execute on function public.eltorga_comments_create(text,text,text,uuid) to authenticated;
grant execute on function public.eltorga_comments_edit(uuid,text) to authenticated;
grant execute on function public.eltorga_comments_remove_own(uuid) to authenticated;
grant execute on function public.eltorga_comments_is_admin() to authenticated;
grant execute on function public.eltorga_comments_admin_list(integer) to authenticated;
grant execute on function public.eltorga_comments_moderate(uuid,text) to authenticated;
grant execute on function public.eltorga_forum_metrics(text[]) to anon,authenticated;

-- Después de iniciar sesión en GitHub en tu foro, autoriza TU cuenta de moderación.
-- CAMBIA el usuario de ejemplo por tu usuario REAL de GitHub y ejecuta la consulta por separado:
-- insert into public.eltorga_comment_admins(user_id)
-- select id from auth.users
-- where raw_app_meta_data->>'provider'='github'
--   and lower(raw_user_meta_data->>'user_name')=lower('TU_USUARIO_GITHUB')
-- on conflict (user_id) do nothing;
-- ¡No coloques claves service_role ni secretos OAuth en archivos públicos!
