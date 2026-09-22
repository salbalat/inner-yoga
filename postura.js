
'use strict';
// Criterios escritos por Verónica (provisionales hasta que los revise).
const POSTURAS = {"_nota":"Criterios de alineación por postura. LOS ESCRIBE VERÓNICA: aquí están puestos unos de partida, conservadores y sacados de la enseñanza habitual, pero son PROVISIONALES hasta que ella los revise. El programa no opina: mide ángulos reales y los compara con estos números. Si un criterio está mal, se corrige aquí y la app cambia, sin tocar código. · 22-09-2026: «Tronco vertical» tenía 90° de ideal, pero tres puntos alineados dan 180°, así que una postura correcta avisaba siempre y una mala no. Corregido a 178°±14. Sigue pendiente de que Verónica revise TODOS los números.","_como_leerlo":"Cada 'medida' es el ángulo entre tres puntos del cuerpo (a-vértice-b). 'ideal' es el objetivo, 'holgura' cuántos grados se aceptan a cada lado antes de avisar. 'aviso' es lo que se le dice a la persona cuando se sale.","_aviso_legal":"Esto describe lo que ve la cámara. No es un diagnóstico ni sustituye a una clase con Verónica.","posturas":[{"id":"guerrero2","nombre":"Guerrero II","sanscrito":"Virabhadrasana II","encuadre":"De frente a la cámara, cuerpo entero, a unos 3 metros.","medidas":[{"nombre":"Rodilla delantera","puntos":["cadera_delantera","rodilla_delantera","tobillo_delantero"],"ideal":90,"holgura":15,"aviso_menos":"La rodilla pasa del tobillo: retrasa la cadera o acorta el paso.","aviso_mas":"La rodilla está poco flexionada: separa más los pies y baja la cadera."},{"nombre":"Pierna trasera","puntos":["cadera_trasera","rodilla_trasera","tobillo_trasero"],"ideal":175,"holgura":12,"aviso_menos":"La pierna de atrás está doblada: estírala empujando el talón al suelo.","aviso_mas":""},{"nombre":"Tronco vertical","puntos":["hombro_medio","cadera_media","suelo"],"ideal":178,"holgura":14,"aviso_menos":"El tronco se aparta de la vertical: lleva el pecho sobre la cadera.","aviso_mas":""}]},{"id":"triangulo","nombre":"Triángulo","sanscrito":"Utthita Trikonasana","encuadre":"De frente a la cámara, cuerpo entero.","medidas":[{"nombre":"Pierna delantera","puntos":["cadera_delantera","rodilla_delantera","tobillo_delantero"],"ideal":178,"holgura":10,"aviso_menos":"La rodilla delantera está doblada: estira sin bloquear.","aviso_mas":""},{"nombre":"Apertura de caderas","puntos":["rodilla_delantera","cadera_media","rodilla_trasera"],"ideal":100,"holgura":20,"aviso_menos":"Los pies están muy juntos: alarga el paso.","aviso_mas":"Paso demasiado largo: acércalos un poco."}]},{"id":"perro","nombre":"Perro boca abajo","sanscrito":"Adho Mukha Svanasana","encuadre":"De perfil a la cámara, cuerpo entero.","medidas":[{"nombre":"Ángulo de la cadera","puntos":["hombro_medio","cadera_media","rodilla_delantera"],"ideal":80,"holgura":18,"aviso_menos":"Cadera muy cerrada: lleva el pecho hacia los muslos.","aviso_mas":"La cadera cae: sube los isquiones hacia el techo."},{"nombre":"Brazos","puntos":["muneca_delantera","codo_delantero","hombro_delantero"],"ideal":175,"holgura":12,"aviso_menos":"Codos doblados: estira los brazos sin bloquearlos.","aviso_mas":""}]},{"id":"montana","nombre":"Montaña","sanscrito":"Tadasana","encuadre":"De perfil a la cámara, cuerpo entero.","medidas":[{"nombre":"Alineación hombro-cadera-tobillo","puntos":["hombro_medio","cadera_media","tobillo_delantero"],"ideal":178,"holgura":8,"aviso_menos":"El cuerpo no está alineado: lleva el peso al centro del pie.","aviso_mas":""}]}]};
const AVISO_LEGAL = "Esto describe lo que ve la cámara. No es un diagnóstico ni sustituye a una clase con Verónica.";

