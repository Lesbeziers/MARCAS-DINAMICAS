/* =============================================================
   MARCAS DINÁMICAS 1.0
   Aplicación de marcas de partner sobre carátulas de Movistar Plus+.
   Todo sucede en el navegador: no hay servidor ni conexión externa.
   ============================================================= */

'use strict';

/* ------------------------------- Constantes ------------------------------ */

/* Formatos de referencia. El tamaño natural del SVG de cada marca es el
   correcto en estas medidas; para cualquier otra, escala proporcional. */
const REFERENCIA = {
  V: { ancho: 1200, alto: 1800 },
  H: { ancho: 1920, alto: 1080 },
};

const PESO_MAXIMO = 1.5 * 1024 * 1024;   // 1,5 MB por imagen exportada
const MODO_VARIAS = 'varias';

/* ------------------------------- Catálogo -------------------------------- */

/* Cada SVG se convierte en su propia imagen independiente. Así los IDs
   internos de unos no pisan los de otros, y al no cargarse desde disco
   no contaminan el canvas cuando la app se abre con doble clic. */
const MARCAS_PREPARADAS = MARCAS.map((marca) => {
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(marca.svg);
  const anchoVb = parseFloat(vb[1]);
  const altoVb = parseFloat(vb[2]);

  /* Firefox exige width/height explícitos en la raíz para poder
     dibujar un SVG sobre un canvas. */
  const svgConMedidas = marca.svg.replace(
    /<svg\s/,
    `<svg width="${anchoVb}" height="${altoVb}" `
  );

  return {
    ...marca,
    anchoVb,
    altoVb,
    uri: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgConMedidas),
  };
});

const buscarMarca = (id) => MARCAS_PREPARADAS.find((m) => m.id === id) || null;

/* -------------------------------- Estado --------------------------------- */

const estado = {
  caratulas: [],
  indice: 0,
  modo: MODO_VARIAS,
};

/* La marca que realmente se aplica a una carátula: en modo partner manda
   el selector lateral; en modo varias, la elección individual. */
const marcaDe = (caratula) =>
  estado.modo === MODO_VARIAS ? caratula.marca : estado.modo;

const estaLista = (caratula) => Boolean(marcaDe(caratula));
const hayAsignacionesManuales = () =>
  estado.modo === MODO_VARIAS && estado.caratulas.some((c) => c.marca);

/* --------------------------------- Nodos --------------------------------- */

const $ = (id) => document.getElementById(id);

const nodo = {
  landing: $('landing'),
  dropzone: $('dropzone'),
  input: $('input-archivos'),
  trabajo: $('trabajo'),
  portada: $('btn-portada'),
  reiniciar: $('btn-reiniciar'),
  exportar: $('btn-exportar'),
  anterior: $('btn-anterior'),
  siguiente: $('btn-siguiente'),
  selectorModo: $('selector-modo'),
  lista: $('lista'),
  cajaMarca: $('caja-marca'),
  selectorMarca: $('selector-marca'),
  rotuloMarca: $('rotulo-marca'),
  lienzoV: $('lienzo-v'),
  lienzoH: $('lienzo-h'),
  modal: $('modal'),
  modalTexto: $('modal-texto'),
  modalAceptar: $('modal-aceptar'),
  modalCancelar: $('modal-cancelar'),
  progreso: $('progreso'),
  progresoTexto: $('progreso-texto'),
  progresoRelleno: $('progreso-relleno'),
};

/* ============================ CARGA DE IMÁGENES =========================== */

/* Separa el nombre en clave de carátula y ranura (_H / _V). Dos archivos
   que solo se diferencien en ese sufijo son la misma carátula. */
function analizarNombre(nombre) {
  const punto = nombre.lastIndexOf('.');
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const coincidencia = /^(.*)_([HV])$/i.exec(base);

  return coincidencia
    ? { clave: coincidencia[1], ranura: coincidencia[2].toUpperCase() }
    : { clave: base, ranura: null };
}

function leerMedidas(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ ancho: img.naturalWidth, alto: img.naturalHeight });
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = url;
  });
}

