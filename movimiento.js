
'use strict';
(function(){
  const raiz = document.documentElement;
  const quieto = matchMedia('(prefers-reduced-motion: reduce)');

  function arrancar(){
    if (quieto.matches) return;                 // el usuario ha pedido calma
    raiz.classList.add('mov', 'cargando');

    // La coreografia de entrada dura lo que dura; luego se quita la clase para que
    // no vuelva a dispararse al navegar por anclas.
    setTimeout(() => raiz.classList.remove('cargando'), 1700);

    // Lo que aparece al desplazar. Los titulos, los parrafos guia y las piezas: nunca
    // texto largo, que leer algo que se mueve molesta.
    const candidatos = document.querySelectorAll(
      'section > h2, section > .cursiva, section > .lead, .filete, .rejilla, .cifras,' +
      ' .pasos, .promesas, .chips, .campo, .qr-caja, .como, .grupo, .disco-caja,' +
      ' .cita-grande, .contacto .llamada, .contacto .nombre, .contacto .botones,' +
      ' #respira-zona, .postura-mandos, .trabajo, ul.ayuda');

    const porSeccion = new Map();
    candidatos.forEach(el => {
      if (el.closest('.portada, .retrato')) return;   // la portada ya tiene su entrada
      el.setAttribute('data-entra', '');
      const s = el.closest('section') || document.body;
      if (!porSeccion.has(s)) porSeccion.set(s, []);
      porSeccion.get(s).push(el);
    });

    const ojo = new IntersectionObserver((entradas) => {
      for (const e of entradas){
        if (!e.isIntersecting) continue;
        const el = e.target;
        // Escalonado dentro de su seccion, con tope: pasado el quinto, todos a la vez.
        const hermanos = porSeccion.get(el.closest('section') || document.body) || [];
        const i = Math.min(hermanos.indexOf(el), 4);
        el.style.transitionDelay = (i > 0 ? i * 70 : 0) + 'ms';
        el.classList.add('visible');
        ojo.unobserve(el);                     // una vez y se acabo
      }
    }, {rootMargin: '0px 0px -8% 0px', threshold: 0.05});

    candidatos.forEach(el => { if (el.hasAttribute('data-entra')) ojo.observe(el); });

    // SEGURO. Un sistema de movimiento no puede esconder contenido, nunca. Ni
    // requestAnimationFrame ni IntersectionObserver corren en una pestana oculta, asi
    // que si alguien abre la pagina en segundo plano y luego va a ella, lo de arriba
    // podria quedarse invisible. Este barrido marca lo que este en pantalla y se
    // dispara por cuatro caminos distintos; ademas, a los 3 segundos se destapa TODO
    // lo que quede, aunque no se haya visto: mejor sin animar que sin leer.
    function barrer(){
      document.querySelectorAll('[data-entra]:not(.visible)').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < innerHeight * 0.95 && r.bottom > -40){ el.classList.add('visible'); ojo.unobserve(el); }
      });
    }
    function destapar(){
      document.querySelectorAll('[data-entra]:not(.visible)').forEach(el => {
        el.style.transitionDelay = '0ms';
        el.classList.add('visible');
        ojo.unobserve(el);
      });
    }
    requestAnimationFrame(barrer);
    addEventListener('load', barrer, {once: true});
    addEventListener('scroll', barrer, {passive: true});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) barrer(); });
    setTimeout(destapar, 3000);
  }

  // Ir a una seccion: el destino se ilumina un instante para que la vista aterrice.
  function aterrizar(destino){
    if (!destino || quieto.matches) return;
    destino.classList.remove('aterriza');
    void destino.offsetWidth;                  // reinicia la animacion
    destino.classList.add('aterriza');
    setTimeout(() => destino.classList.remove('aterriza'), 1500);
  }
  window.__aterrizar = aterrizar;

  document.addEventListener('click', ev => {
    const a = ev.target.closest('a[href^="#"]');
    if (!a) return;
    const destino = document.querySelector(a.getAttribute('href'));
    if (destino) aterrizar(destino);
  });

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();

  // Si cambia la preferencia a mitad de sesion, se obedece al momento.
  quieto.addEventListener('change', e => {
    if (e.matches) raiz.classList.remove('mov', 'cargando');
    else arrancar();
  });
})();
