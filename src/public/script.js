// ====== CONFIG ======
// ⚠️ DEMO: no subas tu token real al frontend en producción.
const API_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6Inhpb21hcmF2ZXJhcGVyZXoyNkBnbWFpbC5jb20ifQ.4xtw1x9_oL0eTFr3M50L-gUlFZMDL_eB2mFhmCUWo4E";
const BASE_URL = "https://dniruc.apisperu.com/api/v1";

// ====== ESTADO GLOBAL ======
let clienteVerificado = null;
let prestamosRegistrados = [];
let prestamoActualParaCronograma = null;

let tipoConsulta = 'dni';
let loanFilter = 'all';
let loanQuery  = '';
let searchDebounce;

// ====== BIND DE ELEMENTOS ======
function bindRefs(){
  const ids = [
    // verificación
    'btnDni','btnRuc','dniSection','rucSection','dni','ruc','btnVerificar','btnText','loadingSpinner',
    'notification','customerInfo','nombreCliente','documentoCliente','tipoCliente','direccionCliente','estadoCliente','origenBadge',
    // registro préstamo
    'monto','interes','plazo','moraDiaria','analista','caja','correo','celular','celularError','fechaInicio',
    'interesCalculado','fechaCalculada','primeraCuota','montoPrestado','tasaInteres','interesTotal','montoTotalPagar',
    'fechaDesembolsoMostrada','fechaPrimeraCuotaMostrada','fechaUltimaCuotaMostrada','fechaPrimeraCuota','montoPrimeraCuota',
    // listados
    'totalPrestamos','loansList','loanSearchInput','fltAll','fltAct','fltCan',
    // modal cronograma
    'cronogramaModal','cronogramaClienteModal','cronogramaDocumentoModal','cronogramaDetallesModal','cronogramaBodyModal',
    'totalAmortizacionModal','totalInteresModal','totalCuotaModal','saldoFinalModal','fechaPagoInput','moraEditableInput',
    'montoAbonoCapital','proximaInfoTexto','historialPagosBody',
    // modal manual
    'modalManual','manualTipo','manualDocumento','manualNombre','manualDireccion'
  ];
  ids.forEach(id => window[id] = document.getElementById(id));
}

// ====== INIT ======
document.addEventListener('DOMContentLoaded', () => {
  bindRefs();

  const today = new Date().toISOString().split('T')[0];
  fechaInicio.value = today;
  fechaInicio.min   = today;

  cargarPrestamosDesdeAPI();

  actualizarCalculos();

  // recalcular en tiempo real
  ['monto','interes','plazo','fechaInicio'].forEach(id=>{
    const el = document.getElementById(id);
    el.addEventListener(id==='fechaInicio'?'change':'input', actualizarCalculos);
  });

  // búsqueda
  if (loanSearchInput) {
    loanSearchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        loanQuery = (loanSearchInput.value || '').trim().toLowerCase();
        actualizarListaPrestamos();
      }, 200);
    });
  }
});

async function cargarPrestamosDesdeAPI() {
  try {
    const response = await fetch('/api/prestamos');
    if (!response.ok) {
      throw new Error('No se pudieron cargar los préstamos');
    }
    const prestamosDesdeDB = await response.json();
    
    // Mapeamos los nombres de la BD a los que usa el frontend
    prestamosRegistrados = prestamosDesdeDB.map(p => ({
        id: p.id_prestamo,
        nroPrestamo: p.nro_prestamo,
        analista: p.analista,
        cliente: p.cliente,
        documento: p.documento,
        fechaDesembolso: p.fecha_desembolso.split('T')[0], // Limpiamos la fecha
        monto: parseFloat(p.saldo_capital_actual),
        montoOriginal: parseFloat(p.monto_original),
        interes: parseFloat(p.tasa_interes_anual),
        plazo: p.plazo_meses,
        cuotaMensual: parseFloat(p.cuota_mensual_calculada),
        moraDiaria: parseFloat(p.mora_diaria_pct),
        cuotasPagadas: p.cuotas_pagadas,
        cancelado: p.cancelado,
        fechaCancelacion: p.fecha_cancelacion ? p.fecha_cancelacion.split('T')[0] : null,
        correo: p.correo,
        celular: p.celular,
        // Datos que no vienen de la BD pero el frontend necesita
        fechaRegistro: new Date(p.fecha_desembolso).toLocaleDateString('es-PE'),
        fechaPrimeraCuota: sumarMeses(p.fecha_desembolso.split('T')[0], 1),
        fechaUltimaCuota: sumarMeses(p.fecha_desembolso.split('T')[0], p.plazo_meses),
        pagos: [], // Esto requerirá una llamada a la API para cargar el historial de pagos
    }));
    
    actualizarListaPrestamos();
  } catch (error) {
    console.error('Error:', error);
    mostrarNotificacion(error.message, 'error');
  }
}

// ====== HELPERS UI ======
function mostrarNotificacion(msg, type='info'){
  notification.textContent = msg;
  notification.className   = `notification ${type}`;
  notification.classList.remove('hidden');
  setTimeout(() => notification.classList.add('hidden'), 5000);
}
function mostrarCargando(s){
  btnText.classList.toggle('hidden', s);
  loadingSpinner.classList.toggle('hidden', !s);
  btnVerificar.disabled = s;
}
function cambiarTipoConsulta(tipo){
  tipoConsulta = tipo;
  btnDni.classList.toggle('active', tipo==='dni');
  btnRuc.classList.toggle('active', tipo==='ruc');
  dniSection.classList.toggle('hidden', tipo!=='dni');
  rucSection.classList.toggle('hidden', tipo!=='ruc');
  (tipo==='dni' ? dni : ruc).value = '';
  limpiarResultadoVerificacion();
}

// ====== VERIFICACIÓN API DNI/RUC ======
async function verificarCliente(){
  const valor = (tipoConsulta==='dni' ? dni.value.trim() : ruc.value.trim());
  if (!valor) return mostrarNotificacion(`Ingrese ${tipoConsulta.toUpperCase()} válido`,'error');
  if (tipoConsulta==='dni' && (valor.length!==8 || isNaN(valor)))  return mostrarNotificacion('DNI debe tener 8 dígitos','error');
  if (tipoConsulta==='ruc' && (valor.length!==11|| isNaN(valor)))  return mostrarNotificacion('RUC debe tener 11 dígitos','error');

  mostrarCargando(true);
  mostrarNotificacion('Consultando con RENIEC/SUNAT...','info');
  try{
    const res = await fetch(`${BASE_URL}/${tipoConsulta}/${valor}?token=${API_TOKEN}`);
    if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (tipoConsulta==='dni'){
      const dniStr = String(data.dni ?? valor).padStart(8,'0');
      const partes = [data.nombres, data.apellidoPaterno, data.apellidoMaterno].filter(Boolean);
      const nombre = (partes.length?partes.join(' '):'Sin nombres').trim();
      clienteVerificado = {
        nombre, documento: dniStr, tipo: 'Persona Natural',
        direccion: data.direccion || 'No disponible', estado: data.estado || 'Activo', origen:'api'
      };
    } else {
      const rucStr = String(data.ruc ?? valor).padStart(11,'0');
      const nombre = (data.razonSocial || data.nombre || data.nombreComercial || 'Sin razón social').trim();
      clienteVerificado = {
        nombre, documento: rucStr, tipo: (data.tipo==='NATURAL'?'Persona Natural':'Persona Jurídica'),
        direccion: data.direccion || 'No disponible', estado: data.estado || 'Activo', origen:'api'
      };
    }
    mostrarResultadoVerificacion();
    mostrarNotificacion('Cliente verificado correctamente','success');
  }catch(e){
    clienteVerificado=null;
    limpiarResultadoVerificacion();
    mostrarNotificacion(`Error al consultar: ${e.message}`,'error');
  }finally{
    mostrarCargando(false);
  }
}
function mostrarResultadoVerificacion(){
  if (!clienteVerificado) return;
  nombreCliente.textContent    = clienteVerificado.nombre;
  documentoCliente.textContent = clienteVerificado.documento;
  tipoCliente.textContent      = clienteVerificado.tipo;
  direccionCliente.textContent = clienteVerificado.direccion;
  estadoCliente.textContent    = clienteVerificado.estado;
  origenBadge.style.display    = clienteVerificado.origen==='manual' ? 'block' : 'none';
  customerInfo.classList.remove('hidden');
  btnRegistrar.disabled = false;
}
function limpiarResultadoVerificacion(){
  customerInfo.classList.add('hidden');
  btnRegistrar.disabled = true;
}