async function cargarArchivos(archivos) {
  /* Los ._* son metadatos que macOS crea al escribir en volúmenes que no
     son HFS. No son imágenes, aunque a veces se cuelen en la selección. */
  const validos = [...archivos].filter(
    (f) => !f.name.startsWith('._') && /^image\//.test(f.type)
  );

  if (!validos.length) return;

  const porClave = new Map();

  for (const archivo of validos) {
    const url = URL.createObjectURL(archivo);

    let medidas;
    try {
      medidas = await leerMedidas(url);
    } catch {
      URL.revokeObjectURL(url);
      continue;
    }

    const { clave, ranura } = analizarNombre(archivo.name);
    /* Sin sufijo, la orientación decide el formato. */
    const ranuraFinal = ranura || (medidas.ancho > medidas.alto ? 'H' : 'V');

    const pieza = {
      archivo,
      nombre: archivo.name,
      url,
      ancho: medidas.ancho,
      alto: medidas.alto,
      esPng: /^image\/png$/i.test(archivo.type) || /\.png$/i.test(archivo.name),
    };

    /* Si esa ranura ya está ocupada, el archivo no es pareja de nadie:
       se le da carátula propia en lugar de machacar la anterior. */
    let clavePropia = clave;
    let intento = 2;
    while (porClave.has(clavePropia) && porClave.get(clavePropia)[ranuraFinal]) {
      clavePropia = `${clave} (${intento++})`;
    }

    if (!porClave.has(clavePropia)) {
      porClave.set(clavePropia, { clave: clavePropia, nombre: clavePropia, V: null, H: null, marca: null });
    }
    porClave.get(clavePropia)[ranuraFinal] = pieza;
  }

  estado.caratulas = [...porClave.values()];
  estado.indice = 0;
  estado.modo = MODO_VARIAS;

  nodo.landing.hidden = true;
  nodo.trabajo.hidden = false;
  pintarTodo();
}

/* ============================== RENDERIZADO ============================== */

function rellenarSelectores() {
  nodo.selectorModo.innerHTML =
    `<option value="${MODO_VARIAS}">VARIAS MARCAS DINÁMICAS</option>` +
    MARCAS_PREPARADAS.map((m) => `<option value="${m.id}">${m.etiqueta}</option>`).join('');

  nodo.selectorMarca.innerHTML =
    '<option value="">NINGUNA</option>' +
    MARCAS_PREPARADAS.map((m) => `<option value="${m.id}">${m.etiqueta}</option>`).join('');
}

function pintarLateral() {
  nodo.selectorModo.value = estado.modo;
  nodo.lista.innerHTML = '';

  estado.caratulas.forEach((caratula, i) => {
    const li = document.createElement('li');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'item' + (i === estado.indice ? ' activo' : '');
    boton.addEventListener('click', () => {
      estado.indice = i;
      pintarTodo();
    });

    /* Thumbnail: si están los dos formatos, van juntos y con el peso
       a la izquierda. */
    const thumb = document.createElement('div');
    const dobles = Boolean(caratula.V && caratula.H);
    thumb.className = 'item-thumb' + (dobles ? ' doble' : '');
    for (const ranura of ['V', 'H']) {
      if (!caratula[ranura]) continue;
      const img = document.createElement('img');
      img.src = caratula[ranura].url;
      img.alt = '';
      thumb.appendChild(img);
    }

    const datos = document.createElement('div');
    datos.className = 'item-datos';

    const nombre = document.createElement('div');
    nombre.className = 'item-nombre';
    nombre.textContent = caratula.nombre;
    nombre.title = caratula.nombre;

    /* Primero el horizontal, luego el vertical. */
    const medidas = document.createElement('div');
    medidas.className = 'item-medidas';
    medidas.textContent = ['H', 'V']
      .filter((r) => caratula[r])
      .map((r) => `${caratula[r].ancho}x${caratula[r].alto}`)
      .join('  ·  ');

    datos.append(nombre, medidas);

    if (caratula.V?.esPng || caratula.H?.esPng) {
      const aviso = document.createElement('div');
      aviso.className = 'item-aviso';
      aviso.textContent = 'PNG · se exporta como JPG';
      datos.appendChild(aviso);
    }

    const listo = estaLista(caratula);
    const badge = document.createElement('span');
    badge.className = 'badge ' + (listo ? 'ok' : 'falta');
    badge.textContent = listo ? 'OK' : 'FALTA';

    boton.append(thumb, datos, badge);
    li.appendChild(boton);
    nodo.lista.appendChild(li);
  });
}

