// ==UserScript==
// @name         Salesforce ← AsesorCRM — Pedidos de link de alta
// @namespace    sf-crm-pedidos
// @version      0.2
// @description  Trae los pedidos de "link de alta" que hacés desde la ficha del CRM y le devuelve el Link de autogestión de la Oportunidad. Versión 0.2: semiautomática (te muestra el pedido, te abre el lead y toma el link de la pantalla); los pasos dentro de Salesforce se automatizan en la próxima versión.
// @match        https://swissmedical.lightning.force.com/*
// @connect      asesorcrm.com.ar
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  // ═════════════════════════════════════════════════════════════
  //  CONFIGURACIÓN — una sola cosa: tu clave personal
  //  (en el CRM: Mi perfil → Script de Salesforce → Generar clave)
  // ═════════════════════════════════════════════════════════════
  const CRM_CLAVE = 'PEGAR_ACA_TU_CLAVE_PERSONAL';

  const CRM = 'https://asesorcrm.com.ar/api/salesforce/acciones';
  const CADA_MS = 2 * 60 * 1000; // cada cuánto pregunta si hay pedidos (2 min)

  // ═════════════════════════════════════════════════════════════
  //  A partir de acá NO hace falta tocar nada
  // ═════════════════════════════════════════════════════════════

  const log = (msg) => console.log(`[CRM→SF ${new Date().toLocaleTimeString('es-AR')}] ${msg}`);

  function pedir(metodo, url, cuerpo) {
    return new Promise((resolver) => {
      GM_xmlhttpRequest({
        method: metodo, url,
        headers: { 'x-api-key': CRM_CLAVE, 'Content-Type': 'application/json' },
        data: cuerpo ? JSON.stringify(cuerpo) : undefined,
        timeout: 20000,
        onload: (r) => { let j = {}; try { j = JSON.parse(r.responseText); } catch (e) {} resolver({ status: r.status, ...j }); },
        onerror: () => resolver({ status: 0, error: 'Sin conexión con el CRM' }),
        ontimeout: () => resolver({ status: 0, error: 'El CRM no respondió' })
      });
    });
  }

  // El id del candidato que está abierto (/lightning/r/Lead/00Q…/view)
  function idDelCandidato() {
    const m = location.href.match(/\/(00Q[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?)(?=[/?#]|$)/);
    return m ? m[1] : null;
  }

  // ── Panel en pantalla ──
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', bottom: '150px', right: '24px', zIndex: 999999, width: '320px', maxHeight: '60vh', overflow: 'auto',
    background: '#fff', border: '2px solid #0B6E5F', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,.25)',
    font: '13px/1.4 sans-serif', color: '#1D2B28', padding: '10px 12px', display: 'none'
  });
  document.body.appendChild(panel);

  const texto = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const edades = (d) => (d.integrantes ?? []).map((i) => `${i.parentesco ?? 'integrante'} ${i.edad ?? '?'}`).join(', ') || 'sin edades';

  function dibujar(acciones) {
    if (!acciones.length) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    panel.innerHTML = `<b style="color:#0B6E5F">Pedidos del CRM (${acciones.length})</b>` + acciones.map((a) => {
      const d = a.datos ?? {};
      return `<div data-id="${a.id}" style="border-top:1px solid #E2DDD4;margin-top:8px;padding-top:8px">
        <b>${texto(d.nombre ?? 'Sin nombre')}</b> · ${a.tipo === 'cargar_nuevo' ? 'cargar como lead nuevo' : 'ya está en Salesforce'}<br>
        Tel ${texto(d.telefono_local ?? d.telefono)} · DNI ${texto(d.dni)}<br>
        Plan <b>${texto(d.plan)}</b> · ${texto(d.tipo_venta)} · ${texto(d.zona)}${d.localidad ? ` (${texto(d.localidad)})` : ''}<br>
        ${texto(edades(d))}${d.sueldos?.length ? ` · sueldo ${texto(d.sueldos.join(' + '))}` : ''}<br>
        <button data-accion="abrir" style="margin-top:6px">${d.salesforce_id ? 'Abrir el lead' : 'Copiar teléfono para buscarlo'}</button>
        <div style="margin-top:6px">Link de autogestión: <input data-campo="link" placeholder="https://asociarme…" style="width:100%"></div>
        <button data-accion="leer" style="margin-top:4px">Tomar el link de esta pantalla</button>
        <div style="margin-top:6px">N° de trámite (opcional): <input data-campo="tramite" inputmode="numeric" style="width:110px"></div>
        <button data-accion="listo" style="margin-top:6px;background:#0B6E5F;color:#fff;border:0;border-radius:6px;padding:4px 10px">Listo: mandar al CRM</button>
        <button data-accion="error" style="margin-top:6px">No se pudo</button>
      </div>`;
    }).join('');
    panel.querySelectorAll('[data-id]').forEach((caja) => {
      const accion = acciones.find((a) => a.id === caja.dataset.id);
      caja.querySelector('[data-accion="abrir"]').onclick = () => abrir(accion);
      caja.querySelector('[data-accion="leer"]').onclick = () => {
        const link = linkEnPantalla();
        if (link) caja.querySelector('[data-campo="link"]').value = link;
        else alert('No veo un link de autogestión en esta pantalla: abrí la Oportunidad y tocá "Generar Link Autogestión".');
      };
      caja.querySelector('[data-accion="listo"]').onclick = () => terminar(accion, caja.querySelector('[data-campo="link"]').value, caja.querySelector('[data-campo="tramite"]').value);
      caja.querySelector('[data-accion="error"]').onclick = () => fallar(accion);
    });
  }

  async function tomar(accion) {
    if (accion.estado === 'en_curso') return true;
    const r = await pedir('PATCH', `${CRM}/${accion.id}`, { estado: 'en_curso' });
    if (r.status === 200) { accion.estado = 'en_curso'; return true; }
    alert(r.error || 'No se pudo tomar el pedido');
    return false;
  }

  async function abrir(accion) {
    if (!(await tomar(accion))) return;
    const d = accion.datos ?? {};
    if (d.salesforce_id) { location.assign(`/lightning/r/Lead/${d.salesforce_id}/view`); return; }
    try { await navigator.clipboard.writeText(d.telefono_local ?? d.telefono ?? ''); } catch (e) {}
    alert(accion.tipo === 'cargar_nuevo'
      ? 'Este lead no vino de Salesforce: cargalo como candidato nuevo con los datos del cuadro (te copié el teléfono).'
      : 'Te copié el teléfono: pegalo en el buscador de Salesforce para encontrar el lead.');
  }

  // El "Link de autogestión" de la Oportunidad (campo con ese nombre, o el cartel de "Generar Link Autogestión")
  function linkEnPantalla() {
    const buscar = (raiz) => {
      for (const a of raiz.querySelectorAll('a[href*="asociarme."]')) if (/^https:\/\/asociarme\.(swissmedical|clubswiss)\.com\.ar\//i.test(a.href)) return a.href;
      for (const el of raiz.querySelectorAll('*')) if (el.shadowRoot) { const l = buscar(el.shadowRoot); if (l) return l; }
      return null;
    };
    return buscar(document);
  }

  async function terminar(accion, link, tramite) {
    const url = String(link ?? '').trim();
    if (!/^https:\/\/asociarme\.(swissmedical|clubswiss)\.com\.ar\//i.test(url)) { alert('Pegá el Link de autogestión (empieza con https://asociarme…).'); return; }
    if (!(await tomar(accion))) return;
    const r = await pedir('PATCH', `${CRM}/${accion.id}`, { estado: 'listo', link: url, precarga: String(tramite ?? '').replace(/\D/g, '') || null, salesforce_id: idDelCandidato() });
    if (r.status === 200) { log(`✓ Link de ${accion.datos?.nombre} enviado al CRM`); revisar(); }
    else alert(r.error || `Error ${r.status}`);
  }

  async function fallar(accion) {
    const motivo = prompt('¿Qué pasó? (le llega al CRM para que lo hagas a mano)');
    if (motivo === null) return;
    const r = await pedir('PATCH', `${CRM}/${accion.id}`, { estado: 'error', error: motivo || 'sin detalle' });
    if (r.status === 200) revisar(); else alert(r.error || `Error ${r.status}`);
  }

  let ultimo = '';
  async function revisar() {
    if (CRM_CLAVE.startsWith('PEGAR')) { log('Falta la clave: pegala en CRM_CLAVE'); return; }
    const r = await pedir('GET', CRM);
    if (r.status === 401) { log('Clave incorrecta: generá una nueva en Mi perfil del CRM'); return; }
    if (r.status !== 200) { log(`No pude consultar el CRM: ${r.error || r.status}`); return; }
    const acciones = r.acciones ?? [];
    // Solo se redibuja si cambió (no borra lo que estás escribiendo)
    const firma = acciones.map((a) => `${a.id}:${a.estado}`).join(',');
    if (firma !== ultimo) { ultimo = firma; dibujar(acciones); }
  }

  // Sin trabar la página (mismo criterio que el script de los leads: no interferir con OmniCanal)
  const conTiempoLibre = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 0));
  setTimeout(() => conTiempoLibre(revisar), 5000);
  setInterval(() => conTiempoLibre(revisar), CADA_MS);
})();
