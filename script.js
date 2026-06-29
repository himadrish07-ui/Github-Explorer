/* ================================================
   explorer.js — GitHub Developer Explorer
   Refactored from original script.js:
   + Repo live-filter, theme toggle, company field,
     join date, direct GitHub link, Bootstrap compat
   ================================================ */

document.addEventListener("DOMContentLoaded", () => {

  // ── Selectors ────────────────────────────────────
  const searchForm     = document.getElementById("search-form");
  const usernameInput  = document.getElementById("username-input");
  const searchBtn      = document.getElementById("search-btn");

  const introPanel     = document.getElementById("intro-panel");
  const loadingPanel   = document.getElementById("loading-panel");
  const errorPanel     = document.getElementById("error-panel");
  const errorTitle     = document.getElementById("error-title");
  const errorMsg       = document.getElementById("error-msg");
  const resultsGrid    = document.getElementById("results-grid");

  // Profile fields
  const profileAvatar      = document.getElementById("profile-avatar");
  const profileName        = document.getElementById("profile-name");
  const profileUsername    = document.getElementById("profile-username");
  const profileBio         = document.getElementById("profile-bio");
  const profileLocation    = document.getElementById("profile-location");
  const profileLocationRow = document.getElementById("profile-location-row");
  const profileBlog        = document.getElementById("profile-blog");
  const profileBlogRow     = document.getElementById("profile-blog-row");
  const profileCompany     = document.getElementById("profile-company");
  const profileCompanyRow  = document.getElementById("profile-company-row");
  const profileFollowers   = document.getElementById("profile-followers");
  const profileFollowing   = document.getElementById("profile-following");
  const profileJoined      = document.getElementById("profile-joined");
  const profileJoinedRow   = document.getElementById("profile-joined-row");
  const profileReposCount  = document.getElementById("profile-repos-count");
  const profileStarsCount  = document.getElementById("profile-stars-count");
  const profileForksCount  = document.getElementById("profile-forks-count");
  const profileGhLink      = document.getElementById("profile-gh-link");

  // Repos
  const reposList          = document.getElementById("repos-list");
  const reposListEmpty     = document.getElementById("repos-list-empty");
  const reposCountBadge    = document.getElementById("repos-count-badge");
  const repoSortSelect     = document.getElementById("repo-sort");
  const repoFilterInput    = document.getElementById("repo-filter");

  // Rate limit
  const rateLimitBanner    = document.getElementById("rate-limit-banner");
  const rateRemaining      = document.getElementById("rate-remaining");
  const rateRemainingFooter= document.getElementById("rate-remaining-footer");

  // Theme toggle
  const themeToggleBtn     = document.getElementById("theme-toggle-btn");

  // ── State ────────────────────────────────────────
  let reposData    = [];
  let chartInstance= null;

  // ── GitHub language color map ────────────────────
  const languageColors = {
    javascript:  "#f1e05a",
    html:        "#e34c26",
    css:         "#563d7c",
    python:      "#3572A5",
    typescript:  "#3178c6",
    java:        "#b07219",
    "c++":       "#f34b7d",
    c:           "#555555",
    ruby:        "#701516",
    php:         "#4F5D95",
    go:          "#00ADD8",
    rust:        "#dea584",
    swift:       "#F05138",
    kotlin:      "#A97BFF",
    "c#":        "#178600",
    shell:       "#89e051",
    vue:         "#41b883",
    dart:        "#00B4AB",
    scala:       "#c22d40",
    r:           "#198CE7",
  };

  // ── Theme Toggle ─────────────────────────────────
  const getTheme = () => document.documentElement.getAttribute("data-theme") || "light";

  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("gh-explorer-theme", t);
    themeToggleBtn.textContent = t === "dark" ? "☀️" : "🌙";
    // Re-render chart with new text color if visible
    if (chartInstance) renderLanguageChart();
  }

  applyTheme(getTheme()); // sync icon on load

  themeToggleBtn.addEventListener("click", () => {
    applyTheme(getTheme() === "dark" ? "light" : "dark");
  });

  // ── Event Listeners ──────────────────────────────
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    if (username) fetchGitHubUser(username);
  });

  repoSortSelect.addEventListener("change", sortAndRenderRepos);
  repoFilterInput.addEventListener("input", sortAndRenderRepos);

  // ── Main Fetcher ─────────────────────────────────
  async function fetchGitHubUser(username) {
    showLoading();
    searchBtn.disabled = true;

    try {
      // 1. Profile
      const userRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`);
      updateRateLimits(userRes);

      if (userRes.status === 404) {
        showError(
          "User Not Found",
          `No developer found for "${escapeHTML(username)}". Check the spelling and try again.`
        );
        return;
      }
      if (userRes.status === 403) {
        showError("Rate Limit Reached", "GitHub API rate limit exceeded. Please wait a minute and try again.");
        return;
      }
      if (!userRes.ok) {
        throw new Error(`Profile fetch failed: ${userRes.status}`);
      }

      const userData = await userRes.json();

      // 2. Repos (fetch up to 100; GitHub max per_page)
      const reposRes = await fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=pushed`
      );
      updateRateLimits(reposRes);

      if (!reposRes.ok) throw new Error(`Repos fetch failed: ${reposRes.status}`);

      reposData = await reposRes.json();

      renderProfile(userData);
      renderLanguageChart();
      sortAndRenderRepos();
      showResults();

    } catch (err) {
      showError(
        "Connection Error",
        "A network error occurred while contacting GitHub. You may be offline or rate-limited."
      );
      console.error("GitHub API error:", err);
    } finally {
      searchBtn.disabled = false;
    }
  }

  // ── State Display Helpers ─────────────────────────
  function showLoading() {
    introPanel.classList.add("d-none");
    errorPanel.classList.add("d-none");
    resultsGrid.classList.add("d-none");
    loadingPanel.classList.remove("d-none");
  }

  function showError(title, message) {
    introPanel.classList.add("d-none");
    loadingPanel.classList.add("d-none");
    resultsGrid.classList.add("d-none");
    errorPanel.classList.remove("d-none");
    errorTitle.textContent = title;
    errorMsg.textContent   = message;
  }

  function showResults() {
    introPanel.classList.add("d-none");
    loadingPanel.classList.add("d-none");
    errorPanel.classList.add("d-none");
    resultsGrid.classList.remove("d-none");
  }

  // ── Profile Renderer ─────────────────────────────
  function renderProfile(user) {
    profileAvatar.src    = user.avatar_url || "";
    profileAvatar.alt    = `${user.login}'s GitHub avatar`;
    profileName.textContent     = user.name || user.login;
    profileUsername.textContent = `@${user.login}`;
    profileBio.textContent      = user.bio || "No biography provided.";

    profileGhLink.href = user.html_url || "#";

    // Location
    toggleRow(profileLocationRow, user.location, () => {
      profileLocation.textContent = user.location;
    });

    // Blog / website
    toggleRow(profileBlogRow, user.blog, () => {
      let url = user.blog;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      profileBlog.href        = url;
      profileBlog.textContent = user.blog;
    });

    // Company
    toggleRow(profileCompanyRow, user.company, () => {
      profileCompany.textContent = user.company.replace(/^@/, "");
    });

    // Joined date
    toggleRow(profileJoinedRow, user.created_at, () => {
      const d = new Date(user.created_at);
      profileJoined.textContent = `Joined ${d.toLocaleDateString("en-US", { year: "numeric", month: "long" })}`;
    });

    profileFollowers.textContent = formatNum(user.followers);
    profileFollowing.textContent = formatNum(user.following);
    profileReposCount.textContent= formatNum(user.public_repos);

    const totalStars = reposData.reduce((s, r) => s + r.stargazers_count, 0);
    const totalForks = reposData.reduce((s, r) => s + r.forks_count, 0);
    profileStarsCount.textContent = formatNum(totalStars);
    profileForksCount.textContent = formatNum(totalForks);
  }

  function toggleRow(rowEl, value, setFn) {
    if (value) {
      rowEl.classList.remove("d-none");
      setFn();
    } else {
      rowEl.classList.add("d-none");
    }
  }

  // ── Sorting & Filtering ──────────────────────────
  function sortAndRenderRepos() {
    const sortBy     = repoSortSelect.value;
    const filterText = repoFilterInput.value.toLowerCase().trim();

    // Filter
    const filtered = reposData.filter(r => {
      if (!filterText) return true;
      return (
        r.name.toLowerCase().includes(filterText) ||
        (r.description || "").toLowerCase().includes(filterText) ||
        (r.language || "").toLowerCase().includes(filterText)
      );
    });

    reposCountBadge.textContent = filtered.length;

    if (filtered.length === 0) {
      reposListEmpty.classList.remove("d-none");
      reposList.style.display = "none";
      return;
    }
    reposListEmpty.classList.add("d-none");
    reposList.style.display = "";

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "stars")   return b.stargazers_count - a.stargazers_count;
      if (sortBy === "forks")   return b.forks_count - a.forks_count;
      return new Date(b.pushed_at) - new Date(a.pushed_at);
    });

    reposList.innerHTML = "";
    sorted.forEach(repo => reposList.appendChild(buildRepoRow(repo)));
  }

  function buildRepoRow(repo) {
    const li       = document.createElement("li");
    li.className   = "repo-row";

    const langName = repo.language || "Unknown";
    const dotColor = languageColors[langName.toLowerCase()] || "#888";
    const updatedStr = new Date(repo.pushed_at).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric"
    });

    li.innerHTML = `
      <div class="d-flex justify-content-between align-items-start gap-2">
        <h4 class="repo-name mb-0">
          <a href="${escapeAttr(repo.html_url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHTML(repo.name)}
          </a>
        </h4>
        <span class="repo-updated">${updatedStr}</span>
      </div>
      <p class="repo-desc mb-0">${escapeHTML(repo.description || "No description provided.")}</p>
      <div class="repo-meta">
        <span class="d-flex align-items-center gap-1">
          <span class="lang-dot" style="background-color:${dotColor};"></span>
          ${escapeHTML(langName)}
        </span>
        <span>⭐ ${formatNum(repo.stargazers_count)}</span>
        <span>🍴 ${formatNum(repo.forks_count)}</span>
        ${repo.fork ? '<span style="color:var(--text-muted)">Forked</span>' : ""}
        ${repo.archived ? '<span style="color:var(--text-muted)">Archived</span>' : ""}
      </div>
    `;
    return li;
  }

  // ── Language Donut Chart ─────────────────────────
  function renderLanguageChart() {
    const canvas   = document.getElementById("language-chart");
    const fallback = document.getElementById("chart-fallback");

    const langCounts = {};
    reposData.forEach(r => {
      if (r.language) {
        langCounts[r.language] = (langCounts[r.language] || 0) + 1;
      }
    });

    const entries = Object.entries(langCounts);

    if (entries.length === 0) {
      canvas.style.display = "none";
      fallback.classList.remove("d-none");
      return;
    }

    canvas.style.display = "block";
    fallback.classList.add("d-none");

    entries.sort((a, b) => b[1] - a[1]);

    const labels = [], counts = [], colors = [];
    let otherSum = 0;

    entries.forEach(([lang, val], i) => {
      if (i < 6) {
        labels.push(lang);
        counts.push(val);
        colors.push(languageColors[lang.toLowerCase()] || randomColor());
      } else {
        otherSum += val;
      }
    });

    if (otherSum > 0) {
      labels.push("Others");
      counts.push(otherSum);
      colors.push("#888888");
    }

    if (chartInstance) chartInstance.destroy();

    const isDark    = getTheme() === "dark";
    const textColor = isDark ? "#e8eaf2" : "#1a1d2e";

    chartInstance = new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data: counts,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: isDark ? "#181b27" : "#ffffff",
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 11,
              padding: 14,
              font: { family: "Inter", size: 11 },
              color: textColor,
            }
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = ((ctx.parsed / total) * 100).toFixed(1);
                return ` ${ctx.label}: ${ctx.parsed} repo${ctx.parsed !== 1 ? "s" : ""} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  // ── Rate Limit ───────────────────────────────────
  function updateRateLimits(res) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === null) return;

    rateRemainingFooter.textContent = remaining;
    const n = parseInt(remaining, 10);
    if (n < 10) {
      rateLimitBanner.classList.remove("d-none");
      rateRemaining.textContent = remaining;
    } else {
      rateLimitBanner.classList.add("d-none");
    }
  }

  // ── Utilities ────────────────────────────────────
  function formatNum(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }

  function escapeHTML(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(str) {
    return (str || "").replace(/"/g, "&quot;");
  }

  function randomColor() {
    const hex = "0123456789ABCDEF";
    let c = "#";
    for (let i = 0; i < 6; i++) c += hex[Math.floor(Math.random() * 16)];
    return c;
  }
});