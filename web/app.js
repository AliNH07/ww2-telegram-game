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
let pmCountrySearch = "";
let newsItemsCache = [];
let currentNewsFilter = "all";
let currentEconomyFilter = "all";
let unionChatId = null;
let unionChatSignature = "";
let unionDataCache = null;

const COUNTRY_IMAGE_EXT = { germany: "jpg", britain: "jfif", ussr: "jfif", usa: "jfif",
    france: "jfif", italy: "jfif", china: "jfif", japan: "jfif" };
const COUNTRY_FLAGS = { germany: "🇩🇪", britain: "🇬🇧", ussr: "☭", usa: "🇺🇸",
    france: "🇫🇷", italy: "🇮🇹", china: "🇨🇳", japan: "🇯🇵" };
const COUNTRY_NAMES = { germany: "آلمان", britain: "بریتانیا", ussr: "شوروی", usa: "آمریکا",
    france: "فرانسه", italy: "ایتالیا", china: "چین", japan: "ژاپن" };
const COUNTRY_IDS = { germany: 276, britain: 826, ussr: 643, usa: 840,
    france: 250, italy: 380, china: 156, japan: 392 };

let ARMY_UNITS = {};

const RESOURCE_NAMES = { food: "غذا", steel: "آهن", uranium: "اورانیوم", oil: "نفت" };
const RESOURCE_ICONS = { food: "🌾", steel: "⚙️", uranium: "☢️", oil: "🛢️" };
const GROUP_ICONS = { land: "🪖", naval: "⚓", air: "✈️", missile: "🚀", strategy: "🛰️" };
const GROUP_TITLES = { land: "زمینی", naval: "دریایی", air: "هوایی", missile: "موشکی", strategy: "استراتژیک" };
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
    if (t) { t.classList.remove("hidden"); t.scrollTop = 0; }
    const header = document.querySelector("#game .game-header");
    if (header) header.style.transform = "translate3d(0, 0, 0)";
}

function formatMoney(v) { return "$" + Math.round(Number(v ?? 0)).toLocaleString("en-US"); }
function formatNumber(v) { return Math.round(Number(v ?? 0)).toLocaleString("en-US"); }


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


async function loadArmyCatalog() {
    try { ARMY_UNITS = (await apiGet("/api/army-units")).units || {}; }
    catch (e) { console.error("Army catalog:", e); }
}

function resourceEtaLabel(amount, dailyDeficit) {
    if (amount <= 0) return "موجودی تمام شده است";
    if (!(dailyDeficit > 0)) return "";
    let minutes = Math.max(0, Math.floor((amount / dailyDeficit) * 24 * 60));
    const days = Math.floor(minutes / 1440); minutes -= days * 1440;
    const hours = Math.floor(minutes / 60); minutes -= hours * 60;
    const parts = [];
    if (days) parts.push(`${formatNumber(days)} روز`);
    if (hours) parts.push(`${formatNumber(hours)} ساعت`);
    if (minutes || !parts.length) parts.push(`${formatNumber(minutes)} دقیقه`);
    return `موجودی با این روند تا ${parts.join(" و ")} تمام می‌شود`;
}

