// Show a labelled placeholder for any photo that hasn't been added to /images yet.
document.querySelectorAll(".photo img").forEach((img) => {
  const markMissing = () => img.closest(".photo").classList.add("missing");
  if (img.complete && img.naturalWidth === 0) markMissing();
  img.addEventListener("error", markMissing);
});

// Mobile menu
const nav = document.querySelector(".nav");
const toggle = document.querySelector(".nav-toggle");
toggle.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(open));
});
document.querySelectorAll(".nav-links a").forEach((a) =>
  a.addEventListener("click", () => {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  })
);

// Reveal elements and draw the orange line as they scroll into view
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add(e.target.classList.contains("swoosh") ? "drawn" : "in");
      io.unobserve(e.target);
    });
  },
  { threshold: 0.15 }
);
document.querySelectorAll("[data-reveal], .swoosh").forEach((el) => io.observe(el));

document.getElementById("year").textContent = new Date().getFullYear();
