// ==UserScript==
// @name         Salesforce ← AsesorCRM — Pedidos de link de alta (automático)
// @namespace    sf-crm-pedidos
// @version      0.6
// @description  Toma los pedidos de "link de alta" del CRM y los hace solo en Salesforce: candidato → Listo para convertir → Convertir → (cotizás vos) → sincronizar → Generar link → devuelve el link al CRM. v0.4: además mira la etapa de las Oportunidades de las ventas (falta de cobro / impactada) y se la avisa al CRM. Comparte el SEMÁFORO con el script de transición (los leads de OmniCanal tienen prioridad).
// @match        https://swissmedical.lightning.force.com/*
// @noframes
// @connect      asesorcrm.com.ar
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// ==/UserScript==

// Cómo funciona (Darío, 9-nov-2026; mapa de pantallas en sf-selectores.json):
//  1. Cada minuto le pregunta al CRM si hay pedidos (los crea el CRM solo cuando la IA cierra la salud OK, o el asesor
//     con el botón de la ficha).
//  2. Toma el más viejo y hace los pasos. Guarda en qué paso va: si Salesforce recarga la página, sigue desde ahí.
//  3. La cotización la hacés vos (v0.3): el script abre el Cotizador y te muestra los datos; cuando tocás
//     "Ya coticé, seguí", sincroniza, genera el link y se lo devuelve al CRM, que se lo manda al cliente.
//  4. Si hay un lead de OmniCanal esperando, frena en el próximo paso seguro y deja trabajar a la transición.
//  5. Cada 20 minutos, si está libre y no tocaste la compu en 5 minutos, abre la lista "Mis Oportunidades", lee la
//     etapa de las ventas y vuelve a donde estabas: "En Proceso de Cobro" → el CRM le manda el link de pago al
//     cliente; "Cerrada"/"Closed Won" → impactada.
// v0.6: trabaja solo en la pestaña marcada "Ventas" (abajo a la izquierda elegís el rol de cada pestaña) y al terminar
// cierra las pestañas de la consola que abrió. Ya no comparte el semáforo con la transición: van en pestañas distintas.
// Navega con la navegación interna de Lightning ($A, sin recargar: probado por Claude in Chrome el 9-nov-2026), así
// no se corta OmniCanal. Si no la encuentra, recarga como antes.
// PASO_A_PASO = true: antes de cada clic te pregunta "¿sigo?". Dejalo así en las primeras pruebas.

