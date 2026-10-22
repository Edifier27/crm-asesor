# CRM Asesor – contexto del proyecto

Herramienta propia de conversación + CRM con IA para un asesor de Swiss Medical (Argentina).
Reemplaza a Kommo. Los leads llegan de dos orígenes: asignados por Swiss Medical y de webs propias
(formularios). La IA asesora al lead por WhatsApp, elige audios pregrabados y le pasa el lead
al asesor cuando está listo para cotizar.

Nombre comercial: AsesorCRM. Dominio propio: asesorcrm.com.ar.
Idioma de la interfaz y del código de negocio: español rioplatense (voseo).

## Stack
- Next.js (App Router, JavaScript) desplegado en Vercel.
  - Proyecto Vercel: `crm-asesor`, equipo `forza-projects`, región de funciones `gru1` (San Pablo).
  - Dominio propio: `asesorcrm.com.ar` (desde 2026-10-07). `crm-asesor.vercel.app` sigue funcionando en paralelo.
  - `gaby.asesorcrm.com.ar` (desde 2026-10-08): la MISMA app en otra dirección, para tener la cuenta de Gaby y la de
    Darío abiertas a la vez en un mismo navegador (cada dirección guarda su propia sesión). No hay código que dependa
    de la dirección; para otra cuenta más alcanza con agregar otro subdominio al proyecto en Vercel (los DNS están ahí).
- Supabase (plan gratuito por ahora; Pro más adelante). El cotizador existente ya usa Supabase.
- WhatsApp Cloud API oficial de Meta (primero con el número de prueba de Meta; la línea real hoy
  está conectada a Kommo y se migra recién cuando el CRM funcione).
- Claude API (pago por uso, separado de la suscripción de Claude). Usar Haiku para lo simple y
  Sonnet para el asesoramiento.
- Transcripción de audios entrantes (a definir proveedor).

## Variables de entorno
Ver `.env.example`. `WHATSAPP_VERIFY_TOKEN` ya está cargada en Vercel (production y preview).
Nunca commitear secretos.

## Estado actual
- Repo: github.com/Edifier27/crm-asesor (privado). Push a `main` = deploy a producción en Vercel.
- Supabase: proyecto `crm-asesor` (sifjydpsjtujhkmmllgf, São Paulo), org Edifier27's Org (Free).
- `app/api/whatsapp/route.js`: webhook. GET verificación; POST valida `X-Hub-Signature-256`, guarda el
  evento crudo en `webhook_eventos` (si falla → 500 y Meta reintenta), responde 200 y procesa en `after()`
  con `lib/whatsapp/procesar.js` → RPC `registrar_mensaje_entrante` / `actualizar_estado_mensaje`
  (migración 0002; idempotentes por `wa_message_id`, el estado nunca retrocede).
- `lib/supabase/admin.js`: cliente service role (solo servidor). En local la Secret key va a mano en `.env.local`.
- `supabase/migrations/0001_esquema_inicial.sql`: esquema + RLS (solo perfiles activos ven datos).
  Se aplica a mano en el SQL Editor; las migraciones siguientes van numeradas en la misma carpeta.
- Auth: email + contraseña (Supabase Auth). `proxy.js` (Next 16 = ex middleware) refresca la sesión y
  manda a `/login`; excluye `/api/*`.
- Bandeja (`app/bandeja`): layout con riel + `ListaChats` (realtime, filtros, búsqueda); `[id]/` con
  `Conversacion` (realtime de mensajes, modo IA/humano, ventana 24 h) y `Ficha` (edición del contacto y etiquetas).
  Selects compartidos en `lib/consultas.js` (no exportar constantes desde archivos `use client`).
- Demo: `npm run demo -- cargar | limpiar | simular <tel> "texto"` (teléfonos 54900000000xx). Borrar antes de producción.
- Rutas del panel en `app/(panel)/` (riel compartido en el layout; en celular es barra inferior).
  `bandeja` = SOLO chats en modo humano/pausada ("Mis chats"); `embudo` = kanban de todos los leads por etapa
  (drag & drop, realtime, panel en vivo `EnVivo` con indicador `conversaciones.ia_pensando_desde`).
  `bandeja` (chats), `audios` (biblioteca, bucket privado `audios`), `asesor` (config IA, conocimiento, costos).