function pintarLienzo(elemento, caratula, ranura) {
  elemento.innerHTML = '';
  const pieza = caratula?.[ranura];

  if (!pieza) {
    elemento.classList.add('vacio');
    const texto = document.createElement('p');
    texto.className = 'lienzo-hueco';
    texto.textContent = ranura === 'V' ? 'Sin versión vertical' : 'Sin versión horizontal';
    elemento.appendChild(texto);
    return;
  }

  elemento.classList.remove('vacio');

  const arte = document.createElement('img');
  arte.className = 'lienzo-arte';
  arte.src = pieza.url;
  arte.alt = pieza.nombre;
  elemento.appendChild(arte);

  const marca = buscarMarca(marcaDe(caratula));
  if (!marca) return;

  const logo = document.createElement('img');
  logo.className = 'lienzo-logo';
  logo.src = marca.uri;
  logo.alt = marca.etiqueta;
  /* Misma regla que en la exportación, expresada en % del lienzo. */
  logo.style.width = (marca.anchoVb / REFERENCIA[ranura].ancho) * 100 + '%';
  elemento.appendChild(logo);
}

function pintarViewport() {
  const caratula = estado.caratulas[estado.indice];
  const esVarias = estado.modo === MODO_VARIAS;

  nodo.cajaMarca.hidden = !esVarias;
  nodo.rotuloMarca.hidden = esVarias;

  if (esVarias) {
    nodo.selectorMarca.value = caratula?.marca || '';
  } else {
    nodo.rotuloMarca.textContent = buscarMarca(estado.modo)?.etiqueta || '';
  }

  pintarLienzo(nodo.lienzoV, caratula, 'V');
  pintarLienzo(nodo.lienzoH, caratula, 'H');
}

function pintarBarra() {
  const total = estado.caratulas.length;
  const listas = estado.caratulas.filter(estaLista).length;
  const completo = total > 0 && listas === total;

  /* El botón nunca se oculta: atenuado comunica que la acción existe
     y el contador dice de un vistazo cuánto falta. */
  nodo.exportar.disabled = !completo;
  nodo.exportar.textContent = completo ? 'EXPORTAR' : `EXPORTAR (${listas}/${total})`;

  nodo.anterior.disabled = estado.indice === 0;
  nodo.siguiente.disabled = estado.indice >= total - 1;
}

function pintarTodo() {
  pintarLateral();
  pintarViewport();
  pintarBarra();
}

/* ================================ MODAL ================================= */

let resolverModal = null;

function confirmar(texto) {
  nodo.modalTexto.textContent = texto;
  nodo.modalCancelar.hidden = false;
  nodo.modalAceptar.textContent = 'CONTINUAR';
  nodo.modal.hidden = false;
  nodo.modalAceptar.focus();
  return new Promise((resolve) => { resolverModal = resolve; });
}

/* Variante informativa: un solo botón, nada que decidir. */
function avisar(texto) {
  nodo.modalTexto.textContent = texto;
  nodo.modalCancelar.hidden = true;
  nodo.modalAceptar.textContent = 'ENTENDIDO';
  nodo.modal.hidden = false;
  nodo.modalAceptar.focus();
  return new Promise((resolve) => { resolverModal = resolve; });
}

function cerrarModal(respuesta) {
  nodo.modal.hidden = true;
  if (resolverModal) {
    resolverModal(respuesta);
    resolverModal = null;
  }
}

nodo.modalAceptar.addEventListener('click', () => cerrarModal(true));
nodo.modalCancelar.addEventListener('click', () => cerrarModal(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !nodo.modal.hidden) cerrarModal(false);
});

const AVISO_ASIGNACIONES =
  'Vas a perder todas las asignaciones de marcas dinámicas hechas hasta ahora. ¿Continuar?';
const AVISO_PORTADA =
  'Vas a volver a la portada y se perderán las imágenes cargadas y sus marcas. ¿Continuar?';

/* ============================== EXPORTACIÓN ============================== */

function leerComoDataURL(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(archivo);
  });
}

function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar ' + src.slice(0, 40)));
    img.src = src;
  });
}

const aBlob = (canvas, calidad) =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', calidad));

/* Busca la calidad JPG más alta que quepa bajo el límite de peso.
   Devuelve también si lo ha conseguido y con qué calidad, para poder
   avisar al final en lugar de colar en silencio un archivo pasado. */