function renderResourceBars() {
    if (!player?.resources) return;
    document.querySelectorAll(".resource-bar").forEach(bar => {
        bar.innerHTML = "";
        Object.keys(RESOURCE_NAMES).forEach(key => {
            const amt = Math.max(0, Number(player.resources[key] ?? 0));
            const rate = Math.max(0, Number(player.resource_production?.[key] ?? 0));
            const use = Math.max(0, Number(player.resource_consumption?.[key] ?? 0));
            const net = rate - use;
            const chip = document.createElement("div");
            chip.className = "resource-chip";
            const productionLine = `<div class="resource-chip-rate up"><span>تولید روزانه</span><b>▲ ${formatNumber(rate)}</b></div>`;
            const consumptionLine = `<div class="resource-chip-rate down"><span>مصرف روزانه</span><b>▼ ${formatNumber(use)}</b></div>`;
            let balanceLine = "";
            if (net > 0) {
                balanceLine = `<div class="resource-balance positive"><span>افزایش خالص</span><b>+${formatNumber(net)} / روز</b></div>`;
            } else if (net < 0) {
                const eta = resourceEtaLabel(amt, Math.abs(net));
                balanceLine = `<div class="resource-balance negative"><strong>🔺 کمبود روزانه ${formatNumber(Math.abs(net))}</strong><small>${eta}</small></div>`;
            } else {
                balanceLine = `<div class="resource-balance neutral"><span>تولید و مصرف برابر است</span></div>`;
            }
            chip.innerHTML = `
                <div class="resource-chip-top"><span>${RESOURCE_ICONS[key]} ${RESOURCE_NAMES[key]}</span><span class="resource-chip-status ${net < 0 ? "is-shortage" : net > 0 ? "is-surplus" : "is-balanced"}">${net < 0 ? "کمبود" : net > 0 ? "مازاد" : "متعادل"}</span></div>
                <div class="resource-chip-value">${formatNumber(amt)}</div>
                <div class="resource-rates-stack">${productionLine}${consumptionLine}</div>
                ${balanceLine}`;
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

async function refreshPlayer() {
    if (!userId || playerRefreshInFlight) return;
    playerRefreshInFlight = true;
    try {
        const fresh = await apiGet("/api/player");
        if (fresh && !fresh.error) {
            player = fresh;
            if (player?.country) selectedCountry = player.country;
            updateHomeStats();
            // اگر کاربر در همین لحظه در صفحات مالی/رفاه باشد، اعداد سربرگ هم زنده بمانند.
            document.querySelectorAll(".sb-money").forEach(e => { e.textContent = formatMoney(player.money); });
        }
    } catch (e) { if (e.name !== "AbortError") console.error(e); }
    finally { playerRefreshInFlight = false; }
}

let fastPlayerInterval = null;
let playerRefreshInFlight = false;
function startStatsPolling() {
    stopStatsPolling();
    refreshPlayer();
    // خزانه، نیروی انسانی و منابع در فاصلهٔ کوتاه‌تری تازه می‌شوند؛
    // اعلان‌ها و رتبه‌بندی همچنان با فاصلهٔ بیشتر دریافت می‌شوند.
    fastPlayerInterval = setInterval(() => refreshPlayer(), 2500);
    statsInterval = setInterval(() => {
        refreshNotificationBadge();
        refreshHeaderRank();
    }, 30000);
}
function stopStatsPolling() {
    if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
    if (fastPlayerInterval) { clearInterval(fastPlayerInterval); fastPlayerInterval = null; }
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
    maybeShowGuide();
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
        document.getElementById("header-rank-value").textContent = me ? me.rank : "—";
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
const dismissedNotifsKey = () => `fl93_dismissed_notifications_${userId || "guest"}`;
function getDismissedNotifications() {
    try { return new Set(JSON.parse(localStorage.getItem(dismissedNotifsKey()) || "[]")); }
    catch (e) { return new Set(); }
}
function saveDismissedNotifications(set) {
    try { localStorage.setItem(dismissedNotifsKey(), JSON.stringify([...set].slice(-500))); } catch (e) {}
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
    refreshPmBadge();
    try {
        const news = await apiGet("/api/news");
        const list = Array.isArray(news) ? news : [];
        const seen = getSeenNews();
        const dismissed = getDismissedNotifications();
        setNotifBadge(list.filter(n => n.id && !seen.has(n.id) && !dismissed.has(n.id)).length);
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
                <div class="notif-head-actions">
                    <button class="notif-clear-all" id="notif-clear-all" type="button">پاک‌کردن همه</button>
                    <button class="is-close" aria-label="بستن">✕</button>
                </div>
            </div>
            <div class="notif-list" id="notif-list"></div>
        </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    ov.querySelector(".is-close").onclick = close;

    try {
        const response = await apiGet("/api/news");
        const list = Array.isArray(response) ? response : [];
        const box = ov.querySelector("#notif-list");
        const sub = ov.querySelector("#notif-sub");
        const clearButton = ov.querySelector("#notif-clear-all");
        const seen = getSeenNews();
        const dismissed = getDismissedNotifications();
        const render = () => {
            const visible = list.filter(item => !item.id || !dismissed.has(item.id));
            const fresh = visible.filter(item => item.id && !seen.has(item.id)).length;
            box.innerHTML = "";
            visible.forEach(item => {
                const isNew = !!item.id && !seen.has(item.id);
                const div = document.createElement("div");
                div.className = "notif-item" + (isNew ? " is-new" : "");
                const t = formatNewsTime(item.at);
                div.innerHTML = `
                    <div class="notif-title">${isNew ? '<span class="notif-dot"></span>' : ""}${escapeHtml(item.title || "")}</div>
                    <p>${escapeHtml(item.text || "")}</p>
                    ${t ? `<div class="notif-time">${t}</div>` : ""}`;
                box.appendChild(div);
            });
            if (!visible.length) box.innerHTML = `<div class="notif-empty">اعلانی وجود ندارد.</div>`;
            sub.textContent = fresh ? `${fresh} اعلان جدید` : (visible.length ? "همه را دیده‌اید" : "اعلان‌ها پاک شده‌اند");
            clearButton.disabled = visible.length === 0;
            clearButton.classList.toggle("is-empty", visible.length === 0);
        };
        render();
        list.forEach(item => { if (item.id) seen.add(item.id); });
        saveSeenNews(seen);
        setNotifBadge(0);
        clearButton.onclick = () => {
            list.forEach(item => {
                if (item.id) { dismissed.add(item.id); seen.add(item.id); }
            });
            saveDismissedNotifications(dismissed);
            saveSeenNews(seen);
            setNotifBadge(0);
            render();
            showToast("اعلان‌ها پاک شدند؛ خبرها در بخش اخبار باقی می‌مانند.", "success");
        };
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
    document.querySelectorAll(".sb-money").forEach(e => { e.textContent = formatMoney(player.money); });
    renderResourceBars();
}

const RK_TABS = [
    { id: "overall", key: "overall", label: "کلی", info: "<b>کلی</b> ترکیبِ پنج دستهٔ دیگر است. امتیازِ هر دسته نسبت به بهترین کشورِ همان دسته محاسبه می‌شود؛ بنابراین یک عددِ بسیار بزرگ در یک دسته، امتیازِ دسته‌های دیگر را محو نمی‌کند." },
    { id: "economy", key: "economy", label: "اقتصادی", info: "<b>اقتصادی</b> بر چه اساسیه: درآمدِ خالصِ روزانه‌ی کشور، بعد از کسرِ هزینه‌ی نگهداری — هر $1,000 یک امتیاز." },
    { id: "military", key: "military", label: "قدرت نظامی", info: "<b>قدرت نظامی</b> بر چه اساسیه: مجموعِ قدرتِ همه‌ی یگان‌ها — هر یگان به اندازه‌ی حمله + دفاعش امتیاز دارد. یگان‌های مستقر در سکوها و تنگه‌ها هم حساب می‌شوند." },
    { id: "territory", key: "territory", label: "قلمرو", info: "<b>قلمرو</b> بر چه اساسیه: منابعِ نقشه و تنگه‌هایی که زیرِ کنترلِ کشورند، هر کدام ۱ امتیاز، به‌اضافه‌ی هر کشورِ اشغال‌شده ۵ امتیاز." },
    { id: "development", key: "development", label: "توسعه", info: "<b>توسعه</b> بر چه اساسیه: مجموعِ سطحِ همه‌ی ساختمان‌ها در زیرساخت و اقتصاد — هر سطح ۵۰ امتیاز." },
    { id: "diplomacy", key: "diplomacy", label: "دیپلماسی", info: "<b>دیپلماسی</b> بر چه اساسیه: پیمان‌های فعال (هر کدام ۱۰۰ امتیاز) و عضویت در اتحادیه (۱۵۰ امتیاز)." },
];
let rkTab = "overall", rkRows = [];

function jalaliStamp(iso) {
    try {
        const parts = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", { year: "numeric", month: "numeric", day: "numeric",
            hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
        const g = t => parts.find(p => p.type === t)?.value;
        return `${g("year")}/${g("month")}/${g("day")}, ${g("hour")}:${g("minute")}`;
    } catch (e) { return ""; }
}

function renderRankings() {
    const tabs = document.getElementById("rk-tabs"), box = document.getElementById("rankings-list");
    if (!tabs || !box) return;
    tabs.innerHTML = "";
    RK_TABS.forEach(t => {
        const b = document.createElement("button");
        b.className = "rk-tab" + (t.id === rkTab ? " active" : "");
        b.textContent = t.label;
        b.onclick = () => { rkTab = t.id; renderRankings(); };
        tabs.appendChild(b);
    });
    const cur = RK_TABS.find(t => t.id === rkTab);
    box.innerHTML = "";
    if (!rkRows.length) { box.innerHTML = `<div class="diplomacy-item-empty">هنوز رتبه‌ای نیست.</div>`; return; }
    [...rkRows].sort((x, y) => (y[cur.key] ?? 0) - (x[cur.key] ?? 0)).forEach((r, i) => {
        const pos = i + 1;
        const div = document.createElement("div");
        div.className = `rk-row ${r.is_eliminated ? "rk-elim" : ""}`;
        div.innerHTML = `<span class="rk-medal rk-m${pos <= 3 ? pos : 0}">${pos}</span>${flagInline(r.country)}<span class="rk-name">${r.name}</span>`;
        box.appendChild(div);
    });
}

async function loadRankings() {
    try {
        const rows = await apiGet("/api/rankings");
        rkRows = Array.isArray(rows) ? rows : [];
        renderRankings();
    } catch (e) { console.error(e); }
}


document.getElementById("rk-help-btn")?.addEventListener("click", () => {
    document.getElementById("rk-help-sheet")?.remove();
    const ov = document.createElement("div");
    ov.id = "rk-help-sheet";
    ov.className = "modal-overlay rk-help-overlay";
    const sections = RK_TABS.map(t => `<section class="rk-help-section"><h4>${escapeHtml(t.label)}</h4><p>${t.info}</p></section>`).join("");
    ov.innerHTML = `<div class="rk-help-sheet-box" role="dialog" aria-modal="true" aria-labelledby="rk-help-title">
        <div class="rk-help-head"><div><small>راهنمای امتیازدهی</small><h3 id="rk-help-title">رتبه‌بندی چگونه محاسبه می‌شود؟</h3></div><button class="rk-help-close" type="button" aria-label="بستن">×</button></div>
        <div class="rk-help-content"><p class="rk-help-lead">وزن هر دسته در رتبهٔ کلی:</p>
            <div class="rk-weight-grid"><span>اقتصاد <b>۳۰٪</b></span><span>قدرت نظامی <b>۲۵٪</b></span><span>قلمرو <b>۲۰٪</b></span><span>توسعه <b>۱۵٪</b></span><span>دیپلماسی <b>۱۰٪</b></span></div>
            ${sections}
        </div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener("click", e => { if (e.target === ov || e.target.closest(".rk-help-close")) close(); });
});

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
        else if (s === "stats") { showGamePage("stats"); loadStats(); }
        else if (s === "welfare") { showGamePage("welfare"); loadWelfare(); }
        else if (s === "transfer") { showGamePage("loan"); renderLoanPage(); }
    });
});


/* =========================================================
   Loan page (وام)
========================================================= */
let loanTab = "mine";
let loanData = null;
let loanDraft = { to: "", amount: "", hours: 24, early: false };
const LOAN_HELP = `
<p>پول فقط از راه وام بین کشورها جابه‌جا می‌شود. وام‌دهنده مبلغ و مهلت را تعیین می‌کند؛ سود و کارمزد را قانون تعیین می‌کند.</p>
<p><b>سود:</b> برای هر ۱۲ ساعت کامل، ۱۰٪ مبلغ؛ زیر ۱۲ ساعت بدون سود. حداکثر مهلت ۷۲ ساعت (۶۰٪).</p>
<p><b>کارمزد:</b> ۵٪ از هر دریافت — وام‌گیرنده هنگام گرفتن، وام‌دهنده هنگام بازگشت. وام زیر ۱۲ ساعت و دریافت‌کننده VIP کارمزد ندارد.</p>
<p><b>سقف:</b> هر وام حداکثر ۵۰٪ درآمد روزانه وام‌دهنده، و وام‌گیرنده باید بتواند با خزانه و درآمدش در همان مهلت بازپرداخت کند.</p>
<p>هر کشور هم‌زمان فقط یک وام می‌گیرد و تا تسویه وام نمی‌دهد. وام‌دهی تا نزدیک پایان بازی فعال است و همه وام‌ها تا ۱ دقیقه پیش از جنگ جهانی سررسید می‌شوند.</p>
<p>در سررسید کل بدهی برداشته می‌شود. اگر خزانه کافی نباشد، هرچه هست برداشته می‌شود و تا تسویه، تمام درآمد وام‌گیرنده به وام‌دهنده می‌رسد.</p>
<p>همه کشورهای دنیا دفتر وام‌ها را می‌بینند.</p>`;


const LOAN_STATUS = { pending: "پیشنهاد", active: "جاری", overdue: "معوق", settled: "تسویه شد",
    declined: "رد شد", cancelled: "لغو شد", expired: "منقضی" };

function loanDate(iso) {
    try {
        const d = new Date(iso);
        const p = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", { timeZone: "Asia/Tehran",
            year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hour12: false })
            .formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
        return `${p.year}/${p.month}/${p.day} · ${p.hour}:${p.minute}`;
    } catch { return ""; }
}
function loanRate(h) { return Math.min(Math.floor(h / 12) * 10, 60); }

function loanItemHtml(r, mine) {
    let actions = "";
    if (mine) {
        if (r.can_accept) actions += `<button class="ln-btn ok" data-act="accept" data-id="${r.id}">پذیرش پیشنهاد</button><button class="ln-btn no" data-act="decline" data-id="${r.id}">رد پیشنهاد</button>`;
        if (r.can_cancel) actions += `<button class="ln-btn no" data-act="cancel" data-id="${r.id}">لغو پیشنهاد</button>`;
        if (r.can_repay) actions += `<button class="ln-btn ok" data-act="repay" data-id="${r.id}">بازپرداخت ${formatMoney(r.remaining)}</button>`;
    }
    const live = r.status === "active" || r.status === "overdue";
    const due = live && r.due_at ? loanDate(r.due_at) : "—";
    const role = r.role === "lender" ? "نقش شما: وام‌دهنده" : r.role === "borrower" ? "نقش شما: وام‌گیرنده" : "ثبت‌شده در دفتر دنیا";
    const state = LOAN_STATUS[r.status] || r.status || "نامشخص";
    return `<article class="ln-item ${r.status || ""}">
        <div class="ln-item-head">
            <div class="ln-amount-block"><small>مبلغ وام</small><strong class="ln-amt">${formatMoney(r.amount)}</strong></div>
            <span class="ln-st ${r.status || ""}">${state}</span>
        </div>
        <div class="ln-route-card">
            <div class="ln-party"><small>وام‌دهنده</small><strong><span class="ln-flag">${r.lender_flag || "🏳️"}</span>${escapeHtml(r.lender_name || "—")}</strong></div>
            <span class="ln-route-arrow" aria-hidden="true">←</span>
            <div class="ln-party"><small>وام‌گیرنده</small><strong><span class="ln-flag">${r.borrower_flag || "🏳️"}</span>${escapeHtml(r.borrower_name || "—")}</strong></div>
        </div>
        <div class="ln-facts-grid">
            <div><small>مدت</small><b>${formatNumber(r.hours || 0)} ساعت</b></div>
            <div><small>سود</small><b>${formatNumber(r.rate || 0)}٪</b></div>
            <div><small>مبلغ بازپرداخت</small><b>${formatMoney(r.repay)}</b></div>
        </div>
        ${live ? `<div class="ln-balance-row"><span>ماندهٔ بدهی</span><b>${formatMoney(r.remaining)}</b></div><div class="ln-due-row"><span>سررسید</span><b>${due}</b></div>` : ""}
        <div class="ln-item-foot"><span>🕒 ${loanDate(r.at)}</span><span>${role}</span></div>
        ${r.early ? `<div class="ln-early-note">✓ بازپرداخت زودتر از موعد مجاز است</div>` : ""}
        ${actions ? `<div class="ln-actions">${actions}</div>` : ""}
    </article>`;
}

async function loadLoans() {
    const d = await apiGet("/api/loans");
    if (d && !d.error) loanData = d;
    return loanData;
}

async function renderLoanPage(reload = true) {
    document.querySelectorAll("#ln-tabs .ln-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === loanTab));
    const p = document.getElementById("ln-panel");
    if (reload) {
        if (!loanData) p.innerHTML = `<div class="ln-card"><div class="ln-empty">در حال بارگذاری…</div></div>`;
        try { await loadLoans(); } catch (e) { console.error(e); }
    }
    if (!loanData) { p.innerHTML = `<div class="ln-card"><div class="ln-empty">خطا در دریافت اطلاعات وام.</div></div>`; return; }
    const d = loanData;

    if (loanTab === "mine") {
        const debt = d.owes > 0 ? `<div class="ln-debt">بدهی فعلی شما: <b>${formatMoney(d.owes)}</b></div>` : "";
        p.innerHTML = `<div class="ln-card"><div class="ln-card-title"><span>💰 وام‌های من</span><small>${d.mine.length} مورد</small></div>${debt}` +
            (d.mine.length ? `<div class="ln-list">${d.mine.map(r => loanItemHtml(r, true)).join("")}</div>` : `<div class="ln-empty"><span>💸</span><b>هنوز وامی ندارید</b><small>پیشنهادهای وام و وضعیت بازپرداخت اینجا نمایش داده می‌شوند.</small></div>`) + `</div>`;
    } else if (loanTab === "offer") {
        const closed = !d.lending_open;
        const opts = d.countries.map(c => `<option value="${c.id}" ${loanDraft.to === c.id ? "selected" : ""} ${c.busy ? "disabled" : ""}>${c.flag} ${escapeHtml(c.name)}${c.busy ? " (بدهکار)" : ""}</option>`).join("");
        p.innerHTML = `<div class="ln-card ln-gold">
            <div class="ln-card-title">💰 پیشنهاد وام</div>
            <div class="ln-row"><span>سقف هر وام (۵۰٪ درآمد روزانه)</span><b>${formatMoney(d.cap)}</b></div>
            <div class="ln-row"><span>حداکثر مهلت اکنون</span><b>${Math.floor(d.max_hours)} ساعت</b></div>
            ${closed ? `<div class="ln-warn">${escapeHtml(d.block_reason || "وام‌دهی فعلاً ممکن نیست.")}</div>` : ""}
            <select id="ln-to" class="ln-input ln-select"><option value="">کشور وام‌گیرنده</option>${opts}</select>
            <input id="ln-amount" class="ln-input" type="number" inputmode="numeric" placeholder="مبلغ ($)" value="${loanDraft.amount}">
            <input id="ln-hours" class="ln-input" type="number" inputmode="numeric" min="1" max="${Math.floor(d.max_hours)}" placeholder="مهلت (ساعت)" value="${loanDraft.hours}">
            <div class="ln-seg"><button type="button" data-early="0" class="${loanDraft.early ? "" : "active"}">فقط سر موعد</button><button type="button" data-early="1" class="${loanDraft.early ? "active" : ""}">بازپرداخت زودتر مجاز</button></div>
            <div class="ln-preview" id="ln-preview"></div>
            <button class="ln-submit" id="ln-submit" type="button" ${closed ? "disabled" : ""}>پیشنهاد دهید</button>
        </div>`;
        const upd = () => {
            loanDraft.to = p.querySelector("#ln-to").value;
            loanDraft.amount = p.querySelector("#ln-amount").value;
            loanDraft.hours = p.querySelector("#ln-hours").value;
            const amt = Number(loanDraft.amount) || 0, h = Number(loanDraft.hours) || 0;
            const rate = loanRate(h), repay = Math.round(amt * (1 + rate / 100));
            const fee = h >= 12 ? "کارمزد ۵٪ از هر دریافت" : "بدون کارمزد (زیر ۱۲ ساعت)";
            p.querySelector("#ln-preview").innerHTML = amt > 0 && h > 0
                ? `سود ${rate}٪ · بازپرداخت <b>${formatMoney(repay)}</b> · ${fee}` : "";
        };
        p.querySelectorAll("#ln-to, #ln-amount, #ln-hours").forEach(el => el.addEventListener("input", upd));
        p.querySelectorAll(".ln-seg button").forEach(b => b.addEventListener("click", () => {
            loanDraft.early = b.dataset.early === "1";
            p.querySelectorAll(".ln-seg button").forEach(x => x.classList.toggle("active", x === b));
        }));
        upd();
        p.querySelector("#ln-submit").addEventListener("click", async (ev) => {
            const btn = ev.currentTarget; upd();
            if (!loanDraft.to) { showToast("کشور وام‌گیرنده را انتخاب کنید."); return; }
            btn.disabled = true;
            try {
                const r = await apiPost("/api/loans/propose", { to: loanDraft.to, amount: Number(loanDraft.amount),
                    hours: Number(loanDraft.hours), early: loanDraft.early });
                showToast(r.message || (r.success ? "ارسال شد." : "خطا"), r.success ? undefined : "error");
                if (r.success) { loanDraft = { to: "", amount: "", hours: 24, early: false }; loanTab = "mine"; refreshPlayer(); renderLoanPage(); return; }
            } catch (e) { showToast("خطای شبکه", "error"); }
            btn.disabled = false;
        });
    } else {
        p.innerHTML = `<div class="ln-card"><div class="ln-card-title"><span>🌐 دفتر وام‌های دنیا</span><small>${d.book.length} مورد</small></div><p class="ln-book-intro">سوابق پیشنهادها و وام‌های ثبت‌شده میان کشورهای بازی</p>` +
            (d.book.length ? `<div class="ln-list">${d.book.map(r => loanItemHtml(r, false)).join("")}</div>` : `<div class="ln-empty"><span>📘</span><b>هنوز وامی ثبت نشده است</b><small>با ثبت اولین پیشنهاد، سابقهٔ آن در این دفتر می‌آید.</small></div>`) + `</div>`;
    }
}

document.getElementById("ln-panel")?.addEventListener("click", async (ev) => {
    const b = ev.target.closest(".ln-btn"); if (!b) return;
    const id = b.dataset.id, act = b.dataset.act;
    const map = { accept: ["/api/loans/respond", { loan_id: id, accept: true }], decline: ["/api/loans/respond", { loan_id: id, accept: false }],
        cancel: ["/api/loans/cancel", { loan_id: id }], repay: ["/api/loans/repay", { loan_id: id }] };
    const [path, body] = map[act]; b.disabled = true;
    try {
        const r = await apiPost(path, body);
        showToast(r.message || (r.success ? "انجام شد." : "خطا"), r.success ? undefined : "error");
        refreshPlayer(); renderLoanPage();
    } catch (e) { showToast("خطای شبکه", "error"); b.disabled = false; }
});
document.querySelectorAll("#ln-tabs .ln-tab").forEach(b => b.addEventListener("click", () => { loanTab = b.dataset.tab; renderLoanPage(loanTab !== "offer" || !loanData); }));
document.getElementById("ln-help")?.addEventListener("click", () => {
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    ov.innerHTML = `<div class="ln-sheet"><div class="ln-sheet-head"><button class="ln-x" aria-label="بستن">✕</button><span>وام</span></div><div class="ln-sheet-body">${LOAN_HELP}</div></div>`;
    ov.addEventListener("click", e => { if (e.target === ov || e.target.closest(".ln-x")) ov.remove(); });
    document.body.appendChild(ov);
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
    welfare:  i => i.group === "welfare",
    strategy: i => i.group === "strategy",
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
    else if (tab === "welfare") {
        renderInfraList("infra-welfare-list", INFRA_TAB_FILTERS.welfare);
        renderInfraWelfareSummary();
    } else if (tab === "strategy")
        renderInfraList("infra-strategy-list", INFRA_TAB_FILTERS.strategy);
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

async function renderInfraWelfareSummary() {
    const box = document.getElementById("infra-welfare-summary");
    if (!box) return;
    box.innerHTML = `<p class="iws-loading">در حال دریافت آمار زندهٔ رفاه و امنیت…</p>`;
    try {
        const d = await apiGet("/api/stats");
        if (!d || d.error || !Array.isArray(d.buildings)) throw new Error("stats_unavailable");
        statsData = d;
        const bonus = Number(d.bonus || 0);
        const gross = Number(d.gross || 0);
        const penalty = Number(d.penalty || 0);
        box.innerHTML = `
            <div class="iws-head">
                <div><strong>📊 رفاه و امنیت کشور</strong><p>وضعیت زندهٔ ساختمان‌های همین بخش و اثر آن‌ها بر اقتصاد</p></div>
                <strong class="iws-total">+${fmt1(bonus)}٪</strong>
            </div>
            <div class="iws-metrics">
                <div><span>پاداش ساختمان‌ها</span><b>+${fmt1(gross)}٪</b></div>
                ${penalty > 0 ? `<div><span>افت موقت رویدادها</span><b class="iws-penalty">−${fmt1(penalty)}٪</b></div>` : ""}
                <div><span>اثر نهایی بر درآمد</span><b>+${fmt1(bonus)}٪</b></div>
                <div><span>درآمد اضافهٔ روزانه</span><b>+${formatMoney(d.extra_income || 0)}</b></div>
            </div>
            <button type="button" class="iws-details-button" id="infra-welfare-open-stats">مشاهدهٔ جزئیات رفاه و امنیت ←</button>`;
        box.querySelector("#infra-welfare-open-stats")?.addEventListener("click", () => {
            showGamePage("welfare");
            loadWelfare();
        });
    } catch (e) {
        console.error("Infrastructure welfare stats:", e);
        box.innerHTML = `<p class="iws-loading">آمار رفاه فعلاً دریافت نشد.</p><button type="button" class="iws-details-button" id="infra-welfare-open-stats">رفتن به رفاه و امنیت ←</button>`;
        box.querySelector("#infra-welfare-open-stats")?.addEventListener("click", () => {
            showGamePage("welfare");
            loadWelfare();
        });
    }
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
function bonusParts(item, n) {
    const b = item.bonus || {}, g = GROUP_TITLES[item.group] || "", p = [];
    if (b.defense && n > 1) p.push({ v: `+${Math.round(b.defense * (n - 1) * 100)}٪`, l: `دفاع ${g}` });
    return p;
}

function infraMainFigure(item, lvl, n) {
    if (!lvl) return null;
    const g = item.group;
    if (g === "power")    return { value: "+" + formatNumber(lvl.capacity), label: "برق" };
    if (g === "manpower") return { value: "+" + formatNumber(lvl.production), label: "نفر در روز" };
    if (g === "resource") return { value: "+" + formatNumber(lvl.production), label: `${RESOURCE_NAMES[item.resource_key] || ""} در روز` };
    if (lvl.capacity === undefined) { const p = bonusParts(item, n)[0]; return p ? { value: p.v, label: p.l } : null; }
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
        const fig = infraMainFigure(item, built ? item.current : item.next, built ? item.level : 1);
        const pips = Array.from({ length: item.max_level }, (_, i) => `<i class="${i < item.level ? "on" : ""}"></i>`).join("");
        const upkeepVal = item.next ? item.next_upkeep : item.upkeep;
        const lvlAfter = item.next ? item.level + 1 : item.level;
        const powerChip = (item.group !== "power" && item.power_required)
            ? `<span class="ic-chip">⚡ مصرف ${formatNumber(item.power_required * lvlAfter)} برق</span>` : "";

        const effChips = bonusParts(item, lvlAfter).map(p => `<span class="ic-chip">${p.l} ${p.v}</span>`).join("");
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
            ${(powerChip || effChips) ? `<div class="ic-chips">${powerChip}${effChips}</div>` : ""}
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
    const figNow = built ? infraMainFigure(item, item.current, item.level) : null;
    const figNext = infraMainFigure(item, item.next, lvlAfter);

    const rows = [];
    if (item.next.capacity === undefined) {
        const now = built ? bonusParts(item, item.level) : [];
        bonusParts(item, lvlAfter).forEach((p, i) => rows.push(`<div class="is-row"><span>${p.l}</span><b>${now[i] ? `از ${now[i].v} به ${p.v}` : p.v}</b></div>`));
    } else if (figNext) {
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

function economyCategoryFor(iid) {
    if (["eco_agriculture", "eco_fishing"].includes(iid)) return "food";
    if (["eco_textile", "eco_construction", "eco_mining", "eco_steel", "eco_electronics", "eco_oil", "eco_chemicals"].includes(iid)) return "industry";
    if (["eco_trade"].includes(iid)) return "trade";
    return "finance"; // گردشگری، خدمات و بانک
}

function bindEconomyFilters() {
    const filters = document.getElementById("economy-filters");
    if (!filters || filters.dataset.bound === "1") return;
    filters.dataset.bound = "1";
    filters.addEventListener("click", e => {
        const btn = e.target.closest("[data-economy-filter]");
        if (!btn) return;
        currentEconomyFilter = btn.dataset.economyFilter || "all";
        filters.querySelectorAll("[data-economy-filter]").forEach(item => {
            const active = item === btn;
            item.classList.toggle("active", active);
            item.setAttribute("aria-selected", active ? "true" : "false");
        });
        renderEconomyList();
    });
}

function renderEconomyList() {
    const c = document.getElementById("economy-list");
    if (!c || !player?.economy) return;
    bindEconomyFilters();
    c.innerHTML = "";
    c.classList.add("economy-list-grid");
    const entries = Object.entries(player.economy).filter(([iid]) => currentEconomyFilter === "all" || economyCategoryFor(iid) === currentEconomyFilter);
    if (!entries.length) {
        c.innerHTML = `<div class="economy-empty-state">در این دسته هنوز گزینه‌ای وجود ندارد.</div>`;
        return;
    }
    entries.forEach(([iid, item]) => {
        const card = document.createElement("article");
        card.className = "eco-investment-card";
        const built = item.level > 0;
        const next = item.next;
        const currentIncome = Number(item.current?.income || 0);
        const nextIncome = Number(next?.income || 0);
        const incomeGain = nextIncome - currentIncome;
        const maxPips = Array.from({length:item.max_level || 0}, (_,i) => `<i class="${i < item.level ? "on" : ""}"></i>`).join("");
        const statusText = !built ? "آمادهٔ سرمایه‌گذاری" : `سطح ${item.level} از ${item.max_level}`;
        const buttonText = !next ? "حداکثر سطح" : (built ? `ارتقای سرمایه‌گذاری · ${formatMoney(next.cost)}` : `سرمایه‌گذاری · ${formatMoney(next.cost)}`);
        card.innerHTML = `
            <div class="eco-card-top"><span class="eco-card-icon">${item.icon || "💼"}</span><div class="eco-card-title"><h3>${escapeHtml(item.name || "سرمایه‌گذاری")}</h3><small>${statusText}</small></div><span class="eco-card-level">${built ? `${item.level}/${item.max_level}` : "جدید"}</span></div>
            <p class="eco-card-desc">${escapeHtml(item.desc || "")}</p>
            <div class="eco-level-pips">${maxPips}</div>
            <div class="eco-income-panel"><small>درآمد روزانهٔ ${built ? "فعلی" : "سطح ۱"}</small><strong>${formatMoney(built ? currentIncome : Number(next?.income || 0))}</strong>${built && next ? `<span>پس از ارتقا: ${formatMoney(nextIncome)} <i>(${incomeGain >= 0 ? "+" : "−"}${formatMoney(Math.abs(incomeGain))})</i></span>` : !built ? `<span>قابل ارتقا تا ${item.max_level} سطح</span>` : `<span>بالاترین سطح</span>`}</div>
            <div class="eco-card-facts"><span>⚡ برق لازم <b>${formatNumber(item.power_required || 0)}</b></span><span>🪙 هزینه <b>${next ? formatMoney(next.cost) : "—"}</b></span></div>
            <button class="eco-invest-button" ${!next ? "disabled" : ""}>${buttonText}</button>`;
        const btn = card.querySelector(".eco-invest-button");
        if (next) btn.addEventListener("click", () => upgradeEconomy(iid));
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
    currentArmyTab = "land";
    document.querySelectorAll(".army-tab").forEach(t => t.classList.toggle("active", t.dataset.armyTab === "land"));
    await refreshPlayer();
    renderArmySummary();
    renderBaseCards();
    renderArmyTabsCounts();
    renderArmyUnitsNew();
}

function selectArmyTabAndReveal(group, scroll = true) {
    currentArmyTab = group;
    document.querySelectorAll(".army-tab").forEach(t => t.classList.toggle("active", t.dataset.armyTab === group));
    renderArmyUnitsNew();
    if (scroll) {
        requestAnimationFrame(() => document.getElementById("army-units-new")?.scrollIntoView({behavior: "smooth", block: "start"}));
    }
}

document.querySelectorAll(".army-tab").forEach(tab => {
    tab.addEventListener("click", () => selectArmyTabAndReveal(tab.dataset.armyTab, false));
});
document.querySelectorAll("[data-army-jump]").forEach(card => {
    const activate = () => selectArmyTabAndReveal(card.dataset.armyJump, true);
    card.addEventListener("click", activate);
    card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } });
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

const BASES = [
    { key: "barracks", infra: "land_barracks", group: "land" },
    { key: "airport", infra: "air_airport", group: "air" },
    { key: "port", infra: "naval_port", group: "naval" },
    { key: "missile", infra: "missile_depot", group: "missile" },
];

function renderBaseCards() {
    if (!player?.infra) return;
    BASES.forEach(b => {
        const it = player.infra[b.infra];
        const v = document.getElementById(`base-${b.key}-value`);
        const m = document.getElementById(`base-${b.key}-max`);
        const f = document.getElementById(`base-${b.key}-fill`);
        if (!v) return;
        if (it && it.current) {
            const cap = getGroupCapacity(b.group), used = getGroupUsed(b.group);
            v.textContent = formatNumber(used);
            m.textContent = `از ${formatNumber(cap)}`;
            f.style.width = cap > 0 ? Math.min(100, used / cap * 100) + "%" : "0%";
        } else {
            v.textContent = "—"; m.textContent = "ساخته نشده"; f.style.width = "0%";
        }
    });
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
        const missing = missingReqs(u);
        const full = used >= cap;
        const totalPower = Math.round(count * (u.attack + u.defense * (player.def_mult?.[group] ?? 1)));

        let statusText = "آماده آموزش";
        if (missing.length) statusText = "🔒 قفل است — برای دیدن نیازها «تولید» را بزنید";
        else if (full) statusText = "ظرفیت پر است.";

        const card = document.createElement("div");
        card.className = "unit-card-new" + (missing.length ? " locked" : "");
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
            <div class="unit-card-new-action">
                <button class="unit-produce-btn" ${!missing.length && full ? "disabled" : ""}>⚙️ تولید</button>
                <span class="unit-status-text">${statusText}</span>
            </div>`;
        card.querySelector(".unit-produce-btn").addEventListener("click", () => {
            if (missing.length) openLockSheet(uid_); else openTrainSheet(uid_);
        });

        c.appendChild(card);
    });
}

const REQ_WHY = {
    missile_depot: "محل نگهداری موشک‌ها",
    missile_factory: "ساخت موشک",
    land_barracks: "محل نگهداری نیروهای زمینی",
    land_hq: "فرماندهی و آموزش نیروهای زمینی",
    land_tank_factory: "ساخت تانک",
    naval_port: "محل پهلو گرفتن ناوگان",
    naval_shipyard: "ساخت ناوها و زیردریایی",
    air_airport: "محل استقرار هواپیماها",
    air_arsenal: "ساخت جنگنده، بمب‌افکن و بالگرد",
};

// ساختمان‌های لازمی که هنوز ساخته نشده‌اند
function reqList(u) {
    const ml = u.min_level || {};
    return (Array.isArray(u.requires) ? u.requires : [u.requires]).map(r => ({ id: r, lvl: ml[r] || 1 }));
}
function missingReqs(u) {
    return reqList(u).filter(r => (player?.infra?.[r.id]?.level ?? 0) < r.lvl);
}

function openLockSheet(uid_) {
    const u = ARMY_UNITS[uid_]; if (!u || !player) return;
    closeInfraSheet();
    const rows = missingReqs(u).map(r => {
        const it = player.infra?.[r.id], cur = it?.level ?? 0;
        const name = (it?.name || r.id) + (r.lvl > 1 ? ` سطح ${r.lvl}` : "");
        return `<div class="is-row is-bad"><span>🔒 ${name}</span><b>${REQ_WHY[r.id] || ""}${cur > 0 ? ` <small>(الان سطح ${cur})</small>` : ""}</b></div>`;
    }).join("");
    const ov = document.createElement("div");
    ov.id = "infra-sheet"; ov.className = "modal-overlay";
    ov.innerHTML = `
        <div class="ic-sheet">
            <div class="is-head">
                <div class="ic-hex"><span>🔒</span></div>
                <div class="is-titles">
                    <div class="is-name">${u.name}</div>
                    <div class="is-sub">برای تولید این یگان باید بسازید:</div>
                </div>
                <button class="is-close" aria-label="بستن">✕</button>
            </div>
            <div class="is-rows">${rows}</div>
            <div class="modal-actions"><button class="modal-cancel">بستن</button></div>
        </div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) closeInfraSheet(); });
    ov.querySelector(".is-close").onclick = closeInfraSheet;
    ov.querySelector(".modal-cancel").onclick = closeInfraSheet;
}

async function trainUnit(uid_, count) {
    if (!userId) return false;
    try {
        const d = await apiPost("/api/train-unit", { unit_id: uid_, count });
        if (!d.success) { showToast(d.message || "خطا", "error"); return false; }
        player = d.player;
        updateHomeStats(); renderArmySummary(); renderBaseCards(); renderArmyTabsCounts(); renderArmyUnitsNew();
        return true;
    } catch (e) { showToast("خطا."); return false; }
}

function unitCost(u) { return u.cost; }
function trainLimits(u) {
    const c = unitCost(u);
    const caps = [getGroupCapacity(u.group) - getGroupUsed(u.group),
        Math.floor((player.money ?? 0) / c), Math.floor((player.manpower ?? 0) / u.manpower)];
    Object.entries(u.resources || {}).forEach(([k, a]) => caps.push(Math.floor((player.resources?.[k] ?? 0) / a)));
    return Math.max(0, Math.min(...caps));
}

// پنجرهٔ تولید: عدد با − / + / حداکثر، دکمه‌های ۱ و ۱۰، اطلاعات و قیمت کل بر اساس تعداد
function openTrainSheet(uid_) {
    const u = ARMY_UNITS[uid_]; if (!u || !player) return;
    closeInfraSheet();
    const cost = unitCost(u), capLeft = Math.max(0, getGroupCapacity(u.group) - getGroupUsed(u.group));
    const ov = document.createElement("div");
    ov.id = "infra-sheet"; ov.className = "modal-overlay";
    ov.innerHTML = `
        <div class="ic-sheet">
            <div class="is-head">
                <div class="ic-hex"><span>${GROUP_ICONS[u.group] || "🪖"}</span></div>
                <div class="is-titles">
                    <div class="is-name">${u.name}</div>
                    <div class="is-sub">حمله ${u.attack} · دفاع ${Math.round(u.defense * (player.def_mult?.[u.group] ?? 1))} · ظرفیت آزاد ${formatNumber(capLeft)}</div>
                </div>
                <button class="is-close" aria-label="بستن">✕</button>
            </div>
            <div class="tr-qty">
                <button class="tr-step" data-d="-1">−</button>
                <input class="tr-input" type="number" inputmode="numeric" min="1" value="1">
                <button class="tr-step" data-d="1">+</button>
                <button class="tr-max">حداکثر</button>
            </div>
            <div class="tr-quick"><button data-n="1">۱</button><button data-n="10">۱۰</button></div>
            <div class="is-rows" id="tr-rows"></div>
            <div class="is-price" id="tr-price"></div>
            <div class="modal-actions">
                <button class="modal-cancel">انصراف</button>
                <button class="modal-ok" id="tr-ok">تولید</button>
            </div>
        </div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector(".tr-input"), okBtn = ov.querySelector("#tr-ok");
    const getN = () => Math.max(0, Math.floor(Number(inp.value) || 0));
    const update = () => {
        const n = getN(), rows = [];
        rows.push(`<div class="is-row"><span>تعداد فعلی</span><b>${formatNumber(player.units?.[uid_] ?? 0)}</b></div>`);
        Object.entries(u.daily || {}).forEach(([k, d]) =>
            rows.push(`<div class="is-row"><span>🔁 مصرف روزانه · ${RESOURCE_ICONS[k] || ""} ${RESOURCE_NAMES[k] || k}</span><b>${formatNumber(d * n)} <small>(هر عدد ${formatNumber(d)})</small></b></div>`));
        if (u.transport_capacity) rows.push(`<div class="is-row"><span>🚚 ظرفیت حمل (تانک/پیاده در دریا)</span><b>${formatNumber(u.transport_capacity)}</b></div>`);
        if (u.aircraft_capacity) rows.push(`<div class="is-row"><span>🛬 ظرفیت هواپیما در دریا</span><b>${formatNumber(u.aircraft_capacity)}</b></div>`);
        if (u.refuel_capacity) rows.push(`<div class="is-row"><span>⛽ ظرفیت سوخت‌رسانی در خشکی</span><b>${formatNumber(u.refuel_capacity)}</b></div>`);
        const row = (label, need, have, money) => {
            const bad = need > have;
            rows.push(`<div class="is-row ${bad ? "is-bad" : ""}"><span>${label}</span><b>${money ? formatMoney(need) : formatNumber(need)} <small>(موجود: ${money ? formatMoney(have) : formatNumber(have)})</small></b></div>`);
            return bad;
        };
        let bad = false;
        bad = row("💰 هزینه", cost * n, player.money ?? 0, true) || bad;
        bad = row("👥 نیروی انسانی", u.manpower * n, Math.floor(player.manpower ?? 0), false) || bad;
        Object.entries(u.resources || {}).forEach(([k, a]) => {
            bad = row(`${RESOURCE_ICONS[k] || ""} ${RESOURCE_NAMES[k] || k}`, a * n, Math.floor(player.resources?.[k] ?? 0), false) || bad;
        });
        if (n > capLeft) { bad = true; rows.push(`<div class="is-row is-bad"><span>📦 ظرفیت آزاد</span><b>${formatNumber(capLeft)}</b></div>`); }
        ov.querySelector("#tr-rows").innerHTML = rows.join("");
        ov.querySelector("#tr-price").className = "is-price" + (bad ? " is-bad" : "");
        ov.querySelector("#tr-price").innerHTML = `<span>قیمت ${formatNumber(n)} عدد</span><b>${formatMoney(cost * n)}</b>`;
        okBtn.disabled = bad || n < 1;
        okBtn.textContent = n < 1 ? "تعداد را وارد کنید" : bad ? "امکان تولید نیست" : `تولید ${formatNumber(n)} عدد`;
    };
    ov.querySelectorAll(".tr-step").forEach(b => b.onclick = () => { inp.value = Math.max(1, getN() + Number(b.dataset.d)); update(); });
    ov.querySelectorAll(".tr-quick button").forEach(b => b.onclick = () => { inp.value = b.dataset.n; update(); });
    ov.querySelector(".tr-max").onclick = () => { inp.value = Math.max(1, trainLimits(u)); update(); };
    inp.addEventListener("input", update);
    ov.addEventListener("click", e => { if (e.target === ov) closeInfraSheet(); });
    ov.querySelector(".is-close").onclick = closeInfraSheet;
    ov.querySelector(".modal-cancel").onclick = closeInfraSheet;
    okBtn.onclick = async () => {
        if (okBtn.disabled) return;
        okBtn.disabled = true;
        if (await trainUnit(uid_, getN())) closeInfraSheet(); else update();
    };
    update();
}

/* =========================================================
   War
========================================================= */
let warSites = [];
let warForces = { home: {}, sites: [] };
let dispatchOpen = false;
let dispatchSel = { from: null, to: null, units: {} };
let forcesFilter = "all";
let expandedLoc = null;
let warSearchQ = "";
let newsQ = "", newsCountry = "";
let histKind = "all", histCountry = "";
let warLog = { events: [], history: [], stats: { fights: 0, wins: 0, losses: 0 } };
let scanState = { scans: 0, sites: {}, countries: {} };
let satTimer = null;
let currentWarTab = "war-forces-panel";

const sumVals = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
const unitName = id => ARMY_UNITS[id]?.name || id;
function siteIcon(s) { return s.kind === "strait" ? "⚓" : (RESOURCE_ICONS[s.type] || "📍"); }
function unitChips(units) {
    return Object.entries(units || {}).filter(([, n]) => n > 0)
        .map(([k, n]) => `<span class="wf-chip">${unitName(k)} <b>${formatNumber(n)}</b></span>`).join("");
}
function timeAgo(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "لحظاتی پیش";
    const m = Math.floor(s / 60); if (m < 60) return `${formatNumber(m)} دقیقه پیش`;
    const h = Math.floor(m / 60); if (h < 24) return `${formatNumber(h)} ساعت پیش`;
    return `${formatNumber(Math.floor(h / 24))} روز پیش`;
}
function timeLeft(iso) {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return "منقضی شد";
    const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
    return h > 0 ? `${formatNumber(h)} ساعت و ${formatNumber(m % 60)} دقیقه مانده` : `${formatNumber(m)} دقیقه مانده`;
}
function siteLabel(id) {
    return (typeof mapSites !== "undefined" ? mapSites.find(s => s.id === id) : null)?.name
        || warSites.find(s => s.id === id)?.name || warForces.sites.find(s => s.id === id)?.name || id;
}

function fillCountrySelects() {
    ["news-country", "hist-country"].forEach(id => {
        const el = document.getElementById(id);
        if (!el || el.options.length > 1) return;
        el.innerHTML = `<option value="">همه‌ی کشورها</option>` +
            Object.entries(COUNTRY_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
    });
}

function showWarTab(id) {
    currentWarTab = id;
    document.querySelectorAll(".war-tab").forEach(t => t.classList.toggle("active", t.dataset.warTab === id));
    document.querySelectorAll(".war-panel").forEach(p => p.classList.toggle("hidden", p.id !== id));
    clearInterval(satTimer); satTimer = null;
    if (id === "war-forces-panel") loadForces();
    else if (id === "war-targets-panel") { renderWarTargets(); loadWarData(); }
    else if (id === "war-news-panel" || id === "war-history-panel") loadWarLog();
    else if (id === "war-sat-panel") {
        renderSatTab();
        satTimer = setInterval(() => {
            if (currentWarTab === "war-sat-panel" && !document.getElementById("war").classList.contains("hidden")) renderSatTab();
        }, 20000);
    }
}
document.querySelectorAll(".war-tab").forEach(t => t.addEventListener("click", () => showWarTab(t.dataset.warTab)));
document.getElementById("war-search")?.addEventListener("input", e => { warSearchQ = e.target.value.trim(); renderWarTargets(); });
document.getElementById("news-search")?.addEventListener("input", e => { newsQ = e.target.value.trim(); renderWarNews(); });
document.getElementById("news-country")?.addEventListener("change", e => { newsCountry = e.target.value; renderWarNews(); });
document.getElementById("hist-country")?.addEventListener("change", e => { histCountry = e.target.value; renderWarHistory(); });
document.querySelectorAll("[data-hist-kind]").forEach(b => b.addEventListener("click", () => {
    histKind = b.dataset.histKind;
    document.querySelectorAll("[data-hist-kind]").forEach(x => x.classList.toggle("active", x === b));
    renderWarHistory();
}));

async function openWarPage(opts = {}) {
    showGamePage("war");
    fillCountrySelects();
    if (!Object.keys(ARMY_UNITS).length) await loadArmyCatalog();
    dispatchOpen = !!opts.dispatchTo;
    dispatchSel = { from: null, to: opts.dispatchTo || null, units: {} };
    expandedLoc = null; forcesFilter = "all";
    showWarTab("war-forces-panel");
}
function openDispatchTo(siteId) { openWarPage({ dispatchTo: siteId }); }

/* ---------- نیروها ---------- */
async function loadForces() {
    try {
        const [f, s] = await Promise.all([apiGet("/api/war/forces"), apiGet("/api/map-sites")]);
        if (f && f.home) { warForces = f; if (f.now) transitSkew = Date.parse(f.now) - Date.now(); }
        warSites = Array.isArray(s) ? s : [];
        if (player?.satellite_built) await loadScanState();
    } catch (e) { console.error(e); }
    renderForcesTab();
}
function poolOf(loc) { return loc === "home" ? warForces.home : (warForces.sites.find(s => s.id === loc)?.units || {}); }
function locName(loc) { return loc === "home" ? "خانه" : siteLabel(loc); }
const wfStat = (n, label) => `<div class="wf-stat"><b>${formatNumber(n)}</b><span>${label}</span></div>`;

function locCardHtml(l) {
    const total = sumVals(l.units), open = expandedLoc === l.id;
    const isHome = l.kind === "home";
    const ico = isHome ? flagInline(selectedCountry) : siteIcon(l);
    const title = isHome ? `خانه · ${COUNTRY_NAMES[selectedCountry] || ""}` : l.name;
    const sub = isHome ? "خانه" : (l.kind === "strait" ? "تنگه" : "سکو / معدن");
    return `<div class="wf-loc">
        <div class="wf-loc-top" data-toggle="${l.id}">
            <span class="wf-ico">${ico}</span>
            <div class="wf-loc-name"><b>${title}</b><small>${sub}</small></div>
            <div class="wf-loc-count"><b>${formatNumber(total)}</b> یگان <i>⌃</i></div>
        </div>
    </div>`;
}

function closeLocSheet() { document.getElementById("loc-sheet")?.remove(); }

// پنجرهٔ پایین: از پایین تا وسط صفحه بالا می‌آید و همهٔ اطلاعات آن موضع را نشان می‌دهد
function openLocSheet(id) {
    const locs = [{ id: "home", kind: "home", name: "خانه", units: warForces.home }, ...warForces.sites];
    const l = locs.find(x => x.id === id); if (!l) return;
    closeLocSheet();
    const isHome = l.kind === "home";
    const total = sumVals(l.units);
    const ico = isHome ? flagInline(selectedCountry) : siteIcon(l);
    const title = isHome ? `خانه · ${COUNTRY_NAMES[selectedCountry] || ""}` : l.name;
    const sub = isHome ? "خانه" : (l.kind === "strait" ? "تنگه" : "سکو / معدن");
    const rows = Object.entries(l.units || {}).filter(([, n]) => n > 0)
        .map(([k, n]) => `<div class="is-row"><span>${unitName(k)}</span><b>${formatNumber(n)}</b></div>`).join("")
        || `<div class="gs-none">بدون نیرو</div>`;
    const ov = document.createElement("div");
    ov.id = "loc-sheet"; ov.className = "gs-overlay gs-bottom";
    ov.innerHTML = `<div class="gs-sheet loc-sheet">
        <div class="gs-sheet-head"><button type="button" class="gs-x" aria-label="بستن">✕</button>
            <span class="loc-head"><span class="wf-ico">${ico}</span><span><b>${title}</b><small>${sub} · ${formatNumber(total)} یگان</small></span></span></div>
        <div class="gs-sheet-list"><div class="is-rows">${rows}</div>
        ${total > 0 ? `<div class="wf-loc-actions">
            <button data-from="${l.id}">🧭 اعزام از این‌جا</button>
            ${isHome ? "" : `<button data-home="${l.id}">🏠 بازگشت به خانه</button>`}</div>` : ""}</div></div>`;
    ov.addEventListener("click", e => {
        if (e.target === ov || e.target.closest(".gs-x")) { closeLocSheet(); return; }
        const f = e.target.closest("[data-from]"), h = e.target.closest("[data-home]");
        if (f) { dispatchOpen = true; dispatchSel = { from: f.dataset.from, to: null, units: {} }; }
        else if (h) { dispatchOpen = true; dispatchSel = { from: h.dataset.home, to: "home", units: {} }; }
        else return;
        closeLocSheet(); renderForcesTab(); showGamePage("war");
    });
    document.body.appendChild(ov);
}

function dispatchPanelHtml() {
    const { from, to } = dispatchSel;
    let h = `<div class="dp-panel"><div class="dp-squares">
        <button class="dp-sq ${from ? "set" : ""}" id="dp-from"><small>از کجا</small><b>${from ? locName(from) : "انتخاب"}</b></button>
        <div class="dp-arrow">←</div>
        <button class="dp-sq ${to ? "set" : ""}" id="dp-to"><small>به کجا</small><b>${to ? locName(to) : "انتخاب"}</b></button>
    </div>`;
    if (from && to) {
        h += `<div class="dp-units">` + Object.entries(poolOf(from)).filter(([, n]) => n > 0).map(([k, n]) => `
            <div class="dp-unit" data-u="${k}">
                <span class="dp-un">${unitName(k)}<small>موجود ${formatNumber(n)}</small></span>
                <div class="dp-qty"><button data-d="-1">−</button>
                    <input type="number" inputmode="numeric" min="0" max="${n}" value="${dispatchSel.units[k] || 0}">
                    <button data-d="1">+</button><button class="dp-all">همه</button></div>
            </div>`).join("") + `</div>
            <div class="dp-summary" id="dp-summary"></div>
            <button class="wf-send-btn dp-go" id="dp-go" disabled>ارسال نیرو</button>`;
    } else {
        h += `<div class="dp-hint">اول مبدأ و مقصد را انتخاب کن.</div>`;
    }
    return h + `</div>`;
}

/* قوانین اعزام (آینهٔ قوانین سرور): دریا/خشکی، ناو ترابری، ناو هواپیمابر، سوخت‌رسان */
function dispatchRuleErrors(units, zone) {
    const errs = [], U = k => ARMY_UNITS[k] || {}, n = k => Math.max(0, units[k] || 0);
    const sum = (...ids) => ids.reduce((a, k) => a + n(k), 0);
    const banned = Object.keys(units).filter(k => n(k) > 0 && U(k).group &&
        (U(k).group === "missile" || (zone === "land" && U(k).group === "naval")));
    if (banned.length) errs.push(`این یگان‌ها نمی‌توانند به ${zone === "land" ? "خشکی" : "این موضع"} بروند: ${banned.map(unitName).join("، ")}`);
    if (zone === "sea") {
        const g = sum("infantry", "tank"), c1 = n("transport_ship") * (U("transport_ship").transport_capacity || 0);
        if (g > c1) errs.push(`در دریا، تانک و پیاده‌نظام به ${unitName("transport_ship")} نیاز دارند (ظرفیت ${formatNumber(c1)} از ${formatNumber(g)} یگان)`);
        const p = sum("fighter", "bomber", "air_tanker"), c2 = n("aircraft_carrier") * (U("aircraft_carrier").aircraft_capacity || 0);
        if (p > c2) errs.push(`در دریا، جنگنده و بمب‌افکن به ${unitName("aircraft_carrier")} نیاز دارند (ظرفیت ${formatNumber(c2)} از ${formatNumber(p)} هواپیما)`);
    } else if (zone === "land") {
        const jets = sum("fighter", "bomber"), c = n("air_tanker") * (U("air_tanker").refuel_capacity || 0);
        if (jets > c) errs.push(`در خشکی، جنگنده و بمب‌افکن به ${unitName("air_tanker")} نیاز دارند (ظرفیت ${formatNumber(c)} از ${formatNumber(jets)} هواپیما)`);
    }
    return errs;
}

function dispatchErrorsFor(from, to, picked) {
    if (!to || to === "home") return [];
    const dst = warSites.find(s => s.id === to);
    const combined = { ...picked };
    if (dst?.owner === selectedCountry) Object.entries(poolOf(to)).forEach(([k, v]) => combined[k] = (combined[k] || 0) + v);
    const errs = dispatchRuleErrors(combined, dst?.zone || (dst?.kind === "strait" ? "sea" : "land"));
    if (from && from !== "home") {
        const zs = warSites.find(s => s.id === from)?.zone || (warSites.find(s => s.id === from)?.kind === "strait" ? "sea" : "land");
        const before = poolOf(from), after = {};
        Object.keys(before).forEach(k => after[k] = before[k] - (picked[k] || 0));
        if (!dispatchRuleErrors(before, zs).length && dispatchRuleErrors(after, zs).length)
            errs.push("با خروج این یگان‌ها، نیروهای باقی‌مانده در مبدأ بدون پشتیبان می‌مانند");
    }
    return errs;
}

function updateDpSummary() {
    const sum = document.getElementById("dp-summary"), go = document.getElementById("dp-go");
    if (!sum || !go) return;
    const { to } = dispatchSel, total = sumVals(dispatchSel.units);
    const dst = warSites.find(s => s.id === to);
    let kind;
    if (to === "home") kind = "🏠 بازگشت به خانه";
    else if (!dst?.owner) kind = "🚩 موضع بی‌صاحب است؛ اشغال می‌شود";
    else if (dst.owner === selectedCountry) kind = "🛡️ موضع خودی؛ نیروها تقویت می‌شوند";
    else {
        kind = `⚔️ حمله به ${COUNTRY_NAMES[dst.owner] || dst.owner} (بدون نیاز به اعلان جنگ)`;
        const sc = scanState.sites?.[to];
        if (sc?.owner) kind += ` · قدرت دفاعی اسکن‌شده: ${formatNumber(sc.power)}`;
    }
    const atk = Object.entries(dispatchSel.units).reduce((a, [k, n]) => a + n * (ARMY_UNITS[k]?.attack || 0), 0);
    const hostile = dst?.owner && dst.owner !== selectedCountry;
    const picked = Object.fromEntries(Object.entries(dispatchSel.units).filter(([, v]) => v > 0));
    const errs = total > 0 ? dispatchErrorsFor(dispatchSel.from, to, picked) : [];
    sum.innerHTML = `<div>${kind}</div><div>${formatNumber(total)} یگان انتخاب شده${hostile ? ` · قدرت حمله ${formatNumber(atk)}` : ""}</div>`
        + errs.map(e => `<div class="dp-error">⚠️ ${e}</div>`).join("");
    go.disabled = total < 1 || errs.length > 0;
}

function renderForcesTab() {
    const root = document.getElementById("war-forces-root");
    if (!root) return;
    const homeN = sumVals(warForces.home);
    const siteN = warForces.sites.reduce((a, s) => a + sumVals(s.units), 0);
    const locs = [{ id: "home", kind: "home", name: "خانه", units: warForces.home }, ...warForces.sites];
    const shown = locs.filter(l => forcesFilter === "all" || l.kind === forcesFilter);
    const chips = [["all", "همه"], ["home", "خانه"], ["resource", "سکوها و معادن"], ["strait", "تنگه‌ها"]];
    root.innerHTML = `
        <div class="wf-stats">${wfStat(homeN, "در خانه")}${wfStat(siteN, `در ${formatNumber(warForces.sites.length)} موضع`)}${wfStat(homeN + siteN, "کل نیروها")}</div>
        ${transitsHtml()}
        <button class="wf-send-btn" id="wf-send-toggle">🧭 اعزام نیرو</button>
        <div class="wf-section"><span>مواضع</span><small>${formatNumber(locs.length)} مکان</small></div>
        <div class="wf-chips">${chips.map(([k, l]) => `<button class="wf-fchip ${forcesFilter === k ? "active" : ""}" data-f="${k}">${l}</button>`).join("")}</div>
        <div>${shown.map(locCardHtml).join("")}</div>`;

    root.querySelector("#wf-send-toggle").onclick = () => {
        dispatchOpen = true;
        renderForcesTab();
    };
    root.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { forcesFilter = b.dataset.f; renderForcesTab(); });
    root.querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => {
        openLocSheet(b.dataset.toggle);
    });
    root.querySelectorAll("[data-recall]").forEach(b => b.onclick = async () => {
        if (!(await gameConfirm("نیروها از میانهٔ راه برگردند؟", { title: "بازگشت نیرو", ok: "بازگرداندن" }))) return;
        b.disabled = true;
        try {
            const d = await apiPost("/api/war/recall", { id: b.dataset.recall });
            showToast(d.message || (d.success ? "انجام شد" : "خطا"));
            if (d.player) { player = d.player; updateHomeStats(); }
        } catch (e) { showToast("خطا."); }
        loadForces();
    });
    renderDispatchSheet();
    startTransitTicker();
}

/* ---------- نیروهای در راه ---------- */
let transitTimer = null, transitSkew = 0;
function fmtEta(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const pad = n => String(n).padStart(2, "0");
    return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}
function transitsHtml() {
    const list = warForces.transits || [];
    if (!list.length) return "";
    return `<div class="wf-section"><span>در راه</span><small>${formatNumber(list.length)} گروه</small></div>` + list.map(t => {
        const total = sumVals(t.units);
        return `<div class="wf-transit">
            <div class="wf-tr-top"><b>${t.from_name} ← ${t.to_name}</b><small>${t.kind === "back" ? "در حال بازگشت" : "در حال حرکت"} · ${formatNumber(total)} یگان</small></div>
            <div class="wf-tr-bar"><i data-tr-bar="${t.id}"></i></div>
            <div class="wf-tr-bottom"><span>⏱ <b data-tr-eta="${t.id}" dir="ltr">—</b></span>
                ${t.kind === "go" ? `<button class="wf-tr-cancel" data-recall="${t.id}">بازگرداندن</button>` : ""}</div>
        </div>`;
    }).join("");
}
function tickTransits() {
    const list = warForces.transits || [];
    const now = Date.now() + transitSkew;
    let done = false;
    list.forEach(t => {
        const st = Date.parse(t.start), ar = Date.parse(t.arrive);
        const left = ar - now, pct = Math.max(0, Math.min(100, ((now - st) / Math.max(1, ar - st)) * 100));
        const e = document.querySelector(`[data-tr-eta="${t.id}"]`), bar = document.querySelector(`[data-tr-bar="${t.id}"]`);
        if (e) e.textContent = left > 0 ? fmtEta(left) : "رسید";
        if (bar) bar.style.width = pct + "%";
        if (left <= -1500) done = true;
    });
    if (done) { clearInterval(transitTimer); transitTimer = null; setTimeout(loadForces, 600); }
}
function startTransitTicker() {
    clearInterval(transitTimer); transitTimer = null;
    if (!(warForces.transits || []).length) return;
    tickTransits();
    transitTimer = setInterval(() => {
        if (document.getElementById("war")?.classList.contains("hidden")) return;
        tickTransits();
    }, 1000);
}

function closeDispatchSheet() { document.getElementById("dp-sheet")?.remove(); }

// پنجرهٔ اعزام: از پایین تا وسط صفحه بالا می‌آید و همهٔ مراحل اعزام داخل آن است
function renderDispatchSheet() {
    let ov = document.getElementById("dp-sheet");
    if (!dispatchOpen) { ov?.remove(); return; }
    const prevScroll = ov?.querySelector(".gs-sheet-list")?.scrollTop || 0;
    if (!ov) {
        ov = document.createElement("div");
        ov.id = "dp-sheet"; ov.className = "gs-overlay gs-bottom";
        ov.addEventListener("click", e => {
            if (e.target === ov || e.target.closest(".gs-x")) {
                dispatchOpen = false; dispatchSel = { from: null, to: null, units: {} }; closeDispatchSheet();
            }
        });
        document.body.appendChild(ov);
    }
    ov.innerHTML = `<div class="gs-sheet loc-sheet">
        <div class="gs-sheet-head"><button type="button" class="gs-x" aria-label="بستن">✕</button><span>اعزام نیرو</span></div>
        <div class="gs-sheet-list">${dispatchPanelHtml()}</div></div>`;
    ov.querySelector(".gs-sheet-list").scrollTop = prevScroll;
    ov.querySelector("#dp-from")?.addEventListener("click", () => openPlaceSheet("from"));
    ov.querySelector("#dp-to")?.addEventListener("click", () => openPlaceSheet("to"));
    ov.querySelectorAll(".dp-unit").forEach(row => {
        const k = row.dataset.u, max = poolOf(dispatchSel.from)[k] || 0, inp = row.querySelector("input");
        const clamp = v => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
        const set = v => { v = clamp(v); dispatchSel.units[k] = v; inp.value = v; updateDpSummary(); };
        row.querySelectorAll("[data-d]").forEach(b => b.onclick = () => set((Number(inp.value) || 0) + Number(b.dataset.d)));
        row.querySelector(".dp-all").onclick = () => set(max);
        inp.oninput = () => { dispatchSel.units[k] = clamp(inp.value); updateDpSummary(); };
    });
    const go = ov.querySelector("#dp-go");
    if (go) { go.onclick = sendDispatch; updateDpSummary(); }
}

function placeRow(id, icon, name, sub) {
    return `<button class="ps-row" data-id="${id}" data-q="${name}"><span class="ps-ic">${icon}</span><span class="ps-t"><b>${name}</b><small>${sub}</small></span></button>`;
}

function openPlaceSheet(mode) {
    closeInfraSheet();
    let rows = "";
    if (mode === "from") {
        const locs = [{ id: "home", name: "خانه" }, ...warForces.sites];
        rows = locs.filter(l => sumVals(poolOf(l.id)) > 0)
            .map(l => placeRow(l.id, l.id === "home" ? "🏠" : siteIcon(l), l.name, `${formatNumber(sumVals(poolOf(l.id)))} یگان`)).join("")
            || `<div class="diplomacy-item-empty">هیچ نیرویی نداری.</div>`;
    } else {
        const list = [];
        if (dispatchSel.from !== "home") list.push(placeRow("home", "🏠", "خانه", "بازگشت نیروها"));
        const order = s => !s.owner ? 0 : (s.owner !== selectedCountry ? 1 : 2);
        warSites.filter(s => s.id !== dispatchSel.from).sort((a, b) => order(a) - order(b)).forEach(s => {
            let st = "بی‌صاحب";
            if (s.owner === selectedCountry) st = "مال شما";
            else if (s.owner) {
                st = `در دست ${COUNTRY_NAMES[s.owner] || s.owner}`;
                const sc = scanState.sites?.[s.id];
                if (sc?.owner) st += ` · قدرت ${formatNumber(sc.power)}`;
            }
            list.push(placeRow(s.id, siteIcon(s), s.name, st));
        });
        rows = list.join("");
    }
    const ov = document.createElement("div");
    ov.id = "infra-sheet"; ov.className = "modal-overlay";
    ov.innerHTML = `<div class="ic-sheet">
        <div class="is-head"><div class="is-titles"><div class="is-name">${mode === "from" ? "از کجا؟" : "به کجا؟"}</div>
            <div class="is-sub">${mode === "from" ? "جایی که نیرو داری" : "سکوها، معادن و تنگه‌ها"}</div></div>
            <button class="is-close" aria-label="بستن">✕</button></div>
        <input class="ps-search" type="search" placeholder="جستجو...">
        <div class="ps-list">${rows}</div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) closeInfraSheet(); });
    ov.querySelector(".is-close").onclick = closeInfraSheet;
    ov.querySelector(".ps-search").oninput = e => {
        const q = e.target.value.trim();
        ov.querySelectorAll(".ps-row").forEach(r => r.classList.toggle("hidden", !!q && !r.dataset.q.includes(q)));
    };
    ov.querySelectorAll(".ps-row").forEach(r => r.onclick = () => {
        const id = r.dataset.id;
        if (mode === "from") dispatchSel = { from: id, to: dispatchSel.to === id ? null : dispatchSel.to, units: {} };
        else dispatchSel.to = id;
        closeInfraSheet(); renderForcesTab();
    });
}

async function sendDispatch() {
    const { from, to } = dispatchSel;
    const picked = Object.fromEntries(Object.entries(dispatchSel.units).filter(([, v]) => v > 0));
    if (!Object.keys(picked).length) return;
    const dst = warSites.find(s => s.id === to);
    if (dst?.owner && dst.owner !== selectedCountry &&
        !(await gameConfirm(`در «${dst.name}» به ${COUNTRY_NAMES[dst.owner] || dst.owner} حمله می‌شود. ادامه؟`, { title: "حمله", danger: true }))) return;
    const btn = document.getElementById("dp-go"); if (btn) btn.disabled = true;
    try {
        const d = await apiPost("/api/war/dispatch", { from, to, units: picked });
        if (!d.success) { showToast(d.message || "خطا"); if (btn) btn.disabled = false; return; }
        showToast(d.message);
        if (d.player) { player = d.player; updateHomeStats(); }
        dispatchOpen = false; dispatchSel = { from: null, to: null, units: {} };
        closeDispatchSheet();
        await loadForces();
        refreshMapSites();
    } catch (e) { showToast("خطا."); }
}

/* ---------- اعلان جنگ ---------- */
function renderWarTargets() {
    const c = document.getElementById("war-target-list");
    if (!c) return;
    c.innerHTML = "";
    const hasUnits = player && Object.values(player.units || {}).some(v => v > 0);
    if (!hasUnits) {
        c.innerHTML = `<div class="diplomacy-item-empty">برای اعلان جنگ ابتدا باید یگان بسازید.</div>`;
        return;
    }
    Object.keys(COUNTRY_NAMES).forEach(cid => {
        if (cid === selectedCountry) return;
        if (warSearchQ && !COUNTRY_NAMES[cid].includes(warSearchQ)) return;
        const occupied = countries[cid]?.occupier;
        const card = document.createElement("div");
        card.className = "war-target-card";
        const occText = occupied ? ` (اشغال توسط ${COUNTRY_NAMES[occupied] || occupied})` : "";
        card.innerHTML = `
            <div class="war-target-top">
                <div class="flag-wrap"><img class="flag-img" src="${countryImageUrl(cid)}" alt=""></div>
                <span class="war-target-name">${COUNTRY_NAMES[cid]}${occText}</span>
            </div>
            <button class="war-attack-button" data-declare="${cid}">⚔️ اعلان جنگ</button>`;
        card.querySelector("[data-declare]").addEventListener("click", () => declareWar(cid));
        c.appendChild(card);
    });
}

async function declareWar(target) {
    if (!(await gameConfirm(`اعلام جنگ به ${COUNTRY_NAMES[target]}؟\nاین درخواست به سازمان ملل (ادمین) می‌رود.`, { title: "اعلام جنگ", ok: "اعلام جنگ", danger: true }))) return;
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

/* ---------- اخبار و تاریخچه ---------- */
async function loadWarLog() {
    try {
        const d = await apiGet("/api/war/log");
        if (d && d.events) warLog = d;
    } catch (e) { console.error(e); }
    renderWarNews(); renderWarHistory();
}

const WAR_EVENT_ICONS = { declare: "⚔️", occupy: "🚩", capture: "🚩", repel: "🛡️", release: "🏳️", send: "🧭", return: "🏠", turnback: "↩️" };

function renderWarNews() {
    const box = document.getElementById("war-news-list");
    if (!box) return;
    const list = warLog.events.filter(e =>
        (!newsCountry || (e.countries || []).includes(newsCountry)) && (!newsQ || e.text.includes(newsQ)));
    if (!list.length) { box.innerHTML = `<div class="diplomacy-item-empty">خبری نیست.</div>`; return; }
    box.innerHTML = list.map(e => `
        <div class="wn-item"><div class="wn-ic">${WAR_EVENT_ICONS[e.kind] || "⚔️"}</div>
            <div class="wn-body"><div class="wn-text">${(e.countries || []).map(c => flagInline(c, true)).join("")} ${e.text}</div>
            <small>${timeAgo(e.at)}</small></div></div>`).join("");
}

function renderWarHistory() {
    const box = document.getElementById("war-history-list"), st = document.getElementById("war-history-stats");
    if (!box || !st) return;
    const s = warLog.stats || {};
    st.innerHTML = `<div class="wf-stat"><b>${formatNumber(s.fights)}</b><span>درگیری</span></div>
        <div class="wf-stat win"><b>${formatNumber(s.wins)}</b><span>برد</span></div>
        <div class="wf-stat lose"><b>${formatNumber(s.losses)}</b><span>باخت</span></div>`;
    const me = selectedCountry;
    const list = warLog.history.filter(h =>
        (histKind === "all" || h.kind === histKind) &&
        (!histCountry || h.attacker === histCountry || h.defender === histCountry));
    if (!list.length) { box.innerHTML = `<div class="diplomacy-item-empty">درگیری‌ای ثبت نشده.</div>`; return; }
    const kindLabel = { country: "کشور", strait: "تنگه", resource: "سکو و معدن" };
    const kindIcon = { country: "⚔️", strait: "⚓", resource: "⛏️" };
    box.innerHTML = list.map(h => {
        const win = (h.winner === "attacker" && h.attacker === me) || (h.winner === "defender" && h.defender === me);
        return `<div class="wh-item ${win ? "win" : "lose"}">
            <div class="wh-top"><div class="wh-ic">${kindIcon[h.kind] || "⚔️"}</div>
                <div class="wh-t"><b>${h.title}</b><small>${kindLabel[h.kind] || ""} · ${jalaliStamp(h.at)}</small></div>
                <span class="wh-badge">${win ? "برد" : "باخت"}</span></div>
            <div class="wh-res">${win ? "پیروزی" : "شکست"}${h.detail ? ` · ${h.detail}` : ""}</div></div>`;
    }).join("");
}

/* ---------- ماهواره ---------- */
async function loadScanState() {
    try {
        const d = await apiGet("/api/satellite/scans");
        if (d && !d.error) scanState = d;
    } catch (e) {}
    return scanState;
}

function satCountryData(a) {
    return `<div class="sat-data">
        <div class="sat-row"><span>💰 درآمد روزانه</span><b>${formatMoney(a.income)}</b></div>
        <div class="sat-row"><span>🛡️ قدرت کل نظامی</span><b>${formatNumber(a.power)}</b></div>
        ${(a.locations || []).map(l => `<div class="sat-loc"><div class="sat-row"><span>📍 ${l.name}</span><b>${formatNumber(l.count)} یگان</b></div>
            <div class="wf-loc-chips">${unitChips(l.units)}</div></div>`).join("")}
    </div>`;
}

async function renderSatTab() {
    const root = document.getElementById("war-sat-root");
    if (!root) return;
    if (!player?.satellite_built) {
        const cost = player?.infra?.satellite?.next?.cost ?? 6000000;
        root.innerHTML = `<div class="sat-locked"><div class="sat-lock-ic">🔒</div><b>ماهواره ساخته نشده</b>
            <p>برای باز شدن این بخش، در زیرساخت › استراتژی «ماهواره» را به قیمت ${formatMoney(cost)} بسازید.</p>
            <button class="wf-send-btn" id="sat-go-infra">رفتن به زیرساخت</button></div>`;
        root.querySelector("#sat-go-infra").onclick = async () => { await openInfrastructureMenu(); renderInfraTab("strategy"); };
        return;
    }
    await loadScanState();
    const sc = scanState;
    const eligible = Object.entries(COUNTRY_NAMES).filter(([cid]) => cid !== selectedCountry && countries[cid]?.taken);
    const sites = Object.entries(sc.sites || {});
    root.innerHTML = `
        <div class="sat-top"><div class="sat-count"><small>اسکن موجود</small><b>${formatNumber(sc.scans)}</b></div>
            <button class="wf-send-btn sat-launch" id="sat-launch">🚀 پرتاب ماهواره · ${formatMoney(1000000)}<small>+۵ اسکن</small></button></div>
        <div class="wf-section"><span>🌐 اسکن کشور</span><small>${formatMoney(1100000)} + ۱ اسکن</small></div>
        <div class="sat-note">با اسکن هر کشور، تا ۲۴ ساعت درآمد روزانه، قدرت کل نظامی و محل نیروهایش زنده نمایش داده می‌شود.</div>
        ${eligible.length ? eligible.map(([cid, nm]) => {
            const a = sc.countries?.[cid];
            return `<div class="sat-country"><div class="sat-c-top">${flagInline(cid)}<b>${nm}</b>
                ${a ? `<span class="sat-live">زنده · ${timeLeft(a.expires_at)}</span>` : `<button class="war-attack-button sat-scan" data-c="${cid}">اسکن</button>`}</div>
                ${a ? satCountryData(a) : ""}</div>`;
        }).join("") : `<div class="diplomacy-item-empty">کشوری با بازیکن فعال نیست.</div>`}
        <div class="wf-section"><span>📍 اسکن مکان‌ها</span></div>
        <div class="sat-note">برای اسکن یک سکو، معدن یا تنگه، روی نقشه روی آن بزن و «اسکن» را انتخاب کن. هر اسکن ۱ اسکن مصرف می‌کند و ۲۴ ساعت زنده می‌ماند.</div>
        ${sites.length ? sites.map(([id, v]) => `<div class="sat-site"><span>${siteLabel(id)}</span>
            <b>${v.owner ? `${COUNTRY_NAMES[v.owner] || v.owner} · قدرت ${formatNumber(v.power)}` : "بی‌صاحب"}</b>
            <small>${timeLeft(v.expires_at)}</small></div>`).join("") : `<div class="diplomacy-item-empty">اسکن فعالی نیست.</div>`}`;

    const act = async (path, body) => {
        try {
            const d = await apiPost(path, body);
            if (!d.success) { showToast(d.message || "خطا"); return; }
            showToast(d.message);
            if (d.player) { player = d.player; updateHomeStats(); }
            renderSatTab();
        } catch (e) { showToast("خطا."); }
    };
    root.querySelector("#sat-launch").onclick = () => act("/api/satellite/launch", {});
    root.querySelectorAll(".sat-scan").forEach(b => b.onclick = () => act("/api/satellite/scan-country", { country: b.dataset.c }));
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
        else if (page === "communications") { resetNewsFilter(); loadAnnouncements(); loadUnion(); loadNews(); refreshNotificationBadge(); }
        else if (page === "market") { loadMarketListings(); loadMyListings(); }
    });
});

/* =========================================================
   پنل مدیریت اختصاصی مدیر اصلی
========================================================= */
const ADMIN_TELEGRAM_ID = 8290076602;
let adminOverviewCache = null;
let adminSelectedPlayerId = null;
const adminCountryLabels = {germany:"آلمان",britain:"بریتانیا",ussr:"شوروی",usa:"آمریکا",france:"فرانسه",italy:"ایتالیا",china:"چین",japan:"ژاپن"};
const isAdminAccount = Number(userId) === ADMIN_TELEGRAM_ID;
const adminMenuButton = document.getElementById("open-admin-menu");
if (adminMenuButton) adminMenuButton.classList.toggle("hidden", !isAdminAccount);

/* راهنمای شروع: فقط بار اول خودکار نمایش داده می‌شود */
const guideModal = document.getElementById("guide-modal");
const guideSeenKey = () => `fl93_guide_seen_${userId || "guest"}`;
function openGuide() { guideModal?.classList.remove("hidden"); }
function closeGuide() {
    guideModal?.classList.add("hidden");
    try { localStorage.setItem(guideSeenKey(), "1"); } catch (e) {}
}
function maybeShowGuide() {
    let seen = false;
    try { seen = localStorage.getItem(guideSeenKey()) === "1"; } catch (e) {}
    if (!seen) openGuide();
}
document.getElementById("guide-close")?.addEventListener("click", closeGuide);
guideModal?.addEventListener("click", (event) => { if (event.target === guideModal) closeGuide(); });

const gameMenuButton = document.getElementById("game-menu-button");
const gameMenuPanel = document.getElementById("game-menu-panel");
function closeGameMenu() { gameMenuPanel?.classList.add("hidden"); }
gameMenuButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!gameMenuPanel) return;
    gameMenuPanel.classList.toggle("hidden");
});
gameMenuPanel?.addEventListener("click", async (event) => {
    const item = event.target.closest("[data-menu-page], #open-admin-menu, #open-guide-menu");
    if (!item) return;
    closeGameMenu();
    if (item.id === "open-guide-menu") { openGuide(); return; }
    if (item.id === "open-admin-menu") {
        if (!isAdminAccount) { showToast("دسترسی ندارید.", "error"); return; }
        showGamePage("admin"); await loadAdminPanel(); return;
    }
    const page = item.dataset.menuPage;
    showGamePage(page);
    if (page === "map") setTimeout(() => initWorldMap(), 30);
    else if (page === "communications") { resetNewsFilter(); loadAnnouncements(); loadUnion(); loadNews(); }
    else if (page === "home") updateHomeStats();
});
document.addEventListener("click", (event) => {
    if (gameMenuPanel && !gameMenuPanel.classList.contains("hidden") && !gameMenuPanel.contains(event.target) && event.target !== gameMenuButton) closeGameMenu();
});

function adminFormatNumber(value) { return Math.round(Number(value || 0)).toLocaleString("en-US"); }
function adminPlayerName(player) {
    const full = [player.telegram_first_name, player.telegram_last_name].filter(Boolean).join(" ").trim();
    if (full) return full;
    return player.telegram_username ? "@" + player.telegram_username : "نام ثبت نشده";
}
function adminPlayerIsActive(player) {
    const t = player.last_seen_at ? Date.parse(player.last_seen_at) : 0;
    return !!t && Number.isFinite(t) && Date.now() - t <= 15 * 60 * 1000;
}
function adminRelativeTime(value) {
    if (!value) return "هنوز ثبت نشده";
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return "نامشخص";
    const minutes = Math.max(0, Math.floor((Date.now() - ms) / 60000));
    if (minutes < 1) return "همین الان";
    if (minutes < 60) return `${adminFormatNumber(minutes)} دقیقه پیش`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${adminFormatNumber(hours)} ساعت پیش`;
    return `${adminFormatNumber(Math.floor(hours / 24))} روز پیش`;
}
function adminPlayerMatches(player, q) {
    if (!q) return true;
    const haystack = [player.user_id, player.country_name, player.country, player.telegram_first_name,
        player.telegram_last_name, player.telegram_name, player.telegram_username ? "@" + player.telegram_username : "",
        player.telegram_username, player.telegram_language_code].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q.toLowerCase().replace(/^@/, "")) || haystack.includes(q.toLowerCase());
}
async function loadAdminPanel() {
    if (!isAdminAccount) { showGamePage("home"); showToast("این بخش فقط برای مدیر اصلی است.", "error"); return; }
    const error = document.getElementById("admin-access-error");
    error?.classList.add("hidden");
    const list = document.getElementById("admin-player-list");
    if (list && !adminOverviewCache) list.innerHTML = `<div class="admin-empty"><span class="admin-loader"></span>در حال دریافت اطلاعات بازی…</div>`;
    try {
        const data = await apiGet("/api/admin/overview");
        if (!data?.success) {
            if (error) { error.textContent = data?.message || (data?.error === "forbidden" ? "دسترسی به پنل مدیریت رد شد." : "احراز هویت تلگرام تأیید نشد؛ بازی را از داخل تلگرام باز کن."); error.classList.remove("hidden"); }
            if (list) list.innerHTML = `<div class="admin-empty">اطلاعات مدیریت دریافت نشد.</div>`;
            return;
        }
        adminOverviewCache = data;
        renderAdminOverview();
    } catch (e) {
        if (error) { error.textContent = "ارتباط با سرور برقرار نشد. دوباره تلاش کن."; error.classList.remove("hidden"); }
        if (list) list.innerHTML = `<div class="admin-empty">خطا در دریافت اطلاعات.</div>`;
    }
}
function renderAdminOverview() {
    if (!adminOverviewCache) return;
    const data = adminOverviewCache;
    const playersList = data.players || [];
    const el = id => document.getElementById(id);
    if (el("admin-total-players")) el("admin-total-players").textContent = adminFormatNumber(playersList.length);
    if (el("admin-country-count")) el("admin-country-count").textContent = adminFormatNumber(data.countries_taken || 0);
    if (el("admin-total-money")) el("admin-total-money").textContent = "$" + adminFormatNumber(data.total_money || 0);
    if (el("admin-total-income")) el("admin-total-income").textContent = "$" + adminFormatNumber(data.total_daily_income || 0);
    if (el("admin-active-count")) el("admin-active-count").textContent = adminFormatNumber(data.active_count || 0);
    if (el("admin-vip-count")) el("admin-vip-count").textContent = adminFormatNumber(data.vip_count || 0);
    if (el("admin-player-count")) el("admin-player-count").textContent = adminFormatNumber(playersList.length);
    const q = el("admin-player-search")?.value?.trim() || "";
    const filter = el("admin-player-filter")?.value || "all";
    const list = el("admin-player-list");
    const filtered = playersList.filter(p => {
        if (!adminPlayerMatches(p, q)) return false;
        if (filter === "countryless" && p.country) return false;
        if (filter === "vip" && !p.vip) return false;
        if (filter === "eliminated" && !p.is_eliminated) return false;
        if (filter === "active" && !adminPlayerIsActive(p)) return false;
        return true;
    });
    if (el("admin-filter-result")) el("admin-filter-result").textContent = `${adminFormatNumber(filtered.length)} از ${adminFormatNumber(playersList.length)}`;
    if (list) {
        if (!filtered.length) list.innerHTML = `<div class="admin-empty">بازیکنی مطابق جستجو و فیلتر پیدا نشد.</div>`;
        else list.innerHTML = filtered.map(p => {
            const name = adminPlayerName(p);
            const handle = p.telegram_username ? "@" + p.telegram_username : "نام کاربری ثبت نشده";
            const stateTags = [p.vip ? "VIP" : "", p.is_eliminated ? "حذف‌شده" : "", adminPlayerIsActive(p) ? "فعال" : ""].filter(Boolean).join(" · ");
            return `<div role="button" tabindex="0" class="admin-player-row ${Number(adminSelectedPlayerId) === Number(p.user_id) ? "selected" : ""} ${p.is_eliminated ? "eliminated" : ""}" data-admin-player="${p.user_id}"><span class="admin-player-flag">${escapeHtml(p.country_flag || "🌐")}</span><span class="admin-player-main"><b>${escapeHtml(name)}</b><small class="admin-player-handle">${escapeHtml(handle)}</small><small class="admin-player-id">آیدی تلگرام: <strong>${p.user_id}</strong> <button type="button" class="admin-copy-id" data-admin-copy-id="${p.user_id}" title="کپی آیدی">کپی</button></small><small>${escapeHtml(p.country_name || "بدون کشور")}${stateTags ? " · " + escapeHtml(stateTags) : ""}</small></span><span class="admin-player-metrics"><b>$${adminFormatNumber(p.money)}</b><small>نیرو ${adminFormatNumber(p.manpower)}</small><small>${escapeHtml(adminRelativeTime(p.last_seen_at))}</small></span><span class="admin-player-chevron">›</span></div>`;
        }).join("");
    }
    const selected = playersList.find(p => Number(p.user_id) === Number(adminSelectedPlayerId));
    if (selected) renderAdminPlayerEditor(selected);
    else { el("admin-player-editor")?.classList.add("hidden"); }
    const news = el("admin-recent-news");
    if (news) {
        const items = data.recent_news || [];
        news.innerHTML = items.length ? items.map(n => `<article class="admin-news-row"><span class="admin-news-dot"></span><div><b>${escapeHtml(n.title || "خبر")}</b><p>${escapeHtml(n.text || "")}</p><small>${escapeHtml(n.at ? new Date(n.at).toLocaleString("fa-IR") : "")}</small></div></article>`).join("") : `<div class="admin-empty">هنوز خبری ثبت نشده است.</div>`;
    }
    const audit = el("admin-audit-list");
    if (audit) {
        const actions = data.admin_audit || [];
        audit.innerHTML = actions.length ? actions.map(a => `<article class="admin-audit-row"><span class="admin-audit-icon">${a.target_user_id ? "👤" : "⚙️"}</span><div class="admin-audit-copy"><b>${escapeHtml(a.action || "عملیات مدیریت")}</b><p>${escapeHtml(a.detail || "")}</p><small>${a.target_user_id ? `آیدی بازیکن: ${a.target_user_id} · ` : ""}${escapeHtml(a.at ? new Date(a.at).toLocaleString("fa-IR") : "")}</small></div></article>`).join("") : `<div class="admin-empty">هنوز عملیات مدیریتی ثبت نشده است.</div>`;
    }
}
function renderAdminPlayerEditor(p) {
    const el = id => document.getElementById(id);
    el("admin-player-editor")?.classList.remove("hidden");
    if (el("admin-editor-title")) el("admin-editor-title").textContent = `${p.country_flag || "🌐"} ${adminPlayerName(p)}`;
    if (el("admin-editor-subtitle")) el("admin-editor-subtitle").textContent = `${p.country_name || "بدون کشور"} · درآمد خالص روزانه: $${adminFormatNumber(p.daily_income)}`;
    const identity = el("admin-identity-card");
    if (identity) identity.innerHTML = `<div class="admin-identity-main"><span class="admin-identity-avatar">${escapeHtml((adminPlayerName(p).trim()[0] || "👤"))}</span><div><b>${escapeHtml(adminPlayerName(p))}</b><small>${p.telegram_username ? "@" + escapeHtml(p.telegram_username) : "نام کاربری تلگرام ثبت نشده"}</small></div></div><div class="admin-identity-id"><span>آیدی عددی تلگرام</span><strong>${p.user_id}</strong><button type="button" class="admin-copy-id" data-admin-copy-id="${p.user_id}">کپی آیدی</button></div><div class="admin-identity-meta"><span>آخرین فعالیت: ${escapeHtml(adminRelativeTime(p.last_seen_at))}</span><span>زبان: ${escapeHtml(p.telegram_language_code || "نامشخص")}</span><span>وضعیت: ${p.is_eliminated ? "حذف‌شده" : (adminPlayerIsActive(p) ? "فعال" : "غیرفعال")}</span></div>`;
    for (const key of ["money", "manpower"]) if (el(`admin-edit-${key}`)) el(`admin-edit-${key}`).value = Number(p[key] || 0);
    for (const key of ["food", "steel", "uranium", "oil"]) if (el(`admin-edit-${key}`)) el(`admin-edit-${key}`).value = Number(p.resources?.[key] || 0);
    if (el("admin-edit-country")) el("admin-edit-country").value = p.country || "";
    const vip = el("admin-toggle-vip"); if (vip) { vip.textContent = p.vip ? "✓ غیرفعال‌کردن VIP" : "✦ فعال‌کردن VIP"; vip.classList.toggle("enabled", !!p.vip); }
    const out = el("admin-toggle-eliminated"); if (out) { out.textContent = p.is_eliminated ? "↩ بازگرداندن بازیکن" : "⛔ حذف بازیکن از بازی"; out.classList.toggle("danger", !p.is_eliminated); }
}
async function adminApplyPlayerChange(field, value) {
    if (!isAdminAccount || adminSelectedPlayerId == null) return;
    try {
        const result = await apiPost("/api/admin/player/update", { user_id: Number(adminSelectedPlayerId), field, value });
        if (!result?.success) { showToast(result?.message || "تغییر ذخیره نشد.", "error"); return; }
        showToast(result.message || "ذخیره شد.", "success");
        await loadAdminPanel();
    } catch (e) { showToast("ارتباط با سرور برقرار نشد.", "error"); }
}
async function adminAdjustSelectedPlayer(operation) {
    if (!isAdminAccount || adminSelectedPlayerId == null) { showToast("ابتدا یک بازیکن را انتخاب کن.", "error"); return; }
    const field = document.getElementById("admin-adjust-field")?.value || "money";
    const amount = Number(document.getElementById("admin-adjust-amount")?.value);
    if (!Number.isSafeInteger(amount) || amount <= 0) { showToast("مقدار باید عدد صحیح و بزرگ‌تر از صفر باشد.", "error"); return; }
    if (operation === "subtract" && !confirm("از موجودی انتخاب‌شده کسر شود؟")) return;
    try {
        const result = await apiPost("/api/admin/player/adjust", { user_id: Number(adminSelectedPlayerId), field, amount, operation });
        if (!result?.success) { showToast(result?.message || "تغییر ذخیره نشد.", "error"); return; }
        showToast(result.message, "success");
        document.getElementById("admin-adjust-amount").value = "";
        await loadAdminPanel();
    } catch (e) { showToast("خطا در تغییر موجودی.", "error"); }
}
async function adminCopyId(value) {
    try {
        await navigator.clipboard.writeText(String(value));
        showToast(`آیدی ${value} کپی شد.`, "success");
    } catch {
        const input = document.createElement("textarea"); input.value = String(value); input.style.position = "fixed"; input.style.opacity = "0";
        document.body.appendChild(input); input.select();
        const ok = document.execCommand("copy"); input.remove();
        showToast(ok ? `آیدی ${value} کپی شد.` : `آیدی کاربر: ${value}`, ok ? "success" : "error");
    }
}
document.getElementById("admin-refresh")?.addEventListener("click", () => loadAdminPanel());
document.getElementById("admin-player-search")?.addEventListener("input", () => renderAdminOverview());
document.getElementById("admin-player-filter")?.addEventListener("change", () => renderAdminOverview());
document.getElementById("admin-clear-search")?.addEventListener("click", () => { const x=document.getElementById("admin-player-search"); if(x){x.value="";x.focus();} renderAdminOverview(); });
document.getElementById("admin-player-list")?.addEventListener("click", event => {
    const copy = event.target.closest("[data-admin-copy-id]");
    if (copy) { event.stopPropagation(); adminCopyId(copy.dataset.adminCopyId); return; }
    const row = event.target.closest("[data-admin-player]"); if (!row) return;
    adminSelectedPlayerId = Number(row.dataset.adminPlayer); renderAdminOverview();
    document.getElementById("admin-player-editor")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
document.getElementById("admin-player-list")?.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-admin-player]")) { event.preventDefault(); adminSelectedPlayerId = Number(event.target.dataset.adminPlayer); renderAdminOverview(); }
});
document.getElementById("admin-identity-card")?.addEventListener("click", event => { const copy=event.target.closest("[data-admin-copy-id]"); if(copy) adminCopyId(copy.dataset.adminCopyId); });
document.querySelectorAll("[data-admin-save]").forEach(button => button.addEventListener("click", () => {
    const field = button.dataset.adminSave;
    const fieldEl = document.getElementById(`admin-edit-${field}`);
    const value = field === "country" ? (fieldEl?.value || "") : Number(fieldEl?.value);
    if (field !== "country" && (!Number.isFinite(value) || value < 0 || !Number.isInteger(value))) { showToast("یک عدد صحیح و صفر یا بیشتر وارد کن.", "error"); return; }
    if (field === "country" && value && !confirm("کشور بازیکن تغییر کند؟")) return;
    adminApplyPlayerChange(field, value);
}));
document.querySelectorAll("[data-admin-toggle]").forEach(button => button.addEventListener("click", () => {
    const p = adminOverviewCache?.players?.find(x => Number(x.user_id) === Number(adminSelectedPlayerId));
    if (!p) return;
    const field = button.dataset.adminToggle;
    if (field === "is_eliminated" && !p.is_eliminated && !confirm("این بازیکن از بازی حذف شود؟")) return;
    if (field === "vip" && !p.vip && !confirm("VIP برای این بازیکن فعال شود؟")) return;
    adminApplyPlayerChange(field, !p[field]);
}));
document.getElementById("admin-adjust-add")?.addEventListener("click", () => adminAdjustSelectedPlayer("add"));
document.getElementById("admin-adjust-subtract")?.addEventListener("click", () => adminAdjustSelectedPlayer("subtract"));
document.getElementById("admin-send-player-message")?.addEventListener("click", async () => {
    if (!isAdminAccount || adminSelectedPlayerId == null) { showToast("ابتدا یک بازیکن را انتخاب کن.", "error"); return; }
    const textarea = document.getElementById("admin-player-message-text"); const text = textarea?.value?.trim() || "";
    if (!text) { showToast("متن پیام را وارد کن.", "error"); return; }
    if (!confirm("پیام مستقیم برای این بازیکن ارسال شود؟")) return;
    const button = document.getElementById("admin-send-player-message"); if (button) { button.disabled = true; button.textContent = "در حال ارسال…"; }
    try {
        const result = await apiPost("/api/admin/player/message", { user_id: Number(adminSelectedPlayerId), text });
        if (!result?.success) showToast(result?.message || "ارسال پیام ناموفق بود.", "error");
        else { showToast(result.message || "پیام ارسال شد.", "success"); textarea.value = ""; await loadAdminPanel(); }
    } catch { showToast("ارتباط با سرور برقرار نشد.", "error"); }
    finally { if (button) { button.disabled = false; button.textContent = "✉️ ارسال پیام"; } }
});
document.querySelectorAll("[data-admin-tab]").forEach(button => button.addEventListener("click", () => {
    const tab = button.dataset.adminTab;
    document.querySelectorAll("[data-admin-tab]").forEach(b => b.classList.toggle("active", b === button));
    document.querySelectorAll(".admin-panel").forEach(panel => panel.classList.toggle("hidden", panel.id !== `admin-panel-${tab}`));
}));
document.getElementById("admin-bulk-scope")?.addEventListener("change", event => document.getElementById("admin-bulk-country-wrap")?.classList.toggle("hidden", event.target.value !== "country"));
document.getElementById("admin-jump-players")?.addEventListener("click", () => document.querySelector('[data-admin-tab="players"]')?.click());
document.getElementById("admin-bulk-adjust-form")?.addEventListener("submit", async event => {
    event.preventDefault(); if (!isAdminAccount) return;
    const scope = document.getElementById("admin-bulk-scope")?.value || "all";
    const country = document.getElementById("admin-bulk-country")?.value || "germany";
    const field = document.getElementById("admin-bulk-field")?.value || "money";
    const operation = document.getElementById("admin-bulk-operation")?.value || "add";
    const amount = Number(document.getElementById("admin-bulk-amount")?.value);
    if (!Number.isSafeInteger(amount) || amount <= 0) { showToast("مقدار باید عدد صحیح و مثبت باشد.", "error"); return; }
    const scopeText = scope === "all" ? "همهٔ بازیکنان" : (adminCountryLabels[country] || country);
    if (!confirm(`${operation === "add" ? "افزودن" : "کسر"} ${adminFormatNumber(amount)} از ${field} برای ${scopeText} انجام شود؟`)) return;
    const button = event.currentTarget.querySelector('[type="submit"]'); if (button) { button.disabled = true; button.textContent = "در حال اجرا…"; }
    try {
        const result = await apiPost("/api/admin/bulk-adjust", { scope, country, field, operation, amount });
        if (!result?.success) showToast(result?.message || "عملیات انجام نشد.", "error");
        else { showToast(`${result.message} موفق: ${result.changed}، ردشده: ${result.skipped}`, result.skipped ? "error" : "success"); document.getElementById("admin-bulk-amount").value = ""; await loadAdminPanel(); }
    } catch { showToast("خطا در اجرای تغییر گروهی.", "error"); }
    finally { if (button) { button.disabled = false; button.textContent = "⚖️ اجرای تغییر گروهی"; } }
});
function renderAdminBroadcastPreview() {
    const title = document.getElementById("admin-broadcast-title")?.value?.trim() || "عنوان خبر اینجا نمایش داده می‌شود";
    const body = document.getElementById("admin-broadcast-text")?.value?.trim() || "متن پیام را وارد کن تا پیش‌نمایش دیده شود.";
    const t = document.getElementById("admin-broadcast-preview-title"); const b = document.getElementById("admin-broadcast-preview-text");
    if (t) t.textContent = title; if (b) b.textContent = body;
}
document.getElementById("admin-broadcast-title")?.addEventListener("input", renderAdminBroadcastPreview);
document.getElementById("admin-broadcast-text")?.addEventListener("input", renderAdminBroadcastPreview);
document.getElementById("admin-broadcast-form")?.addEventListener("submit", async event => {
    event.preventDefault(); if (!isAdminAccount) return;
    const title = document.getElementById("admin-broadcast-title")?.value?.trim() || "";
    const text = document.getElementById("admin-broadcast-text")?.value?.trim() || "";
    if (!title || !text) { showToast("عنوان و متن خبر را وارد کن.", "error"); return; }
    if (!confirm("خبر برای همهٔ بازیکنان ارسال شود؟")) return;
    const button = event.currentTarget.querySelector("[type=submit]");
    if (button) { button.disabled = true; button.textContent = "در حال ارسال…"; }
    try {
        const result = await apiPost("/api/admin/broadcast", { title, text });
        if (!result?.success) showToast(result?.message || "خبر ارسال نشد.", "error");
        else { showToast(`خبر ثبت شد؛ ارسال موفق: ${result.sent}، ناموفق: ${result.failed}`, result.failed ? "error" : "success"); event.currentTarget.reset(); renderAdminBroadcastPreview(); await loadAdminPanel(); document.querySelector('[data-admin-tab="activity"]')?.click(); }
    } catch (e) { showToast("خطا در ارسال خبر.", "error"); }
    finally { if (button) { button.disabled = false; button.textContent = "📣 ارسال به همهٔ بازیکنان"; } }
});

// هدر همراه اسکرول صفحه به‌آرامی از قاب خارج می‌شود؛ بدون تأخیر و جمع‌شدن ناگهانی.
const gameShellForHeader = document.getElementById("game");
const gameHeaderForScroll = document.querySelector("#game .game-header");
document.querySelectorAll("#game .game-page").forEach(page => {
    page.addEventListener("scroll", () => {
        if (!gameHeaderForScroll || gameShellForHeader?.classList.contains("booting")) return;
        const travel = Math.min(Math.max(0, page.scrollTop || 0), gameHeaderForScroll.offsetHeight || 78);
        gameHeaderForScroll.style.transform = `translate3d(0, ${-travel}px, 0)`;
    }, { passive: true });
});

// راهنمای بازار جهانی فقط با زدن علامت سؤال نمایش داده می‌شود.
const marketHelpButton = document.getElementById("market-help-btn");
if (marketHelpButton) marketHelpButton.addEventListener("click", () => {
    const ov = document.createElement("div");
    ov.className = "modal-overlay market-help-overlay";
    ov.innerHTML = `<section class="modal-box market-help-dialog" role="dialog" aria-modal="true" aria-labelledby="market-help-title">
        <div class="ann-modal-head"><div><span class="ann-modal-kicker">راهنمای کوتاه</span><h2 class="modal-title" id="market-help-title">🌐 بازار جهانی چطور کار می‌کند؟</h2></div><button type="button" class="ann-modal-close" aria-label="بستن">×</button></div>
        <div class="market-help-content"><p>در بازار جهانی می‌توانی از کشورهای دیگر منابع بخری یا آگهی فروش ثبت کنی.</p><div><b>🛒 کالاها</b><span>آگهی‌های خرید و فروش بازیکنان را ببین و پیشنهاد مناسب را انتخاب کن.</span></div><div><b>🔁 مبادله</b><span>منبع، مقدار و چیزی را که در ازایش می‌خواهی مشخص کن و آگهی ثبت کن.</span></div><div><b>🚚 هزینهٔ حمل</b><span>هزینهٔ حمل‌ونقل را کشوری می‌پردازد که کالا به آن می‌رسد.</span></div><div><b>📦 معاملات من</b><span>آگهی‌ها و معامله‌های خودت را پیگیری کن.</span></div></div>
        <button type="button" class="ann-publish-button market-help-close">متوجه شدم</button></section>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector(".ann-modal-close").onclick = close;
    ov.querySelector(".market-help-close").onclick = close;
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
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
        if (tid === "comm-announcements") { loadAnnouncements(); loadAnnouncementStatus(true); }
        else if (tid === "comm-unions") loadUnion();
        else if (tid === "comm-news") { resetNewsFilter(); loadNews(); }
        else if (tid === "comm-contacts") openPmHome();
    });
});

/* =========================================================
   Announcements
========================================================= */
document.getElementById("ann-submit").addEventListener("click", openAnnouncementComposer);
document.getElementById("ann-help")?.addEventListener("click", openAnnouncementHelp);

const announcementCache = new Map();
const ANNOUNCEMENT_COSTS = [0, 0, 10000, 400000];
const ANNOUNCEMENT_LIMIT = 20000;
const ANNOUNCEMENT_SLOT_NAMES = ["اول", "دوم", "سوم", "چهارم"];
const announcementCurrency = amount => amount ? `${formatNumber(amount)}$` : "رایگان";
let announcementStatusState = null;
let announcementCooldownUntil = 0;
let announcementResetAt = 0;
let announcementCountdownInterval = null;
let announcementStatusRefreshing = false;
let announcementNeedsCooldownRefresh = false;
let announcementNeedsResetRefresh = false;

function announcementFormatCountdown(seconds) {
    const sec = Math.max(0, Math.floor(seconds));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map(v => String(v).padStart(2, "0")).join(":").replace(/[0-9]/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

function renderAnnouncementStatus() {
    const button = document.getElementById("ann-submit");
    const timer = document.getElementById("ann-timer");
    if (!button || !timer || !announcementStatusState) return;
    const now = Date.now();
    const count = Number(announcementStatusState.count || 0);
    if (count >= 4) {
        button.disabled = true;
        const remaining = Math.ceil((announcementResetAt - now) / 1000);
        timer.classList.remove("hidden");
        if (remaining <= 0) {
            timer.textContent = "در حال تازه‌سازی سهمیه…";
            if (announcementNeedsResetRefresh && !announcementStatusRefreshing) {
                announcementNeedsResetRefresh = false;
                loadAnnouncementStatus(true);
            }
        } else {
            timer.textContent = `سهمیهٔ بعدی تا ${announcementFormatCountdown(remaining)}`;
        }
        return;
    }
    const cooldown = Math.ceil((announcementCooldownUntil - now) / 1000);
    if (cooldown > 0) {
        button.disabled = true;
        timer.classList.remove("hidden");
        timer.textContent = `بیانیهٔ بعدی تا ${announcementFormatCountdown(cooldown)}`;
    } else {
        button.disabled = false;
        timer.classList.add("hidden");
        timer.textContent = "";
        if (announcementNeedsCooldownRefresh && !announcementStatusRefreshing) {
            announcementNeedsCooldownRefresh = false;
            loadAnnouncementStatus(true);
        }
    }
}

async function loadAnnouncementStatus(silent = false) {
    if (announcementStatusRefreshing) return;
    announcementStatusRefreshing = true;
    try {
        const status = await apiGet("/api/announcements/status");
        if (!status?.success) {
            if (!silent) showToast(status?.message || "وضعیت انتشار بیانیه دریافت نشد.", "error");
            return;
        }
        announcementStatusState = status;
        announcementCooldownUntil = Date.now() + Math.max(0, Number(status.cooldown_seconds || 0)) * 1000;
        announcementResetAt = Date.now() + Math.max(0, Number(status.reset_seconds || 0)) * 1000;
        announcementNeedsCooldownRefresh = Number(status.cooldown_seconds || 0) > 0;
        announcementNeedsResetRefresh = Number(status.count || 0) >= 4;
        renderAnnouncementStatus();
        if (!announcementCountdownInterval) {
            announcementCountdownInterval = setInterval(renderAnnouncementStatus, 1000);
        }
    } catch (e) {
        if (!silent) showToast("وضعیت انتشار بیانیه دریافت نشد.", "error");
    } finally {
        announcementStatusRefreshing = false;
    }
}

function openAnnouncementHelp() {
    const ov = document.createElement("div");
    ov.className = "modal-overlay ann-modal-overlay ann-help-overlay";
    ov.innerHTML = `
        <section class="modal-box ann-help-box" role="dialog" aria-modal="true" aria-labelledby="ann-help-title">
            <div class="ann-modal-head"><div><span class="ann-modal-kicker">راهنمای کوتاه</span><h2 class="modal-title" id="ann-help-title">قوانین انتشار بیانیه</h2></div><button class="ann-modal-close" type="button" aria-label="بستن">×</button></div>
            <div class="ann-help-content">
                <div class="ann-help-rule"><span class="ann-help-rule-icon">📅</span><div><strong>۴ بیانیه در روز</strong><p>سهمیه هر روز ساعت ۰۰:۰۰ دوباره فعال می‌شود.</p></div></div>
                <div class="ann-help-rule"><span class="ann-help-rule-icon">⏱️</span><div><strong>فاصلهٔ یک‌ساعته</strong><p>بین انتشار هر بیانیه باید یک ساعت کامل فاصله باشد. زمان باقی‌مانده کنار دکمه نشان داده می‌شود.</p></div></div>
                <div class="ann-help-rule"><span class="ann-help-rule-icon">💰</span><div><strong>هزینهٔ روزانه</strong><p>بیانیهٔ اول و دوم رایگان است؛ بیانیهٔ سوم ۱۰٬۰۰۰ دلار و بیانیهٔ چهارم ۴۰۰٬۰۰۰ دلار هزینه دارد.</p></div></div>
                <div class="ann-help-rule"><span class="ann-help-rule-icon">✍️</span><div><strong>متن بیانیه</strong><p>هر بیانیه می‌تواند حداکثر ۲۰٬۰۰۰ حرف داشته باشد.</p></div></div>
            </div>
            <div class="ann-modal-actions"><button type="button" class="ann-publish-button ann-help-close">متوجه شدم</button></div>
        </section>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector(".ann-modal-close").onclick = close;
    ov.querySelector(".ann-help-close").onclick = close;
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
}

async function openAnnouncementComposer() {
    if (!announcementStatusState) await loadAnnouncementStatus(true);
    let status = announcementStatusState;
    try { status = await apiGet("/api/announcements/status"); announcementStatusState = status; }
    catch (e) { showToast("وضعیت انتشار بیانیه دریافت نشد.", "error"); return; }
    if (!status?.success) { showToast(status?.message || "برای انتشار، ابتدا کشور انتخاب کنید.", "error"); return; }
    announcementCooldownUntil = Date.now() + Math.max(0, Number(status.cooldown_seconds || 0)) * 1000;
    announcementResetAt = Date.now() + Math.max(0, Number(status.reset_seconds || 0)) * 1000;
    announcementNeedsCooldownRefresh = Number(status.cooldown_seconds || 0) > 0;
    announcementNeedsResetRefresh = Number(status.count || 0) >= 4;
    renderAnnouncementStatus();
    if (status.count >= 4) { showToast("سهمیهٔ روزانه تمام شده است؛ پس از نیمه‌شب دوباره فعال می‌شود.", "error"); return; }
    if (Number(status.cooldown_seconds || 0) > 0) {
        showToast(`برای بیانیهٔ بعدی ${Math.ceil(status.cooldown_seconds / 60)} دقیقه دیگر صبر کنید.`, "error");
        return;
    }

    const currentSlot = Math.min(4, (status.count || 0) + 1);
    const currentCost = status.next_cost ?? ANNOUNCEMENT_COSTS[currentSlot - 1] ?? 0;
    const ov = document.createElement("div");
    ov.className = "modal-overlay ann-modal-overlay";
    ov.innerHTML = `
        <section class="modal-box ann-composer-box" role="dialog" aria-modal="true" aria-labelledby="ann-composer-title">
            <div class="ann-modal-head"><div><span class="ann-modal-kicker">بیانیهٔ رسمی کشور</span><h2 class="modal-title" id="ann-composer-title">بیانیهٔ جدید</h2></div><button class="ann-modal-close" type="button" aria-label="بستن">×</button></div>
            <textarea id="ann-composer-text" class="ann-input ann-composer-text" maxlength="${ANNOUNCEMENT_LIMIT}" placeholder="متن بیانیه را بنویسید…" aria-label="متن بیانیه"></textarea>
            <div class="ann-composer-meta"><span id="ann-char-count">۰ / ۲۰٬۰۰۰</span><span>نوبت ${ANNOUNCEMENT_SLOT_NAMES[currentSlot - 1]} انتشار</span></div>
            <div class="ann-modal-actions"><button type="button" class="modal-cancel ann-modal-cancel">انصراف</button><button type="button" class="ann-publish-button" id="ann-publish-confirm">انتشار بیانیه · ${announcementCurrency(currentCost)}</button></div>
        </section>`;
    document.body.appendChild(ov);
    const input = ov.querySelector("#ann-composer-text");
    const counter = ov.querySelector("#ann-char-count");
    const publish = ov.querySelector("#ann-publish-confirm");
    const close = () => ov.remove();
    ov.querySelector(".ann-modal-close").onclick = close;
    ov.querySelector(".ann-modal-cancel").onclick = close;
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    input.addEventListener("input", () => { counter.textContent = `${input.value.length.toLocaleString("fa-IR")} / ${ANNOUNCEMENT_LIMIT.toLocaleString("fa-IR")}`; });
    publish.onclick = async () => {
        const text = input.value.trim();
        if (!text) { showToast("متن بیانیه را بنویسید.", "error"); input.focus(); return; }
        publish.disabled = true;
        publish.textContent = "در حال انتشار…";
        try {
            const d = await apiPost("/api/announcements/create", { text });
            if (!d.success) {
                showToast(d.message || "انتشار بیانیه انجام نشد.", "error");
                publish.disabled = false;
                publish.textContent = `انتشار بیانیه · ${announcementCurrency(currentCost)}`;
                await loadAnnouncementStatus(true);
                return;
            }
            close();
            showToast("بیانیه منتشر شد.", "success");
            await loadAnnouncementStatus(true);
            loadAnnouncements();
        } catch (e) {
            showToast("ارتباط با سرور برقرار نشد.", "error");
            publish.disabled = false;
            publish.textContent = `انتشار بیانیه · ${announcementCurrency(currentCost)}`;
        }
    };
    input.focus();
}

async function loadAnnouncements() {
    try {
        const list = await apiGet("/api/announcements");
        const c = document.getElementById("ann-list");
        if (!c) return;
        c.innerHTML = "";
        announcementCache.clear();
        if (!Array.isArray(list) || !list.length) {
            c.innerHTML = `<div class="diplomacy-item-empty">بیانیه‌ای منتشر نشده است.</div>`;
            return;
        }
        list.forEach(a => announcementCache.set(String(a.id), a));
        list.forEach(a => {
            const div = document.createElement("article");
            div.className = "ann-card";
            const support = Array.isArray(a.support) ? a.support : [];
            const accuse = Array.isArray(a.accuse) ? a.accuse : [];
            const totalReactions = support.length + accuse.length;
            const supportPercent = totalReactions ? (support.length / totalReactions) * 100 : 0;
            const accusePercent = totalReactions ? (accuse.length / totalReactions) * 100 : 0;
            const supportFlags = support.map(cid => flagInline(cid, true)).join(" ");
            const accuseFlags = accuse.map(cid => flagInline(cid, true)).join(" ");
            const own = !!a.is_mine || (!!player?.country && player.country === a.from_country);
            let reactionHtml;
            // برای بیانیهٔ خودتان و پس از ثبت واکنش، ردیف توضیح/قفل نمایش داده نمی‌شود.
            if (own || a.my_reaction) {
                reactionHtml = "";
            } else {
                reactionHtml = `
                    <button class="ann-react support" data-react="support" data-id="${escapeHtml(a.id)}">✓ حمایت <b>${support.length}</b></button>
                    <button class="ann-react accuse" data-react="accuse" data-id="${escapeHtml(a.id)}">❌ محکوم کردن <b>${accuse.length}</b></button>`;
            }
            const created = a.created_at ? new Date(a.created_at).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" }) : "";
            const statementText = String(a.text || "");
            const canExpand = statementText.length > 200;
            div.innerHTML = `
                <div class="ann-header">
                    <span class="ann-flag">${flagInline(a.from_country, true)}</span>
                    <div class="ann-author"><span class="ann-name">${escapeHtml(COUNTRY_NAMES[a.from_country] || a.from_country || "کشور ناشناس")}</span><time>${escapeHtml(created)}</time></div>
                    <span class="ann-official-tag">بیانیهٔ رسمی</span>
                </div>
                <div class="ann-text ${canExpand ? "is-collapsed" : ""}" data-ann-text>${escapeHtml(statementText)}</div>
                ${canExpand ? `<button type="button" class="ann-expand-button" aria-expanded="false">نمایش بیشتر <span>⌄</span></button>` : ""}
                ${reactionHtml ? `<div class="ann-reactions">${reactionHtml}</div>` : ""}
                <div class="ann-balance ${totalReactions ? "" : "is-empty"}" aria-label="نسبت حمایت و محکومیت">
                    <div class="ann-balance-track"><span class="ann-balance-support" style="width:${supportPercent.toFixed(2)}%"></span><span class="ann-balance-accuse" style="width:${accusePercent.toFixed(2)}%"></span></div>
                    <div class="ann-balance-legend"><span class="support-legend">● حمایت ${support.length.toLocaleString("fa-IR")}</span><span class="accuse-legend">● محکومیت ${accuse.length.toLocaleString("fa-IR")}</span></div>
                </div>
                ${(supportFlags || accuseFlags) ? `<div class="ann-flags">${supportFlags ? `<div class="ann-flags-row"><span>✅ حمایت</span> ${supportFlags}</div>` : ""}${accuseFlags ? `<div class="ann-flags-row"><span>⚑ محکومیت</span> ${accuseFlags}</div>` : ""}</div>` : ""}
                <div class="ann-card-footer"><button type="button" class="ann-reply-button" data-reply-ann="${escapeHtml(a.id)}">↩ پاسخ‌ها <span>${(a.comments || []).length}</span></button></div>`;
            c.appendChild(div);
        });
        c.querySelectorAll(".ann-react[data-react]").forEach(b => b.onclick = () => reactAnn(b.dataset.id, b.dataset.react));
        c.querySelectorAll(".ann-reply-button").forEach(b => b.onclick = () => openAnnouncementReply(b.dataset.replyAnn));
        c.querySelectorAll(".ann-expand-button").forEach(b => b.onclick = () => {
            const text = b.previousElementSibling;
            const expanded = text.classList.toggle("is-expanded");
            text.classList.toggle("is-collapsed", !expanded);
            b.setAttribute("aria-expanded", expanded ? "true" : "false");
            b.innerHTML = expanded ? `نمایش کمتر <span>⌃</span>` : `نمایش بیشتر <span>⌄</span>`;
        });
    } catch (e) { console.error("Announcements:", e); }
}

async function reactAnn(id, reaction) {
    try {
        const d = await apiPost("/api/announcements/react", { announcement_id: id, reaction });
        if (!d.success) { showToast(d.message || "امکان ثبت واکنش وجود ندارد.", "error"); return; }
        showToast("واکنش شما برای همیشه ثبت شد.", "success");
        await loadAnnouncements();
    } catch (e) { showToast("ارتباط با سرور برقرار نشد.", "error"); }
}

function renderAnnouncementThread(comments, parentId = null) {
    const childrenByParent = new Map();
    (Array.isArray(comments) ? comments : []).forEach(cm => {
        const key = cm.parent_id || "";
        if (!childrenByParent.has(key)) childrenByParent.set(key, []);
        childrenByParent.get(key).push(cm);
    });
    const renderChildren = (pid, depth, path = new Set()) => {
        const rows = childrenByParent.get(pid || "") || [];
        return rows.map(cm => {
            const id = String(cm.id || "");
            if (!id || path.has(id)) return "";
            const nextPath = new Set(path); nextPath.add(id);
            const cid = cm.from_country;
            const name = COUNTRY_NAMES[cid] || cid || "کشور";
            const time = cm.at ? new Date(cm.at).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" }) : "";
            return `<article class="ann-thread-comment" style="--thread-depth:${Math.min(depth, 5)}" data-comment-id="${escapeHtml(id)}">
                <div class="ann-thread-comment-head">${flagInline(cid, true)}<strong>${escapeHtml(name)}</strong><time>${escapeHtml(time)}</time></div>
                <div class="ann-thread-comment-text">${escapeHtml(cm.text || "")}</div>
                <div class="ann-thread-comment-actions"><button type="button" data-reply-to-comment="${escapeHtml(id)}" data-reply-to-name="${escapeHtml(name)}">↩ پاسخ</button></div>
                ${renderChildren(id, depth + 1, nextPath)}
            </article>`;
        }).join("");
    };
    return renderChildren(parentId, 0);
}

function openAnnouncementReply(id) {
    const announcement = announcementCache.get(String(id));
    const card = document.querySelector(`.ann-card [data-reply-ann="${CSS.escape(String(id))}"]`)?.closest(".ann-card");
    const title = announcement ? (COUNTRY_NAMES[announcement.from_country] || announcement.from_country) : (card?.querySelector(".ann-name")?.textContent || "بیانیه");
    if (!announcement) { showToast("بیانیه پیدا نشد؛ فهرست را تازه کنید.", "error"); return; }

    const ov = document.createElement("div");
    ov.className = "modal-overlay ann-modal-overlay ann-thread-overlay";
    ov.innerHTML = `
        <section class="modal-box ann-thread-box" role="dialog" aria-modal="true" aria-labelledby="ann-thread-title">
            <header class="ann-thread-head">
                <div class="ann-thread-grabber"></div>
                <div class="ann-modal-head"><div><span class="ann-modal-kicker">گفت‌وگوی دیپلماتیک</span><h2 class="modal-title" id="ann-thread-title">پاسخ‌ها و گفتگو</h2><p>بیانیهٔ ${escapeHtml(title)}</p></div><button class="ann-modal-close" type="button" aria-label="بستن">×</button></div>
            </header>
            <div class="ann-thread-scroll">
                <section class="ann-thread-original"><div class="ann-thread-original-label">متن بیانیه</div><div class="ann-thread-original-text ${String(announcement.text || "").length > 230 ? "is-collapsed" : ""}">${escapeHtml(announcement.text || "")}</div>${String(announcement.text || "").length > 230 ? `<button type="button" class="ann-original-expand">نمایش بیانیه کامل</button>` : ""}</section>
                <div class="ann-thread-section-title"><strong>گفت‌وگو</strong><span class="ann-thread-count">${(announcement.comments || []).length.toLocaleString("fa-IR")} پاسخ</span></div>
                <div class="ann-thread-comments" id="ann-thread-comments"></div>
            </div>
            <footer class="ann-thread-composer">
                <div class="ann-reply-target hidden" id="ann-reply-target"><span id="ann-reply-target-name"></span><button type="button" id="ann-reply-target-clear" aria-label="لغو پاسخ">×</button></div>
                <textarea class="ann-input ann-reply-text" maxlength="5000" placeholder="پاسخ خود را بنویسید…" aria-label="متن پاسخ"></textarea>
                <div class="ann-thread-composer-bottom"><span class="ann-reply-counter">۰ / ۵٬۰۰۰</span><button type="button" class="ann-publish-button ann-reply-send">ارسال پاسخ <span>➤</span></button></div>
            </footer>
        </section>`;
    document.body.appendChild(ov);

    let replyingTo = null;
    const input = ov.querySelector(".ann-reply-text");
    const counter = ov.querySelector(".ann-reply-counter");
    const commentsBox = ov.querySelector("#ann-thread-comments");
    const targetBox = ov.querySelector("#ann-reply-target");
    const targetName = ov.querySelector("#ann-reply-target-name");
    const sendBtn = ov.querySelector(".ann-reply-send");
    const close = () => ov.remove();
    const refreshTarget = () => {
        targetBox.classList.toggle("hidden", !replyingTo);
        targetName.textContent = replyingTo ? `در پاسخ به ${replyingTo.name}` : "";
        input.placeholder = replyingTo ? `پاسخ به ${replyingTo.name}…` : "پاسخ خود را بنویسید…";
    };
    const renderThread = () => {
        const current = announcementCache.get(String(id)) || announcement;
        const comments = Array.isArray(current.comments) ? current.comments : [];
        commentsBox.innerHTML = renderAnnouncementThread(comments);
        if (!comments.length) commentsBox.innerHTML = `<div class="ann-thread-empty"><span>✦</span><strong>هنوز پاسخی ثبت نشده</strong><p>اولین پاسخ را بنویس و گفتگو را شروع کن.</p></div>`;
        ov.querySelector(".ann-thread-count").textContent = `${comments.length.toLocaleString("fa-IR")} پاسخ`;
        commentsBox.querySelectorAll("[data-reply-to-comment]").forEach(btn => btn.onclick = () => {
            replyingTo = { id: btn.dataset.replyToComment, name: btn.dataset.replyToName || "کشور" };
            refreshTarget();
            input.focus({ preventScroll: true });
            ov.querySelector(".ann-thread-composer").scrollIntoView({ block: "end", behavior: "smooth" });
        });
    };
    ov.querySelector(".ann-modal-close").onclick = close;
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    ov.querySelector("#ann-reply-target-clear").onclick = () => { replyingTo = null; refreshTarget(); input.focus(); };
    const originalExpand = ov.querySelector(".ann-original-expand");
    if (originalExpand) originalExpand.onclick = () => {
        const originalText = ov.querySelector(".ann-thread-original-text");
        const expanded = originalText.classList.toggle("is-expanded");
        originalText.classList.toggle("is-collapsed", !expanded);
        originalExpand.textContent = expanded ? "نمایش کمتر" : "نمایش بیانیه کامل";
    };
    input.addEventListener("input", () => { counter.textContent = `${input.value.length.toLocaleString("fa-IR")} / ۵٬۰۰۰`; });
    sendBtn.onclick = async () => {
        const text = input.value.trim();
        if (!text) { showToast("متن پاسخ را بنویسید.", "error"); input.focus(); return; }
        sendBtn.disabled = true; sendBtn.textContent = "در حال ارسال…";
        try {
            const d = await apiPost("/api/announcements/comment", {
                announcement_id: id, text, parent_comment_id: replyingTo?.id || null
            });
            if (!d.success) { showToast(d.message || "ارسال پاسخ انجام نشد.", "error"); return; }
            input.value = ""; counter.textContent = "۰ / ۵٬۰۰۰"; replyingTo = null; refreshTarget();
            await loadAnnouncements();
            renderThread();
            showToast("پاسخ شما ثبت شد.", "success");
            ov.querySelector(".ann-thread-scroll").scrollTo({ top: ov.querySelector(".ann-thread-scroll").scrollHeight, behavior: "smooth" });
        } catch (e) { showToast("ارتباط با سرور برقرار نشد.", "error"); }
        finally { sendBtn.disabled = false; sendBtn.innerHTML = `ارسال پاسخ <span>➤</span>`; }
    };
    renderThread();
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* =========================================================
   Unions — فهرست عمومی و چت تمام‌صفحه
========================================================= */
function unionErrorText(error) {
    return ({
        already_member: "شما عضو یک اتحادیه هستید.", in_other: "این کشور عضو اتحادیهٔ دیگری است.",
        not_leader: "فقط مالک اتحادیه می‌تواند این کار را انجام دهد.", no_union: "اتحادیه پیدا نشد.",
        no_request: "درخواست عضویت پیدا نشد.", no_invite: "دعوت پیدا نشد.",
        cannot_kick_self: "مالک نمی‌تواند خودش را اخراج کند. برای انحلال از اتحادیه خارج شوید."
    })[error] || "انجام عملیات ممکن نشد.";
}

function unionMemberNames(members) {
    return (members || []).map(cid => `${flagInline(cid, true)} <span>${escapeHtml(COUNTRY_NAMES[cid] || cid)}</span>`).join("");
}

async function loadUnion() {
    const c = document.getElementById("union-content");
    if (!c) return;
    c.innerHTML = `<div class="diplomacy-item-empty">در حال دریافت اتحادیه‌ها...</div>`;
    try {
        const d = await apiGet("/api/union");
        unionDataCache = d;
        renderUnionBrowser(d);
    } catch (e) {
        console.error(e);
        c.innerHTML = `<div class="diplomacy-item-empty">فهرست اتحادیه‌ها در دسترس نیست.</div>`;
    }
}

function openUnionCreateModal() {
    document.getElementById("union-create-modal")?.remove();
    const ov = document.createElement("div");
    ov.id = "union-create-modal";
    ov.className = "modal-overlay union-create-overlay";
    ov.innerHTML = `<section class="modal-box union-create-dialog" role="dialog" aria-modal="true" aria-labelledby="union-create-title">
        <div class="ann-modal-head"><div><span class="ann-modal-kicker">اتحاد کشورها</span><h2 class="modal-title" id="union-create-title">ساخت اتحادیهٔ جدید</h2></div><button type="button" class="ann-modal-close" aria-label="بستن">×</button></div>
        <div class="union-create-hero"><span>🌐</span><div><strong>اتحادیهٔ خودت را بساز</strong><p>بعد از ساخت، کشورهای دیگر می‌توانند درخواست عضویت بفرستند.</p></div></div>
        <label for="union-modal-name" class="diplomacy-label">نام اتحادیه</label>
        <input id="union-modal-name" class="diplomacy-input union-modal-name" placeholder="مثلاً پیمان همکاری جهانی" maxlength="40" autocomplete="off">
        <div class="union-create-modal-actions"><button type="button" class="modal-cancel union-create-cancel">انصراف</button><button type="button" id="union-create-confirm" class="diplomacy-submit">ساخت اتحادیه</button></div>
    </section>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector(".ann-modal-close").onclick = close;
    ov.querySelector(".union-create-cancel").onclick = close;
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    const input = ov.querySelector("#union-modal-name");
    const submit = ov.querySelector("#union-create-confirm");
    const create = async () => {
        const name = input.value.trim();
        if (!name) { showToast("نام اتحادیه را وارد کنید.", "error"); input.focus(); return; }
        submit.disabled = true; submit.textContent = "در حال ساخت…";
        try {
            const r = await apiPost("/api/union/create", { name });
            if (!r.success) { showToast(unionErrorText(r.error), "error"); submit.disabled = false; submit.textContent = "ساخت اتحادیه"; return; }
            close();
            showToast("اتحادیه ساخته شد.", "success");
            await loadUnion();
            await openUnionChat(r.union_id);
        } catch (e) {
            showToast("ارتباط با سرور برقرار نشد.", "error");
            submit.disabled = false; submit.textContent = "ساخت اتحادیه";
        }
    };
    submit.onclick = create;
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); create(); } });
    setTimeout(() => input.focus(), 40);
}

function renderUnionBrowser(d) {
    const c = document.getElementById("union-content");
    if (!c) return;
    const mine = d.union || null;
    const unions = d.unions || [];
    const requested = new Set(d.requested_union_ids || []);
    const invited = new Map((d.invites || []).map(x => [x.union_id, x]));
    c.innerHTML = "";

    if (!mine) {
        const create = document.createElement("button");
        create.type = "button";
        create.className = "union-create-launch";
        create.innerHTML = `<span class="union-create-launch-icon">＋</span><span class="union-create-launch-copy"><strong>ساخت اتحادیهٔ جدید</strong><small>نام و اتحادیهٔ خودت را ایجاد کن</small></span><span class="union-create-launch-arrow">←</span>`;
        create.onclick = openUnionCreateModal;
        c.appendChild(create);
    } else {
        const note = document.createElement("div");
        note.className = "union-own-note";
        note.textContent = `شما عضو «${mine.name}» هستید.`;
        c.appendChild(note);
    }

    if (d.invites?.length) {
        const invites = document.createElement("div");
        invites.className = "union-invites-block";
        invites.innerHTML = `<div class="union-section-heading">دعوت‌های دریافتی</div>`;
        d.invites.forEach(inv => {
            const row = document.createElement("div");
            row.className = "union-invite-row";
            row.innerHTML = `<div><strong>${escapeHtml(inv.name)}</strong><small>دعوت از ${escapeHtml(COUNTRY_NAMES[inv.leader] || inv.leader)}</small></div>
                <div class="union-inline-actions"><button class="union-action accept" data-invite-accept="${escapeHtml(inv.union_id)}">پذیرفتن</button>
                <button class="union-action reject" data-invite-reject="${escapeHtml(inv.union_id)}">رد</button></div>`;
            invites.appendChild(row);
        });
        c.appendChild(invites);
    }

    const listHead = document.createElement("div");
    listHead.className = "union-list-heading";
    listHead.innerHTML = `<div><h3>اتحادیه‌های جهان</h3><p>نام و اعضا عمومی است؛ پیام‌های داخل اتحادیه فقط برای اعضاست.</p></div><span>${formatNumber(unions.length)} اتحادیه</span>`;
    c.appendChild(listHead);

    const list = document.createElement("div");
    list.className = "union-public-list";
    if (!unions.length) list.innerHTML = `<div class="diplomacy-item-empty">هنوز اتحادیه‌ای ساخته نشده است.</div>`;
    unions.forEach(u => {
        const isMine = !!mine && mine.id === u.id;
        const hasUnion = !!mine;
        const requestPending = requested.has(u.id);
        const hasInvite = invited.has(u.id);
        const card = document.createElement("article");
        card.className = "union-public-card" + (isMine ? " is-my-union" : "");
        const members = u.members || [];
        const actionHtml = isMine
            ? `<button class="union-action primary" data-enter-union="${escapeHtml(u.id)}">ورود به اتحادیه <span>←</span></button>`
            : hasUnion
                ? `<button class="union-action" disabled>عضو اتحادیهٔ دیگری هستید</button>`
                : hasInvite
                    ? `<button class="union-action primary" data-invite-accept="${escapeHtml(u.id)}">پذیرفتن دعوت</button>`
                    : requestPending
                        ? `<button class="union-action" disabled>درخواست ارسال شده</button>`
                        : `<button class="union-action primary" data-union-request="${escapeHtml(u.id)}">درخواست عضویت</button>`;
        card.innerHTML = `<div class="union-public-head"><div class="union-public-title-wrap"><h4>${escapeHtml(u.name || "اتحادیه")}</h4>
                <small>👑 مالک: ${escapeHtml(COUNTRY_NAMES[u.leader_country] || u.leader_country || "نامشخص")}</small></div>
                <span class="union-member-count">👥 ${formatNumber(members.length)} عضو</span></div>
            <div class="union-member-preview">${unionMemberNames(members) || '<span class="union-no-members">بدون عضو</span>'}</div>
            <div class="union-public-footer">${actionHtml}</div>`;
        list.appendChild(card);
    });
    c.appendChild(list);

    c.querySelectorAll("[data-enter-union]").forEach(b => b.onclick = () => openUnionChat(b.dataset.enterUnion));
    c.querySelectorAll("[data-union-request]").forEach(b => b.onclick = async () => {
        b.disabled = true;
        const r = await apiPost("/api/union/request", { union_id: b.dataset.unionRequest });
        if (!r.success) showToast(unionErrorText(r.error), "error");
        else showToast("درخواست عضویت برای مالک اتحادیه فرستاده شد.", "success");
        await loadUnion();
    });
    c.querySelectorAll("[data-invite-accept]").forEach(b => b.onclick = async () => respondInvite(b.dataset.inviteAccept, true));
    c.querySelectorAll("[data-invite-reject]").forEach(b => b.onclick = async () => respondInvite(b.dataset.inviteReject, false));
}

async function respondInvite(uId, accept) {
    const r = await apiPost("/api/union/respond", { union_id: uId, accept });
    if (!r.success) { showToast(unionErrorText(r.error), "error"); return; }
    showToast(accept ? "عضویت در اتحادیه انجام شد." : "دعوت رد شد.", "success");
    await loadUnion();
    if (accept) await openUnionChat(uId);
}

async function openUnionChat(unionId) {
    const d = await apiGet("/api/union");
    unionDataCache = d;
    if (!d.union || (unionId && d.union.id !== unionId)) {
        showToast("فقط اعضای اتحادیه می‌توانند وارد چت شوند.", "error");
        await loadUnion();
        return;
    }
    unionChatId = d.union.id;
    unionChatSignature = "";
    renderUnionChat(d.union, true);
    document.getElementById("union-conversation").classList.remove("hidden");
}

function renderUnionChat(u, forceScroll = false) {
    if (!u) return;
    document.getElementById("union-chat-name").textContent = u.name || "اتحادیه";
    document.getElementById("union-chat-count").textContent = `${formatNumber((u.members || []).length)} عضو`;
    const messages = u.messages || [];
    const sig = `${messages.length}|${messages.length ? messages[messages.length - 1].at + messages[messages.length - 1].text : ""}`;
    const box = document.getElementById("union-chat-messages");
    if (!forceScroll && sig === unionChatSignature) return;
    const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    unionChatSignature = sig;
    box.innerHTML = "";
    if (!messages.length) {
        box.innerHTML = `<div class="union-chat-empty">هنوز پیامی در اتحادیه نیست. اولین پیام را بفرستید.</div>`;
        return;
    }
    messages.forEach(m => {
        const mine = m.from_country === selectedCountry;
        const row = document.createElement("div");
        row.className = `union-msg-row ${mine ? "mine" : "other"}`;
        const meta = document.createElement("div");
        meta.className = "union-msg-meta";
        meta.innerHTML = `${flagInline(m.from_country, true)} <span>${escapeHtml(COUNTRY_NAMES[m.from_country] || m.from_country)}</span><time>${escapeHtml(formatNewsTime(m.at))}</time>`;
        const bubble = document.createElement("div");
        bubble.className = "union-msg-bubble";
        bubble.textContent = m.text || "";
        row.appendChild(meta); row.appendChild(bubble); box.appendChild(row);
    });
    if (forceScroll || wasNearBottom) box.scrollTop = box.scrollHeight;
}

async function refreshUnionChat() {
    if (!unionChatId || document.getElementById("union-conversation").classList.contains("hidden")) return;
    try {
        const d = await apiGet("/api/union");
        unionDataCache = d;
        if (!d.union || d.union.id !== unionChatId) {
            closeUnionChat();
            showToast("عضویت شما در این اتحادیه دیگر فعال نیست.", "error");
            await loadUnion();
            return;
        }
        renderUnionChat(d.union);
    } catch (e) { console.error(e); }
}

function closeUnionChat() {
    document.getElementById("union-conversation")?.classList.add("hidden");
    document.querySelector(".union-members-overlay")?.remove();
    unionChatId = null;
    unionChatSignature = "";
    loadUnion();
}
document.getElementById("union-chat-back")?.addEventListener("click", closeUnionChat);
document.getElementById("union-chat-title")?.addEventListener("click", openUnionMembers);
document.getElementById("union-chat-members")?.addEventListener("click", openUnionMembers);

async function sendUnionChatMessage() {
    const input = document.getElementById("union-chat-input");
    const text = input.value.trim();
    if (!text || !unionChatId) return;
    input.value = "";
    const r = await apiPost("/api/union/message", { text });
    if (!r.success) { showToast(unionErrorText(r.error), "error"); return; }
    await refreshUnionChat();
}
document.getElementById("union-chat-send")?.addEventListener("click", sendUnionChatMessage);
document.getElementById("union-chat-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendUnionChatMessage(); }
});

async function openUnionMembers() {
    if (!unionChatId) return;
    const d = await apiGet("/api/union");
    unionDataCache = d;
    const u = d.union;
    if (!u || u.id !== unionChatId) return;
    const isLeader = !!d.is_leader;
    document.querySelector(".union-members-overlay")?.remove();
    const ov = document.createElement("div");
    ov.className = "modal-overlay union-members-overlay";
    ov.innerHTML = `<div class="modal-box union-manage-box">
        <div class="union-modal-head"><div><div class="modal-title">${escapeHtml(u.name)}</div><small>${formatNumber((u.members || []).length)} عضو</small></div><button class="union-modal-close" aria-label="بستن">✕</button></div>
        <div class="union-section-heading">اعضای اتحادیه</div><div class="union-manage-list" id="union-manage-members"></div>
        ${isLeader ? `<div class="union-section-heading">درخواست‌های عضویت</div><div class="union-manage-list" id="union-manage-requests"></div>
            <div class="union-section-heading">دعوت عضو جدید</div><div class="union-invite-form"><select id="union-invite-target" class="diplomacy-select"></select><button id="union-invite-submit" class="union-action primary">دعوت</button></div>` : ""}
        <button id="union-leave" class="union-action danger">خروج از اتحادیه</button>
    </div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
    ov.querySelector(".union-modal-close").onclick = () => ov.remove();

    const membersBox = ov.querySelector("#union-manage-members");
    membersBox.innerHTML = "";
    (u.members || []).forEach(cid => {
        const row = document.createElement("div");
        row.className = "union-manage-row";
        row.innerHTML = `<div class="union-manage-person">${flagInline(cid, true)}<span>${escapeHtml(COUNTRY_NAMES[cid] || cid)}</span>${cid === u.leader_country ? '<small class="union-owner-tag">مالک</small>' : ""}</div>
            ${isLeader && cid !== u.leader_country ? `<button class="union-action reject" data-kick-member="${escapeHtml(cid)}">اخراج</button>` : ""}`;
        membersBox.appendChild(row);
    });

    if (isLeader) {
        const reqBox = ov.querySelector("#union-manage-requests");
        const requests = u.join_requests || [];
        if (!requests.length) reqBox.innerHTML = `<div class="union-empty-small">درخواست جدیدی وجود ندارد.</div>`;
        requests.forEach(cid => {
            const row = document.createElement("div"); row.className = "union-manage-row";
            row.innerHTML = `<div class="union-manage-person">${flagInline(cid, true)}<span>${escapeHtml(COUNTRY_NAMES[cid] || cid)}</span></div>
                <div class="union-inline-actions"><button class="union-action accept" data-join-response="${escapeHtml(cid)}" data-accept="true">قبول</button>
                <button class="union-action reject" data-join-response="${escapeHtml(cid)}" data-accept="false">رد</button></div>`;
            reqBox.appendChild(row);
        });
        const alreadyUsed = new Set((d.unions || []).filter(x => x.id !== u.id).flatMap(x => x.members || []));
        const choices = Object.entries(COUNTRY_NAMES).filter(([cid]) => !(u.members || []).includes(cid) && !alreadyUsed.has(cid));
        ov.querySelector("#union-invite-target").innerHTML = choices.length
            ? choices.map(([cid, name]) => `<option value="${escapeHtml(cid)}">${escapeHtml(name)}</option>`).join("")
            : `<option value="">کشوری برای دعوت باقی نمانده</option>`;
        ov.querySelector("#union-invite-submit").disabled = !choices.length;
        ov.querySelector("#union-invite-submit").onclick = async () => {
            const target = ov.querySelector("#union-invite-target").value;
            if (!target) return;
            const r = await apiPost("/api/union/invite", { union_id: u.id, target });
            if (!r.success) { showToast(unionErrorText(r.error), "error"); return; }
            showToast(`دعوت ${COUNTRY_NAMES[target]} ارسال شد.`, "success");
            ov.remove(); await openUnionMembers();
        };
        ov.querySelectorAll("[data-kick-member]").forEach(b => b.onclick = async () => {
            const target = b.dataset.kickMember;
            if (!(await gameConfirm(`کشور ${COUNTRY_NAMES[target]} از اتحادیه اخراج شود؟`, { title: "اخراج عضو", ok: "اخراج", danger: true }))) return;
            const r = await apiPost("/api/union/kick", { union_id: u.id, target });
            if (!r.success) { showToast(unionErrorText(r.error), "error"); return; }
            showToast("عضو از اتحادیه اخراج شد.", "success"); ov.remove(); await refreshUnionChat(); await openUnionMembers();
        });
        ov.querySelectorAll("[data-join-response]").forEach(b => b.onclick = async () => {
            const target = b.dataset.joinResponse, accept = b.dataset.accept === "true";
            const r = await apiPost("/api/union/request/respond", { union_id: u.id, target, accept });
            if (!r.success) { showToast(unionErrorText(r.error), "error"); return; }
            showToast(accept ? `${COUNTRY_NAMES[target]} به اتحادیه پیوست.` : "درخواست رد شد.", "success");
            ov.remove(); await refreshUnionChat(); await openUnionMembers();
        });
    }
    ov.querySelector("#union-leave").onclick = async () => {
        const message = isLeader ? "با خروج مالک، اتحادیه منحل می‌شود. ادامه می‌دهید؟" : "از اتحادیه خارج می‌شوید؟";
        if (!(await gameConfirm(message, { title: "خروج از اتحادیه", ok: "خروج", danger: true }))) return;
        const r = await apiPost("/api/union/leave", {});
        if (!r.success) { showToast(unionErrorText(r.error), "error"); return; }
        ov.remove(); document.getElementById("union-conversation").classList.add("hidden");
        unionChatId = null; unionChatSignature = "";
        showToast(isLeader ? "اتحادیه منحل شد." : "از اتحادیه خارج شدید.", "success");
        await loadUnion();
    };
}

/* =========================================================
   News — filters and compact cards
========================================================= */
function inferNewsCategory(item) {
    if (item.category) return item.category;
    const source = `${item.title || ""} ${item.text || ""}`;
    if (source.includes("اتحادیه")) return "union";
    if (["جنگ", "نبرد", "دفاع", "حمله", "اشغال", "تلفات", "نیرو", "ارتش", "پیروزی", "شکست"].some(x => source.includes(x))) return "military";
    if (["پیمان", "عدم تجاوز", "اتحاد", "دیپلماسی", "بیانیه", "مذاکره"].some(x => source.includes(x))) return "diplomacy";
    if (["معامله", "تجارت", "بازار", "مرز زمینی", "حمل‌ونقل", "حمل و نقل"].some(x => source.includes(x))) return "trade";
    if (["تصرف", "تنگه", "قلمرو", "مرز", "منطقه"].some(x => source.includes(x))) return "territory";
    if (["وام", "درآمد", "اقتصاد", "تسویه", "غذا", "نفت", "آهن", "اورانیوم", "منبع", "منابع"].some(x => source.includes(x))) return "economy";
    return "general";
}

function renderNewsList() {
    const c = document.getElementById("news-list");
    if (!c) return;
    const list = currentNewsFilter === "all" ? newsItemsCache : newsItemsCache.filter(item => inferNewsCategory(item) === currentNewsFilter);
    c.innerHTML = "";
    if (!list.length) {
        c.innerHTML = `<div class="diplomacy-item-empty">در این دسته‌بندی خبری وجود ندارد.</div>`;
        return;
    }
    list.forEach(item => {
        const div = document.createElement("article");
        div.className = `news-item news-category-${inferNewsCategory(item)}`;
        const categoryNames = { military: "نظامی", diplomacy: "دیپلماسی", economy: "اقتصاد", trade: "تجارت", territory: "قلمرو", union: "اتحادیه", general: "عمومی" };
        div.innerHTML = `<div class="news-item-top"><h3>${escapeHtml(item.title || "خبر")}</h3><span class="news-category-label">${categoryNames[inferNewsCategory(item)] || "عمومی"}</span></div>
            <p>${escapeHtml(item.text || "")}</p>${item.at ? `<time>${escapeHtml(formatNewsTime(item.at))}</time>` : ""}`;
        c.appendChild(div);
    });
}

document.querySelectorAll("[data-news-filter]").forEach(button => button.addEventListener("click", () => {
    currentNewsFilter = button.dataset.newsFilter || "all";
    document.querySelectorAll("[data-news-filter]").forEach(item => item.classList.toggle("active", item === button));
    renderNewsList();
}));

function resetNewsFilter() {
    currentNewsFilter = "all";
    document.querySelectorAll("[data-news-filter]").forEach(item => item.classList.toggle("active", item.dataset.newsFilter === "all"));
    renderNewsList();
}

async function loadNews() {
    const c = document.getElementById("news-list");
    if (!c) return;
    try {
        const news = await apiGet("/api/news");
        newsItemsCache = Array.isArray(news) ? news : [];
        renderNewsList();
        refreshNotificationBadge();
    } catch (e) {
        c.innerHTML = `<div class="news-item"><h3>اخبار</h3><p>دریافت خبرها ممکن نشد.</p></div>`;
    }
}

/* =========================================================
   Private Messages
========================================================= */
function setPmBadges(n) {
    ["pm-tab-badge", "pm-sub-badge"].forEach(id => {
        const el = document.getElementById(id); if (!el) return;
        el.textContent = n > 99 ? "99+" : String(n);
        el.classList.toggle("hidden", !(n > 0));
    });
}

async function refreshPmBadge() {
    try {
        const d = await apiGet("/api/pm");
        if (typeof d.unread_total === "number") setPmBadges(d.unread_total);
    } catch (e) {}
}

function setPmSub(sub) {
    document.querySelectorAll(".pm-subtab").forEach(t => t.classList.toggle("active", t.dataset.pmSub === sub));
    document.getElementById("pm-inbox").classList.toggle("hidden", sub !== "inbox");
    document.getElementById("contact-list").classList.toggle("hidden", sub !== "chat");
    document.getElementById("contact-search-wrap")?.classList.toggle("hidden", sub !== "chat");
    if (sub === "inbox") renderPmInbox(); else renderContactList();
}
document.querySelectorAll(".pm-subtab").forEach(t => t.addEventListener("click", () => setPmSub(t.dataset.pmSub)));

function openPmHome() { setPmSub("inbox"); }

async function renderPmInbox() {
    const c = document.getElementById("pm-inbox");
    if (!c) return;
    try {
        const d = await apiGet("/api/pm");
        const list = d.conversations || [];
        setPmBadges(d.unread_total || 0);
        c.innerHTML = "";
        const un = document.createElement("div");
        un.className = "contact-item pm-conv-item un-pm-item";
        un.innerHTML = `<div class="contact-info"><span class="un-pm-icon">🌐</span><div class="pm-conv-text"><span class="contact-name">سازمان ملل</span><span class="pm-conv-last">گفت‌وگوی رسمی · فعلاً فقط نمایشی</span></div></div><span class="un-pm-tag">رسمی</span>`;
        un.onclick = openUnitedNationsPM;
        c.appendChild(un);
        if (!list.length) {
            const empty = document.createElement("div");
            empty.className = "diplomacy-item-empty pm-inbox-empty";
            empty.textContent = "گفت‌وگوی کشورها پس از آغاز مکالمه در اینجا نمایش داده می‌شود.";
            c.appendChild(empty);
            return;
        }
        list.forEach(cv => {
            if (!COUNTRY_NAMES[cv.with]) return;
            const div = document.createElement("div");
            div.className = "contact-item pm-conv-item";
            div.innerHTML = `
                <div class="contact-info">
                    ${flagInline(cv.with, true)}
                    <div class="pm-conv-text">
                        <span class="contact-name">${COUNTRY_NAMES[cv.with]}</span>
                        <span class="pm-conv-last"></span>
                    </div>
                </div>
                ${cv.unread > 0 ? `<span class="pm-badge pm-badge-static">${cv.unread > 99 ? "99+" : cv.unread}</span>` : ""}`;
            div.querySelector(".pm-conv-last").textContent = (cv.last_from === selectedCountry ? "شما: " : "") + cv.last;
            div.onclick = () => openPM(cv.with);
            c.appendChild(div);
        });
    } catch (e) { c.innerHTML = `<div class="diplomacy-item-empty">پیام‌ها در دسترس نیست.</div>`; }
}

function renderContactList() {
    const c = document.getElementById("contact-list");
    if (!c) return;
    c.innerHTML = "";
    const q = (pmCountrySearch || "").trim().toLocaleLowerCase("fa-IR");
    const matches = Object.entries(COUNTRY_NAMES).filter(([cid, name]) => cid !== selectedCountry &&
        (!q || name.toLocaleLowerCase("fa-IR").includes(q) || cid.toLowerCase().includes(q)));
    if (!matches.length) {
        c.innerHTML = `<div class="diplomacy-item-empty">کشوری با این نام پیدا نشد.</div>`;
        return;
    }
    matches.forEach(([cid, name]) => {
        const div = document.createElement("div");
        div.className = "contact-item";
        div.innerHTML = `<div class="contact-info">${flagInline(cid, true)}<span class="contact-name">${escapeHtml(name)}</span></div>
            <button class="message-button" data-open-pm="${cid}">چت</button>`;
        c.appendChild(div);
    });
    c.querySelectorAll("[data-open-pm]").forEach(b => b.onclick = () => openPM(b.dataset.openPm));
}

document.getElementById("pm-country-search")?.addEventListener("input", e => {
    pmCountrySearch = e.target.value || "";
    renderContactList();
});

const UN_PM_TARGET = "__un__";
let unPmLocalMessages = [];
function renderUnitedNationsPMMessages() {
    const box = document.getElementById("pm-messages");
    box.innerHTML = `<div class="un-pm-placeholder"><span>🌐</span><strong>گفت‌وگوی سازمان ملل</strong><p>پیام‌ها فعلاً فقط در همین صفحه نمایش داده می‌شوند و برای سازمان ملل یا هیچ بازیکنی ارسال نمی‌شوند.</p></div>`;
    unPmLocalMessages.forEach(text => {
        const bubble = document.createElement("div");
        bubble.className = "pm-msg pm-mine un-pm-local-msg";
        bubble.textContent = text;
        box.appendChild(bubble);
    });
    box.scrollTop = box.scrollHeight;
}
function openUnitedNationsPM() {
    currentPMTarget = UN_PM_TARGET;
    pmLastSig = "";
    document.getElementById("pm-target-name").textContent = "سازمان ملل";
    document.getElementById("pm-target-flag").innerHTML = `<span class="un-pm-icon un-pm-icon-large">🌐</span>`;
    renderUnitedNationsPMMessages();
    const input = document.getElementById("pm-input");
    const send = document.getElementById("pm-send");
    input.value = ""; input.disabled = false; input.placeholder = "پیام نمایشی به سازمان ملل...";
    send.disabled = false;
    document.getElementById("pm-conversation").classList.add("un-pm-local");
    document.getElementById("pm-conversation").classList.remove("un-pm-readonly", "hidden");
}

function openPM(target) {
    currentPMTarget = target;
    pmLastSig = "";
    document.getElementById("pm-target-name").textContent = COUNTRY_NAMES[target];
    document.getElementById("pm-target-flag").innerHTML = flagInline(target, true);
    document.getElementById("pm-messages").innerHTML = "";
    const input = document.getElementById("pm-input");
    const send = document.getElementById("pm-send");
    input.disabled = false; input.placeholder = "پیام...";
    send.disabled = false;
    document.getElementById("pm-conversation").classList.remove("un-pm-readonly", "un-pm-local");
    document.getElementById("pm-conversation").classList.remove("hidden");
    loadPM(target, true);
}

function closePM() {
    currentPMTarget = null;
    document.getElementById("pm-conversation").classList.add("hidden");
    const panel = document.getElementById("comm-contacts");
    if (panel && !panel.classList.contains("hidden")) {
        const inboxVisible = !document.getElementById("pm-inbox").classList.contains("hidden");
        if (inboxVisible) renderPmInbox(); else refreshPmBadge();
    } else refreshPmBadge();
}
document.getElementById("pm-back").onclick = closePM;

async function sendPM() {
    const ta = document.getElementById("pm-input");
    const text = ta.value.trim();
    if (!text || !currentPMTarget) return;
    ta.value = ""; ta.style.height = "";
    if (currentPMTarget === UN_PM_TARGET) {
        // این چت هنوز به سرور وصل نیست؛ پیام صرفاً در رابط همین نشست نشان داده می‌شود.
        unPmLocalMessages.push(text);
        renderUnitedNationsPMMessages();
        showToast("پیام فقط در همین صفحه نمایش داده شد و برای کسی ارسال نشد.", "success");
        return;
    }
    await apiPost("/api/pm/send", { target: currentPMTarget, text });
    loadPM(currentPMTarget, true);
}
document.getElementById("pm-send").onclick = sendPM;
document.getElementById("pm-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPM(); }
});
document.getElementById("pm-input").addEventListener("input", e => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 90) + "px";
});

let pmLastSig = "";
async function loadPM(target, forceScroll = false) {
    try {
        const d = await apiGet("/api/pm", { target });
        if (target !== currentPMTarget) return;
        const list = d.messages || [];
        const sig = list.length + "|" + (list.length ? list[list.length - 1].at : "");
        const c = document.getElementById("pm-messages");
        if (!forceScroll && sig === pmLastSig) return;
        pmLastSig = sig;
        const nearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 80;
        c.innerHTML = "";
        list.forEach(m => {
            const mine = m.from === selectedCountry;
            const div = document.createElement("div");
            div.className = `pm-msg ${mine ? "pm-mine" : "pm-other"}`;
            div.textContent = m.text;
            c.appendChild(div);
        });
        if (forceScroll || nearBottom) c.scrollTop = c.scrollHeight;
    } catch (e) { console.error(e); }
}
setInterval(() => {
    if (currentPMTarget && currentPMTarget !== UN_PM_TARGET) loadPM(currentPMTarget);
    if (unionChatId) refreshUnionChat();
}, 4000);

/* =========================================================
   Market — global trade
========================================================= */
let marketCreateSide = "sell", marketFilter = "all", marketRows = [];

function marketResourceText(k, n) { return `${RESOURCE_ICONS[k] || "📦"} ${formatNumber(n)} ${RESOURCE_NAMES[k] || k}`; }
function marketModeLabel(m) { return m === "land" ? "🚚 زمینی" : m === "sea" ? "🚢 دریایی" : "✈️ هوایی"; }
function marketModeCost(route) { return route ? formatMoney(route.transport_cost) : "—"; }

async function loadMarketListings() {
    const c = document.getElementById("market-listings"); if (!c) return;
    c.innerHTML = `<div class="market-loading">در حال دریافت کالاها…</div>`;
    try {
        const d = await apiGet("/api/market", {country: selectedCountry || ""});
        marketRows = d.listings || [];
        renderMarketListings();
    } catch (e) { c.innerHTML = `<div class="diplomacy-item-empty">بازار در دسترس نیست.</div>`; }
}

function renderMarketListings() {
    const c = document.getElementById("market-listings"); if (!c) return;
    const rows = marketRows.filter(l => marketFilter === "all" || l.side === marketFilter);
    if (!rows.length) { c.innerHTML = `<div class="diplomacy-item-empty">آگهی‌ای برای این بخش نیست.</div>`; return; }
    c.innerHTML = rows.map(l => {
        const mine = l.country === selectedCountry;
        const action = mine ? "آگهی شما" : (l.side === "sell" ? "می‌خرم" : "می‌فروشم");
        const actionCls = mine ? "disabled" : (l.side === "sell" ? "buy" : "sell");
        const price = l.price_resource === "money" ? formatMoney(l.price_amount) : marketResourceText(l.price_resource, l.price_amount);
        const sideText = l.side === "sell" ? "فروشنده" : "خریدار";
        const routes = (l.routes || []);
        const modeChips = ["land","sea","air"].map(m => {
            const q = routes.find(x => x.mode === m);
            return `<span class="market-mode ${q ? "ok" : "off"}">${marketModeLabel(m)} ${q ? marketModeCost(q) : "ناممکن"}</span>`;
        }).join("");
        return `<div class="market-card side-${l.side}">
            <div class="market-card-head"><span class="mk-country">${flagInline(l.country, true)} ${COUNTRY_NAMES[l.country] || l.country}</span><b class="mk-badge">${sideText}</b></div>
            <div class="market-card-main"><div class="market-product"><span class="mk-ico">${RESOURCE_ICONS[l.resource] || "📦"}</span><div class="mk-prod-text"><strong>${RESOURCE_NAMES[l.resource]}</strong><b>${formatNumber(l.amount)}</b></div></div>
            <div class="market-price"><small>قیمت پیشنهادی</small><b>${price}</b></div></div>
            <div class="market-route-row">${modeChips}</div>
            ${l.route_error ? `<div class="market-route-error">⚠️ ${escapeHtml(l.route_error)}</div>` : `<div class="market-route-note">هزینه حمل را دریافت‌کننده کالا می‌پردازد.</div>`}
            <button class="market-action ${actionCls}" data-market-action="${l.id}" ${mine ? "disabled" : ""}>${action}</button>
        </div>`;
    }).join("");
    c.querySelectorAll("[data-market-action]").forEach(b => b.onclick = () => openTradeModal(b.dataset.marketAction));
}

async function openTradeModal(lid) {
    const l = marketRows.find(x => x.id === lid); if (!l) return;
    document.getElementById("market-trade-modal")?.remove();
    const routes = l.routes || [];
    const best = routes.slice().sort((a,b) => a.transport_cost-b.transport_cost)[0];
    const price = l.price_resource === "money" ? formatMoney(l.price_amount) : marketResourceText(l.price_resource, l.price_amount);
    const ov = document.createElement("div"); ov.id="market-trade-modal"; ov.className="modal-overlay";
    ov.innerHTML = `<div class="market-trade-sheet">
        <div class="is-head"><div class="is-titles"><div class="is-name">${l.side === "sell" ? "خرید" : "فروش"} ${RESOURCE_NAMES[l.resource]}</div><div class="is-sub">${formatNumber(l.amount)} واحد · قیمت ${price}</div></div><button class="is-close">✕</button></div>
        <div class="market-trade-body"><div class="market-trade-title">روش حمل را انتخاب کن</div>
        <div class="market-route-options">${["land","sea","air"].map(m=>{const q=routes.find(x=>x.mode===m); return `<button class="market-route-option ${q?"":"disabled"} ${best?.mode===m?"selected":""}" data-mode="${m}" ${q?"":"disabled"}><b>${marketModeLabel(m)}</b><span>${q?marketModeCost(q):"ناممکن"}</span>${q?.toll?`<small>عوارض تنگه: ${formatMoney(q.toll)}</small>`:""}</button>`}).join("")}</div>
        <div id="market-route-detail" class="market-route-detail"></div><button id="market-confirm-trade" class="market-confirm" ${best?"":"disabled"}>${l.side === "sell" ? "خرید و انتقال کالا" : "فروش و انتقال کالا"}</button></div>
    </div>`;
    document.body.appendChild(ov); ov.querySelector(".is-close").onclick=()=>ov.remove(); ov.onclick=e=>{if(e.target===ov)ov.remove();};
    let chosen=best?.mode || null;
    const detail=ov.querySelector("#market-route-detail");
    const paint=()=>{const q=routes.find(x=>x.mode===chosen); detail.innerHTML=q?`<b>هزینه حمل: ${formatMoney(q.transport_cost)}</b><br>${q.strait_costs?.length?`تنگه‌ها: ${q.strait_costs.map(x=>`${x.name} ${formatMoney(x.cost)}`).join("، ")}`:"بدون عوارض تنگه"}`:`هیچ مسیر فعالی نیست.`;};
    paint();
    ov.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{if(b.disabled)return;chosen=b.dataset.mode;ov.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("selected",x===b));paint();});
    ov.querySelector("#market-confirm-trade").onclick=async()=>{ if(!chosen)return; const d=await apiPost("/api/market/accept",{listing_id:lid,mode:chosen}); if(!d.success){showToast(d.message||"معامله انجام نشد");return;} ov.remove(); showToast(`معامله انجام شد · هزینه حمل ${formatMoney(d.transport_cost)}`); await refreshPlayer(); loadMarketListings(); loadMyListings(); };
}

function updateMarketCreateLabels() {
    const buy = marketCreateSide === "buy";
    document.getElementById("mk-resource-label").textContent = buy ? "کالایی که می‌خواهم بخرم" : "کالایی که می‌فروشم";
    document.getElementById("mk-price-label").textContent = buy ? "مبلغ/کالای پیشنهادی من" : "در ازای چه چیزی؟";
    document.getElementById("mk-amount-label").textContent = buy ? "مقدار کالای موردنیاز" : "مقدار کالای فروش";
    document.getElementById("mk-submit").textContent = buy ? "ثبت آگهی خرید" : "ثبت آگهی فروش";
    validateMarketForm();
}

let marketFormTouched = false;
function marketSetError(id, message) {
    const el = document.getElementById(id);
    if (el) el.textContent = message || "";
}
function marketAvailable(resource) {
    if (resource === "money") return Number(player?.money || 0);
    return Number(player?.resources?.[resource] || 0);
}
function validateMarketForm() {
    const resource = document.getElementById("mk-sell-res")?.value || "";
    const amountRaw = document.getElementById("mk-sell-amt")?.value ?? "";
    const payResource = document.getElementById("mk-want-res")?.value || "";
    const payRaw = document.getElementById("mk-want-amt")?.value ?? "";
    const amount = amountRaw === "" ? null : Number(amountRaw);
    const payAmount = payRaw === "" ? null : Number(payRaw);

    marketSetError("mk-sell-res-error", (!resource && marketFormTouched) ? "کالا را انتخاب کنید." : "");
    marketSetError("mk-want-res-error", (!payResource && marketFormTouched) ? "پول یا کالای موردنظر را انتخاب کنید." : "");
    marketSetError("mk-sell-amt-error", "");
    marketSetError("mk-want-amt-error", "");

    if (amountRaw !== "" && (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount))) {
        marketSetError("mk-sell-amt-error", "مقدار باید یک عدد صحیح بزرگ‌تر از صفر باشد.");
    } else if (amount !== null && marketCreateSide === "sell" && resource) {
        const available = marketAvailable(resource);
        if (amount > available) marketSetError("mk-sell-amt-error", `موجودی شما ${formatNumber(available)} ${RESOURCE_NAMES[resource] || resource} است؛ نمی‌توانید ${formatNumber(amount)} واحد ثبت کنید.`);
    }

    if (payRaw !== "" && (!Number.isFinite(payAmount) || payAmount <= 0 || !Number.isInteger(payAmount))) {
        marketSetError("mk-want-amt-error", "مقدار باید یک عدد صحیح بزرگ‌تر از صفر باشد.");
    } else if (payAmount !== null && marketCreateSide === "buy" && payResource) {
        const available = marketAvailable(payResource);
        if (payAmount > available) {
            const label = payResource === "money" ? "دلارِ خزانه" : (RESOURCE_NAMES[payResource] || payResource);
            marketSetError("mk-want-amt-error", `موجودی شما ${formatNumber(available)} ${label} است؛ این مقدار پیشنهاد بیشتر از موجودی شماست.`);
        }
    }

    const amountError = !!document.getElementById("mk-sell-amt-error")?.textContent;
    const payError = !!document.getElementById("mk-want-amt-error")?.textContent;
    const resourceError = !resource || !payResource;
    const amountValid = amount !== null && Number.isInteger(amount) && amount > 0;
    const payValid = payAmount !== null && Number.isInteger(payAmount) && payAmount > 0;
    const submit = document.getElementById("mk-submit");
    if (submit) submit.disabled = resourceError || !amountValid || !payValid || amountError || payError;
    return !(resourceError || !amountValid || !payValid || amountError || payError);
}

