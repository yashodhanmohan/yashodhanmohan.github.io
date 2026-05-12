// Word-shine on writing posts.
//
// Tokenizes the body once (wrap every word > 4 chars in a <span class="word">),
// then every 3 seconds picks a random word currently in the viewport and
// briefly adds .shine so a titanium-blue gradient sweeps across it.

(() => {
  const root = document.querySelector(".post-body");
  if (!root) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // ---- tokenize ----
  // Skip text inside these elements; the rest is fair game.
  const REJECT = new Set(["PRE", "CODE", "FIGCAPTION"]);

  function inRejected(node) {
    let el = node.parentElement;
    while (el && el !== root) {
      if (REJECT.has(el.tagName)) return true;
      el = el.parentElement;
    }
    return false;
  }

  const textNodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!inRejected(n) && /\S/.test(n.nodeValue)) textNodes.push(n);
  }

  for (const node of textNodes) {
    const parts = node.nodeValue.split(/(\s+)/);
    if (parts.length <= 1) continue;
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
        continue;
      }
      const alpha = part.replace(/[^A-Za-z]/g, "");
      if (alpha.length > 4 && /^[A-Za-z]/.test(part)) {
        const span = document.createElement("span");
        span.className = "word";
        span.textContent = part;
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    }
    node.parentNode.replaceChild(frag, node);
  }

  const allWords = Array.from(root.querySelectorAll(".word"));
  if (allWords.length === 0) return;

  // ---- shine loop ----
  let lastWord = null;
  const SHINE_MS = 1000;
  const INTERVAL_MS = 3000;

  function inViewport(el) {
    const r = el.getBoundingClientRect();
    return (
      r.bottom > 40 &&
      r.top < window.innerHeight - 40 &&
      r.width > 0 &&
      r.height > 0
    );
  }

  function shineOne() {
    if (document.hidden) return;
    const candidates = [];
    for (const w of allWords) {
      if (w === lastWord) continue;
      if (w.classList.contains("shine")) continue;
      if (inViewport(w)) candidates.push(w);
    }
    if (candidates.length === 0) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    pick.dataset.text = pick.textContent;
    pick.classList.add("shine");
    lastWord = pick;
    setTimeout(() => {
      pick.classList.remove("shine");
      delete pick.dataset.text;
    }, SHINE_MS + 200);
  }

  // First shine ~1s after load so the user sees it before the first interval
  setTimeout(shineOne, 1000);
  setInterval(shineOne, INTERVAL_MS);
})();