// ====== REGISTRO MANUAL ======
function abrirModalManual(){
  modalManual.style.display='block';
  manualDocumento.value=''; manualNombre.value=''; manualDireccion.value='';
}
function cerrarModalManual(){ modalManual.style.display='none'; }
window.addEventListener('click', e=>{ if(e.target===modalManual) cerrarModalManual(); });

function registrarClienteManual(){
  const tipoDoc = manualTipo.value;
  const doc     = manualDocumento.value.trim();
  const nombre  = manualNombre.value.trim();
  const dir     = manualDireccion.value.trim() || 'No disponible';

  if (!nombre || !doc) return mostrarNotificacion('Complete nombre y número de documento','error');
  if (tipoDoc==='DNI' && (doc.length!==8 || isNaN(doc))) return mostrarNotificacion('DNI debe tener 8 dígitos','error');
  if (tipoDoc==='RUC' && (doc.length!==11|| isNaN(doc))) return mostrarNotificacion('RUC debe tener 11 dígitos','error');

  clienteVerificado = {
    nombre, documento: doc, tipo: (tipoDoc==='DNI'?'Persona Natural':'Persona Jurídica'),
    direccion: dir, estado: 'Activo', origen:'manual'
  };
  mostrarResultadoVerificacion();
  cerrarModalManual();
  mostrarNotificacion('Cliente cargado manualmente','success');
}

// ====== UTILIDADES FECHA / NÚMEROS ======
function sumarMeses(iso,meses){ const d=new Date(iso+'T00:00:00'); d.setMonth(d.getMonth()+meses); return d.toISOString().split('T')[0]; }
function formatearFechaParaTabla(iso){ const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function formatearFechaParaCronograma(iso){ const f=new Date(iso+'T00:00:00'); return f.toLocaleDateString('es-PE',{year:'numeric',month:'long',day:'numeric'}); }
function calcularCuotaFija(M,iA,pl){ const i=iA/100/12; if(i===0) return M/pl; return M*(i*Math.pow(1+i,pl))/(Math.pow(1+i,pl)-1); }
function diffDias(a,b){ const d1=new Date(a+'T00:00:00'),d2=new Date(b+'T00:00:00'); return Math.floor((d2-d1)/(1000*60*60*24)); }

function actualizarCalculos(){
  const montoNum   = parseFloat(monto.value||0);
  const interesNum = parseFloat(interes.value||0);
  const plazoNum   = parseInt(plazo.value||0);
  const f0         = fechaInicio.value;

  if(montoNum>0 && interesNum>=0 && plazoNum>0 && f0){
    const cuota=calcularCuotaFija(montoNum,interesNum,plazoNum), total=cuota*plazoNum, interTotal=total-montoNum;
    const f1=sumarMeses(f0,1), fN=sumarMeses(f0,plazoNum);
    montoPrestado.textContent = `S/ ${montoNum.toFixed(2)}`;
    tasaInteres.textContent   = `${interesNum}%`;
    interesTotal.textContent  = `S/ ${interTotal.toFixed(2)}`;
    montoTotalPagar.textContent = `S/ ${total.toFixed(2)}`;
    fechaDesembolsoMostrada.textContent   = formatearFechaParaTabla(f0);
    fechaPrimeraCuotaMostrada.textContent = formatearFechaParaTabla(f1);
    fechaUltimaCuotaMostrada.textContent  = formatearFechaParaTabla(fN);
    fechaPrimeraCuota.textContent = formatearFechaParaCronograma(f1);
    montoPrimeraCuota.textContent = `S/ ${cuota.toFixed(2)}`;
    interesCalculado.classList.remove('hidden');
    fechaCalculada.classList.remove('hidden');
    primeraCuota.classList.remove('hidden');
  } else {
    interesCalculado.classList.add('hidden');
    fechaCalculada.classList.add('hidden');
    primeraCuota.classList.add('hidden');
  }
}

// ====== FERIADOS PERÚ + DOMINGOS ======
function easterSunday(year){
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(Date.UTC(year, month-1, day));
}
function toISO(d){ return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().split('T')[0]; }
function addDaysISO(iso,days){ const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+days); return d.toISOString().split('T')[0]; }
function getFeriadosPeru(year){
  const set=new Set();
  const fijos=[[1,1],[5,1],[6,29],[7,28],[7,29],[8,30],[10,8],[11,1],[12,8],[12,9],[12,25]];
  fijos.forEach(([m,d])=>set.add(`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`));
  const pascua=easterSunday(year); const iso=toISO(pascua);
  set.add(addDaysISO(iso,-3)); // Jueves Santo
  set.add(addDaysISO(iso,-2)); // Viernes Santo
  return set;
}
function esDomingo(fechaISO){ return new Date(fechaISO+'T00:00:00').getDay()===0; }
function esFeriadoPeru(fechaISO){ const y=parseInt(fechaISO.slice(0,4),10); return getFeriadosPeru(y).has(fechaISO); }
function siguienteHabilSiDomingoOFeriado(fechaISO){
  let f = fechaISO;
  while (esDomingo(f) || esFeriadoPeru(f)) f = addDaysISO(f,1);
  return f;
}

