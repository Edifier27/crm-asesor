-- CRM Asesor - Plantillas con imagen arriba del texto (encabezado de imagen de WhatsApp).
-- La imagen se sube desde Asesor IA > Plantillas > Editar; se manda a Meta como ejemplo y en cada envio.
alter table public.plantillas add column if not exists imagen_path text; -- bucket "plantillas"

insert into storage.buckets (id, name, public, file_size_limit) values ('plantillas', 'plantillas', false, 5242880)
on conflict (id) do nothing;
create policy "equipo lee imagenes de plantillas" on storage.objects for select to authenticated
  using (bucket_id = 'plantillas' and public.es_miembro());
create policy "equipo sube imagenes de plantillas" on storage.objects for insert to authenticated
  with check (bucket_id = 'plantillas' and public.es_miembro());
create policy "equipo borra imagenes de plantillas" on storage.objects for delete to authenticated
  using (bucket_id = 'plantillas' and public.es_miembro());

-- Version con imagen de las campanas del S1 y del S2 (mismo texto y botones que las de solo texto)
insert into public.plantillas (nombre, idioma, categoria, cuerpo, uso, botones, activa, nota) values
('base_hablamos_s1_img', 'es_AR', 'marketing',
 $$Hola {{1}}, como estas? Soy Dario, asesor de Swiss Medical. Hace un tiempo hablamos por tu cobertura medica y queria contarte que lanzamos el plan S1 en promocion: la misma cartilla y estructura que el SMG02, con un copago fijo por consulta y una cuota mucho mas baja. Queres que te lo cotice?$$,
 'Campana a la base (AMBA), con imagen: los que hablaron conmigo - S1 en promo', array['Si, cotizame', 'No, gracias'], false, 'Falta la imagen: toca Editar y subila antes de enviarla a Meta.'),
('base_web_s1_img', 'es_AR', 'marketing',
 $$Hola {{1}}, como estas? Soy Dario, asesor de Swiss Medical. Hace un tiempo cotizaste un plan en nuestra web y queria contarte que lanzamos el plan S1 en promocion, con una cuota mucho mas accesible. Te lo cotizo sin compromiso?$$,
 'Campana a la base (AMBA), con imagen: cotizaron en la web y nunca hablamos - S1 en promo', array['Si, cotizame', 'No, gracias'], false, 'Falta la imagen: toca Editar y subila antes de enviarla a Meta.'),
('base_interior_s2_img', 'es_AR', 'marketing',
 $$Hola {{1}}, como estas? Soy Dario, asesor de Swiss Medical. Hace un tiempo hablamos por tu cobertura medica y queria contarte que tenemos el plan S2 en promocion: la misma cartilla y estructura que el SMG20, con un copago fijo por consulta y una cuota mucho mas baja. Queres que te lo cotice?$$,
 'Campana a la base (resto del pais), con imagen - S2 en promo', array['Si, cotizame', 'No, gracias'], false, 'Falta la imagen: toca Editar y subila antes de enviarla a Meta.')
on conflict (nombre) do nothing;

-- Comprobante de pago: la IA lo reconoce y, si el cliente esta en cobro, le da la bienvenida (ver lib/venta.js)
alter table public.documentos_cliente drop constraint if exists documentos_cliente_tipo_check;
alter table public.documentos_cliente add constraint documentos_cliente_tipo_check
  check (tipo in ('pendiente', 'dni_frente', 'dni_dorso', 'dni_completo', 'recibo', 'opcion_cambio', 'comprobante_pago', 'otro'));

-- Respuesta rapida /alta (la misma que manda sola la IA al recibir el comprobante)
insert into public.respuestas_rapidas (atajo, texto) values
  ('alta', $$Buenisimo {nombre}, recibi el comprobante! Te doy la bienvenida a Swiss Medical. En 24 hs ya vas a tener el alta: vas a poder ingresar a swissmedical.com.ar o a la app Swiss Medical Mobile (la del logo rojo) y generarte el usuario con tu DNI. Cualquier duda que tengas, me avisas.$$)
on conflict (atajo) do nothing;
