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
  document.querySelector("#project-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.querySelector("#form-feedback");
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    if (feedback) feedback.textContent = "Sending your inquiry securely…";
    try {
      const csrfResponse = await fetch("/api/csrf", { credentials: "same-origin" });
      if (!csrfResponse.ok) throw new Error("Secure request setup failed. Refresh and try again.");
      const csrf = await csrfResponse.json();
      const response = await fetch("/api/projects", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.token },
        body: JSON.stringify({name: form.elements.name.value.trim(), email: form.elements.email.value.trim(), type: form.elements.type.value, details: form.elements.details.value.trim()})
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Your inquiry could not be submitted.");
      form.reset();
      if (feedback) feedback.textContent = result.message || "Thank you. Your inquiry has been received.";
    } catch (error) {
      if (feedback) feedback.textContent = error.message || "Your inquiry was not submitted. Please try again.";
    } finally { if (button) button.disabled = false; }
  });

  // Share controls use the current public URL, so the same build works on Render or a project URL.
  const shareUrl = window.location.href.split("#")[0];
  const shareTitle = document.title || "TeamPeach";
  const shareText = "Discover practical AI tools, agents and custom automation with TeamPeach.";
  const encode = value => encodeURIComponent(value);
  const whatsapp = document.querySelector("#share-whatsapp");
  const linkedin = document.querySelector("#share-linkedin");
  const facebook = document.querySelector("#share-facebook");
  if (whatsapp) whatsapp.href = "https://api.whatsapp.com/send?text=" + encode(shareText + " " + shareUrl);
  if (linkedin) linkedin.href = "https://www.linkedin.com/sharing/share-offsite/?url=" + encode(shareUrl);
  if (facebook) facebook.href = "https://www.facebook.com/sharer/sharer.php?u=" + encode(shareUrl);
  const shareFeedback = document.querySelector("#share-feedback");
  const nativeShare = document.querySelector("#native-share");
  nativeShare?.addEventListener("click", async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
      } catch (error) {
        if (error?.name !== "AbortError" && shareFeedback) shareFeedback.textContent = "Sharing was not completed. You can copy the link instead.";
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        if (shareFeedback) shareFeedback.textContent = "Link copied. Share it with someone who may find it useful.";
      } catch {
        if (shareFeedback) shareFeedback.textContent = "Use Copy link to share the site.";
      }
    }
  });
  document.querySelector("#copy-site-link")?.addEventListener("click", async () => {
    if (!shareFeedback) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      shareFeedback.textContent = "Link copied to your clipboard.";
    } catch {
      shareFeedback.textContent = "Copy the page address from your browser's address bar.";
    }
  });

  const year = document.querySelector("#current-year");
  if (year) year.textContent = new Date().getFullYear();
})();