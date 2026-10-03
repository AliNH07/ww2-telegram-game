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

// [طول, عرض, اسم, حداقل زوم, حداکثر زوم] — اقیانوس‌ها همیشه، دریاها فقط با زوم بیشتر
const OCEAN_LABELS = [
    [-35, 25, "اقیانوس اطلس", 0, 3.2], [-18, -22, "اقیانوس اطلس", 0, 3.2],
    [-145, 5, "اقیانوس آرام", 0, 3.2], [172, 8, "اقیانوس آرام", 0, 3.2],
    [78, -18, "اقیانوس هند", 0, 3.2],
    [20, -62, "اقیانوس منجمد جنوبی", 0, 3.2], [60, 82, "اقیانوس منجمد شمالی", 0, 3.2],
    [18, 34.5, "دریای مدیترانه", 1.4, 9], [34, 43.3, "دریای سیاه", 1.4, 9],
    [65, 15, "دریای عرب", 1.4, 9], [88, 14, "خلیج بنگال", 1.4, 9],
    [3, 56, "دریای شمال", 1.4, 9], [19.5, 58.5, "دریای بالتیک", 1.4, 9],
    [-74, 15, "دریای کارائیب", 1.4, 9], [-90, 25, "خلیج مکزیک", 1.4, 9],
    [114, 13, "دریای چین جنوبی", 1.4, 9], [134, 40, "دریای ژاپن", 1.4, 9],
    [38.5, 20.5, "دریای سرخ", 1.4, 9], [40, 73, "دریای بارنتس", 1.4, 9],
    [52, 27.2, "خلیج فارس", 1.4, 9], [2, 68, "دریای نروژ", 1.4, 9],
    [160, -38, "دریای تاسمان", 1.4, 9]
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

// تصویر پس‌زمینه کارت خانه (جدا از پرچم)
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
        refreshHeaderRank();
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
        confirmCountrySelection();
    });
});

function showMessage(msg) {
    const el = document.getElementById("country-message");
    if (!el) return;
    el.textContent = msg;
    setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 4000);
}

let enteringCountry = false;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function confirmCountrySelection() {
    if (enteringCountry) return;
    if (!userId) { showToast("از داخل تلگرام وارد شوید."); return; }
    if (player?.country === selectedCountry) { showGame(); return; }
    enteringCountry = true;
    showDashboardShell();   // بلافاصله هدر + «در حال ورود به داشبورد»
    try {
        const data = await apiPost("/api/select-country", { country: selectedCountry });
        if (!data.success) {
            if (data.error === "country_taken") {
                showToast("این کشور قبلاً انتخاب شده است.");
                selectedCountry = null; await loadCountries(); showCountrySelection(); return;
            }
            if (data.error === "already_has_country") {
                await loadPlayer();
                if (player?.country) selectedCountry = player.country;
                showGame(); return;
            }
            if (data.error === "occupied") { showToast("این کشور اشغال شده است."); showCountrySelection(); return; }
            showToast(data.message || "خطا در انتخاب کشور."); showCountrySelection(); return;
        }
        player = data.player; await loadCountries(); showGame();
    } catch (e) {
        showToast("خطای شبکه."); showCountrySelection();
    } finally { enteringCountry = false; }
}

/* ---------- ورود به داشبورد: لود همه عکس‌های خانه، بعد نمایش ---------- */
function preloadImage(url, timeout = 8000) {
    return new Promise(resolve => {
        if (!url) { resolve(); return; }
        const img = new Image();
        const timer = setTimeout(resolve, timeout);
        const done = () => { clearTimeout(timer); resolve(); };
        img.onload = done; img.onerror = done;   // فایلِ نبود، منتظر نمی‌ماند
        img.src = url;
    });
}

function cssBackgroundUrls(el) {
    const bg = getComputedStyle(el).backgroundImage || "";
    return Array.from(bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)).map(m => m[1]);
}

async function preloadHomeAssets() {
    const urls = new Set([homeImageUrl(selectedCountry), countryImageUrl(selectedCountry)]);
    document.querySelectorAll("#game .game-header img, #home img").forEach(img => {
        const src = img.getAttribute("src");
        if (src) urls.add(src);
    });
    document.querySelectorAll("#home .action-card").forEach(c =>
        cssBackgroundUrls(c).forEach(u => urls.add(u)));
    await Promise.all(Array.from(urls).map(u => preloadImage(u)));
    // استیکری که فایلش نیست، مخفی شود
    document.querySelectorAll("#home .action-icon img").forEach(img => {
        if (img.complete && img.naturalWidth === 0) img.style.display = "none";
    });
}

function showDashboardShell() {
    showOnly("game");
    showGamePage("home");
    document.getElementById("game").classList.add("booting");
    if (selectedCountry) updateGameHeader();
}

async function showGame() {
    showDashboardShell();
    updateGameHeader(); updateHomeStats();
    const t0 = Date.now();
    await preloadHomeAssets();
    const el = Date.now() - t0;
    if (el < 600) await sleep(600 - el);
    document.getElementById("game").classList.remove("booting");
    startStatsPolling(); refreshNotificationBadge();
}

function updateGameHeader() {
    document.getElementById("game-country-flag").src = countryImageUrl(selectedCountry);
    refreshHeaderRank();
}

/* =========================================================
   Header: rank + notifications
========================================================= */
async function refreshHeaderRank() {
    const btn = document.getElementById("header-rank-button");
    if (!btn || !selectedCountry) return;
    try {
        const rows = await apiGet("/api/rankings");
        if (!Array.isArray(rows)) return;
        const me = rows.find(r => r.country === selectedCountry);
        const v = document.getElementById("header-rank-value");
        const fill = document.getElementById("header-rank-fill");
        if (!me) { v.textContent = "—"; fill.style.width = "0%"; return; }
        v.textContent = me.rank;
        const pct = rows.length > 1 ? Math.round((rows.length - me.rank) / (rows.length - 1) * 100) : 100;
        fill.style.width = Math.max(8, pct) + "%";
        btn.title = `رتبه ${me.rank} از ${rows.length}`;
    } catch (e) {}
}

document.getElementById("header-rank-button")?.addEventListener("click", () => {
    showGamePage("ranking");
    loadRankings();
});

