// ==UserScript==
// @name         Outlook → AsesorCRM — Links de pago (mail "Pago de primera cuota")
// @namespace    outlook-crm-pagos
// @version      0.1
// @description  Dos veces por día busca en Outlook web los mails de Swiss "Pago de primera cuota", saca el link de pago real del botón (sin hacer clic) y se lo manda al CRM, que se lo envía al cliente si todavía no lo tenía.
// @match        https://outlook.cloud.microsoft/*
// @match        https://outlook.office.com/*
// @match        https://outlook.office365.com/*
// @noframes
// @connect      asesorcrm.com.ar
// @grant        GM_xmlhttpRequest
// ==/UserScript==

// Cómo funciona (Darío, 9-nov-2026; relevado con Claude in Chrome):
//  · Remitente notificaciones@mails.swissmedical.com.ar, asunto "Pago de primera cuota" (o "… - Recordatorio").
//  · El botón "Pagar primera cuota" es una imagen con un link de seguimiento de Swiss:
//    https://relaytrk.mails.swissmedical.com.ar/Click/Track?p=<base64 de un JSON con linkUrl>. El script lo DECODIFICA y
//    nunca lo abre (abrirlo registraría un clic). linkUrl = …/personas/DU/<DNI>/solicitudes/<N°>/bienvenida.
//  · El "Para" es el mail del cliente: el CRM cruza por DNI y, si no, por ese mail.
//  · A las HORAS indicadas (y al tocar "Revisar ahora") busca "Pago de primera cuota", abre cada mail nuevo en el panel de
//    lectura (solo lectura) y lo informa. Recuerda los ya informados (60 días).
//  · Outlook tiene que estar en una ventana VISIBLE (como Salesforce): si está minimizada, Chrome lo frena.

