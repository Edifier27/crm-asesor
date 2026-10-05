-- CRM Asesor – Plantillas conectadas con Meta: traerlas, crearlas desde el CRM y ver su estado.
-- También: qué plantilla usar para cada cosa (bienvenida, secuencias, link de pago, campañas).
alter table public.plantillas
  add column meta_id text,               -- id de la plantilla en Meta
  add column componentes jsonb,          -- encabezado, cuerpo y botones tal como están en Meta
  add column estado_meta text,           -- APPROVED, PENDING, REJECTED, PAUSED… (null = todavía no se mandó a Meta)
  add column motivo_rechazo text,
  add column nota text,                  -- por qué el CRM no la puede mandar sola (ej.: encabezado con imagen)
  add column sincronizada_at timestamptz;

-- { bienvenida, link_pago, campana: nombre; nunca: [4 nombres]; contestaron: [4 nombres] }
alter table public.asesor_config add column plantillas_uso jsonb not null default '{}';

-- Meta rechaza plantillas que empiezan o terminan con una variable: se ajustan las propuestas
update public.plantillas set cuerpo = 'Hola {{1}}, este mes hay promociones en los planes de Swiss Medical. Querés que te arme una cotización sin compromiso?' where nombre = 'nunca_2';
update public.plantillas set cuerpo = 'Hola {{1}}, te dejo mi contacto por si más adelante necesitás una cobertura médica. Cualquier consulta escribime por acá' where nombre = 'nunca_4';
update public.plantillas set cuerpo = 'Hola {{1}}, ya está dada de alta tu cobertura de Swiss Medical. Para activarla te falta abonar la primera cuota en este link {{2}} y cualquier duda me avisás' where nombre = 'link_pago';