const seenNewsKey = () => `fl93_seen_news_${userId || "guest"}`;
function getSeenNews() {
    try { return new Set(JSON.parse(localStorage.getItem(seenNewsKey()) || "[]")); }
    catch (e) { return new Set(); }
}
function saveSeenNews(set) {
    try { localStorage.setItem(seenNewsKey(), JSON.stringify([...set].slice(-300))); } catch (e) {}
}
function setNotifBadge(count) {
    const badge = document.getElementById("notif-badge");
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.classList.remove("hidden");
    } else {
        badge.classList.add("hidden");
    }
}

async function refreshNotificationBadge() {
    try {
        const news = await apiGet("/api/news");
        const list = Array.isArray(news) ? news : [];
        const seen = getSeenNews();
        setNotifBadge(list.filter(n => n.id && !seen.has(n.id)).length);
    } catch (e) {}
}

function formatNewsTime(iso) {
    if (!iso) return "";
    try {
        const s = /Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z";
        return new Date(s).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
    } catch (e) { return ""; }
}

async function openNotificationsSheet() {
    document.getElementById("notif-sheet")?.remove();
    const ov = document.createElement("div");
    ov.id = "notif-sheet";
    ov.className = "modal-overlay";
    ov.innerHTML = `
        <div class="ic-sheet notif-sheet">
            <div class="is-head">
                <div class="is-titles">
                    <div class="is-name">🔔 اعلان‌ها</div>
                    <div class="is-sub" id="notif-sub">در حال دریافت...</div>
                </div>
                <button class="is-close" aria-label="بستن">✕</button>
            </div>
            <div class="notif-list" id="notif-list"></div>
        </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    ov.querySelector(".is-close").onclick = close;

    try {
        const news = await apiGet("/api/news");
        const list = Array.isArray(news) ? news : [];
        const seen = getSeenNews();
        const box = ov.querySelector("#notif-list");
        box.innerHTML = "";
        let fresh = 0;
        list.forEach(item => {
            const isNew = !!item.id && !seen.has(item.id);
            if (isNew) fresh++;
            const div = document.createElement("div");
            div.className = "notif-item" + (isNew ? " is-new" : "");
            const t = formatNewsTime(item.at);
            div.innerHTML = `
                <div class="notif-title">${isNew ? '<span class="notif-dot"></span>' : ""}${escapeHtml(item.title || "")}</div>
                <p>${escapeHtml(item.text || "")}</p>
                ${t ? `<div class="notif-time">${t}</div>` : ""}`;
            box.appendChild(div);
        });
        if (!list.length) box.innerHTML = `<div class="notif-empty">اعلانی وجود ندارد.</div>`;
        ov.querySelector("#notif-sub").textContent = fresh ? `${fresh} اعلان جدید` : "همه را دیده‌اید";
        // بعد از دیده شدن، عدد روی زنگ پاک می‌شود
        list.forEach(n => { if (n.id) seen.add(n.id); });
        saveSeenNews(seen);
        setNotifBadge(0);
    } catch (e) {
        ov.querySelector("#notif-sub").textContent = "دریافت اعلان‌ها ممکن نشد.";
    }
}

document.getElementById("game-notification-button")?.addEventListener("click", openNotificationsSheet);

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
    if (photo) {
        // فقط عکس خودِ خانه؛ تا کامل لود نشود چیزی نشان داده نمی‌شود و اگر فایل نبود، پس‌زمینه ساده می‌ماند
        const url = homeImageUrl(selectedCountry);
        if (photo.dataset.src !== url) {
            photo.dataset.src = url;
            photo.classList.remove("loaded");
            photo.style.backgroundImage = "none";
            const img = new Image();
            img.onload = () => {
                if (photo.dataset.src !== url) return;
                photo.style.backgroundImage = `url(${url})`;
                photo.classList.add("loaded");
            };
            img.src = url;
        }
    }
    document.getElementById("home-money").textContent = formatMoney(player.money);
    document.getElementById("home-income").textContent = formatMoney(player.daily_income);
    document.getElementById("home-manpower").textContent = formatNumber(player.manpower);
    document.getElementById("home-manpower-production").textContent = formatNumber(player.manpower_production);
    const pCap = player.power_capacity ?? 0, pUse = player.power_consumption ?? 0;
    document.getElementById("home-power").textContent = formatNumber(Math.max(0, pCap - pUse));   // برق آزاد = ظرفیت − مصرف
    document.getElementById("home-power-sub").textContent = `مصرف: ${formatNumber(pUse)} از ${formatNumber(pCap)}`;
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
        else if (s === "ranking") { showGamePage("ranking"); loadRankings(); }
        else if (s === "transfer" || s === "stats") showToast("به‌زودی فعال می‌شود");
    });
});

document.querySelectorAll(".sub-back-button").forEach(b => {
    b.addEventListener("click", () => showGamePage(b.dataset.backTo || "home"));
});

/* =========================================================
   Infra
========================================================= */
const INFRA_TAB_FILTERS = {
    power:    i => i.group === "power",
    manpower: i => i.group === "manpower",
    food:     i => i.group === "resource" && i.resource_key === "food",
    resource: i => i.group === "resource" && i.resource_key !== "food",
    military: i => ["land", "naval", "air", "missile"].includes(i.group),
};

async function openInfrastructureMenu() {
    showGamePage("infrastructure");
    await refreshPlayer();
    renderInfraTab("power");
}

function updateInfraCounters() {
    if (!player?.infra) return;
    const items = Object.values(player.infra);
    let built = 0;
    Object.entries(INFRA_TAB_FILTERS).forEach(([tab, fn]) => {
        const list = items.filter(fn);
        const b = list.filter(i => i.level > 0).length;
        const el = document.getElementById(`infra-count-${tab}`);
        if (el) el.textContent = `${b}/${list.length}`;
        built += b;
    });
    const bc = document.getElementById("infra-built-count");
    if (bc) bc.textContent = `${built} از ${items.length} ساخته شده`;
    const up = document.getElementById("infra-upkeep-total");
    if (up) up.textContent = player.daily_upkeep > 0 ? `🔧 نگهداری روزانه: ${formatMoney(player.daily_upkeep)}` : "";
}

function renderPowerGrid() {
    const box = document.getElementById("infra-power-grid");
    if (!box || !player) return;
    const cap = player.power_capacity ?? 0, use = player.power_consumption ?? 0, net = cap - use;
    const pct = cap > 0 ? Math.min(100, Math.round(use / cap * 100)) : (use > 0 ? 100 : 0);
    const state = net < 0 ? "bad" : pct >= 85 ? "warn" : "ok";
    box.innerHTML = `
        <div class="pg-card pg-${state}">
            <div class="pg-head">
                <span class="pg-title">⚡ شبکهٔ برق</span>
                <span class="pg-net">${net >= 0 ? "+" : "−"}${formatNumber(Math.abs(net))}</span>
            </div>
            <div class="pg-bar"><span class="pg-fill" style="width:${pct}%"></span></div>
            <div class="pg-foot">
                <span>تولید ${formatNumber(cap)}</span>
                <span>مصرف ${formatNumber(use)} · ${pct}٪</span>
            </div>
        </div>`;
}

function renderInfraTab(tab) {
    document.querySelectorAll(".infra-panel").forEach(p => p.classList.add("hidden"));
    document.querySelectorAll(".infra-tab").forEach(t => t.classList.remove("active"));
    const btn = document.querySelector(`[data-infra-tab="${tab}"]`);
    if (btn) btn.classList.add("active");
    const panel = document.getElementById(`infra-panel-${tab}`);
    if (panel) panel.classList.remove("hidden");

    updateInfraCounters();
    if (tab === "power") {
        renderPowerGrid();
        renderInfraList("infra-power-list", INFRA_TAB_FILTERS.power);
    } else if (tab === "manpower")
        renderInfraList("infra-manpower-list", INFRA_TAB_FILTERS.manpower);
    else if (tab === "food")
        renderInfraList("infra-food-list", INFRA_TAB_FILTERS.food);
    else if (tab === "resource")
        renderInfraList("infra-resource-list", INFRA_TAB_FILTERS.resource);
    else if (tab === "military") {
        renderInfraList("infra-land-list", i => i.group === "land");
        renderInfraList("infra-naval-list", i => i.group === "naval");
        renderInfraList("infra-air-list", i => i.group === "air");
        renderInfraList("infra-missile-list", i => i.group === "missile");
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

function freePower() {
    return Math.max(0, (player?.power_capacity ?? 0) - (player?.power_consumption ?? 0));
}

// آیا بازیکن می‌تواند سطح بعدی را بسازد؟ (پول، برق، منابع)
function infraNeeds(item) {
    const nx = item.next;
    if (!nx) return null;
    const moneyOk = (player.money ?? 0) >= nx.cost;
    const powerReq = item.group === "power" ? 0 : (item.power_required || 0);
    const powerOk = freePower() >= powerReq;
    const res = Object.entries(nx.resources || {}).map(([k, need]) => {
        const have = player.resources?.[k] ?? 0;
        return { key: k, need, have, ok: have >= need };
    });
    const resOk = res.every(r => r.ok);
    return { cost: nx.cost, moneyOk, powerReq, powerOk, res, resOk, canBuild: moneyOk && powerOk && resOk };
}

// عدد اصلی کارت: برق / نیرو / تولید منبع / ظرفیت
function infraMainFigure(item, lvl) {
    if (!lvl) return null;
    const g = item.group;
    if (g === "power")    return { value: "+" + formatNumber(lvl.capacity), label: "برق" };
    if (g === "manpower") return { value: "+" + formatNumber(lvl.production), label: "نفر در روز" };
    if (g === "resource") return { value: "+" + formatNumber(lvl.production), label: `${RESOURCE_NAMES[item.resource_key] || ""} در روز` };
    return { value: formatNumber(lvl.capacity), label: "ظرفیت" };
}

function renderInfraList(cid, filterFn) {
    const c = document.getElementById(cid);
    if (!c || !player?.infra) return;
    c.innerHTML = "";
    Object.entries(player.infra).forEach(([iid, item]) => {
        if (!filterFn(item)) return;
        const built = item.level > 0;
        const need = infraNeeds(item);
        const fig = infraMainFigure(item, built ? item.current : item.next);
        const pips = Array.from({ length: item.max_level }, (_, i) => `<i class="${i < item.level ? "on" : ""}"></i>`).join("");
        const upkeepVal = item.next ? item.next_upkeep : item.upkeep;
        const lvlAfter = item.next ? item.level + 1 : item.level;
        const powerChip = (item.group !== "power" && item.power_required)
            ? `<span class="ic-chip">⚡ مصرف ${formatNumber(item.power_required * lvlAfter)} برق</span>` : "";

        let btnLabel;
        if (!item.next) btnLabel = "حداکثر سطح";
        else btnLabel = built ? `ارتقا به سطح ${item.level + 1} — ${formatMoney(need.cost)}`
                              : `ساخت — ${formatMoney(need.cost)}`;
        const short = need && !need.moneyOk;

        const card = document.createElement("div");
        card.className = `ic-card ${built ? "ic-card--built" : ""} ${short ? "ic-card--short" : ""}`;
        card.innerHTML = `
            <div class="ic-top">
                <div class="ic-hex"><span>${item.icon || "🏗️"}</span></div>
                <div class="ic-titles">
                    <div class="ic-name">${item.name}</div>
                    <div class="ic-pips">${pips}</div>
                </div>
                ${fig ? `<div class="ic-main"><b>${fig.value}</b><small>${fig.label}</small></div>` : ""}
            </div>
            <p class="ic-desc">${item.desc || ""}</p>
            ${powerChip ? `<div class="ic-chips">${powerChip}</div>` : ""}
            <div class="ic-foot">
                <button class="ic-btn ${short ? "ic-btn--short" : ""}" ${item.next ? "" : "disabled"}>${btnLabel}</button>
                <span class="ic-chip ic-chip--upkeep">🔧 ${formatMoney(upkeepVal)} / روز</span>
            </div>`;
        if (item.next) card.addEventListener("click", () => openInfraSheet(iid));
        c.appendChild(card);
    });
}

function closeInfraSheet() { document.getElementById("infra-sheet")?.remove(); }

// پنجرهٔ ساخت/ارتقا: اطلاعات ← قیمت ← دکمهٔ ساخت
function openInfraSheet(iid) {
    const item = player?.infra?.[iid];
    if (!item || !item.next) return;
    closeInfraSheet();
    const built = item.level > 0;
    const need = infraNeeds(item);
    const lvlAfter = item.level + 1;
    const figNow = built ? infraMainFigure(item, item.current) : null;
    const figNext = infraMainFigure(item, item.next);

    const rows = [];
    if (figNext) {
        rows.push(`<div class="is-row"><span>${figNext.label}</span><b>${figNow ? `از ${figNow.value} به ${figNext.value}` : figNext.value}</b></div>`);
    }
    rows.push(`<div class="is-row"><span>🔧 هزینهٔ نگهداری روزانه</span><b>${formatMoney(item.next_upkeep)}${built ? ` <small>(الان ${formatMoney(item.upkeep)})</small>` : ""}</b></div>`);
    if (item.group === "power") {
        rows.push(`<div class="is-row"><span>⚡ برق تولیدی</span><b>${formatNumber(item.next.capacity)} واحد</b></div>`);
    } else if (item.power_required) {
        rows.push(`<div class="is-row ${need.powerOk ? "" : "is-bad"}"><span>⚡ مصرف برق</span><b>${formatNumber(item.power_required * lvlAfter)} واحد <small>(برق آزاد: ${formatNumber(freePower())})</small></b></div>`);
    }
    need.res.forEach(r => {
        rows.push(`<div class="is-row ${r.ok ? "" : "is-bad"}"><span>${RESOURCE_ICONS[r.key] || ""} ${RESOURCE_NAMES[r.key] || r.key} لازم</span><b>${formatNumber(r.need)} <small>(موجود: ${formatNumber(r.have)})</small></b></div>`);
    });

    let okLabel = built ? "ارتقا" : "ساخت";
    if (!need.moneyOk) okLabel = "پول کافی نیست";
    else if (!need.powerOk) okLabel = "برق کافی نیست";
    else if (!need.resOk) okLabel = "منابع کافی نیست";

    const ov = document.createElement("div");
    ov.id = "infra-sheet";
    ov.className = "modal-overlay";
    ov.innerHTML = `
        <div class="ic-sheet">
            <div class="is-head">
                <div class="ic-hex"><span>${item.icon || "🏗️"}</span></div>
                <div class="is-titles">
                    <div class="is-name">${item.name}</div>
                    <div class="is-sub">${built ? `ارتقا از سطح ${item.level} به ${lvlAfter}` : "ساخت جدید · سطح ۱"}</div>
                </div>
                <button class="is-close" aria-label="بستن">✕</button>
            </div>
            <p class="is-desc">${item.desc || ""}</p>
            <div class="is-rows">${rows.join("")}</div>
            <div class="is-price ${need.moneyOk ? "" : "is-bad"}">
                <span>قیمت</span>
                <b>${formatMoney(need.cost)}</b>
            </div>
            ${need.moneyOk ? "" : `<div class="is-lack">${formatMoney(need.cost - (player.money ?? 0))} کم دارید</div>`}
            <div class="modal-actions">
                <button class="modal-cancel">انصراف</button>
                <button class="modal-ok" ${need.canBuild ? "" : "disabled"}>${okLabel}</button>
            </div>
        </div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) closeInfraSheet(); });
    ov.querySelector(".is-close").onclick = closeInfraSheet;
    ov.querySelector(".modal-cancel").onclick = closeInfraSheet;
    const okBtn = ov.querySelector(".modal-ok");
    okBtn.onclick = async () => {
        if (!userId || okBtn.disabled) return;
        okBtn.disabled = true;
        try {
            const d = await apiPost("/api/upgrade-infra", { category: iid });
            if (!d.success) {
                showToast(d.message || "امکان ساخت نیست.", "error");
                okBtn.disabled = false;
                return;
            }
            player = d.player; updateHomeStats(); closeInfraSheet();
            showToast(built ? `✅ ${item.name} به سطح ${lvlAfter} ارتقا یافت.` : `✅ ${item.name} ساخته شد.`, "success");
            const activeTab = document.querySelector(".infra-tab.active")?.dataset.infraTab || "power";
            renderInfraTab(activeTab);
        } catch (e) {
            showToast("خطا در ارتباط با سرور.", "error");
            okBtn.disabled = false;
        }
    };
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
        if (page === "home") { updateHomeStats(); refreshNotificationBadge(); }
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
const WORLD_NAMES_FA = {4:"افغانستان",8:"آلبانی",10:"جنوبگان",12:"الجزایر",16:"ساموآی امریکا",20:"آندورا",24:"آنگولا",28:"آنتیگوا و باربودا",31:"جمهوری آذربایجان",32:"آرژانتین",36:"استرالیا",40:"اتریش",44:"باهاما",48:"بحرین",50:"بنگلادش",51:"ارمنستان",52:"باربادوس",56:"بلژیک",60:"برمودا",64:"بوتان",68:"بولیوی",70:"بوسنی",72:"بوتسوانا",76:"برزیل",84:"بلیز",90:"جزایر سلیمان",92:"جزایر ویرجین",96:"برونئی",100:"بلغارستان",104:"میانمار (برمه)",108:"بوروندی",112:"بلاروس",116:"کامبوج",120:"کامرون",124:"کانادا",132:"کیپ‌ورد",140:"آفریقای مرکزی",144:"سری‌لانکا",148:"چاد",152:"شیلی",156:"چین",158:"تایوان",170:"کلمبیا",174:"کومور",178:"کنگو",180:"کنگو (دموکراتیک)",184:"جزایر کوک",188:"کاستاریکا",191:"کرواسی",192:"کوبا",196:"قبرس",203:"چک",204:"بنین",208:"دانمارک",212:"دومینیکا",214:"جمهوری دومینیکن",218:"اکوادور",222:"السالوادور",226:"گینه استوایی",231:"اتیوپی",232:"اریتره",233:"استونی",234:"جزایر فارو",238:"فالکلند",239:"جورجیای جنوبی",242:"فیجی",246:"فنلاند",250:"فرانسه",254:"گویان فرانسه",258:"پلی‌نزی فرانسه",260:"سرزمین‌های فرانسوی جنوبی",262:"جیبوتی",266:"گابن",268:"گرجستان",270:"گامبیا",275:"فلسطین",276:"آلمان",288:"غنا",296:"کیریباتی",300:"یونان",304:"گرینلند",308:"گرنادا",316:"گوام",320:"گواتمالا",324:"گینه",328:"گویان",332:"هائیتی",340:"هندوراس",344:"هنگ‌کنگ",348:"مجارستان",352:"ایسلند",356:"هند",360:"اندونزی",364:"ایران",368:"عراق",372:"ایرلند",376:"اسرائیل",380:"ایتالیا",384:"ساحل عاج",388:"جامائیکا",392:"ژاپن",398:"قزاقستان",400:"اردن",404:"کنیا",408:"کره شمالی",410:"کره جنوبی",414:"کویت",417:"قرقیزستان",418:"لائوس",422:"لبنان",426:"لسوتو",428:"لتونی",430:"لیبریا",434:"لیبی",438:"لیختن‌اشتاین",440:"لیتوانی",442:"لوکزامبورگ",446:"ماکائو، منطقهٔ ویژهٔ اداری چین",450:"ماداگاسکار",454:"مالاوی",458:"مالزی",462:"مالدیو",466:"مالی",470:"مالت",478:"موریتانی",480:"موریس",484:"مکزیک",492:"موناکو",496:"مغولستان",498:"مولداوی",499:"مونته‌نگرو",504:"مراکش",508:"موزامبیک",512:"عمان",516:"نامیبیا",520:"نائورو",524:"نپال",528:"هلند",531:"کوراسائو",533:"آروبا",534:"سنت مارتن",535:"جزایر کارائیب هلند",540:"کالدونیای جدید",548:"وانواتو",554:"نیوزیلند",558:"نیکاراگوئه",562:"نیجر",566:"نیجریه",578:"نروژ",580:"ماریانای شمالی",583:"میکرونزی",584:"جزایر مارشال",585:"پالائو",586:"پاکستان",591:"پاناما",598:"پاپوآ گینه نو",600:"پاراگوئه",604:"پرو",608:"فیلیپین",612:"جزایر پیت‌کرن",616:"لهستان",620:"پرتغال",624:"گینه بیسائو",626:"تیمور شرقی",630:"پورتوریکو",634:"قطر",642:"رومانی",643:"شوروی",646:"رواندا",654:"سنت هلن",659:"سنت کیتس",660:"آنگویلا",662:"سنت لوسیا",670:"سنت وینسنت",674:"سان‌مارینو",678:"سائوتومه",682:"عربستان سعودی",686:"سنگال",688:"صربستان",690:"سیشل",694:"سیرالئون",702:"سنگاپور",703:"اسلواکی",704:"ویتنام",705:"اسلوونی",706:"سومالی",710:"افریقای جنوبی",716:"زیمبابوه",724:"اسپانیا",728:"سودان جنوبی",729:"سودان",732:"صحرای غربی",740:"سورینام",748:"اسواتینی",752:"سوئد",756:"سوئیس",760:"سوریه",762:"تاجیکستان",764:"تایلند",768:"توگو",776:"تونگا",780:"ترینیداد",784:"امارات",788:"تونس",792:"ترکیه",795:"ترکمنستان",796:"جزایر تورکس و کایکوس",798:"تووالو",800:"اوگاندا",804:"اوکراین",807:"مقدونیه شمالی",818:"مصر",826:"بریتانیا",834:"تانزانیا",840:"آمریکا",850:"جزایر ویرجین",854:"بورکینافاسو",858:"اروگوئه",860:"ازبکستان",862:"ونزوئلا",882:"ساموآ",887:"یمن",894:"زامبیا"};
const MAP_ODD_NAMES = { "Kosovo": "کوزوو", "N. Cyprus": "قبرس شمالی", "Somaliland": "سومالیلند" };
const MAP_COLORS = {
    own: "#ffd21f",        // کشوری که خود بازیکن انتخاب کرده → زرد
    other: "#2f7fe8",      // کشوری که بازیکن دیگری انتخاب کرده (فعال) → آبی
    inactive: "#0b0b0e",   // در بازی هست ولی کسی انتخابش نکرده (غیرفعال) → سیاه
    ownOcc: "#34b36b", otherOcc: "#9b5de5",
    hatchBase: "#2c3544", hatchLine: "rgba(150,165,188,0.75)"   // هنوز به بازی اضافه نشده → هاشور
};
const MAP_SPHERE = { type: "Sphere" };