(function () {
  'use strict';

  // ═════════════════════════════════════════════════════════════
  //  CONFIGURACIÓN
  // ═════════════════════════════════════════════════════════════
  const CRM_CLAVE = 'PEGAR_ACA_TU_CLAVE_PERSONAL'; // la misma clave personal del script de Ventas (Mi perfil del CRM)
  const HORAS = [10, 17];  // a qué horas revisa (una vez en cada una)
  const MAX_POR_VUELTA = 15;

  const CRM = 'https://asesorcrm.com.ar/api/salesforce/pago-mail';
  const VISTOS_KEY = 'crm_pagos_mail_vistos';
  const VUELTA_KEY = 'crm_pagos_mail_vuelta';

  // ═════════════════════════════════════════════════════════════
  //  A partir de acá NO hace falta tocar nada
  // ═════════════════════════════════════════════════════════════

  const log = (m) => console.log(`[Outlook→CRM ${new Date().toLocaleTimeString('es-AR')}] ${m}`);
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!el && el.offsetParent !== null;
  const texto = (el) => (el?.innerText || el?.textContent || '').trim();

  function esperarA(fn, ms = 20000) {
    return new Promise((ok, mal) => {
      const t0 = Date.now();
      const intentar = () => {
        let r = null;
        try { r = fn(); } catch (e) {}
        if (r) return ok(r);
        if (Date.now() - t0 > ms) return mal(new Error('timeout'));
        setTimeout(intentar, 500);
      };
      intentar();
    });
  }

  function pedir(cuerpo) {
    return new Promise((resolver) => {
      GM_xmlhttpRequest({
        method: 'POST', url: CRM, timeout: 20000,
        headers: { 'x-api-key': CRM_CLAVE, 'Content-Type': 'application/json' },
        data: JSON.stringify(cuerpo),
        onload: (r) => { let j = {}; try { j = JSON.parse(r.responseText); } catch (e) {} resolver({ status: r.status, ...j }); },
        onerror: () => resolver({ status: 0, error: 'Sin conexión con el CRM' }),
        ontimeout: () => resolver({ status: 0, error: 'El CRM no respondió' })
      });
    });
  }

  // ── Mails ya informados ──
  const leerVistos = () => { try { return JSON.parse(localStorage.getItem(VISTOS_KEY) || '{}'); } catch (e) { return {}; } };
  function marcarVisto(id) {
    const v = leerVistos();
    v[id] = Date.now();
    const limite = 60 * 24 * 3600 * 1000;
    for (const k of Object.keys(v)) if (Date.now() - v[k] > limite) delete v[k];
    localStorage.setItem(VISTOS_KEY, JSON.stringify(v));
  }

  // ── El link real del botón, sin abrirlo ──
  function linkDePagoDelMail(cuerpo) {
    for (const a of cuerpo.querySelectorAll('a[href]')) {
      let url = a.href;
      const p = (url.match(/relaytrk\.mails\.swissmedical\.com\.ar\/Click\/Track\?p=([^&#]+)/i) || [])[1];
      if (p) { try { url = JSON.parse(atob(decodeURIComponent(p))).linkUrl || ''; } catch (e) { continue; } }
      if (/^https:\/\/asociarme\.swissmedical\.com\.ar\/personas\/DU\/\d+\/solicitudes\/\d+\/bienvenida/i.test(url)) return url;
    }
    return null;
  }

  // ── Buscar "Pago de primera cuota" con el buscador de Outlook ──
  async function buscar(consulta) {
    const caja = await esperarA(() => document.querySelector('#topSearchInput'), 15000);
    caja.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(caja, consulta);
    caja.dispatchEvent(new Event('input', { bubbles: true }));
    await esperar(400);
    caja.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    await esperar(4000);
    return esperarA(() => {
      const filas = Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')).filter((f) => /pago de primera cuota/i.test(f.getAttribute('aria-label') || ''));
      return filas.length ? filas : null;
    }, 20000).catch(() => []);
  }

  // ── Panel ──
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', bottom: '16px', left: '16px', zIndex: 999999, maxWidth: '340px', padding: '8px 12px', borderRadius: '10px',
    background: '#1D2B28', color: '#fff', font: '12px/1.4 sans-serif', boxShadow: '0 2px 8px rgba(0,0,0,.3)'
  });
  document.body.appendChild(panel);
  function mostrar(estado, extra = '') {
    panel.innerHTML = `<b>Links de pago → CRM</b> · ${estado}${extra ? `<div style="margin-top:4px">${extra}</div>` : ''}
      <div style="margin-top:6px"><button id="crm-revisar-pagos" style="border:0;border-radius:6px;padding:3px 8px;cursor:pointer">Revisar ahora</button></div>`;
    panel.querySelector('#crm-revisar-pagos').onclick = () => revisar(true);
  }

  let revisando = false;
  async function revisar(aMano = false) {
    if (revisando) return;
    if (CRM_CLAVE.startsWith('PEGAR')) { mostrar('falta la clave (CRM_CLAVE)'); return; }
    revisando = true;
    mostrar('buscando mails…');
    const resultado = { informados: 0, sinVenta: [], errores: 0 };
    try {
      const filas = await buscar('Pago de primera cuota');
      const vistos = leerVistos();
      const nuevas = [];
      for (const f of filas) {
        const id = f.getAttribute('data-convid') || f.id;
        if (id && !vistos[id] && !nuevas.some((n) => n.id === id)) nuevas.push({ id, fila: f });
      }
      log(`${filas.length} mails de primera cuota a la vista, ${nuevas.length} nuevos`);
      for (const { id } of nuevas.slice(0, MAX_POR_VUELTA)) {
        // La lista se vuelve a dibujar: se busca la fila de nuevo por su id antes de abrirla
        const fila = Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')).find((x) => (x.getAttribute('data-convid') || x.id) === id);
        if (!fila) continue;
        fila.click();
        const cuerpo = await esperarA(() => { const d = document.querySelector('div[role="document"]'); return d && d.querySelector('a[href]') ? d : null; }, 15000).catch(() => null);
        if (!cuerpo) { resultado.errores++; continue; }
        await esperar(800);
        const link = linkDePagoDelMail(cuerpo);
        if (!link) { log('Mail sin link de pago reconocible: se saltea'); marcarVisto(id); continue; }
        const cabecera = texto(document.querySelector('[role="main"]'));
        const para = (cabecera.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []).find((m) => !/swissmedical\.com\.ar$/i.test(m)) || null;
        const cuerpoTexto = texto(cuerpo);
        const monto = (cuerpoTexto.match(/\$\s?[\d.]+,\d{2}/) || [])[0] || null;
        const vence = (cuerpoTexto.match(/hasta el (\d{2}-\d{2}-\d{4})/i) || [])[1] || null;
        const r = await pedir({ link, para, monto, vence });
        if (r.status === 200) {
          marcarVisto(id);
          if (r.encontrado) { resultado.informados++; log(`✓ Link de pago informado (${r.hizo})`); }
          else { resultado.sinVenta.push(`${para || 'sin mail'} · DNI …${r.dni_final ?? '?'}`); log('No encontré la venta en el CRM'); }
        } else {
          resultado.errores++;
          log(`✗ CRM: ${r.error || r.status}`);
        }
        await esperar(1500 + Math.random() * 1500);
      }
      // Dejar la búsqueda como estaba
      document.querySelector('#topSearchInput')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    } catch (e) {
      log(`✗ ${e.message}`);
      resultado.errores++;
    } finally {
      revisando = false;
      const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      mostrar(`última revisión ${hora}: ${resultado.informados} informados${resultado.errores ? `, ${resultado.errores} con error` : ''}`,
        resultado.sinVenta.length ? `Sin venta en el CRM (fijate a mano):<br>${resultado.sinVenta.map((s) => `· ${s}`).join('<br>')}` : '');
      if (!aMano) localStorage.setItem(VUELTA_KEY, vueltaActual());
    }
  }

  // Una vuelta por cada hora de HORAS: "AAAA-MM-DD-HH" de la última que tocaba
  function vueltaActual() {
    const ahora = new Date();
    const hora = [...HORAS].reverse().find((h) => ahora.getHours() >= h);
    const dia = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
    return hora === undefined ? null : `${dia}-${hora}`;
  }
  function tocaRevisar() {
    const v = vueltaActual();
    return v && localStorage.getItem(VUELTA_KEY) !== v;
  }

  mostrar('esperando la próxima revisión');
  setInterval(() => { if (!revisando && tocaRevisar()) revisar(); }, 5 * 60 * 1000);
  setTimeout(() => { if (tocaRevisar()) revisar(); }, 30 * 1000);
})();