// ====== REGISTRAR PRÉSTAMO (celular obligatorio) ======
async function registrarPrestamo(){
  // 1. Validaciones iniciales del formulario
  if(!clienteVerificado) return mostrarNotificacion('Primero verifique al cliente (API o Manual)','error');
  if(!analista.value.trim()) return mostrarNotificacion('Ingrese Analista de crédito','error');

  celular.classList.remove('field-error'); celularError.classList.add('hidden');
  if(!celular.value.trim()){
    celular.classList.add('field-error'); celularError.classList.remove('hidden');
    return mostrarNotificacion('El número de celular es obligatorio.','error');
  }

  const montoVal   = parseFloat(monto.value || '0');
  const interesVal = parseFloat(interes.value || '0');
  const moraDiaVal = parseFloat(moraDiaria.value || '0');
  const plazoMes   = parseInt(plazo.value || '0',10);
  const f0         = fechaInicio.value;

  if(!(montoVal>0 && interesVal>=0 && plazoMes>0 && f0)){
    return mostrarNotificacion('Complete los campos correctamente','error');
  }

  if (esDomingo(f0) || esFeriadoPeru(f0)) {
    const siguienteHabil = siguienteHabilSiDomingoOFeriado(f0);
    const fechaFormateada = formatearFechaParaTabla(siguienteHabil);
    return mostrarNotificacion(
      '⚠ La fecha de desembolso no puede ser en domingo o feriado. ' + 
      'La fecha más próxima es: ' + fechaFormateada,
      'error'
    );
  }

  // 2. Validaciones de negocio (reglas de préstamo)
  const documentoCliente = clienteVerificado.documento;
  const prestamosDelCliente = prestamosRegistrados.filter(p => p.documento === documentoCliente);

  // REGLA 1: No puede tener más de un préstamo activo 
  const tienePrestamoActivo = prestamosDelCliente.some(p => !p.cancelado);
  if (tienePrestamoActivo) {
    return mostrarNotificacion('Este cliente ya tiene un préstamo activo. Debe cancelarlo antes de solicitar uno nuevo.', 'error');
  }

  // REGLA 2: Debe esperar 1 mes después de cancelar un préstamo 
  const prestamosCancelados = prestamosDelCliente.filter(p => p.cancelado && p.fechaCancelacion);
  if (prestamosCancelados.length > 0) {
    prestamosCancelados.sort((a, b) => new Date(b.fechaCancelacion) - new Date(a.fechaCancelacion));
    const ultimoCancelado = prestamosCancelados[0];
    const fechaCancelacion = new Date(ultimoCancelado.fechaCancelacion + 'T00:00:00');
    const fechaActual = new Date();
    
    // Comparamos si ha pasado al menos un mes
    const fechaMinimaParaSolicitar = new Date(fechaCancelacion);
    fechaMinimaParaSolicitar.setMonth(fechaMinimaParaSolicitar.getMonth() + 1);

    if (fechaActual < fechaMinimaParaSolicitar) {
      const diasTranscurridos = Math.floor((fechaActual - fechaCancelacion) / (1000 * 60 * 60 * 24));
      const fechaFormateada = formatearFechaParaTabla(fechaMinimaParaSolicitar.toISOString().split('T')[0]);
      return mostrarNotificacion(
        `El cliente canceló su préstamo hace ${diasTranscurridos} día(s). Debe esperar 1 mes desde la cancelación. Disponible a partir del: ${fechaFormateada}`,
        'error'
      );
    }
  }
  
  // REGLA 3: Solo se permite 1 préstamo por mes 
  const hoy = new Date();
  const mesActual = hoy.getMonth();
  const anioActual = hoy.getFullYear();
  const prestamosEsteMes = prestamosDelCliente.filter(p => {
    const fechaPrestamo = new Date(p.fechaDesembolso + 'T00:00:00');
    return fechaPrestamo.getMonth() === mesActual && fechaPrestamo.getFullYear() === anioActual;
  });

  if (prestamosEsteMes.length > 0) {
    const prestamoAnterior = prestamosEsteMes[0];
    const fechaDesembolso = formatearFechaParaTabla(prestamoAnterior.fechaDesembolso);
    return mostrarNotificacion(
      `El cliente ya solicitó un préstamo este mes (${fechaDesembolso}). Solo se permite 1 préstamo por mes.`,
      'error'
    );
  }

  // 3. Crear el objeto para enviar a la API
  const cuota = calcularCuotaFija(montoVal, interesVal, plazoMes);

  const nuevoPrestamo = {
    cliente: clienteVerificado,
    documento: clienteVerificado.documento,
    nroPrestamo: Math.floor(100000 + Math.random() * 899999).toString(),
    analista: (analista.value || '—').trim(),
    caja: (caja.value || '—').trim(),
    correo: (correo.value || '—').trim(),
    celular: (celular.value || '—').trim(),
    fechaDesembolso: f0,
    monto: montoVal,
    montoOriginal: montoVal,
    interes: interesVal,
    plazo: plazoMes,
    cuotaMensual: cuota,
    moraDiaria: moraDiaVal,
  };

  // 4. Enviar a la API usando fetch
  try {
    const response = await fetch('/api/prestamos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevoPrestamo),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Error al registrar el préstamo');
    }

    await cargarPrestamosDesdeAPI(); // Recargar la lista desde la base de datos
    mostrarNotificacion('Préstamo registrado exitosamente en la base de datos', 'success');
  
  } catch (error) {
    console.error('Error:', error);
    mostrarNotificacion(error.message, 'error');
  }
}

// ====== FILTROS ======
function setLoanFilter(f){
  loanFilter = f;
  fltAll.classList.toggle('active', f==='all');
  fltAct.classList.toggle('active', f==='activos');
  fltCan.classList.toggle('active', f==='cancelados');
  actualizarListaPrestamos();
}

