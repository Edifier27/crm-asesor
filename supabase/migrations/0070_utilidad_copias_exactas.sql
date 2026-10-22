-- 0070: versiones de utilidad con el MISMO texto que las originales (Dario, 22-oct-2026: "me gustaban los mensajes que
-- hice, que sean exactamente los mismos"). Reemplaza a los borradores reescritos de la 0068.
-- Solo las que no hablan de promociones ni descuentos: esas Meta las puede aprobar como utilidad (ya aprobo asi
-- recontacto_48hs_07xdvp, que es palabra por palabra cotizado_48hs). Las que mencionan promos quedan en marketing.
-- Cada copia lleva el nombre de la original + "_u" (Meta no deja cambiarle la categoria a una plantilla existente).
-- No borra nada y se puede correr mas de una vez. Requiere la 0068. Va todo en un solo bloque (el SQL Editor de
-- Supabase puede usar otra conexion para cada sentencia, y una tabla temporal no llegaba a la siguiente).

do $$
declare
  -- Dario: de nuevo_saludo_ii_tfduqp a link_pago · Gaby: de nuevo_saludos_od2eqr en adelante
  copias text[] := array[
    'nuevo_saludo_ii_tfduqp', 'nuevo_saludo_gcz4l3', 'apertura_sgc_botones', 'bienvenida',
    'seguimiento_cotizacion_web_9theot', 'apertura_cotizacion_web_v3_jruak3', 'nunca_1', 'nunca_1_datos',
    'nunca_3', 'nunca_4', 'nunca_4_cierre', 'cotizado_w3qkj3',
    'pudiste_ver_el_plan_1x4nfu', 'cotizado_que_te_parecio', 'seguimiento_duda', 'reactivacion',
    'seguimiento_pareja', 'lo_estan_pensando', 'seguimiento_mas_adelante', 'seguimiento_cierre',
    'retomar_fecha_acordada', 'link_pago', 'nuevo_saludos_od2eqr', 'nuevo_saludo_gaby',
    'apertura_cotizacion_web_v2_143ncn', 'seguimiento_cotizacion_web_jvl8w5', 'cotizado_48hs_aprobado_ww9xwq', 'cotizado_2_xwtmy1',
    'cotizado_2_solo_nombre_lziird', 'cotizado_fr8r44', 'seguimiento_pareja_gaby', 'retomar_fecha_acordada_gaby',
    'envio_email_link_de_pago_cdgqn6', 'te_envio_link_de_pago_jgrl7u', 'reclamo_fecha_de_pago_1uy4rj', 'reclamo_documentacion_kcicxm',
    'recl_doc_2_y3kp6l', 'recl_doc_si_seguis_interesado_hnre4q', 'legajo_pendiente_ultimo_reclamo_mcnu0f', 'reclamo_link_cv3h3x',
    'reclamo_link_2_8owtp9', 'cambio_de_opcion_646mm4'
  ];
begin
  -- 1) La copia: mismo texto, mismos botones, misma cuenta; categoria utilidad e inactiva hasta que Meta la apruebe
  insert into public.plantillas (nombre, idioma, categoria, cuerpo, uso, botones, activa, nota, conexion)
  select b.nombre || '_u', b.idioma, 'utility', b.cuerpo, 'Utilidad (mismo texto que ' || b.nombre || ')', b.botones, false,
         'Copia exacta como utilidad: tocá "Enviar a Meta".', b.conexion
    from public.plantillas b where b.nombre = any(copias)
  on conflict (nombre) do nothing;

  -- 2) Cada original sale con SU copia (cotizado_48hs_zginbh sigue con recontacto_48hs_07xdvp, que ya es su copia exacta)
  update public.plantillas set version_utilidad = nombre || '_u' where nombre = any(copias);

  -- 3) Las reescrituras de la 0068 no salen mas: las originales que hablan de promos vuelven a ser solo marketing
  update public.plantillas set version_utilidad = null
   where version_utilidad like '%\_util%' escape '\' and not (nombre = any(copias));
  update public.plantillas set nota = 'Reemplazada por las copias exactas (_u): no hace falta mandarla.'
   where nombre like '%\_util%' escape '\' and categoria = 'utility' and meta_id is null;
end $$;

notify pgrst, 'reload schema';

-- Control: cada original con su copia y si ya esta aprobada
select b.conexion, b.nombre, b.version_utilidad, u.activa as aprobada
  from public.plantillas b left join public.plantillas u on u.nombre = b.version_utilidad
 where b.version_utilidad is not null
 order by b.conexion nulls first, b.nombre;