- Envío (`lib/whatsapp/enviar.js` + `meta.js`): texto, audio de biblioteca (link firmado) y plantillas (tabla
  `plantillas`, nombre/idioma = los aprobados en Meta). Sin WHATSAPP_TOKEN/PHONE_NUMBER_ID = MODO PRUEBA (no sale nada).
  Si escribe el asesor, la conversación pasa a modo humano.
- Leads (`lib/leads.js`): `POST /api/leads` (x-api-key = LEADS_API_KEY, u Origin en LEADS_ORIGENES; JSON o <form>,
  campo trampa `website`, `redirigir` para forms). Botón "+" en la bandeja para carga manual (Swiss Medical).
  Deduplica por teléfono normalizado (549…); bienvenida (plantilla `bienvenida`) solo a contactos nuevos.
- Asesor IA (`lib/ia/asesor.js`): se dispara desde el webhook por cada mensaje entrante en modo `ia`, espera
  IA_DEMORA_MS (8 s) y responde solo si sigue siendo el último mensaje. claude-sonnet-5-5, effort medium,
  `fallbacks: "default"`, system cacheado; herramientas enviar_mensaje/enviar_audio/actualizar_ficha/etiquetar/
  cambiar_etapa/pasar_a_humano. Registra tokens y costo en `ia_ejecuciones`. Sin ANTHROPIC_API_KEY no responde.
- Cotizador: `lib/cotizador.js` replica EXACTA la fórmula del index.html (verificado 44/44). Listas en `listas_precios`
  (una activa; página Precios importa el index.html sin ejecutarlo). Cotización en la ficha guarda `contactos.cotizacion`.
- Seguimiento (`lib/seguimiento.js` + cron `/api/cron/seguimientos` cada 10 min, CRON_SECRET): próximo paso por
  conversación (seguimiento_at/motivo/responsable ia|asesor). La IA lo fija con `gestionar_seguimiento` (y temperatura);
  si no, default 20 h. Vencido + ventana abierta → la IA escribe; cerrada → plantilla `reactivacion`; 3 intentos → al asesor.
  Responsable "asesor" ⇒ modo humano (Mis chats). HORARIO HÁBIL (`lib/horario.js`): lun-vie 8-20 AR; todo lo programado
  se corre al próximo horario hábil (sáb/dom → lunes misma hora). Las respuestas a mensajes entrantes NO se limitan.
- Leads web/PrepagaYa: `/api/leads` acepta provincia (confiable), zona_detectada (IP, aproximada → la IA la confirma),
  edades/personas en texto (`integrantesDesdeTexto`), situacion_laboral, prepaga_interes. Con grupo+zona entra "Relevado"
  y la cotización aparece armada en la ficha ("Cotización lista" en el embudo). El envío lo hace el asesor.
- Documentos: PDF de planes y cartillas en el bucket privado `documentos` (`lib/documentos.js` = reglas del index.html:
  tier por plan, región por provincia). `npm run documentos -- "<carpeta del cotizador>"` los sube/actualiza. En la ficha:
  "Ver detalle" en cada plan del carrusel (desglose por integrante con fila Total sin descuentos, `detalleCotizacion`) y "Plan y cartilla" (ver/enviar PDF por WhatsApp).
  Todo lo enviado queda en `contactos.cotizacion.enviadas` (historial en la ficha y "Enviado" en cada plan).
- CADA CUENTA ES UN CRM APARTE (migración 0042, 2026-10-08): además de contactos/chats/mensajes/etiquetas, son de cada
  asesor (columna `cuenta`, RLS `cuenta = auth.uid()`) los audios y `audios_pedidos`, la configuración del Asesor IA
  (`config_asesor`, una fila por cuenta: encendido, modo, indicaciones, `plantillas_uso`; se lee con `configDe(supabase,
  cuenta)` de `lib/config-cuenta.js`), `conocimiento`, `aprendizajes` (cada uno aprende de sus chats), `respuestas_rapidas`
  y `formularios`. Las plantillas van por cuenta de WhatsApp (`conexion`), también para el administrador. Archivos: cada
  uno lee los suyos (los que subió o los que usa algo propio). SIGUEN COMUNES por decisión de Darío: `listas_precios`,
  `campanias`, PDFs de planes (bucket `documentos`) y `etapas`. Con el cliente de servicio SIEMPRE filtrar por la cuenta
  del chat o del lead. La tabla vieja `asesor_config` (una sola fila) quedó sin uso.
