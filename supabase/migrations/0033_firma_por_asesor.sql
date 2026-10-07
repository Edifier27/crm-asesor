-- CRM Asesor - "Como se presenta" es de cada asesor (Dario / Gaby), no de todo el equipo.
alter table public.perfiles add column if not exists firma text;
update public.perfiles p set firma = c.firma from public.asesor_config c
 where p.firma is null and p.rol = 'admin' and c.firma is not null;
update public.perfiles set firma = 'Gabriela, asesora de Swiss Medical'
 where firma is null and id in (select cuenta from public.numeros_whatsapp where conexion = 'GABY');
-- Cada uno puede cambiar su nombre, su color y su firma
grant update (nombre, tema, firma) on public.perfiles to authenticated;