/* ---------- نقشه سیاسی ۱۹۹۳ ----------
   داده‌ی نقشه مرزهای امروزی دارد؛ این جدول آن را به قلمروهای سال ۱۹۹۳ تبدیل می‌کند.
   (اعضا: id عددی کشور یا نام برای فیچرهای بدون id) */
const SOVIET_BLOC = true;   // true: «شوروی» بازی = کل ۱۵ جمهوری | false: فقط روسیه
const MAP_1993_REALMS = {
    643: SOVIET_BLOC
        ? [643, 804, 112, 498, 233, 428, 440, 268, 51, 31, 398, 860, 795, 417, 762]
        : [643],
    688: [688, 499, "Kosovo"],     // یوگسلاوی (صربستان + مونته‌نگرو + کوزوو)
    729: [729, 728],               // سودان (سودان جنوبی هنوز جدا نشده)
    360: [360, 626],               // اندونزی (تیمور شرقی جزو اندونزی)
    706: [706, "Somaliland"],      // سومالی
    196: [196, "N. Cyprus"]        // قبرس
};
function realm1993(f) {
    const id = (f.id === undefined || f.id === null) ? null : Number(f.id);
    const nm = f.properties && f.properties.name;
    for (const [rid, members] of Object.entries(MAP_1993_REALMS)) {
        if ((id !== null && members.includes(id)) || members.includes(nm)) return Number(rid);
    }
    return id !== null ? id : "n:" + nm;
}
// چند فیچر → یک MultiPolygon (بدون دست‌زدن به جهت حلقه‌ها، مناسب کره)
function combineFeatures(feats, id) {
    const polys = [];
    feats.forEach(ft => {
        const g = ft.geometry;
        if (g.type === "Polygon") polys.push(g.coordinates);
        else if (g.type === "MultiPolygon") g.coordinates.forEach(c => polys.push(c));
    });
    return { type: "Feature", id, properties: { name: "" }, geometry: { type: "MultiPolygon", coordinates: polys } };
}
// الگوی هاشور (خط‌خطی مورب) برای کشورهای اضافه‌نشده
let mapHatch = null;
function getHatchPattern(ctx) {
    if (mapHatch) return mapHatch;
    const S = 8, d = mapDpr;
    const c = document.createElement("canvas");
    c.width = c.height = Math.round(S * d);
    const g = c.getContext("2d");
    g.scale(d, d);
    g.fillStyle = MAP_COLORS.hatchBase; g.fillRect(0, 0, S, S);
    g.strokeStyle = MAP_COLORS.hatchLine; g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-2, S + 2); g.lineTo(S + 2, -2);
    g.moveTo(-2, 2);     g.lineTo(2, -2);
    g.moveTo(S - 2, S + 2); g.lineTo(S + 2, S - 2);
    g.stroke();
    mapHatch = ctx.createPattern(c, "repeat");
    try { mapHatch.setTransform(new DOMMatrix().scale(1 / d)); } catch (e) {}
    return mapHatch;
}