async function comprimir(canvas, limite) {
  const TECHO = 0.98;
  const SUELO = 0.08;

  let candidato = await aBlob(canvas, TECHO);
  if (candidato.size <= limite) {
    return { blob: candidato, calidad: TECHO, dentro: true };
  }

  /* Si ni al mínimo cabe, no hay nada que buscar: se entrega el más
     ligero posible y se deja constancia. */
  const minimo = await aBlob(canvas, SUELO);
  if (minimo.size > limite) {
    return { blob: minimo, calidad: SUELO, dentro: false };
  }

  let bajo = SUELO;
  let alto = TECHO;
  let mejor = minimo;
  let calidad = SUELO;

  for (let i = 0; i < 7; i++) {
    const medio = (bajo + alto) / 2;
    const intento = await aBlob(canvas, medio);
    if (intento.size <= limite) {
      mejor = intento;
      calidad = medio;
      bajo = medio;
    } else {
      alto = medio;
    }
  }

  return { blob: mejor, calidad, dentro: true };
}

async function componer(pieza, marca, ranura) {
  /* Data URL en vez de blob: garantiza que el canvas no quede
     contaminado al abrir la app desde file://. */
  const arte = await cargarImagen(await leerComoDataURL(pieza.archivo));

  const canvas = document.createElement('canvas');
  canvas.width = arte.naturalWidth;
  canvas.height = arte.naturalHeight;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(arte, 0, 0);

  const escala = canvas.width / REFERENCIA[ranura].ancho;
  const anchoLogo = marca.anchoVb * escala;
  const altoLogo = marca.altoVb * escala;

  const logo = await cargarImagen(marca.uri);
  ctx.drawImage(logo, canvas.width - anchoLogo, 0, anchoLogo, altoLogo);

  return comprimir(canvas, PESO_MAXIMO);
}

function nombreSalida(nombre) {
  return nombre.replace(/\.[^.]+$/, '') + '.jpg';
}

function nombreZip() {
  const hoy = new Date();
  const sello =
    hoy.getFullYear() +
    String(hoy.getMonth() + 1).padStart(2, '0') +
    String(hoy.getDate()).padStart(2, '0');

  /* Si todo el lote lleva el mismo partner, su nombre va en el ZIP. */
  const usadas = new Set(estado.caratulas.map((c) => marcaDe(c)));
  const etiqueta =
    usadas.size === 1 ? buscarMarca([...usadas][0]).slug : 'Varias';

  return `marcas_dinamicas_${etiqueta}_${sello}.zip`;
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportar() {
  const tareas = [];
  for (const caratula of estado.caratulas) {
    const marca = buscarMarca(marcaDe(caratula));
    for (const ranura of ['H', 'V']) {
      if (caratula[ranura]) tareas.push({ pieza: caratula[ranura], marca, ranura });
    }
  }

  nodo.progreso.hidden = false;
  nodo.progresoRelleno.style.width = '0%';

  const pasados = [];   // no han cabido en el límite de peso
  const justos = [];    // han cabido, pero bajando mucho la calidad

  try {
    const zip = new JSZip();

    for (let i = 0; i < tareas.length; i++) {
      const { pieza, marca, ranura } = tareas[i];
      nodo.progresoTexto.textContent = `Procesando ${i + 1} de ${tareas.length} — ${pieza.nombre}`;
      /* Cede un frame para que el progreso llegue a pintarse. */
      await new Promise((r) => requestAnimationFrame(r));

      const salida = nombreSalida(pieza.nombre);
      const { blob, calidad, dentro } = await componer(pieza, marca, ranura);
      zip.file(salida, blob);

      if (!dentro) pasados.push(`${salida} (${(blob.size / 1048576).toFixed(2)} MB)`);
      else if (calidad < 0.6) justos.push(salida);

      nodo.progresoRelleno.style.width = ((i + 1) / tareas.length) * 100 + '%';
    }

    nodo.progresoTexto.textContent = 'Comprimiendo el ZIP…';
    const paquete = await zip.generateAsync({ type: 'blob' });
    descargar(paquete, nombreZip());
    nodo.progreso.hidden = true;

    /* El ZIP se entrega siempre; perder el trabajo por un archivo
       pasado de peso sería peor. Pero hay que decirlo. */
    if (pasados.length) {
      await avisar(
        'Estas imágenes no han podido bajar de 1,5 MB ni a la calidad mínima, ' +
        'y van en el ZIP con su peso real:\n\n' + pasados.join('\n') +
        '\n\nRevísalas antes de enviarlas.'
      );
    } else if (justos.length) {
      await avisar(
        'Estas imágenes han entrado en 1,5 MB, pero forzando bastante la ' +
        'compresión. Conviene echarles un ojo:\n\n' + justos.join('\n')
      );
    }
  } catch (error) {
    console.error(error);
    nodo.progreso.hidden = true;
    await avisar('No se ha podido completar la exportación: ' + error.message);
  } finally {
    nodo.progreso.hidden = true;
  }
}

/* ================================ EVENTOS =============================== */

/* -- landing -- */

nodo.dropzone.addEventListener('click', () => nodo.input.click());
nodo.dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    nodo.input.click();
  }
});