function clearMarketForm() {
    marketFormTouched = false;
    ["mk-sell-res", "mk-want-res"].forEach(id => { const e = document.getElementById(id); if (e) e.value = ""; });
    ["mk-sell-amt", "mk-want-amt"].forEach(id => { const e = document.getElementById(id); if (e) e.value = ""; });
    validateMarketForm();
}

document.querySelectorAll(".market-tab").forEach(tab => tab.addEventListener("click", () => {
    document.querySelectorAll(".market-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".market-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById(tab.dataset.marketTab)?.classList.remove("hidden");
    if (tab.dataset.marketTab === "market-list-panel") loadMarketListings();
    else if (tab.dataset.marketTab === "market-mine-panel") loadMyListings();
    else if (tab.dataset.marketTab === "market-create-panel") { refreshPlayer().finally(validateMarketForm); }
}));

document.querySelectorAll(".mk-filter").forEach(b => b.onclick = () => {
    document.querySelectorAll(".mk-filter").forEach(x => x.classList.remove("active"));
    b.classList.add("active"); marketFilter = b.dataset.side; renderMarketListings();
});
document.querySelectorAll(".mk-side").forEach(b => b.onclick = () => {
    document.querySelectorAll(".mk-side").forEach(x => x.classList.remove("active"));
    b.classList.add("active"); marketCreateSide = b.dataset.createSide;
    clearMarketForm(); updateMarketCreateLabels();
});
["mk-sell-res", "mk-sell-amt", "mk-want-res", "mk-want-amt"].forEach(id => {
    const e = document.getElementById(id);
    e?.addEventListener("input", () => { marketFormTouched = true; validateMarketForm(); });
    e?.addEventListener("change", () => { marketFormTouched = true; validateMarketForm(); });
});

// فرم از ابتدا خالی است: هیچ کالایی یا عددی به‌صورت خودکار انتخاب نمی‌شود.
updateMarketCreateLabels();

 document.getElementById("mk-submit")?.addEventListener("click", async () => {
    if (!validateMarketForm()) return;
    const body = {
        side: marketCreateSide,
        resource: document.getElementById("mk-sell-res").value,
        amount: Number(document.getElementById("mk-sell-amt").value),
        price_resource: document.getElementById("mk-want-res").value,
        price_amount: Number(document.getElementById("mk-want-amt").value)
    };
    try {
        const d = await apiPost("/api/market/create", body);
        if (!d.success) {
            if (d.field === "amount") marketSetError("mk-sell-amt-error", d.message || "موجودی کافی نیست.");
            else if (d.field === "price_amount") marketSetError("mk-want-amt-error", d.message || "موجودی کافی نیست.");
            else showToast(d.message || "ثبت آگهی ناموفق بود.", "error");
            await refreshPlayer(); validateMarketForm();
            return;
        }
        await refreshPlayer();
        clearMarketForm();
        showToast("آگهی ثبت شد؛ کالای/مبلغ پیشنهادشده تا زمان معامله رزرو شد.", "success");
        document.querySelector('[data-market-tab="market-mine-panel"]')?.click();
        loadMarketListings();
    } catch (e) { showToast("خطا در ثبت آگهی.", "error"); }
});

async function loadMyListings() {
    const c = document.getElementById("market-mine"); if (!c) return;
    c.innerHTML = `<div class="market-loading">در حال دریافت معاملات شما…</div>`;
    try {
        const d = await apiGet("/api/market", {country: selectedCountry || ""});
        const mine = (d.listings || []).filter(l => l.country === selectedCountry);
        if (!mine.length) {
            c.innerHTML = `<div class="diplomacy-item-empty">هنوز آگهی بازی ندارید.<br><small>پس از ثبت خرید یا فروش، آن را اینجا مدیریت کنید.</small></div>`;
            return;
        }
        c.innerHTML = mine.map(l => {
            const isSell = l.side === "sell";
            const pay = l.price_resource === "money" ? formatMoney(l.price_amount) : marketResourceText(l.price_resource, l.price_amount);
            return `<article class="market-card market-mine-card side-${l.side}">
                <div class="market-card-head"><span class="mk-country">${flagInline(l.country, true)} ${COUNTRY_NAMES[l.country] || l.country}</span><b class="mk-badge">${isSell ? "آگهی فروش" : "آگهی خرید"}</b></div>
                <div class="market-card-main"><div class="market-product"><span class="mk-ico">${RESOURCE_ICONS[l.resource] || "📦"}</span><div class="mk-prod-text"><strong>${isSell ? "کالای قابل فروش" : "کالای موردنیاز"}</strong><b>${RESOURCE_NAMES[l.resource] || l.resource}</b><small>${formatNumber(l.amount)} واحد</small></div></div>
                <div class="market-price"><small>${isSell ? "درخواست" : "پیشنهاد"}</small><b>${pay}</b></div></div>
                <div class="market-card-detail">${isSell ? "موجودی کالا هنگام ثبت رزرو شده است." : "مبلغ یا کالای پیشنهادی هنگام ثبت رزرو شده است."}</div>
                <button class="market-action cancel" data-cancel="${l.id}">لغو آگهی و بازگشت موجودی</button>
            </article>`;
        }).join("");
        c.querySelectorAll("[data-cancel]").forEach(b => b.onclick = async () => {
            b.disabled = true; b.textContent = "در حال لغو…";
            try {
                const d = await apiPost("/api/market/cancel", {listing_id: b.dataset.cancel});
                if (!d.success) { showToast(d.message || "لغو آگهی ناموفق بود.", "error"); b.disabled = false; b.textContent = "لغو آگهی و بازگشت موجودی"; return; }
                await refreshPlayer(); await loadMyListings(); await loadMarketListings();
                showToast("آگهی لغو شد و موجودی رزروشده برگشت.", "success");
            } catch (e) { b.disabled = false; showToast("خطا در لغو آگهی.", "error"); }
        });
    } catch (e) {
        c.innerHTML = `<div class="diplomacy-item-empty">دریافت آگهی‌ها ناموفق بود. دوباره وارد این بخش شوید.</div>`;
    }
}

/* =========================================================
   Map — World globe
========================================================= */
const MAP_COLORS = {
    own: "#2ecc71",        // کشور من و تصرف‌های من (تنگه، سکو، معدن) → سبز
    other: "#9fd8ff",      // بازیکنان فعال و منابع/تنگه‌های آزاد → آبی کمرنگ
    taken: "#ff9f1a",      // تصرف‌شده توسط بازیکن دیگر → نارنجی
    inactive: "#2a2e35",   // در بازی هست ولی بازیکنی ندارد → سیاهِ مایل به طوسی
    nogame: "#6e7683"      // هنوز به بازی اضافه نشده → طوسی ساده، بدون خط‌کشی
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
// برای اسم و مرکز کشور فقط بزرگ‌ترین تکه (سرزمین اصلی) حساب می‌شود؛ مثلاً گویان فرانسه اسم فرانسه را جابه‌جا نکند
function mainLandFeature(f) {
    const g = f.geometry;
    if (!g || g.type !== "MultiPolygon" || g.coordinates.length < 2) return f;
    let best = null, bestA = -1;
    g.coordinates.forEach(c => {
        const poly = { type: "Polygon", coordinates: c }, a = d3.geoArea(poly);
        if (a > bestA) { bestA = a; best = poly; }
    });
    return { type: "Feature", id: f.id, properties: f.properties, geometry: best };
}
function combineFeatures(feats, id) {
    const polys = [];
    feats.forEach(ft => {
        const g = ft.geometry;
        if (g.type === "Polygon") polys.push(g.coordinates);
        else if (g.type === "MultiPolygon") g.coordinates.forEach(c => polys.push(c));
    });
    return { type: "Feature", id, properties: { name: "" }, geometry: { type: "MultiPolygon", coordinates: polys } };
}
let mapProjection = null, mapPath = null, mapSvg = null;
let mapSize = 0, mapMinScale = 0, mapMaxScale = 0;
let mapRotation = [0, -10];
let mapSpinning = false, mapSpinRaf = 0;
function setMapSpin(on) {
    mapSpinning = on;
    document.getElementById("map-reset")?.classList.toggle("active", on);
    cancelAnimationFrame(mapSpinRaf);
    if (!on) return;
    const step = () => {
        if (!mapSpinning) return;
        const page = document.getElementById("map");
        if (mapProjection && page && !page.classList.contains("hidden")) {
            mapRotation[0] += 0.4;
            mapProjection.rotate(mapRotation); redrawMap();
        }
        mapSpinRaf = requestAnimationFrame(step);
    };
    mapSpinRaf = requestAnimationFrame(step);
}
let mapInitialized = false, mapInitializing = false;
let mapAbort = null;
let mapSites = [];
let mapSitesSvg = null, mapRoutesSvg = null;
let mapTransits = [], mapRouteSkew = 0, mapRoutesVisible = true;
try { mapRoutesVisible = localStorage.getItem("mapRoutes") !== "off"; } catch (e) {}
let mapCanvas = null, mapCtx = null, mapDpr = 1, mapW = 320, mapH = 300;
let mapFeatures = [], mapGroups = [], mapWaterItems = [], mapGraticule = null, mapRaf = 0;
let mapBorders = null, mapCoast = null;

async function initWorldMap() {
    const box = document.querySelector(".map-box");
    const svgEl = document.getElementById("map-globe");
    if (!box || !svgEl) return;

    if (mapInitialized) { updateMapColors(); redrawMap(); refreshMapSites(); loadMapRoutes(); return; }
    if (mapInitializing) return;
    mapInitializing = true;

    const w = box.clientWidth || 320;
    const h = box.clientHeight || 300;
    mapW = w; mapH = h;
    mapSize = Math.min(w, h) * 0.46;
    mapMinScale = mapSize * 0.8;
    mapMaxScale = mapSize * 20;   // زوم بیشتر برای کشورهای کوچک (آلمان، فرانسه، انگلیس)

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
    const inGameRealm = rid => typeof rid === "number" && !!keyById[rid];
    mapBorders = topojson.mesh(world, world.objects.countries, (x, y) => {
        const rx = realmOfGeom.get(x), ry = realmOfGeom.get(y);
        return rx !== ry && (inGameRealm(rx) || inGameRealm(ry));
    });
    mapCoast = topojson.mesh(world, world.objects.countries, (x, y) => x === y);

    // اطلاعات ثابت هر قلمرو یک‌بار محاسبه می‌شود (نه در هر فریم)
    mapFeatures = Array.from(realms.values()).map(r => {
        const f = r.feats.length === 1 ? r.feats[0] : combineFeatures(r.feats, r.rid);
        const id = typeof r.rid === "number" ? r.rid : NaN;
        const key = keyById[id] || null;
        // اسم فقط برای کشورهایی که در بازی هستند؛ بقیه بی‌نام
        const name = key ? COUNTRY_NAMES[key] : "";
        const mf = mainLandFeature(f);
        const bb = d3.geoBounds(mf);
        let dLon = bb[1][0] - bb[0][0]; if (dLon < 0) dLon += 360;
        const c = d3.geoCentroid(mf);
        const sArea = Math.sqrt(d3.geoArea(mf)) * 1.7;
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

    mapRoutesSvg = mapSvg.append("g").attr("class", "map-routes-layer");
    mapSitesSvg = mapSvg.append("g").attr("class", "map-sites-layer");

    updateMapColors(); redrawMap();
    attachMapInteractions(svgEl);

    document.getElementById("map-zoom-in").onclick = () => zoomMap(1.35);
    document.getElementById("map-zoom-out").onclick = () => zoomMap(1 / 1.35);
    document.getElementById("map-reset").onclick = () => setMapSpin(!mapSpinning);
    const rb = document.getElementById("map-routes-btn");
    if (rb) {
        rb.classList.toggle("active", mapRoutesVisible);
        rb.onclick = () => {
            mapRoutesVisible = !mapRoutesVisible;
            try { localStorage.setItem("mapRoutes", mapRoutesVisible ? "on" : "off"); } catch (e) {}
            rb.classList.toggle("active", mapRoutesVisible);
            renderMapRoutes(); showToast(mapRoutesVisible ? "مسیر نیروها نمایش داده می‌شود" : "مسیر نیروها پنهان شد");
        };
    }
    document.getElementById("map-info-close").onclick = () => {
        document.getElementById("map-info-panel").classList.add("hidden");
    };
    mapInitialized = true; mapInitializing = false;

    // سکوها بعد از نمایش کره لود می‌شوند تا نقشه زودتر دیده شود
    await loadMapSites();
    renderMapSites();
    loadMapRoutes();
    redrawMap();
}

/* ---------- مسیر نیروهای در حال حرکت (برای همه) ---------- */
async function loadMapRoutes() {
    if (!mapRoutesSvg) return;
    try {
        const d = await apiGet("/api/map/transits");
        mapTransits = Array.isArray(d?.transits) ? d.transits : [];
        if (d?.now) mapRouteSkew = Date.parse(d.now) - Date.now();
    } catch (e) { mapTransits = []; }
    renderMapRoutes();
}
function renderMapRoutes() {
    if (!mapRoutesSvg) return;
    mapRoutesSvg.selectAll("*").remove();
    if (!mapRoutesVisible) return;
    const g = mapRoutesSvg.selectAll(".map-route").data(mapTransits, d => d.id).enter().append("g").attr("class", "map-route");
    g.append("path").attr("class", d => "map-route-line" + (d.country === selectedCountry ? " mine" : ""));
    g.each(function (d) {
        const s = d3.select(this).append("g").attr("class", "map-route-head")
            .on("click", e => { e.stopPropagation(); showToast(`${COUNTRY_NAMES[d.country] || d.country}: ${d.from_name} ← ${d.to_name}`.replace("←", "➜")); });
        s.append("circle").attr("class", "map-route-pulse").attr("r", 3);
        s.append("circle").attr("class", "map-route-dot").attr("r", 3.2);
        s.append("text").attr("class", "map-route-flag").attr("x", 6).attr("y", -5).text(COUNTRY_FLAGS[d.country] || "");
    });
    updateMapRoutes();
}
function updateMapRoutes() {
    if (!mapRoutesSvg || !mapProjection || !mapRoutesVisible) return;
    const rot = mapProjection.rotate(), pathGen = d3.geoPath(mapProjection);
    const now = Date.now() + mapRouteSkew;
    mapRoutesSvg.selectAll(".map-route").each(function (d) {
        const f = Math.max(0, Math.min(1, (now - Date.parse(d.start)) / Math.max(1, Date.parse(d.arrive) - Date.parse(d.start))));
        d3.select(this).select(".map-route-line").attr("d", pathGen({ type: "LineString", coordinates: [d.from_ll, d.to_ll] }) || "");
        const pos = d3.geoInterpolate(d.from_ll, d.to_ll)(f);
        const p = viewCos(pos[0], pos[1], rot) > 0.02 ? mapProjection(pos) : null;
        const head = d3.select(this).select(".map-route-head");
        if (p) head.attr("transform", `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})`).style("display", "");
        else head.style("display", "none");
    });
}
setInterval(() => {
    if (mapInitialized && !document.getElementById("map")?.classList.contains("hidden")) { loadMapRoutes(); }
}, 10000);
setInterval(() => {
    if (mapInitialized && mapTransits.length && !document.getElementById("map")?.classList.contains("hidden")) updateMapRoutes();
}, 1000);

async function refreshMapSites() {
    if (!mapSitesSvg) return;
    await loadMapSites();
    renderMapSites();
    updateMapSitePositions();
    loadMapRoutes();
}
setInterval(() => {
    if (mapInitialized && !document.getElementById("map")?.classList.contains("hidden")) refreshMapSites();
}, 15000);

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
            (!d.owner ? " site-free" : d.owner === selectedCountry ? " site-mine" : " site-other"))
        .style("display", "none")
        .on("click", (e, d) => { e.stopPropagation(); showSiteInfo(d); });
    g.append("rect").attr("class", "site-hit")
        .attr("x", -11).attr("y", -11).attr("width", 22).attr("height", 22);
    g.each(function (d) {
        const s = d3.select(this);
        if (d.kind === "strait") s.append("circle").attr("class", "site-shape").attr("r", 4.8);
        else {
            const big = d.type === "oil";
            s.append("circle").attr("class", "site-shape").attr("r", big ? 10 : 7.5);
            s.append("text").attr("class", "site-emoji").attr("text-anchor", "middle")
                .attr("dominant-baseline", "central").attr("font-size", big ? 8.5 : 5.8)
                .text(RESOURCE_ICONS[d.type] || "📍");
        }
    });
}

function updateMapSitePositions() {
    updateMapRoutes();
    if (!mapSitesSvg || !mapProjection) return;
    const rot = mapProjection.rotate();
    const zoom = mapProjection.scale() / mapSize;
    // با دورشدن کوچک می‌شوند تا روی کشورهای کوچک نیفتند؛ با نزدیک‌شدن کمی بزرگ‌تر
    const kBig = Math.max(0.32, Math.min(1.5, 0.6 * Math.pow(zoom, 0.6)));   // نفت و تنگه
    const kSmall = kBig * 0.8;                                                // معدن و غذا
    mapSitesSvg.selectAll(".map-site").each(function (d) {
        const k = ((d.kind === "strait" || d.type === "oil") ? kBig : kSmall).toFixed(2);
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

    // با اولین لمس کاربر، چرخش خودکار متوقف می‌شود
    const stopSpin = () => { if (mapSpinning) setMapSpin(false); };
    svgEl.addEventListener("mousedown", stopSpin, { signal });
    svgEl.addEventListener("touchstart", stopSpin, { passive: true, signal });
    svgEl.addEventListener("wheel", stopSpin, { passive: true, signal });
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
        ctx.fillStyle = g.fill;
        ctx.fill();
        ctx.lineWidth = 0.5; ctx.strokeStyle = g.fill; ctx.stroke();   // پوشاندن درز
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
    if (!m.key) return MAP_COLORS.nogame;   // هنوز به بازی اضافه نشده → طوسی ساده
    const info = countries[m.key];
    if (info?.occupier) return info.occupier === selectedCountry ? MAP_COLORS.own : MAP_COLORS.taken;
    if (m.key === selectedCountry) return MAP_COLORS.own;
    if (info?.taken) return MAP_COLORS.other;
    return MAP_COLORS.inactive;
}

function updateMapColors() {
    const groups = new Map();
    mapFeatures.forEach(m => {
        const fill = mapFillFor(m);
        let g = groups.get(fill);
        if (!g) { g = { fill, items: [] }; groups.set(fill, g); }
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
    document.getElementById("map-info-scan")?.classList.add("hidden");
    document.getElementById("map-info-scan-btn")?.classList.add("hidden");
    const sc = document.getElementById("map-info-strait-controls"); if(sc){sc.classList.add("hidden");sc.innerHTML="";}

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
    if (key === selectedCountry) {
        const open = player?.land_trade_open !== false;
        actionBtn.classList.remove("hidden"); actionBtn.textContent = open ? "🔒 بستن تجارت زمینی" : "🔓 باز کردن تجارت زمینی";
        actionBtn.onclick = async()=>{const d=await apiPost("/api/border/settings",{open:!open});if(!d.success){showToast(d.message||"خطا");return;}player.land_trade_open=d.open;showToast(d.open?"تجارت زمینی باز شد":"تجارت زمینی بسته شد");showCountryInfo(feature);};
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
    let controls = document.getElementById("map-info-strait-controls");
    // Compatibility fallback: ensure the strait settings host exists even if an older HTML was deployed.
    if (!controls) {
        controls = document.createElement("div");
        controls.id = "map-info-strait-controls";
        controls.className = "map-info-strait-controls hidden";
        document.getElementById("map-info-desc")?.insertAdjacentElement("afterend", controls);
    }
    if (controls) { controls.classList.add("hidden"); controls.innerHTML = ""; }

    if (site.kind === "strait") {
        flagEl.textContent = "⚓";
        const personalRule = site.country_rules?.[selectedCountry];
        const effectiveToll = site.owner === selectedCountry ? 0 : Number(personalRule?.toll ?? site.toll ?? 0);
        const effectiveClosed = site.owner === selectedCountry ? false : Boolean(personalRule?.closed ?? site.closed ?? false);
        const policyLabel = personalRule && site.owner !== selectedCountry ? "قانون ویژهٔ کشور شما" : "قانون عمومی";
        descEl.textContent = `درآمد روزانه: ${formatMoney(site.income)} · عوارض برای شما: ${effectiveToll === 0 ? "رایگان" : formatMoney(effectiveToll)} · ${effectiveClosed ? "عبور بسته" : "عبور باز"} (${policyLabel})`;
    } else {
        flagEl.textContent = RESOURCE_ICONS[site.type] || "📍";
        const zoneTxt = site.zone === "sea" ? "🌊 در دریا" : (site.zone === "land" ? "⛰️ در خشکی" : "");
        descEl.textContent = `تولید: ${formatNumber(site.production)} در روز` + (zoneTxt ? ` — ${zoneTxt}` : "")
            + ((site.type === "steel" || site.type === "uranium") ? " — تصرف: ارتش + ناو ترابری" : "");
    }
    nameEl.textContent = site.name;
    if (site.owner) {
        statusEl.innerHTML = `متعلق به ${flagInline(site.owner, true)} ${COUNTRY_NAMES[site.owner] || site.owner}`;
    } else {
        statusEl.textContent = "بی‌صاحب";
    }

    actionBtn.classList.remove("hidden");
    actionBtn.textContent = "🪖 فرستادن نیرو";
    actionBtn.onclick = () => openDispatchTo(site.id);
    if (site.kind === "strait" && site.owner === selectedCountry && controls) {
        controls.classList.remove("hidden");
        const countryOptions = Object.entries(COUNTRY_NAMES).map(([id, name]) =>
            `<option value="${id}">${COUNTRY_FLAGS[id] || "🏳️"} ${name}</option>`).join("");
        controls.innerHTML = `
            <div class="strait-control-hero"><span class="strait-control-mark">⚓</span><div><div class="strait-control-title">مدیریت تنگه</div><p>عوارض، دسترسی و استثناهای کشورها را تنظیم کن.</p></div></div>
            <section class="strait-policy-block strait-global-policy">
                <div class="strait-policy-heading"><b>قانون عمومی</b><span class="strait-policy-tag">برای همه کشورها</span></div>
                <label class="strait-policy-label" for="strait-toll-input">عوارض عمومی هر عبور ($)</label>
                <div class="strait-policy-row">
                    <input id="strait-toll-input" type="number" min="0" step="1" value="${Math.max(0, Number(site.toll || 0))}" placeholder="مثلاً 50000">
                    <button id="strait-save-btn" type="button">ذخیره عمومی</button>
                </div>
                <label class="strait-check-row"><input id="strait-closed-input" type="checkbox" ${site.closed ? "checked" : ""}><span>بستن تنگه برای همه کشورها</span></label>
            </section>
            <section class="strait-policy-block country-policy-block">
                <div class="strait-policy-heading"><b>قانون ویژه</b><span class="strait-policy-tag">فقط کشور انتخابی</span></div>
                <label class="strait-policy-label" for="strait-country-select">انتخاب کشور</label>
                <select id="strait-country-select"><option value="">انتخاب کشور...</option>${countryOptions}</select>
                <label class="strait-policy-label" for="strait-country-toll">عوارض این کشور ($)</label>
                <input id="strait-country-toll" type="number" min="0" step="1" value="${Math.max(0, Number(site.toll || 0))}" placeholder="۰ = رایگان">
                <label class="strait-check-row"><input id="strait-country-closed" type="checkbox" ${site.closed ? "checked" : ""}><span>بستن تنگه فقط برای این کشور</span></label>
                <div class="strait-policy-actions">
                    <button id="strait-country-save" type="button">ذخیره قانون ویژه</button>
                    <button id="strait-country-free" type="button">رایگان کردن</button>
                    <button id="strait-country-clear" type="button">حذف استثنا</button>
                </div>
            </section>
            <div class="strait-control-footnote"><span>ⓘ</span><p>عوارض صفر یعنی عبور رایگان. قانون ویژه فقط روی کشور انتخاب‌شده اعمال می‌شود؛ در غیر این صورت قانون عمومی فعال است. تغییرات در خبرها و اعلان‌های بازیکنان ثبت می‌شود.</p></div>`;

        const reloadSite = async (message) => {
            if (message) showToast(message, "success");
            await loadMapSites();
            const updated = mapSites.find(x => x.id === site.id);
            if (updated) showSiteInfo(updated);
        };
        const saveRule = async (payload) => {
            const d = await apiPost("/api/strait/settings", { site_id: site.id, ...payload });
            if (!d?.success) { showToast(d?.message || "ذخیره تنظیمات انجام نشد.", "error"); return false; }
            return true;
        };
        controls.querySelector("#strait-save-btn").onclick = async () => {
            const toll = Math.max(0, Math.floor(Number(controls.querySelector("#strait-toll-input").value || 0)));
            const closed = controls.querySelector("#strait-closed-input").checked;
            if (await saveRule({ toll, closed })) await reloadSite("قانون عمومی تنگه ذخیره شد؛ خبر و اعلان ثبت شد.");
        };
        const selectedRuleData = () => {
            const countryId = controls.querySelector("#strait-country-select").value;
            const rule = countryId ? site.country_rules?.[countryId] : null;
            controls.querySelector("#strait-country-toll").value = Math.max(0, Number(rule?.toll ?? site.toll ?? 0));
            controls.querySelector("#strait-country-closed").checked = Boolean(rule?.closed ?? site.closed ?? false);
            controls.querySelector("#strait-country-clear").disabled = !countryId || !rule;
            controls.querySelector("#strait-country-save").disabled = !countryId;
            controls.querySelector("#strait-country-free").disabled = !countryId;
        };
        controls.querySelector("#strait-country-select").addEventListener("change", selectedRuleData);
        controls.querySelector("#strait-country-save").onclick = async () => {
            const country_id = controls.querySelector("#strait-country-select").value;
            if (!country_id) { showToast("ابتدا کشور را انتخاب کنید.", "error"); return; }
            const toll = Math.max(0, Math.floor(Number(controls.querySelector("#strait-country-toll").value || 0)));
            const closed = controls.querySelector("#strait-country-closed").checked;
            if (await saveRule({ country_id, toll, closed })) await reloadSite("قانون ویژهٔ کشور ذخیره شد و اعلان عمومی ثبت شد.");
        };
        controls.querySelector("#strait-country-free").onclick = async () => {
            const country_id = controls.querySelector("#strait-country-select").value;
            if (!country_id) { showToast("ابتدا کشور را انتخاب کنید.", "error"); return; }
            if (await saveRule({ country_id, toll: 0, closed: false })) await reloadSite("عبور برای کشور انتخاب‌شده رایگان شد؛ اعلان عمومی ثبت شد.");
        };
        controls.querySelector("#strait-country-clear").onclick = async () => {
            const country_id = controls.querySelector("#strait-country-select").value;
            if (!country_id) { showToast("ابتدا کشور را انتخاب کنید.", "error"); return; }
            if (await saveRule({ country_id, clear_country_rule: true })) await reloadSite("قانون ویژه حذف شد و قانون عمومی اعمال می‌شود.");
        };
        selectedRuleData();
    }
    renderSiteScan(site);
    panel.classList.remove("hidden");
}

async function renderSiteScan(site) {
    const box = document.getElementById("map-info-scan"), btn = document.getElementById("map-info-scan-btn");
    if (!box || !btn) return;
    box.classList.add("hidden"); btn.classList.add("hidden");
    if (!player?.satellite_built || !site.owner || site.owner === selectedCountry) return;
    await loadScanState();
    const v = scanState.sites?.[site.id];
    if (v) {
        box.classList.remove("hidden");
        box.innerHTML = `🛰️ قدرت کل داخل: <b>${formatNumber(v.power)}</b> <small>(زنده · ${timeLeft(v.expires_at)})</small>`;
    } else {
        btn.classList.remove("hidden");
        btn.textContent = "🛰️ اسکن (۱ اسکن)";
        btn.onclick = async () => {
            try {
                const d = await apiPost("/api/satellite/scan-site", { site_id: site.id });
                if (!d.success) { showToast(d.message || "خطا"); return; }
                showToast(d.message);
                if (d.player) { player = d.player; updateHomeStats(); }
                renderSiteScan(site);
            } catch (e) { showToast("خطا."); }
        };
    }
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


/* =========================================================
   Preview Globe
========================================================= */
let previewGlobeAbort = null;


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


/* ---------- آمار کشور و صفحهٔ مستقل رفاه و امنیت ---------- */
let statsData = null, statsTimer = null, welfareTimer = null, upkeepExpanded = false;
function timeAgo(iso, now) {
    const sec = Math.max(0, (new Date(now || Date.now()) - new Date(iso)) / 1000);
    if (sec < 90) return "لحظاتی پیش";
    const m = Math.round(sec / 60); if (m < 60) return `${m} دقیقه پیش`;
    const h = Math.round(sec / 3600); if (h < 48) return `${h} ساعت پیش`;
    return `${Math.round(sec / 86400)} روز پیش`;
}
const fmt1 = v => (Math.round(v * 10) / 10).toString();
async function fetchStatsData() {
    const d = await apiGet("/api/stats");
    if (!d || d.error) throw new Error("stats_unavailable");
    statsData = d;
    return d;
}
async function loadStats() {
    const body = document.getElementById("st-body");
    try { await fetchStatsData(); }
    catch (e) {
        console.error(e);
        if (body && !statsData) body.innerHTML = `<div class="st-card st-card-plain"><p class="st-muted">خطا در دریافت آمار مالی.</p></div>`;
        return;
    }
    renderStats();
    clearInterval(statsTimer);
    statsTimer = setInterval(async () => {
        if (document.getElementById("stats")?.classList.contains("hidden")) { clearInterval(statsTimer); statsTimer = null; return; }
        try { await fetchStatsData(); renderStats(); } catch (e) { console.error(e); }
    }, 5000);
}
async function loadWelfare() {
    try { await fetchStatsData(); }
    catch (e) {
        console.error(e);
        const body = document.getElementById("welfare-body");
        if (body && !statsData) body.innerHTML = `<div class="st-card st-card-plain"><p class="st-muted">خطا در دریافت اطلاعات رفاه و امنیت.</p></div>`;
        return;
    }
    renderWelfarePage();
    clearInterval(welfareTimer);
    welfareTimer = setInterval(async () => {
        if (document.getElementById("welfare")?.classList.contains("hidden")) { clearInterval(welfareTimer); welfareTimer = null; return; }
        try { await fetchStatsData(); renderWelfarePage(); } catch (e) { console.error(e); }
    }, 5000);
}
function formatStatsAmount(v) {
    const n = Math.round(Number(v || 0));
    return n < 0 ? `−$${Math.abs(n).toLocaleString("en-US")}` : `$${n.toLocaleString("en-US")}`;
}
function renderStats() {
    const d = statsData, body = document.getElementById("st-body");
    if (!body || !d) return;
    const upkeepItems = Array.isArray(d.upkeep_items) ? d.upkeep_items : [];
    const upkeepRows = upkeepItems.length
        ? upkeepItems.map((x, i) => `<div class="st-cost-row st-upkeep-row ${i >= 2 ? `st-upkeep-extra ${upkeepExpanded ? "" : "hidden"}` : ""}"><span><i>${escapeHtml(x.icon || "🏗️")}</i><span><b>${escapeHtml(x.name || "ساختمان")}</b><small>${escapeHtml(x.group || "زیرساخت")}</small></span></span><strong>−${formatStatsAmount(x.amount)}</strong></div>`).join("")
        : `<p class="st-no-costs">هزینهٔ نگهداری روزانه‌ای برای ساختمان‌ها ثبت نشده است.</p>`;
    const net = Number(d.net_income ?? d.total_income ?? 0);
    body.innerHTML = `
        <div class="st-card st-finance-card">
            <div class="st-finance-head"><div><small>درآمد کل روزانه پیش از هزینه‌ها</small><strong>${formatStatsAmount(d.total_income)}</strong></div><span class="st-finance-icon">💰</span></div>
            <div class="st-finance-breakdown">
                <div class="st-line"><span>درآمد پایهٔ کشور</span><b>${formatStatsAmount(d.income_base)}</b></div>
                ${Number(d.income_economy || 0) ? `<div class="st-line"><span>سرمایه‌گذاری‌های اقتصادی</span><b>${formatStatsAmount(d.income_economy)}</b></div>` : ""}
                ${Number(d.income_map || 0) ? `<div class="st-line"><span>منابع نفتی و سکوهای نقشه</span><b>${formatStatsAmount(d.income_map)}</b></div>` : ""}
                ${Number(d.income_straits || 0) ? `<div class="st-line"><span>تنگه‌ها و کانال‌ها</span><b>${formatStatsAmount(d.income_straits)}</b></div>` : ""}
                ${Number(d.income_occupation || 0) ? `<div class="st-line"><span>کشورهای اشغال‌شده</span><b>${formatStatsAmount(d.income_occupation)}</b></div>` : ""}
                <div class="st-line st-income-bonus"><span>درآمد اضافهٔ رفاه (${fmt1(Number(d.bonus || 0))}٪)</span><b>+${formatStatsAmount(d.welfare_extra_income)}</b></div>
            </div>
            <div class="st-total-divider"></div>
            <div class="st-line st-gross-total"><span>درآمد کل روزانه</span><b>${formatStatsAmount(d.total_income)}</b></div>
            <div class="st-cost-heading"><span>کسرهای روزانهٔ نگهداری</span><strong>−${formatStatsAmount(d.daily_upkeep)}</strong></div>
            <div class="st-upkeep-list">${upkeepRows}</div>
            ${upkeepItems.length > 2 ? `<button class="st-upkeep-toggle" id="st-upkeep-toggle" type="button">${upkeepExpanded ? "نمایش کمتر" : `مشاهدهٔ بیشتر (${upkeepItems.length - 2})`} <span>${upkeepExpanded ? "⌃" : "⌄"}</span></button>` : ""}
            <div class="st-net-panel"><div><small>درآمد خالص روزانه پس از هزینه‌ها</small><strong class="${net >= 0 ? "is-positive" : "is-negative"}">${formatStatsAmount(net)}</strong></div><span>${net >= 0 ? "✓ مبلغ باقی‌مانده" : "⚠ هزینه‌ها بیشتر از درآمدند"}</span></div>
            <p class="st-text st-finance-note">درآمد خالص از جمع درآمد پایه، اقتصاد، نقشه، تنگه‌ها و رفاه پس از کسر هزینهٔ نگهداری به‌دست می‌آید. خزانه طبق همین نرخ و در طول زمان به‌روزرسانی می‌شود.</p>
        </div>`;
    const toggle = body.querySelector("#st-upkeep-toggle");
    if (toggle) toggle.addEventListener("click", () => {
        upkeepExpanded = !upkeepExpanded;
        renderStats();
    });
}
function renderWelfarePage() {
    const d = statsData, body = document.getElementById("welfare-body");
    if (!body || !d) return;
    const bonus = Number(d.bonus || 0), max = Math.max(1, Number(d.max || 50));
    const gross = Number(d.gross || 0), penalty = Number(d.penalty || 0);
    const risks = Array.isArray(d.risks) ? d.risks : [];
    const events = Array.isArray(d.events) ? d.events : [];
    const buildings = Array.isArray(d.buildings) ? d.buildings : [];
    const pct = Math.min(100, bonus / max * 100);
    body.innerHTML = `
        <div class="st-card welfare-hero-card">
            <div class="st-box st-box-row"><div class="st-box-title"><span class="st-shield">🛡️</span><b>پاداش رفاه فعلی</b><small>اثر روی درآمد کل کشور</small></div><strong class="st-good">+${fmt1(bonus)}٪</strong></div>
            <div class="st-bar"><div class="st-bar-fill" style="width:${pct}%"></div></div>
            <div class="st-line"><span>پاداش ساخته‌شده از ساختمان‌ها</span><b class="st-good-soft">+${fmt1(gross)}٪</b></div>
            ${penalty > 0 ? `<div class="st-line"><span>کاهش موقت رویدادها</span><b class="st-bad-soft">−${fmt1(penalty)}٪</b></div>` : ""}
            <div class="st-line"><span>سقف پاداش</span><b>${fmt1(max)}٪</b></div>
            <div class="st-line"><span>افزایش درآمد روزانه</span><b class="st-good-soft">+${formatStatsAmount(d.welfare_extra_income)}</b></div>
        </div>
        <div class="st-card welfare-buildings-card">
            <div class="welfare-card-heading"><span>🏥</span><div><b>ساختمان‌های مرتبط</b><small>برای دیدن ساخت و ارتقا وارد زیرساخت شوید</small></div></div>
            <div class="welfare-building-chips">${buildings.length ? buildings.map(b => `<span>${escapeHtml(b.icon || "🏗️")} ${escapeHtml(b.name || "ساختمان رفاهی")}</span>`).join("") : `<span>ساختمان رفاهی تعریف نشده است</span>`}</div>
            <button type="button" class="iws-details-button" id="welfare-open-infra">رفتن به زیرساخت‌های رفاه و امنیت ←</button>
        </div>
        <div class="st-card st-card-plain welfare-events-card">
            <h3>رویدادها و امنیت</h3>
            <p class="st-muted">رویدادهای محتمل در کشور شما: ${risks.length ? escapeHtml(risks.join("، ")) : "—"}</p>
            <p class="st-text">بیمارستان، پلیس، شهرک مسکونی، دانشگاه و مترو می‌توانند احتمال یا شدت برخی رویدادها را کاهش دهند. افت رفاه به‌مرور جبران می‌شود.</p>
            <div class="welfare-events-heading">رویدادهای اخیر</div>
            <ul class="st-events">${events.length ? events.map(e => `<li><span class="st-ev-text">${escapeHtml(e.text || "")}</span><span class="st-ev-time">${timeAgo(e.at, d.now)}</span></li>`).join("") : `<li><span class="st-ev-text">هنوز رویدادی رخ نداده است.</span></li>`}</ul>
        </div>`;
    body.querySelector("#welfare-open-infra")?.addEventListener("click", async () => {
        showGamePage("infrastructure");
        await refreshPlayer();
        renderInfraTab("welfare");
    });
}

/* =========================================================
   آمار کشور (راهنمای «رفاه و درآمد»)
========================================================= */
function closeStatsHelp() { document.getElementById("stats-help-sheet")?.remove(); }
document.getElementById("st-help-btn")?.addEventListener("click", () => {
    closeStatsHelp();
    const ov = document.createElement("div");
    ov.id = "stats-help-sheet";
    ov.className = "modal-overlay";
    ov.innerHTML = `
        <div class="st-sheet">
            <div class="st-sheet-head">
                <h3>رفاه و امنیت کشور</h3>
                <button class="st-sheet-close" aria-label="بستن">✕</button>
            </div>
            <div class="st-sheet-body">
                <p><b>رفاه:</b> بیمارستان، ایستگاه پلیس، شهرک مسکونی، مترو و دانشگاه با هم پاداش رفاه را می‌سازند. هر سطح این ساختمان‌ها ۲٪ اضافه می‌کند و مجموع پاداش حداکثر ۵۰٪ است.</p>
                <p><b>اثر اقتصادی:</b> این درصد روی درآمد کل روزانه اعمال می‌شود؛ مقدار افزایش رفاه، درآمد کل، هزینهٔ نگهداری و درآمد خالص در آمار کشور جداگانه نمایش داده می‌شوند.</p>
                <p><b>امنیت و رویدادها:</b> زلزله، موج سرقت، همه‌گیری، قحطی و خشکسالی ممکن است پاداش رفاه را موقتاً کاهش دهند. ساختمان مربوط به هر رویداد، احتمال و شدت خسارت آن را کمتر می‌کند.</p>
                <p><b>بازیابی:</b> افت رفاه به‌مرور جبران می‌شود؛ هر ۶ ساعت ۳ واحد از جریمه کم می‌شود و پاداش نهایی هیچ‌وقت از صفر کمتر نمی‌شود. آمار زنده، مقدار پاداش، خسارت فعلی و رویدادهای اخیر را نشان می‌دهد.</p>
            </div>
        </div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) closeStatsHelp(); });
    ov.querySelector(".st-sheet-close").onclick = closeStatsHelp;
});


/* =========================================================
   In-game UI: custom dropdowns + confirm dialogs
   (جایگزین منوی سیستمی select و پنجرهٔ confirm مرورگر)
========================================================= */
function gameConfirm(message, opts = {}) {
    return new Promise(resolve => {
        const ov = document.createElement("div");
        ov.className = "gs-overlay";
        ov.innerHTML = `<div class="gs-dialog">
            <div class="gs-dialog-title">${escapeHtml(opts.title || "تأیید")}</div>
            <div class="gs-dialog-msg">${escapeHtml(message).replace(/\n/g, "<br>")}</div>
            <div class="gs-dialog-actions">
                <button class="gs-dbtn ${opts.danger ? "danger" : "ok"}" data-r="1">${escapeHtml(opts.ok || "ادامه")}</button>
                <button class="gs-dbtn cancel" data-r="0">${escapeHtml(opts.cancel || "انصراف")}</button>
            </div></div>`;
        const done = v => { ov.remove(); resolve(v); };
        ov.addEventListener("click", e => {
            const b = e.target.closest(".gs-dbtn");
            if (b) done(b.dataset.r === "1"); else if (e.target === ov) done(false);
        });
        document.body.appendChild(ov);
    });
}

function openSelectSheet(sel) {
    const title = sel.dataset.title || (sel.options[0] && !sel.options[0].value ? sel.options[0].textContent : "انتخاب");
    const ov = document.createElement("div");
    ov.className = "gs-overlay gs-bottom";
    const items = Array.from(sel.options).map((o, i) => o.value === "" && i === 0 && sel.options.length > 1 && false ? "" :
        `<button type="button" class="gs-opt ${o.selected ? "sel" : ""}" data-i="${i}" ${o.disabled ? "disabled" : ""}>
            <span>${escapeHtml(o.textContent)}</span>${o.selected ? "<i>✓</i>" : ""}</button>`).join("");
    ov.innerHTML = `<div class="gs-sheet"><div class="gs-sheet-head"><button type="button" class="gs-x" aria-label="بستن">✕</button><span>${escapeHtml(title)}</span></div>
        <div class="gs-sheet-list">${items || '<div class="gs-none">گزینه‌ای موجود نیست.</div>'}</div></div>`;
    ov.addEventListener("click", e => {
        if (e.target === ov || e.target.closest(".gs-x")) { ov.remove(); return; }
        const b = e.target.closest(".gs-opt");
        if (!b || b.disabled) return;
        sel.selectedIndex = Number(b.dataset.i);
        sel.dispatchEvent(new Event("input", { bubbles: true }));
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        ov.remove();
    });
    document.body.appendChild(ov);
    const cur = ov.querySelector(".gs-opt.sel"); if (cur) cur.scrollIntoView({ block: "center" });
}

function enhanceSelect(sel) {
    if (sel._gs || sel.multiple) return;
    sel._gs = true;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gs-btn " + sel.className;
    sel.classList.add("gs-hidden");
    sel.parentNode.insertBefore(btn, sel);
    const refresh = () => {
        const o = sel.options[sel.selectedIndex];
        btn.textContent = o ? o.textContent : "";
        btn.classList.toggle("gs-placeholder", !o || o.value === "");
        btn.disabled = sel.disabled;
    };
    for (const prop of ["value", "selectedIndex"]) {
        const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
        Object.defineProperty(sel, prop, { configurable: true,
            get() { return d.get.call(this); },
            set(v) { d.set.call(this, v); refresh(); } });
    }
    btn.addEventListener("click", () => { if (!sel.disabled) openSelectSheet(sel); });
    sel.addEventListener("change", refresh);
    new MutationObserver(refresh).observe(sel, { childList: true, subtree: true, attributes: true, characterData: true });
    refresh();
}

function enhanceAllSelects(root = document) {
    root.querySelectorAll?.("select").forEach(enhanceSelect);
}
enhanceAllSelects();
new MutationObserver(muts => {
    for (const m of muts) m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.tagName === "SELECT") enhanceSelect(n); else enhanceAllSelects(n);
    });
}).observe(document.body, { childList: true, subtree: true });


/* ---------- راهنمای نقشه (دکمهٔ ؟ بالا-راست باکس نقشه) ---------- */
document.getElementById("map-help-btn")?.addEventListener("click", () => {
    const src = document.getElementById("map-legend-src");
    const ov = document.createElement("div");
    ov.className = "gs-overlay gs-bottom";
    ov.innerHTML = `<div class="gs-sheet"><div class="gs-sheet-head"><button type="button" class="gs-x" aria-label="بستن">✕</button><span>راهنمای نقشه</span></div>
        <div class="gs-sheet-list"><div class="map-legend map-legend-pop">${src ? src.innerHTML : ""}</div></div></div>`;
    ov.addEventListener("click", e => { if (e.target === ov || e.target.closest(".gs-x")) ov.remove(); });
    document.body.appendChild(ov);
});