let mapProjection = null, mapPath = null, mapSvg = null;
let mapSize = 0, mapMinScale = 0, mapMaxScale = 0;
let mapRotation = [0, -10];
let mapInitialized = false, mapInitializing = false;
let mapAbort = null;
let mapSites = [];
let mapSitesSvg = null;
let mapCanvas = null, mapCtx = null, mapDpr = 1, mapW = 320, mapH = 300;
let mapFeatures = [], mapGroups = [], mapWaterItems = [], mapGraticule = null, mapRaf = 0;
let mapBorders = null, mapCoast = null;

async function initWorldMap() {
    const box = document.querySelector(".map-box");
    const svgEl = document.getElementById("map-globe");
    if (!box || !svgEl) return;

    if (mapInitialized) { updateMapColors(); redrawMap(); return; }
    if (mapInitializing) return;
    mapInitializing = true;

    const w = box.clientWidth || 320;
    const h = box.clientHeight || 300;
    mapW = w; mapH = h;
    mapSize = Math.min(w, h) * 0.46;
    mapMinScale = mapSize * 0.8;
    mapMaxScale = mapSize * 6;

    let world;
    try { world = await loadWorldAtlas(); }
    catch (e) { console.error(e); mapInitializing = false; return; }

    const land = topojson.feature(world, world.objects.countries);

    // Canvas برای خود کره (خیلی سریع‌تر از SVG)؛ SVG فقط برای اسم‌ها و سکوها روی آن می‌نشیند
    mapDpr = Math.min(window.devicePixelRatio || 1, 2);
    mapCanvas = document.createElement("canvas");
    mapCanvas.className = "map-canvas";
    mapCanvas.width = Math.round(w * mapDpr);
    mapCanvas.height = Math.round(h * mapDpr);
    box.insertBefore(mapCanvas, box.firstChild);
    mapCtx = mapCanvas.getContext("2d");

    mapGraticule = d3.geoGraticule10();
    mapProjection = d3.geoOrthographic().scale(mapSize).translate([w / 2, h / 2])
        .rotate(mapRotation).clipAngle(90);
    mapPath = d3.geoPath(mapProjection, mapCtx);

    const keyById = {};
    Object.entries(COUNTRY_IDS).forEach(([k, id]) => { keyById[id] = k; });
    const R = Math.PI / 180;

    // ---- قلمروهای ۱۹۹۳ ----
    const geoms = world.objects.countries.geometries;
    const realmOfGeom = new Map();
    const realms = new Map();
    land.features.forEach((f, i) => {
        const rid = realm1993(f);
        realmOfGeom.set(geoms[i], rid);
        let r = realms.get(rid);
        if (!r) { r = { rid, feats: [] }; realms.set(rid, r); }
        r.feats.push(f);
    });
    // فقط مرزِ بین دو قلمرو مختلف + ساحل کشیده می‌شود (مرز داخلی شوروی/یوگسلاوی دیده نمی‌شود)
    mapBorders = topojson.mesh(world, world.objects.countries, (x, y) => realmOfGeom.get(x) !== realmOfGeom.get(y));
    mapCoast = topojson.mesh(world, world.objects.countries, (x, y) => x === y);

    // اطلاعات ثابت هر قلمرو یک‌بار محاسبه می‌شود (نه در هر فریم)
    mapFeatures = Array.from(realms.values()).map(r => {
        const f = r.feats.length === 1 ? r.feats[0] : combineFeatures(r.feats, r.rid);
        const id = typeof r.rid === "number" ? r.rid : NaN;
        const key = keyById[id] || null;
        // اسم فقط برای کشورهایی که در بازی هستند؛ بقیه بی‌نام
        const name = key ? COUNTRY_NAMES[key] : "";
        const bb = d3.geoBounds(f);
        let dLon = bb[1][0] - bb[0][0]; if (dLon < 0) dLon += 360;
        const c = d3.geoCentroid(f);
        const sArea = Math.sqrt(d3.geoArea(f)) * 1.7;
        return {
            f, id, key, name, c, label: null, shown: false, tw: 0,
            sw: Math.min(dLon * R * Math.max(0.2, Math.cos(c[1] * R)), sArea),
            sh: Math.min((bb[1][1] - bb[0][1]) * R, sArea)
        };
    });

    mapSvg = d3.select(svgEl).attr("viewBox", `0 0 ${w} ${h}`);
    mapSvg.selectAll("*").remove();

    // اسم اقیانوس‌ها و دریاها
    const waterG = mapSvg.append("g").attr("class", "map-water-labels");
    mapWaterItems = OCEAN_LABELS.map(d => {
        const node = waterG.append("text")
            .attr("class", d[3] > 0 ? "map-sea-label" : "map-ocean-label")
            .attr("text-anchor", "middle").attr("dominant-baseline", "central")
            .style("display", "none").text(d[2]).node();
        return { d, node, shown: false };
    });

    // اسم کشورها (فقط وقتی روی کشور جا شود نمایش داده می‌شود)
    const labelG = mapSvg.append("g").attr("class", "map-country-labels");
    mapFeatures.forEach(m => {
        if (!m.name) return;
        const node = labelG.append("text").attr("class", "map-country-label")
            .attr("text-anchor", "middle").attr("dominant-baseline", "central")
            .attr("font-size", 10).text(m.name).node();
        let tw = 0;
        try { tw = node.getComputedTextLength(); } catch (e) {}
        m.tw = tw > 0 ? tw / 10 : m.name.length * 0.5;   // عرض متن به‌ازای هر ۱px فونت
        node.style.display = "none";
        m.label = node;
    });

    mapSitesSvg = mapSvg.append("g").attr("class", "map-sites-layer");

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
    mapInitialized = true; mapInitializing = false;

    // سکوها بعد از نمایش کره لود می‌شوند تا نقشه زودتر دیده شود
    await loadMapSites();
    renderMapSites();
    redrawMap();
}

