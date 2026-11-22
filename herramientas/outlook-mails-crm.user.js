// ==UserScript==
// @name         Outlook → AsesorCRM — Mails de Swiss (altas impactadas y links de pago)
// @namespace    outlook-crm-mails
// @version      0.2
// @description  Varias veces por día busca en Outlook web los mails de Swiss "Informe de Alta … impactada" y "Pago de primera cuota" y se los manda al CRM: la venta pasa a Impactada y el link de pago queda guardado en la ficha y la planilla (NO se le manda al cliente: lo mandás vos con el botón). Solo lectura.
// @match        https://outlook.cloud.microsoft/*
// @match        https://outlook.office.com/*
// @match        https://outlook.office365.com/*
// @noframes
// @connect      asesorcrm.com.ar
// @grant        GM_xmlhttpRequest
// ==/UserScript==

// Cómo funciona (Darío, 22-nov-2026). Reemplaza al de "Links de pago" (outlook-pagos.user.js): no instales los dos.
//  · Altas impactadas: remitente afilmed@swissmedical.com.ar, asunto "Informe de Alta Total/Parcial impactada -Solicitud Nro N".
//    El script abre cada mail nuevo (solo lectura) y le manda al CRM el asunto y el texto; el CRM los lee (N° de precarga, DNI,
//    nombre, vigencia) y pasa la venta a Impactada en la planilla (la crea si no existe).
//  · Links de pago: remitente notificaciones@mails.swissmedical.com.ar, asunto "Pago de primera cuota". El botón "Pagar primera
//    cuota" es un link de seguimiento de Swiss (…/Click/Track?p=<base64 de un JSON con linkUrl>). El script lo DECODIFICA y
//    nunca lo abre (abrirlo registraría un clic). Siempre con solo_guardar: el link queda en la ficha y en la planilla y lo
//    enviás vos con el botón "Enviar link de pago".
//  · Recuerda los mails ya informados (60 días), así no repite.
//  · Outlook tiene que estar en una ventana VISIBLE (no minimizada ni en otro escritorio sin el ajuste de Chrome): si no, Chrome la frena.
//  · NO usar en la máquina de la transición de datos de Salesforce: instalalo en otra compu.