- BANDEJA COMO WHATSAPP (migración 0044, 2026-10-08): orden por mensaje más nuevo. `conversaciones.espera_desde` (la
  mantiene el trigger `marcar_espera` sobre `mensajes`) marca a quién se le debe respuesta: fila azul, roja pasada 1 h
  (`tiempoDeEspera`); `ultimo_es_propio` pone "✓ Vos:". Flechita de cada chat: marcar como leído / no leído. En copiloto,
  al responder el chat QUEDA en la bandeja ("respondido") con seguimiento de la IA a las 24 h; nunca contestó → fuera de
  la bandeja, 48 h/72 h/5 d; globitos de la ficha (24 h, 48 h, 72 h, 5 días) → sale de la bandeja. En todos, la plantilla
  la elige la IA entre las aprobadas de la cuenta (`plantillaElegida` en `lib/seguimiento.js`, Haiku en
  `lib/ia/plantillas.js`); `seguimiento_cadencia` son horas ENTRE envíos (`marcasDe` las muestra acumuladas). Si falta una
  plantilla, la IA la deja como propuesta (`plantillas.propuesta_ia_at`) en Asesor IA → Plantillas para aprobar. Las
  secuencias con lista fija (`seguimiento_plantillas`) solo quedan para las que ya estaban en curso.
- CAMPAÑAS A CONTACTOS EN PAUSA (Kommo, 2026-10-16): un "Si…" a la plantilla (`alResponderCampania` en `lib/bases.js`)
  pasa el chat a la IA si la cuenta está en automático. En "Automático, todo" la IA lo asesora y cotiza como a cualquier
  lead (20-oct-2026); en "Automático, solo datos", con respuesta a una difusión en los últimos 3 días, suma
  `INSTRUCCIONES_CAMPANIA`: pide edades y particular/recibo y pasa a humano para que cotice el asesor. En los dos modos,
  los chats que ya atiende el asesor (modo humano) no los toca la IA.
- CAMPAÑA KOMMO DE GABY — EN ESPERA, NO LANZAR HASTA QUE DARÍO DIGA "ahí la lanzamos" (pedido del 19-oct-2026):
  311 contactos importados de su Kommo ("Embudo de ventas 2", 5 bandejas) en la columna "Kommo (importados)" de Gaby;
  plantillas `recontacto_kommo_*_gaby*` (migración 0059, conexión GABY) mandadas a Meta. Falta SOLO crear las difusiones
  cuando él avise, preguntándole día y hora de arranque: `scripts/campania-kommo.mjs --cuenta=gaby --desde=AAAA-MM-DDTHH:MM`
  (primero sin `--aplicar`). Se corre en su compu (C:\Users\USUARIO\Desktop\crm-asesor, tiene el .env.local).
- CHATS COMO WHATSAPP (20-oct-2026, migración 0060): borrador por chat en el navegador (`lib/borradores.js`); formato
  *negrita* _cursiva_ ~tachado~ `código`, citas y links en las burbujas (`componentes/TextoWhatsApp.js`); vista previa de
  links (`/api/vista-link`); atajos de teclado (`bandeja/Atajos.js`, Ctrl+/); reacciones nuevas animadas; Cámara en
  adjuntar (celular); stickers, contactos y ubicación con mapa; info del mensaje (`mensajes.entregado_at/leido_at`);
  mensajes fijados (`mensajes.fijado_at`, hasta 4); selección múltiple (`BarraSeleccion.js`); buscar por fecha; mensaje de
  ausencia fuera de horario (`lib/ausencia.js`, `config_asesor.ausencia_*`); chats que abren desde la memoria del navegador
  (`lib/chat-memoria.js`, se borra al cerrar sesión); modo oscuro (`lib/modo.js`, `oscuro.css`, elegido en Mi perfil y
  guardado por dispositivo). Lo que usa columnas nuevas no rompe nada si falta la 0060: solo no aparece.