async function loadMapSites() {
    try { mapSites = await apiGet("/api/map-sites"); }
    catch (e) { mapSites = []; }
    if (!Array.isArray(mapSites)) mapSites = [];
}

function renderMapSites() {
    if (!mapSitesSvg) return;
    mapSitesSvg.selectAll("*").remove();
    const g = mapSitesSvg.selectAll(".map-site").data(mapSites).enter().append("g")
        .attr("class", d => `map-site map-site-${d.kind === "strait" ? "strait" : d.type}` +
            (d.owner && d.owner === selectedCountry ? " mine" : ""))
        .style("display", "none")
        .on("click", (e, d) => { e.stopPropagation(); showSiteInfo(d); });
    g.append("rect").attr("class", "site-hit")
        .attr("x", -11).attr("y", -11).attr("width", 22).attr("height", 22);
    g.each(function (d) {
        const s = d3.select(this);
        if (d.kind === "strait") s.append("circle").attr("class", "site-shape").attr("r", 4.4);
        else s.append("rect").attr("class", "site-shape")
            .attr("x", -5).attr("y", -5).attr("width", 10).attr("height", 10).attr("rx", 0.5);
    });
}

function updateMapSitePositions() {
    if (!mapSitesSvg || !mapProjection) return;
    const rot = mapProjection.rotate();
    const zoom = mapProjection.scale() / mapSize;
    const k = (1 + Math.min(0.7, (zoom - 1) * 0.15)).toFixed(2);
    mapSitesSvg.selectAll(".map-site").each(function (d) {
        const p = viewCos(d.lon, d.lat, rot) > 0.02 ? mapProjection([d.lon, d.lat]) : null;
        if (p) {
            this.setAttribute("transform", `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) scale(${k})`);
            this.style.display = "";
        } else this.style.display = "none";
    });
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
    let dragging = false, pinching = false, lx = 0, ly = 0, pd = 0, ps = mapSize, moved = 0;

    // سرعت چرخش متناسب با زوم: هرچه نزدیک‌تر، حرکت انگشت ریزتر (قبلاً ثابت بود و در زوم زیاد پرش می‌کرد)
    const rotateBy = (dx, dy) => {
        const k = 57.2958 / mapProjection.scale();
        mapRotation[0] += dx * k;
        mapRotation[1] = Math.max(-90, Math.min(90, mapRotation[1] - dy * k));
        mapProjection.rotate(mapRotation); redrawMap();
    };

    svgEl.addEventListener("mousedown", e => { dragging = true; moved = 0; lx = e.clientX; ly = e.clientY; }, { signal });
    window.addEventListener("mouseup", () => { dragging = false; }, { signal });
    window.addEventListener("mousemove", e => {
        if (!dragging) return;
        const dx = e.clientX - lx, dy = e.clientY - ly;
        moved += Math.abs(dx) + Math.abs(dy);
        rotateBy(dx, dy);
        lx = e.clientX; ly = e.clientY;
    }, { signal });

    svgEl.addEventListener("wheel", e => {
        e.preventDefault();
        zoomMap(e.deltaY > 0 ? 0.9 : 1.1);
    }, { passive: false, signal });

    svgEl.addEventListener("touchstart", e => {
        if (e.touches.length === 2) {
            pinching = true; dragging = false; moved = 99;
            pd = getTouchDistance(e.touches); ps = mapProjection.scale(); return;
        }
        if (!e.touches.length) return;
        dragging = true; moved = 0; lx = e.touches[0].clientX; ly = e.touches[0].clientY;
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
        const dx = e.touches[0].clientX - lx, dy = e.touches[0].clientY - ly;
        moved += Math.abs(dx) + Math.abs(dy);
        rotateBy(dx, dy);
        lx = e.touches[0].clientX; ly = e.touches[0].clientY;
        e.preventDefault();
    }, { passive: false, signal });

    // انتخاب کشور با لمس (چون کشورها روی Canvas کشیده می‌شوند، با مختصات پیدا می‌شود)
    svgEl.addEventListener("click", e => {
        if (moved > 6) return;
        const rect = svgEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = (e.clientX - rect.left) * (mapW / rect.width);
        const y = (e.clientY - rect.top) * (mapH / rect.height);
        const ll = mapProjection.invert([x, y]);
        if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) return;
        const hit = mapFeatures.find(m => d3.geoContains(m.f, ll));
        if (hit) showCountryInfo(hit.f);
    }, { signal });
}

