-- 0043: la configuracion vieja del Asesor IA (asesor_config, una sola fila para todos) ya no se usa: desde la 0042
-- cada cuenta tiene la suya en config_asesor. Se le cierra el acceso para que nadie pueda leer por ahi lo que era
-- comun (la tabla queda guardada como respaldo; solo la ve el servidor). No cambia ningun dato.
-- Correr recien cuando el codigo nuevo ya esta publicado y funcionando.
drop policy if exists "equipo lee asesor_config" on public.asesor_config;
drop policy if exists "admin cambia asesor_config" on public.asesor_config;
drop policy if exists "equipo gestiona asesor_config" on public.asesor_config;

-- Control: no tiene que quedar ninguna regla sobre la tabla vieja
select count(*) as reglas_que_quedan from pg_policies where schemaname = 'public' and tablename = 'asesor_config';