nodo.input.addEventListener('change', (e) => {
  cargarArchivos(e.target.files);
  e.target.value = '';
});

['dragenter', 'dragover'].forEach((evento) =>
  nodo.dropzone.addEventListener(evento, (e) => {
    e.preventDefault();
    nodo.dropzone.classList.add('encima');
  })
);

['dragleave', 'drop'].forEach((evento) =>
  nodo.dropzone.addEventListener(evento, (e) => {
    e.preventDefault();
    nodo.dropzone.classList.remove('encima');
  })
);

nodo.dropzone.addEventListener('drop', (e) => cargarArchivos(e.dataTransfer.files));

/* Evita que soltar un archivo fuera de la zona lo abra en el navegador. */
['dragover', 'drop'].forEach((evento) =>
  document.addEventListener(evento, (e) => e.preventDefault())
);

/* -- barra -- */

nodo.portada.addEventListener('click', async () => {
  if (estado.caratulas.length && !(await confirmar(AVISO_PORTADA))) return;

  estado.caratulas.forEach((c) =>
    ['V', 'H'].forEach((r) => c[r] && URL.revokeObjectURL(c[r].url))
  );
  estado.caratulas = [];
  estado.indice = 0;
  estado.modo = MODO_VARIAS;

  nodo.trabajo.hidden = true;
  nodo.landing.hidden = false;
});

nodo.reiniciar.addEventListener('click', async () => {
  if (hayAsignacionesManuales() && !(await confirmar(AVISO_ASIGNACIONES))) return;

  estado.caratulas.forEach((c) => { c.marca = null; });
  estado.modo = MODO_VARIAS;
  estado.indice = 0;
  pintarTodo();
});

nodo.exportar.addEventListener('click', exportar);

nodo.anterior.addEventListener('click', () => {
  if (estado.indice > 0) { estado.indice--; pintarTodo(); }
});

nodo.siguiente.addEventListener('click', () => {
  if (estado.indice < estado.caratulas.length - 1) { estado.indice++; pintarTodo(); }
});

/* Flechas del teclado para navegar entre carátulas. Se delega en el clic
   del botón, así el tope de principio y final lo sigue marcando su propio
   estado deshabilitado y no hay dos reglas que mantener. */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

  /* Solo en el área de trabajo y sin nada por encima pidiendo atención. */
  if (nodo.trabajo.hidden || !nodo.modal.hidden || !nodo.progreso.hidden) return;

  /* Dentro de un desplegable las flechas cambian el valor: ahí no se tocan. */
  const foco = e.target;
  if (foco instanceof HTMLElement && /^(SELECT|INPUT|TEXTAREA)$/.test(foco.tagName)) return;

  e.preventDefault();
  (e.key === 'ArrowLeft' ? nodo.anterior : nodo.siguiente).click();
});

/* -- selectores -- */

nodo.selectorModo.addEventListener('change', async (e) => {
  const nuevo = e.target.value;

  /* Solo se avisa cuando hay trabajo manual en juego: pasar de un partner
     a otro no destruye nada que no se rehaga con un clic. */
  if (hayAsignacionesManuales() && nuevo !== MODO_VARIAS) {
    if (!(await confirmar(AVISO_ASIGNACIONES))) {
      e.target.value = estado.modo;
      return;
    }
  }

  estado.caratulas.forEach((c) => { c.marca = null; });
  estado.modo = nuevo;
  pintarTodo();
});

nodo.selectorMarca.addEventListener('change', (e) => {
  const caratula = estado.caratulas[estado.indice];
  if (caratula) caratula.marca = e.target.value || null;
  pintarTodo();
});

/* ================================= Inicio =============================== */

rellenarSelectores();
