-- Color de la aplicación de cada persona (Darío verde, Gaby el que elija)
alter table public.perfiles add column if not exists tema text not null default 'verde';

-- Cada uno solo puede cambiar su nombre y su color: el rol y el acceso los toca solo el administrador (desde el servidor)
revoke update on public.perfiles from authenticated, anon;
grant update (nombre, tema) on public.perfiles to authenticated;
