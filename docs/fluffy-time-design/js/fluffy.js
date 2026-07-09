(function () {
  const pad = (value) => String(value).padStart(2, "0");

  function updateTimers() {
    const now = new Date();
    document.querySelectorAll("[data-countdown]").forEach((node) => {
      const target = new Date(node.dataset.target);
      const delta = Math.max(0, target - now);
      const days = Math.floor(delta / 86400000);
      const hours = Math.floor((delta % 86400000) / 3600000);
      const minutes = Math.floor((delta % 3600000) / 60000);
      const seconds = Math.floor((delta % 60000) / 1000);
      node.textContent = `${days} 天 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    });

    document.querySelectorAll("[data-elapsed]").forEach((node) => {
      const start = new Date(node.dataset.start);
      const days = Math.max(0, Math.floor((now - start) / 86400000));
      node.textContent = `${days} 天`;
    });
  }

  function setupPasswordForms() {
    document.querySelectorAll("[data-toggle-password]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = button.closest(".password-input-wrap")?.querySelector(".password-input");
        if (!input) return;
        input.type = input.type === "password" ? "text" : "password";
        button.textContent = input.type === "password" ? "◎" : "◉";
      });
    });

    document.querySelectorAll("[data-password-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const status = form.closest(".password-card")?.querySelector("[data-password-status]");
        if (status) status.textContent = "密码已确认";
      });
    });
  }

  function setupScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    }, { threshold: 0.24 });

    document.querySelectorAll(".revealed-list").forEach((node) => observer.observe(node));

    document.querySelectorAll("[data-scroll-shell]").forEach((shell) => {
      const header = shell.querySelector(".floating-header");
      const update = () => {
        if (header) header.classList.toggle("is-visible", shell.scrollTop > 80);
      };
      shell.addEventListener("scroll", update, { passive: true });
      update();
    });
  }

  function setupSortableLists() {
    document.querySelectorAll("[data-sortable-list]").forEach((list) => {
      let dragging = null;

      list.querySelectorAll(".pin-button").forEach((button) => {
        button.addEventListener("click", () => {
          const card = button.closest(".list-card");
          if (!card) return;
          card.classList.toggle("pinned");
          button.classList.toggle("active", card.classList.contains("pinned"));
          button.textContent = card.classList.contains("pinned") ? "已置顶" : "置顶";
          if (card.classList.contains("pinned")) list.prepend(card);
        });
      });

      list.querySelectorAll(".list-card").forEach((card) => {
        card.addEventListener("dragstart", (event) => {
          dragging = card;
          card.classList.add("dragging");
          event.dataTransfer.effectAllowed = "move";
        });

        card.addEventListener("dragend", () => {
          card.classList.remove("dragging");
          dragging = null;
        });
      });

      list.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (!dragging) return;
        const afterElement = [...list.querySelectorAll(".list-card:not(.dragging)")].find((card) => {
          const rect = card.getBoundingClientRect();
          return event.clientY < rect.top + rect.height / 2;
        });
        if (afterElement) list.insertBefore(dragging, afterElement);
        else list.appendChild(dragging);
      });

      list.addEventListener("drop", (event) => {
        event.preventDefault();
        if (dragging) dragging.classList.remove("dragging");
        dragging = null;
      });
    });
  }

  function setupModalForms() {
    document.querySelectorAll("[data-modal-form]").forEach((form) => {
      const select = form.querySelector("[data-calendar-select]");
      if (select) {
        select.addEventListener("change", () => {
          form.classList.toggle("show-lunar", select.value === "农历");
        });
      }
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        form.classList.add("saved-pulse");
        window.setTimeout(() => form.classList.remove("saved-pulse"), 480);
      });
    });
  }

  updateTimers();
  setInterval(updateTimers, 1000);
  setupPasswordForms();
  setupScrollReveal();
  setupSortableLists();
  setupModalForms();
})();
