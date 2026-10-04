-- CRM Asesor – Modo copiloto (pedido de Darío para arrancar)
-- · La IA NO conversa: lee, ordena la ficha y le deja al asesor la tarea ("volver a contactar") con un consejo.
-- · Lo único que manda sola son plantillas aprobadas, en secuencias, a quien no responde.
-- · Cuando el cliente contesta, va a Mis chats y lo atiende el asesor.
-- · Más adelante se pasa a 'automatico' (la IA asesora) desde Asesor IA.

alter table public.asesor_config add column modo_ia text not null default 'copiloto'
  check (modo_ia in ('copiloto', 'automatico'));

-- Secuencia de plantillas en curso (una por intento) y consejo de la IA para el asesor
alter table public.conversaciones
  add column seguimiento_plantillas text[],
  add column consejo_ia text;

-- Secuencia "Nunca contestaron" (días 1, 3, 7 y 14). Crearlas y aprobarlas en Meta con este nombre y texto.
insert into public.plantillas (nombre, categoria, cuerpo, uso) values
  ('nunca_1', 'marketing', 'Hola {{1}}, te escribo de nuevo por tu consulta de Swiss Medical. Con tu edad y la provincia donde vivís ya te paso los valores', 'Nunca contestó · paso 1'),
  ('nunca_2', 'marketing', '{{1}}, este mes hay promociones en los planes de Swiss Medical. Querés que te arme una cotización sin compromiso?', 'Nunca contestó · paso 2'),
  ('nunca_3', 'marketing', 'Hola {{1}}, si ahora no es buen momento no hay problema. Preferís que te escriba más adelante?', 'Nunca contestó · paso 3'),
  ('nunca_4', 'marketing', '{{1}}, te dejo mi contacto por si más adelante necesitás una cobertura médica. Cualquier consulta escribime por acá', 'Nunca contestó · paso 4 (último)')
on conflict (nombre) do nothing;
