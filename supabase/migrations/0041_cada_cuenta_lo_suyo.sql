-- 0041: que una cuenta no pueda modificar lo de la otra (candado en la base, ademas del de la pantalla).
-- 1) Plantillas: cada asesor ve y cambia solo las de SU cuenta de WhatsApp; el administrador, todas.
--    Antes cualquier asesor podia editar, activar o desactivar las plantillas del otro.
-- 2) Configuracion de la IA (encendida/apagada, copiloto/automatico, indicaciones): es una sola para todo el
--    equipo. Todos la leen; solo el administrador la cambia. Antes cualquier asesor podia apagarle la IA al otro.
-- No cambia ningun dato. Se puede correr mas de una vez.

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin' and activo) $$;

-- La cuenta de WhatsApp de quien esta logueado (null = la principal o sin numero)
create or replace function public.mi_conexion()
returns text language sql stable security definer set search_path = ''
as $$ select conexion from public.numeros_whatsapp where cuenta = auth.uid() limit 1 $$;

-- 1) Plantillas
drop policy if exists "equipo gestiona plantillas" on public.plantillas;
drop policy if exists "cada uno sus plantillas" on public.plantillas;
create policy "cada uno sus plantillas" on public.plantillas for all to authenticated
  using (public.es_miembro() and (public.es_admin() or conexion is not distinct from public.mi_conexion()))
  with check (public.es_miembro() and (public.es_admin() or conexion is not distinct from public.mi_conexion()));

-- 2) Configuracion de la IA
drop policy if exists "equipo gestiona asesor_config" on public.asesor_config;
drop policy if exists "equipo lee asesor_config" on public.asesor_config;
drop policy if exists "admin cambia asesor_config" on public.asesor_config;
create policy "equipo lee asesor_config" on public.asesor_config for select to authenticated
  using (public.es_miembro());
create policy "admin cambia asesor_config" on public.asesor_config for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Control: las reglas que quedaron en las dos tablas
select tablename as tabla, policyname as regla, cmd as para
  from pg_policies
 where schemaname = 'public' and tablename in ('plantillas', 'asesor_config')
 order by tablename, policyname;
