-- CRM Asesor - Plantillas por cuenta de WhatsApp: las de Dario (conexion vacia) y las de cada conexion (ej. GABY).
-- Cada asesor solo puede mandar las de su cuenta; "Traer plantillas de Meta" trae las de todas las cuentas.
alter table public.plantillas add column if not exists conexion text;

-- Saludo inicial de Gaby: igual al de Dario, con su nombre (se manda a aprobar a SU cuenta de Meta)
insert into public.plantillas (nombre, idioma, categoria, cuerpo, uso, botones, activa, nota, conexion) values
('nuevo_saludo_gaby', 'es_AR', 'marketing',
 $$Hola {{1}} . Mi nombre es Gabriela, me contacto de Swiss Medical por tu consulta. Comentame, el plan es para vos o grupo familiar?$$,
 'Bienvenida automatica a un lead nuevo (Gaby)', '{}', false, 'Borrador: toca Enviar a Meta para que la aprueben en la cuenta de Gaby.', 'GABY')
on conflict (nombre) do nothing;