// ====== LISTA DE PRÉSTAMOS (busca por analista también) ======
function actualizarListaPrestamos(){
  const total = prestamosRegistrados.length;
  let list = [...prestamosRegistrados];

  if (loanFilter==='activos')    list = list.filter(p=>!p.cancelado);
  if (loanFilter==='cancelados') list = list.filter(p=> p.cancelado);

  const q = (loanQuery||'').toLowerCase();
  if (q){
    list = list.filter(p=>{
      const blob = [
        p.cliente, p.documento, p.correo||'', p.celular||'',
        p.analista||'', // búsqueda por analista
        p.fechaRegistro, p.fechaDesembolso, p.fechaPrimeraCuota, p.fechaUltimaCuota
      ].join(' ').toLowerCase();
      return blob.includes(q);
    });
  }

  if (loanFilter==='all'){
    list.sort((a,b)=>{
      if (a.cancelado && !b.cancelado) return 1;
      if (!a.cancelado && b.cancelado) return -1;
      return new Date(b.fechaDesembolso) - new Date(a.fechaDesembolso);
    });
  } else {
    list.sort((a,b)=> new Date(b.fechaDesembolso) - new Date(a.fechaDesembolso));
  }

  totalPrestamos.textContent = `${list.length}/${total}`;
  if(list.length===0){ loansList.innerHTML = '<p id="noLoans">No hay préstamos para mostrar.</p>'; return; }

  const qReg = q ? new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,'gi') : null;
  const highlight = (txt) => q ? String(txt).replace(qReg,'<span class="highlight">$1</span>') : txt;

  loansList.innerHTML = list.map(p=>{
    const estadoBadge = p.cancelado
      ? '<span style="background:#38a169;color:#fff;padding:4px 8px;border-radius:6px;font-size:11px;font-weight:700;">✅ CANCELADO</span>'
      : '';
    const claseCancelado = p.cancelado ? ' cancelado' : '';
    const icono = p.cancelado ? '<span class="estado-ico" title="Préstamo cancelado">📁</span>' : '';

    return `
      <div class="loan-item${claseCancelado}">
        <div class="loan-actions">
          <button class="generate-btn" onclick="abrirModalCronograma(${p.id})">Cronograma</button>
          <button class="delete-btn" onclick="eliminarPrestamo(${p.id})">Eliminar</button>
        </div>
        <h4>${highlight(p.cliente)} ${icono} ${estadoBadge}</h4>
        <div class="loan-details">
          <div><strong>Registro:</strong> ${highlight(p.fechaRegistro)}</div>
          <div><strong>Doc:</strong> ${highlight(p.documento)}</div>
          <div><strong>Analista:</strong> ${highlight(p.analista || '—')}</div>
          <div><strong>Correo:</strong> ${highlight(p.correo || '—')}</div>
          <div><strong>Celular:</strong> ${highlight(p.celular || '—')}</div>
          <div><strong>Desembolso:</strong> ${formatearFechaParaTabla(p.fechaDesembolso)}</div>
          <div><strong>Primera:</strong> ${formatearFechaParaTabla(p.fechaPrimeraCuota)}</div>
          <div><strong>Última:</strong> ${formatearFechaParaTabla(p.fechaUltimaCuota)}</div>
          <div><strong>Monto Original:</strong> S/ ${p.montoOriginal.toFixed(2)}</div>
          <div><strong>Saldo Actual:</strong> S/ ${p.monto.toFixed(2)}</div>
          <div><strong>Interés:</strong> ${p.interes}%</div>
          <div><strong>Cuota:</strong> S/ ${p.cuotaMensual.toFixed(2)}</div>
          <div><strong>Plazo:</strong> ${p.plazo} meses</div>
          <div><strong>Pagadas:</strong> ${p.cuotasPagadas}</div>
          ${p.cancelado ? `<div><strong>Cancelación:</strong> ${formatearFechaParaTabla(p.fechaCancelacion)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ====== ELIMINAR PRÉSTAMO ======
async function eliminarPrestamo(id){
  if(!confirm('¿Eliminar este préstamo de la base de datos? Esta acción es irreversible.')) return;
  
  try {
    // Aún necesitas crear esta ruta en tu archivo prestamos.routes.js
    const response = await fetch(`/api/prestamos/${id}`, { method: 'DELETE' });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'No se pudo eliminar el préstamo');
    }

    await cargarPrestamosDesdeAPI(); // Recargamos la lista para reflejar el cambio

    const wasOpen = prestamoActualParaCronograma && prestamoActualParaCronograma.id === id;
    if (wasOpen) cerrarModalCronograma();
    
    mostrarNotificacion('Préstamo eliminado de la base de datos','success');

  } catch (error) {
    console.error('Error al eliminar:', error);
    mostrarNotificacion(error.message, 'error');
  }
}

// ====== CRONOGRAMA: ABRIR / CERRAR (abre primero el modal) ======
function abrirModalCronograma(id){
  const p = prestamosRegistrados.find(x=>x.id===id);
  if (!p) return mostrarNotificacion("No se encontró el préstamo.", "error");

  // abrir primero el modal para que siempre se vea
  cronogramaModal.style.display = 'block';
  prestamoActualParaCronograma = p;

  try {
    generarCronogramaEnModal(p);
  } catch (e) {
    console.error(e);
    mostrarNotificacion("Ocurrió un error al generar el cronograma. Intenta de nuevo.", "error");
  }
}
function cerrarModalCronograma(){
  cronogramaModal.style.display='none';
  prestamoActualParaCronograma = null;
}
window.addEventListener('click', e=>{ if(e.target===cronogramaModal) cerrarModalCronograma(); });

// ====== RENDER DEL CRONOGRAMA ======
function generarCronogramaEnModal(p){
  cronogramaClienteModal.textContent = p.cliente;
  cronogramaDocumentoModal.textContent = `Documento: ${p.documento} | Correo: ${p.correo || 'No registrado'} | Celular: ${p.celular || 'No registrado'}`;
  const estadoTexto = p.cancelado ? ` | ✅ PRÉSTAMO CANCELADO (${formatearFechaParaTabla(p.fechaCancelacion)})` : '';
  cronogramaDetallesModal.textContent = `Monto: S/ ${p.monto.toFixed(2)} | Tasa: ${p.interes}% | Plazo: ${p.plazo} meses | Mora diaria: ${p.moraDiaria}%${estadoTexto}`;

  const tbody = cronogramaBodyModal;
  tbody.innerHTML = '';
  const cuota = p.cuotaMensual;
  let saldo = p.monto, totA=0, totI=0;

  for(let i=1;i<=p.plazo;i++){
    const vtoISO = sumarMeses(p.fechaDesembolso,i);
    const fecha  = formatearFechaParaTabla(vtoISO);
    const iM     = p.interes/100/12;
    const interes= saldo*iM;
    let amort    = cuota - interes;
    let cuotaReal= cuota;

    if(i===p.plazo){ amort = saldo; cuotaReal = amort + interes; }
    saldo -= amort; totA += amort; totI += interes;

    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td>${i}</td>
      <td>${fecha}</td>
      <td>S/ ${amort.toFixed(2)}</td>
      <td>S/ ${interes.toFixed(2)}</td>
      <td>S/ ${cuotaReal.toFixed(2)}</td>
      <td>S/ ${Math.max(0,saldo).toFixed(2)}</td>`;
    tr.style.opacity = (p.cuotasPagadas||0) >= i ? '.55' : '1';
    tbody.appendChild(tr);
  }

  totalAmortizacionModal.textContent = `S/ ${totA.toFixed(2)}`;
  totalInteresModal.textContent      = `S/ ${totI.toFixed(2)}`;
  totalCuotaModal.textContent        = `S/ ${(totA+totI).toFixed(2)}`;
  saldoFinalModal.textContent        = `S/ ${Math.max(0,saldo).toFixed(2)}`;

  // Próxima cuota + mora
  fechaPagoInput.value      = new Date().toISOString().split('T')[0];
  moraEditableInput.value   = (p.moraDiaria ?? 0).toString();
  montoAbonoCapital.value   = '';
  actualizarLineaProxima();
  fechaPagoInput.onchange   = actualizarLineaProxima;
  moraEditableInput.oninput = ()=>{ p.moraDiaria = parseFloat(moraEditableInput.value)||0; actualizarLineaProxima(); };

  renderHistorialPagos(p);
}

function obtenerProximaCuotaNoPagada(p){
  const n=(p.cuotasPagadas||0)+1; if(n>p.plazo) return null;
  return { nCuota:n, fechaVencISO: sumarMeses(p.fechaDesembolso,n), montoCuota:p.cuotaMensual };
}
function actualizarLineaProxima(){
  const p = prestamoActualParaCronograma; if(!p) return;
  const prox = obtenerProximaCuotaNoPagada(p);
  let texto = p.cancelado ? '✅ Préstamo cancelado - No hay cuotas pendientes.' : 'Todas las cuotas están pagadas.';
  if(prox && !p.cancelado){
    const fechaPago = (fechaPagoInput.value || new Date().toISOString().split('T')[0]);
    const vtoAjust  = siguienteHabilSiDomingoOFeriado(prox.fechaVencISO);
    const etiqueta  = (vtoAjust!==prox.fechaVencISO)?' (ajustada por día no laborable)':'';
    const diasAtraso= Math.max(0, diffDias(vtoAjust, fechaPago));
    const moraPct   = parseFloat(p.moraDiaria||0);
    const mora      = +(prox.montoCuota*(moraPct/100)*diasAtraso).toFixed(2);
    const total     = +(prox.montoCuota+mora).toFixed(2);
    texto = `Próxima cuota: N° ${prox.nCuota} • Vence: ${formatearFechaParaTabla(vtoAjust)}${etiqueta} • `
          + `Cuota base: S/ ${prox.montoCuota.toFixed(2)} • `
          + `Mora estimada: S/ ${mora.toFixed(2)} (${diasAtraso} día${diasAtraso===1?'':'s'} × ${moraPct}% × S/ ${prox.montoCuota.toFixed(2)}) • `
          + `Total: S/ ${total.toFixed(2)}`;
  }
  proximaInfoTexto.textContent = texto;
}

// ====== NÚMEROS A LETRAS (S/) ======
function numeroALetrasSoles(n){
  const u=['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte'];
  const d=['','', 'veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
  const c=['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
  function s(n){
    if(n<=20) return u[n];
    if(n<100){ const D=Math.floor(n/10),U=n%10; if(n<30) return U?`veinti${u[U]}`:'veinte'; return U?`${d[D]} y ${u[U]}`:d[D]; }
    if(n<1000){ const C=Math.floor(n/100),R=n%100; if(n===100) return 'cien'; return R?`${c[C]} ${s(R)}`:c[C]; }
    if(n<1e6){ const M=Math.floor(n/1000),R=n%1000; const mil=(M===1)?'mil':`${s(M)} mil`; return R?`${mil} ${s(R)}`:mil; }
    const MM=Math.floor(n/1e6),R=n%1e6; const mill=(MM===1)?'un millón':`${s(MM)} millones`; return R?`${mill} ${s(R)}`:mill;
  }
  const S=Math.floor(n), Cts=Math.round((n-S)*100);
  const txt=`${s(S)} ${S===1?'sol':'soles'} con ${Cts.toString().padStart(2,'0')}/100`;
  return txt.charAt(0).toUpperCase()+txt.slice(1);
}

// ====== RECIBO: GENERACIÓN / IMPRESIÓN / COMPARTIR ======
function mostrarReciboPago(recibo){
  return `
  <div style="font-family:monospace;font-size:12px;max-width:380px;margin:0 auto;padding:10px;">
    <div style="text-align:center;border-bottom:2px dashed #333;padding-bottom:8px;margin-bottom:8px;">
      <div style="font-weight:bold;font-size:14px;">${recibo.empresa}</div>
      <div>RUC: ${recibo.ruc}</div>
      <div style="margin-top:4px;font-size:13px;font-weight:bold;">${recibo.titulo}</div>
      <div style="font-size:11px;margin-top:2px;">${recibo.fechaHora}</div>
    </div>
    <div style="margin-bottom:8px;">
      <div><strong>Cliente:</strong> ${recibo.cliente}</div>
      <div><strong>Analista de crédito:</strong> ${recibo.analistaCredito}</div>
      <div><strong>Caja:</strong> ${recibo.caja}</div>
      <div><strong>Nro. Préstamo:</strong> ${recibo.nroPrestamo}</div>
    </div>
    <div style="border-top:1px solid #333;border-bottom:1px solid #333;padding:6px 0;margin:8px 0;">
      <table style="width:100%;font-size:11px;">
        <tr><td>Capital:</td><td style="text-align:right;">S/ ${recibo.capital.toFixed(2)}</td></tr>
        <tr><td>Interés compensatorio:</td><td style="text-align:right;">S/ ${recibo.interesCompensatorio.toFixed(2)}</td></tr>
        <tr><td>Interés moratorio:</td><td style="text-align:right;">S/ ${recibo.interesMoratorio.toFixed(2)}</td></tr>
        <tr><td>Envío físico:</td><td style="text-align:right;">S/ ${recibo.envioFisico.toFixed(2)}</td></tr>
        <tr style="border-top:1px solid #333;"><td><strong>Total cobro:</strong></td><td style="text-align:right;"><strong>S/ ${recibo.totalCobro.toFixed(2)}</strong></td></tr>
        <tr><td>ITF (0.005%):</td><td style="text-align:right;">S/ ${recibo.itf.toFixed(2)}</td></tr>
        <tr style="border-top:1px solid #333;font-weight:bold;"><td>TOTAL PAGADO:</td><td style="text-align:right;">S/ ${recibo.totalPagado.toFixed(2)}</td></tr>
      </table>
    </div>
    <div style="margin:8px 0;font-size:11px;"><div><strong>SON:</strong> ${recibo.montoEnLetras}</div></div>
    <div style="margin-top:8px;font-size:10px;">
      <div><strong>Última cuota pagada:</strong> ${recibo.ultimaCuotaPagada}</div>
      <div><strong>Próximo pago:</strong> ${formatearFechaParaTabla(recibo.proximoPago)}</div>
      <div><strong>Saldo capital:</strong> S/ ${recibo.saldoCapital.toFixed(2)}</div>
    </div>
    ${recibo.notas ? `<div style="margin-top:10px;font-size:9px;color:#555;border-top:1px dashed #999;padding-top:6px;">${recibo.notas.map(n=>`<div>• ${n}</div>`).join('')}</div>`:''}
    <div style="text-align:center;margin-top:12px;padding-top:8px;border-top:2px dashed #333;font-size:10px;">
      <div>¡Gracias por su pago!</div>
      <div style="margin-top:4px;">Este documento no tiene validez fiscal</div>
    </div>
  </div>`;
}
function generarReciboPago(prestamo, numeroCuota, montoCuota, moraCobrada){
  const iM = prestamo.interes/100/12;
  const saldoAntes = prestamo.monto;
  const interes = saldoAntes * iM;
  const amort   = montoCuota - interes;
  const saldoDespues = saldoAntes - amort;
  const totalCobro = amort + interes + moraCobrada;
  const itf = totalCobro * 0.00005;
  const totalPagado = totalCobro + itf;
  const montoEnLetras = numeroALetrasSoles(totalPagado);
  const ahora = new Date();
  const fechaHora = ahora.toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'}) + '    ' +
                    ahora.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  return {
    ruc:'20302036655', empresa:'MAYORISTA VALLEJO', titulo:'COBRO DE PRESTAMO - CAJA', fechaHora,
    cliente:prestamo.cliente, analistaCredito:prestamo.analista||'No asignado', caja:prestamo.caja||'1',
    nroPrestamo:prestamo.nroPrestamo||prestamo.id,
    capital:amort, interesCompensatorio:interes, interesMoratorio:moraCobrada, envioFisico:0.00,
    totalCobro, itf, totalPagado, montoEnLetras,
    ultimaCuotaPagada:numeroCuota, proximoPago:sumarMeses(prestamo.fechaDesembolso, numeroCuota+1),
    saldoCapital:saldoDespues, notas:['Pague puntualmente para evitar moras.']
  };
}
function imprimirRecibo(prestamo, numeroCuota, montoCuota, moraCobrada){
  const recibo = generarReciboPago(prestamo, numeroCuota, montoCuota, moraCobrada);
  const html   = mostrarReciboPago(recibo);
  const w = window.open('', '_blank', 'width=400,height=800');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Recibo</title><style>body{margin:20px}@media print{body{margin:0}}</style></head><body>${html}<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>`);
  w.document.close();
}
function construirReciboDesdePago(prestamo, pg){
  const ahora = new Date();
  const fechaHora = ahora.toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'}) + '    ' +
                    ahora.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  if (pg.tipo==='CUOTA'){
    const totalCobro = (+pg.capital||0)+(+pg.interes||0)+(+pg.moraCobrada||0);
    const itf = +(pg.itf ?? (totalCobro*0.00005)).toFixed(2);
    const totalPagado = +(pg.totalPagado ?? (totalCobro+itf)).toFixed(2);
    const montoEnLetras = numeroALetrasSoles(totalPagado);
    return {
      ruc:'20302036655', empresa:'MAYORISTA VALLEJO', titulo:'COBRO DE PRESTAMO - CAJA', fechaHora,
      cliente:prestamo.cliente, analistaCredito:prestamo.analista||'No asignado', caja:prestamo.caja||'1',
      nroPrestamo:prestamo.nroPrestamo||prestamo.id,
      capital:+(+pg.capital||0), interesCompensatorio:+(+pg.interes||0), interesMoratorio:+(+pg.moraCobrada||0), envioFisico:0,
      totalCobro, itf, totalPagado, montoEnLetras,
      ultimaCuotaPagada:pg.nCuota, proximoPago:sumarMeses(prestamo.fechaDesembolso,(pg.nCuota||0)+1),
      saldoCapital:+(pg.saldoCapitalDespues ?? prestamo.monto), notas:['Pague puntualmente para evitar moras.']
    };
  }
  if (pg.tipo==='ABONO CAPITAL'){
    const total = +pg.totalPagado;
    return {
      ruc:'20302036655', empresa:'MAYORISTA VALLEJO', titulo:'ABONO A CAPITAL - CAJA', fechaHora,
      cliente:prestamo.cliente, analistaCredito:prestamo.analista||'No asignado', caja:prestamo.caja||'1',
      nroPrestamo:prestamo.nroPrestamo||prestamo.id,
      capital:total, interesCompensatorio:0, interesMoratorio:0, envioFisico:0,
      totalCobro:total, itf:0, totalPagado:total, montoEnLetras:numeroALetrasSoles(total),
      ultimaCuotaPagada:'—', proximoPago:obtenerProximaCuotaNoPagada(prestamo)?.fechaVencISO || prestamo.fechaUltimaCuota,
      saldoCapital:prestamo.monto, notas:['Abono directo a capital.']
    };
  }
  if (pg.tipo==='CANCELACIÓN TOTAL'){
    const totalPagado = +pg.totalPagado; const itf = +pg.itf || 0; const totalCobro = +(totalPagado-itf).toFixed(2);
    return {
      ruc:'20302036655', empresa:'MAYORISTA VALLEJO', titulo:'CANCELACIÓN TOTAL - CAJA', fechaHora,
      cliente:prestamo.cliente, analistaCredito:prestamo.analista||'No asignado', caja:prestamo.caja||'1',
      nroPrestamo:prestamo.nroPrestamo||prestamo.id,
      capital:totalCobro, interesCompensatorio:0, interesMoratorio:0, envioFisico:0,
      totalCobro, itf, totalPagado, montoEnLetras:numeroALetrasSoles(totalPagado),
      ultimaCuotaPagada:prestamo.plazo, proximoPago:prestamo.fechaCancelacion, saldoCapital:0, notas:['Préstamo liquidado.']
    };
  }
  return null;
}
function imprimirReciboDesdeHistorial(index){
  const p = prestamoActualParaCronograma; if(!p) return mostrarNotificacion("Abre un cronograma primero.","error");
  const pg = (p.pagos||[])[index]; if(!pg) return mostrarNotificacion("No se encontró el pago.","error");
  const recibo = construirReciboDesdePago(p, pg); if(!recibo) return mostrarNotificacion("Este movimiento no genera comprobante.","info");
  const html = mostrarReciboPago(recibo);
  const w = window.open('', '_blank', 'width=400,height=800');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Recibo</title><style>body{margin:20px}@media print{body{margin:0}}</style></head><body>${html}<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>`);
  w.document.close();
}
async function generarPDFBlobDesdeReciboHTML(htmlString){
  const iframe=document.createElement('iframe');
  iframe.style.position='fixed'; iframe.style.left='-10000px'; iframe.style.top='-10000px'; iframe.style.width='420px'; iframe.style.height='0';
  document.body.appendChild(iframe);
  const doc=iframe.contentDocument||iframe.contentWindow.document; doc.open(); doc.write(htmlString); doc.close();
  await new Promise(r=>setTimeout(r,400));
  const canvas=await html2canvas(doc.body,{scale:2,useCORS:true,allowTaint:true,backgroundColor:'#ffffff',logging:false,imageTimeout:0});
  const { jsPDF } = window.jspdf; const pdf=new jsPDF('p','mm','a4');
  const imgData=canvas.toDataURL('image/png'); const pdfW=pdf.internal.pageSize.getWidth(); const ratio=canvas.width/canvas.height;
  const imgW=80; const imgH=imgW/ratio; const x=(pdfW-imgW)/2; const y=10;
  pdf.addImage(imgData,'PNG',x,y,imgW,imgH); document.body.removeChild(iframe);
  return pdf.output('blob');
}
async function compartirReciboPDFDesdeHistorial(index){
  const p = prestamoActualParaCronograma; if(!p) return mostrarNotificacion("Abre un cronograma primero.","error");
  const pg=(p.pagos||[])[index]; if(!pg) return mostrarNotificacion("No se encontró el pago.","error");
  const recibo = construirReciboDesdePago(p, pg); if(!recibo) return mostrarNotificacion("Este movimiento no genera comprobante.","info");
  const html = mostrarReciboPago(recibo);
  try{
    const blob=await generarPDFBlobDesdeReciboHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
    const nombre=`comprobante_${p.cliente.replace(/\s+/g,'_')}_${pg.tipo.toLowerCase().replace(/\s+/g,'_')}_${pg.nCuota||'0'}.pdf`;
    const file=new File([blob],nombre,{type:'application/pdf'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({title:'Comprobante de pago',text:`${p.cliente} - ${pg.tipo}`,files:[file]});
      mostrarNotificacion("Comprobante compartido.","success"); return;
    }
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=nombre; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url); mostrarNotificacion("Comprobante descargado en PDF.","success");
  }catch(e){ mostrarNotificacion("Error al generar PDF del comprobante: "+e.message,'error'); }
}
function compartirUltimoComprobantePDF(){
  const p = prestamoActualParaCronograma; if(!p || !p.pagos || p.pagos.length===0) return mostrarNotificacion("Aún no hay pagos registrados.","info");
  for(let i=p.pagos.length-1;i>=0;i--){ const pg=p.pagos[i];
    if(['CUOTA','ABONO CAPITAL','CANCELACIÓN TOTAL'].includes(pg.tipo)){ return compartirReciboPDFDesdeHistorial(i); } }
  mostrarNotificacion("No hay comprobantes para exportar.","info");
}
function imprimirUltimoComprobante(){
  const p = prestamoActualParaCronograma; if(!p || !p.pagos || p.pagos.length===0) return mostrarNotificacion("Aún no hay pagos registrados.","info");
  for(let i=p.pagos.length-1;i>=0;i--){ const pg=p.pagos[i];
    if(['CUOTA','ABONO CAPITAL','CANCELACIÓN TOTAL'].includes(pg.tipo)){ return imprimirReciboDesdeHistorial(i); } }
  mostrarNotificacion("No hay comprobantes imprimibles.","info");
}

// ====== PAGOS / ABONOS / CANCELACIÓN ======
async function registrarPagoCuotaSiguiente() {
  const p = prestamoActualParaCronograma;
  if (!p) return mostrarNotificacion("Abre un cronograma primero.", "error");
  if (p.cancelado) return mostrarNotificacion("Este préstamo ya está cancelado.", "info");

  const prox = obtenerProximaCuotaNoPagada(p);
  if (!prox) return mostrarNotificacion("Todas las cuotas están pagadas.", "info");

  // 1. Realizar todos los cálculos necesarios como antes
  const fechaPago = fechaPagoInput.value || new Date().toISOString().split('T')[0];
  const vtoAjust = siguienteHabilSiDomingoOFeriado(prox.fechaVencISO);
  const diasAtraso = Math.max(0, diffDias(vtoAjust, fechaPago));
  const moraDiariaPct = parseFloat(p.moraDiaria || 0);
  const mora = +(prox.montoCuota * (moraDiariaPct / 100) * diasAtraso).toFixed(2);

  const iM = p.interes / 100 / 12;
  const saldoAntes = p.monto;
  const interes = saldoAntes * iM;
  const capital = prox.montoCuota - interes;

  const totalCobro = capital + interes + mora;
  const itf = +(totalCobro * 0.00005).toFixed(2);
  const totalPagado = +(totalCobro + itf).toFixed(2);
  const saldoCapitalDespues = +(saldoAntes - capital).toFixed(2);
  
  // 2. Crear el objeto que se enviará a la API
  const datosDelPago = {
    nCuota: prox.nCuota,
    fechaPagoISO: fechaPago,
    capital: capital,
    interes: interes,
    moraCobrada: mora,
    itf: itf,
    totalPagado: totalPagado,
    saldoCapitalDespues: saldoCapitalDespues
  };

  // 3. Enviar los datos del pago al backend
  try {
    const response = await fetch(`/api/prestamos/${p.id}/pagos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(datosDelPago),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Error al registrar el pago en el servidor');
    }
    
    // 4. Si el pago fue exitoso en el backend, actualizamos la vista
    mostrarNotificacion(`Cuota ${prox.nCuota} registrada en la base de datos.`, 'success');

    // Actualizamos el objeto local para reflejar los cambios sin recargar toda la lista
    p.monto = saldoCapitalDespues;
    p.cuotasPagadas = prox.nCuota;
    p.moraAcumulada = (p.moraAcumulada || 0) + mora;
    if (!p.pagos) p.pagos = [];
    p.pagos.push({
        tipo: 'CUOTA',
        ...datosDelPago
    });
    
    generarCronogramaEnModal(p); // Refresca la vista del modal
    imprimirRecibo(p, prox.nCuota, prox.montoCuota, mora);

  } catch (error) {
    console.error('Error en el pago:', error);
    mostrarNotificacion(error.message, 'error');
  }
}
function actualizarMoraDiariaPrestamo(){
  const p = prestamoActualParaCronograma;
  if(!p) return mostrarNotificacion("Abre un cronograma primero.","error");
  const nuevaMora = parseFloat(moraEditableInput.value);
  if(isNaN(nuevaMora) || nuevaMora<0) return mostrarNotificacion("Ingrese una mora válida.","error");
  p.moraDiaria = nuevaMora; guardarPrestamos(); actualizarLineaProxima();
  mostrarNotificacion(`Mora diaria actualizada a ${nuevaMora}%`,'success');
}
function registrarPagoACapital(){
  const p = prestamoActualParaCronograma;
  if(!p) return mostrarNotificacion("Abre un cronograma primero.","error");
  if(p.cancelado) return mostrarNotificacion("Este préstamo ya está cancelado.","info");

  const montoAbono = parseFloat(montoAbonoCapital.value);
  if(!montoAbono || montoAbono<=0) return mostrarNotificacion("Ingrese un monto válido.", "error");
  if(montoAbono > p.monto) return mostrarNotificacion("El abono no puede ser mayor al saldo.", "error");

  const fechaPago = new Date().toISOString().split('T')[0];

  // actualizar saldo
  p.monto = +(p.monto - montoAbono).toFixed(2);

  // recalcular cuota con nuevo saldo para cuotas restantes
  const cuotasRestantes = p.plazo - p.cuotasPagadas;
  if (cuotasRestantes>0 && p.monto>0){
    p.cuotaMensual = calcularCuotaFija(p.monto, p.interes, cuotasRestantes);
  }

  if(!p.pagosCapital) p.pagosCapital=[];
  p.pagosCapital.push({fecha:fechaPago, monto:montoAbono});

  if(!p.pagos) p.pagos=[];
  p.pagos.push({ tipo:'ABONO CAPITAL', fechaPagoISO:fechaPago, totalPagado:montoAbono, saldoCapitalDespues:p.monto });

  guardarPrestamos();
  generarCronogramaEnModal(p);
  montoAbonoCapital.value='';
  mostrarNotificacion(`Abono de S/ ${montoAbono.toFixed(2)} registrado. Nuevo saldo: S/ ${p.monto.toFixed(2)}`,'success');
}
async function cancelarPrestamoCompleto() {
  const p = prestamoActualParaCronograma;
  if (!p) return mostrarNotificacion("Abre un cronograma primero.", "error");
  if (p.cancelado) return mostrarNotificacion("Este préstamo ya está cancelado.", "info");

  // 1. Calcular los montos finales como antes
  const saldoActual = p.monto;
  const itf = +(saldoActual * 0.00005).toFixed(2);
  const totalPagar = +(saldoActual + itf).toFixed(2);
  
  if (!confirm(`¿Desea realizar la cancelación total del préstamo por S/ ${totalPagar.toFixed(2)} (saldo + ITF)?`)) return;

  const fechaCancelacion = new Date().toISOString().split('T')[0];

  // 2. Crear el objeto para enviar a la API
  const datosCancelacion = {
    fechaCancelacion: fechaCancelacion,
    totalPagado: totalPagar,
    itf: itf
  };

  // 3. Enviar la solicitud de cancelación al backend
  try {
    const response = await fetch(`/api/prestamos/${p.id}/cancelar`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(datosCancelacion),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Error al cancelar el préstamo en el servidor');
    }

    // 4. Si la cancelación fue exitosa, recargamos los datos y actualizamos la UI
    mostrarNotificacion(`Préstamo cancelado exitosamente. Total pagado: S/ ${totalPagar.toFixed(2)}`, 'success');
    
    // Recargamos todos los préstamos para reflejar el estado actualizado en la lista principal
    await cargarPrestamosDesdeAPI(); 
    
    // Cerramos y reabrimos el modal para ver el estado "CANCELADO" inmediatamente
    cerrarModalCronograma();

  } catch (error) {
    console.error('Error en la cancelación:', error);
    mostrarNotificacion(error.message, 'error');
  }
}
function anularUltimoPago(){
  const p = prestamoActualParaCronograma;
  if(!p || !p.pagos || p.pagos.length===0) return mostrarNotificacion("No hay pagos para anular.","info");
  const ultimo = p.pagos[p.pagos.length-1];
  if(ultimo.tipo==='CANCELACIÓN TOTAL') return mostrarNotificacion("No se puede anular una cancelación total.","error");
  if(!confirm(`¿Anular el último pago (${ultimo.tipo})?`)) return;

  if(ultimo.tipo==='CUOTA'){
    p.monto = +(p.monto + (ultimo.capital||0)).toFixed(2);
    p.cuotasPagadas = Math.max(0, p.cuotasPagadas-1);
    p.moraAcumulada = Math.max(0, p.moraAcumulada - (ultimo.moraCobrada||0));
  }else if(ultimo.tipo==='ABONO CAPITAL'){
    p.monto = +(p.monto + ultimo.totalPagado).toFixed(2);
    const cuotasRestantes = p.plazo - p.cuotasPagadas;
    if(cuotasRestantes>0) p.cuotaMensual = calcularCuotaFija(p.monto, p.interes, cuotasRestantes);
    if(p.pagosCapital) p.pagosCapital = p.pagosCapital.slice(0,-1);
  }
  p.pagos.pop();
  guardarPrestamos();
  generarCronogramaEnModal(p);
  mostrarNotificacion("Pago anulado correctamente.","success");
}

