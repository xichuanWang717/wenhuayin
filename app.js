const root = document.getElementById("scrollRoot");
const scenes = [...document.querySelectorAll(".scene")];
const reveals = [...document.querySelectorAll(".reveal")];

const sceneObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    const scene = entry.target;
    if (!entry.isIntersecting) return;
    scenes.forEach(item => item.classList.remove("is-active"));
    scene.classList.add("is-active");
    scene.querySelectorAll(".reveal").forEach(item => item.classList.add("in"));
  });
}, { threshold: 0.58 });

const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add("in");
  });
}, { threshold: 0.24 });

function updateSceneProgress() {
  scenes.forEach(scene => {
    const rect = scene.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)));
    scene.style.setProperty("--active-progress", progress.toFixed(4));
  });
}

let ticking = false;
root.addEventListener("scroll", () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    updateSceneProgress();
    ticking = false;
  });
}, { passive: true });

window.addEventListener("resize", updateSceneProgress);
scenes.forEach(scene => sceneObserver.observe(scene));
reveals.forEach(item => revealObserver.observe(item));
scenes[0]?.classList.add("is-active");
updateSceneProgress();