// MoveNet devuelve los 17 puntos COCO. Se pasan a 0-1 con la Y hacia ARRIBA para
// poder usar tal cual la lógica de la app, donde «suelo» está 0,4 por debajo.
const COCO = {
  left_shoulder:'hombroI', right_shoulder:'hombroD', left_elbow:'codoI', right_elbow:'codoD',
  left_wrist:'munecaI', right_wrist:'munecaD', left_hip:'caderaI', right_hip:'caderaD',
  left_knee:'rodillaI', right_knee:'rodillaD', left_ankle:'tobilloI', right_ankle:'tobilloD',
};

function medio(p, a, b){
  if (p[a] && p[b]) return {x:(p[a].x+p[b].x)/2, y:(p[a].y+p[b].y)/2};
  return p[a] || p[b] || null;
}

// Mismos nombres que Postura.swift: si cambia alli, cambia aqui.
function punto(nombre, p){
  switch(nombre){
    case 'hombro_medio':      return medio(p,'hombroI','hombroD');
    case 'cadera_media':      return medio(p,'caderaI','caderaD');
    case 'cadera_delantera':  return p.caderaI || p.caderaD || null;
    case 'cadera_trasera':    return p.caderaD || p.caderaI || null;
    case 'rodilla_delantera': return p.rodillaI || p.rodillaD || null;
    case 'rodilla_trasera':   return p.rodillaD || p.rodillaI || null;
    case 'tobillo_delantero': return p.tobilloI || p.tobilloD || null;
    case 'tobillo_trasero':   return p.tobilloD || p.tobilloI || null;
    case 'hombro_delantero':  return p.hombroI || p.hombroD || null;
    case 'codo_delantero':    return p.codoI || p.codoD || null;
    case 'muneca_delantera':  return p.munecaI || p.munecaD || null;
    case 'suelo': {
      const c = medio(p,'caderaI','caderaD');
      return c ? {x:c.x, y:c.y - 0.4} : null;   // justo debajo de la cadera
    }
    default: return null;
  }
}

function angulo(a, v, b){
  const v1 = {x:a.x-v.x, y:a.y-v.y}, v2 = {x:b.x-v.x, y:b.y-v.y};
  const m1 = Math.hypot(v1.x, v1.y), m2 = Math.hypot(v2.x, v2.y);
  if (!m1 || !m2) return NaN;
  const cos = Math.max(-1, Math.min(1, (v1.x*v2.x + v1.y*v2.y)/(m1*m2)));
  return Math.acos(cos) * 180 / Math.PI;
}

function medir(criterio, puntos){
  const lecturas = [];
  for (const m of criterio.medidas){
    const a = punto(m.puntos[0], puntos), v = punto(m.puntos[1], puntos), b = punto(m.puntos[2], puntos);
    if (!a || !v || !b) continue;
    const g = angulo(a, v, b);
    if (Number.isNaN(g)) continue;
    let aviso = null;
    if (g < m.ideal - m.holgura && m.aviso_menos) aviso = m.aviso_menos;
    else if (g > m.ideal + m.holgura && m.aviso_mas) aviso = m.aviso_mas;
    lecturas.push({nombre:m.nombre, grados:g, ideal:m.ideal, holgura:m.holgura, aviso});
  }
  return lecturas;
}

let detector = null;
async function cargarDetector(){
  if (detector) return detector;
  await tf.setBackend('webgl').catch(() => tf.setBackend('cpu'));
  await tf.ready();
  detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet,
    {modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER});
  return detector;
}

const $ = id => document.getElementById(id);

