(() => {
  const menuButton = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav-links");
  if (menuButton && nav) {
    menuButton.addEventListener("click", () => {
      const open = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!open));
      menuButton.setAttribute("aria-label", open ? "Open navigation" : "Close navigation");
      nav.classList.toggle("open", !open);
    });
    nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Open navigation");
      nav.classList.remove("open");
    }));
  }

  const cards = [...document.querySelectorAll(".product-card")];
  const filters = [...document.querySelectorAll(".filter-chip")];
  const search = document.querySelector("#tool-search");
  const empty = document.querySelector("#empty-state");
  let activeFilter = "all";
  function filterCards() {
    const query = (search?.value || "").trim().toLowerCase();
    let count = 0;
    cards.forEach(card => {
      const categoryMatch = activeFilter === "all" || card.dataset.category === activeFilter;
      const text = (card.dataset.search + " " + card.textContent).toLowerCase();
      const visible = categoryMatch && (!query || text.includes(query));
      card.hidden = !visible;
      if (visible) count++;
    });
    if (empty) empty.hidden = count > 0;
  }
  filters.forEach(button => button.addEventListener("click", () => {
    activeFilter = button.dataset.filter || "all";
    filters.forEach(item => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    filterCards();
  }));
  search?.addEventListener("input", filterCards);

  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }), { threshold: 0.12, rootMargin: "0px 0px -22px 0px" });
    revealItems.forEach(item => observer.observe(item));
  } else revealItems.forEach(item => item.classList.add("is-visible"));

  document.querySelectorAll("[data-interest]").forEach(link => link.addEventListener("click", () => {
    const details = document.querySelector("#project-details");
    if (details) details.value = "I'm interested in " + link.dataset.interest + ". Please let me know what a practical implementation could involve.";
  }));
  document.querySelector("#project-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const feedback = document.querySelector("#form-feedback");
    if (feedback) feedback.textContent = "This is the preview form; no information was sent or stored. The secure enquiry endpoint will be connected before launch.";
  });
  const year = document.querySelector("#current-year");
  if (year) year.textContent = new Date().getFullYear();
})();