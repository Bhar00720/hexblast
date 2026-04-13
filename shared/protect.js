// ============================================================
// GAME PROTECTION — Anti-Inspect + Ad-Block Detection
// Corelume Tech © 2026
// ============================================================

// === DEVTOOLS PROTECTION ===
// Block right-click context menu
document.addEventListener('contextmenu', e => e.preventDefault());

// Block keyboard shortcuts for DevTools
document.addEventListener('keydown', e => {
  // F12
  if (e.key === 'F12') { e.preventDefault(); return false; }
  // Ctrl+Shift+I (Inspect), Ctrl+Shift+J (Console), Ctrl+Shift+C (Element picker)
  if (e.ctrlKey && e.shiftKey && ['I','i','J','j','C','c'].includes(e.key)) { e.preventDefault(); return false; }
  // Ctrl+U (View Source)
  if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); return false; }
  // Ctrl+S (Save Page)
  if (e.ctrlKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); return false; }
});

// DevTools open detection via debugger timing
(function detectDevTools() {
  const threshold = 160;
  setInterval(() => {
    const start = performance.now();
    debugger;
    const end = performance.now();
    if (end - start > threshold) {
      document.body.innerHTML = '<div style="position:fixed;inset:0;background:#0a0a14;display:flex;align-items:center;justify-content:center;z-index:99999;font-family:Inter,sans-serif"><div style="text-align:center;color:#fff;max-width:400px"><h1 style="font-size:42px;margin-bottom:16px">🛑</h1><h2 style="font-size:24px;margin-bottom:12px">Developer Tools Detected</h2><p style="color:#9ca3af;font-size:14px;line-height:1.6">Please close Developer Tools to continue playing.<br>This is to protect the game integrity.</p><button onclick="location.reload()" style="margin-top:24px;padding:12px 32px;background:#3b82f6;color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit">Reload Game</button></div></div>';
    }
  }, 1000);
})();

// === AD-BLOCK DETECTION ===
(function detectAdBlock() {
  // Create a bait element that ad blockers typically hide
  const bait = document.createElement('div');
  bait.className = 'ad-banner ads adsbox ad-placement ad-placeholder adbanner';
  bait.id = 'ad-test-banner';
  bait.setAttribute('data-ad-slot', 'test');
  bait.innerHTML = '&nbsp;';
  bait.style.cssText = 'width:1px;height:1px;position:absolute;top:-10px;left:-10px;opacity:0.01;pointer-events:none;';
  document.body.appendChild(bait);

  // Also try loading a fake ad script
  const adScript = document.createElement('script');
  adScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
  adScript.async = true;
  adScript.onerror = () => { adScript._blocked = true; };
  document.head.appendChild(adScript);

  // Check after a delay
  setTimeout(() => {
    let adBlocked = false;

    // Check 1: Bait element hidden/removed
    const el = document.getElementById('ad-test-banner');
    if (!el || el.offsetHeight === 0 || el.offsetWidth === 0 ||
        el.clientHeight === 0 || el.clientWidth === 0 ||
        getComputedStyle(el).display === 'none' ||
        getComputedStyle(el).visibility === 'hidden') {
      adBlocked = true;
    }

    // Check 2: Ad script blocked
    if (adScript._blocked) {
      adBlocked = true;
    }

    // Check 3: DNS-level blocking (try fetching a known ad domain)
    fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', {
      method: 'HEAD', mode: 'no-cors', cache: 'no-store'
    }).catch(() => {
      adBlocked = true;
    }).finally(() => {
      if (adBlocked) showAdBlockWarning();
    });

    // If checks 1 or 2 already detected blocking, show immediately
    if (adBlocked) showAdBlockWarning();
  }, 2500);

  function showAdBlockWarning() {
    // Don't show twice
    if (document.getElementById('adblock-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'adblock-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(5,5,16,0.96);display:flex;align-items:center;justify-content:center;z-index:99998;font-family:Inter,sans-serif;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)';
    overlay.innerHTML = `
      <div style="text-align:center;color:#fff;max-width:480px;padding:40px;background:rgba(15,15,30,0.9);border:1px solid rgba(255,255,255,0.1);border-radius:24px">
        <div style="font-size:64px;margin-bottom:16px">🛡️</div>
        <h2 style="font-size:28px;font-weight:900;margin-bottom:12px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Ad Blocker Detected</h2>
        <p style="color:#9ca3af;font-size:15px;line-height:1.7;margin-bottom:8px">
          We rely on non-intrusive ads to keep our games <strong style="color:#fff">free for everyone</strong>. 
          Your ad blocker (including DNS-based blockers like AdGuard, Pi-hole, etc.) is preventing ads from loading.
        </p>
        <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:14px;margin:20px 0">
          <p style="color:#fca5a5;font-size:13px;line-height:1.6;margin:0">
            <strong>⚠️ Please disable your ad blocker</strong> for this site, or whitelist 
            <strong style="color:#fff">corelumetech.in</strong> to continue playing.
          </p>
        </div>
        <p style="color:#6b7280;font-size:12px;margin-bottom:24px">This includes browser extensions, DNS filters (AdGuard, Pi-hole), VPN-based blockers, and system-level ad blocking.</p>
        <button onclick="location.reload()" style="padding:14px 40px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 0 30px rgba(59,130,246,0.3);transition:all 0.3s" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 40px rgba(59,130,246,0.4)'" onmouseout="this.style.transform='';this.style.boxShadow='0 0 30px rgba(59,130,246,0.3)'">
          I've Disabled It — Reload
        </button>
        <p style="color:#374151;font-size:11px;margin-top:16px">Corelume Tech — Free Games for Everyone 🎮</p>
      </div>
    `;
    document.body.appendChild(overlay);

    // Prevent game interaction behind the overlay
    const canvas = document.getElementById('c');
    if (canvas) canvas.style.pointerEvents = 'none';
  }
})();
