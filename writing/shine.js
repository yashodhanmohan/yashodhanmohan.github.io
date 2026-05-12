// Group-shine on writing posts.
//
// Tokenizes the body once (wraps every word in a <span class="word">; marks
// words >4 chars with .longword as valid seeds). Every 3 seconds, picks a
// random in-viewport longword and a contiguous run of 3–4 words around it
// on the same line, wraps them in a <span class="shine-group">, lets the
// gradient sweep animate, and unwraps when it's done.

(() => {
  const root = document.querySelector(".post-body");
  if (!root) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // ---- tokenize ----
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
      if (/[A-Za-z]/.test(part)) {
        const span = document.createElement("span");
        const alphaLen = part.replace(/[^A-Za-z]/g, "").length;
        span.className = alphaLen > 4 ? "word longword" : "word";
        span.textContent = part;
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    }
    node.parentNode.replaceChild(frag, node);
  }

  const longwords = Array.from(root.querySelectorAll(".word.longword"));
  if (longwords.length === 0) return;

  // ---- shine loop ----
  const SHINE_MS = 1600;
  const INTERVAL_MS = 3000;
  let lastSeed = null;

  function inViewport(el) {
    const r = el.getBoundingClientRect();
    return (
      r.bottom > 40 &&
      r.top < window.innerHeight - 40 &&
      r.width > 0 &&
      r.height > 0
    );
  }

  function shineGroup() {
    if (document.hidden) return;

    // Pick a random longword seed currently in the viewport, avoiding the
    // word we picked last tick (so it's always "a different word").
    const candidates = [];
    for (const w of longwords) {
      if (w === lastSeed) continue;
      if (w.closest(".shine-group")) continue;
      if (inViewport(w)) candidates.push(w);
    }
    if (candidates.length === 0) return;
    const seed = candidates[Math.floor(Math.random() * candidates.length)];
    lastSeed = seed;

    // Look at every .word child of seed's parent — that's the line of words
    // we can include in the group (Range.surroundContents needs them to
    // share a parent).
    const parent = seed.parentNode;
    const siblings = Array.from(parent.children).filter(
      (c) => c.classList && c.classList.contains("word")
    );
    const seedIdx = siblings.indexOf(seed);
    if (seedIdx < 0) return;

    const seedTop = seed.getBoundingClientRect().top;
    const sameLine = (el) =>
      Math.abs(el.getBoundingClientRect().top - seedTop) < 4;

    // Group size: 3 or 4 words (capped by what fits on the seed's line).
    const targetSize = 3 + Math.floor(Math.random() * 2);

    // Anchor the group somewhere with the seed inside it: random offset
    // 0–2 words before the seed.
    const beforeOffset = Math.floor(Math.random() * 3);
    let startIdx = seedIdx;
    for (let i = 1; i <= beforeOffset; i++) {
      const cand = siblings[seedIdx - i];
      if (cand && sameLine(cand)) startIdx = seedIdx - i;
      else break;
    }

    // Extend forward until we have targetSize words or hit a line break.
    let endIdx = startIdx;
    while (endIdx - startIdx + 1 < targetSize) {
      const cand = siblings[endIdx + 1];
      if (cand && sameLine(cand)) endIdx += 1;
      else break;
    }

    const firstWord = siblings[startIdx];
    const lastWord = siblings[endIdx];

    const range = document.createRange();
    try {
      range.setStartBefore(firstWord);
      range.setEndAfter(lastWord);
      const wrapper = document.createElement("span");
      wrapper.className = "shine-group";
      wrapper.dataset.text = range.toString();
      range.surroundContents(wrapper);

      setTimeout(() => {
        const p = wrapper.parentNode;
        if (!p) return;
        while (wrapper.firstChild) p.insertBefore(wrapper.firstChild, wrapper);
        p.removeChild(wrapper);
      }, SHINE_MS + 200);
    } catch (e) {
      // surroundContents throws if the range partially covers a non-text
      // node — bail silently and try a different seed next tick.
    }
  }

  // First shine ~1s after load so the user sees one early, then on the
  // 3-second cadence.
  setTimeout(shineGroup, 1000);
  setInterval(shineGroup, INTERVAL_MS);
})();
