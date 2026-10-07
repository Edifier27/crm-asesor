-- 0038: saludo automatico en el CRM de Gaby.
-- Sus leads nuevos entraban sin mensaje: el CRM buscaba una plantilla "nuevo_saludo_gaby" que nunca se aprobo en Meta.
-- Ahora cada cuenta de WhatsApp elige sus plantillas (Asesor IA > Plantillas > "Que plantilla usar para cada cosa").
-- Esto deja elegidas las de Gaby, las dos ya aprobadas en Meta:
--   saludo general (SGC, Salesforce, carga manual)  -> nuevo_saludos_od2eqr
--   saludo de PrepagaYa (cotizo en la web)          -> apertura_cotizacion_web_v2_143ncn  (la que ella ya usa a mano)
-- Despues se pueden cambiar desde la pantalla. Se puede correr mas de una vez.

update public.asesor_config
   set plantillas_uso = jsonb_set(
         coalesce(plantillas_uso, '{}'::jsonb),
         '{porConexion}',
         coalesce(plantillas_uso->'porConexion', '{}'::jsonb)
           || jsonb_build_object(
                'GABY',
                coalesce(plantillas_uso->'porConexion'->'GABY', '{}'::jsonb)
                  || jsonb_build_object(
                       'bienvenida', 'nuevo_saludos_od2eqr',
                       'bienvenida_web', 'apertura_cotizacion_web_v2_143ncn')),
         true)
 where id = true;

-- Control: lo que quedo elegido para Gaby y que esas dos plantillas esten aprobadas y activas
select plantillas_uso->'porConexion'->'GABY' as elegido_gaby from public.asesor_config;
select nombre, estado_meta, activa from public.plantillas
 where conexion = 'GABY' and nombre in ('nuevo_saludos_od2eqr', 'apertura_cotizacion_web_v2_143ncn');
