// Main Entry – Eagle Eye University Smart Parking
(function () {
  let lastTime = performance.now();
  let elapsed  = 0;

  // ── Loading helpers ───────────────────────────────────────────────
  function _setProgress(pct, msg) {
    const fill = document.getElementById('loading-fill');
    const text = document.getElementById('loading-text');
    const pctEl = document.getElementById('loading-pct');
    if (fill)  fill.style.width   = pct + '%';
    if (text)  text.textContent   = msg;
    if (pctEl) pctEl.textContent  = Math.round(pct) + '%';
  }

  const _wait = ms => new Promise(r => setTimeout(r, ms));

  async function _step(pct, msg, fn, ms = 70) {
    _setProgress(pct, msg);
    await _wait(ms);
    if (fn) fn();
    await _wait(30);
  }

  // ── Error overlay (shown if something crashes) ────────────────────
  function _showError(err) {
    const screen = document.getElementById('loading-screen');
    const content = screen ? screen.querySelector('.loading-content') : null;
    if (content) {
      content.innerHTML = `
        <div style="color:#E74C3C;font-size:48px;margin-bottom:16px">⚠️</div>
        <h2 style="color:#E74C3C;font-size:22px;margin-bottom:12px">Startup Error</h2>
        <p style="color:#95A5A6;font-size:13px;max-width:420px;line-height:1.6">
          ${err.message || String(err)}
        </p>
        <p style="color:#7F8C9A;font-size:12px;margin-top:20px">
          Open DevTools (F12) → Console for details
        </p>
        <button onclick="location.reload()"
          style="margin-top:24px;padding:10px 28px;background:#2E86AB;color:#fff;
                 border:none;border-radius:99px;cursor:pointer;font-size:14px;font-weight:600">
          🔄 Retry
        </button>`;
    }
    console.error('[EEU Smart Parking] Fatal error:', err);
  }

  // ── Main async boot ───────────────────────────────────────────────
  async function main() {
    try {
      await _step(5,  'Initialising 3D engine…');
      const { scene } = AppScene.init();

      await _step(15, 'Laying ground & road network…', null, 60);

      _setProgress(20, 'Building Eagle Eye University…');
      await _wait(60);
      await CampusBuilder.build(scene);          // ← properly awaited

      await _step(55, 'Validating road network & building constraints…', () => {
        RoadNetwork.init();     // road surface index, building obstacles, graph validation
      }, 80);

      await _step(62, 'Setting up parking management…', () => {
        ParkingManager.init();
        ParkingLayout.init();   // structural spatial model (lanes, aisles, slots)
      }, 60);

      await _step(76, 'Spawning campus vehicles…',
        () => VehicleController.init(scene), 60);

      await _step(90, 'Starting live simulation…',
        () => AppUI.init(), 60);

      await _step(100, '🦅 Welcome to Eagle Eye University!', null, 800);

      // ── Fade-out loading screen ───────────────────────────────────
      const ls = document.getElementById('loading-screen');
      ls.style.transition = 'opacity 1s ease';
      ls.style.opacity    = '0';
      setTimeout(() => { ls.style.display = 'none'; }, 1000);

      // ── Show HUD ─────────────────────────────────────────────────
      ['campus-info','camera-hud','zoom-controls','intro-countdown']
        .forEach(id => {
          const el = document.getElementById(id);
          if (el) el.classList.remove('hidden');
        });

      // Update branding labels
      const infoName = document.querySelector('.info-name');
      if (infoName) infoName.textContent = 'Eagle Eye University';
      const infoSub = document.querySelector('.info-subtitle');
      if (infoSub) infoSub.textContent = 'EEU Smart Parking';

      requestAnimationFrame(animate);

    } catch (err) {
      _showError(err);
    }
  }

  // ── Animation loop ────────────────────────────────────────────────
  function animate(now) {
    requestAnimationFrame(animate);
    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    elapsed += delta;

    AppScene.tick(delta);
    VehicleController.tick(delta);
    CampusBuilder.pulseRoute(elapsed);
    CampusBuilder.tickTrafficSignals(delta);
  }

  // ── Boot ──────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