- SEGUIMIENTOS Y COLUMNAS DE 60 DÍAS (20-oct-2026, migración 0061): nunca contestó → 3 plantillas en el mes (24 h,
  5 d, 15 d: `SEGUIMIENTO_NUNCA`); cotizado → "pudiste ver el plan?" a las 24 h, 72 h y 5 d, nunca promos
  (`SEGUIMIENTO_COTIZADO`, también cuando cotiza la IA o el asesor en automático); conversó y dejó de contestar → 4
  (24/48/72 h/5 d). Plantillas armadas por paso `seg_nunca_N` / `seg_cotizado_N` (+`_gaby`); si no están aprobadas, elige
  la IA. Sin respuesta al final → columna "Cotizado 60 días" (`fueCotizado`) o "No contesta 60 días" (`aColumna60` en
  `lib/seguimiento.js`): chat cerrado, sin mensajes, no pasa a la base del mes; `contactos.campania_desde` = +60 días,
  antes de eso las difusiones lo omiten. Si escribe, vuelve al embudo (Cotizado / En conversación). Por cerrar no entra.
  PERDIDO fuera de todas las bandejas aunque escriba (queda en su columna del Embudo con el mensaje sin leer).
- ETIQUETA "Cotizados" (migración 0062, trigger `etiquetar_cotizado` sobre `contactos`): la pone la base a todo contacto
  con una cotización enviada (`cotizacion.enviadas` tipo cotizacion) o en Cotizado o una etapa posterior. No se saca sola.
- "CONTACTAR EN 60 DÍAS" (migración 0063): globito de la ficha para el "por ahora no" (`contactarEn60` en
  `bandeja/[id]/acciones.js`): pasa a esa columna (está en `COLUMNAS_60`), chat cerrado, `fecha_acordada` a 60 días a las
  10 → ese día se lo retoma solo. Si escribe antes vuelve al embudo (a Cotizado si se le cotizó).
- PASO DEL ASESOR (migración 0064, `lib/paso-del-asesor.js`): lo que el asesor programa a mano en Próximo paso (editor o
  globitos) queda marcado (`conversaciones.seguimiento_por_asesor`) y, hasta esa fecha, ni la IA (`gestionar_seguimiento`,
  default de fin de turno, cotización) ni `programarSecuencia` lo pisan; solo una fecha acordada con el cliente. Al
  llegar el paso, `procesarUno` saca la marca. Sin la columna no hace nada (las lecturas ignoran el error).
- AUDITORÍA MÉDICA NO SE TOCA (Darío, 20-oct-2026: preexistencias, tema delicado): nunca sale nada automático. Sin
  seguimientos ni fecha acordada (`procesarUno` lo chequea antes), sin campañas ni base del mes (`lib/bases.js`), sin
  columnas de 60 días, sin mensaje de ausencia, la IA no le escribe (`responderComoAsesor`) y "Que siga la IA" lo rechaza.
- ENVÍO DE AUDIOS CONFIABLE (migración 0065, 21-oct-2026, `lib/whatsapp/envio-audio.js`): todo audio saliente se guarda
  'pendiente' y lo manda el SERVIDOR (`despacharAudio`: 3 intentos, si no 'fallido' con "Reintentar" en la burbuja →
  `despacharAudioPendiente`). Grabación de la bandeja: guardar (enviarDesdeBandeja tipo grabacion sin path → `subirA`) →
  el navegador sube → `despacharAudioPendiente`. Cerrar el chat o la pestaña no lo corta; el cron retoma los pendientes
  colgados (`rescatarAudiosPendientes`). Biblioteca: se sube a Meta una vez por número y se reusa `audios.meta_media_id`
  (se renueva a los 25 días o si Meta lo rechaza). Las grabaciones se codifican a 24 kbps. Sin la 0065 sale por link como antes.
- AHORRO DE TRANSFERENCIA (21-oct-2026): notas de voz y videos con preload="none" (se bajan al tocar play; la duración
  se lee de los últimos 6 KB del OGG y queda en el navegador); PDF sin vista previa embebida (se bajan al abrirlos).
  Links firmados de 7 días reusados (`lib/url-firmada.js` en el navegador, firmados en lote; `/api/archivo` en el
  servidor con la redirección en caché 5 días). Todo lo que se sube lleva `cacheControl: CACHE_ARCHIVO` (1 año,
  `lib/cache-archivos.js`); los archivos viejos conservan su caché de 1 h (no se re-suben).
- COLUMNAS DE 30 DÍAS (migración 0066, 21-oct-2026): el que termina las plantillas sin contestar va a "Cotizado 30 días"
  o "No contesta 30 días" (`aColumna60` en `lib/seguimiento.js`; campaña a los 30 días). Las de 60 quedan con los que ya
  estaban. Todas están en `COLUMNAS_60` (lib/formato.js). Sin la 0066, van a las de 60 como antes.
