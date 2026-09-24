
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
  let grabadora = null, trozos = [], flujo = null;

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
    let tipo = 'audio/webm';
    if (window.MediaRecorder && !MediaRecorder.isTypeSupported(tipo)) tipo = 'audio/mp4';
    try {
      grabadora = new MediaRecorder(flujo, {mimeType: tipo});
    } catch (e) {
      try { grabadora = new MediaRecorder(flujo); } catch (e2) {
        poner('quieto', 'Este navegador no sabe grabar. Escríbele más abajo.');
        return;
      }
    }
    grabadora.ondataavailable = ev => { if (ev.data && ev.data.size) trozos.push(ev.data); };
    grabadora.onstop = enviarGrabacion;
    grabadora.start();
    poner('escuchando', 'Te escucho… toca otra vez cuando acabes.');

    // Por si se olvida de parar: un minuto es de sobra para una pregunta.
    setTimeout(() => { if (fase === 'escuchando') pararEscucha(); }, 60000);
  }

  function pararEscucha(){
    try { grabadora && grabadora.state === 'recording' && grabadora.stop(); } catch (e) {}
  }

  async function enviarGrabacion(){
    const audio = new Blob(trozos, {type: (grabadora && grabadora.mimeType) || 'audio/webm'});
    if (!audio.size){ poner('quieto', 'No he cogido nada. Toca y habla.'); return; }
    poner('pensando', 'Un momento…');
    try {
      const _diag = 'tipo=' + (audio.type||'?') + ' bytes=' + audio.size
        + ' trozos=' + trozos.length + ' rec=' + (grabadora && grabadora.mimeType);
      const r = await fetch(AGENTE + '/api/dictar', {
        method: 'POST',
        headers: {'Content-Type': audio.type || 'audio/webm'},
        body: audio,
      });
      if (!r.ok) {
        let _t = ''; try { _t = (await r.text()).slice(0,180); } catch(e){}
        poner('quieto', 'DIAG ' + _diag + ' | ' + r.status + ' ' + _t);
        return;
      }
      const d = await r.json();
      const pregunta = (d.texto || '').trim();
      if (!pregunta){ poner('quieto', 'No te he entendido. Prueba otra vez.'); return; }
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