// رسم حداکثر یک‌بار در هر فریم (قبلاً در هر رویداد لمس کل نقشه دوباره رسم می‌شد)
function redrawMap() {
    if (!mapProjection || mapRaf) return;
    mapRaf = requestAnimationFrame(() => { mapRaf = 0; drawMapNow(); });
}

function drawMapNow() {
    if (!mapCtx || !mapProjection) return;
    const ctx = mapCtx, w = mapW, h = mapH;
    const r = mapProjection.scale(), cx = w / 2, cy = h / 2;
    ctx.setTransform(mapDpr, 0, 0, mapDpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // هاله اطراف کره
    const glow = ctx.createRadialGradient(cx, cy, r * 0.97, cx, cy, r * 1.14);
    glow.addColorStop(0, "rgba(110,185,255,0.45)");
    glow.addColorStop(1, "rgba(110,185,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.14, 0, 2 * Math.PI); ctx.fill();

    // اقیانوس (آبی)
    ctx.beginPath(); mapPath(MAP_SPHERE);
    const water = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r * 1.05);
    water.addColorStop(0, "#3a8bc7");
    water.addColorStop(0.55, "#1d62a0");
    water.addColorStop(1, "#0b2d52");
    ctx.fillStyle = water; ctx.fill();

    // مدارها و نصف‌النهارها
    ctx.beginPath(); mapPath(mapGraticule);
    ctx.lineWidth = 0.5; ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.stroke();

    // خشکی‌ها (هم‌رنگ‌ها در یک مسیر؛ کشورهای اضافه‌نشده هاشور)
    ctx.lineJoin = "round";
    for (const g of mapGroups) {
        ctx.beginPath();
        for (const m of g.items) mapPath(m.f);
        ctx.fillStyle = g.hatch ? getHatchPattern(ctx) : g.fill;
        ctx.fill();
        if (!g.hatch) { ctx.lineWidth = 0.5; ctx.strokeStyle = g.fill; ctx.stroke(); }   // پوشاندن درز
    }
    // مرز کشورها و ساحل
    if (mapBorders) {
        ctx.beginPath(); mapPath(mapBorders);
        ctx.lineWidth = 0.6; ctx.strokeStyle = "rgba(215,228,245,0.5)"; ctx.stroke();
    }
    if (mapCoast) {
        ctx.beginPath(); mapPath(mapCoast);
        ctx.lineWidth = 0.7; ctx.strokeStyle = "rgba(215,228,245,0.6)"; ctx.stroke();
    }

    // سایه‌روشن برای حالت سه‌بعدی
    ctx.beginPath(); mapPath(MAP_SPHERE);
    const shade = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.25, cx, cy, r);
    shade.addColorStop(0, "rgba(255,255,255,0.12)");
    shade.addColorStop(0.65, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,8,24,0.5)");
    ctx.fillStyle = shade; ctx.fill();

    // لبه کره
    ctx.beginPath(); mapPath(MAP_SPHERE);
    ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(150,205,255,0.6)"; ctx.stroke();

    updateMapLabels();
    updateMapSitePositions();
}