- "TODOS" CON GANADOS Y PERDIDOS (21-oct-2026): `traerLista` (lib/consultas.js) suma los chats cerrados en Ganado/Perdido;
  en Mis chats se ven solo en "Todos" y al buscar, con su etapa como etiqueta. Los demás filtros y contadores, sin ellos.
- Fotos y videos del cliente muestran abajo el texto que escribió (texto_original si la IA renombró el archivo).
- CELULAR MÁS RÁPIDO (21-oct-2026): `public/sw.js` se activa siempre (`componentes/GuardarApp.js`) y guarda en el
  dispositivo SOLO piezas fijas (`/_next/static`, íconos, fondos, `/opus`); pantallas, datos y archivos van siempre a
  internet. La lista abre al instante con los últimos 25 chats guardados (`guardarListaEnMemoria` → `ListaCargando`) y se
  dibuja de a 60 (`TANDA_LISTA`). El saldo de IA del layout va en paralelo y trae solo los consumos necesarios.
- AHORRO EN META (migraciones 0068 y 0070, 22-oct-2026): `plantillas.version_utilidad` = su versión de utilidad (0070: COPIA EXACTA del texto, nombre + "_u", solo las que no hablan de promos; las reescrituras `_util` de la 0068 quedaron sin uso); al mandar, si
  está aprobada (activa + categoria utility) sale esa (`enviarMensaje` en lib/whatsapp/enviar.js); si Meta la reclasifica,
  vuelve la original. Las versiones no se eligen sueltas en los seguimientos de la IA. Con la ventana de 24 h abierta,
  toda plantilla sin imagen sale como TEXTO (gratis; sin botones); si Meta responde 131047, sale como plantilla.
  Campañas/promos siguen siendo marketing.
- MENOS PLANTILLAS (22-oct-2026): al que nunca contestó, la bienvenida y UNA plantilla a los 5 días (finde → lunes;
  `SEGUIMIENTO_NUNCA`, `MAX_PLANTILLAS_NUNCA` corta también las secuencias en curso y las listas fijas) y enseguida a
  "No contesta 30 días". Cotizado: 24 h, 72 h, 7 días y 20 días del último mensaje (`SEGUIMIENTO_COTIZADO`, también
  para los que estaban en curso con una cadencia vieja: `SEGUIMIENTOS_VIEJOS`) y enseguida a "Cotizado 30 días".
  PrepagaYa ya no manda a Kommo: solo CRM o mail (los destinos viejos de Kommo se leen como el CRM de esa cuenta).
  La IA manda UN texto por turno
  (`textosEnviados` en lib/ia/asesor.js; la cotización puede ir igual). Campaña Kommo solo a los que contestaron
  (`scripts/campania-kommo.mjs`, `--con-nunca` para sumar el otro grupo; SQL 0069 frena los pendientes de Darío).
  Plantillas con nombre fijo en el saludo (`tieneNombreFijo`) no salen en seguimientos ni se mandan a Meta.
- Pendiente: transcripción de audios entrantes (proveedor a definir), seguimientos dentro de las 24 h.
- Registro público desactivado: los usuarios se crean desde Supabase > Authentication.
- `robots` bloquea indexación.

## Para que la pantalla no se cuelgue (reglas de interfaz)
El 2026-10-08 el CRM quedó "colgado" (no se podía abrir un chat ni cambiar de sección) por un bucle de redibujado en
`Deslizable`: un `useEffect` sin dependencias ponía un estado-objeto después de cada dibujo. No era de sesiones.
- Todo `useEffect` lleva lista de dependencias. Si tiene que correr en cada dibujo, la línea de arriba lo explica con
  `// efecto-en-cada-dibujo: <por qué es seguro>`. Lo controla `scripts/revisar-pantallas.mjs`, que corre dentro de
  `npm run build` (sin eso no se publica) y a mano con `npm run revisar`.
- Estado que sale de MEDIR la pantalla (anchos, scroll, si algo desborda): guardar lo último medido en un `useRef` y
  no llamar al `set…` si no cambió; usar valores sueltos (verdadero/falso, números), no objetos nuevos.
