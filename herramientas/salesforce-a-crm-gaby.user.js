// ==UserScript==
// @name         Salesforce → AsesorCRM (Gabriela Lazarte) — Automático CRM
// @namespace    sf-crm-gabriela
// @version      3.4
// @description  Automático con reintentos ante cortes de red, pausas variables, anti-duplicado, chequeo de pestaña activa, auto-refresco de la lista. Envía el lead al CRM de Gabriela (antes Kommo)
// @match        https://swissmedical.lightning.force.com/*
// @connect      asesorcrm.com.ar
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  // ═════════════════════════════════════════════════════════════
  //  CONFIGURACIÓN — cuenta de Gabriela Lazarte
  // ═════════════════════════════════════════════════════════════

  const CRM_URL   = 'https://asesorcrm.com.ar/api/leads';
  const CRM_CLAVE = 'PEGAR_ACA_LA_LEADS_API_KEY'; // ← la misma LEADS_API_KEY de los otros scripts. No la compartas.
  const ASESOR    = 'gabriela.lazarte@gmail.com';  // el lead entra al CRM de esta asesora

  const INTERVALO_REVISION_MS = 2000;
  const RETARDO_MIN_MS = 20000;
  const RETARDO_MAX_MS = 35000;
  const INTENTOS_POR_PASO = 3;       // cuántas veces reintenta esperar un elemento antes de rendirse
  const PAUSA_ENTRE_REINTENTOS_MS = 5000;

  // NUEVO: cada cuánto se aprieta el botón "Actualizar" de la lista (1:30hs aprox.)
  const REFRESCAR_INTERVALO_MS = 90 * 60 * 1000;

  // ═════════════════════════════════════════════════════════════
  //  A partir de acá NO hace falta tocar nada
  // ═════════════════════════════════════════════════════════════

  function retardoAleatorio() {
    return Math.floor(Math.random() * (RETARDO_MAX_MS - RETARDO_MIN_MS + 1)) + RETARDO_MIN_MS;
  }

  function log(msg) {
    const hora = new Date().toLocaleTimeString('es-AR');
    console.log(`[SF→CRM ${hora}] ${msg}`);
  }

  function buscarEnTodoElDOM(selector, raiz = document) {
    let encontrados = [];
    try {
      encontrados = Array.from(raiz.querySelectorAll(selector));
    } catch (e) {}
    const todos = raiz.querySelectorAll('*');
    for (const el of todos) {
      if (el.shadowRoot) {
        encontrados = encontrados.concat(buscarEnTodoElDOM(selector, el.shadowRoot));
      }
    }
    return encontrados;
  }

  function buscarUnoEnTodoElDOM(selector, raiz = document) {
    return buscarEnTodoElDOM(selector, raiz)[0] || null;
  }

  function buscarUnoVisibleEnTodoElDOM(selector, raiz = document) {
    const todos = buscarEnTodoElDOM(selector, raiz);
    return todos.find((el) => el.offsetParent !== null) || todos[0] || null;
  }

  function buscarBotonCerrarPorNombre(nombre) {
    const botones = buscarEnTodoElDOM('button[title^="Cerrar "]');
    return botones.find((b) => (b.getAttribute('title') || '').includes(nombre)) || null;
  }

  function buscarBotonPorTexto(texto, claseParcial) {
    const candidatos = buscarEnTodoElDOM('button');
    return candidatos.find((b) => {
      const t = (b.textContent || '').trim();
      const claseOk = !claseParcial || (b.className || '').includes(claseParcial);
      return t === texto && claseOk && b.offsetParent !== null;
    }) || null;
  }

  function textoProfundo(el) {
    if (!el) return '';
    let texto = (el.textContent || '').trim();
    if (!texto) {
      if (el.shadowRoot) {
        texto = textoProfundo(el.shadowRoot);
      }
      if (!texto) {
        const hijos = el.querySelectorAll('*');
        for (const hijo of hijos) {
          if (hijo.shadowRoot) {
            const t = textoProfundo(hijo.shadowRoot);
            if (t) { texto = t; break; }
          }
        }
      }
    }
    return texto.trim();
  }

  function leerCampoPorEtiqueta(etiquetas) {
    const labels = buscarEnTodoElDOM('.test-id__field-label');
    for (const label of labels) {
      const texto = (label.textContent || '').trim().toLowerCase();
      if (etiquetas.some((e) => texto === e.toLowerCase())) {
        let contenedor = label.parentElement;
        for (let i = 0; i < 4 && contenedor; i++) {
          const valor = contenedor.querySelector('.test-id__field-value');
          if (valor) return valor;
          contenedor = contenedor.parentElement;
        }
      }
    }
    return null;
  }

  function armarTelefono(raw) {
    if (!raw) return null;
    let d = raw.replace(/\D/g, '');
    if (!d) return null;
    if (d.startsWith('549')) return '+' + d;
    if (d.startsWith('54'))  return '+' + d;
    if (d.startsWith('15')) d = d.slice(2);
    return '+549' + d;
  }

  function telefonoValido(tel) {
    if (!tel) return false;
    const d = tel.replace(/\D/g, '');
    if (d.startsWith('54')) return d.length === 12 || d.length === 13;
    return d.length >= 10 && d.length <= 15;
  }

  // NUEVO: extrae solo el primer nombre de un nombre completo.
  function primerNombre(nombreCompleto) {
    return (nombreCompleto || '').trim().split(/\s+/)[0] || '';
  }

  function extraerDatos() {
    let nombre = '';
    const nameEl = buscarUnoEnTodoElDOM('lightning-formatted-name[slot="output"]');
    if (nameEl) {
      nombre = textoProfundo(nameEl);
    } else {
      const nom = leerCampoPorEtiqueta(['Nombre', 'First Name', 'Nombre completo']);
      const ape = leerCampoPorEtiqueta(['Apellido', 'Last Name']);
      nombre = [textoProfundo(nom), textoProfundo(ape)].filter(Boolean).join(' ');
    }
    if (!nombre) {
      const tituloPagina = (document.title.split('|')[0] || '').trim();
      if (tituloPagina) nombre = tituloPagina;
    }

    let telRaw = '';
    const telLink = buscarUnoVisibleEnTodoElDOM('a[href^="tel:"]');
    if (telLink) {
      telRaw = telLink.getAttribute('href').replace('tel:', '');
    } else {
      const telCampo = leerCampoPorEtiqueta(['Teléfono', 'Telefono', 'Phone', 'Celular', 'Móvil', 'Movil', 'Mobile']);
      telRaw = telCampo ? textoProfundo(telCampo) : '';
    }

    let email = '';
    const mailLink = buscarUnoVisibleEnTodoElDOM('a[href^="mailto:"]');
    if (mailLink) {
      email = mailLink.getAttribute('href').replace('mailto:', '');
    } else {
      const mailCampo = leerCampoPorEtiqueta(['Correo electrónico', 'Correo', 'Email', 'E-mail']);
      email = mailCampo ? textoProfundo(mailCampo) : '';
    }

    const tituloActual = (document.title.split('|')[0] || '').trim();
    if (tituloActual && nombre && !nombre.includes(tituloActual) && !tituloActual.includes(nombre)) {
      log(`⚠️ POSIBLE PESTAÑA EQUIVOCADA: nombre extraído "${nombre}" no coincide con el título de la pestaña activa "${tituloActual}"`);
      avisar(`⚠️ Revisar: agarré "${nombre}" pero la pestaña activa dice "${tituloActual}"`, '#e67300');
    }

    return {
      nombre: nombre,
      telefono: armarTelefono(telRaw),
      email: email || null,
    };
  }

  function yaFueEnviado(telefono) {
    if (!telefono) return false;
    try {
      const registro = JSON.parse(localStorage.getItem('sfKommoEnviados') || '{}');
      return !!registro[telefono];
    } catch (e) { return false; }
  }

  function marcarComoEnviado(telefono) {
    if (!telefono) return;
    try {
      const registro = JSON.parse(localStorage.getItem('sfKommoEnviados') || '{}');
      registro[telefono] = Date.now();
      const LIMITE = 7 * 24 * 60 * 60 * 1000;
      for (const k in registro) {
        if (Date.now() - registro[k] > LIMITE) delete registro[k];
      }
      localStorage.setItem('sfKommoEnviados', JSON.stringify(registro));
    } catch (e) {}
  }

  // ÚNICO CAMBIO de lógica: el lead va al CRM de Gabriela en vez de a Kommo (sin saludo automático)
  function enviarAlCrm(d) {
    const lead = {
      asesor: ASESOR,
      origen: 'swiss_medical',
      origen_detalle: 'Salesforce',
      nombre: primerNombre(d.nombre),
      telefono: d.telefono,
      email: d.email,
      enviarBienvenida: false,
    };

    log(`Enviando al CRM: ${d.nombre} / ${d.telefono}`);

    GM_xmlhttpRequest({
      method: 'POST',
      url: CRM_URL,
      headers: { 'x-api-key': CRM_CLAVE, 'Content-Type': 'application/json' },
      data: JSON.stringify(lead),
      onload: (r) => {
        let resp = {};
        try { resp = JSON.parse(r.responseText); } catch (e) {}
        if (r.status >= 200 && r.status < 300) {
          log(`✓ CRM respondió OK para ${d.nombre}${resp.nuevo === false ? ' (ya estaba: se sumó a su chat)' : ''}`);
          avisar(`✓ ${d.nombre} cargado en el CRM`, '#0a0');
        } else if (r.status === 401) {
          log(`✗ CRM 401 para ${d.nombre}: ${r.responseText}`);
          avisar('Clave del CRM incorrecta: revisá CRM_CLAVE en el script', '#c00');
        } else {
          log(`✗ CRM error ${r.status} para ${d.nombre}: ${r.responseText}`);
          avisar(`Error ${r.status}: ${resp.error || 'ver consola'}`, '#c00');
        }
      },
      onerror: (e) => {
        log(`✗ Error de red enviando ${d.nombre}: ${JSON.stringify(e)}`);
        avisar('Error de red — ver consola', '#c00');
      },
    });
  }

  function avisar(texto, color) {
    const t = document.createElement('div');
    t.textContent = texto;
    Object.assign(t.style, {
      position: 'fixed', bottom: '150px', right: '24px', zIndex: 999999,
      padding: '10px 16px', borderRadius: '6px', background: color,
      color: '#fff', fontSize: '13px', fontFamily: 'sans-serif',
      boxShadow: '0 2px 8px rgba(0,0,0,.3)', maxWidth: '320px',
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 6000);
  }

  function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function esperarElemento(buscarFn, timeoutMs = 15000, intervaloMs = 400) {
    return new Promise((resolve, reject) => {
      const inicio = Date.now();
      const intentar = () => {
        const el = buscarFn();
        if (el) return resolve(el);
        if (Date.now() - inicio > timeoutMs) return reject(new Error('Timeout esperando elemento'));
        setTimeout(intentar, intervaloMs);
      };
      intentar();
    });
  }

  // Reintenta la ESPERA (nunca vuelve a clickear nada) — pensado para
  // sobrevivir cortes de red pasajeros sin arriesgar acciones duplicadas.
  async function esperarElementoConReintento(buscarFn, descripcion, timeoutMs = 15000, intentos = INTENTOS_POR_PASO) {
    for (let intento = 1; intento <= intentos; intento++) {
      try {
        return await esperarElemento(buscarFn, timeoutMs);
      } catch (err) {
        if (intento === intentos) throw err;
        log(`⚠️ Timeout esperando "${descripcion}" (intento ${intento}/${intentos}) — puede ser un corte de red. Reintentando…`);
        avisar(`⚠️ Se trabó esperando "${descripcion}" — reintentando (${intento}/${intentos})`, '#e67300');
        await esperar(PAUSA_ENTRE_REINTENTOS_MS);
      }
    }
  }

  // NUEVO: clickea el botón "Actualizar" (refreshButton) de la lista de Candidatos.
  function refrescarLista() {
    const boton = buscarUnoVisibleEnTodoElDOM('button[name="refreshButton"]');
    if (boton) {
      boton.click();
      log('🔄 Lista actualizada (click automático en "Actualizar")');
    } else {
      log('⚠️ No encontré el botón "Actualizar" para refrescar la lista');
    }
  }

  // NUEVO: ejecuta fn cuando el navegador tenga un ratito libre, en vez de
  // forzarlo en medio de un momento ocupado — evita bloquear el hilo principal
  // y así no interferir con la conexión persistente de OmniCanal.
  function conTiempoLibre(fn, timeoutMs = 500) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(fn, { timeout: timeoutMs });
    } else {
      setTimeout(fn, 0);
    }
  }

  let procesando = false;
  let indicador;

  function crearIndicador() {
    indicador = document.createElement('div');
    indicador.textContent = 'Auto ON — esperando leads…';
    Object.assign(indicador.style, {
      position: 'fixed', bottom: '90px', right: '24px', zIndex: 999999,
      padding: '10px 16px', borderRadius: '20px',
      background: '#0a0', color: '#fff', fontSize: '12px',
      fontFamily: 'sans-serif', boxShadow: '0 2px 8px rgba(0,0,0,.3)',
    });
    document.body.appendChild(indicador);
  }

  function marcarPaso(texto) {
    indicador.textContent = texto;
    log(texto);
    avisar(texto, '#0074d9');
  }

  async function procesarSiguienteLead() {
    if (procesando) return;
    const btnAceptar = buscarUnoVisibleEnTodoElDOM('button[title="Aceptar"]');
    if (!btnAceptar) return;

    procesando = true;
    indicador.style.background = '#0074d9';
    log('=== INICIO procesamiento de lead ===');

    try {
      marcarPaso('Paso 1/7: aceptando lead…');
      btnAceptar.click();
      await esperar(retardoAleatorio());

      marcarPaso('Paso 2/7: esperando pantalla del candidato…');
      await esperarElementoConReintento(
        () => buscarUnoVisibleEnTodoElDOM('button[title="Registrar una llamada"]'),
        'pantalla del candidato', 25000
      );
      await esperar(retardoAleatorio());

      marcarPaso('Paso 3/7: registrando llamada…');
      const btnLlamada = buscarUnoVisibleEnTodoElDOM('button[title="Registrar una llamada"]');
      btnLlamada.click();
      const btnGuardar = await esperarElementoConReintento(
        () => buscarUnoVisibleEnTodoElDOM('.cuf-publisherShareButton'),
        'botón Guardar de la llamada', 15000
      );
      await esperar(retardoAleatorio());
      btnGuardar.click();
      await esperar(retardoAleatorio());

      marcarPaso('Paso 4/7: marcando "Esperando Respuesta"…');
      const btnEsperando = await esperarElementoConReintento(() => {
        const b = buscarUnoVisibleEnTodoElDOM('button[name="Lead.Esperando_Respuesta"]');
        return (b && b.getAttribute('aria-disabled') !== 'true') ? b : null;
      }, 'botón Esperando Respuesta', 15000);
      btnEsperando.click();
      await esperar(retardoAleatorio());

      marcarPaso('Paso 5/7: confirmando en el modal ("Siguiente")…');
      const btnSiguiente = await esperarElementoConReintento(
        () => buscarBotonPorTexto('Siguiente', 'slds-button_brand'),
        'botón Siguiente del modal', 10000
      );
      btnSiguiente.click();
      await esperar(retardoAleatorio());

      marcarPaso('Paso 6/7: leyendo datos del candidato…');
      const d = extraerDatos();
      log(`Datos extraídos: nombre="${d.nombre}" tel="${d.telefono}" email="${d.email}" | pestaña activa (título): "${document.title}"`);

      if (!d.nombre) {
        avisar('No encuentro el nombre — revisá este lead a mano', '#c00');
      } else if (!d.telefono) {
        avisar(d.email ? `Sin teléfono — mail: ${d.email} — revisá a mano` : 'Sin teléfono ni mail — revisá a mano', '#c00');
      } else if (yaFueEnviado(d.telefono)) {
        log(`⚠️ ${d.telefono} ya estaba marcado como enviado — NO lo mando de nuevo`);
        avisar(`⚠️ ${d.nombre} (${d.telefono}) ya se había enviado antes — no lo repito`, '#e67300');
      } else {
        if (!telefonoValido(d.telefono)) {
          avisar(`Teléfono dudoso: ${d.telefono} — revisá`, '#e67300');
        }
        marcarPaso('Paso 7/7: enviando al CRM y cerrando pestaña…');
        enviarAlCrm(d);
        marcarComoEnviado(d.telefono);

        await esperar(retardoAleatorio());
        const btnCerrar = buscarBotonCerrarPorNombre(d.nombre);
        if (btnCerrar) {
          btnCerrar.click();
          log(`Pestaña de ${d.nombre} cerrada.`);
        } else {
          log(`⚠️ NO encontré el botón de cerrar pestaña para "${d.nombre}" — quedó abierta`);
          avisar(`⚠️ No pude cerrar la pestaña de ${d.nombre} — cerrala a mano`, '#e67300');
        }
      }
      log('=== FIN procesamiento de lead ===');
    } catch (err) {
      log(`✗ ERROR (tras ${INTENTOS_POR_PASO} intentos): ${err.message}`);
      console.error('SF→CRM automático — detalle del error:', err);
      avisar(`Error en la automatización tras varios intentos: ${err.message} — revisá este lead a mano`, '#c00');
    } finally {
      procesando = false;
      indicador.textContent = 'Auto ON — esperando leads…';
      indicador.style.background = '#0a0';
    }
  }

  crearIndicador();
  setInterval(() => conTiempoLibre(procesarSiguienteLead), INTERVALO_REVISION_MS);
  setInterval(() => conTiempoLibre(refrescarLista), REFRESCAR_INTERVALO_MS);
})();
