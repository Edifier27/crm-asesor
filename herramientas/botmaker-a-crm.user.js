// ==UserScript==
// @name         Botmaker → AsesorCRM
// @namespace    botmaker-kommo-dario
// @version      2.0
// @description  Botón para cargar el contacto abierto en Botmaker como lead en AsesorCRM
// @match        https://go.botmaker.com/*
// @connect      crm-asesor.vercel.app
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ═════════════════════════════════════════════════════════════
  //  CONFIGURACIÓN
  // ═════════════════════════════════════════════════════════════

  const CRM_URL   = 'https://crm-asesor.vercel.app/api/leads';
  const CRM_CLAVE = 'PEGAR_ACA_LA_LEADS_API_KEY'; // ← la misma que en el script de SGC y en Vercel (LEADS_API_KEY). No la compartas.

  // ═════════════════════════════════════════════════════════════
  //  A partir de acá no hace falta tocar nada
  // ═════════════════════════════════════════════════════════════

  if (CRM_CLAVE.startsWith('PEGAR_ACA')) {
    console.error('Botmaker→CRM: falta completar CRM_CLAVE arriba del script.');
  }

  let ultimoCliente = null; // guarda el último contacto visto en la sync de Botmaker

  // ─────────────────────────────────────────────
  // 1. Interceptar fetch/XHR en el contexto REAL de la página
  //    (unsafeWindow en vez de inyectar un <script>: Botmaker tiene una
  //     Content-Security-Policy que bloquea scripts inline)
  // ─────────────────────────────────────────────
  function inyectarInterceptor() {
    const URL_SYNC = 'sync/customers';
    const target = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    const xhrOpen = target.XMLHttpRequest.prototype.open;
    target.XMLHttpRequest.prototype.open = function (metodo, url) {
      this._botUrl = url;
      this.addEventListener('load', function () {
        if (typeof this._botUrl === 'string' && this._botUrl.includes(URL_SYNC)) {
          try {
            const data = (this.response && typeof this.response === 'object')
              ? this.response
              : JSON.parse(this.responseText);
            procesarSync(data);
          } catch (e) {}
        }
      });
      return xhrOpen.apply(this, arguments);
    };

    const fetchOriginal = target.fetch;
    target.fetch = function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      return fetchOriginal.apply(this, args).then((resp) => {
        if (url.includes(URL_SYNC)) {
          resp.clone().json().then(procesarSync).catch(() => {});
        }
        return resp;
      });
    };

    console.log('Botmaker→CRM: interceptor activo');
  }

  inyectarInterceptor();

  function procesarSync(data) {
    const lista = data && data.customers;
    if (!Array.isArray(lista) || lista.length === 0) return;
    // El último de la lista corresponde al contacto de la conversación abierta
    ultimoCliente = lista[lista.length - 1];
    actualizarBoton();
  }

  // ─────────────────────────────────────────────
  // 2. Extraer y normalizar los datos
  // ─────────────────────────────────────────────
  function extraerDatos(c) {
    const tm = c.templateMappings || {};

    let planNombre = null;
    let planPrecio = 0;
    if (tm.planSeleccionado) {
      try {
        const plan = JSON.parse(tm.planSeleccionado);
        planNombre = plan?.name || null;
        planPrecio = Math.round(parseFloat(plan?.info?.precio || 0));
      } catch (e) {}
    }

    const telDigits = (c.WHATSAPP_CURATED_NUM || '').replace(/\D/g, '');

    return {
      nombre: `${c.FIRST_NAME || ''} ${c.LAST_NAME || ''}`.trim(),
      telefono: telDigits ? `+${telDigits}` : null,
      documento: tm.docNro || tm.nroDoc || null,
      tramiteId: tm.tramiteProspecto || tm.numeroTramiteVsi || null,
      edad: tm.voEdad || null,
      provincia: tm.voProvincia || null,
      grupoFamiliar: tm.voGrupoFamiliar || null,
      tipoLaboral: tm.voTipoLaboral || null,
      planNombre,
      planPrecio,
      cola: c.QUEUE || null,
    };
  }

  // Un número argentino válido queda con 12 (fijo) o 13 (celular) dígitos
  function telefonoValido(tel) {
    if (!tel) return false;
    const digitos = tel.replace(/\D/g, '');
    if (digitos.startsWith('54')) return digitos.length === 12 || digitos.length === 13;
    return digitos.length >= 10 && digitos.length <= 15; // extranjeros
  }

  // ─────────────────────────────────────────────
  // 3. Enviar al CRM (entra como lead "asignado por Swiss Medical"; si ya existe, se suma a su chat)
  // ─────────────────────────────────────────────
  function enviarAlCrm(d) {
    const edad = parseInt(d.edad, 10);
    const detalle = [
      d.documento     ? `DNI: ${d.documento}`                 : null,
      d.grupoFamiliar ? `Cobertura: ${d.grupoFamiliar}`        : null,
      d.planNombre    ? `Plan cotizado: ${d.planNombre}${d.planPrecio ? ` ($${d.planPrecio.toLocaleString('es-AR')})` : ''}` : null,
      d.cola          ? `Cola Botmaker: ${d.cola}`             : null,
    ].filter(Boolean).join(' · ');

    const lead = {
      origen: 'swiss_medical',
      origen_detalle: `Botmaker ${d.tramiteId || ''}`.trim(),
      nombre: d.nombre,
      telefono: d.telefono,
      provincia: d.provincia,
      situacion_laboral: d.tipoLaboral,
      prepaga_interes: d.planNombre ? `Swiss Medical ${d.planNombre}` : null,
      // Solo se conoce la edad del titular; el resto del grupo lo completa el asesor
      integrantes: edad > 0 ? [{ parentesco: 'Titular', edad }] : undefined,
      mensaje: detalle || null,
    };

    GM_xmlhttpRequest({
      method: 'POST',
      url: CRM_URL,
      headers: { 'x-api-key': CRM_CLAVE, 'Content-Type': 'application/json' },
      data: JSON.stringify(lead),
      onload: (r) => {
        let resp = {};
        try { resp = JSON.parse(r.responseText); } catch (e) {}
        if (r.status >= 200 && r.status < 300) {
          avisar(resp.nuevo === false ? `✓ ${d.nombre} ya estaba: se sumó a su chat` : `✓ ${d.nombre} cargado en el CRM`, '#0a0');
        } else if (r.status === 401) {
          avisar('Clave del CRM incorrecta: revisá CRM_CLAVE en el script', '#c00');
        } else {
          avisar(`Error ${r.status}: ${resp.error || 'ver consola'}`, '#c00');
          console.error('Botmaker→CRM:', r.status, r.responseText);
        }
      },
      onerror: (e) => {
        avisar('Error de red — ver consola', '#c00');
        console.error('Botmaker→CRM:', e);
      },
    });
  }

  // ─────────────────────────────────────────────
  // 4. Interfaz
  // ─────────────────────────────────────────────
  let boton;

  function crearBoton() {
    boton = document.createElement('button');
    boton.textContent = 'Esperando conversación…';
    Object.assign(boton.style, {
      position: 'fixed', bottom: '160px', right: '24px', zIndex: 999999,
      padding: '12px 18px', border: 'none', borderRadius: '24px',
      background: '#999', color: '#fff', fontSize: '13px',
      fontFamily: 'sans-serif', cursor: 'not-allowed',
      boxShadow: '0 2px 8px rgba(0,0,0,.3)',
    });
    boton.disabled = true;

    boton.addEventListener('click', () => {
      if (!ultimoCliente) return;
      const d = extraerDatos(ultimoCliente);
      boton.disabled = true;
      boton.textContent = 'Enviando…';
      enviarAlCrm(d);
      setTimeout(actualizarBoton, 2500);
    });

    document.body.appendChild(boton);
    actualizarBoton();
  }

  function actualizarBoton() {
    if (!boton || !ultimoCliente) return;
    const d = extraerDatos(ultimoCliente);

    boton.style.cursor = 'not-allowed';
    boton.disabled = true;

    if (!d.nombre) {
      boton.style.background = '#999';
      boton.textContent = 'Sin nombre en Botmaker';
      return;
    }

    if (!telefonoValido(d.telefono)) {
      boton.style.background = '#c00';
      boton.textContent = `⚠ Teléfono inválido (${d.telefono || 'sin dato'})`;
      return;
    }

    boton.disabled = false;
    boton.style.background = '#00a884';
    boton.style.cursor = 'pointer';
    boton.textContent = `Enviar al CRM: ${d.nombre} (${d.telefono})`;
  }

  function avisar(texto, color) {
    const t = document.createElement('div');
    t.textContent = texto;
    Object.assign(t.style, {
      position: 'fixed', bottom: '220px', right: '24px', zIndex: 999999,
      padding: '10px 16px', borderRadius: '6px', background: color,
      color: '#fff', fontSize: '13px', fontFamily: 'sans-serif',
      boxShadow: '0 2px 8px rgba(0,0,0,.3)',
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  if (document.body) {
    crearBoton();
  } else {
    document.addEventListener('DOMContentLoaded', crearBoton);
  }
})();