(function () {
  'use strict';

  // ═════════════════════════════════════════════════════════════
  //  CONFIGURACIÓN
  // ═════════════════════════════════════════════════════════════
  const CRM_CLAVE = 'PEGAR_ACA_TU_CLAVE_PERSONAL'; // CRM → Mi perfil → Script de Salesforce (la clave que empieza con sf_)
  const HORAS = [9, 13, 18]; // a qué horas revisa (una vez en cada una). Swiss manda las altas de madrugada
  const MAX_POR_VUELTA = 25; // mails de cada tipo por revisión

  const CRM = 'https://asesorcrm.com.ar/api/salesforce';
  const VISTOS_KEY = 'crm_mails_swiss_vistos';
  const VUELTA_KEY = 'crm_mails_swiss_vuelta';

  // ═════════════════════════════════════════════════════════════
  //  A partir de acá NO hace falta tocar nada
  // ═════════════════════════════════════════════════════════════

  const log = (m) => console.log(`[Outlook→CRM ${new Date().toLocaleTimeString('es-AR')}] ${m}`);
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
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

  function pedir(ruta, cuerpo) {
    return new Promise((resolver) => {
      GM_xmlhttpRequest({
        method: 'POST', url: `${CRM}/${ruta}`, timeout: 30000,
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

  // ── El link real del botón de pago, sin abrirlo ──
  function linkDePagoDelMail(cuerpo) {
    for (const a of cuerpo.querySelectorAll('a[href]')) {
      let url = a.href;
      const p = (url.match(/relaytrk\.mails\.swissmedical\.com\.ar\/Click\/Track\?p=([^&#]+)/i) || [])[1];
      if (p) { try { url = JSON.parse(atob(decodeURIComponent(p))).linkUrl || ''; } catch (e) { continue; } }
      if (/^https:\/\/asociarme\.swissmedical\.com\.ar\/personas\/DU\/\d+\/solicitudes\/\d+\/bienvenida/i.test(url)) return url;
    }
    return null;
  }

  // ── Buscar con el buscador de Outlook y quedarse con las filas que coinciden con el patrón ──
  async function buscar(consulta, patron) {
    const caja = await esperarA(() => document.querySelector('#topSearchInput'), 15000);
    caja.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(caja, consulta);
    caja.dispatchEvent(new Event('input', { bubbles: true }));
    await esperar(400);
    caja.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    await esperar(4000);
    return esperarA(() => {
      const filas = Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')).filter((f) => patron.test(f.getAttribute('aria-label') || ''));
      return filas.length ? filas : null;
    }, 20000).catch(() => []);
  }

  const filaPorId = (id) => Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')).find((x) => (x.getAttribute('data-convid') || x.id) === id);
  const idDeFila = (f) => f.getAttribute('data-convid') || f.id;

  // Abre el mail (en el panel de lectura, solo lectura) y devuelve el cuerpo
  async function abrirMail(id) {
    const fila = filaPorId(id);
    if (!fila) return null;
    fila.click();
    const cuerpo = await esperarA(() => { const d = document.querySelector('div[role="document"]'); return d && texto(d).length > 40 ? d : null; }, 15000).catch(() => null);
    if (cuerpo) await esperar(800);
    return cuerpo;
  }

  // ── Panel ──
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', bottom: '16px', left: '16px', zIndex: 999999, maxWidth: '360px', padding: '8px 12px', borderRadius: '10px',
    background: '#1D2B28', color: '#fff', font: '12px/1.4 sans-serif', boxShadow: '0 2px 8px rgba(0,0,0,.3)'
  });
  document.body.appendChild(panel);
  // Sin innerHTML: Outlook bloquea esa asignación (Trusted Types) y el cuadro quedaba vacío
  function mostrar(estado, avisos = []) {
    panel.textContent = '';
    const titulo = document.createElement('div');
    const negrita = document.createElement('b');
    negrita.textContent = 'Mails de Swiss → CRM';
    titulo.append(negrita, ` · ${estado}`);
    panel.appendChild(titulo);
    if (avisos.length) {
      const caja = document.createElement('div');
      caja.style.marginTop = '4px';
      caja.append('Fijate a mano:');
      for (const s of avisos) { const l = document.createElement('div'); l.textContent = `· ${s}`; caja.appendChild(l); }
      panel.appendChild(caja);
    }
    const fila = document.createElement('div');
    fila.style.marginTop = '6px';
    const boton = document.createElement('button');
    boton.textContent = 'Revisar ahora';
    Object.assign(boton.style, { border: '0', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer' });
    boton.onclick = () => revisar(true);
    fila.appendChild(boton);
    panel.appendChild(fila);
  }

  let revisando = false;
  async function revisar(aMano = false) {
    if (revisando) return;
    if (CRM_CLAVE.startsWith('PEGAR')) { mostrar('falta la clave (CRM_CLAVE)'); return; }
    revisando = true;
    mostrar('buscando mails…');
    const res = { altas: 0, altasYaEstaban: 0, pagos: 0, avisos: [], errores: 0 };
    try {
      // 1) Altas impactadas
      const altas = await buscar('Informe de Alta impactada', /informe de alta.*impactada/i);
      const vistosA = leerVistos();
      const nuevasA = [];
      for (const f of altas) { const id = idDeFila(f); if (id && !vistosA[id] && !nuevasA.some((n) => n.id === id)) nuevasA.push({ id, asunto: f.getAttribute('aria-label') || '' }); }
      log(`${altas.length} mails de alta a la vista, ${nuevasA.length} nuevos`);
      for (const { id, asunto } of nuevasA.slice(0, MAX_POR_VUELTA)) {
        const cuerpo = await abrirMail(id);
        if (!cuerpo) { res.errores++; continue; }
        const r = await pedir('alta-mail', { asunto, texto: texto(cuerpo).slice(0, 20000) });
        if (r.status === 200) {
          const x = r.resultados?.[0] ?? {};
          marcarVisto(id);
          if (x.encontrado) {
            if (x.hizo === 'ya_estaba') res.altasYaEstaban++; else res.altas++;
            if (x.hizo === 'creada') res.avisos.push(`Alta ${x.solicitud ?? ''}: no estaba en la planilla, se creó (revisala)`);
            log(`✓ Alta ${x.solicitud ?? ''} (${x.hizo})`);
          } else {
            res.avisos.push(`Alta ${x.solicitud ?? ''}: ${x.motivo === 'nombre_repetido' ? 'hay varias ventas con ese nombre, fijate a mano' : 'no la pude cruzar'}`);
          }
        } else { res.errores++; log(`✗ CRM: ${r.error || r.status}`); }
        await esperar(1500 + Math.random() * 1500);
      }

      // 2) Links de pago (solo se guardan; el envío al cliente lo hacés vos)
      const pagos = await buscar('Pago de primera cuota', /pago de primera cuota/i);
      const vistosP = leerVistos();
      const nuevasP = [];
      for (const f of pagos) { const id = idDeFila(f); if (id && !vistosP[id] && !nuevasP.some((n) => n.id === id)) nuevasP.push({ id }); }
      log(`${pagos.length} mails de primera cuota a la vista, ${nuevasP.length} nuevos`);
      for (const { id } of nuevasP.slice(0, MAX_POR_VUELTA)) {
        const cuerpo = await abrirMail(id);
        if (!cuerpo) { res.errores++; continue; }
        const link = linkDePagoDelMail(cuerpo);
        if (!link) { log('Mail sin link de pago reconocible: se saltea'); marcarVisto(id); continue; }
        const cabecera = texto(document.querySelector('[role="main"]'));
        const para = (cabecera.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []).find((m) => !/swissmedical\.com\.ar$/i.test(m)) || null;
        const cuerpoTexto = texto(cuerpo);
        const monto = (cuerpoTexto.match(/\$\s?[\d.]+,\d{2}/) || [])[0] || null;
        const vence = (cuerpoTexto.match(/hasta el (\d{2}-\d{2}-\d{4})/i) || [])[1] || null;
        const r = await pedir('pago-mail', { link, para, monto, vence, solo_guardar: true });
        if (r.status === 200) {
          marcarVisto(id);
          if (r.encontrado) { res.pagos++; log(`✓ Link de pago guardado (${r.hizo})`); }
          else { res.avisos.push(`Link de pago de ${para || 'sin mail'}: no encontré la venta en el CRM`); }
        } else { res.errores++; log(`✗ CRM: ${r.error || r.status}`); }
        await esperar(1500 + Math.random() * 1500);
      }
      // Dejar la búsqueda como estaba
      document.querySelector('#topSearchInput')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    } catch (e) {
      log(`✗ ${e.message}`);
      res.errores++;
    } finally {
      revisando = false;
      const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      mostrar(`última revisión ${hora}: ${res.altas} altas, ${res.pagos} links de pago${res.altasYaEstaban ? `, ${res.altasYaEstaban} ya estaban` : ''}${res.errores ? `, ${res.errores} con error` : ''}`,
        res.avisos);
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
