-- CRM Asesor - Ningun lead se pierde por el formato del telefono.
-- Si el telefono no se puede normalizar con seguridad, el contacto entra igual: sin telefono (no se le puede
-- escribir), con el dato tal como llego en telefono_original y la etiqueta "Telefono a revisar".
-- El asesor lo corrige desde la ficha.
alter table public.contactos add column if not exists telefono_original text;
-- Sin telefono hasta que se corrija (unique (cuenta, telefono) admite varios null)
alter table public.contactos alter column telefono drop not null;

-- La etiqueta, en cada cuenta (U&'...\00E9' = e con tilde, para dejar el archivo en ASCII)
insert into public.etiquetas (nombre, color, cuenta)
select U&'Tel\00E9fono a revisar', '#DC2626', p.id from public.perfiles p
on conflict do nothing;

-- Y en cada cuenta nueva, junto con "Referido"
create or replace function public.etiquetas_de_sistema()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.etiquetas (nombre, color, cuenta)
  select e.nombre, e.color, new.id from public.etiquetas e
   where e.cuenta = public.cuenta_principal() and e.nombre in ('Referido', U&'Tel\00E9fono a revisar')
  on conflict do nothing;
  return new;
end $$;