- `app/Vigia.js` (en el layout raíz) es la red de seguridad: si se toca un enlace interno y a los 8 s la pantalla sigue
  en el mismo lugar, carga la página de destino entera; y manda a los registros los cuelgues y los errores de JavaScript.
  No usar `<a>`/`<Link>` con `preventDefault` para otra cosa que navegar (para eso, `<button>`).
- Ante un "se cuelga": PRIMERO mirar los avisos del navegador, antes de pensar en sesiones o en el servidor:
  `vercel logs --project crm-asesor --scope forza-projects --environment production --since 1h -q diagnostico`
  (tipos: `navegacion_trabada`, `redibujado_continuo`, `error`, `error_pantalla`; entran por `/api/diagnostico`).
- Las rutas `/api/*` quedan fuera del proxy: ahí NO usar el cliente de Supabase para mirar la sesión (puede renovarla
  o borrar las cookies a destiempo). Para saber de quién es el navegador: `lib/cuenta-cookie.js` (solo lee).
- Un navegador guarda UNA sesión por dirección (la comparten todas sus pestañas). Dos cuentas a la vez en la misma
  compu = dos direcciones distintas (o ventana de incógnito).

## MVP (orden sugerido)
1. Login (Supabase Auth) y esquema de base: contactos/leads, conversaciones, mensajes, etiquetas,
   etapas del embudo, audios (biblioteca), campañas, origen del lead.
2. Webhook real: guardar cada mensaje en la base ANTES de procesarlo; idempotencia por id de
   mensaje de Meta; responder 200 rápido.
3. Bandeja web estilo WhatsApp (sin logo, nombre ni verde de WhatsApp): lista de chats con etiquetas y
   filtros, conversación, ficha del lead. Tiempo real con Supabase Realtime.
4. Envío de mensajes, audios y plantillas; indicador de ventana de 24 h.
5. Ingreso de leads por formulario (endpoint único para todas las webs) y de leads de Swiss Medical;
   deduplicar por teléfono; disparar plantilla de bienvenida.
6. Asesor IA: relevamiento (edades de todos, zona, grupo familiar, situación laboral/aportes),
   elección de audio de la biblioteca, manejo de objeciones, etiquetado automático,
   pase a humano con resumen, seguimientos dentro de la ventana de 24 h.
7. Cotización automática en la ficha (carrusel de planes + campañas).
8. Versión instalable en el celular (PWA). App nativa más adelante.

## Diseño de referencia
Maqueta (web + app): https://claude.ai/artifact/XCZYBywPyPhQ9KhBiPqKFu
Tipografía Figtree; acento verde azulado #0B6E5F; fondo de chat #EDE8E0; burbuja saliente #D7F0E8.
Layout web: riel de navegación | lista de chats | conversación | ficha del lead.

## Cotizador (fuente de precios)
El cotizador actual (cotizadorsmg.com.ar, en Hostinger) tiene toda la lógica en un `index.html`:
- `PRICES[zona].directo|derivacion[plan]` con claves de edad `h35, r36, r41, r46, r51, r56, r61`
  y de hijos `hj1` (primer hijo) y `hjA` (hijos adicionales). Hijos de 21+ pagan por edad.
- Zonas: AMBA, INTERIOR, CORDOBA, PATAGONIA, TDF, RESTO.
- Planes: S1, SMG02, S2, Sport-S, SMG20, SMG30, Sport, SMG40, Sport+, SMG50, SMG60, SMG70.
- Campañas (descuento por integrante):
  - individual50: 50% a menores de 26, resto 0%.
  - familiar: 50% a menores de 26, resto 15%.
  - monotributo: 25% a todos.
  - nordelta: hijos 50%, menores de 26 50%, resto 25%.
- Total = suma(base × (1 + aumento%) × (1 − descuento)). La derivación descuenta además el aporte
  según sueldo bruto.
- Plan: migrar las tablas a Supabase y cargar cada lista mensual desde un panel.
Pedirle al usuario el `index.html` del cotizador para importar las tablas.

## Reglas del asesor IA
- Nunca inventar precios ni coberturas: solo usar datos del cotizador y de la base de conocimiento.
- Pasar a humano si: pide cotización formal, menciona enfermedades/tratamientos, está listo para
  cerrar, o se enoja.
- Respetar la ventana de 24 h de WhatsApp; fuera de ella solo plantillas aprobadas.
- Datos de salud: tratarlos con cuidado (Ley 25.326).
