/* Lyssna — SVT easy-Swedish listening practice.
   Reads window.LISTENING_DATA (built by tools/build-listening-site.js).
   Plays the HLS stream via hls.js (or native HLS on Safari), syncs a
   click-to-seek timestamped transcript, toggles SV/ZH, supports per-line
   loop, playback speed, and shows a vocab list. */
(function () {
  'use strict';

  var DATA = window.LISTENING_DATA || { episodes: [] };
  var media = document.getElementById('mediaEl');
  var transcriptEl = document.getElementById('transcript');
  var vocabItemsEl = document.getElementById('vocabItems');
  var vocabPanel = document.getElementById('vocabPanel');
  var playerView = document.getElementById('playerView');
  var playerEmpty = document.getElementById('playerEmpty');
  var mediaError = document.getElementById('mediaError');
  var epTitle = document.getElementById('epTitle');
  var epMeta = document.getElementById('epMeta');
  var epSvtLink = document.getElementById('epSvtLink');
  var updated = document.getElementById('listenUpdated');

  var state = {
    episode: null,
    cueEls: [],
    activeIdx: -1,
    showSv: true,
    showZh: false,
    loop: false,
    autoFollow: true,
    hls: null,
  };

  function fmtDur(sec) {
    sec = Math.round(sec || 0);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // ---- Episode list -------------------------------------------------------
  function renderList() {
    var ul = document.getElementById('episodeItems');
    ul.innerHTML = '';
    if (!DATA.episodes.length) {
      var li = document.createElement('li');
      li.className = 'epEmpty';
      li.textContent = '还没有节目。运行 /dagens-horovning 抓取最新一集。';
      ul.appendChild(li);
      return;
    }
    DATA.episodes.forEach(function (ep, i) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'epBtn';
      btn.innerHTML =
        '<span class="epBtnTitle">' + escapeHtml(ep.title) + '</span>' +
        '<span class="epBtnMeta">' + escapeHtml(ep.date) + ' · ' + fmtDur(ep.duration) +
        ' · ' + ep.cueCount + ' 句</span>';
      btn.addEventListener('click', function () {
        document.querySelectorAll('.epBtn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        loadEpisode(ep);
      });
      li.appendChild(btn);
      ul.appendChild(li);
      if (i === 0) { btn.classList.add('active'); }
    });
    // Auto-load newest.
    loadEpisode(DATA.episodes[0]);
  }

  // ---- Load an episode ----------------------------------------------------
  function loadEpisode(ep) {
    state.episode = ep;
    state.activeIdx = -1;
    playerEmpty.hidden = true;
    playerView.hidden = false;
    mediaError.hidden = true;

    epTitle.textContent = ep.title;
    epMeta.textContent = [ep.source, ep.cefr, fmtDur(ep.duration)].filter(Boolean).join(' · ');
    epSvtLink.href = ep.svtPlayUrl || '#';

    renderTranscript(ep);
    renderVocab(ep);
    attachMedia(ep);
  }

  function attachMedia(ep) {
    // Tear down any prior hls.js instance.
    if (state.hls) { try { state.hls.destroy(); } catch (e) {} state.hls = null; }
    media.removeAttribute('src');
    media.load();
    mediaError.hidden = true;

    var url = ep.hlsUrl;
    if (!url) { showMediaError('这一集没有可播放的音频链接，请用上方“在 SVT Play 看”。'); return; }

    // Prefer hls.js wherever MSE is available (Chrome/Edge/Firefox): they report
    // canPlayType('…mpegurl') as "maybe" but cannot actually decode HLS natively.
    // Native playback is reserved for Safari/iOS, where Hls.isSupported() is false.
    if (window.Hls && window.Hls.isSupported()) {
      var hls = new window.Hls({ enableWorker: true });
      state.hls = hls;
      hls.loadSource(url);
      hls.attachMedia(media);
      hls.on(window.Hls.Events.ERROR, function (evt, data) {
        if (data && data.fatal) {
          showMediaError('音频流加载失败（可能该集已过期，约一周后 SVT 会下架）。请点上方“在 SVT Play 看”。');
        }
      });
    } else if (media.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari / iOS).
      media.src = url;
    } else {
      showMediaError('当前浏览器不支持播放该音频流，请用上方“在 SVT Play 看”。');
    }
    media.playbackRate = currentSpeed();
  }

  function showMediaError(msg) {
    mediaError.textContent = '⚠️ ' + msg;
    mediaError.hidden = false;
  }

  // ---- Transcript ---------------------------------------------------------
  function renderTranscript(ep) {
    transcriptEl.innerHTML = '';
    state.cueEls = [];
    ep.cues.forEach(function (cue, idx) {
      var li = document.createElement('li');
      li.className = 'cue';
      li.dataset.idx = String(idx);

      var time = document.createElement('button');
      time.type = 'button';
      time.className = 'cueTime';
      time.textContent = fmtDur(cue.start);
      time.title = '跳到这句';
      time.addEventListener('click', function () { seekTo(cue.start); });

      var texts = document.createElement('div');
      texts.className = 'cueTexts';

      var sv = document.createElement('p');
      sv.className = 'cueSv';
      sv.textContent = cue.sv || '';
      sv.addEventListener('click', function () { seekTo(cue.start); });

      var zh = document.createElement('p');
      zh.className = 'cueZh';
      zh.textContent = cue.zh || '';

      texts.appendChild(sv);
      texts.appendChild(zh);
      li.appendChild(time);
      li.appendChild(texts);
      transcriptEl.appendChild(li);
      state.cueEls.push(li);
    });
    applyVisibility();
  }

  function renderVocab(ep) {
    vocabItemsEl.innerHTML = '';
    if (!ep.vocab || !ep.vocab.length) { vocabPanel.hidden = true; return; }
    vocabPanel.hidden = false;
    ep.vocab.forEach(function (v) {
      var li = document.createElement('li');
      li.className = 'vocabItem';
      li.innerHTML =
        '<span class="vSv">' + escapeHtml(v.sv || '') + '</span>' +
        (v.pos ? '<span class="vPos">' + escapeHtml(v.pos) + '</span>' : '') +
        '<span class="vZh">' + escapeHtml(v.zh || '') + '</span>' +
        (v.en ? '<span class="vEn">' + escapeHtml(v.en) + '</span>' : '');
      vocabItemsEl.appendChild(li);
    });
  }

  // ---- Playback sync ------------------------------------------------------
  function seekTo(sec) {
    if (!isFinite(sec)) return;
    media.currentTime = sec + 0.01;
    var p = media.play();
    if (p && p.catch) { p.catch(function () {}); }
  }

  media.addEventListener('timeupdate', function () {
    var ep = state.episode;
    if (!ep) return;
    var t = media.currentTime;
    var idx = findCue(ep.cues, t);

    if (state.loop && state.activeIdx >= 0) {
      var cur = ep.cues[state.activeIdx];
      if (cur && t >= cur.end) { media.currentTime = cur.start + 0.01; return; }
    }

    if (idx !== state.activeIdx) {
      if (state.activeIdx >= 0 && state.cueEls[state.activeIdx]) {
        state.cueEls[state.activeIdx].classList.remove('active');
      }
      state.activeIdx = idx;
      if (idx >= 0 && state.cueEls[idx]) {
        state.cueEls[idx].classList.add('active');
        if (state.autoFollow) {
          state.cueEls[idx].scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    }
  });

  function findCue(cues, t) {
    for (var i = 0; i < cues.length; i++) {
      if (t >= cues[i].start && t < cues[i].end) return i;
    }
    return -1;
  }

  // ---- Toggles / speed ----------------------------------------------------
  function applyVisibility() {
    transcriptEl.classList.toggle('hideSv', !state.showSv);
    transcriptEl.classList.toggle('hideZh', !state.showZh);
  }

  function currentSpeed() {
    var btn = document.querySelector('.speedBtn.active');
    return btn ? parseFloat(btn.dataset.speed) : 1;
  }

  document.querySelectorAll('.speedBtn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.speedBtn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      media.playbackRate = parseFloat(btn.dataset.speed);
    });
  });

  document.getElementById('toggleSv').addEventListener('click', function () {
    state.showSv = !state.showSv;
    this.classList.toggle('active', state.showSv);
    applyVisibility();
  });
  document.getElementById('toggleZh').addEventListener('click', function () {
    state.showZh = !state.showZh;
    this.classList.toggle('active', state.showZh);
    applyVisibility();
  });
  document.getElementById('toggleLoop').addEventListener('click', function () {
    state.loop = !state.loop;
    this.classList.toggle('active', state.loop);
  });
  document.getElementById('toggleAuto').addEventListener('click', function () {
    state.autoFollow = !state.autoFollow;
    this.classList.toggle('active', state.autoFollow);
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- Init ---------------------------------------------------------------
  if (updated) {
    updated.textContent = DATA.episodes.length
      ? (DATA.episodes.length + ' 集 · 更新于 ' + (DATA.generatedAt || '—'))
      : '暂无节目';
  }
  renderList();
})();
