// ==UserScript==
// @name         SGC → AsesorCRM
// @namespace    dariobettalio
// @version      3.1
// @description  Botón para cargar el prospecto abierto en SGC como lead en AsesorCRM
// @match        https://sgc.swissmedical.com.ar/*
// @connect      asesorcrm.com.ar
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // CONFIGURACIÓN
  // ─────────────────────────────────────────────
  const CRM_URL   = 'https://asesorcrm.com.ar/api/leads';
  const CRM_CLAVE = 'PEGAR_ACA_LA_LEADS_API_KEY'; // ← la misma que está en Vercel (LEADS_API_KEY). No la compartas.

  let ultimoDetalle = null;

  // ─────────────────────────────────────────────
  // 1. Inyectar el interceptor EN LA PÁGINA (lee el detalle del prospecto que abre SGC)
  // ─────────────────────────────────────────────
  function inyectarInterceptor() {
    const codigo = function () {
      const emitir = (data) => {
        window.dispatchEvent(new CustomEvent('sgc-detalle', { detail: data }));
      };

      const xhrOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (metodo, url) {
        this._sgcUrl = url;
        this.addEventListener('load', function () {
          if (typeof this._sgcUrl === 'string' && this._sgcUrl.includes('/detalle')) {
            try { emitir(JSON.parse(this.responseText)); } catch (e) {}
          }
        });
        return xhrOpen.apply(this, arguments);
      };

      const fetchOriginal = window.fetch;
      window.fetch = function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        return fetchOriginal.apply(this, args).then((resp) => {
          if (url.includes('/detalle')) {
            resp.clone().json().then(emitir).catch(() => {});
          }
          return resp;
        });
      };

      console.log('SGC→CRM: interceptor activo');
    };

    const s = document.createElement('script');
    s.textContent = '(' + codigo.toString() + ')();';
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  }

  inyectarInterceptor();

  window.addEventListener('sgc-detalle', (e) => {
    ultimoDetalle = e.detail;
    actualizarBoton();
  });

  // ─────────────────────────────────────────────
  // 2. Extraer y normalizar los datos
  // ─────────────────────────────────────────────
  function soloPrimerNombre(nombre) {
    if (!nombre) return '';
    return nombre.trim().split(/\s+/)[0];
  }

  function armarTelefono(tel) {
    if (!tel) return null;
    const pais   = (tel.codigo_pais || '54').trim();
    const area   = (tel.codigo_nacional || '').trim().replace(/\D/g, '');
    let   numero = (tel.numero || '').trim().replace(/\D/g, '');

    if (!area || !numero) return null;

    if (pais === '54' && numero.length > 8 && numero.startsWith('15')) {
      numero = numero.slice(2);
    }

    const celular = (tel.tipo_tele || '').toLowerCase() === 'c';
    const nueve = (pais === '54' && celular) ? '9' : '';

    return `+${pais}${nueve}${area}${numero}`;
  }

  function telefonoValido(tel) {
    if (!tel) return false;
    const digitos = tel.replace(/\D/g, '');
    if (digitos.startsWith('54')) return digitos.length === 12 || digitos.length === 13;
    return digitos.length >= 10 && digitos.length <= 15;
  }

  function extraerDatos(json) {
    const ent   = json?.detalleEntidad || {};
    const etapa = json?.etapas?.[0] || {};
    const tarea = json?.detalleTarea || {};

    const integrantes = (etapa.integrantes || [])
      .filter((i) => i.edad > 0)
      .map((i) => ({ parentesco: (i.denoParen || '').trim() || 'Integrante', edad: i.edad }));

    return {
      nombre:    soloPrimerNombre(ent.nombre),
      telefono:  armarTelefono(ent.telefonos?.[0]),
      email:     ent.emails?.[0]?.denominacion?.trim() || null,
      provincia: ent.domicilio?.provincia?.trim() || null,
      procesoId: tarea.processId || null,
      canal:     etapa.canal?.descripcion || null,
      integrantes,
      valor:     etapa.forecast?.sinPonderar || 0,
    };
  }

  // ─────────────────────────────────────────────
  // 3. Enviar al CRM (entra como lead "asignado por Swiss Medical"; si ya existe, se suma a su chat)
  // ─────────────────────────────────────────────
  function enviarAlCrm(d) {
    const detalle = [
      d.canal     ? `Canal: ${d.canal}` : null,
      d.valor     ? `Valor SGC: $${Math.round(d.valor).toLocaleString('es-AR')}` : null,
    ].filter(Boolean).join(' · ');

    const lead = {
      origen: 'swiss_medical',
      origen_detalle: `SGC ${d.procesoId || ''}`.trim(),
      nombre: d.nombre,
      telefono: d.telefono,
      email: d.email,
      provincia: d.provincia,
      integrantes: d.integrantes,
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
          console.error('SGC→CRM:', r.status, r.responseText);
        }
      },
      onerror: (e) => {
        avisar('Error de red — ver consola', '#c00');
        console.error('SGC→CRM:', e);
      },
    });
  }

  // ─────────────────────────────────────────────
  // 4. Interfaz
  // ─────────────────────────────────────────────
  let boton;

  function crearBoton() {
    boton = document.createElement('button');
    boton.textContent = 'Esperando prospecto…';
    Object.assign(boton.style, {
      position: 'fixed', bottom: '160px', right: '24px', zIndex: 999999,
      padding: '12px 18px', border: 'none', borderRadius: '24px',
      background: '#999', color: '#fff', fontSize: '13px',
      fontFamily: 'sans-serif', cursor: 'not-allowed',
      boxShadow: '0 2px 8px rgba(0,0,0,.3)',
    });
    boton.disabled = true;
    boton.addEventListener('click', () => {
      if (!ultimoDetalle) return;
      const d = extraerDatos(ultimoDetalle);
      boton.disabled = true;
      boton.textContent = 'Enviando…';
      enviarAlCrm(d);
      setTimeout(actualizarBoton, 2500);
    });
    document.body.appendChild(boton);
    actualizarBoton();
  }

  function actualizarBoton() {
    if (!boton || !ultimoDetalle) return;
    const d = extraerDatos(ultimoDetalle);

    boton.style.cursor = 'not-allowed';
    boton.disabled = true;

    if (!d.nombre) {
      boton.style.background = '#999';
      boton.textContent = 'Sin nombre en SGC';
      return;
    }

    if (!d.telefono) {
      boton.style.background = '#c00';
      boton.textContent = d.email
        ? `⚠ Sin teléfono — mail: ${d.email}`
        : '⚠ Sin teléfono ni mail';
      return;
    }

    if (!telefonoValido(d.telefono)) {
      boton.style.background = '#c00';
      boton.textContent = d.email
        ? `⚠ Teléfono erróneo (${d.telefono}) — mail: ${d.email}`
        : `⚠ Teléfono erróneo (${d.telefono})`;
      return;
    }

    boton.disabled = false;
    boton.style.background = '#00A884';
    boton.style.cursor = 'pointer';
    boton.textContent = `Enviar al CRM: ${d.nombre} (${d.telefono})`;
  }

  function avisar(texto, color) {
    const t = document.createElement('div');
    t.textContent = texto;
    Object.assign(t.style, {
      position: 'fixed', bottom: '150px', right: '24px', zIndex: 999999,
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