function pintarEsqueleto(lienzo, img, kps){
  const ctx = lienzo.getContext('2d');
  const ancho = Math.min(img.naturalWidth, 900);
  const escala = ancho / img.naturalWidth;
  lienzo.width = ancho; lienzo.height = img.naturalHeight * escala;
  ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  const huesos = [['left_shoulder','right_shoulder'],['left_shoulder','left_elbow'],
    ['left_elbow','left_wrist'],['right_shoulder','right_elbow'],['right_elbow','right_wrist'],
    ['left_shoulder','left_hip'],['right_shoulder','right_hip'],['left_hip','right_hip'],
    ['left_hip','left_knee'],['left_knee','left_ankle'],['right_hip','right_knee'],
    ['right_knee','right_ankle']];
  const porNombre = {};
  for (const k of kps) if (k.score > 0.3) porNombre[k.name] = k;
  ctx.lineWidth = Math.max(2, ancho/260); ctx.strokeStyle = '#43809A'; ctx.lineCap = 'round';
  for (const [a,b] of huesos){
    if (!porNombre[a] || !porNombre[b]) continue;
    ctx.beginPath();
    ctx.moveTo(porNombre[a].x*escala, porNombre[a].y*escala);
    ctx.lineTo(porNombre[b].x*escala, porNombre[b].y*escala);
    ctx.stroke();
  }
  ctx.fillStyle = '#BC6242';
  for (const k of Object.values(porNombre)){
    ctx.beginPath(); ctx.arc(k.x*escala, k.y*escala, Math.max(3, ancho/170), 0, 7); ctx.fill();
  }
}

function contar(texto){ const n = $('postura-estado'); if (n) n.textContent = texto; }

async function analizar(fichero){
  const criterio = POSTURAS.posturas[$('postura-cual').value];
  $('postura-salida').replaceChildren();
  contar('Preparando el analizador… (la primera vez tarda un poco)');
  let img;
  try {
    img = await new Promise((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i); i.onerror = () => mal(new Error('imagen'));
      i.src = URL.createObjectURL(fichero);
    });
  } catch { contar('No he podido leer esa foto. Prueba con otra.'); return; }

  let poses;
  try {
    const det = await cargarDetector();
    contar('Midiendo…');
    poses = await det.estimatePoses(img, {maxPoses:1, flipHorizontal:false});
  } catch (e) {
    contar('No he podido cargar el analizador. Necesita conexión la primera vez que se usa.');
    return;
  }
  if (!poses || !poses.length){
    contar('No veo a nadie en la foto. Sal de cuerpo entero y con luz.');
    return;
  }
  const kps = poses[0].keypoints;
  pintarEsqueleto($('postura-lienzo'), img, kps);
  $('postura-lienzo').hidden = false;

  // A 0-1 con la Y hacia arriba, que es como mide la app.
  const p = {};
  for (const k of kps){
    if (k.score <= 0.3 || !COCO[k.name]) continue;
    p[COCO[k.name]] = {x: k.x / img.naturalWidth, y: 1 - k.y / img.naturalHeight};
  }
  const lecturas = medir(criterio, p);
  URL.revokeObjectURL(img.src);

  if (!lecturas.length){
    contar('Te veo, pero no distingo las articulaciones que hacen falta para esta postura. '
      + 'Prueba de cuerpo entero, ' + (criterio.encuadre || '') );
    return;
  }
  contar('');
  const caja = $('postura-salida');
  for (const l of lecturas){
    const fila = document.createElement('div');
    fila.className = 'lectura' + (l.aviso ? ' fuera' : '');
    const t = document.createElement('div'); t.className = 'lectura-cab';
    const nom = document.createElement('b'); nom.textContent = l.nombre;
    const g = document.createElement('span'); g.className = 'grados';
    g.textContent = Math.round(l.grados) + '° · objetivo ' + l.ideal + '° ±' + l.holgura;
    t.append(nom, g); fila.append(t);
    if (l.aviso){ const a = document.createElement('p'); a.textContent = l.aviso; fila.append(a); }
    caja.append(fila);
  }
  const pie = document.createElement('p'); pie.className = 'aviso'; pie.textContent = AVISO_LEGAL;
  caja.append(pie);
}

document.addEventListener('DOMContentLoaded', () => {
  const sel = $('postura-cual');
  if (!sel) return;
  POSTURAS.posturas.forEach((x, i) => {
    const o = document.createElement('option'); o.value = i; o.textContent = x.nombre; sel.append(o);
  });
  const pista = () => { $('postura-encuadre').textContent = POSTURAS.posturas[sel.value].encuadre || ''; };
  sel.addEventListener('change', pista); pista();
  $('postura-foto').addEventListener('change', ev => {
    const f = ev.target.files && ev.target.files[0];
    if (f) analizar(f);
  });
});
