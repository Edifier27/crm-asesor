-- CRM Asesor – soporte para la bandeja
-- La lista de chats se actualiza también cuando cambian contactos o sus etiquetas.
alter publication supabase_realtime add table public.contactos, public.contacto_etiquetas;

-- Etiquetas iniciales (color = texto; el fondo se deriva con transparencia)
insert into public.etiquetas (nombre, color) values
  ('Familia', '#1E3A8A'),
  ('Individual', '#0B5A4E'),
  ('Monotributista', '#4C2A9E'),
  ('Relación de dependencia', '#334155'),
  ('Interior', '#8C1D4D'),
  ('Seguimiento', '#3E4A47'),
  ('Caliente', '#8A3410'),
  ('Frío', '#475569')
on conflict (nombre) do nothing;
