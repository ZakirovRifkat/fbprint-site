/* FB-print: меню, закреплённая шапка, протяжка полотна, форма заявки,
   живой пробный оттиск и видео изготовления форм.
   Страница работает и без скрипта: заявка уходит обычным POST,
   оттиск показывает этикетку без лупы и переключателей красок. */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Мобильное меню */
  var burger = document.querySelector('.burger');
  var menu = document.getElementById('site-menu');

  if (burger && menu) {
    var setOpen = function (open) {
      menu.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    };

    burger.addEventListener('click', function () {
      setOpen(burger.getAttribute('aria-expanded') !== 'true');
    });

    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        burger.focus();
      }
    });

    // Меню — только мобильная раскладка: на десктопе состояние сбрасывается.
    var wide = window.matchMedia('(min-width: 961px)');
    var reset = function (event) { if (event.matches) setOpen(false); };
    if (wide.addEventListener) wide.addEventListener('change', reset);
    else if (wide.addListener) wide.addListener(reset);
  }

  /* Переключатель темы: выбор запоминается в браузере */
  var themeButton = document.querySelector('[data-theme-toggle]');
  if (themeButton) {
    var root = document.documentElement;
    var isDark = function () { return root.getAttribute('data-theme') === 'dark'; };
    var chrome = document.querySelector('meta[name="theme-color"]');
    var syncTheme = function () {
      var dark = isDark();
      themeButton.setAttribute('aria-pressed', String(dark));
      themeButton.title = dark ? 'Светлая тема' : 'Тёмная тема';
      if (chrome) chrome.setAttribute('content', dark ? '#181143' : '#f6f5f1');
    };
    themeButton.hidden = false;
    syncTheme();
    themeButton.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      if (next === 'dark') root.setAttribute('data-theme', 'dark');
      else root.removeAttribute('data-theme');
      try { localStorage.setItem('fb-theme', next); } catch (e) {}
      syncTheme();
      document.dispatchEvent(new CustomEvent('fb-theme-change'));
    });
  }

  /* Тень у закреплённой шапки после начала прокрутки */
  var header = document.querySelector('[data-header]');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* Протяжка полотна: запускается, когда секция услуг появляется в экране */
  var line = document.querySelector('[data-animate-line]');
  if (line && 'IntersectionObserver' in window) {
    var lineObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        lineObserver.unobserve(entry.target);
      });
    }, { threshold: 0.35 });
    lineObserver.observe(line);
  }

  /* Подпись выбранных файлов макета */
  var fileInput = document.getElementById('f-file');
  var fileHint = document.querySelector('[data-file-hint]');
  if (fileInput && fileHint) {
    var drop = document.querySelector('label[for="f-file"]');
    var defaultHint = fileHint.textContent;
    fileInput.addEventListener('change', function () {
      var names = Array.prototype.map.call(fileInput.files, function (f) { return f.name; });
      fileHint.textContent = names.length ? names.join(', ') : defaultHint;
      if (drop) drop.classList.toggle('has-files', names.length > 0);
    });
  }

  /* Живая вставка в парке оборудования: крутится, только пока видна.
     При «уменьшить движение» и без скрипта остаётся постер-кадр */
  var clips = document.querySelectorAll('video[data-autoplay]');
  if (clips.length && 'IntersectionObserver' in window) {
    var clipObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var video = entry.target;
        if (entry.isIntersecting && !reduceMotion.matches) {
          var playing = video.play();
          if (playing && playing.catch) playing.catch(function () {});
        } else {
          video.pause();
        }
      });
    }, { threshold: 0.25 });
    Array.prototype.forEach.call(clips, function (video) { clipObserver.observe(video); });
  }

  /* Отправка заявки без перезагрузки и штамп «Утверждено» */
  if (window.fetch && window.FormData) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-form]'), function (form) {
      var submit = form.querySelector('button[type="submit"]');
      var label = submit && submit.querySelector('.btn__label');
      var idle = label ? label.textContent : '';
      var status = form.querySelector('[data-form-status]');
      var body = form.querySelector('[data-form-body]');
      var sent = form.querySelector('[data-form-sent]');
      var stamp = form.querySelector('[data-stamp]');

      var setState = function (state) {
        form.setAttribute('data-state', state);
        var busy = state === 'submitting';
        if (submit) submit.disabled = busy;
        if (busy) form.setAttribute('aria-busy', 'true');
        else form.removeAttribute('aria-busy');
        if (label) label.textContent = busy ? 'Отправляем' : idle;
      };

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (form.getAttribute('data-state') === 'submitting') return;
        if (status) status.textContent = '';
        setState('submitting');

        fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { 'Accept': 'application/json' }
        })
          .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            setState('sent');
            if (body) body.hidden = true;
            if (sent) { sent.hidden = false; sent.focus(); }
            if (stamp) { stamp.hidden = false; stamp.classList.add('is-landing'); }
          })
          .catch(function () {
            setState('error');
            if (status) {
              status.textContent = 'Не получилось отправить заявку. Попробуйте ещё раз или напишите на info@fb-print.ru.';
            }
          });
      });
    });
  }

  /* ---------- Пробный оттиск: краски и лупа ---------- */

  var proof = document.querySelector('[data-proof]');
  var box = proof && proof.querySelector('[data-label]');
  var art = proof && proof.querySelector('[data-art]');
  var controls = proof && proof.querySelector('[data-proof-controls]');
  if (!proof || !box || !art) return;

  var VB_W = 480, VB_H = 300;   // единицы этикетки (viewBox)
  var RES = 3;                  // точек растра на единицу при снятии покрытия
  var PITCH = 6;                // шаг растра красок в единицах этикетки
  // Все краски, включая логотип и текст, на одной линиатуре: точки одного размера
  var PITCHES = { c: PITCH, m: PITCH, y: PITCH, k: PITCH };
  var SOLID_DOT = 0.72;         // плашка под лупой — плотный растр из целых точек, почти касаются
  var ZOOM = 3.8;
  var INKS = { c: '#00a7e1', m: '#e4007c', y: '#ffc600', k: '#181143' };
  // В тёмной теме этикетка на тёмной плёнке: краски светятся, логотип и текст белые
  function darkTheme() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
  function themeKey() { return darkTheme() ? 'dark' : 'light'; }
  function inkColor(id) { return id === 'k' && darkTheme() ? '#ffffff' : INKS[id]; }
  // Краски перемножаются между собой; белая на тёмной плёнке ложится поверх
  function blendFor(id) { return id === 'k' && darkTheme() ? 'source-over' : 'multiply'; }
  // Углы поворота растра: голубая 15°, пурпурная 75°, жёлтая 0°, чернила 45°
  var ANGLE = { c: 15, m: 75, y: 0, k: 45 };
  var PLATES = ['y', 'm', 'c', 'k'];
  var SOLID = 245;              // от этого покрытия краска лежит плашкой
  var off = { c: false, m: false, y: false, k: false };
  var live = false;

  /* Переключатели красок и подсказка, как ими пользоваться */
  if (controls) {
    controls.hidden = false;
    Array.prototype.forEach.call(proof.querySelectorAll('[data-proof-howto]'), function (el) { el.hidden = false; });
    Array.prototype.forEach.call(controls.querySelectorAll('[data-ink]'), function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-ink');
        var on = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(on));
        off[id] = !on;
        art.classList.toggle('no-' + id, !on);
        if (live) draw();
      });
    });
  }

  if (!window.HTMLCanvasElement || !window.Promise) return;

  var W0 = VB_W * RES, H0 = VB_H * RES;
  var cov = {};      // покрытие краски, 0–255 на точку
  var near = {};     // 1 — плашка или её край: здесь растровых точек нет
  var maps = {};     // покрытие по темам: в тёмной теме у кругов плотнее края
  var inksLayer = document.createElement('canvas');   // слой красок, как группа .label__inks на странице
  var loupe = document.createElement('canvas');
  loupe.className = 'loupe';
  loupe.setAttribute('aria-hidden', 'true');
  box.appendChild(loupe);

  var W = 0, H = 0, scale = 1, RL = 84, dpr = 1;
  var pos = { x: 0, y: 0 };
  var target = { x: 0, y: 0 };
  var moved = false;
  var frame = 0;

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // Расширяет маску на d точек: край буквы относится к плашке, а не к растру
  function dilate(src, w, h, d) {
    var tmp = new Uint8Array(w * h);
    var out = new Uint8Array(w * h);
    var x, y, i, last;
    for (y = 0; y < h; y++) {
      last = -1e9;
      for (x = 0; x < w; x++) { i = y * w + x; if (src[i]) last = x; if (x - last <= d) tmp[i] = 1; }
      last = 1e9;
      for (x = w - 1; x >= 0; x--) { i = y * w + x; if (src[i]) last = x; if (last - x <= d) tmp[i] = 1; }
    }
    for (x = 0; x < w; x++) {
      last = -1e9;
      for (y = 0; y < h; y++) { i = y * w + x; if (tmp[i]) last = y; if (y - last <= d) out[i] = 1; }
      last = 1e9;
      for (y = h - 1; y >= 0; y--) { i = y * w + x; if (tmp[i]) last = y; if (last - y <= d) out[i] = 1; }
    }
    return out;
  }

  // Покрытие краски снимается с той же векторной формы, что видна на странице.
  // Текст дорисовывается на холсте: в SVG-картинке веб-шрифты не загружаются.
  function rasterize(id) {
    return new Promise(function (resolve, reject) {
      var plate = art.querySelector('[data-plate="' + id + '"]');
      var defs = art.querySelector('defs');
      if (!plate || !defs) { reject(new Error('plate')); return; }
      var shape = plate.cloneNode(true);
      Array.prototype.forEach.call(shape.querySelectorAll('text'), function (t) { t.remove(); });
      var texts = Array.prototype.slice.call(plate.querySelectorAll('text'));
      // Прозрачность градиентов берётся из действующих стилей: она зависит от темы
      var defsCopy = defs.cloneNode(true);
      var stops = defs.querySelectorAll('stop');
      Array.prototype.forEach.call(defsCopy.querySelectorAll('stop'), function (stop, i) {
        stop.setAttribute('stop-opacity', getComputedStyle(stops[i]).stopOpacity);
      });
      var markup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VB_W + ' ' + VB_H + '" width="' + W0 + '" height="' + H0 + '">' +
        defsCopy.outerHTML + '<g clip-path="url(#label-shape)">' + shape.outerHTML + '</g></svg>';
      var img = new Image();
      img.onload = function () {
        try {
          var cv = document.createElement('canvas');
          cv.width = W0;
          cv.height = H0;
          var cx = cv.getContext('2d');
          cx.drawImage(img, 0, 0, W0, H0);
          texts.forEach(function (t) {
            var size = parseFloat(t.getAttribute('font-size')) * RES;
            cx.font = t.getAttribute('font-weight') + ' ' + size + 'px ' + t.getAttribute('font-family');
            cx.fillStyle = '#000';
            cx.fillText(t.textContent, parseFloat(t.getAttribute('x')) * RES, parseFloat(t.getAttribute('y')) * RES);
          });
          var data = cx.getImageData(0, 0, W0, H0).data;
          var alpha = new Uint8Array(W0 * H0);
          var core = new Uint8Array(W0 * H0);
          for (var i = 0; i < alpha.length; i++) {
            alpha[i] = data[i * 4 + 3];
            if (alpha[i] >= SOLID) core[i] = 1;
          }
          var edge = dilate(core, W0, H0, RES + 1);

          resolve({ alpha: alpha, near: edge });
        } catch (err) { reject(err); }
      };
      img.onerror = reject;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
    });
  }

  // Покрытие снимается один раз для каждой темы
  function loadMaps() {
    var key = themeKey();
    if (maps[key]) {
      cov = maps[key].cov;
      near = maps[key].near;
      return Promise.resolve();
    }
    return Promise.all(PLATES.map(rasterize)).then(function (res) {
      var set = { cov: {}, near: {} };
      PLATES.forEach(function (id, i) { set.cov[id] = res[i].alpha; set.near[id] = res[i].near; });
      maps[key] = set;
      if (themeKey() === key) { cov = set.cov; near = set.near; }
    });
  }

  function indexAt(x, y) {
    var ix = Math.round(x * RES), iy = Math.round(y * RES);
    if (ix < 0 || iy < 0 || ix >= W0 || iy >= H0) return -1;
    return iy * W0 + ix;
  }

  // Площадь точки равна покрытию; после 78 % точки срастаются
  function dotRadius(v, pitch) {
    if (v <= 0.785) return pitch * Math.sqrt(v / Math.PI);
    return pitch * (0.5 + (v - 0.785) / 0.215 * 0.21);
  }

  function layout() {
    W = box.clientWidth;
    H = W * VB_H / VB_W;
    if (!W) return;
    scale = W / VB_W;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    RL = W < 420 ? 54 : 84;
    var size = RL * 2;
    loupe.width = inksLayer.width = Math.round(size * dpr);
    loupe.height = inksLayer.height = Math.round(size * dpr);
    loupe.style.width = size + 'px';
    loupe.style.height = size + 'px';
    if (!moved) {
      // Старт: на светлом краю перекрытия жёлтой и пурпурной, вдали от центра
      target.x = pos.x = 150 * scale;
      target.y = pos.y = 64 * scale;
    } else {
      target.x = pos.x = clamp(pos.x, 0, W);
      target.y = pos.y = clamp(pos.y, 0, H);
    }
    if (live) draw();
  }

  // Одна краска под лупой. Плашка — плотный растр из целых точек: точка стоит там,
  // где её центр попадает в букву, и не обрезается по краю. Полутона — точки по покрытию.
  function paintPlate(c, id, mode) {
    if (off[id] || !cov[id]) return;
    var k = ZOOM * scale;
    var ux = pos.x / scale, uy = pos.y / scale;
    var pitch = PITCHES[id];
    var reach = RL / k + pitch;
    var alpha = cov[id], edge = near[id];

    var th = ANGLE[id] * Math.PI / 180;
    var cs = Math.cos(th), sn = Math.sin(th);
    var ci = (ux * cs + uy * sn) / pitch;
    var cj = (-ux * sn + uy * cs) / pitch;
    var n = Math.ceil(reach / pitch) + 1;
    var solidR = dotRadius(SOLID_DOT, pitch) * k;

    c.globalCompositeOperation = mode;
    c.fillStyle = inkColor(id);
    for (var i = Math.floor(ci) - n; i <= Math.ceil(ci) + n; i++) {
      for (var jj = Math.floor(cj) - n; jj <= Math.ceil(cj) + n; jj++) {
        var x = (i * cs - jj * sn) * pitch;
        var y = (i * sn + jj * cs) * pitch;
        var dx = x - ux, dy = y - uy;
        if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
        var at = indexAt(x, y);
        if (at < 0) continue;
        var r;
        if (edge[at]) {
          if (alpha[at] < 128) continue;   // центр точки вне буквы — точки нет
          r = solidR;
        } else {
          var v = alpha[at] / 255;
          if (v < 0.02) continue;
          r = dotRadius(v, pitch) * k;
        }
        c.beginPath();
        c.arc(RL + dx * k, RL + dy * k, r, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  function draw() {
    var c = loupe.getContext('2d');
    var size = RL * 2;
    var R = RL - 2;

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);
    c.save();
    c.beginPath();
    c.arc(RL, RL, R, 0, Math.PI * 2);
    c.clip();
    // Бумага под лупой того же тона, что этикетка: в тёмной теме она приглушена
    c.fillStyle = getComputedStyle(proof).getPropertyValue('--label-paper').trim() || '#ffffff';
    c.fillRect(0, 0, size, size);

    // Слой красок собирается отдельно: голубая, пурпурная и жёлтая перемножаются
    // между собой и ложатся на материал слоем; чернила или белила — поверх
    var ic = inksLayer.getContext('2d');
    ic.setTransform(dpr, 0, 0, dpr, 0, 0);
    ic.clearRect(0, 0, size, size);
    PLATES.forEach(function (id) {
      if (id !== 'k') paintPlate(ic, id, 'multiply');
    });
    c.globalCompositeOperation = 'source-over';
    c.drawImage(inksLayer, 0, 0, size, size);
    paintPlate(c, 'k', blendFor('k'));
    c.globalCompositeOperation = 'source-over';

    // Перекрестие: тёмная линия с белой сердцевиной читается и на краске, и на бумаге
    var tick = 9;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(RL - tick, RL); c.lineTo(RL + tick, RL);
    c.moveTo(RL, RL - tick); c.lineTo(RL, RL + tick);
    c.lineWidth = 3;
    c.strokeStyle = '#181143';
    c.stroke();
    c.lineWidth = 1.2;
    c.strokeStyle = '#ffffff';
    c.stroke();
    c.restore();

    // Оправа лупы
    c.lineWidth = 4;
    c.strokeStyle = '#181143';
    c.beginPath();
    c.arc(RL, RL, R, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 1;
    c.strokeStyle = '#ffffff';
    c.beginPath();
    c.arc(RL, RL, R - 2.5, 0, Math.PI * 2);
    c.stroke();

    loupe.style.transform = 'translate(' + (pos.x - RL) + 'px,' + (pos.y - RL) + 'px)';
  }

  function step() {
    frame = 0;
    var ease = reduceMotion.matches ? 1 : 0.24;
    pos.x += (target.x - pos.x) * ease;
    pos.y += (target.y - pos.y) * ease;
    draw();
    if (Math.abs(target.x - pos.x) > 0.3 || Math.abs(target.y - pos.y) > 0.3) {
      frame = requestAnimationFrame(step);
    }
  }

  function aimAt(x, y) {
    target.x = clamp(x, 0, W);
    target.y = clamp(y, 0, H);
    moved = true;
    if (live && !frame) frame = requestAnimationFrame(step);
  }

  function aimClient(clientX, clientY) {
    var rect = box.getBoundingClientRect();
    aimAt(clientX - rect.left, clientY - rect.top);
  }

  // Мышь и перо ведут лупу; касание переставляет её, не мешая прокрутке
  box.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    aimClient(e.clientX, e.clientY);
  });
  box.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') aimClient(e.clientX, e.clientY);
  });

  // Клавиатура: стрелки двигают лупу, с Shift — быстрее
  box.addEventListener('keydown', function (e) {
    var d = e.shiftKey ? 36 : 12;
    var dx = 0, dy = 0;
    if (e.key === 'ArrowLeft') dx = -d;
    else if (e.key === 'ArrowRight') dx = d;
    else if (e.key === 'ArrowUp') dy = -d;
    else if (e.key === 'ArrowDown') dy = d;
    else return;
    e.preventDefault();
    aimAt(target.x + dx, target.y + dy);
  });

  document.addEventListener('fb-theme-change', function () {
    loadMaps().then(function () { if (live) draw(); });
  });

  if ('ResizeObserver' in window) {
    new ResizeObserver(layout).observe(box);
  } else {
    window.addEventListener('resize', layout);
  }
  layout();

  /* Печать оттиска: краски ложатся, когда этикетка попадает в экран */
  var printStart = reduceMotion.matches ? 0 : null;
  var ready = false;

  function goLive() {
    if (!ready || printStart === null || live) return;
    // Лупа появляется, когда последняя краска легла на этикетку
    var wait = reduceMotion.matches ? 0 : Math.max(0, printStart + 1950 - performance.now());
    setTimeout(function () {
      live = true;
      layout();
      draw();
      proof.classList.add('is-live');
    }, wait);
  }

  function startPrint() {
    proof.classList.remove('is-waiting');
    proof.classList.add('is-printing');
    printStart = performance.now();
    goLive();
  }

  if (printStart === null) {
    if ('IntersectionObserver' in window) {
      proof.classList.add('is-waiting');
      var seen = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        seen.disconnect();
        startPrint();
      }, { threshold: 0.5 });
      seen.observe(box);
    } else {
      startPrint();
    }
  }

  var fontsReady = document.fonts && document.fonts.load
    ? Promise.all([
        document.fonts.load('600 15px Unbounded', 'Самоклеящиеся этикетки'),
        document.fonts.load('500 12px "Golos Text"', 'info@fb-print.ru')
      ]).catch(function () {})
    : Promise.resolve();

  fontsReady
    .then(loadMaps)
    .then(function () {
      ready = true;
      goLive();
    })
    .catch(function () {
      loupe.remove();
      Array.prototype.forEach.call(proof.querySelectorAll('[data-proof-howto]'), function (el) {
        el.textContent = 'Отключите краску, чтобы увидеть, из чего складывается цвет на оттиске.';
      });
    });
})();