// ====== HISTORIAL (tabla del modal) ======
function renderHistorialPagos(p){
  const body=historialPagosBody; if(!body) return;
  if(!p.pagos || p.pagos.length===0){ body.innerHTML='<tr><td colspan="6">Sin pagos aún.</td></tr>'; return; }
  const last=p.pagos.length-1;
  body.innerHTML = p.pagos.map((pg,i)=>{
    const tipoBadge = pg.tipo==='CUOTA'
      ? `<span style="color:#2d3748;">Cuota ${pg.nCuota}</span>`
      : pg.tipo==='ABONO CAPITAL'
      ? `<span style="background:#4299e1;color:#fff;padding:2px 6px;border-radius:3px;font-size:10px;">💵 CAPITAL</span>`
      : `<span style="background:#38a169;color:#fff;padding:2px 6px;border-radius:3px;font-size:10px;">✅ CANCELACIÓN</span>`;
    const imprimirBtn = `<button class="mini-btn" onclick="imprimirReciboDesdeHistorial(${i})">Imprimir</button>`;
    const pdfBtn      = `<button class="mini-btn" onclick="compartirReciboPDFDesdeHistorial(${i})">PDF</button>`;
    const anularBtn   = (i===last && pg.tipo!=='CANCELACIÓN TOTAL')
      ? '<button class="mini-btn mini-btn-danger" onclick="anularUltimoPago()">Anular</button>'
      : '<span style="color:#718096;">—</span>';
    const totalMostrar = (pg.totalPagado!=null)
      ? (+pg.totalPagado)
      : ((+pg.montoCuota||0)+(+pg.moraCobrada||0));
    return `
      <tr>
        <td>${pg.nCuota || '—'}</td>
        <td>${tipoBadge}</td>
        <td>${formatearFechaParaTabla(pg.fechaPagoISO)}</td>
        <td>S/ ${(+pg.moraCobrada||0).toFixed(2)}</td>
        <td title="Base: S/ ${(pg.montoCuota||0).toFixed(2)}  | ITF: S/ ${(pg.itf||0).toFixed(2)}">S/ ${totalMostrar.toFixed(2)}</td>
        <td style="display:flex;gap:6px;justify-content:center;">${imprimirBtn} ${pdfBtn} ${anularBtn}</td>
      </tr>`;
  }).join('');
}