function updateMapLabels() {
    const scale = mapProjection.scale();
    const zoom = scale / mapSize;
    const rot = mapProjection.rotate();
    const fs = Math.max(7, Math.min(13, 6.5 + zoom * 1.5));

    // اسم کشور: فقط اگر روی خودِ کشور جا شود
    for (const m of mapFeatures) {
        const node = m.label;
        if (!node) continue;
        let p = null;
        const z = viewCos(m.c[0], m.c[1], rot);
        if (z > 0.25 && m.sw * scale * z >= m.tw * fs * 1.1 && m.sh * scale * z >= fs * 1.5) {
            p = mapProjection(m.c);
            if (p && (p[0] < -20 || p[0] > mapW + 20 || p[1] < -20 || p[1] > mapH + 20)) p = null;
        }
        if (p) {
            node.setAttribute("x", p[0].toFixed(1));
            node.setAttribute("y", p[1].toFixed(1));
            node.setAttribute("font-size", fs.toFixed(1));
            if (!m.shown) { node.style.display = ""; m.shown = true; }
        } else if (m.shown) { node.style.display = "none"; m.shown = false; }
    }

    // اسم اقیانوس‌ها و دریاها (هرکدام در بازه زوم خودش)
    for (const o of mapWaterItems) {
        const d = o.d;
        let p = null;
        if (zoom >= d[3] && zoom <= d[4] && viewCos(d[0], d[1], rot) > 0.35) {
            p = mapProjection([d[0], d[1]]);
            if (p && (p[0] < -30 || p[0] > mapW + 30 || p[1] < -10 || p[1] > mapH + 10)) p = null;
        }
        if (p) {
            o.node.setAttribute("x", p[0].toFixed(1));
            o.node.setAttribute("y", p[1].toFixed(1));
            o.node.setAttribute("font-size", (d[3] > 0 ? fs * 0.95 : fs * 1.2).toFixed(1));
            if (!o.shown) { o.node.style.display = ""; o.shown = true; }
        } else if (o.shown) { o.node.style.display = "none"; o.shown = false; }
    }
}

