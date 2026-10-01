const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    try {
        tg.setHeaderColor('#0b0e15');
        tg.setBackgroundColor('#0b0e15');
        tg.setBottomBarColor('#0b0e15');
    } catch (e) {}
}

const userId = tg?.initDataUnsafe?.user?.id || null;
const initData = tg?.initData || "";

let player = null;
let countries = {};
let selectedCountry = null;
let worldData = null;
let statsInterval = null;
let currentPMTarget = null;
let currentArmyTab = "land";

const COUNTRY_IMAGE_EXT = { germany: "jpg", britain: "jfif", ussr: "jfif", usa: "jfif",
    france: "jfif", italy: "jfif", china: "jfif", japan: "jfif" };
const COUNTRY_FLAGS = { germany: "🇩🇪", britain: "🇬🇧", ussr: "☭", usa: "🇺🇸",
    france: "🇫🇷", italy: "🇮🇹", china: "🇨🇳", japan: "🇯🇵" };
const COUNTRY_NAMES = { germany: "آلمان", britain: "بریتانیا", ussr: "شوروی", usa: "آمریکا",
    france: "فرانسه", italy: "ایتالیا", china: "چین", japan: "ژاپن" };
const COUNTRY_IDS = { germany: 276, britain: 826, ussr: 643, usa: 840,
    france: 250, italy: 380, china: 156, japan: 392 };

let ARMY_UNITS = {};

const RESOURCE_NAMES = { food: "غذا", steel: "فولاد", uranium: "اورانیوم", oil: "نفت" };
const RESOURCE_ICONS = { food: "🌾", steel: "⚙️", uranium: "☢️", oil: "🛢️" };
const GROUP_ICONS = { land: "🪖", naval: "⚓", air: "✈️", missile: "🚀" };
const GROUP_TITLES = { land: "زمینی", naval: "دریایی", air: "هوایی", missile: "موشکی" };
const TREATY_TYPE_NAMES = { alliance: "پیمان اتحاد", non_aggression: "پیمان عدم تجاوز" };

const OCEAN_LABELS = [
    [-40, 25, "اقیانوس اطلس"], [-150, 0, "اقیانوس آرام"], [75, -20, "اقیانوس هند"],
    [90, 65, "اقیانوس منجمد شمالی"], [20, -60, "اقیانوس منجمد جنوبی"]
];

/* =========================================================
   API Client
========================================================= */
function getApiUrl(path, params = {}) {
    const url = new URL(path, window.location.origin);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
}

async function apiGet(path, params = {}) {
    const url = getApiUrl(path, params);
    const headers = {};
    if (initData) headers["X-Telegram-Init-Data"] = initData;
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 15000);
    try {
        const r = await fetch(url, { headers, signal: controller.signal });
        const text = await r.text();
        try { return JSON.parse(text); }
        catch { return { error: "invalid_json", raw: text }; }
    } finally { clearTimeout(to); }
}

async function apiPost(path, body = {}) {
    const url = getApiUrl(path, {});
    const headers = { "Content-Type": "application/json" };
    if (initData) headers["X-Telegram-Init-Data"] = initData;
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 15000);
    try {
        const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body),
            signal: controller.signal });
        const text = await r.text();
        try { return JSON.parse(text); }
        catch { return { success: false, error: "invalid_json", raw: text }; }
    } finally { clearTimeout(to); }
}

/* =========================================================
   Helpers
========================================================= */
function countryImageUrl(cid) {
    return `/images/countries/${cid}.${COUNTRY_IMAGE_EXT[cid] || "jpg"}`;
}

// تصویر پس‌زمینه کارت خانه (جدا از پرچم) — اگر فایل نبود، پرچم نمایش داده می‌شود
function homeImageUrl(cid) {
    return `/images/home/${cid}.jpg`;
}

function flagInline(cid, small) {
    if (!cid || !COUNTRY_IMAGE_EXT[cid]) return "";
    const cls = small ? "flag-inline flag-inline-sm" : "flag-inline";
    return `<span class="${cls}"><img class="flag-img" src="${countryImageUrl(cid)}" alt=""></span>`;
}

function showOnly(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
    const t = document.getElementById(id);
    if (t) t.classList.remove("hidden");
}

function showGamePage(id) {
    document.querySelectorAll(".game-page").forEach(p => p.classList.add("hidden"));
    const t = document.getElementById(id);
    if (t) t.classList.remove("hidden");
}

