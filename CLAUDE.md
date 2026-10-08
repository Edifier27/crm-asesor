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
  "Ver cotización" (desglose por integrante, `detalleCotizacion`) y "Plan y cartilla" (ver/enviar PDF por WhatsApp).
  Todo lo enviado queda en `contactos.cotizacion.enviadas` (historial en la ficha y "Enviado" en cada plan).
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
