-- 0058: notificaciones como WhatsApp en el celular y la PC (Web Push), Dario 16-oct-2026. Para los dos CRM.
-- Cada dispositivo donde alguien toca "Activar notificaciones" queda anotado aca. Cuando un cliente escribe,
-- el CRM le avisa a los dispositivos de la cuenta duenia del chat (aunque el CRM este cerrado).
-- Solo agrega: no rompe el CRM publicado. Se puede correr mas de una vez.

create table if not exists public.push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  cuenta uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dispositivo text,
  creado_at timestamptz not null default now(),
  ultimo_envio_at timestamptz
);

create index if not exists push_suscripciones_cuenta_idx on public.push_suscripciones (cuenta);

alter table public.push_suscripciones enable row level security;

drop policy if exists "cada uno sus dispositivos" on public.push_suscripciones;
create policy "cada uno sus dispositivos" on public.push_suscripciones
  for all to authenticated
  using (cuenta = auth.uid())
  with check (cuenta = auth.uid());

-- Control
select count(*) as dispositivos from public.push_suscripciones;