function formatMoney(v) { return "$" + Math.round(Number(v ?? 0)).toLocaleString("en-US"); }
function formatNumber(v) { return Math.round(Number(v ?? 0)).toLocaleString("en-US"); }

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return "۰ ثانیه";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s} ثانیه`;
    if (s === 0) return `${m} دقیقه`;
    return `${m} دقیقه و ${s} ثانیه`;
}

let toastTimer = null;
function showToast(msg, kind) {
    let el = document.getElementById("app-toast");
    if (!el) {
        el = document.createElement("div");
        el.id = "app-toast"; el.className = "toast";
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.remove("error", "success");
    if (kind) el.classList.add(kind);
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}

function askText(title, placeholder) {
    return new Promise(resolve => {
        const ov = document.createElement("div");
        ov.className = "modal-overlay";
        ov.innerHTML = `
            <div class="modal-box">
                <div class="modal-title"></div>
                <textarea class="modal-input" maxlength="500"></textarea>
                <div class="modal-actions">
                    <button class="modal-cancel">انصراف</button>
                    <button class="modal-ok">ارسال</button>
                </div>
            </div>`;
        ov.querySelector(".modal-title").textContent = title;
        ov.querySelector(".modal-input").placeholder = placeholder || "";
        const close = v => { ov.remove(); resolve(v); };
        ov.querySelector(".modal-cancel").onclick = () => close(null);
        ov.querySelector(".modal-ok").onclick = () => {
            close(ov.querySelector(".modal-input").value.trim() || null);
        };
        document.body.appendChild(ov);
        ov.querySelector(".modal-input").focus();
    });
}

async function loadArmyCatalog() {
    try { ARMY_UNITS = (await apiGet("/api/army-units")).units || {}; }
    catch (e) { console.error("Army catalog:", e); }
}

function renderResourceBars() {
    if (!player?.resources) return;
    document.querySelectorAll(".resource-bar").forEach(bar => {
        bar.innerHTML = "";
        Object.keys(RESOURCE_NAMES).forEach(key => {
            const amt = player.resources[key] ?? 0;
            const rate = player.resource_production?.[key] ?? 0;
            const use = player.resource_consumption?.[key] ?? 0;
            const chip = document.createElement("div");
            chip.className = "resource-chip";
            let rateLine = "";
            if (rate > 0 && use > 0) {
                rateLine = `<div class="resource-chip-rate up">▲ ${formatNumber(rate)} /روز</div>
                            <div class="resource-chip-rate down">▼ ${formatNumber(use)} کسر فصلی</div>`;
            } else if (rate > 0) {
                rateLine = `<div class="resource-chip-rate up">▲ ${formatNumber(rate)} /روز</div>`;
            } else if (use > 0) {
                rateLine = `<div class="resource-chip-rate down">▼ ${formatNumber(use)} /روز</div>`;
            } else {
                rateLine = `<div class="resource-chip-rate zero">بدون تولید</div>`;
            }
            chip.innerHTML = `
                <div class="resource-chip-top"><span>${RESOURCE_ICONS[key]} ${RESOURCE_NAMES[key]}</span></div>
                <div class="resource-chip-value">${formatNumber(amt)}</div>
                ${rateLine}`;
            bar.appendChild(chip);
        });
    });
}

async function loadWorldAtlas() {
    if (worldData) return worldData;
    const r = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
    worldData = await r.json();
    return worldData;
}

/* =========================================================
   Player / Countries
========================================================= */
async function loadPlayer() {
    if (!userId) return;
    try {
        player = await apiGet("/api/player");
        if (player?.country) selectedCountry = player.country;
    } catch (e) { console.error(e); }
}

let refreshController = null;
async function refreshPlayer() {
    if (!userId) return;
    if (refreshController) refreshController.abort();
    refreshController = new AbortController();
    try {
        player = await apiGet("/api/player");
        updateHomeStats();
    } catch (e) { if (e.name !== "AbortError") console.error(e); }
}

function startStatsPolling() {
    stopStatsPolling();
    statsInterval = setInterval(() => {
        refreshPlayer();
        refreshNotificationBadge();
    }, 30000);
}
function stopStatsPolling() {
    if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
}

async function loadCountries() {
    try {
        countries = {};
        (await apiGet("/api/countries")).forEach(c => { countries[c.id] = c; });
        updateCountryCards();
    } catch (e) { console.error("Countries:", e); }
}

function showCountrySelection() { showOnly("country"); updateCountryCards(); }

function updateCountryCards() {
    document.querySelectorAll("[data-country-card]").forEach(card => {
        const cid = card.dataset.country;
        const c = countries[cid];
        if (!c) return;
        if (c.taken) {
            if (player?.country === cid) card.classList.remove("taken");
            else card.classList.add("taken");
        } else card.classList.remove("taken");
    });
}

document.querySelectorAll("[data-country-card]").forEach(card => {
    card.addEventListener("click", () => {
        const cid = card.dataset.country;
        const c = countries[cid];
        if (c?.taken && player?.country !== cid) {
            showMessage("این کشور قبلاً انتخاب شده است."); return;
        }
        selectedCountry = cid;
        showCountryPreview();
    });
});

function showMessage(msg) {
    const el = document.getElementById("country-message");
    if (!el) return;
    el.textContent = msg;
    setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 4000);
}

function showCountryPreview() {
    if (!selectedCountry) { showCountrySelection(); return; }
    showOnly("country-preview");
    document.getElementById("selected-country-flag").src = countryImageUrl(selectedCountry);
    document.getElementById("preview-country-name").textContent = COUNTRY_NAMES[selectedCountry] || selectedCountry;
    createPreviewGlobe("preview-globe-container", "preview-globe", selectedCountry);
}

document.getElementById("preview-back-button").addEventListener("click", () => {
    selectedCountry = null; showCountrySelection();
});

document.getElementById("enter-game-button").addEventListener("click", async () => {
    await confirmCountrySelection();
});

async function confirmCountrySelection() {
    if (!userId) { showToast("از داخل تلگرام وارد شوید."); return; }
    if (player?.country === selectedCountry) { showGame(); return; }
    try {
        const data = await apiPost("/api/select-country", { country: selectedCountry });
        if (!data.success) {
            if (data.error === "country_taken") {
                showToast("این کشور قبلاً انتخاب شده است.");
                selectedCountry = null; await loadCountries(); showCountrySelection(); return;
            }
            if (data.error === "already_has_country") { await loadPlayer(); showGame(); return; }
            if (data.error === "occupied") { showToast("این کشور اشغال شده است."); return; }
            showToast(data.message || "خطا در انتخاب کشور."); return;
        }
        player = data.player; await loadCountries(); showGame();
    } catch (e) { showToast("خطای شبکه."); }
}

function showGame() {
    showOnly("game"); showGamePage("home");
    updateGameHeader(); updateHomeStats(); startStatsPolling();
    loadRankings(); refreshNotificationBadge();
}

function updateGameHeader() {
    document.getElementById("game-country-flag").src = countryImageUrl(selectedCountry);
}

/* =========================================================
   Notifications
========================================================= */
async function refreshNotificationBadge() {
    try {
        const news = await apiGet("/api/news");
        const count = Array.isArray(news) ? news.length : 0;
        const badge = document.getElementById("notif-badge");
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? "99+" : String(count);
            badge.classList.remove("hidden");
        } else {
            badge.classList.add("hidden");
        }
    } catch (e) {}
}

document.getElementById("game-notification-button")?.addEventListener("click", () => {
    showGamePage("communications");
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    document.querySelector('[data-page="communications"]')?.classList.add("active");
    document.querySelectorAll(".comm-tab").forEach(t => t.classList.remove("active"));
    document.querySelector('[data-tab="comm-news"]')?.classList.add("active");
    document.querySelectorAll(".comm-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById("comm-news")?.classList.remove("hidden");
    loadNews();
});

/* =========================================================
   Home
========================================================= */
const SEASON_HINTS = {
    "بهار":    "🌱 هوا معتدل",
    "تابستان": "☀️ مصرف سوخت و غذا کمی بیشتر",
    "پاییز":   "🍂 مصرف سوخت و غذا بیشتر",
    "زمستان":  "❄️ مصرف سوخت و غذا خیلی زیاد",
};

function updateHomeStats() {
    if (!player) return;
    document.getElementById("home-country-flag").src = countryImageUrl(selectedCountry);
    document.getElementById("home-country-name").textContent = COUNTRY_NAMES[selectedCountry] || selectedCountry;
    const photo = document.getElementById("home-card-photo");
    if (photo) photo.style.backgroundImage =
        `url(${homeImageUrl(selectedCountry)}), url(${countryImageUrl(selectedCountry)})`;
    document.getElementById("home-money").textContent = formatMoney(player.money);
    document.getElementById("home-income").textContent = formatMoney(player.daily_income);
    document.getElementById("home-manpower").textContent = formatNumber(player.manpower);
    document.getElementById("home-manpower-production").textContent = formatNumber(player.manpower_production);
    document.getElementById("home-power").textContent = formatNumber(player.power_capacity);
    document.getElementById("home-power-sub").textContent = `مصرف: ${formatNumber(player.power_consumption ?? 0)}`;
    document.getElementById("home-army").textContent = formatNumber(player.army);
    const season = player.season ?? "بهار";
    document.getElementById("home-season").textContent = season;
    document.getElementById("home-season-end").textContent =
        `پایان فصل تا ${player.season_days_left ?? 0} روز و ${player.season_hours_left ?? 0} ساعت`;
    const hint = document.getElementById("home-season-hint");
    if (hint) hint.textContent = SEASON_HINTS[season] || player.season_hint || "";
    const mm = document.getElementById("map-money");
    if (mm) mm.textContent = formatMoney(player.money);
    renderResourceBars();
}

async function loadRankings() {
    try {
        const rows = await apiGet("/api/rankings");
        const box = document.getElementById("rankings-list");
        if (!box) return;
        box.innerHTML = "";
        if (!rows.length) { box.innerHTML = `<div class="diplomacy-item-empty">هنوز رتبه‌ای نیست.</div>`; return; }
        rows.forEach(r => {
            const div = document.createElement("div");
            const cls = r.rank === 1 ? "rank-1" : r.rank === 2 ? "rank-2" : r.rank === 3 ? "rank-3" : "";
            div.className = `rank-row ${cls} ${r.is_eliminated ? "rank-elim" : ""}`;
            div.innerHTML = `
                <div class="rank-num">${r.rank}</div>
                <div>
                    <div class="rank-name">${flagInline(r.country, true)} ${r.name}</div>
                    <div class="rank-sub">💰${r.economy} ⚔️${r.military} 🤝${r.diplomacy} 🏗️${r.development}</div>
                </div>
                <div class="rank-score">${formatNumber(r.overall)}</div>`;
            box.appendChild(div);
        });
    } catch (e) { console.error(e); }
}

/* =========================================================
   Actions
========================================================= */
document.querySelectorAll(".action-card").forEach(card => {
    card.addEventListener("click", () => {
        const s = card.dataset.section;
        if (s === "infrastructure") openInfrastructureMenu();
        else if (s === "army") openArmyPage();
        else if (s === "war") openWarPage();
        else if (s === "diplomacy") openDiplomacyPage();
        else if (s === "economy") openEconomyPage();
        else if (s === "market") { showGamePage("market"); loadMarketListings(); }
    });
});

document.querySelectorAll(".sub-back-button").forEach(b => {
    b.addEventListener("click", () => showGamePage(b.dataset.backTo || "home"));
});

/* =========================================================
   Infra
========================================================= */
async function openInfrastructureMenu() {
    showGamePage("infrastructure");
    await refreshPlayer();
    renderInfraTab("power");
}

function renderInfraTab(tab) {
    document.querySelectorAll(".infra-panel").forEach(p => p.classList.add("hidden"));
    document.querySelectorAll(".infra-tab").forEach(t => t.classList.remove("active"));
    const btn = document.querySelector(`[data-infra-tab="${tab}"]`);
    if (btn) btn.classList.add("active");
    const panel = document.getElementById(`infra-panel-${tab}`);
    if (panel) panel.classList.remove("hidden");

    if (tab === "power")
        renderInfraList("infra-power-list", i => i.group === "power");
    else if (tab === "manpower")
        renderInfraList("infra-manpower-list", i => i.group === "manpower");
    else if (tab === "food")
        renderInfraList("infra-food-list", i => i.group === "resource" && i.resource_key === "food");
    else if (tab === "resource")
        renderInfraList("infra-resource-list", i => i.group === "resource" && i.resource_key !== "food");
    else if (tab === "military") {
        renderInfraList("infra-land-list", i => i.group === "land");
        renderInfraList("infra-naval-list", i => i.group === "naval");
        renderInfraList("infra-air-list", i => i.group === "air");
    }
}

document.querySelectorAll(".infra-tab").forEach(tab => {
    tab.addEventListener("click", () => renderInfraTab(tab.dataset.infraTab));
});

function statBox(icon, value, label) {
    return `<div class="stat-box">
        <span class="stat-box-icon">${icon}</span>
        <span class="stat-box-value">${value}</span>
        <span class="stat-box-label">${label}</span>
    </div>`;
}

function buildStatsHtml(item, levelData) {
    if (!levelData) return "";
    const g = item.group;
    const boxes = [];

    if (item.power_required && item.power_required > 0) {
        boxes.push(statBox("⚡", formatNumber(item.power_required), "برق"));
    }
    if (g === "power" && levelData.capacity !== undefined) {
        boxes.push(statBox("⚡", formatNumber(levelData.capacity), "ظرفیت"));
    }
    if (g === "manpower" && levelData.production !== undefined) {
        boxes.push(statBox("👥", "+" + formatNumber(levelData.production), "نفر در روز"));
    }
    if (g === "resource" && levelData.production !== undefined) {
        const icon = RESOURCE_ICONS[item.resource_key] || "📦";
        boxes.push(statBox(icon, "+" + formatNumber(levelData.production), "در روز"));
    }
    if ((g === "land" || g === "naval" || g === "air") && levelData.capacity !== undefined) {
        boxes.push(statBox("📦", formatNumber(levelData.capacity), "ظرفیت"));
    }
    if (levelData.income !== undefined) {
        boxes.push(statBox("💰", "+" + formatMoney(levelData.income), "در روز"));
    }
    if (levelData.time !== undefined && levelData.time > 0) {
        boxes.push(statBox("⏱️", formatDuration(levelData.time), "زمان"));
    }

    if (!boxes.length) return "";
    return `<div class="stat-boxes-row">${boxes.join("")}</div>`;
}

function renderInfraList(cid, filterFn) {
    const c = document.getElementById(cid);
    if (!c || !player?.infra) return;
    c.innerHTML = "";
    Object.entries(player.infra).forEach(([iid, item]) => {
        if (!filterFn(item)) return;
        const card = document.createElement("div");
        card.className = "infra-card-new";

        const isBuilt = item.level > 0;
        const statusText = isBuilt ? `سطح ${item.level}` : "ساخته نشده";
        const shownLevel = item.next || item.current;
        const statsHtml = buildStatsHtml(item, shownLevel);

        const btnText = !item.next
            ? "حداکثر سطح"
            : (isBuilt ? `⬆️ ارتقا به سطح ${item.level + 1} — ${formatMoney(item.next.cost)}`
                       : `⬆️ ساخت — ${formatMoney(item.next.cost)}`);
        const btnDisabled = !item.next ? "disabled" : "";

        card.innerHTML = `
            <div class="infra-card-head">
                <div class="infra-card-icon">${item.icon || "🏗️"}</div>
                <div class="infra-card-titles">
                    <div class="infra-card-name">${item.name}</div>
                    <div class="infra-card-status">${statusText}</div>
                </div>
            </div>
            <div class="infra-card-desc">${item.desc || ""}</div>
            ${statsHtml}
            <button class="infra-card-button" ${btnDisabled}>${btnText}</button>`;

        const btn = card.querySelector(".infra-card-button");
        if (item.next) btn.addEventListener("click", () => upgradeInfra(iid));
        c.appendChild(card);
    });
}

async function upgradeInfra(iid) {
    if (!userId) return;
    try {
        const d = await apiPost("/api/upgrade-infra", { category: iid });
        if (!d.success) { showToast(d.message || "امکان ارتقا نیست."); return; }
        player = d.player; updateHomeStats();
        const activeTab = document.querySelector(".infra-tab.active")?.dataset.infraTab || "power";
        renderInfraTab(activeTab);
    } catch (e) { showToast("خطا."); }
}

/* =========================================================
   Economy
========================================================= */
async function openEconomyPage() {
    showGamePage("economy"); await refreshPlayer(); renderEconomyList();
}

function renderEconomyList() {
    const c = document.getElementById("economy-list");
    if (!c || !player?.economy) return;
    c.innerHTML = "";
    Object.entries(player.economy).forEach(([iid, item]) => {
        const card = document.createElement("div");
        card.className = "infra-card-new";

        const isBuilt = item.level > 0;
        const statusText = isBuilt ? `سطح ${item.level}` : "ساخته نشده";
        const shownLevel = item.next || item.current;
        const statsHtml = buildStatsHtml(item, shownLevel);

        const btnText = !item.next
            ? "حداکثر سطح"
            : (isBuilt ? `⬆️ ارتقا به سطح ${item.level + 1} — ${formatMoney(item.next.cost)}`
                       : `⬆️ ساخت — ${formatMoney(item.next.cost)}`);
        const btnDisabled = !item.next ? "disabled" : "";

        card.innerHTML = `
            <div class="infra-card-head">
                <div class="infra-card-icon">${item.icon || "💰"}</div>
                <div class="infra-card-titles">
                    <div class="infra-card-name">${item.name}</div>
                    <div class="infra-card-status">${statusText}</div>
                </div>
            </div>
            <div class="infra-card-desc">${item.desc || ""}</div>
            ${statsHtml}
            <button class="infra-card-button" ${btnDisabled}>${btnText}</button>`;

        const btn = card.querySelector(".infra-card-button");
        if (item.next) btn.addEventListener("click", () => upgradeEconomy(iid));
        c.appendChild(card);
    });
}

async function upgradeEconomy(iid) {
    if (!userId) return;
    try {
        const d = await apiPost("/api/upgrade-economy", { category: iid });
        if (!d.success) { showToast(d.message || "خطا"); return; }
        player = d.player; updateHomeStats(); renderEconomyList();
    } catch (e) { showToast("خطا."); }
}

/* =========================================================
   Army
========================================================= */
async function openArmyPage() {
    showGamePage("army");
    await refreshPlayer();
    renderArmySummary();
    renderBaseCards();
    renderArmyTabsCounts();
    renderArmyUnitsNew();
}

document.querySelectorAll(".army-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".army-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        currentArmyTab = tab.dataset.armyTab;
        renderArmyUnitsNew();
    });
});

function getGroupCapacity(group) {
    if (!player?.infra) return 0;
    let t = 0;
    Object.values(player.infra).forEach(i => {
        if (i.group === group && i.current) t += i.current.capacity ?? 0;
    });
    return t;
}

function getGroupUsed(group) {
    let t = 0;
    Object.entries(ARMY_UNITS).forEach(([uid_, u]) => {
        if (u.group === group) t += player?.units?.[uid_] ?? 0;
    });
    return t;
}

function renderArmySummary() {
    const el = document.getElementById("army-total-power");
    if (!el || !player) return;
    el.textContent = formatNumber(player.army);
}

function renderBaseCards() {
    if (!player?.infra) return;

    // پادگان
    const barracks = player.infra["land_barracks"];
    const bv = document.getElementById("base-barracks-value");
    const bm = document.getElementById("base-barracks-max");
    const bf = document.getElementById("base-barracks-fill");
    if (barracks && barracks.current) {
        const cap = getGroupCapacity("land");
        const used = getGroupUsed("land");
        bv.textContent = formatNumber(used);
        bm.textContent = `از ${formatNumber(cap)}`;
        if (bf) bf.style.width = cap > 0 ? Math.min(100, (used / cap) * 100) + "%" : "0%";
    } else {
        bv.textContent = "—";
        bm.textContent = "ساخته نشده";
        if (bf) bf.style.width = "0%";
    }

    // فرودگاه
    const airport = player.infra["air_airport"];
    const as = document.getElementById("base-airport-status");
    if (airport && airport.current) {
        const cap = getGroupCapacity("air");
        const used = getGroupUsed("air");
        as.innerHTML = `<span style="color:#f4f6f9;font-size:18px;font-weight:bold;">${used}</span> از ${cap}`;
        as.classList.remove("base-card-empty");
    } else {
        as.textContent = "ساخته نشده";
        as.classList.add("base-card-empty");
    }

    // بندر
    const port = player.infra["naval_port"];
    const pv = document.getElementById("base-port-value");
    const pm = document.getElementById("base-port-max");
    const pf = document.getElementById("base-port-fill");
    if (port && port.current) {
        const cap = getGroupCapacity("naval");
        const used = getGroupUsed("naval");
        pv.textContent = formatNumber(used);
        pm.textContent = `از ${formatNumber(cap)}`;
        if (pf) pf.style.width = cap > 0 ? Math.min(100, (used / cap) * 100) + "%" : "0%";
    } else {
        pv.textContent = "—";
        pm.textContent = "ساخته نشده";
        if (pf) pf.style.width = "0%";
    }

    // موشکی
    const ms = document.getElementById("base-missile-status");
    if (ms) {
        ms.textContent = "ساخته نشده";
        ms.classList.add("base-card-empty");
    }
}

function renderArmyTabsCounts() {
    if (!player) return;
    const set = (id, n) => { const e = document.getElementById(id); if (e) e.textContent = formatNumber(n); };
    set("army-count-land", getGroupUsed("land"));
    set("army-count-air", getGroupUsed("air"));
    set("army-count-naval", getGroupUsed("naval"));
    set("army-count-missile", 0);
}

function unitLevelDots(count, max = 6) {
    const filled = count > 0 ? Math.min(max, Math.max(1, Math.ceil(Math.log10(count + 1) * 1.5))) : 0;
    let html = '<div class="unit-card-new-dots">';
    for (let i = 0; i < max; i++) {
        html += `<span class="unit-card-new-dot ${i < filled ? "filled" : ""}"></span>`;
    }
    html += "</div>";
    return html;
}

function renderArmyUnitsNew() {
    const c = document.getElementById("army-units-new");
    if (!c || !player) return;

    const group = currentArmyTab;
    c.innerHTML = "";

    const unitsInGroup = Object.entries(ARMY_UNITS).filter(([, u]) => u.group === group);

    if (!unitsInGroup.length) {
        c.innerHTML = `<div class="diplomacy-item-empty">هنوز یگانی در این شاخه تعریف نشده است.</div>`;
        return;
    }

    const cap = getGroupCapacity(group);
    const used = getGroupUsed(group);

    unitsInGroup.forEach(([uid_, u]) => {
        const count = player.units?.[uid_] ?? 0;
        const req = player.infra?.[u.requires];
        const hasReq = (req?.level ?? 0) > 0;
        const full = used >= cap;
        const totalPower = count * (u.attack + u.defense);

        let statusText;
        let disabled = false;
        if (!hasReq) {
            statusText = `برای باز شدن، «${req?.name || u.requires}» را بسازید.`;
            disabled = true;
        } else if (full) {
            statusText = "ظرفیت پر است.";
            disabled = true;
        } else {
            statusText = "آماده آموزش";
        }

        const card = document.createElement("div");
        card.className = "unit-card-new" + (disabled ? " locked" : "");

        const transportChip = u.transport_capacity
            ? `<div class="unit-chip"><span>🚚 ظرفیت حمل</span>
               <span class="unit-chip-value">${formatNumber(u.transport_capacity)}</span></div>`
            : "";

        card.innerHTML = `
            <div class="unit-card-new-top">
                <div class="unit-card-new-name">
                    <div class="unit-card-new-title">${u.name}</div>
                    ${unitLevelDots(count)}
                </div>
                <div class="unit-card-new-power ${totalPower === 0 ? "zero" : ""}">
                    ${formatNumber(totalPower)}
                </div>
            </div>

            <div class="unit-card-new-stats">
                <div class="unit-chip">
                    <span>⚔️ حمله</span>
                    <span class="unit-chip-value">${u.attack}</span>
                </div>
                <div class="unit-chip">
                    <span>🛡️ دفاع</span>
                    <span class="unit-chip-value">${u.defense}</span>
                </div>
                <div class="unit-chip">
                    <span>تعداد</span>
                    <span class="unit-chip-value">${formatNumber(count)}</span>
                </div>
                <div class="unit-chip">
                    <span>💰</span>
                    <span class="unit-chip-value">${formatMoney(u.cost)}</span>
                </div>
                <div class="unit-chip">
                    <span>👥</span>
                    <span class="unit-chip-value">${formatNumber(u.manpower)}</span>
                </div>
                ${transportChip}
            </div>

            <div class="unit-card-new-action">
                <button class="unit-produce-btn" data-unit="${uid_}" data-count="1" ${disabled ? "disabled" : ""}>
                    ⚙️ تولید
                </button>
                <button class="unit-produce-btn" data-unit="${uid_}" data-count="10" ${disabled ? "disabled" : ""}>
                    ⚙️ ×۱۰
                </button>
                <span class="unit-status-text">${statusText}</span>
            </div>
        `;

        if (!disabled) {
            card.querySelectorAll(".unit-produce-btn").forEach(b => {
                b.addEventListener("click", () => trainUnit(uid_, Number(b.dataset.count)));
            });
        }

        c.appendChild(card);
    });
}

async function trainUnit(uid_, count) {
    if (!userId) return;
    try {
        const d = await apiPost("/api/train-unit", { unit_id: uid_, count });
        if (!d.success) { showToast(d.message || "خطا", "error"); return; }
        player = d.player;
        updateHomeStats();
        renderArmySummary();
        renderBaseCards();
        renderArmyTabsCounts();
        renderArmyUnitsNew();
    } catch (e) { showToast("خطا."); }
}

/* =========================================================
   War
========================================================= */
document.querySelectorAll(".war-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".war-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        document.querySelectorAll(".war-panel").forEach(p => p.classList.add("hidden"));
        const panel = document.getElementById(tab.dataset.warTab);
        if (panel) panel.classList.remove("hidden");
    });
});

function openWarPage() {
    showGamePage("war");
    renderWarTargets();
    loadWarData();
}

function renderWarTargets() {
    const c = document.getElementById("war-target-list");
    if (!c) return;
    c.innerHTML = "";
    const hasUnits = player && Object.values(player.units || {}).some(v => v > 0);
    if (!hasUnits) {
        c.innerHTML = `<div class="diplomacy-item-empty">برای اعلام جنگ ابتدا باید یگان بسازید.</div>`;
        return;
    }
    Object.keys(COUNTRY_NAMES).forEach(cid => {
        if (cid === selectedCountry) return;
        const info = countries[cid];
        const occupied = info?.occupier;
        const card = document.createElement("div");
        card.className = "war-target-card";
        const occText = occupied ? ` (اشغال توسط ${COUNTRY_NAMES[occupied] || occupied})` : "";
        card.innerHTML = `
            <div class="war-target-top">
                <div class="flag-wrap"><img class="flag-img" src="${countryImageUrl(cid)}" alt=""></div>
                <span class="war-target-name">${COUNTRY_NAMES[cid]}${occText}</span>
            </div>
            <button class="war-attack-button" data-declare="${cid}">⚔️ اعلام جنگ</button>`;
        card.querySelector("[data-declare]").addEventListener("click", () => declareWar(cid));
        c.appendChild(card);
    });
}

async function declareWar(target) {
    if (!confirm(`اعلام جنگ به ${COUNTRY_NAMES[target]}؟\nاین درخواست به سازمان ملل (ادمین) می‌رود.`)) return;
    try {
        const d = await apiPost("/api/war/declare", { target });
        if (!d.success) { showToast(d.message || "امکان اعلام جنگ نیست."); return; }
        showToast(d.message || "اعلام جنگ ارسال شد.");
        loadWarData();
    } catch (e) { showToast("خطا."); }
}

async function loadWarData() {
    try {
        const d = await apiGet("/api/wars");

        const act = document.getElementById("war-active-list");
        if (act) {
            act.innerHTML = "";
            const all = [...(d.pending || []), ...(d.active || [])];
            if (!all.length) act.innerHTML = `<div class="diplomacy-item-empty">جنگ فعالی نیست.</div>`;
            all.forEach(w => {
                const div = document.createElement("div");
                div.className = "war-active-card";
                let statusText = w.status === "pending_admin" ? "در انتظار تأیید سازمان ملل" :
                                 w.status === "negotiation" ? "در حال مذاکره (۲۴ ساعته)" :
                                 w.status === "battle" ? "آماده نبرد" : w.status;
                div.innerHTML = `
                    <h4>${COUNTRY_NAMES[w.attacker]} → ${COUNTRY_NAMES[w.defender]}</h4>
                    <p>${statusText}${w.penalty ? ` — جریمه اتحاد: ${formatMoney(w.penalty)}` : ""}</p>`;
                if (w.status === "battle" && w.attacker === selectedCountry) {
                    const btn = document.createElement("button");
                    btn.className = "infra-upgrade-button";
                    btn.textContent = "ارسال نیروها و اجرای نبرد";
                    btn.addEventListener("click", () => openBattleModal(w.id));
                    div.appendChild(btn);
                }
                act.appendChild(div);
            });
        }

        const rep = document.getElementById("war-reports-list");
        if (rep) {
            rep.innerHTML = "";
            if (!d.reports?.length) rep.innerHTML = `<div class="diplomacy-item-empty">گزارشی نیست.</div>`;
            d.reports?.slice().reverse().forEach(r => {
                const div = document.createElement("div");
                div.className = "war-report-card";
                const winnerName = r.winner === "attacker" ? COUNTRY_NAMES[r.attacker] : COUNTRY_NAMES[r.defender];
                let fronts = "";
                ["air", "naval", "land"].forEach(f => {
                    if (!r.fronts[f]) return;
                    const label = f === "air" ? "✈️ هوا" : f === "naval" ? "⚓ دریا" : "🪖 زمین";
                    fronts += `<div class="front-item">
                        <div class="front-label">${label}</div>
                        <div class="front-values">
                            <span class="front-atk">${formatNumber(r.fronts[f].attacker_power)}</span> /
                            <span class="front-def">${formatNumber(r.fronts[f].defender_power)}</span>
                        </div>
                    </div>`;
                });
                div.innerHTML = `
                    <h4>${COUNTRY_NAMES[r.attacker]} ⚔️ ${COUNTRY_NAMES[r.defender]}</h4>
                    <p>برنده: <strong>${winnerName}</strong></p>
                    <div class="front-bar">${fronts}</div>`;
                rep.appendChild(div);
            });
        }
    } catch (e) { console.error(e); }
}

function openBattleModal(wid) {
    const hasCarrier = (player?.units?.aircraft_carrier || 0) > 0;
    const airLabel = hasCarrier ? "✈️ هوایی (تعداد)" : "✈️ هوایی — بدون ناو هواپیمابر غیرفعال";
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    ov.innerHTML = `
        <div class="modal-box">
            <div class="modal-title">ارسال نیروها به جبهه‌ها</div>
            <label class="diplomacy-label">🪖 زمینی (تعداد)</label>
            <input id="bt-land" class="diplomacy-input" type="number" value="0" min="0">
            <label class="diplomacy-label">⚓ دریایی (تعداد)</label>
            <input id="bt-naval" class="diplomacy-input" type="number" value="0" min="0">
            <label class="diplomacy-label">${airLabel}</label>
            <input id="bt-air" class="diplomacy-input" type="number" value="0" min="0" ${hasCarrier ? "" : "disabled"}>
            <div class="modal-actions">
                <button class="modal-cancel">انصراف</button>
                <button class="modal-ok">اجرای نبرد</button>
            </div>
        </div>`;
    ov.querySelector(".modal-cancel").onclick = () => ov.remove();
    ov.querySelector(".modal-ok").onclick = async () => {
        const fronts = {
            land: Number(ov.querySelector("#bt-land").value) || 0,
            naval: Number(ov.querySelector("#bt-naval").value) || 0,
            air: hasCarrier ? (Number(ov.querySelector("#bt-air").value) || 0) : 0,
        };
        if (!fronts.land && !fronts.naval && !fronts.air) {
            showToast("حداقل یک جبهه را پر کنید."); return;
        }
        ov.remove();
        try {
            const d = await apiPost("/api/war/battle", { war_id: wid, fronts });
            if (!d.success) { showToast(d.message || "خطا"); return; }
            showToast(d.report?.winner === "attacker" ? "پیروزی!" : "شکست در نبرد.");
            await refreshPlayer();
            loadWarData();
            loadCountries();
        } catch (e) { showToast("خطا."); }
    };
    document.body.appendChild(ov);
}

/* =========================================================
   Diplomacy
========================================================= */
function openDiplomacyPage() {
    showGamePage("diplomacy");
    const sel = document.getElementById("diplomacy-target");
    sel.innerHTML = "";
    Object.keys(COUNTRY_NAMES).forEach(cid => {
        if (cid === selectedCountry) return;
        const o = document.createElement("option");
        o.value = cid; o.textContent = COUNTRY_NAMES[cid];
        sel.appendChild(o);
    });
    loadDiplomacyStatus();
}

document.getElementById("diplomacy-propose-button").addEventListener("click", async () => {
    if (!userId) return;
    const target = document.getElementById("diplomacy-target").value;
    const type = document.getElementById("diplomacy-type").value;
    const dur = document.getElementById("diplomacy-duration").value;
    try {
        const d = await apiPost("/api/propose-treaty", { target, type, duration_days: Number(dur) });
        if (!d.success) { showToast(d.message || "خطا"); return; }
        showToast(d.message); loadDiplomacyStatus();
    } catch (e) { showToast("خطا."); }
});

async function loadDiplomacyStatus() {
    if (!userId) return;
    try {
        const d = await apiGet("/api/diplomacy");
        renderReceivedProposals(d.received || []);
        renderTreatyList(d.treaties || []);
        renderSentProposals(d.sent || []);
    } catch (e) { console.error(e); }
}

function renderReceivedProposals(list) {
    const c = document.getElementById("diplomacy-received");
    c.innerHTML = "";
    if (!list.length) {
        c.innerHTML = `<div class="diplomacy-item-empty">پیشنهاد دریافتی نیست.</div>`; return;
    }
    list.forEach(p => {
        const div = document.createElement("div");
        div.className = "diplomacy-item";
        div.innerHTML = `
            <span>${TREATY_TYPE_NAMES[p.treaty_type]} از ${flagInline(p.from_country, true)} ${COUNTRY_NAMES[p.from_country]} — ${p.duration_days} روز</span>
            <span>
                <button class="message-button" data-accept="${p.id}" style="background:rgba(74,222,128,.15);color:#4ade80;border-color:rgba(74,222,128,.3);">قبول</button>
                <button class="message-button" data-reject="${p.id}">رد</button>
            </span>`;
        c.appendChild(div);
    });
    c.querySelectorAll("[data-accept]").forEach(b => b.onclick = () => respondTreaty(b.dataset.accept, true));
    c.querySelectorAll("[data-reject]").forEach(b => b.onclick = () => respondTreaty(b.dataset.reject, false));
}

async function respondTreaty(pid, accept) {
    try {
        const d = await apiPost("/api/respond-treaty", { proposal_id: pid, accept });
        if (!d.success) { showToast("خطا"); return; }
        showToast(accept ? "پذیرفته شد." : "رد شد.");
        loadDiplomacyStatus();
    } catch (e) { showToast("خطا."); }
}

function renderTreatyList(list) {
    const c = document.getElementById("diplomacy-treaties");
    c.innerHTML = "";
    if (!list.length) { c.innerHTML = `<div class="diplomacy-item-empty">پیمانی نیست.</div>`; return; }
    list.forEach(t => {
        const other = t.country_a === selectedCountry ? t.country_b : t.country_a;
        const div = document.createElement("div");
        div.className = "diplomacy-item";
        div.innerHTML = `<span>${TREATY_TYPE_NAMES[t.treaty_type]} با ${flagInline(other, true)} ${COUNTRY_NAMES[other] || other}</span>`;
        c.appendChild(div);
    });
}

function renderSentProposals(list) {
    const c = document.getElementById("diplomacy-sent");
    c.innerHTML = "";
    if (!list.length) { c.innerHTML = `<div class="diplomacy-item-empty">پیشنهاد ارسالی نیست.</div>`; return; }
    list.forEach(p => {
        const div = document.createElement("div");
        div.className = "diplomacy-item";
        div.innerHTML = `<span>${TREATY_TYPE_NAMES[p.treaty_type]} به ${flagInline(p.to_country, true)} ${COUNTRY_NAMES[p.to_country]}</span><span>در انتظار</span>`;
        c.appendChild(div);
    });
}

/* =========================================================
   Bottom Nav
========================================================= */
document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
        const page = item.dataset.page;
        showGamePage(page);
        document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
        item.classList.add("active");
        if (page === "home") { updateHomeStats(); loadRankings(); refreshNotificationBadge(); }
        else if (page === "map") setTimeout(() => initWorldMap(), 30);
        else if (page === "communications") { loadAnnouncements(); loadUnion(); loadNews(); refreshNotificationBadge(); }
        else if (page === "market") { loadMarketListings(); loadMyListings(); }
    });
});

/* =========================================================
   Communications — Tabs
========================================================= */
document.querySelectorAll(".comm-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        const tid = tab.dataset.tab;
        document.querySelectorAll(".comm-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        document.querySelectorAll(".comm-panel").forEach(p => p.classList.add("hidden"));
        const panel = document.getElementById(tid);
        if (panel) panel.classList.remove("hidden");
        if (tid === "comm-announcements") loadAnnouncements();
        else if (tid === "comm-unions") loadUnion();
        else if (tid === "comm-news") loadNews();
        else if (tid === "comm-contacts") renderContactList();
    });
});

/* =========================================================
   Announcements
========================================================= */
document.getElementById("ann-submit").addEventListener("click", async () => {
    const ta = document.getElementById("ann-text");
    const text = ta.value.trim();
    if (!text) return;
    try {
        const d = await apiPost("/api/announcements/create", { text });
        if (!d.success) { showToast(d.message || "خطا"); return; }
        ta.value = "";
        showToast("بیانیه ثبت شد.");
        loadAnnouncements();
    } catch (e) { showToast("خطا."); }
});

async function loadAnnouncements() {
    try {
        const list = await apiGet("/api/announcements");
        const c = document.getElementById("ann-list");
        c.innerHTML = "";
        if (!list.length) { c.innerHTML = `<div class="diplomacy-item-empty">بیانیه‌ای نیست.</div>`; return; }
        list.forEach(a => {
            const div = document.createElement("div");
            div.className = "ann-card";
            const supportFlags = a.support.map(cid => flagInline(cid, true)).join(" ");
            const accuseFlags = a.accuse.map(cid => flagInline(cid, true)).join(" ");
            const commentsHtml = (a.comments || []).map(cm =>
                `<div class="ann-comment-bubble">${flagInline(cm.from_country, true)} <span>${escapeHtml(cm.text)}</span></div>`
            ).join("");
            div.innerHTML = `
                <div class="ann-header">
                    <span class="ann-flag">${flagInline(a.from_country, true)}</span>
                    <span class="ann-name">${COUNTRY_NAMES[a.from_country] || a.from_country}</span>
                </div>
                <div class="ann-text">${escapeHtml(a.text)}</div>
                <div class="ann-reactions">
                    <button class="ann-react support" data-react="support" data-id="${a.id}">✅ حمایت</button>
                    <button class="ann-react accuse" data-react="accuse" data-id="${a.id}">❌ اتهام</button>
                </div>
                <div class="ann-flags">
                    ${supportFlags ? `<div class="ann-flags-row"><span>✅</span> ${supportFlags}</div>` : ""}
                    ${accuseFlags ? `<div class="ann-flags-row"><span>❌</span> ${accuseFlags}</div>` : ""}
                </div>
                <div class="ann-comments" id="ann-comments-${a.id}">${commentsHtml}</div>
                <div class="ann-comment-row">
                    <input class="ann-comment-input" data-ann="${a.id}" placeholder="کامنت...">
                    <button class="ann-comment-send" data-ann="${a.id}">ارسال</button>
                </div>`;
            c.appendChild(div);
        });
        c.querySelectorAll(".ann-react").forEach(b => b.onclick = () => reactAnn(b.dataset.id, b.dataset.react));
        c.querySelectorAll(".ann-comment-send").forEach(b => b.onclick = () => commentAnn(b.dataset.ann));
    } catch (e) { console.error(e); }
}

async function reactAnn(id, reaction) {
    try {
        const d = await apiPost("/api/announcements/react", { announcement_id: id, reaction });
        if (!d.success) { showToast("خطا"); return; }
        loadAnnouncements();
    } catch (e) {}
}

async function commentAnn(id) {
    const inp = document.querySelector(`.ann-comment-input[data-ann="${id}"]`);
    if (!inp || !inp.value.trim()) return;
    try {
        const d = await apiPost("/api/announcements/comment", { announcement_id: id, text: inp.value.trim() });
        if (!d.success) { showToast("خطا"); return; }
        inp.value = "";
        loadAnnouncements();
    } catch (e) {}
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* =========================================================
   Unions
========================================================= */
async function loadUnion() {
    const c = document.getElementById("union-content");
    c.innerHTML = "";
    try {
        const d = await apiGet("/api/union");
        if (!d.union) {
            c.innerHTML = `
                <div class="ann-form">
                    <input id="union-name" class="diplomacy-input" placeholder="نام اتحادیه..." maxlength="40">
                    <button id="union-create" class="diplomacy-submit">ساخت اتحادیه</button>
                </div>`;
            document.getElementById("union-create").onclick = async () => {
                const name = document.getElementById("union-name").value.trim();
                if (!name) return;
                const r = await apiPost("/api/union/create", { name });
                if (!r.success) { showToast("خطا"); return; }
                showToast("اتحادیه ساخته شد."); loadUnion();
            };

            if (d.invites?.length) {
                const invBox = document.createElement("div");
                invBox.style.marginTop = "14px";
                invBox.innerHTML = `<div class="diplomacy-list-title">دعوت‌ها</div>`;
                d.invites.forEach(inv => {
                    const row = document.createElement("div");
                    row.className = "diplomacy-item";
                    row.innerHTML = `<span>${inv.name} از ${flagInline(inv.leader, true)} ${COUNTRY_NAMES[inv.leader]}</span>
                        <span>
                            <button class="message-button" data-invite-accept="${inv.union_id}" style="background:rgba(74,222,128,.15);color:#4ade80;">قبول</button>
                            <button class="message-button" data-invite-reject="${inv.union_id}">رد</button>
                        </span>`;
                    invBox.appendChild(row);
                });
                c.appendChild(invBox);
                invBox.querySelectorAll("[data-invite-accept]").forEach(b => b.onclick = () => respondInvite(b.dataset.inviteAccept, true));
                invBox.querySelectorAll("[data-invite-reject]").forEach(b => b.onclick = () => respondInvite(b.dataset.inviteReject, false));
            }
            return;
        }

        const u = d.union;
        const isLeader = d.is_leader;
        const header = document.createElement("div");
        header.className = "infra-card";
        header.innerHTML = `
            <div class="infra-card-top">
                <span class="infra-card-name">${u.name}</span>
                <span class="infra-card-level">${u.members.length} عضو</span>
            </div>
            <div class="infra-card-detail">
                اعضا: ${u.members.map(m => flagInline(m, true) + " " + COUNTRY_NAMES[m]).join(" • ")}
            </div>`;
        c.appendChild(header);

        if (isLeader) {
            const invForm = document.createElement("div");
            invForm.className = "ann-form";
            invForm.innerHTML = `
                <label class="diplomacy-label">دعوت کشور</label>
                <select id="invite-target" class="diplomacy-select">
                    ${Object.keys(COUNTRY_NAMES).filter(cid => !u.members.includes(cid) && cid !== selectedCountry)
                        .map(cid => `<option value="${cid}">${COUNTRY_NAMES[cid]}</option>`).join("")}
                </select>
                <button id="invite-submit" class="diplomacy-submit">ارسال دعوت</button>`;
            c.appendChild(invForm);
            document.getElementById("invite-submit").onclick = async () => {
                const target = document.getElementById("invite-target").value;
                const r = await apiPost("/api/union/invite", { union_id: u.id, target });
                if (!r.success) { showToast("خطا"); return; }
                showToast("دعوت ارسال شد.");
            };
        }

        const msgTitle = document.createElement("div");
        msgTitle.className = "diplomacy-list-title";
        msgTitle.textContent = "پیام‌های اتحادیه";
        c.appendChild(msgTitle);

        const msgBox = document.createElement("div");
        msgBox.className = "ann-list";
        u.messages?.forEach(m => {
            const d2 = document.createElement("div");
            d2.className = "ann-card";
            d2.innerHTML = `<div class="ann-header">
                <span class="ann-flag">${flagInline(m.from_country, true)}</span>
                <span class="ann-name">${COUNTRY_NAMES[m.from_country]}</span>
            </div><div class="ann-text">${escapeHtml(m.text)}</div>`;
            msgBox.appendChild(d2);
        });
        c.appendChild(msgBox);

        const inp = document.createElement("div");
        inp.className = "ann-form";
        inp.innerHTML = `
            <textarea id="union-msg" class="ann-input" maxlength="500" placeholder="پیام به اتحادیه..."></textarea>
            <button id="union-msg-send" class="ann-submit">ارسال</button>
            <button id="union-leave" class="diplomacy-submit" style="background:#6a2b2b;color:#fff;">خروج از اتحادیه</button>`;
        c.appendChild(inp);
        document.getElementById("union-msg-send").onclick = async () => {
            const text = document.getElementById("union-msg").value.trim();
            if (!text) return;
            await apiPost("/api/union/message", { text });
            loadUnion();
        };
        document.getElementById("union-leave").onclick = async () => {
            if (!confirm("از اتحادیه خارج می‌شوید؟")) return;
            await apiPost("/api/union/leave", {});
            loadUnion();
        };
    } catch (e) { console.error(e); }
}

async function respondInvite(u_id, accept) {
    await apiPost("/api/union/respond", { union_id: u_id, accept });
    loadUnion();
}

/* =========================================================
   News
========================================================= */
async function loadNews() {
    const c = document.getElementById("news-list");
    if (!c) return;
    try {
        const news = await apiGet("/api/news");
        c.innerHTML = "";
        news.forEach(item => {
            const div = document.createElement("div");
            div.className = "news-item";
            div.innerHTML = `<h3>${escapeHtml(item.title || "")}</h3><p>${escapeHtml(item.text || "")}</p>`;
            c.appendChild(div);
        });
        refreshNotificationBadge();
    } catch (e) {
        c.innerHTML = `<div class="news-item"><h3>اخبار</h3><p>خبری نیست.</p></div>`;
    }
}

/* =========================================================
   Private Messages
========================================================= */
function renderContactList() {
    const c = document.getElementById("contact-list");
    if (!c) return;
    c.innerHTML = "";
    Object.keys(COUNTRY_NAMES).forEach(cid => {
        if (cid === selectedCountry) return;
        const div = document.createElement("div");
        div.className = "contact-item";
        div.innerHTML = `
            <div class="contact-info">
                ${flagInline(cid, true)}
                <span class="contact-name">${COUNTRY_NAMES[cid]}</span>
            </div>
            <button class="message-button" data-open-pm="${cid}">گفتگو</button>`;
        c.appendChild(div);
    });
    c.querySelectorAll("[data-open-pm]").forEach(b => b.onclick = () => openPM(b.dataset.openPm));
}

function openPM(target) {
    currentPMTarget = target;
    document.getElementById("contact-list").classList.add("hidden");
    document.getElementById("pm-conversation").classList.remove("hidden");
    document.getElementById("pm-target-name").textContent = COUNTRY_NAMES[target];
    loadPM(target);
}

document.getElementById("pm-back").onclick = () => {
    currentPMTarget = null;
    document.getElementById("contact-list").classList.remove("hidden");
    document.getElementById("pm-conversation").classList.add("hidden");
};

document.getElementById("pm-send").onclick = async () => {
    const ta = document.getElementById("pm-input");
    const text = ta.value.trim();
    if (!text || !currentPMTarget) return;
    await apiPost("/api/pm/send", { target: currentPMTarget, text });
    ta.value = "";
    loadPM(currentPMTarget);
};

async function loadPM(target) {
    try {
        const d = await apiGet("/api/pm", { target });
        const c = document.getElementById("pm-messages");
        c.innerHTML = "";
        (d.messages || []).forEach(m => {
            const mine = m.from === selectedCountry;
            const div = document.createElement("div");
            div.className = `pm-msg ${mine ? "pm-mine" : "pm-other"}`;
            div.textContent = m.text;
            c.appendChild(div);
        });
    } catch (e) { console.error(e); }
}

/* =========================================================
   Market
========================================================= */
document.querySelectorAll(".market-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".market-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        document.querySelectorAll(".market-panel").forEach(p => p.classList.add("hidden"));
        const panel = document.getElementById(tab.dataset.marketTab);
        if (panel) panel.classList.remove("hidden");
        if (tab.dataset.marketTab === "market-list-panel") loadMarketListings();
        else if (tab.dataset.marketTab === "market-mine-panel") loadMyListings();
    });
});

async function loadMarketListings() {
    const c = document.getElementById("market-listings");
    if (!c) return;
    c.innerHTML = "";
    try {
        const d = await apiGet("/api/market");
        if (!d.listings?.length) { c.innerHTML = `<div class="diplomacy-item-empty">سفارشی نیست.</div>`; return; }
        d.listings.forEach(l => {
            const div = document.createElement("div");
            div.className = "infra-card";
            const wantText = l.want_resource === "money" ? formatMoney(l.want_amount)
                : `${formatNumber(l.want_amount)} ${RESOURCE_NAMES[l.want_resource]}`;
            div.innerHTML = `
                <div class="infra-card-top">
                    <span class="infra-card-name">${flagInline(l.seller, true)} ${COUNTRY_NAMES[l.seller]}</span>
                    <span class="infra-card-level">${RESOURCE_ICONS[l.sell_resource]} ${formatNumber(l.sell_amount)}</span>
                </div>
                <div class="infra-card-detail">در ازای: ${wantText}</div>
                <button class="infra-upgrade-button" data-buy="${l.id}">معامله</button>`;
            c.appendChild(div);
        });
        c.querySelectorAll("[data-buy]").forEach(b => b.onclick = () => acceptListing(b.dataset.buy));
    } catch (e) {}
}

async function acceptListing(lid) {
    try {
        const d = await apiPost("/api/market/accept", { listing_id: lid });
        if (!d.success) { showToast(d.message || "خطا"); return; }
        showToast("معامله انجام شد.");
        loadMarketListings(); await refreshPlayer();
    } catch (e) {}
}

document.getElementById("mk-submit").onclick = async () => {
    const sr = document.getElementById("mk-sell-res").value;
    const wr = document.getElementById("mk-want-res").value;
    const sa = Number(document.getElementById("mk-sell-amt").value);
    const wa = Number(document.getElementById("mk-want-amt").value);
    try {
        const d = await apiPost("/api/market/create", { sell_resource: sr, sell_amount: sa,
            want_resource: wr, want_amount: wa });
        if (!d.success) { showToast(d.message || "خطا"); return; }
        showToast("سفارش ثبت شد.");
        loadMarketListings();
    } catch (e) {}
};

async function loadMyListings() {
    const c = document.getElementById("market-mine");
    if (!c) return;
    c.innerHTML = "";
    try {
        const d = await apiGet("/api/market");
        const mine = (d.listings || []).filter(l => l.seller === selectedCountry);
        if (!mine.length) { c.innerHTML = `<div class="diplomacy-item-empty">سفارشی ندارید.</div>`; return; }
        mine.forEach(l => {
            const div = document.createElement("div");
            div.className = "infra-card";
            div.innerHTML = `
                <div class="infra-card-top">
                    <span class="infra-card-name">${RESOURCE_ICONS[l.sell_resource]} ${formatNumber(l.sell_amount)}</span>
                    <span class="infra-card-level">در ازای ${l.want_resource === "money" ? formatMoney(l.want_amount) : formatNumber(l.want_amount) + " " + RESOURCE_NAMES[l.want_resource]}</span>
                </div>
                <button class="infra-upgrade-button" data-cancel="${l.id}" style="background:rgba(248,113,113,.15);color:#f87171;border-color:rgba(248,113,113,.3);">لغو سفارش</button>`;
            c.appendChild(div);
        });
        c.querySelectorAll("[data-cancel]").forEach(b => b.onclick = async () => {
            await apiPost("/api/market/cancel", { listing_id: b.dataset.cancel });
            loadMyListings();
        });
    } catch (e) {}
}

/* =========================================================
   Map — World globe
========================================================= */
let mapProjection = null, mapPath = null, mapSvg = null;
let mapSize = 0, mapMinScale = 0, mapMaxScale = 0;
let mapRotation = [0, -10];
let mapInitialized = false;
let mapAbort = null;
let mapSites = [];
let mapSitesSvg = null;

async function initWorldMap() {
    const box = document.querySelector(".map-box");
    const svgEl = document.getElementById("map-globe");
    if (!box || !svgEl) return;

    if (mapInitialized) { updateMapColors(); redrawMap(); return; }

    const w = box.clientWidth || 320;
    const h = box.clientHeight || 300;
    mapSize = Math.min(w, h) * 0.46;
    mapMinScale = mapSize * 0.8;
    mapMaxScale = mapSize * 6;

    let world;
    try { world = await loadWorldAtlas(); }
    catch (e) { console.error(e); return; }

    const land = topojson.feature(world, world.objects.countries);
    mapProjection = d3.geoOrthographic().scale(mapSize).translate([w / 2, h / 2])
        .rotate(mapRotation).clipAngle(90);
    mapPath = d3.geoPath(mapProjection);
    mapSvg = d3.select(svgEl).attr("viewBox", `0 0 ${w} ${h}`);
    mapSvg.selectAll("*").remove();

    mapSvg.append("path").datum({ type: "Sphere" }).attr("class", "globe-water").attr("d", mapPath);

    mapSvg.selectAll(".map-country")
        .data(land.features).enter().append("path")
        .attr("class", "map-country").attr("d", mapPath)
        .attr("data-country-id", d => d.id)
        .on("click", (e, d) => { e.stopPropagation(); showCountryInfo(d); });

    mapSvg.selectAll(".map-country-label")
        .data(land.features.filter(d => Object.values(COUNTRY_IDS).includes(Number(d.id))))
        .enter().append("text")
        .attr("class", "map-country-label").attr("text-anchor", "middle")
        .text(d => {
            const e = Object.entries(COUNTRY_IDS).find(([, id]) => id === Number(d.id));
            return e ? COUNTRY_NAMES[e[0]] : "";
        });

    mapSvg.selectAll(".map-ocean-label")
        .data(OCEAN_LABELS).enter().append("text")
        .attr("class", "map-ocean-label").attr("text-anchor", "middle")
        .text(d => d[2]);

    await loadMapSites();
    mapSitesSvg = mapSvg.append("g").attr("class", "map-sites-layer");
    renderMapSites();

    updateMapColors(); redrawMap();
    attachMapInteractions(svgEl);

    document.getElementById("map-zoom-in").onclick = () => zoomMap(1.35);
    document.getElementById("map-zoom-out").onclick = () => zoomMap(1 / 1.35);
    document.getElementById("map-reset").onclick = () => {
        mapProjection.scale(mapSize); mapRotation = [0, -10]; mapProjection.rotate(mapRotation); redrawMap();
    };
    document.getElementById("map-info-close").onclick = () => {
        document.getElementById("map-info-panel").classList.add("hidden");
    };
    mapInitialized = true;
}

async function loadMapSites() {
    try { mapSites = await apiGet("/api/map-sites"); }
    catch (e) { mapSites = []; }
}

function renderMapSites() {
    if (!mapSitesSvg) return;
    mapSitesSvg.selectAll("*").remove();
    mapSitesSvg.selectAll(".map-site")
        .data(mapSites).enter().append("circle")
        .attr("class", d => `map-site map-site-${d.kind === "strait" ? "strait" : d.type}`)
        .attr("r", 3.2)
        .on("click", (e, d) => { e.stopPropagation(); showSiteInfo(d); });
}

function updateMapSitePositions() {
    if (!mapSitesSvg || !mapProjection) return;
    const rot = mapProjection.rotate();
    mapSitesSvg.selectAll(".map-site")
        .attr("opacity", d => isPointVisible(d.lon, d.lat, rot) ? 1 : 0)
        .attr("cx", d => { const p = mapProjection([d.lon, d.lat]); return p ? p[0] : -9999; })
        .attr("cy", d => { const p = mapProjection([d.lon, d.lat]); return p ? p[1] : -9999; });
}

function zoomMap(f) {
    const n = mapProjection.scale() * f;
    mapProjection.scale(Math.max(mapMinScale, Math.min(mapMaxScale, n)));
    redrawMap();
}

function attachMapInteractions(svgEl) {
    if (mapAbort) mapAbort.abort();
    mapAbort = new AbortController();
    const signal = mapAbort.signal;
    let dragging = false, pinching = false, lx = 0, ly = 0, pd = 0, ps = mapSize;

    svgEl.addEventListener("mousedown", e => { dragging = true; lx = e.clientX; ly = e.clientY; }, { signal });
    window.addEventListener("mouseup", () => { dragging = false; }, { signal });
    window.addEventListener("mousemove", e => {
        if (!dragging) return;
        mapRotation[0] += (e.clientX - lx) * 0.4;
        mapRotation[1] -= (e.clientY - ly) * 0.4;
        mapRotation[1] = Math.max(-90, Math.min(90, mapRotation[1]));
        mapProjection.rotate(mapRotation); redrawMap();
        lx = e.clientX; ly = e.clientY;
    }, { signal });

    svgEl.addEventListener("wheel", e => {
        e.preventDefault();
        zoomMap(e.deltaY > 0 ? 0.9 : 1.1);
    }, { passive: false, signal });

    svgEl.addEventListener("touchstart", e => {
        if (e.touches.length === 2) {
            pinching = true; dragging = false;
            pd = getTouchDistance(e.touches); ps = mapProjection.scale(); return;
        }
        if (!e.touches.length) return;
        dragging = true; lx = e.touches[0].clientX; ly = e.touches[0].clientY;
    }, { passive: true, signal });

    svgEl.addEventListener("touchend", e => {
        dragging = false;
        if (e.touches.length < 2) pinching = false;
    }, { passive: true, signal });

    svgEl.addEventListener("touchmove", e => {
        if (pinching && e.touches.length === 2) {
            e.preventDefault();
            const r = getTouchDistance(e.touches) / pd;
            mapProjection.scale(Math.max(mapMinScale, Math.min(mapMaxScale, ps * r)));
            redrawMap(); return;
        }
        if (!dragging || !e.touches.length) return;
        mapRotation[0] += (e.touches[0].clientX - lx) * 0.4;
        mapRotation[1] -= (e.touches[0].clientY - ly) * 0.4;
        mapRotation[1] = Math.max(-90, Math.min(90, mapRotation[1]));
        mapProjection.rotate(mapRotation); redrawMap();
        lx = e.touches[0].clientX; ly = e.touches[0].clientY;
        e.preventDefault();
    }, { passive: false, signal });
}

function redrawMap() {
    if (!mapSvg || !mapProjection) return;
    const rot = mapProjection.rotate();
    mapSvg.selectAll("path.globe-water, path.map-country").attr("d", mapPath);

    mapSvg.selectAll(".map-ocean-label")
        .attr("opacity", d => isPointVisible(d[0], d[1], rot) ? 1 : 0)
        .attr("x", d => { const p = mapProjection([d[0], d[1]]); return p ? p[0] : -9999; })
        .attr("y", d => { const p = mapProjection([d[0], d[1]]); return p ? p[1] : -9999; });

    mapSvg.selectAll(".map-country-label")
        .attr("x", d => { const c = mapPath.centroid(d); return isNaN(c[0]) ? -9999 : c[0]; })
        .attr("y", d => { const c = mapPath.centroid(d); return isNaN(c[1]) ? -9999 : c[1]; })
        .attr("opacity", d => { const c = mapPath.centroid(d); return isNaN(c[0]) ? 0 : 1; });

    updateMapSitePositions();
}

function updateMapColors() {
    if (!mapSvg) return;
    mapSvg.selectAll(".map-country")
        .attr("fill", d => {
            const cid = Number(d.id);
            const e = Object.entries(COUNTRY_IDS).find(([, id]) => id === cid);
            if (!e) return "#151b21";
            const [key] = e;
            const info = countries[key];
            if (info?.occupier) {
                if (info.occupier === selectedCountry) return "#2fa360";
                if (info.taken && key === selectedCountry) return "#2fa360";
                return "#8e4ec6";
            }
            if (key === selectedCountry) return "#d98a25";
            if (info?.taken) return "#b8862a";
            return "#1c2733";
        })
        .attr("stroke", d => Object.values(COUNTRY_IDS).includes(Number(d.id)) ? "#2d3a48" : "#141c25")
        .attr("stroke-width", .6);
}

function showCountryInfo(feature) {
    const cid = Number(feature.id);
    const e = Object.entries(COUNTRY_IDS).find(([, id]) => id === cid);
    const panel = document.getElementById("map-info-panel");
    const flagEl = document.getElementById("map-info-flag");
    const nameEl = document.getElementById("map-info-name");
    const statusEl = document.getElementById("map-info-status");
    const descEl = document.getElementById("map-info-desc");
    const actionBtn = document.getElementById("map-info-action");
    actionBtn.classList.add("hidden");

    if (!e) {
        flagEl.textContent = "🏳️"; nameEl.textContent = "منطقه غیربازی";
        statusEl.textContent = "بی‌صاحب"; descEl.textContent = "کنترل نشده.";
        panel.classList.remove("hidden"); return;
    }
    const [key] = e;
    const info = countries[key];
    flagEl.innerHTML = flagInline(key, true);
    nameEl.textContent = COUNTRY_NAMES[key];
    if (info?.occupier) {
        statusEl.textContent = `اشغال توسط ${COUNTRY_NAMES[info.occupier]}`;
        descEl.textContent = "این کشور توسط نیروهای مهاجم اشغال شده است.";
    } else if (key === selectedCountry) {
        statusEl.textContent = "کشور شما"; descEl.textContent = "تحت فرماندهی شماست.";
    } else if (info?.taken) {
        statusEl.textContent = "بازیکن دیگر"; descEl.textContent = "در اختیار بازیکن دیگر.";
    } else {
        statusEl.textContent = "بی‌صاحب"; descEl.textContent = "هنوز انتخاب نشده.";
    }
    panel.classList.remove("hidden");
}

function showSiteInfo(site) {
    const panel = document.getElementById("map-info-panel");
    const flagEl = document.getElementById("map-info-flag");
    const nameEl = document.getElementById("map-info-name");
    const statusEl = document.getElementById("map-info-status");
    const descEl = document.getElementById("map-info-desc");
    const actionBtn = document.getElementById("map-info-action");

    if (site.kind === "strait") {
        flagEl.textContent = "⚓";
        descEl.textContent = `درآمد روزانه: ${formatMoney(site.income)}`;
    } else {
        flagEl.textContent = RESOURCE_ICONS[site.type] || "📍";
        descEl.textContent = `تولید: ${formatNumber(site.production)} در روز`;
    }
    nameEl.textContent = site.name;
    if (site.owner) {
        statusEl.innerHTML = `متعلق به ${flagInline(site.owner, true)} ${COUNTRY_NAMES[site.owner] || site.owner}`;
    } else {
        statusEl.textContent = "بی‌صاحب";
    }

    if (site.owner !== selectedCountry) {
        actionBtn.classList.remove("hidden");
        actionBtn.onclick = () => captureSite(site.id);
    } else {
        actionBtn.classList.add("hidden");
    }
    panel.classList.remove("hidden");
}

async function captureSite(siteId) {
    if (!confirm("۱ ناو برای تصرف فرستاده می‌شود. ادامه؟")) return;
    try {
        const d = await apiPost("/api/map/capture", { site_id: siteId });
        if (!d.success) { showToast(d.message || "خطا"); return; }
        showToast(d.message);
        await loadMapSites();
        renderMapSites();
        updateMapSitePositions();
        await refreshPlayer();
    } catch (e) { showToast("خطا."); }
}

/* =========================================================
   Helpers for Globe
========================================================= */
function getTouchDistance(t) {
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}

function isPointVisible(lon, lat, rot) {
    const clon = -rot[0], clat = -rot[1];
    const r = d => (d * Math.PI) / 180;
    const l1 = r(clat), l2 = r(lat), dl = r(lon - clon);
    return Math.sin(l1) * Math.sin(l2) + Math.cos(l1) * Math.cos(l2) * Math.cos(dl) > 0;
}

/* =========================================================
   Preview Globe
========================================================= */
let previewGlobeAbort = null;

async function createPreviewGlobe(containerId, svgId, selected) {
    const cont = document.getElementById(containerId);
    const svgEl = document.getElementById(svgId);
    if (!cont || !svgEl) return;

    if (previewGlobeAbort) previewGlobeAbort.abort();
    previewGlobeAbort = new AbortController();
    const signal = previewGlobeAbort.signal;

    const w = cont.clientWidth || 300;
    const h = cont.clientHeight || 300;
    const size = Math.min(w, h) * 0.46;
    const minS = size * 0.8, maxS = size * 4;

    d3.select(svgEl).selectAll("*").remove();
    const svg = d3.select(svgEl).attr("viewBox", `0 0 ${w} ${h}`);
    const proj = d3.geoOrthographic().scale(size).translate([w / 2, h / 2]).clipAngle(90);
    const path = d3.geoPath(proj);

    let world;
    try { world = await loadWorldAtlas(); }
    catch (e) { return; }
    if (signal.aborted) return;
    const land = topojson.feature(world, world.objects.countries);

    svg.append("path").datum({ type: "Sphere" }).attr("class", "globe-water").attr("d", path);

    svg.selectAll(".country-shape").data(land.features).enter().append("path")
        .attr("class", "country-shape").attr("d", path)
        .attr("fill", d => {
            const cid = Number(d.id);
            if (selected && COUNTRY_IDS[selected] === cid) return "#d98a25";
            const taken = Object.values(countries).some(c => c.taken && COUNTRY_IDS[c.id] === cid);
            if (taken) return "#b8862a";
            const isGame = Object.values(COUNTRY_IDS).includes(cid);
            return isGame ? "#111820" : "#151b21";
        })
        .attr("stroke", d => Object.values(COUNTRY_IDS).includes(Number(d.id)) ? "#26313c" : "none")
        .attr("stroke-width", .6);

    let rot = proj.rotate(), dragging = false, pinching = false, lx = 0, ly = 0, pd = 0, ps = size, raf = null;

    function redraw() { svg.selectAll("path").attr("d", path); }
    function autoRotate() {
        if (signal.aborted) return;
        if (!dragging && !pinching) { rot[0] += 0.08; proj.rotate(rot); redraw(); }
        raf = requestAnimationFrame(autoRotate);
    }
    raf = requestAnimationFrame(autoRotate);
    signal.addEventListener("abort", () => { if (raf) cancelAnimationFrame(raf); });

    svgEl.addEventListener("mousedown", e => { dragging = true; lx = e.clientX; ly = e.clientY; }, { signal });
    window.addEventListener("mouseup", () => { dragging = false; }, { signal });
    window.addEventListener("mousemove", e => {
        if (!dragging) return;
        rot[0] += (e.clientX - lx) * 0.5;
        rot[1] -= (e.clientY - ly) * 0.5;
        rot[1] = Math.max(-90, Math.min(90, rot[1]));
        proj.rotate(rot); redraw();
        lx = e.clientX; ly = e.clientY;
    }, { signal });

    svgEl.addEventListener("wheel", e => {
        e.preventDefault();
        const n = proj.scale() * (e.deltaY > 0 ? 0.9 : 1.1);
        proj.scale(Math.max(minS, Math.min(maxS, n))); redraw();
    }, { passive: false, signal });

    svgEl.addEventListener("touchstart", e => {
        if (e.touches.length === 2) {
            pinching = true; dragging = false;
            pd = getTouchDistance(e.touches); ps = proj.scale(); return;
        }
        if (!e.touches.length) return;
        dragging = true; lx = e.touches[0].clientX; ly = e.touches[0].clientY;
    }, { passive: true, signal });

    svgEl.addEventListener("touchend", e => {
        dragging = false;
        if (e.touches.length < 2) pinching = false;
    }, { passive: true, signal });

    svgEl.addEventListener("touchmove", e => {
        if (pinching && e.touches.length === 2) {
            e.preventDefault();
            const r = getTouchDistance(e.touches) / pd;
            proj.scale(Math.max(minS, Math.min(maxS, ps * r))); redraw(); return;
        }
        if (!dragging || !e.touches.length) return;
        rot[0] += (e.touches[0].clientX - lx) * 0.5;
        rot[1] -= (e.touches[0].clientY - ly) * 0.5;
        rot[1] = Math.max(-90, Math.min(90, rot[1]));
        proj.rotate(rot); redraw();
        lx = e.touches[0].clientX; ly = e.touches[0].clientY;
        e.preventDefault();
    }, { passive: false, signal });
}

/* =========================================================
   Init
========================================================= */
(async function init() {
    showOnly("loading");
    const t0 = Date.now();

    await loadCountries();
    await loadPlayer();
    await loadArmyCatalog();

    const el = Date.now() - t0;
    if (el < 1000) await new Promise(r => setTimeout(r, 1000 - el));

    if (player?.country) {
        selectedCountry = player.country;
        showGame();
    } else {
        showCountrySelection();
    }
})();
