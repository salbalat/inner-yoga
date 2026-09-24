
'use strict';
(function(){
  const zona = document.getElementById('hablar-zona');
  if (!zona) return;

  const lienzo = document.getElementById('hablar-lienzo');
  const ctx = lienzo.getContext('2d');
  const estado = document.getElementById('hablar-estado');
  const hilo = document.getElementById('hablar-hilo');
  const anillos = [...document.querySelectorAll('#hablar-zona .anillo')];
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let audioCtx = null, analizador = null, datos = null, micro = null;
  let animando = false, t0 = 0;
  let bandas = [0, 0, 0];          // graves, medios, agudos: cuerpo, respiracion, mente
  let fase = 'quieto';             // quieto | escuchando | pensando | hablando
  let sonando = null;

  // ---- la figura -----------------------------------------------------------
  function medidas(){
    const r = lienzo.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    lienzo.width = r.width * dpr; lienzo.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  }
  let caja = medidas();
  addEventListener('resize', () => { caja = medidas(); });

  function pintar(ahora){
    if (!animando) return;
    const dt = Math.min((ahora - t0) || 16, 50); t0 = ahora;
    const w = caja.width, h = caja.height, cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    if (analizador){
      analizador.getByteFrequencyData(datos);
      const n = datos.length;
      // Tres tercios del espectro. No es adorno: es lo que suena de verdad.
      const media = (a, b) => {
        let s = 0; for (let i = a; i < b; i++) s += datos[i];
        return (s / (b - a)) / 255;
      };
      const nuevas = [media(0, n * 0.12), media(n * 0.12, n * 0.4), media(n * 0.4, n)];
      for (let i = 0; i < 3; i++) bandas[i] += (nuevas[i] - bandas[i]) * Math.min(1, dt / 90);
    } else {
      for (let i = 0; i < 3; i++) bandas[i] *= 0.92;
    }

    // Ondas concentricas cuando hay voz: se ve que la esta oyendo.
    const energia = (bandas[0] + bandas[1] + bandas[2]) / 3;
    if (!quieto && energia > 0.02){
      const base = Math.min(w, h) * 0.18;
      for (let k = 0; k < 3; k++){
        const r = base * (1 + k * 0.55 + energia * 1.6);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7);
        ctx.strokeStyle = '#43809A';
        ctx.globalAlpha = Math.max(0, (0.22 - k * 0.06) * energia * 3);
        ctx.lineWidth = 1.2; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    anillos.forEach((el, i) => {
      const e = bandas[i] || 0;
      const escala = 1 + e * 0.30;
      const giro = quieto ? 0 : (i - 1) * e * 6;
      el.style.transform = `translate3d(0,0,${(i - 1) * 14}px) scale(${escala.toFixed(3)}) rotate(${giro.toFixed(2)}deg)`;
      el.style.opacity = String(0.30 + e * 0.65);
    });

    requestAnimationFrame(pintar);
  }
  function arrancarPintura(){ if (!animando){ animando = true; t0 = performance.now(); requestAnimationFrame(pintar); } }
  function pararPintura(){ animando = false; }

  // ---- escuchar ------------------------------------------------------------
  // NO se usa el reconocimiento del navegador. En iOS tiene un fallo conocido: tras
  // reproducir audio, el microfono se queda bloqueado y no vuelve a reconocer. Y aqui
  // ella habla antes de escuchar, asi que caiamos justo en ese caso. Se graba el audio
  // y lo transcribe el servidor: igual de bien en cualquier navegador.
  let grabadora = null, trozos = [], flujo = null, flujoGrabar = null;
  // Captura propia, por si MediaRecorder no entrega nada. En iOS devuelve un
  // envase vacio (bytes=0, trozos=0) y no hay manera de sacarle audio; de aqui
  // SI sale, porque es el mismo grafo que mueve los tres circulos. El WAV se
  // arma a mano, y el servidor ya lo acepta: /api/dictar transcribe wav.
  let capturador = null, pcm = [], pcmN = 0, capturando = false, nivelMax = 0;

  async function abrirMicro(){
    if (flujo) return true;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({audio: true});
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      micro = audioCtx.createMediaStreamSource(flujo);
      analizador = audioCtx.createAnalyser();
      analizador.fftSize = 512;
      analizador.smoothingTimeConstant = 0.8;
      datos = new Uint8Array(analizador.frequencyBinCount);
      micro.connect(analizador);
      // Un nodo que copia lo que entra. Va a volumen CERO y de ahi a la salida:
      // sin conectarlo a algun destino no se ejecuta, y a volumen normal se
      // oiria a si misma.
      try {
        capturador = audioCtx.createScriptProcessor(4096, 1, 1);
        capturador.onaudioprocess = (ev) => {
          if (!capturando) return;
          const dentro = ev.inputBuffer.getChannelData(0);
          let pico = 0;
          for (let i = 0; i < dentro.length; i++){
            const v = Math.abs(dentro[i]);
            if (v > pico) pico = v;
          }
          if (pico > nivelMax) nivelMax = pico;
          if (pcmN < 48000 * 70){ pcm.push(new Float32Array(dentro)); pcmN += dentro.length; }
        };
        const mudo = audioCtx.createGain();
        mudo.gain.value = 0;
        micro.connect(capturador);
        capturador.connect(mudo);
        mudo.connect(audioCtx.destination);
      } catch (e) { capturador = null; }
      return true;
    } catch (e) {
      estado.textContent = 'No me dejas usar el micrófono. Puedes escribirle más abajo.';
      return false;
    }
  }

  function poner(clase, texto){
    fase = clase;
    zona.dataset.fase = clase;
    if (texto != null) estado.textContent = texto;
  }

  async function escuchar(){
    if (fase === 'escuchando'){ pararEscucha(); return; }
    if (fase === 'pensando') return;
    if (sonando){ sonando.pause(); sonando = null; }      // que no se oiga a si misma
    if (!await abrirMicro()) return;
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    arrancarPintura();

    trozos = [];
    // SAFARI DE iOS MIENTE con 'audio/webm': isTypeSupported() dice que si, el
    // MediaRecorder se crea con mimeType 'audio/webm; codecs=' (sin codec) y graba
    // CINCO BYTES. El servidor recibia ese fichero y OpenAI respondia «Invalid file
    // format», y en la pagina salia «No he podido entender el audio» sin mas pista.
    // Por eso se prueba mp4 PRIMERO —que es lo que Safari graba de verdad— y solo
    // despues webm CON codec declarado, que es la forma en que los demas navegadores
    // contestan la verdad. 'audio/webm' a secas se queda el ultimo, ya sin fiarse.
    let tipo = '';
    if (window.MediaRecorder){
      for (const t of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm']){
        if (MediaRecorder.isTypeSupported(t)){ tipo = t; break; }
      }
    }
    // EL GRABADOR SE LLEVA SU PROPIA COPIA DEL MICROFONO.
    // En iOS, si el mismo MediaStream esta conectado a un AudioContext —aqui lo esta,
    // para que los tres circulos se muevan con la voz— el MediaRecorder se queda sin
    // audio y devuelve un fichero de nada. Probado en el iPhone de Salvador: 15
    // segundos hablando y menos de 1 KB. Con una copia propia (`clone()`), el grafo
    // de los circulos y la grabacion dejan de pisarse.
    flujoGrabar = flujo.clone();
    try {
      grabadora = tipo ? new MediaRecorder(flujoGrabar, {mimeType: tipo})
                       : new MediaRecorder(flujoGrabar);
    } catch (e) {
      try { grabadora = new MediaRecorder(flujoGrabar); } catch (e2) {
        poner('quieto', 'Este navegador no sabe grabar. Escríbele más abajo.');
        return;
      }
    }
    grabadora.ondataavailable = ev => { if (ev.data && ev.data.size) trozos.push(ev.data); };
    grabadora.onstop = enviarGrabacion;
    // Con trozo cada segundo. Sin `timeslice`, Safari entrega un solo bloque al
    // parar y a veces sale vacio; pidiendolo por partes, el audio va saliendo.
    pcm = []; pcmN = 0; nivelMax = 0; capturando = true;
    grabadora.start(1000);
    poner('escuchando', 'Te escucho… toca otra vez cuando acabes.');

    // Por si se olvida de parar: un minuto es de sobra para una pregunta.
    setTimeout(() => { if (fase === 'escuchando') pararEscucha(); }, 60000);
  }

  function pararEscucha(){
    try { grabadora && grabadora.state === 'recording' && grabadora.stop(); } catch (e) {}
  }

  // De los trozos a un WAV de 16 bits: lo mas facil de leer para cualquiera, y
  // lo que el servidor ya transcribe sin tocar nada.
  function armarWav(){
    if (!pcmN) return null;
    const todo = new Float32Array(pcmN);
    let k = 0;
    for (const t of pcm){ todo.set(t, k); k += t.length; }
    const hz = (audioCtx && audioCtx.sampleRate) || 48000;
    const b = new ArrayBuffer(44 + todo.length * 2);
    const v = new DataView(b);
    const txt = (pos, t) => { for (let i = 0; i < t.length; i++) v.setUint8(pos + i, t.charCodeAt(i)); };
    txt(0, 'RIFF'); v.setUint32(4, 36 + todo.length * 2, true); txt(8, 'WAVE');
    txt(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, hz, true);
    v.setUint32(28, hz * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    txt(36, 'data'); v.setUint32(40, todo.length * 2, true);
    for (let i = 0; i < todo.length; i++){
      const x = Math.max(-1, Math.min(1, todo[i]));
      v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    }
    return new Blob([b], {type: 'audio/wav'});
  }

  function soltarCopia(){
    if (flujoGrabar){ flujoGrabar.getTracks().forEach(t => t.stop()); flujoGrabar = null; }
  }

  async function enviarGrabacion(){
    capturando = false;
    soltarCopia();                 // la copia ya ha hecho su trabajo
    let audio = new Blob(trozos, {type: (grabadora && grabadora.mimeType) || 'audio/webm'});
    // Si el grabador del navegador no ha dado nada —iOS—, va lo que capturamos
    // nosotros. Es el mismo audio que mueve los circulos, asi que si los
    // circulos se movian, aqui hay voz.
    let porNuestraCuenta = false;
    if (audio.size < 1024){
      const wav = armarWav();
      if (wav && wav.size > 1024){ audio = wav; porNuestraCuenta = true; }
    }
    // Diagnostico bajo demanda: solo con ?diag=1 en la direccion. Sirve para saber
    // QUE se ha grabado cuando algo falla, sin ensenarle numeros a nadie mas.
    const DIAG = /[?&]diag=1/.test(location.search);
    const parte = 'graba=' + (grabadora && grabadora.mimeType) + ' bytes=' + audio.size
      + ' trozos=' + trozos.length + ' wav=' + (porNuestraCuenta ? 'si' : 'no')
      + ' nivel=' + nivelMax.toFixed(3) + ' muestras=' + pcmN;

    // Menos de 1 KB no es una pregunta: es un envase vacio. Paso justo con el webm
    // falso de Safari (5 bytes). Mejor decirlo aqui que mandarlo y recibir un error
    // del que no se entiende nada.
    if (audio.size < 1024){
      poner('quieto', DIAG ? ('VACIO · ' + parte) : 'No he cogido nada. Toca y habla.');
      return;
    }
    poner('pensando', 'Un momento…');
    try {
      const r = await fetch(AGENTE + '/api/dictar', {
        method: 'POST',
        headers: {'Content-Type': audio.type || 'audio/webm'},
        body: audio,
      });
      if (!r.ok) {
        if (DIAG){
          let t = ''; try { t = (await r.text()).slice(0, 200); } catch (e) {}
          poner('quieto', 'FALLO ' + r.status + ' · ' + parte + ' · ' + t);
          return;
        }
        throw new Error(r.status);
      }
      const d = await r.json();
      const pregunta = (d.texto || '').trim();
      if (!pregunta){
        poner('quieto', DIAG ? ('SIN TEXTO · ' + parte) : 'No te he entendido. Prueba otra vez.');
        return;
      }
      responderHablando(pregunta);
    } catch (e) {
      poner('quieto', 'No he podido entender el audio. Prueba otra vez o escríbele.');
    }
  }

  // ---- contestar -----------------------------------------------------------
  function burbuja(clase, texto){
    const d = document.createElement('div');
    d.className = 'hablar-' + clase;
    d.textContent = texto;
    hilo.appendChild(d);
    hilo.scrollTop = hilo.scrollHeight;
    return d;
  }

  async function responderHablando(pregunta){
    poner('pensando', 'Un momento…');
    burbuja('yo', pregunta);
    const suya = burbuja('ella', 'Pensando…');

    let texto = null;
    try {
      const r = await fetch(AGENTE + '/api/publico', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message: pregunta}),
      });
      if (r.ok){ const d = await r.json(); if (d && d.answer && !d.error) texto = d.answer; }
    } catch (e) {}

    if (!texto){
      // Sin servidor, las fichas de la propia pagina: las mismas 642.
      const local = (typeof buscar === 'function') ? buscar(pregunta) : [];
      texto = local.length
        ? local.map(f => f.a).join(' ')
        : 'De esto no tengo aún pasaje comprobado. Lo consultaré con Verónica.';
    }
    suya.textContent = texto;

    // Y lo dice con su voz, si el servidor puede.
    try {
      const v = await fetch(AGENTE + '/api/voz', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({text: texto}),
      });
      if (!v.ok) throw new Error('sin voz');
      const audio = new Audio(URL.createObjectURL(await v.blob()));
      sonando = audio;
      // Su voz mueve los mismos anillos: el analizador pasa del micro al audio.
      if (audioCtx){
        const fuente = audioCtx.createMediaElementSource(audio);
        fuente.connect(analizador);
        analizador.connect(audioCtx.destination);
      }
      poner('hablando', 'Escucha…');
      audio.onended = () => { sonando = null; poner('quieto', 'Toca y pregúntale otra cosa.'); };
      await audio.play();
    } catch (e) {
      // Sin voz —servidor caido o sin cuota— se dice, en vez de callar y dejar
      // al usuario esperando un audio que no va a llegar.
      poner('quieto', 'Ahora no puedo ponerte su voz. La respuesta está escrita aquí.');
    }
  }

  // ---- mandos --------------------------------------------------------------
  zona.addEventListener('click', escuchar);
  zona.addEventListener('keydown', ev => {
    if (ev.key === ' ' || ev.key === 'Enter'){ ev.preventDefault(); escuchar(); }
  });

  // Solo se anima cuando se ve.
  if ('IntersectionObserver' in window){
    new IntersectionObserver(es => { es[0].isIntersecting ? arrancarPintura() : pararPintura(); },
                             {threshold: 0.15}).observe(zona);
  }
})();
