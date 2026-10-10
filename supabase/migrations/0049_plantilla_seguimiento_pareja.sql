-- 0049: plantilla para retomar a quien lo iba a hablar con la pareja (pedido de Dario, 10-oct-2026)
-- y etiqueta "IA completa" para probar a la IA en algunos chats.
-- Una por cuenta de WhatsApp (Dario y Gaby). Quedan en borrador: se mandan a aprobar desde Asesor IA -> Plantillas
-- ("Enviar a Meta"). Sin tildes ni signos de apertura, como escriben los asesores. Se puede correr mas de una vez.

insert into public.plantillas (nombre, idioma, categoria, cuerpo, uso, botones, activa, nota, conexion) values
('seguimiento_pareja', 'es_AR', 'marketing',
 $$Hola {{1}}, como andas? Pudiste hablarlo con tu pareja el tema del plan? Si les quedo alguna duda la vemos juntos$$,
 'Seguimiento: lo iba a hablar con la pareja', array['Si, lo hablamos', 'Todavia no', 'Tengo dudas'], false,
 'Borrador: revisala y toca "Enviar a Meta".', null),
('seguimiento_pareja_gaby', 'es_AR', 'marketing',
 $$Hola {{1}}, como andas? Pudiste hablarlo con tu pareja el tema del plan? Si les quedo alguna duda la vemos juntos$$,
 'Seguimiento: lo iba a hablar con la pareja', array['Si, lo hablamos', 'Todavia no', 'Tengo dudas'], false,
 'Borrador: toca Enviar a Meta para que la aprueben en la cuenta de Gaby.', 'GABY')
on conflict (nombre) do nothing;

-- Etiqueta "IA completa" en las dos cuentas: el chat que la tenga lo atiende la IA de punta a punta
-- (como en automatico) aunque la cuenta este en copiloto. Para probar a la IA con algunos contactos.
insert into public.etiquetas (nombre, color, cuenta)
select 'IA completa', '#6D28D9', n.cuenta from (select distinct cuenta from public.numeros_whatsapp) n
on conflict do nothing;

-- Control
select nombre, coalesce(conexion, 'DARIO') as cuenta, activa, cuerpo from public.plantillas where nombre like 'seguimiento_pareja%';