function mapFillFor(m) {
    if (!m.key) return null;   // هنوز به بازی اضافه نشده → هاشور
    const info = countries[m.key];
    if (info?.occupier) {
        if (info.occupier === selectedCountry) return MAP_COLORS.ownOcc;
        if (info.taken && m.key === selectedCountry) return MAP_COLORS.ownOcc;
        return MAP_COLORS.otherOcc;
    }
    if (m.key === selectedCountry) return MAP_COLORS.own;
    if (info?.taken) return MAP_COLORS.other;
    return MAP_COLORS.inactive;
}

function updateMapColors() {
    const groups = new Map();
    mapFeatures.forEach(m => {
        const fill = mapFillFor(m);
        const gk = fill || "hatch";
        let g = groups.get(gk);
        if (!g) { g = { fill, hatch: !fill, game: !!m.key, items: [] }; groups.set(gk, g); }
        g.items.push(m);
    });
    mapGroups = Array.from(groups.values());
    if (mapSitesSvg) renderMapSites();
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
        flagEl.textContent = "🏳️"; nameEl.textContent = "منطقه ناشناخته";
        statusEl.textContent = "هنوز به بازی اضافه نشده"; descEl.textContent = "این کشور هنوز در بازی فعال نیست.";
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
        statusEl.textContent = "غیرفعال"; descEl.textContent = "هنوز توسط هیچ بازیکنی انتخاب نشده.";
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
        const zoneTxt = site.zone === "sea" ? "🌊 در دریا" : (site.zone === "land" ? "⛰️ در خشکی" : "");
        descEl.textContent = `تولید: ${formatNumber(site.production)} در روز` + (zoneTxt ? ` — ${zoneTxt}` : "");
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

// کسینوس فاصله زاویه‌ای نقطه تا مرکز دید (بیشتر از ۰ یعنی روی نیمکره روبه‌رو)
function viewCos(lon, lat, rot) {
    const r = Math.PI / 180;
    const l1 = -rot[1] * r, l2 = lat * r, dl = (lon + rot[0]) * r;
    return Math.sin(l1) * Math.sin(l2) + Math.cos(l1) * Math.cos(l2) * Math.cos(dl);
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
        // اول همه پرچم‌ها لود شوند، بعد صفحه انتخاب کشور
        await Promise.all(Object.keys(COUNTRY_IMAGE_EXT).map(cid => preloadImage(countryImageUrl(cid))));
        showCountrySelection();
    }
})();
