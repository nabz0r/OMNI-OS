(() => {
  const body = document.body,
    dialog = document.querySelector("#search-dialog");
  const input = document.querySelector("#search-input"),
    results = document.querySelector("#search-results");
  const status = document.querySelector("#search-status"),
    toggle = document.querySelector(".theme-toggle");
  let lastFocus;
  const applyTheme = (value) => {
    body.dataset.theme = value;
    toggle.setAttribute(
      "aria-label",
      value === "dark" ? "Use light theme" : "Use dark theme",
    );
  };
  try {
    applyTheme(localStorage.getItem("omni-docs-theme") || "light");
  } catch {
    applyTheme("light");
  }
  toggle.addEventListener("click", () => {
    const value = body.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(value);
    try {
      localStorage.setItem("omni-docs-theme", value);
    } catch {}
  });
  function search() {
    const query = input.value.trim().toLocaleLowerCase(),
      words = query.split(/\s+/).filter(Boolean);
    results.replaceChildren();
    if (!words.length) {
      status.textContent =
        "Search titles, topics and document text. Everything runs locally.";
      return;
    }
    const matches = (window.OMNI_SEARCH || [])
      .map((doc) => {
        const title = doc.title.toLocaleLowerCase(),
          summary = (doc.summary + " " + doc.group).toLocaleLowerCase(),
          text = doc.text.toLocaleLowerCase();
        const present = words.every(
          (word) =>
            title.includes(word) ||
            summary.includes(word) ||
            text.includes(word),
        );
        return {
          doc,
          score: present
            ? words.reduce(
                (n, w) =>
                  n +
                  (title.includes(w) ? 20 : 0) +
                  (summary.includes(w) ? 6 : 0) +
                  (text.includes(w) ? 1 : 0),
                0,
              )
            : 0,
        };
      })
      .filter((item) => item.score)
      .sort((a, b) => b.score - a.score)
      .slice(0, 18);
    status.textContent = matches.length
      ? `${matches.length} matching guides${matches.length === 18 ? " shown" : ""}. Use Tab to move through the results.`
      : "No matching guide. Try a shorter term, such as import, grant or vault.";
    for (const { doc } of matches) {
      const link = document.createElement("a"),
        label = document.createElement("small"),
        title = document.createElement("strong"),
        summary = document.createElement("span");
      link.href = body.dataset.root + doc.url;
      label.textContent = doc.group + " / " + doc.status;
      title.textContent = doc.title;
      summary.textContent = doc.summary;
      link.append(label, title, summary);
      results.append(link);
    }
  }
  document.querySelector(".search-open").addEventListener("click", () => {
    lastFocus = document.activeElement;
    dialog.showModal();
    input.focus();
    search();
  });
  document
    .querySelector("#search-close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => lastFocus?.focus());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    }
  });
  input.addEventListener("input", search);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") results.querySelector("a")?.click();
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "/" &&
      !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) &&
      !dialog.open
    ) {
      event.preventDefault();
      document.querySelector(".search-open").click();
    }
    if (event.key === "Escape") {
      body.classList.remove("nav-open");
      document
        .querySelector(".menu-toggle")
        .setAttribute("aria-expanded", "false");
    }
  });
  document.querySelector(".menu-toggle").addEventListener("click", (event) => {
    const open = body.classList.toggle("nav-open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  for (const pre of document.querySelectorAll(".prose pre")) {
    const button = document.createElement("button");
    button.className = "copy-code";
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy code example");
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(
          pre.querySelector("code")?.textContent || "",
        );
        button.textContent = "Copied";
      } catch {
        button.textContent = "Select to copy";
      }
    });
    pre.append(button);
  }
})();
