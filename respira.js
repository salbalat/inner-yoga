
'use strict';

const CICLOS = 3;                 // tres respiraciones: suficiente para una media honesta
const MIN_FASE = 400;             // menos de esto es un clic, no una respiracion
const MAX_FASE = 25000;

const lienzo = document.getElementById('respira-lienzo');
if (lienzo) {
  const ctx = lienzo.getContext('2d');
  const zona = document.getElementById('respira-zona');
  const marcador = document.getElementById('respira-marcador');
  const instruccion = document.getElementById('respira-instruccion');
  const salida = document.getElementById('respira-salida');
  const anillos = [...document.querySelectorAll('.anillo')];
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let fase = 'espera';            // espera | inhala | exhala | fin
  let inicioFase = 0, ciclos = [], parcial = null;
  let apertura = 0, objetivo = 0; // 0..1, lo «lleno» que esta el pulmon
  let particulas = [], onda = [], t0 = 0, animando = false;
  let raton = {x: 0, y: 0};

  // ---- medida ------------------------------------------------------------
  function empezarInhalar(){
    if (fase === 'fin') reiniciar();
    if (fase === 'inhala') return;
    const ahora = performance.now();
    if (fase === 'exhala'){
      const dur = ahora - inicioFase;
      if (dur >= MIN_FASE && dur <= MAX_FASE && parcial){
        ciclos.push({inhala: parcial, exhala: dur});
        parcial = null;
        if (ciclos.length >= CICLOS){ terminar(); return; }
      }
    }
    fase = 'inhala'; inicioFase = ahora; objetivo = 1;
    instruccion.textContent = 'Inhala… suelta cuando empieces a soltar el aire';
    zona.dataset.fase = 'inhala';
    if (navigator.vibrate && !quieto) navigator.vibrate(12);
  }

  function empezarExhalar(){
    if (fase !== 'inhala') return;
    const dur = performance.now() - inicioFase;
    if (dur < MIN_FASE){ fase = 'espera'; objetivo = 0; instruccion.textContent = 'Mantén pulsado mientras inhalas.'; return; }
    parcial = Math.min(dur, MAX_FASE);
    fase = 'exhala'; inicioFase = performance.now(); objetivo = 0;
    instruccion.textContent = 'Exhala… vuelve a pulsar cuando tomes aire';
    zona.dataset.fase = 'exhala';
    if (navigator.vibrate && !quieto) navigator.vibrate(8);
  }

  function reiniciar(){
    fase = 'espera'; ciclos = []; parcial = null; objetivo = 0; onda = [];
    salida.replaceChildren(); salida.hidden = true;
    zona.dataset.fase = 'espera';
    instruccion.textContent = 'Mantén pulsado mientras inhalas.';
    marcador.textContent = '';
  }

  // ---- lo que devuelve ---------------------------------------------------
  function terminar(){
    fase = 'fin'; objetivo = 0;
    zona.dataset.fase = 'fin';
    instruccion.textContent = 'Toca para volver a medir.';
    const inh = ciclos.reduce((a,c)=>a+c.inhala,0) / ciclos.length / 1000;
    const exh = ciclos.reduce((a,c)=>a+c.exhala,0) / ciclos.length / 1000;
    const razon = exh / inh;
    const uno = n => n.toFixed(1).replace('.', ',');

    salida.replaceChildren();
    const cifras = document.createElement('div'); cifras.className = 'respira-cifras';
    for (const [valor, etiqueta] of [[uno(inh)+' s','inhalas'],[uno(exh)+' s','exhalas'],
                                     [uno(razon)+'×','exhalas respecto a inhalar']]){
      const c = document.createElement('div'); c.className = 'respira-cifra';
      const b = document.createElement('b'); b.textContent = valor;
      const s = document.createElement('span'); s.textContent = etiqueta;
      c.append(b, s); cifras.append(c);
    }
    salida.append(cifras);

    const lectura = document.createElement('p'); lectura.className = 'respira-lectura';
    lectura.textContent = 'Eso es lo que ha medido, sin más: ni bien ni mal. '
      + 'Tu respiración de hoy, en este momento y sentado frente a una pantalla.';
    salida.append(lectura);

    // Cierra con un pasaje comprobado, no con una frase mia.
    const ficha = (typeof FICHAS !== 'undefined')
      ? FICHAS.find(f => /esfuerzo no es controlar la respiraci/i.test(f.a || ''))
        || FICHAS.find(f => (f.t||[]).includes('respiracion') && f.b === 'El método de Verónica')
      : null;
    if (ficha){
      const cita = document.createElement('blockquote'); cita.className = 'respira-cita';
      cita.textContent = ficha.a;
      const pie = document.createElement('cite');
      pie.textContent = ficha.b + (ficha.au ? ' · ' + ficha.au : '') + ' — ' + ficha.l;
      cita.append(pie); salida.append(cita);
    }
    salida.hidden = false;
    if (navigator.vibrate && !quieto) navigator.vibrate([10, 40, 10]);
  }

  // ---- pintura -----------------------------------------------------------
  function medidas(){
    const r = lienzo.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    lienzo.width = r.width * dpr; lienzo.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  }
  let caja = medidas();
  addEventListener('resize', () => { caja = medidas(); });

  function nacerParticula(){
    const ang = Math.random() * Math.PI * 2;
    return { ang, radio: 0.95 + Math.random() * 0.5, z: Math.random(),
             vida: 0, giro: (Math.random() - 0.5) * 0.004 };
  }
  for (let i = 0; i < 46; i++){ const p = nacerParticula(); p.vida = Math.random(); particulas.push(p); }

  function pintar(ahora){
    if (!animando) return;
    const dt = Math.min((ahora - t0) || 16, 50); t0 = ahora;
    const w = caja.width, h = caja.height;
    const cx = w / 2, cy = h * 0.46;
    const base = Math.min(w, h) * 0.20;

    // La apertura persigue al objetivo: el aire no salta, entra.
    apertura += (objetivo - apertura) * Math.min(1, dt / (fase === 'inhala' ? 900 : 1500));
    const radio = base * (0.62 + apertura * 0.55);

    ctx.clearRect(0, 0, w, h);

    // Aire: entra al inhalar, sale al exhalar. La z da la profundidad.
    if (!quieto){
      for (const p of particulas){
        p.ang += p.giro * dt;
        const dir = fase === 'inhala' ? -1 : (fase === 'exhala' ? 1 : 0);
        p.radio += dir * 0.00022 * dt * (0.5 + p.z);
        if (p.radio < 0.35 || p.radio > 1.7){ Object.assign(p, nacerParticula()); continue; }
        const rr = radio * p.radio * (0.75 + p.z * 0.5);
        const x = cx + Math.cos(p.ang) * rr, y = cy + Math.sin(p.ang) * rr * 0.82;
        const tam = (0.7 + p.z * 1.9) * (1 + apertura * 0.4);
        ctx.globalAlpha = 0.10 + p.z * 0.30;
        ctx.fillStyle = '#43809A';
        ctx.beginPath(); ctx.arc(x, y, tam, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // La onda, como un sismografo: es SU respiracion, trazo a trazo.
    if (fase === 'inhala' || fase === 'exhala'){
      onda.push(apertura);
      if (onda.length > 260) onda.shift();
    }
    if (onda.length > 1){
      const y0 = h * 0.88, alto = h * 0.17, ancho = w * 0.82, x0 = (w - ancho) / 2;
      ctx.beginPath();
      onda.forEach((v, i) => {
        const x = x0 + (i / (onda.length - 1)) * ancho;
        const y = y0 - v * alto;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.strokeStyle = '#1B3A5C'; ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Los tres anillos = sus tres pilares, cada uno en su plano.
    anillos.forEach((el, i) => {
      const escala = 1 + apertura * (0.16 + i * 0.07);
      const prof = (i - 1) * 16;
      const px = quieto ? 0 : raton.x * (6 + i * 5);
      const py = quieto ? 0 : raton.y * (6 + i * 5);
      el.style.transform =
        `translate3d(${px}px, ${py}px, ${prof}px) scale(${escala.toFixed(3)})`;
      el.style.opacity = String(0.34 + apertura * 0.5 + i * 0.05);
    });

    // El contador vivo: lo que lleva en esta fase.
    if (fase === 'inhala' || fase === 'exhala'){
      const s = (performance.now() - inicioFase) / 1000;
      marcador.textContent = s.toFixed(1).replace('.', ',') + ' s';
    }

    requestAnimationFrame(pintar);
  }

  function arrancar(){ if (!animando){ animando = true; t0 = performance.now(); requestAnimationFrame(pintar); } }
  function parar(){ animando = false; }

  // Solo se anima cuando se ve: ni gasta bateria ni calienta el movil.
  if ('IntersectionObserver' in window){
    new IntersectionObserver(es => { es[0].isIntersecting ? arrancar() : parar(); },
                             {threshold: 0.12}).observe(lienzo);
  } else arrancar();

  // ---- mandos ------------------------------------------------------------
  zona.addEventListener('pointerdown', ev => { ev.preventDefault(); zona.setPointerCapture(ev.pointerId); empezarInhalar(); });
  zona.addEventListener('pointerup', () => empezarExhalar());
  zona.addEventListener('pointercancel', () => empezarExhalar());
  zona.addEventListener('pointerleave', () => { if (fase === 'inhala') empezarExhalar(); });
  zona.addEventListener('keydown', ev => { if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat){ ev.preventDefault(); empezarInhalar(); } });
  zona.addEventListener('keyup', ev => { if (ev.key === ' ' || ev.key === 'Enter'){ ev.preventDefault(); empezarExhalar(); } });

  // El cursor de la zona: un punto fijo, como el drishti.
  if (!quieto && matchMedia('(hover: hover)').matches){
    zona.addEventListener('pointermove', ev => {
      const r = zona.getBoundingClientRect();
      raton.x = ((ev.clientX - r.left) / r.width - 0.5) * 2;
      raton.y = ((ev.clientY - r.top) / r.height - 0.5) * 2;
      zona.style.setProperty('--px', (ev.clientX - r.left) + 'px');
      zona.style.setProperty('--py', (ev.clientY - r.top) + 'px');
    });
    zona.addEventListener('pointerleave', () => { raton = {x: 0, y: 0}; });
  }
}
