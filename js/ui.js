// UI Controller – Eagle Eye University Smart Parking
const AppUI = (() => {
  let currentMode        = null;   // 'regular' | 'event'
  let selectedDest       = null;
  let selectedLot        = null;
  let currentRoute       = null;   // raw BFS points (for direction text)
  let currentSmoothRoute = null;   // Catmull-Rom points (for vehicle + display)
  let countdownVal = 20;
  let countdownInterval = null;

  // 100m preview state
  let _previewTimer = null;

  // AI Navigator state
  let _aiMessages    = [];
  let _aiStepIdx     = 0;
  let _aiStepTimer   = null;
  let _aiTypingTimer = null;

  const $   = id => document.getElementById(id);
  const show = el => el && el.classList.remove('hidden');
  const hide = el => el && el.classList.add('hidden');
  const showId = id => show($(id));
  const hideId = id => hide($(id));

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    _bindAll();
    _startCountdown();
    // Register 100m callback
    VehicleController.setNear100mCallback(_show100mPreview);
  }

  // ── Countdown (20 sec, then mode modal) ──────────────────────────
  function _startCountdown() {
    countdownVal = 20;
    $('countdown-number').textContent = countdownVal;
    countdownInterval = setInterval(() => {
      countdownVal--;
      $('countdown-number').textContent = countdownVal;
      if (countdownVal <= 0) {
        clearInterval(countdownInterval);
        AppScene.stopAutoRotate();           // ← stop rotation here
        _showModeModal();
      }
    }, 1000);
  }

  function _showModeModal() {
    hideId('intro-countdown');
    showId('mode-modal');
  }

  // ── Bind all buttons ──────────────────────────────────────────────
  function _bindAll() {
    // Skip intro
    $('skip-intro-btn').addEventListener('click', () => {
      clearInterval(countdownInterval);
      AppScene.stopAutoRotate();
      _showModeModal();
    });

    // Mode selection
    $('regular-parking-btn').addEventListener('click', () => {
      hideId('mode-modal');
      currentMode = 'regular';
      showId('regular-panel');
      _showUserLocation();
    });
    $('event-parking-btn').addEventListener('click', () => {
      hideId('mode-modal');
      currentMode = 'event';
      showId('event-panel');
      _showUserLocation();
    });

    // Regular panel
    $('find-parking-btn').addEventListener('click', _findRegularParking);
    $('back-from-regular').addEventListener('click', _resetToModeModal);
    $('close-regular').addEventListener('click', () => { hideId('regular-panel'); CampusBuilder.resetAllLotHighlights(); });

    // Event panel
    $('find-event-parking-btn').addEventListener('click', _findEventParking);
    $('back-from-event').addEventListener('click', _resetToModeModal);
    $('close-event').addEventListener('click', () => { hideId('event-panel'); CampusBuilder.resetAllLotHighlights(); });

    // Destination dropdown
    $('destination-select').addEventListener('change', () => {
      selectedDest = $('destination-select').value;
      $('find-parking-btn').disabled = !selectedDest;
    });
    $('event-venue-select').addEventListener('change', () => {
      $('find-event-parking-btn').disabled = !$('event-venue-select').value;
    });

    // Direction panel
    $('back-to-results').addEventListener('click', _backToResults);
    $('start-navigation-btn').addEventListener('click', _startNavigation);
    $('cancel-navigation-btn').addEventListener('click', _cancelNavigation);
    $('end-navigation-btn').addEventListener('click', _cancelNavigation);

    // Lot popup
    $('close-popup').addEventListener('click', () => hideId('lot-popup'));
    $('popup-navigate-btn').addEventListener('click', () => {
      hideId('lot-popup');
      if (selectedLot) _showDirections(selectedLot);
    });

    // Camera controls
    $('zoom-in-btn').addEventListener('click',    () => AppScene.zoomIn());
    $('zoom-out-btn').addEventListener('click',   () => AppScene.zoomOut());
    $('zoom-reset-btn').addEventListener('click', () => AppScene.resetView());
  }

  function _showUserLocation() {
    const gate = CAMPUS.gates.find(g => g.id === CAMPUS.userStart.gateId);
    const name = gate ? gate.name : 'Main Gate';
    _toast(`📍 Your location: ${name}`);
    // Show persistent location badge
    const badge = $('user-location-badge');
    const txt   = $('ulb-text');
    if (txt)   txt.textContent = `📍 ${name}`;
    if (badge) show(badge);
  }

  function _resetToModeModal() {
    hideId('regular-panel'); hideId('event-panel');
    hideId('parking-results'); hideId('event-parking-results');
    hideId('direction-panel');
    CampusBuilder.resetAllLotHighlights(); CampusBuilder.clearRoute();
    _stopAINavigator();
    _showModeModal();
    $('destination-select').value   = '';
    $('event-venue-select').value   = '';
    $('find-parking-btn').disabled  = true;
    $('find-event-parking-btn').disabled = true;
    currentRoute       = null;
    currentSmoothRoute = null;
  }

  // ── Regular parking search ────────────────────────────────────────
  function _findRegularParking() {
    selectedDest = $('destination-select').value;
    const lots = ParkingManager.getLotsForBuilding(selectedDest);
    const bldg = CAMPUS.buildings.find(b => b.id === selectedDest);

    CampusBuilder.resetAllLotHighlights();
    lots.forEach((lot, i) => {
      const col = i === 0
        ? (lot.free > 0 ? 0x00FF44 : 0xFF2222)
        : (lot.free > 0 ? 0xFFAA00 : 0xFF5555);
      CampusBuilder.highlightLot(lot.id, col);
    });

    // Pan camera to destination building and highlight it
    if (bldg) {
      AppScene.panToPoint(bldg.pos[0], bldg.pos[1]);
      CampusBuilder.highlightDestinationBuilding(selectedDest);
    }

    $('results-title').textContent = bldg ? `Parking near ${bldg.name}` : 'Nearby Parking';
    const list = $('parking-lot-list');
    list.innerHTML = lots.length ? '' : '<p class="no-results">No parking found near this destination.</p>';
    lots.forEach(lot => list.appendChild(_lotCard(lot)));
    showId('parking-results');
  }

  // ── Event parking search ──────────────────────────────────────────
  function _findEventParking() {
    const venueId = $('event-venue-select').value;
    const filter  = document.querySelector('input[name="parking-type"]:checked').value;
    const lots    = ParkingManager.getEventLots(venueId, filter);
    const venue   = CAMPUS.buildings.find(b => b.id === venueId);

    CampusBuilder.resetAllLotHighlights();
    lots.forEach(lot => CampusBuilder.highlightLot(lot.id, lot.isPaidLot ? 0xFFAA00 : 0x00FF66));

    // Pan camera to venue building and highlight it
    if (venue) {
      AppScene.panToPoint(venue.pos[0], venue.pos[1]);
      CampusBuilder.highlightDestinationBuilding(venueId);
    }

    $('event-results-title').textContent = venue ? `Event Parking – ${venue.name}` : 'Event Parking';
    const list = $('event-lot-list');
    list.innerHTML = lots.length ? '' : '<p class="no-results">No event lots available for this filter.</p>';
    lots.forEach(lot => {
      const card = _lotCard(lot);
      const badge = document.createElement('div');
      badge.className    = lot.isPaidLot ? 'paid-badge' : 'free-badge';
      badge.textContent  = lot.isPaidLot ? '💳 Paid' : '✅ Free';
      card.insertAdjacentElement('afterbegin', badge);
      list.appendChild(card);
    });
    showId('event-parking-results');

    // Set destination to the venue for navigation
    selectedDest = venueId;
  }

  // ── Lot card ──────────────────────────────────────────────────────
  function _lotCard(lot) {
    const card = document.createElement('div');
    card.className = 'lot-card';
    card.dataset.lotId = lot.id;
    const pct = lot.free > 0 ? Math.round((lot.free/lot.spots)*100) : 0;
    const barCol = pct>50 ? '#27ae60' : pct>15 ? '#f39c12' : '#e74c3c';
    card.innerHTML = `
      <div class="lot-card-header">
        <span class="lot-id">${lot.id}</span>
        <span class="lot-status" style="color:${lot.status.color}">${lot.status.label}</span>
      </div>
      <div class="lot-name">${lot.name}</div>
      <div class="lot-bar-wrap">
        <div class="lot-bar"><div class="lot-bar-fill" style="width:${pct}%;background:${barCol}"></div></div>
        <span class="lot-spots">${lot.free}/${lot.spots} free</span>
      </div>
      <div class="lot-meta">
        <span>⏱ ${lot.timeLimit ? lot.timeLimit+' min limit' : 'No limit'}</span>
        <span>💰 ${lot.paid ? '$'+lot.rate+'/hr' : 'Free'}</span>
      </div>
      <button class="navigate-btn" data-lot="${lot.id}">🧭 Navigate Here</button>`;
    card.querySelector('.navigate-btn').addEventListener('click', e => {
      e.stopPropagation();
      selectedLot = lot.id;
      _showDirections(lot.id);
    });
    card.addEventListener('click', () => _showLotPopup(lot.id));
    return card;
  }

  // ── Lot popup ─────────────────────────────────────────────────────
  function _showLotPopup(lotId) {
    selectedLot = lotId;
    const lot = ParkingManager.getLot(lotId);
    if (!lot) return;
    const pct = Math.round((lot.free/lot.spots)*100);
    $('popup-lot-id').textContent   = lot.id;
    $('popup-lot-name').textContent = lot.name;
    $('popup-free').textContent     = `${lot.free} free`;
    $('popup-total').textContent    = `${lot.spots} total`;
    $('popup-avail-bar').style.width       = pct + '%';
    $('popup-avail-bar').style.background  = pct>50 ? '#27ae60' : pct>15 ? '#f39c12' : '#e74c3c';
    $('popup-time-limit').textContent = lot.timeLimit ? `${lot.timeLimit} min` : 'No limit';
    $('popup-cost').textContent       = lot.paid ? `$${lot.rate}/hr` : 'Free';
    showId('lot-popup');
  }

  // ── Directions panel ──────────────────────────────────────────────
  function _showDirections(lotId) {
    selectedLot        = lotId;
    const lot          = CAMPUS.parkingLots.find(l => l.id === lotId);
    currentRoute       = Navigation.getRoute(lotId);          // raw – for text steps
    currentSmoothRoute = Navigation.getSmoothRoute(lotId);    // smooth – for vehicle & line

    $('direction-title').textContent    = `Navigate to ${lot ? lot.name : lotId}`;
    $('direction-distance').textContent = `~${Navigation.estimateDistance(currentRoute)} mi`;
    $('direction-time').textContent     = Navigation.estimateTime(currentRoute);

    const steps = Navigation.buildDirections(currentRoute, lotId);
    $('direction-steps').innerHTML = steps.map((s,i) =>
      `<div class="direction-step">
        <div class="step-num">${i+1}</div>
        <div class="step-text">${s}</div>
      </div>`).join('');

    // Show smooth spline on map (avoids zig-zag display through roundabouts)
    CampusBuilder.showRoute(currentSmoothRoute);
    hideId('parking-results'); hideId('event-parking-results');
    showId('direction-panel');
  }

  function _backToResults() {
    hideId('direction-panel'); CampusBuilder.clearRoute();
    currentMode === 'regular' ? showId('parking-results') : showId('event-parking-results');
  }

  // ── Navigation (animated, camera follows user vehicle) ────────────
  function _startNavigation() {
    if (!currentRoute || !selectedLot) return;
    hideId('direction-panel'); hideId('regular-panel'); hideId('event-panel');
    showId('nav-active-overlay'); hideId('nav-arrived');

    const lot   = ParkingManager.getLot(selectedLot);
    const steps = Navigation.buildDirections(currentRoute, selectedLot);
    let   stepIdx = 0;

    $('nav-current-step').innerHTML = steps[0] || 'Navigating to parking lot…';
    $('nav-next-step').innerHTML    = steps[1] || '';
    $('nav-distance').textContent   = Navigation.estimateDistance(currentRoute) + ' mi';

    // Build and show AI Navigator panel
    _aiMessages  = Navigation.buildAIInstructions(currentRoute, selectedLot);
    _aiStepIdx   = 0;
    _showAINavigator();

    // Dense route: intermediate points every 10 units so the vehicle
    // can't short-cut across roundabout islands between sparse nodes.
    VehicleController.startNavigation(Navigation.getDenseRoute(selectedLot), () => {
      if (lot) {
        $('spaces-count').textContent = lot.free;
        showId('nav-arrived');
        $('nav-current-step').textContent = 'You have arrived!';
        $('nav-next-step').textContent    = '';
        _toast(`🅿️ ${lot.free} spaces available in ${lot.name}`);
        hideId('arrival-preview');
        if (_previewTimer) { clearTimeout(_previewTimer); _previewTimer = null; }
        // Final AI message on arrival
        _aiTypeMessage(`🎉 <strong>You have arrived!</strong> ${lot.free} space(s) available in <strong>${lot.name}</strong>. Park safely!`);
      }
    }, selectedLot);

    // Step-by-step nav overlay updates
    const totalMs = parseFloat(Navigation.estimateTime(currentRoute)) * 60000;
    const stepMs  = Math.max(2000, totalMs / Math.max(steps.length-1, 1));
    const stepTimer = setInterval(() => {
      stepIdx++;
      if (stepIdx < steps.length) {
        $('nav-current-step').innerHTML = steps[stepIdx] || '';
        $('nav-next-step').innerHTML    = steps[stepIdx+1] || '';
      } else {
        clearInterval(stepTimer);
      }
    }, stepMs);

    // Advance AI Navigator message every 8 s
    _aiStepTimer = setInterval(() => {
      _aiStepIdx++;
      if (_aiStepIdx < _aiMessages.length) {
        _aiTypeMessage(_aiMessages[_aiStepIdx]);
      } else {
        clearInterval(_aiStepTimer);
      }
    }, 8000);

    // Override end-nav to also clear timers
    $('end-navigation-btn').onclick = () => {
      clearInterval(stepTimer);
      _stopAINavigator();
      _cancelNavigation();
    };
  }

  function _cancelNavigation() {
    VehicleController.stopNavigation();
    CampusBuilder.clearRoute(); CampusBuilder.resetAllLotHighlights();
    hideId('nav-active-overlay'); hideId('direction-panel');
    hideId('arrival-preview');
    if (_previewTimer) { clearTimeout(_previewTimer); _previewTimer = null; }
    _stopAINavigator();
    AppScene.stopAutoRotate();
    _showModeModal();
  }

  // ── AI Navigator panel ────────────────────────────────────────────
  function _showAINavigator() {
    const panel = $('ai-navigator');
    if (!panel) return;
    const bubble = $('ai-bubble');
    if (bubble && _aiMessages.length) {
      bubble.innerHTML = _aiMessages[0];
    }
    show(panel);
    _aiStepIdx = 0;
  }

  function _stopAINavigator() {
    if (_aiStepTimer)   { clearInterval(_aiStepTimer);  _aiStepTimer  = null; }
    if (_aiTypingTimer) { clearTimeout(_aiTypingTimer);  _aiTypingTimer = null; }
    hideId('ai-navigator');
  }

  // Simulate LLM typing: show dots briefly then swap in the real message
  function _aiTypeMessage(html) {
    const bubble = $('ai-bubble');
    const dots   = $('ai-typing-dots');
    if (!bubble) return;
    if (dots) show(dots);
    bubble.innerHTML = '';
    if (_aiTypingTimer) clearTimeout(_aiTypingTimer);
    _aiTypingTimer = setTimeout(() => {
      if (dots) hide(dots);
      bubble.innerHTML = html;
      _aiTypingTimer = null;
    }, 900);   // 0.9 s "thinking" delay
  }

  // ── 100m Arrival Preview ──────────────────────────────────────────
  function _show100mPreview(lotId) {
    const lot = CAMPUS.parkingLots.find(l => l.id === lotId);
    if (!lot) return;

    $('ap-lot-name').textContent = lot.name;
    $('ap-distance').textContent = '📍 <100m away';

    // Build slot grid
    const gridEl = $('ap-grid');
    gridEl.innerHTML = '';
    const parkedSlots = VehicleController.getParkedSlots(lotId);

    // If we have parked slot data use it, otherwise simulate
    if (parkedSlots && parkedSlots.length > 0) {
      parkedSlots.forEach(slot => {
        const sq = document.createElement('div');
        sq.className = 'ap-slot ' + (slot.occupied ? 'occupied' : 'empty');
        gridEl.appendChild(sq);
      });
    } else {
      // Fallback: render based on lot spots with random occupancy
      const total = lot.spots;
      const freeCount = lot.free || Math.floor(total * 0.4);
      for (let i = 0; i < Math.min(total, 60); i++) {
        const sq = document.createElement('div');
        sq.className = 'ap-slot ' + (i < (total - freeCount) ? 'occupied' : 'empty');
        gridEl.appendChild(sq);
      }
    }

    showId('arrival-preview');

    // Auto-hide after 30 seconds
    if (_previewTimer) clearTimeout(_previewTimer);
    _previewTimer = setTimeout(() => {
      hideId('arrival-preview');
      _previewTimer = null;
    }, 30000);
  }

  // ── Parking live update callback ──────────────────────────────────
  function onParkingUpdate(state) {
    document.querySelectorAll('.lot-card').forEach(card => {
      const lot = state[card.dataset.lotId];
      if (!lot) return;
      const pct  = Math.round((lot.free/lot.spots)*100);
      const fill = card.querySelector('.lot-bar-fill');
      const sp   = card.querySelector('.lot-spots');
      const st   = card.querySelector('.lot-status');
      if (fill) fill.style.width = pct + '%';
      if (sp)   sp.textContent   = `${lot.free}/${lot.spots} free`;
      if (st) { st.textContent = lot.status.label; st.style.color = lot.status.color; }
    });
  }

  // ── Toast notification ────────────────────────────────────────────
  function _toast(msg, ms = 3500) {
    const el = $('notification');
    $('notification-text').textContent = msg;
    show(el);
    setTimeout(() => hide(el), ms);
  }

  return { init, onParkingUpdate };
})();