(function () {
  'use strict';

  // ═════════════════════════════════════════════════════════════
  //  CONFIGURACIÓN
  // ═════════════════════════════════════════════════════════════
  const CRM_CLAVE = 'PEGAR_ACA_TU_CLAVE_PERSONAL'; // CRM → Mi perfil → Script de Salesforce → Generar clave
  const PASO_A_PASO = true;   // en las primeras pruebas, que pregunte antes de cada clic
  const AUTOMATICO = true;    // false: solo muestra los pedidos y vos tocás "Empezar"

  const CRM = 'https://asesorcrm.com.ar/api/salesforce/acciones';
  const CRM_OPORTUNIDADES = 'https://asesorcrm.com.ar/api/salesforce/oportunidades';
  const MIRAR_ETAPAS_CADA_MS = 20 * 60 * 1000;
  const MIRAR_ETAPAS = true;
  const QUIETO_MS = 2 * 60 * 1000; // solo mira las etapas si no tocaste la compu en este tiempo
  const CADA_MS = 60 * 1000;
  const INTENTOS_POR_PASO = 3;

  // Semáforo solo entre pestañas de Ventas (por si abrís dos): la transición va en su propia pestaña y no espera
  const LOCK_KEY = 'smg_ventas_lock';
  const PRIO_KEY = 'smg_flow_prioridad';
  const YO = 'cotizador';
  const LOCK_TTL_MS = 6 * 60 * 1000;
  const PRIO_TTL_MS = 3 * 60 * 1000;
  const ESTADO_KEY = 'crm_pedido_en_curso';

  // ═════════════════════════════════════════════════════════════
  //  A partir de acá NO hace falta tocar nada
  // ═════════════════════════════════════════════════════════════

  const log = (msg) => console.log(`[CRM→SF ${new Date().toLocaleTimeString('es-AR')}] ${msg}`);
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const pausa = () => esperar(1500 + Math.floor(Math.random() * 2500));

  // ── Búsqueda dentro del shadow DOM de Lightning ──
  function todos(selector, raiz = document) {
    let res = [];
    try { res = Array.from(raiz.querySelectorAll(selector)); } catch (e) {}
    for (const el of raiz.querySelectorAll('*')) if (el.shadowRoot) res = res.concat(todos(selector, el.shadowRoot));
    return res;
  }
  const visible = (el) => !!el && el.offsetParent !== null;
  const uno = (selector, raiz) => todos(selector, raiz).find(visible) || null;
  const texto = (el) => (el?.innerText || el?.textContent || '').trim();
  const botonConTexto = (re, clase) => todos('button').find((b) => visible(b) && re.test(texto(b)) && (!clase || (b.className || '').includes(clase))) || null;
  const habilitado = (b) => b && !b.disabled && b.getAttribute('aria-disabled') !== 'true';

  function esperarA(fn, desc, ms = 20000) {
    return new Promise((ok, mal) => {
      const t0 = Date.now();
      const intentar = () => {
        let r = null;
        try { r = fn(); } catch (e) {}
        if (r) return ok(r);
        if (Date.now() - t0 > ms) return mal(new Error(`No apareció: ${desc}`));
        setTimeout(intentar, 400);
      };
      intentar();
    });
  }
  async function esperarConReintento(fn, desc, ms = 20000) {
    for (let i = 1; i <= INTENTOS_POR_PASO; i++) {
      try { return await esperarA(fn, desc, ms); } catch (e) { if (i === INTENTOS_POR_PASO) throw e; log(`⚠️ ${e.message} (intento ${i}) — reintento`); await esperar(4000); }
    }
  }

  // ── CRM ──
  function pedir(metodo, url, cuerpo) {
    return new Promise((resolver) => {
      GM_xmlhttpRequest({
        method: metodo, url, timeout: 20000,
        headers: { 'x-api-key': CRM_CLAVE, 'Content-Type': 'application/json' },
        data: cuerpo ? JSON.stringify(cuerpo) : undefined,
        onload: (r) => { let j = {}; try { j = JSON.parse(r.responseText); } catch (e) {} resolver({ status: r.status, ...j }); },
        onerror: () => resolver({ status: 0, error: 'Sin conexión con el CRM' }),
        ontimeout: () => resolver({ status: 0, error: 'El CRM no respondió' })
      });
    });
  }

  // ── Semáforo ──
  const leer = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const duenio = () => { const l = leer(LOCK_KEY); return l && Date.now() - l.t < LOCK_TTL_MS ? l.quien : null; };
  const libreParaMi = () => { const d = duenio(); return !d || d === YO; };
  // La pestaña de Ventas no tiene OmniCanal: los leads entran por la de Transición, que no hace falta esperar
  const prioridadDeOtro = () => false;
  async function tomarLock() {
    if (!libreParaMi()) return false;
    const token = Math.random().toString(36).slice(2);
    localStorage.setItem(LOCK_KEY, JSON.stringify({ quien: YO, token, t: Date.now() }));
    await esperar(300);
    const l = leer(LOCK_KEY);
    return !!(l && l.token === token);
  }
  const renovarLock = () => { const l = leer(LOCK_KEY); if (l && l.quien === YO) { l.t = Date.now(); localStorage.setItem(LOCK_KEY, JSON.stringify(l)); } };
  const soltarLock = () => { const l = leer(LOCK_KEY); if (l && l.quien === YO) localStorage.removeItem(LOCK_KEY); };

  // ── Estado del pedido en curso (sobrevive a las recargas) ──
  const estado = () => leer(ESTADO_KEY);
  const guardar = (e) => localStorage.setItem(ESTADO_KEY, JSON.stringify({ ...e, t: Date.now() }));
  const limpiar = () => localStorage.removeItem(ESTADO_KEY);

  // ── Rol de la pestaña (v0.6 / v3.8, Darío 9-nov-2026): una pestaña "Transición" (OmniCanal en línea, acepta los
  // leads) y otra "Ventas" (pedidos de link, cotización y etapas). Cada script trabaja solo en la suya. El rol queda en
  // la pestaña (sessionStorage) hasta que la cerrás. Los dos scripts dibujan el mismo selector: el primero que llega.
  const ROL_KEY = 'smg_rol_pestana';
  const rolDeLaPestana = () => { try { return sessionStorage.getItem(ROL_KEY); } catch (e) { return null; } };
  function dibujarSelectorDeRol() {
    let caja = document.getElementById('smg-rol-pestana');
    if (!caja) {
      caja = document.createElement('div');
      caja.id = 'smg-rol-pestana';
      Object.assign(caja.style, { position: 'fixed', bottom: '24px', left: '24px', zIndex: 999999, padding: '8px 12px', borderRadius: '10px',
        background: '#1D2B28', color: '#fff', font: '12px/1.4 sans-serif', boxShadow: '0 2px 8px rgba(0,0,0,.3)' });
      document.body.appendChild(caja);
    }
    const rol = rolDeLaPestana();
    const boton = (r, t) => `<button data-rol="${r}" style="margin-left:6px;border:0;border-radius:6px;padding:3px 8px;cursor:pointer;background:${rol === r ? '#E8002D' : '#fff'};color:${rol === r ? '#fff' : '#1D2B28'}">${t}</button>`;
    caja.innerHTML = `${rol ? 'Esta pestaña:' : '<b>¿Para qué es esta pestaña?</b>'}${boton('transicion', 'Transición')}${boton('ventas', 'Ventas')}`;
    caja.querySelectorAll('[data-rol]').forEach((b) => (b.onclick = () => { try { sessionStorage.setItem(ROL_KEY, b.dataset.rol); } catch (e) {} dibujarSelectorDeRol(); }));
  }
  setTimeout(dibujarSelectorDeRol, 3000);
  setInterval(() => { if (!document.getElementById('smg-rol-pestana')) dibujarSelectorDeRol(); }, 10000);

  // ── Pestañas de la consola: al terminar se cierran las que abrió el pedido ──
  const pestanasAbiertas = () => todos('button[title^="Cerrar "]').map((b) => b.getAttribute('title')).filter((t) => t && t.includes(' | '));
  async function cerrarPestanasNuevas(antes) {
    if (!Array.isArray(antes)) return;
    for (const b of todos('button[title^="Cerrar "]')) {
      const t = b.getAttribute('title') || '';
      if (t.includes(' | ') && !antes.includes(t)) { b.click(); log(`Pestaña cerrada: ${t}`); await esperar(800); }
    }
  }

  // ── Panel ──
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', bottom: '150px', right: '24px', zIndex: 999999, width: '330px', maxHeight: '60vh', overflow: 'auto',
    background: '#fff', border: '2px solid #0B6E5F', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,.25)',
    font: '13px/1.4 sans-serif', color: '#1D2B28', padding: '10px 12px', display: 'none'
  });
  document.body.appendChild(panel);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const edades = (d) => (d.integrantes ?? []).map((i) => `${i.parentesco ?? 'integrante'} ${i.edad ?? '?'}`).join(', ') || 'sin edades';
  const ZONA_SF = { AMBA: 'AMBA', CORDOBA: 'Cordoba', PATAGONIA: 'Patagonia y Salta', TDF: 'Tierra del Fuego', INTERIOR: 'Buenos Aires y Santa Fe', RESTO: 'Resto del interior del Pais' };

  function mostrar(html) { panel.style.display = 'block'; panel.innerHTML = `<b style="color:#0B6E5F">Pedidos del CRM</b><div style="margin-top:6px">${html}</div>`; }
  function datosHtml(d) {
    return `<b>${esc(d.nombre ?? 'Sin nombre')}</b> · DNI ${esc(d.dni)}<br>
      Plan <b>${esc(d.plan)}</b> · ${esc(d.tipo_venta)} (condición: ${d.tipo_venta === 'desregulado' ? 'SWISS MEDICAL' : 'Directo'})<br>
      Zona del cotizador: <b>${esc(ZONA_SF[d.zona] ?? d.zona ?? '?')}</b>${d.provincia ? ` · ${esc(d.provincia)}` : ''}${d.localidad ? ` (${esc(d.localidad)})` : ''}<br>
      ${esc(edades(d))}${d.sueldos?.length ? ` · sueldo bruto ${esc(d.sueldos.join(' + '))}` : ''}${d.campania ? `<br>Campaña en el CRM: ${esc(d.campania)}` : ''}`;
  }

  // ── Pasos ──
  async function confirmar(paso) {
    if (!PASO_A_PASO) return true;
    return confirm(`Pedido del CRM — siguiente paso:\n\n${paso}\n\n¿Sigo?`);
  }
  async function clic(el, paso) {
    if (!(await confirmar(paso))) throw Object.assign(new Error('Pausado por vos'), { pausa: true });
    renovarLock();
    el.scrollIntoView({ block: 'center' });
    await pausa();
    el.click();
    log(`✓ ${paso}`);
  }
  // Navegación interna de Lightning (sin recargar la página ni cortar OmniCanal); si no está, recarga
  function navegar(url) {
    try {
      const ev = unsafeWindow.$A && unsafeWindow.$A.get('e.force:navigateToURL');
      if (ev) { ev.setParams({ url }).fire(); return true; }
    } catch (e) {}
    location.assign(url);
    return false;
  }
  // Para los pasos: navega y vuelve a correr el pedido cuando la página nueva cargó
  const ir = (url) => {
    if (location.pathname.startsWith(url)) return;
    if (navegar(url)) setTimeout(() => correr(), 5000);
  };

  async function pasoAbrirLead(e) {
    const id = e.accion.datos?.salesforce_id;
    if (!id) {
      // Sin candidato en Salesforce (vino de la web, un referido…): lo cargás vos y seguimos
      guardar({ ...e, paso: 'esperar_lead' });
      return pasoEsperarLead(estado());
    }
    guardar({ ...e, paso: 'preparar_lead' });
    if (!location.pathname.includes(`/Lead/${id}`)) { ir(`/lightning/r/Lead/${id}/view`); return 'navegando'; }
    return pasoPrepararLead(estado());
  }

  function pasoEsperarLead(e) {
    mostrar(`${datosHtml(e.accion.datos)}<br><br>Este lead no está en Salesforce: <b>cargalo como candidato B2C</b> con estos datos, abrí su ficha y tocá:<br>
      <button id="crm-seguir-lead" style="margin-top:6px;background:#0B6E5F;color:#fff;border:0;border-radius:6px;padding:4px 10px">Seguir desde este candidato</button>
      <button id="crm-cancelar" style="margin-top:6px">No se pudo</button>`);
    panel.querySelector('#crm-seguir-lead').onclick = () => {
      const m = location.href.match(/\/(00Q[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?)/);
      if (!m) { alert('Abrí la ficha del candidato (la dirección tiene que tener /Lead/00Q…).'); return; }
      const est = estado();
      est.accion.datos = { ...est.accion.datos, salesforce_id: m[1] };
      guardar({ ...est, paso: 'preparar_lead' });
      correr();
    };
    panel.querySelector('#crm-cancelar').onclick = () => fallar('El asesor no pudo cargar el candidato');
    return 'esperando_asesor';
  }

  async function pasoPrepararLead(e) {
    await esperarConReintento(() => uno('button[name="Convert"]') || uno('button[title="Registrar una llamada"]') || uno('button[title="Modificar Listo para convertir"]'), 'la ficha del candidato', 30000);
    if (!uno('button[name="Convert"]')) {
      // "Listo para convertir" recién aparece en Esperando Respuesta: si no está, llamada + Esperando Respuesta
      if (!uno('button[title="Modificar Listo para convertir"]')) {
        const llamada = await esperarConReintento(() => uno('button[title="Registrar una llamada"]'), 'Registrar una llamada');
        await clic(llamada, 'Registrar una llamada');
        await clic(await esperarConReintento(() => uno('.cuf-publisherShareButton'), 'Guardar de la llamada'), 'Guardar la llamada');
        await esperar(3000);
        const esp = await esperarConReintento(() => { const b = uno('button[name="Lead.Esperando_Respuesta"]'); return habilitado(b) ? b : null; }, 'Esperando Respuesta');
        await clic(esp, 'Pasar a "Esperando Respuesta"');
        await clic(await esperarConReintento(() => botonConTexto(/^Siguiente$/, 'slds-button_brand'), 'Siguiente del modal'), 'Confirmar ("Siguiente")');
        await esperar(3000);
      }
      if (prioridadDeOtro()) return 'prioridad';
      await clic(await esperarConReintento(() => uno('button[title="Modificar Listo para convertir"]'), 'lápiz de Listo para convertir'), 'Editar "Listo para convertir"');
      const campo = await esperarConReintento(() => uno('lightning-input[name="SMG_Ready_to_convert__c"]'), 'casilla Listo para convertir');
      const casilla = campo.querySelector('input[type="checkbox"]') || todos('input[type="checkbox"]', campo.shadowRoot || campo)[0];
      if (!casilla) throw new Error('No encuentro la casilla de "Listo para convertir"');
      if (!casilla.checked) await clic(casilla, 'Tildar "Listo para convertir"');
      await clic(await esperarConReintento(() => uno('button[name="SaveEdit"]'), 'Guardar'), 'Guardar');
      await esperarConReintento(() => uno('button[name="Convert"]'), 'botón Convertir', 30000);
    }
    guardar({ ...e, paso: 'convertir' });
    return pasoConvertir(estado());
  }

  async function pasoConvertir(e) {
    if (prioridadDeOtro()) return 'prioridad';
    await clic(await esperarConReintento(() => uno('button[name="Convert"]'), 'botón Convertir'), 'Convertir el candidato (abre la pantalla de conversión)');
    await clic(await esperarConReintento(() => botonConTexto(/^Convertir$/, 'slds-button_brand'), 'Convertir de la pantalla de conversión', 30000), 'Confirmar la conversión (crea Cuenta y Oportunidad)');
    const enlace = await esperarConReintento(() => uno('a.outputLookupLink[data-recordid^="006"]') || todos('a.outputLookupLink[data-recordid^="006"]')[0], 'la Oportunidad creada', 40000);
    const oportunidad = enlace.getAttribute('data-recordid');
    log(`Oportunidad ${oportunidad}`);
    guardar({ ...e, paso: 'cotizar', oportunidad });
    ir(`/lightning/r/Opportunity/${oportunidad}/view`);
    return 'navegando';
  }

  async function pasoCotizar(e) {
    if (!location.pathname.includes(`/Opportunity/${e.oportunidad}`)) { ir(`/lightning/r/Opportunity/${e.oportunidad}/view`); return 'navegando'; }
    const boton = await esperarConReintento(() => uno('button[name="Opportunity.Cotizador"]'), 'botón Cotizador', 30000);
    if (!e.cotizadorAbierto) { await clic(boton, 'Abrir el Cotizador'); guardar({ ...e, cotizadorAbierto: true }); }
    // v0.3: la cotización la hace el asesor (zona, integrantes, descuento, plan → Ir a Cotizar → Cotizar → Salir)
    mostrar(`${datosHtml(e.accion.datos)}<br><br><b>Cotizá vos</b>: zona, integrantes, descuento, plan → Ir a Cotizar → <b>Cotizar</b> → Salir. Después tocá:<br>
      <button id="crm-ya-cotice" style="margin-top:6px;background:#0B6E5F;color:#fff;border:0;border-radius:6px;padding:4px 10px">Ya coticé, seguí</button>
      <button id="crm-cancelar" style="margin-top:6px">No se pudo</button>`);
    panel.querySelector('#crm-ya-cotice').onclick = () => { guardar({ ...estado(), paso: 'sincronizar' }); correr(); };
    panel.querySelector('#crm-cancelar').onclick = () => fallar('El asesor no pudo cotizar');
    return 'esperando_asesor';
  }

  async function pasoSincronizar(e) {
    if (!location.pathname.includes(`/Opportunity/${e.oportunidad}`)) { ir(`/lightning/r/Opportunity/${e.oportunidad}/view`); return 'navegando'; }
    if (prioridadDeOtro()) return 'prioridad';
    await clic(await esperarConReintento(() => uno('li[data-target-selection-name="flexipage_tab4Tab"] a[role=tab]'), 'pestaña Cotización', 30000), 'Abrir la pestaña Cotización');
    const cotizacion = await esperarConReintento(() => todos('a').find((a) => visible(a) && (/\/Quote\/0Q0/.test(a.href) || /^0001\d{4,}/.test(texto(a)))), 'la cotización en la pestaña');
    await clic(cotizacion, `Abrir la cotización ${texto(cotizacion)}`);
    await clic(await esperarConReintento(() => uno('button[name="SyncQuote"]'), 'Iniciar sincronización', 30000), 'Iniciar sincronización');
    await clic(await esperarConReintento(() => botonConTexto(/continuar/i), 'confirmación de la sincronización'), 'Confirmar ("¿Desea continuar?")');
    await esperar(5000);
    guardar({ ...e, paso: 'generar_link' });
    // Vuelve a la Oportunidad (la cotización se abrió en otra pestaña de la consola)
    navegar(`/lightning/r/Opportunity/${e.oportunidad}/view`);
    setTimeout(() => correr(), 6000);
    return 'navegando';
  }

  async function pasoGenerarLink(e) {
    if (!location.pathname.includes(`/Opportunity/${e.oportunidad}`)) { ir(`/lightning/r/Opportunity/${e.oportunidad}/view`); return 'navegando'; }
    await clic(await esperarConReintento(() => uno('button[name="Opportunity.SMG_QA_GenerateSelfServiceLink"]'), 'Generar Link Autogestión', 30000), 'Generar Link Autogestión');
    const r = await esperarConReintento(() => {
      const a = todos('a[href*="asociarme"]').find((x) => /^https:\/\/asociarme\.(swissmedical|clubswiss)\.com\.ar\//i.test(x.href));
      if (a) return { link: a.href };
      const err = todos('flowruntime-display-text-lwc lightning-formatted-rich-text p').map(texto).find((t) => t.length > 10);
      return err ? { error: err } : null;
    }, 'el link (o el error) de Generar Link', 40000);
    if (r.error) throw new Error(`Salesforce: ${r.error}`);
    const fin = botonConTexto(/^Finalizar$/);
    if (fin) { await pausa(); fin.click(); }
    await esperar(2000);
    const tramite = texto(uno('[data-target-selection-name="sfdc:RecordField.Opportunity.SMG_Opportunity_TransactionNumber__c"] .test-id__field-value')).replace(/\D/g, '')
      || (r.link.match(/\/(\d{6,})\/?$/) ?? [])[1] || null;
    const res = await pedir('PATCH', `${CRM}/${e.accion.id}`, { estado: 'listo', link: r.link, precarga: tramite, salesforce_id: e.accion.datos?.salesforce_id ?? null, oportunidad: e.oportunidad ?? null });
    if (res.status !== 200) throw new Error(`El CRM no aceptó el link: ${res.error || res.status}`);
    log(`✓ Link de ${e.accion.datos?.nombre} enviado al CRM`);
    limpiar();
    await cerrarPestanasNuevas(e.pestanasAntes);
    mostrar(`✓ Listo: el link de <b>${esc(e.accion.datos?.nombre)}</b> volvió al CRM.`);
    setTimeout(() => (panel.style.display = 'none'), 8000);
    return 'terminado';
  }

  async function fallar(motivo) {
    const e = estado();
    limpiar(); soltarLock();
    await cerrarPestanasNuevas(e?.pestanasAntes);
    if (e?.accion) await pedir('PATCH', `${CRM}/${e.accion.id}`, { estado: 'error', error: String(motivo).slice(0, 280) });
    mostrar(`✗ ${esc(motivo)}<br>Quedó avisado en el chat del CRM para hacerlo a mano.`);
  }

  const PASOS = { abrir_lead: pasoAbrirLead, esperar_lead: pasoEsperarLead, preparar_lead: pasoPrepararLead, convertir: pasoConvertir, cotizar: pasoCotizar, sincronizar: pasoSincronizar, generar_link: pasoGenerarLink };

  let corriendo = false;
  async function correr() {
    if (corriendo || rolDeLaPestana() !== 'ventas') return;
    const e = estado();
    if (!e) return;
    if (prioridadDeOtro() || !(await tomarLock())) { log('⏸ La transición está trabajando: espero'); return; }
    corriendo = true;
    try {
      const r = await PASOS[e.paso](e);
      if (r === 'prioridad') log('⏸ Lead de OmniCanal esperando: freno y sigo después');
      if (r === 'esperando_asesor' || r === 'prioridad' || r === 'terminado') soltarLock();
    } catch (err) {
      if (err.pausa) {
        soltarLock();
        mostrar(`${datosHtml(e.accion.datos)}<br><br>⏸ Pausado en "${esc(e.paso)}". <button id="crm-reanudar">Reanudar</button> <button id="crm-cancelar">No se pudo</button>`);
        panel.querySelector('#crm-reanudar').onclick = () => correr();
        panel.querySelector('#crm-cancelar').onclick = () => fallar('Cancelado por el asesor');
      } else {
        log(`✗ ${err.message}`);
        await fallar(`${err.message} (paso: ${e.paso})`);
      }
    } finally {
      corriendo = false;
    }
  }

  async function revisarCola() {
    if (rolDeLaPestana() !== 'ventas') { panel.style.display = 'none'; return; }
    if (CRM_CLAVE.startsWith('PEGAR')) { log('Falta la clave: pegala en CRM_CLAVE'); return; }
    if (estado()) return correr();
    const r = await pedir('GET', CRM);
    if (r.status === 401) { log('Clave incorrecta: generá una nueva en Mi perfil del CRM'); return; }
    if (r.status !== 200) { log(`No pude consultar el CRM: ${r.error || r.status}`); return; }
    const accion = (r.acciones ?? []).find((a) => a.estado === 'pendiente');
    if (!accion) return;
    const empezar = async () => {
      const t = await pedir('PATCH', `${CRM}/${accion.id}`, { estado: 'en_curso' });
      if (t.status !== 200) { log(t.error || 'No pude tomar el pedido'); return; }
      guardar({ accion, paso: 'abrir_lead', pestanasAntes: pestanasAbiertas() });
      correr();
    };
    if (AUTOMATICO) return empezar();
    mostrar(`${datosHtml(accion.datos ?? {})}<br><button id="crm-empezar" style="margin-top:6px;background:#0B6E5F;color:#fff;border:0;border-radius:6px;padding:4px 10px">Empezar</button>`);
    panel.querySelector('#crm-empezar').onclick = empezar;
  }

  // ── Etapa de las Oportunidades (v0.5: lista "Mis Oportunidades") ──
  const ETAPAS = { 'A cotizar': 'A cotizar', 'Propuesta Enviada': 'Propuesta Enviada', AM: 'AM', 'En Proceso de Alta': 'En Proceso de Alta',
    'En Proceso de Cobro': 'En Proceso de Cobro', Cerrada: 'Cerrada', 'Closed Won': 'Cerrada' }; // "Closed Lost" no se informa
  let ultimaActividad = Date.now();
  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((ev) => addEventListener(ev, () => { ultimaActividad = Date.now(); }, { passive: true, capture: true }));

  /** Lee la lista: { id15: etapa } (el id de 15 letras, para comparar con el de 18 sin problemas) */
  function etapasDeLaLista() {
    const res = {};
    for (const tr of todos('tr[data-row-key-value^="006"]')) {
      const id = tr.getAttribute('data-row-key-value');
      const celdas = Array.from(tr.querySelectorAll('th, td')).map(texto);
      const etapa = celdas.find((t) => ETAPAS[t] || t === 'Closed Lost');
      if (id && etapa) res[id.slice(0, 15)] = etapa;
    }
    return res;
  }

  let mirandoEtapas = false;
  async function mirarEtapas() {
    if (rolDeLaPestana() !== 'ventas' || !MIRAR_ETAPAS || mirandoEtapas || CRM_CLAVE.startsWith('PEGAR') || estado() || prioridadDeOtro() || !libreParaMi()) return;
    if (Date.now() - ultimaActividad < QUIETO_MS) return; // estás usando Salesforce: se mira después
    mirandoEtapas = true;
    const volverA = location.pathname + location.search;
    const antes = pestanasAbiertas();
    let tomo = false;
    try {
      const r = await pedir('GET', CRM_OPORTUNIDADES);
      if (r.status !== 200) { log(`No pude traer las ventas a mirar: ${r.error || r.status}`); return; }
      if (!(r.ventas ?? []).length) return;
      if (!(tomo = await tomarLock())) return;
      navegar('/lightning/o/Opportunity/list?filterName=MyOpportunities');
      await esperarA(() => Object.keys(etapasDeLaLista()).length > 0, 'la lista Mis Oportunidades', 40000);
      await esperar(2500); // que terminen de cargar las filas
      const etapas = etapasDeLaLista();
      for (const v of r.ventas) {
        const vista = etapas[String(v.oportunidad).slice(0, 15)];
        const etapa = ETAPAS[vista];
        if (!etapa || etapa === v.etapa) continue; // no está en la lista, es "Closed Lost" o no cambió
        const res = await pedir('POST', CRM_OPORTUNIDADES, { contacto_id: v.contacto_id, etapa });
        log(`Oportunidad ${v.oportunidad}: ${etapa}${res.hizo && res.hizo !== 'nada' ? ` → CRM: ${res.hizo}` : ''}`);
      }
    } catch (e) {
      log(`No pude mirar las etapas: ${e.message}`);
    } finally {
      if (tomo) { await cerrarPestanasNuevas(antes); navegar(volverA); soltarLock(); }
      mirandoEtapas = false;
    }
  }

  const conTiempoLibre = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 0));
  setTimeout(() => conTiempoLibre(revisarCola), 6000);   // al cargar: si había un pedido a medias, sigue
  setInterval(() => conTiempoLibre(revisarCola), CADA_MS);
  setTimeout(() => conTiempoLibre(mirarEtapas), 90 * 1000);
  setInterval(() => conTiempoLibre(mirarEtapas), MIRAR_ETAPAS_CADA_MS);
})();