// ====== CRONOGRAMA: IMPRIMIR / COMPARTIR PDF ======
function generarHTMLCronograma(p){
  let html = `
  <!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Cronograma - ${p.cliente}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:20px;}
    .header{text-align:center;margin-bottom:20px;}
    .info{margin-bottom:15px;}
    table{width:100%;border-collapse:collapse;margin-top:10px;}
    th,td{border:1px solid #333;padding:8px;text-align:center;font-size:11px;}
    th{background:#667eea;color:#fff;}
    .total-row{background:#c6f6d5;font-weight:bold;}
  </style></head><body>
  <div class="header"><h2>CRONOGRAMA DE PAGOS</h2><h3>${p.cliente}</h3></div>
  <div class="info">
    <div><strong>Documento:</strong> ${p.documento}</div>
    <div><strong>Correo:</strong> ${p.correo || 'No registrado'}</div>
    <div><strong>Celular:</strong> ${p.celular || 'No registrado'}</div>
    <div><strong>Monto:</strong> S/ ${p.monto.toFixed(2)}</div>
    <div><strong>Tasa:</strong> ${p.interes}%</div>
    <div><strong>Plazo:</strong> ${p.plazo} meses</div>
    <div><strong>Cuota:</strong> S/ ${p.cuotaMensual.toFixed(2)}</div>
    <div><strong>Desembolso:</strong> ${formatearFechaParaTabla(p.fechaDesembolso)}</div>
  </div>
  <table>
    <thead><tr><th>Mes</th><th>Vencimiento</th><th>Amortización</th><th>Interés</th><th>Cuota</th><th>Saldo</th></tr></thead>
    <tbody>`;

  const cuota = p.cuotaMensual;
  let saldo = p.monto, totA=0, totI=0;

  for(let i=1;i<=p.plazo;i++){
    const vtoISO=sumarMeses(p.fechaDesembolso,i);
    const fecha = formatearFechaParaTabla(vtoISO);
    const iM = p.interes/100/12;
    const interes = saldo*iM;
    let amort = cuota - interes;
    let cuotaReal = cuota;
    if(i===p.plazo){ amort=saldo; cuotaReal=amort+interes; }
    saldo -= amort; totA+=amort; totI+=interes;
    html += `<tr><td>${i}</td><td>${fecha}</td><td>S/ ${amort.toFixed(2)}</td><td>S/ ${interes.toFixed(2)}</td><td>S/ ${cuotaReal.toFixed(2)}</td><td>S/ ${Math.max(0,saldo).toFixed(2)}</td></tr>`;
  }

  html += `</tbody><tfoot><tr class="total-row">
    <td colspan="2">TOTAL</td><td>S/ ${totA.toFixed(2)}</td><td>S/ ${totI.toFixed(2)}</td><td>S/ ${(totA+totI).toFixed(2)}</td><td>S/ ${Math.max(0,saldo).toFixed(2)}</td>
  </tr></tfoot></table></body></html>`;
  return html;
}
function imprimirCronogramaActual(){
  const p = prestamoActualParaCronograma; if(!p) return mostrarNotificacion("Abre un cronograma primero.","error");
  const html = generarHTMLCronograma(p);
  const w = window.open('','_blank','width=800,height=600'); w.document.write(html); w.document.close();
  w.onload = ()=> setTimeout(()=>w.print(), 500);
}
async function generarPDFBlobDesdeHTML(htmlString){
  const iframe=document.createElement('iframe');
  iframe.style.position='fixed'; iframe.style.left='-10000px'; iframe.style.top='-10000px'; iframe.style.width='800px'; iframe.style.height='0';
  document.body.appendChild(iframe);
  const doc=iframe.contentDocument||iframe.contentWindow.document; doc.open(); doc.write(htmlString); doc.close();
  await new Promise(r=>setTimeout(r,500));
  const canvas=await html2canvas(doc.body,{scale:2,useCORS:true,allowTaint:true,backgroundColor:'#ffffff',logging:false,imageTimeout:0});
  const { jsPDF } = window.jspdf; const pdf=new jsPDF('p','mm','a4');
  const imgData=canvas.toDataURL('image/png'); const pdfW=pdf.internal.pageSize.getWidth(); const pdfH=pdf.internal.pageSize.getHeight(); const ratio=canvas.width/canvas.height;
  let imgW=pdfW-20; let imgH=imgW/ratio; if(imgH>pdfH-20){ imgH=pdfH-20; imgW=imgH*ratio; }
  const x=(pdfW-imgW)/2; const y=10; pdf.addImage(imgData,'PNG',x,y,imgW,imgH); document.body.removeChild(iframe);
  return pdf.output('blob');
}
async function compartirCronogramaPDF(){
  const p = prestamoActualParaCronograma; if(!p) return mostrarNotificacion("Abre un cronograma primero.","error");
  const html = generarHTMLCronograma(p);
  try{
    const blob = await generarPDFBlobDesdeHTML(html);
    const nombre = `cronograma_${p.cliente.replace(/\s+/g,'_')}_${p.nroPrestamo||p.id}.pdf`;
    const file = new File([blob], nombre, {type:'application/pdf'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({title:'Cronograma de Pagos', text:`Cronograma de ${p.cliente}`, files:[file]});
      mostrarNotificacion("Cronograma compartido.","success"); return;
    }
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=nombre; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url); mostrarNotificacion("Cronograma descargado en PDF.","success");
  }catch(e){ mostrarNotificacion("Error al generar PDF: "+e.message,'error'); }
}