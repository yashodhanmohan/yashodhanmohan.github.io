// Year in footer.
document.getElementById("year").textContent = new Date().getFullYear();

// Reveal sections on scroll.
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduceMotion && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
} else {
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"));
}

// Gentle parallax for the orbs — pointer-driven, very subtle.
if (!reduceMotion) {
  const orbA = document.querySelector(".orb-a");
  const orbB = document.querySelector(".orb-b");
  let raf = 0;
  let tx = 0;
  let ty = 0;

  window.addEventListener("pointermove", (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    tx = x;
    ty = y;
    if (!raf) {
      raf = requestAnimationFrame(apply);
    }
  });

  function apply() {
    raf = 0;
    if (orbA) orbA.style.translate = `${tx * -18}px ${ty * -18}px`;
    if (orbB) orbB.style.translate = `${tx * 22}px ${ty * 22}px`;
  }
}
