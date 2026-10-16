const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    try {
        tg.setHeaderColor('#0A0612');
        tg.setBackgroundColor('#0A0612');
        tg.setBottomBarColor('#150C26');
    } catch (e) {}
}

const userId = tg?.initDataUnsafe?.user?.id || null;
const initData = tg?.initData || "";
const worldIdKey = () => `fl93_world_id_${userId || "guest"}`;
let selectedWorldId = (() => { try { return String(localStorage.getItem(worldIdKey()) || localStorage.getItem("fl93_world_id") || "1"); } catch { return "1"; } })();
const worldChoiceKey = () => `fl93_world_chosen_${userId || "guest"}`;
let lastUserActionButton = null;
let lastActionErrorMessage = "";
let lastActionErrorAt = 0;
let availableWorlds = [];
let adminWarsCache = [];
let adminWorldsCache = [];
let adminUnMessagesCache = [];
let adminAutoRefreshTimer = null;

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

const COUNTRY_IMAGE_EXT = { germany: "png", britain: "jfif", ussr: "jfif", usa: "jfif",
    france: "jfif", italy: "jfif", china: "jfif", japan: "jfif",
    saudi: "jpg", iran: "jpg", turkey: "jpg", venezuela: "jpg", egypt: "jpg" };
const COUNTRY_FLAGS = { germany: "🇩🇪", britain: "🇬🇧", ussr: "☭", usa: "🇺🇸",
    france: "🇫🇷", italy: "🇮🇹", china: "🇨🇳", japan: "🇯🇵",
    saudi: "🇸🇦", iran: "🇮🇷", turkey: "🇹🇷", venezuela: "🇻🇪", egypt: "🇪🇬" };
const TREATY_TYPE_NAMES = { alliance: "پیمان اتحاد", non_aggression: "پیمان عدم تجاوز" };
const COUNTRY_NAMES = { germany: "آلمان", britain: "بریتانیا", ussr: "شوروی", usa: "آمریکا",
    france: "فرانسه", italy: "ایتالیا", china: "چین", japan: "ژاپن",
    saudi: "عربستان", iran: "ایران", turkey: "ترکیه", venezuela: "ونزوئلا", egypt: "مصر" };
const COUNTRY_IDS = { germany: 276, britain: 826, ussr: 643, usa: 840,
    france: 250, italy: 380, china: 156, japan: 392,
    saudi: 682, iran: 364, turkey: 792, venezuela: 862, egypt: 818 };

let ARMY_UNITS = {};

const RESOURCE_NAMES = { food: "غذا", steel: "آهن", uranium: "اورانیوم", oil: "نفت" };
const RESOURCE_ICONS = { food: "🌾", steel: "⚙️", uranium: "☢️", oil: "🛢️" };
const GROUP_ICONS = { land: "🪖", naval: "⚓", air: "✈️", missile: "🚀", strategy: "🛰️" };
const GROUP_TITLES = { land: "زمینی", naval: "دریایی", air: "هوایی", missile: "موشکی", strategy: "استراتژیک" };

// [طول, عرض, اسم, حداقل زوم, حداکثر زوم] — اقیانوس‌ها همیشه، دریاها فقط با زوم بیشتر
const OCEAN_LABELS = [
    [-35, 25, "اقیانوس اطلس", 0, 3.2], [-18, -22, "اقیانوس اطلس", 0, 3.2],
    [-145, 5, "اقیانوس آرام", 0, 3.2], [172, 8, "اقیانوس آرام", 0, 3.2],
    [78, -18, "اقیانوس هند", 0, 3.2],
    [20, -62, "اقیانوس منجمد جنوبی", 0, 3.2], [60, 82, "اقیانوس منجمد شمالی", 0, 3.2],
    [18, 34.5, "دریای مدیترانه", 2.7, 12], [34, 43.3, "دریای سیاه", 2.7, 12],
    [65, 15, "دریای عرب", 2.7, 12], [88, 14, "خلیج بنگال", 2.7, 12],
    [3, 56, "دریای شمال", 2.7, 12], [19.5, 58.5, "دریای بالتیک", 2.7, 12],
    [-74, 15, "دریای کارائیب", 2.7, 12], [-90, 25, "خلیج مکزیک", 2.7, 12],
    [114, 13, "دریای چین جنوبی", 2.7, 12], [134, 40, "دریای ژاپن", 2.7, 12],
    [38.5, 20.5, "دریای سرخ", 2.7, 12], [40, 73, "دریای بارنتس", 2.7, 12],
    [52, 27.2, "خلیج فارس", 2.7, 12], [2, 68, "دریای نروژ", 2.7, 12],
    [160, -38, "دریای تاسمان", 2.7, 12]
];

/* =========================================================
   API Client
========================================================= */
function getApiUrl(path, params = {}) {
    const url = new URL(path, window.location.origin);
    url.searchParams.set("world_id", String(selectedWorldId || "1"));
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
        let parsed;
        try { parsed = JSON.parse(text); }
        catch { return { error: "invalid_json", raw: text }; }
        if (path === "/api/player") handleActivityNotices(parsed);
        return parsed;
    } finally { clearTimeout(to); }
}

async function apiPost(path, body = {}, params = {}) {
    const url = getApiUrl(path, params);
    const headers = { "Content-Type": "application/json" };
    if (initData) headers["X-Telegram-Init-Data"] = initData;
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 15000);
    const focusedButton = document.activeElement?.closest?.("button");
    const actionButton = focusedButton || lastUserActionButton;
    try {
        const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body),
            signal: controller.signal });
        const text = await r.text();
        let result;
        try { result = JSON.parse(text); }
        catch { result = { success: false, error: "invalid_json", raw: text }; }
        const message = String(result?.message || result?.detail || "");
        const errorText = `${message} ${result?.error || ""} ${result?.code || ""}`;
        const isInsufficient = /کافی نیست|کافی ندارید|پول کافی|خزانه.*کافی|موجودی.*کافی|not[_ -]?enough|insufficient(?:[_ -]funds)?/i.test(errorText)
            || (/(منابع|برق|نیروی انسانی|تعداد این یگان)/.test(errorText) && /کافی|کمبود/.test(errorText));
        if (result?.success === false && isInsufficient) {
            lastActionErrorMessage = message || (/money|funds|پول|خزانه/i.test(errorText) ? "پول کافی نیست." : "منابع کافی نیست.");
            lastActionErrorAt = Date.now();
            if (actionButton?.isConnected) {
                actionButton.classList.add("action-denied");
                actionButton.title = lastActionErrorMessage;
                actionButton.dataset.actionError = lastActionErrorMessage;
                if (!actionButton.querySelector(".action-error-inline")) {
                    const note = document.createElement("span");
                    note.className = "action-error-inline";
                    note.textContent = /پول|خزانه/.test(lastActionErrorMessage) ? "پول کافی نیست" : "منابع کافی نیست";
                    actionButton.appendChild(note);
                }
            }
        }
        if (result?.player && typeof result.player === "object") result.player._clientAt = Date.now();
        if (result?.success) {
            if (result.completion_message) enqueueActivityToast(result.completion_message, null);
            handleActivityNotices(result.player);
        }
        return result;
    } finally { clearTimeout(to); }
}

document.addEventListener("click", event => {
    const button = event.target?.closest?.("button");
    if (!button) return;
    lastUserActionButton = button;
    button.classList.remove("action-denied");
    button.querySelector(".action-error-inline")?.remove();
    button.removeAttribute("data-action-error");
});

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

// تصویر پس‌زمینهٔ کارت بیانیه (جدا از پرچم و تصویر خانه)
function annBackgroundUrl(cid) {
    return `/images/announcements/${cid}.jpg`;
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
    if (t) { t.classList.remove("hidden"); t.scrollTop = 0; if (id === "admin") document.getElementById("admin-scroll")?.scrollTo(0,0); }
    if (player?.country) updateSeasonGateBanner();
    const header = document.querySelector("#game .game-header");
    if (header) header.style.transform = "translate3d(0, 0, 0)";
}

function formatMoney(v) { return "$" + Math.round(Number(v ?? 0)).toLocaleString("en-US"); }
function formatNumber(v) { return Math.round(Number(v ?? 0)).toLocaleString("en-US"); }


let toastTimer = null;
function showToast(msg, kind, ms) {
    if (/^خطا[.!…]*$/.test(String(msg || "").trim()) && lastActionErrorMessage && Date.now() - lastActionErrorAt < 8000) {
        msg = lastActionErrorMessage;
        kind = "error";
    }
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
    toastTimer = setTimeout(() => el.classList.remove("show"), ms || 3500);
}

/* =========================================================
   اعلان پایان فعالیت (ساخت، ارتقا، آموزش یگان، ماهواره، حمل کالا و ...)
   - کار فوری: سرور در پاسخ همان درخواست completion_message می‌فرستد و بلافاصله نمایش داده می‌شود.
   - کار زمان‌دار: سرور در لحظهٔ پایان، اعلان را در player.activity_notices ثبت می‌کند. تا وقتی
     نمایش آن به سرور تأیید نشده (ack) در حساب بازیکن می‌ماند؛ پس اگر بازی بسته بوده، در ورود بعدی
     دقیقاً یک بار نشان داده می‌شود و سپس حذف می‌گردد.
   - اعلان‌ها پشت‌سرهم (صف) نمایش داده می‌شوند تا هیچ‌کدام زیر دیگری گم نشود.
========================================================= */
const ACTIVITY_TOAST_MS = 4200;
const shownActivityNoticeIds = new Set();   // جلوگیری از نمایش دوباره در همین نشست (پولینگ هر ۲.۵ ثانیه)
const pendingActivityAcks = new Set();      // شناسه‌هایی که نمایششان دیده شده ولی هنوز به سرور تأیید نشده
const activityToastQueue = [];
let activityToastBusy = false, activityAckInFlight = false;

function enqueueActivityToast(text, noticeId) {
    if (!text) return;
    activityToastQueue.push({ text: String(text), id: noticeId || null });
    pumpActivityToasts();
}
function pumpActivityToasts() {
    // وقتی برنامه در پس‌زمینه است نمایش نمی‌دهیم تا بازیکن اعلان را از دست ندهد؛ با بازگشت ادامه می‌یابد.
    if (activityToastBusy || document.hidden) return;
    const item = activityToastQueue.shift();
    if (!item) return;
    activityToastBusy = true;
    showToast(item.text, "success", ACTIVITY_TOAST_MS);
    if (item.id) { pendingActivityAcks.add(item.id); flushActivityAcks(); }
    setTimeout(() => { activityToastBusy = false; pumpActivityToasts(); }, ACTIVITY_TOAST_MS + 250);
}
async function flushActivityAcks() {
    if (activityAckInFlight || !pendingActivityAcks.size) return;
    activityAckInFlight = true;
    const ids = Array.from(pendingActivityAcks);
    try {
        const r = await apiPost("/api/activity-notices/ack", { ids });
        if (r && r.success) ids.forEach(id => pendingActivityAcks.delete(id));
    } catch (e) { /* در نوبت بعدی دوباره تلاش می‌شود */ }
    finally { activityAckInFlight = false; }
}
function handleActivityNotices(p) {
    if (!p || !Array.isArray(p.activity_notices)) return;
    if (userId && p.user_id != null && String(p.user_id) !== String(userId)) return;
    for (const n of p.activity_notices) {
        if (!n || !n.id || shownActivityNoticeIds.has(n.id)) continue;
        shownActivityNoticeIds.add(n.id);
        enqueueActivityToast(n.text, n.id);
    }
    if (pendingActivityAcks.size) flushActivityAcks();   // تأییدهای ناموفق قبلی
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) pumpActivityToasts(); });


async function loadArmyCatalog() {
    try { ARMY_UNITS = (await apiGet("/api/army-units")).units || {}; }
    catch (e) { console.error("Army catalog:", e); }
}

const RESOURCE_SHORTAGE_WARN_DAYS = 10;   // اگر موجودی با روند فعلی تا این تعداد روز تمام شود، هشدار نمایش داده می‌شود

function resourceEtaLabel(amount, dailyDeficit) {
    if (amount <= 0) return "همین حالا تمام شده است";
    if (!(dailyDeficit > 0)) return "";
    const totalDays = amount / dailyDeficit;
    if (totalDays < 1) {
        const hours = Math.max(1, Math.floor(totalDays * 24));
        return `${formatNumber(hours)} ساعت دیگر تمام می‌شود`;
    }
    return `${formatNumber(Math.floor(totalDays))} روز دیگر تمام می‌شود`;
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
            // فقط یک خط: تولید (سبز) اگر از مصرف بیشتر است، مصرف (قرمز) اگر از تولید بیشتر است.
            let rateLine = "";
            if (rate > use) {
                rateLine = `<div class="resource-chip-rate up"><span>تولید روزانه</span><b>▲ ${formatNumber(rate)}</b></div>`;
            } else if (use > rate) {
                rateLine = `<div class="resource-chip-rate down"><span>مصرف روزانه</span><b>▼ ${formatNumber(use)}</b></div>`;
            }
            // هشدار فقط وقتی منبع کمبود دارد و حداکثر ۱۰ روز دیگر تمام می‌شود.
            let warnLine = "";
            if (net < 0 && (amt <= 0 || amt / Math.abs(net) <= RESOURCE_SHORTAGE_WARN_DAYS)) {
                warnLine = `<div class="resource-warn">⚠️ کمبود: ${resourceEtaLabel(amt, Math.abs(net))}</div>`;
            }
            chip.innerHTML = `
                <div class="resource-chip-top"><span>${RESOURCE_ICONS[key]} ${RESOURCE_NAMES[key]}</span></div>
                <div class="resource-chip-value">${formatNumber(amt)}</div>
                ${rateLine}${warnLine}`;
            chip.classList.toggle("selected", resourceDetailKey === key);
            chip.style.cursor = "pointer";
            chip.addEventListener("click", () => { resourceDetailKey = resourceDetailKey === key ? null : key; resourceDetailMore = { sites: false, units: false }; renderResourceBars(); });
            bar.appendChild(chip);
        });
        if (resourceDetailKey) bar.appendChild(buildResourceDetail(resourceDetailKey));
    });
}
let resourceDetailKey = null;
let resourceDetailMore = { sites: false, units: false };
function buildResourceDetail(key) {
    const bd = player.resource_breakdown?.[key] || { infra: 0, sites: [], units: [] };
    const pm = bd.prod_mult ?? 1, cm = bd.cons_mult ?? 1;
    const row = (l, v, cls) => `<div class="rd-row ${cls || ""}"><span>${l}</span><b>${v}</b></div>`;
    let h = `<div class="rd-title">${RESOURCE_ICONS[key]} جزئیات ${RESOURCE_NAMES[key]}</div>`;
    if (bd.infra) h += row("تولید ساختمان‌ها", "+" + formatNumber(bd.infra * pm), "up");
    const sites = bd.sites || [];
    if (sites.length) {
        h += row(`دارایی‌های نقشه (${formatNumber(sites.length)} مورد)`, "+" + formatNumber(sites.reduce((t, x) => t + x.amount, 0) * pm), "up");
        (resourceDetailMore.sites ? sites : sites.slice(0, 2)).forEach(x => { h += row("• " + escapeHtml(x.name), "+" + formatNumber(x.amount * pm), "sub"); });
        if (sites.length > 2) h += `<button type="button" class="rd-more" data-more="sites">${resourceDetailMore.sites ? "نمایش کمتر" : `نمایش همه (${formatNumber(sites.length - 2)} مورد دیگر)`}</button>`;
    }
    const units = bd.units || [];
    if (units.length) {
        h += row("مصرف نیروها", "−" + formatNumber(units.reduce((t, x) => t + x.amount, 0) * cm), "down");
        (resourceDetailMore.units ? units : units.slice(0, 2)).forEach(x => { h += row(`• ${escapeHtml(x.name)} × ${formatNumber(x.count)}`, "−" + formatNumber(x.amount * cm), "sub"); });
        if (units.length > 2) h += `<button type="button" class="rd-more" data-more="units">${resourceDetailMore.units ? "نمایش کمتر" : `نمایش همه (${formatNumber(units.length - 2)} مورد دیگر)`}</button>`;
    }
    const rate = Number(player.resource_production?.[key] ?? 0), use = Number(player.resource_consumption?.[key] ?? 0);
    h += row("خالص روزانه", (rate - use >= 0 ? "+" : "−") + formatNumber(Math.abs(rate - use)), rate - use >= 0 ? "up" : "down");
    const d = document.createElement("div");
    d.className = "resource-detail";
    d.innerHTML = h;
    d.querySelectorAll(".rd-more").forEach(b => b.addEventListener("click", () => { const k = b.dataset.more; resourceDetailMore[k] = !resourceDetailMore[k]; renderResourceBars(); }));
    return d;
}
let worldAtlasPromise = null;
async function loadWorldAtlas() {
    if (worldData) return worldData;
    if (!worldAtlasPromise) {
        worldAtlasPromise = fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
            .then(r => r.json())
            .then(d => { worldData = d; return d; })
            .catch(e => { worldAtlasPromise = null; throw e; });
    }
    return worldAtlasPromise;
}
// داده‌ی کره از قبل و در زمان بیکاری دانلود می‌شود تا با باز کردن نقشه آماده باشد
window.addEventListener("load", () => setTimeout(() => { loadWorldAtlas().catch(() => {}); }, 1200));

async function fetchAvailableWorlds() {
    const data = await apiGet("/api/worlds");
    availableWorlds = Array.isArray(data?.worlds) ? data.worlds : [];
    if (!availableWorlds.length) availableWorlds = [{ id: 1, name: "دنیای ۱", players: 0, countries_taken: 0 }];
    if (!availableWorlds.some(w => String(w.id) === String(selectedWorldId))) selectedWorldId = String(availableWorlds[0].id);
    renderWorldChoices();
    return availableWorlds;
}

let enteringWorld = false;
function renderWorldChoices() {
    const list = document.getElementById("world-select-list");
    if (!list) return;
    if (!availableWorlds.length) { list.innerHTML = `<div class="world-empty">فعلاً دنیایی برای نمایش وجود ندارد.</div>`; return; }
    list.innerHTML = availableWorlds.map(w => {
        const status = w.game_finished ? `پایان‌یافته · برنده: ${escapeHtml(w.winner?.name || "—")}`
            : w.game_started ? `روز ${w.day} از ۳۱ · ${escapeHtml(w.season || "")}${w.registration_open ? " · ثبت‌نام باز" : " · ثبت‌نام بسته"}`
            : (w.registration_open ? "در انتظار شروع فرمانده · ثبت‌نام باز" : "در انتظار شروع فرمانده · ثبت‌نام بسته");
        return `<button type="button" class="world-select-card" data-world-choice="${w.id}" aria-label="ورود به ${escapeHtml(w.name || `دنیای ${w.id}`)}">
            <span class="world-select-globe">🌍</span><span class="world-select-info"><b>${escapeHtml(w.name || `دنیای ${w.id}`)}</b><small>${formatNumber(w.players || 0)} بازیکن · ${formatNumber(w.countries_taken || 0)} کشور انتخاب‌شده</small><small>${status}</small></span><span class="world-select-check">↵</span>
        </button>`;
    }).join("");
    list.querySelectorAll("[data-world-choice]").forEach(b => b.addEventListener("click", () => {
        if (enteringWorld) return;
        selectedWorldId = String(b.dataset.worldChoice);
        try {
            localStorage.setItem("fl93_world_id", selectedWorldId);
            localStorage.setItem(worldIdKey(), selectedWorldId);
            localStorage.setItem(worldChoiceKey(), "1");
        } catch {}
        enterSelectedWorld();
    }));
}

async function showWorldSelection() {
    showOnly("world-select");
    try { await fetchAvailableWorlds(); } catch (e) { console.error("World list:", e); renderWorldChoices(); }
}

async function enterSelectedWorld() {
    if (enteringWorld) return;
    enteringWorld = true;
    try {
        try {
            localStorage.setItem("fl93_world_id", String(selectedWorldId));
            localStorage.setItem(worldIdKey(), String(selectedWorldId));
            localStorage.setItem(worldChoiceKey(), "1");
        } catch {}
        showOnly("loading");
        await fetchAvailableWorlds();
        await loadCountries();
        await loadPlayer();
        await loadArmyCatalog();
        if (player?.country && !player?.is_eliminated) showGame();
        else if (player?.registration_open && !player?.is_eliminated && !player?.game_finished) {
            await Promise.all(Object.keys(COUNTRY_IMAGE_EXT).map(cid => preloadImage(countryImageUrl(cid))));
            showCountrySelection();
        } else {
            const msg = document.getElementById("registration-closed-message");
            if (msg) msg.textContent = player?.is_eliminated
                ? "کشور شما اشغال شده و از دور جاری حذف شده‌اید؛ این حساب نمی‌تواند دوباره وارد همین دور شود."
                : player?.game_finished
                    ? "این بازی ۳۱روزه تمام شده است و ثبت‌نام دوباره امکان‌پذیر نیست."
                    : "ثبت‌نام این دنیا بسته است. برای انتخاب کشور آزاد باید منتظر بازگشایی ثبت‌نام توسط فرمانده بمانید.";
            showOnly("registration-closed");
        }
    } catch (e) {
        console.error(e); showToast("ورود به دنیا ناموفق بود. دوباره تلاش کن.", "error"); showOnly("world-select"); renderWorldChoices();
    } finally {
        enteringWorld = false;
    }
}

document.getElementById("country-change-world")?.addEventListener("click", showWorldSelection);
document.getElementById("registration-back-worlds")?.addEventListener("click", showWorldSelection);

/* =========================================================
   Player / Countries
========================================================= */
async function loadPlayer() {
    if (!userId) return;
    try {
        player = await apiGet("/api/player");
        if (player) player._clientAt = Date.now();
        if (player?.reset_notice) {
            const note = player.reset_notice;
            setTimeout(() => gameConfirm(note, { title: "ریست شدید", ok: "متوجه شدم", cancel: "بستن" }), 300);
        }
        selectedCountry = player?.country || null;
    } catch (e) { console.error(e); }
}

async function refreshPlayer() {
    if (!userId || playerRefreshInFlight) return;
    playerRefreshInFlight = true;
    try {
        const fresh = await apiGet("/api/player");
        if (fresh && !fresh.error) {
            if (fresh.reset_notice) { await handlePlayerReset(fresh); return; }
            player = fresh; player._clientAt = Date.now();
            selectedCountry = player?.country || null;
            const gameScreen = document.getElementById("game");
            const closedScreen = document.getElementById("registration-closed");
            const isInGame = Boolean(gameScreen && !gameScreen.classList.contains("hidden"));
            const isRegistrationClosed = Boolean(closedScreen && !closedScreen.classList.contains("hidden"));
            const countryless = !player.country || player.is_eliminated;
            if (countryless && !player.is_eliminated && player.registration_open && !player.game_finished && (isInGame || isRegistrationClosed)) {
                await loadCountries();
                showCountrySelection();
                return;
            }
            if (countryless && isInGame) {
                const msg = document.getElementById("registration-closed-message");
                if (msg) msg.textContent = player.is_eliminated
                    ? "کشور شما اشغال شده و از دور جاری حذف شده‌اید؛ این حساب نمی‌تواند دوباره وارد همین دور شود."
                    : "ثبت‌نام این دنیا بسته است. اگر فرمانده ثبت‌نام را بازگشایی کند، می‌توانید یکی از کشورهای آزاد را انتخاب کنید.";
                showOnly("registration-closed");
                return;
            }
            updateHomeStats();
            // اگر کاربر در همین لحظه در صفحات مالی/رفاه باشد، اعداد سربرگ هم زنده بمانند.
            document.querySelectorAll(".sb-money").forEach(e => { e.textContent = formatMoney(player.money); });
        }
    } catch (e) { if (e.name !== "AbortError") console.error(e); }
    finally { playerRefreshInFlight = false; }
}

async function handlePlayerReset(p) {
    stopStatsPolling();
    player = null; selectedCountry = null;
    document.getElementById("game")?.classList.remove("booting");
    await gameConfirm(p.reset_notice || "ریست شدید.", { title: "ریست شدید", ok: "متوجه شدم", cancel: "بستن" });
    await showWorldSelection();
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
    }, 10000);
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
        if (c.taken || c.occupier) {
            if (player?.country === cid) card.classList.remove("taken");
            else card.classList.add("taken");
        } else card.classList.remove("taken");
    });
}

document.querySelectorAll("[data-country-card]").forEach(card => {
    card.addEventListener("click", () => {
        const cid = card.dataset.country;
        const c = countries[cid];
        if ((c?.taken || c?.occupier) && player?.country !== cid) {
            showMessage(c?.occupier ? `این کشور مستعمرهٔ ${COUNTRY_NAMES[c.occupier] || c.occupier} است و قابل انتخاب نیست.` : "این کشور قبلاً انتخاب شده است."); return;
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
            if (data.error === "registration_closed") { showToast(data.message || "ثبت‌نام بسته است.", "error"); showOnly("registration-closed"); return; }
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
    // راهنما در اولین ورود، همین ابتدا و پیش از نمایش داشبورد باز می‌شود (فقط یک بار برای هر بازیکن).
    const guideDecision = maybeShowGuide().catch(e => console.error("guide:", e));
    try {
        updateGameHeader(); updateHomeStats();
        const t0 = Date.now();
        await preloadHomeAssets();
        const el = Date.now() - t0;
        if (el < 600) await sleep(600 - el);
    } catch (e) { console.error(e); }
    await guideDecision;
    await waitGuideClosed();          // تا راهنما بسته نشده داشبورد پشتش نمایش داده نمی‌شود
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
        document.getElementById("header-rank-value").textContent = me ? me.rank : "—";
    } catch (e) {}
}

document.querySelector(".header-flag-box")?.addEventListener("click", () => {   // پرچم و نشان رتبه هر دو به رتبه‌بندی می‌روند
    showGamePage("ranking");
    loadRankings();
});

const seenNewsKey = () => `fl93_seen_news_${userId || "guest"}_w${selectedWorldId || "1"}`;
function getSeenNews() {
    try { return new Set(JSON.parse(localStorage.getItem(seenNewsKey()) || "[]")); }
    catch (e) { return new Set(); }
}
function saveSeenNews(set) {
    try { localStorage.setItem(seenNewsKey(), JSON.stringify([...set].slice(-20000))); } catch (e) {}
    syncNewsBadges();
}
let knownNewsIds = [];
let pmUnreadCount = 0;
let newsUnseenCount = 0;
const badgeText = n => (n > 99 ? "99+" : String(n));
function updateFooterCommBadge() {
    const el = document.getElementById("nav-comm-badge");
    if (!el) return;
    const total = (pmUnreadCount || 0) + (newsUnseenCount || 0);
    el.textContent = badgeText(total);
    el.classList.toggle("hidden", !(total > 0));
}
function syncNewsBadges() {
    const seen = getSeenNews();
    newsUnseenCount = knownNewsIds.filter(id => id && !seen.has(id)).length;
    const el = document.getElementById("news-tab-badge");
    if (el) { el.textContent = badgeText(newsUnseenCount); el.classList.toggle("hidden", !(newsUnseenCount > 0)); }
    updateFooterCommBadge();
}
const dismissedNotifsKey = () => `fl93_dismissed_notifications_${userId || "guest"}_w${selectedWorldId || "1"}`;
function getDismissedNotifications() {
    try { return new Set(JSON.parse(localStorage.getItem(dismissedNotifsKey()) || "[]")); }
    catch (e) { return new Set(); }
}
function saveDismissedNotifications(set) {
    try { localStorage.setItem(dismissedNotifsKey(), JSON.stringify([...set].slice(-20000))); } catch (e) {}
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
        knownNewsIds = list.map(n => n.id).filter(Boolean);
        syncNewsBadges();
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
                const notifFlags = (Array.isArray(item.countries) ? item.countries : []).map(c => flagInline(c, true)).join("");
                div.innerHTML = `
                    <div class="notif-title">${isNew ? '<span class="notif-dot"></span>' : ""}${notifFlags ? `<span class="news-flags">${notifFlags}</span>` : ""}${escapeHtml(item.title || "")}</div>
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
const SEASON_NEXT = { "بهار": "تابستان", "تابستان": "پاییز", "پاییز": "زمستان", "زمستان": "بهار" };
let seasonClockOffset = 0;   // اختلاف ساعت سرور با دستگاه

function seasonEffectText(player) {
    const e = player?.season_effects || {};
    const parts = [];
    const sgn = n => (n > 0 ? "+" : "−") + formatNumber(Math.abs(n)) + "٪";
    if (e.food_consumption_pct) parts.push(`مصرف غذا ${sgn(e.food_consumption_pct)}`);
    if (e.oil_consumption_pct) parts.push(`مصرف نفت ${sgn(e.oil_consumption_pct)}`);
    if (e.income_pct) parts.push(`درآمد ${sgn(e.income_pct)}`);
    return parts.length ? parts.join(" · ") : "بدون اثر";
}

function renderSeasonCountdown() {
    const cd = document.getElementById("home-season-countdown");
    const dt = document.getElementById("home-season-detail");
    if (!cd || !dt) return;
    if (!player || !player.game_started || player.game_finished || !player.season_end) {
        cd.textContent = ""; dt.textContent = ""; return;
    }
    const left = Math.max(0, Math.floor((new Date(player.season_end).getTime() - (Date.now() + seasonClockOffset)) / 1000));
    const d = Math.floor(left / 86400), hr = Math.floor((left % 86400) / 3600), mi = Math.floor((left % 3600) / 60);
    const next = player.next_season === "پایان بازی" ? "پایان بازی" : (player.next_season || SEASON_NEXT[player.season] || "");
    const timeTxt = d > 0 ? `${formatNumber(d)} روز و ${formatNumber(hr)} ساعت` : (hr > 0 ? `${formatNumber(hr)} ساعت و ${formatNumber(mi)} دقیقه` : `${formatNumber(mi)} دقیقه و ${formatNumber(left % 60)} ثانیه`);
    cd.textContent = `${timeTxt} تا ${next}`;
    dt.innerHTML = `<b>${escapeHtml(player.season || "")}</b>: ${escapeHtml(seasonEffectText(player))}`;
}
setInterval(renderSeasonCountdown, 1000);

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
    document.getElementById("home-season").textContent = player.season ?? "در انتظار شروع";
    if (player.server_now) seasonClockOffset = new Date(player.server_now).getTime() - Date.now();
    const hint = document.getElementById("home-season-hint");
    if (hint) hint.textContent = "";
    renderSeasonCountdown();
    updateSeasonGateBanner();
    const mm = document.getElementById("map-money");
    if (mm) mm.textContent = formatMoney(player.money);
    document.querySelectorAll(".sb-money").forEach(e => { e.textContent = formatMoney(player.money); });
    renderResourceBars();
    renderHomeActivities();
    refreshBuildViewsIfChanged();
}

/* ---------- صف‌های در حال انجام (صفحهٔ خانه) ----------
   دو صف مستقل و هم‌زمان:
   ۱) صف فعالیت‌های خانه (player.build_queue): فقط یک فعالیت؛ نام، زمان باقی‌مانده و نوار پیشرفت.
   ۲) صف کارخانهٔ ارتش (player.factory_queues): برای هر دسته (زمینی/دریایی/هوایی/موشکی) یک صف؛ سفارش فعال با
      نام یگان، تعداد باقی‌مانده، زمان تکمیل و نوار پیشرفت. واحدها یکی‌یکی و طبق زمان ساخت تحویل می‌شوند.
   زمان‌ها با ساعت سرور (player.server_now) همگام می‌شوند تا ساعت دستگاه اثری نداشته باشد.
   نوار پیشرفت از راست به چپ پر می‌شود (جهت rtl + لنگر راست). */
let activitiesRefreshAt = 0;
function fmtCountdown(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const p2 = n => String(n).padStart(2, "0");
    return h ? `${h}:${p2(m)}:${p2(r)}` : `${p2(m)}:${p2(r)}`;
}
function serverNowMs() {
    const offset = player?.server_now ? Date.parse(player.server_now) - (player._clientAt || Date.now()) : 0;
    return Date.now() + (Number.isFinite(offset) ? offset : 0);
}
// فعالیت در حال انجام در صف خانه (اگر باشد)
function homeActiveJob() {
    const now = serverNowMs();
    const live = (player?.build_queue || []).map(j => ({ j, end: Date.parse(j.end) }))
        .filter(x => Number.isFinite(x.end) && x.end > now).sort((a, b) => a.end - b.end);
    return live.length ? live[0].j : null;
}
function homeBusyText() {
    const job = homeActiveJob();
    if (!job) return "";
    return `${job.label || "فعالیت"} · ${fmtCountdown(Date.parse(job.end) - serverNowMs())} مانده`;
}
function factoryLimit(group) { return Number(player?.factory_queue_limits?.[group]) || ({ land: 20, naval: 16, air: 20, missile: 12 })[group] || 0; }
// خط زمانی یک صف کارخانه: سفارش اول از start سرور شروع می‌شود و هر سفارش بعدی از لحظهٔ پایان قبلی
function factoryTimeline(group) {
    const now = serverNowMs(), rows = []; let cursor = null;
    (player?.factory_queues?.[group] || []).forEach(o => {
        const count = Math.max(1, Number(o.count) || 1), us = Math.max(1, Number(o.unit_seconds) || 1) * 1000;
        let start = o.start ? Date.parse(o.start) : cursor;
        if (!Number.isFinite(start)) start = now;
        if (cursor != null && start < cursor) start = cursor;
        const end = start + count * us;
        const delivered = now >= end ? count : Math.max(Number(o.delivered) || 0, Math.min(count, Math.floor(Math.max(0, now - start) / us)));
        const waiting = now < start;
        rows.push({ o, group, count, start, end, waiting, delivered, remaining: count - delivered,
                    left: end - now, pct: waiting ? 0 : Math.min(100, Math.max(0, (now - start) / (end - start) * 100)) });
        cursor = end;
    });
    return rows;
}
function barHtml(pct) {
    return `<div class="hm-act-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct.toFixed(1)}%"></i></div>`;
}
function renderHomeActivities() {
    const box = document.getElementById("home-activities"), list = document.getElementById("home-activities-list");
    const now = serverNowMs();
    const jobs = (player?.build_queue || []).map(job => {
        const start = Date.parse(job.start), end = Date.parse(job.end);
        return { job, start, end, left: end - now };
    }).filter(x => Number.isFinite(x.start) && Number.isFinite(x.end));
    const active = jobs.filter(x => x.left > 0).sort((a, b) => a.end - b.end);
    // کاری که زمانش تمام شده دیگر «در حال انجام» نیست؛ یک‌بار وضعیت از سرور تازه می‌شود تا نتیجه ثبت شود.
    const factoryDone = ["land", "naval", "air", "missile"].some(g => factoryTimeline(g).some(r => r.left <= 0));
    if ((jobs.some(x => x.left <= 0) || factoryDone) && Date.now() - activitiesRefreshAt > 3000) {
        activitiesRefreshAt = Date.now(); refreshPlayer();
    }
    if (box && list) {
        box.classList.toggle("hidden", !active.length);
        list.innerHTML = active.map(x => {
            const pct = Math.min(100, Math.max(0, ((now - x.start) / Math.max(1, x.end - x.start)) * 100));
            return `<div class="hm-act-row"><div class="hm-act-head"><b>${escapeHtml(x.job.label || "فعالیت")}</b><span>${fmtCountdown(x.left)} مانده</span></div>${barHtml(pct)}</div>`;
        }).join("");
    }
    renderHomeFactory();
    renderFactoryPanel();
}
function renderHomeFactory() {
    const box = document.getElementById("home-factory"), list = document.getElementById("home-factory-list");
    if (!box || !list) return;
    const rows = [];
    ["land", "naval", "air", "missile"].forEach(g => {
        const tl = factoryTimeline(g).filter(r => r.left > 0);
        if (!tl.length) return;
        const cur = tl[0], u = ARMY_UNITS[cur.o.unit_id] || { name: cur.o.unit_id }, waiting = tl.length - 1;
        rows.push(`<div class="hm-act-row"><div class="hm-act-head"><b>${GROUP_ICONS[g] || ""} ${escapeHtml(u.name)}</b><span>${fmtCountdown(cur.left)} مانده</span></div>
            <div class="hm-act-sub"><span>${formatNumber(cur.remaining)} از ${formatNumber(cur.count)} باقی‌مانده</span>${waiting ? `<span>+${formatNumber(waiting)} سفارش در انتظار</span>` : ""}</div>${barHtml(cur.pct)}</div>`);
    });
    box.classList.toggle("hidden", !rows.length);
    list.innerHTML = rows.join("");
}
// بخش «صف کارخانه» در صفحهٔ ارتش: سفارش‌های دستهٔ انتخاب‌شده
function renderFactoryPanel() {
    const box = document.getElementById("army-factory-queue");
    if (!box || box.closest(".game-page")?.classList.contains("hidden") || !player) return;
    const g = currentArmyTab, tl = factoryTimeline(g).filter(r => r.left > 0), limit = factoryLimit(g);
    const head = document.getElementById("army-factory-head"), body = document.getElementById("army-factory-list");
    if (head) head.innerHTML = `<b>🏭 صف کارخانه · ${GROUP_TITLES[g] || ""}</b><span class="fq-count ${tl.length >= limit ? "full" : ""}">${formatNumber(tl.length)} از ${formatNumber(limit)} سفارش</span>`;
    if (!body) return;
    if (!tl.length) { body.innerHTML = `<div class="fq-empty">صف کارخانه خالی است؛ یگان موردنظر را سفارش دهید.</div>`; return; }
    body.innerHTML = tl.map((r, i) => {
        const u = ARMY_UNITS[r.o.unit_id] || { name: r.o.unit_id };
        return `<div class="fq-row ${r.waiting ? "waiting" : "active"}">
            <div class="hm-act-head"><b>${i + 1}. ${escapeHtml(u.name)}</b><span>${r.waiting ? "در انتظار" : "در حال تولید"}</span></div>
            <div class="fq-stats"><span>سفارش‌داده‌شده <b>${formatNumber(r.count)}</b></span><span>باقی‌مانده <b>${formatNumber(r.remaining)}</b></span>
                <span>زمان تکمیل <b>${fmtCountdown(r.left)}</b></span></div>${barHtml(r.pct)}</div>`;
    }).join("");
}
setInterval(renderHomeActivities, 1000);

// وقتی سطح ساختمان‌ها یا صف‌ها تغییر کرد (مثلاً فعالیتی تمام شد)، صفحه‌ای که باز است تازه شود.
let buildSignature = null;
function refreshBuildViewsIfChanged() {
    if (!player) return;
    const sig = JSON.stringify([(player.build_queue || []).map(j => j.id),
        Object.entries(player.infra || {}).map(([k, v]) => k + ":" + v.level),
        Object.entries(player.economy || {}).map(([k, v]) => k + ":" + v.level),
        ["land", "naval", "air", "missile"].map(g => (player.factory_queues?.[g] || []).map(o => o.id + ":" + (o.delivered || 0)))]);
    if (sig === buildSignature) return;
    const first = buildSignature === null; buildSignature = sig;
    if (first) return;
    const visible = id => { const el = document.getElementById(id); return el && !el.classList.contains("hidden"); };
    if (visible("economy")) renderEconomyList();
    if (visible("infrastructure") && !document.getElementById("infra-sheet")) renderInfraTab(document.querySelector(".infra-tab.active")?.dataset.infraTab || "power");
    if (visible("army")) { renderArmySummary(); renderBaseCards(); renderArmyTabsCounts(); renderArmyUnitsNew(); }
}

function updateSeasonGateBanner() {
    const banner = document.getElementById("season-gate-banner");
    if (!banner || !player?.country) return;
    const started = Boolean(player.game_started);
    const finished = Boolean(player.game_finished);
    const gameRoot = document.getElementById("game");
    if (gameRoot) gameRoot.classList.toggle("season-locked", !started || finished);
    if (started && !finished) {
        banner.classList.add("hidden");
        gameRoot?.style.setProperty("--banner-h", "0px");
        return;
    }
    if (finished) {
        const winner = player.game_winner_name || "مشخص نشده";
        banner.textContent = `بازی پس از ۳۱ روز به پایان رسید. برندهٔ نهایی: ${winner}. تمام عملیات بازی بسته شده‌اند و پیام خصوصی همچنان فعال است.`;
        banner.classList.remove("hidden", "is-waiting"); banner.classList.add("is-finished");
        measureSeasonBanner();
        return;
    }
    banner.textContent = "فصل هنوز شروع نشده است. منتظر فرمانده بمان؛ با زدن دکمهٔ «شروع فصل» در پنل مدیریت، روز اول برای همهٔ بازیکنان هم‌زمان آغاز می‌شود. تا آن زمان فقط پیام خصوصی بین کشورها فعال است.";
    banner.classList.remove("hidden", "is-finished"); banner.classList.add("is-waiting");
    measureSeasonBanner();
}
function measureSeasonBanner() {
    const banner = document.getElementById("season-gate-banner");
    const gameRoot = document.getElementById("game");
    if (!banner || !gameRoot) return;
    requestAnimationFrame(() => {
        const h = banner.classList.contains("hidden") ? 0 : banner.offsetHeight + 6;
        gameRoot.style.setProperty("--banner-h", h + "px");
    });
}
window.addEventListener("resize", measureSeasonBanner);

// بازدید و ناوبری همیشه آزاد است؛ فقط اجرای عملیات تغییر‌دهنده قفل می‌شود.
// سرور نیز تمام درخواست‌های POST غیرمجاز قبل از شروع و پس از پایان را رد می‌کند.
document.addEventListener("click", event => {
    if (!player?.country || (player.game_started && !player.game_finished)) return;
    const target = event.target?.closest?.("button, a, [role=button]");
    if (!target || target.closest("#admin") || target.closest("#guide-modal")) return;
    const mutating = target.matches([
        "#ann-submit", "#ann-publish-confirm", "#ln-submit", "#mk-submit", "#market-sanction-submit",
        "#union-create-confirm", "#union-invite-submit", "#union-leave", "#union-chat-send",
        ".union-create-launch", "[data-union-request]", "[data-invite-accept]", "[data-invite-reject]",
        "[data-join-response]", "[data-kick-member]", "#sat-launch",
        "#war-declare-submit", "#pm-send-attachment", "#diplomacy-propose-button", ".diplomacy-item [data-accept]", ".diplomacy-item [data-reject]",
        "#infra-sheet .modal-ok", "#tr-ok", ".eco-invest-button", "#dp-go", ".market-confirm", ".market-action",
        ".wf-tr-cancel", "#sat-launch", ".sat-scan", "[data-war-reason-submit]"
    ].join(",")) || Boolean(target.closest(
        ".infra-build-actions, .infra-confirm-actions, .eco-invest-actions, .ln-actions, .market-trade-actions"
    )) || Boolean(target.matches("[data-act], [data-action='build'], [data-action='upgrade']"));
    if (!mutating) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showToast(player.game_finished ? "فصل پایان یافته؛ عملیات غیرفعال است." : "فصل هنوز آغاز نشده؛ فعلاً فقط مشاهده و پیام خصوصی مجاز است.", "error");
}, true);

const RK_TABS = [
    { id: "overall", key: "overall", label: "کلی", info: "<b>کلی</b> ترکیبِ چهار دستهٔ دیگر است. امتیازِ هر دسته نسبت به بهترین کشورِ همان دسته محاسبه می‌شود؛ بنابراین یک عددِ بسیار بزرگ در یک دسته، امتیازِ دسته‌های دیگر را محو نمی‌کند." },
    { id: "economy", key: "economy", label: "اقتصادی", info: "<b>اقتصادی</b> بر چه اساسیه: درآمدِ خالصِ روزانه‌ی کشور، بعد از کسرِ هزینه‌ی نگهداری — هر $1,000 یک امتیاز." },
    { id: "military", key: "military", label: "قدرت نظامی", info: "<b>قدرت نظامی</b> بر چه اساسیه: مجموعِ قدرتِ همه‌ی یگان‌ها — هر یگان به اندازه‌ی حمله + دفاعش امتیاز دارد. یگان‌های مستقر در سکوها و تنگه‌ها هم حساب می‌شوند." },
    { id: "territory", key: "territory", label: "قلمرو", info: "<b>قلمرو</b> بر چه اساسیه: منابعِ نقشه و تنگه‌هایی که زیرِ کنترلِ کشورند، هر کدام ۱ امتیاز، به‌اضافه‌ی هر کشورِ اشغال‌شده ۵ امتیاز." },
    { id: "development", key: "development", label: "توسعه", info: "<b>توسعه</b> بر چه اساسیه: مجموعِ سطحِ همه‌ی ساختمان‌ها در زیرساخت و اقتصاد — هر سطح ۵۰ امتیاز." },
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
            <div class="rk-weight-grid"><span>اقتصاد <b>۳۵٪</b></span><span>قدرت نظامی <b>۳۰٪</b></span><span>قلمرو <b>۲۰٪</b></span><span>توسعه <b>۱۵٪</b></span></div>
            ${sections}
        </div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener("click", e => { if (e.target === ov || e.target.closest(".rk-help-close")) close(); });
});


function openSectionHelp(title, body) {
    const ov = document.createElement("div"); ov.className = "modal-overlay section-help-overlay";
    ov.innerHTML = `<section class="modal-box section-help-box" role="dialog" aria-modal="true"><div class="ann-modal-head"><div><span class="ann-modal-kicker">راهنمای کوتاه</span><h2 class="modal-title">${escapeHtml(title)}</h2></div><button type="button" class="ann-modal-close" aria-label="بستن">×</button></div><p>${escapeHtml(body)}</p><button type="button" class="ann-publish-button section-help-close">متوجه شدم</button></section>`;
    document.body.appendChild(ov); const close = () => ov.remove(); ov.querySelector(".ann-modal-close").onclick = close; ov.querySelector(".section-help-close").onclick = close; ov.addEventListener("click", e => { if (e.target === ov) close(); });
}
document.getElementById("infra-help-btn")?.addEventListener("click", () => openSectionHelp("🏗️ راهنمای زیرساخت", "در این بخش می‌توانی نیروگاه، تولید منابع، آموزش نیروی انسانی و ساختمان‌های نظامی را بسازی و ارتقا بدهی. هزینه و نیاز برق هر گزینه پیش از ساخت نمایش داده می‌شود."));
document.getElementById("economy-help-btn")?.addEventListener("click", () => openSectionHelp("💰 راهنمای اقتصاد", "سرمایه‌گذاری‌های اقتصادی درآمد و توان تولید کشور را افزایش می‌دهند. دسته‌ها را انتخاب کن، هزینه و زمان ساخت را ببین و سپس ارتقا را انجام بده."));

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
        else if (s === "market") { showGamePage("market"); loadMarketListings(); loadShipments(); }
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
    const infraSortKey = item => {
        const f = infraMainFigure(item, item.level > 0 ? item.current : item.next, item.level > 0 ? item.level : 1);
        const n = f ? parseFloat(String(f.value).replace(/[^0-9.]/g, "")) : 0;
        return Number.isFinite(n) ? n : 0;
    };
    // کمترین مقدار بالا، بیشترین مقدار پایین
    Object.entries(player.infra).filter(([, it]) => filterFn(it)).sort((x, y) => infraSortKey(x[1]) - infraSortKey(y[1])).forEach(([iid, item]) => {
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
        if (item.next && homeActiveJob()) btnLabel = "⏳ صف خانه مشغول است";
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
    if (item.next.time) rows.push(`<div class="is-row"><span>⏱️ زمان ساخت</span><b>${fmtDurationFa(item.next.time)}</b></div>`);
    rows.push(`<div class="is-row"><span>🔧 هزینهٔ نگهداری روزانه</span><b>${formatMoney(item.next_upkeep)}${built ? ` <small>(الان ${formatMoney(item.upkeep)})</small>` : ""}</b></div>`);
    if (item.group === "power") {
        rows.push(`<div class="is-row"><span>⚡ برق تولیدی</span><b>${formatNumber(item.next.capacity)} واحد</b></div>`);
    } else if (item.power_required) {
        rows.push(`<div class="is-row ${need.powerOk ? "" : "is-bad"}"><span>⚡ مصرف برق</span><b>${formatNumber(item.power_required * lvlAfter)} واحد <small>(برق آزاد: ${formatNumber(freePower())})</small></b></div>`);
    }
    need.res.forEach(r => {
        rows.push(`<div class="is-row ${r.ok ? "" : "is-bad"}"><span>${RESOURCE_ICONS[r.key] || ""} ${RESOURCE_NAMES[r.key] || r.key} لازم</span><b>${formatNumber(r.need)} <small>(موجود: ${formatNumber(r.have)})</small></b></div>`);
    });

    const busyJob = homeActiveJob();
    if (busyJob) rows.unshift(`<div class="is-row is-bad"><span>⏳ فعالیت در حال انجام</span><b>${escapeHtml(busyJob.label || "فعالیت")} <small>(${fmtCountdown(Date.parse(busyJob.end) - serverNowMs())} مانده)</small></b></div>`);
    let okLabel = built ? "ارتقا" : "ساخت";
    if (busyJob) okLabel = "صف خانه مشغول است";
    else if (!need.moneyOk) okLabel = "پول کافی نیست";
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
                <button class="modal-ok" ${need.canBuild && !busyJob ? "" : "disabled"}>${okLabel}</button>
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
                if (d.error === "home_busy") { closeInfraSheet(); await refreshPlayer(); }
                else okBtn.disabled = false;
                return;
            }
            player = d.player; updateHomeStats(); closeInfraSheet();
            if (d.queued) showToast(`ساخت در صف قرار گرفت؛ حدود ${fmtDurationFa(d.ready_in)} دیگر آماده می‌شود.`, "success");
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
    if (["eco_agriculture", "eco_fishing", "eco_dairy"].includes(iid)) return "food";
    if (["eco_textile", "eco_construction", "eco_mining", "eco_steel", "eco_electronics", "eco_oil", "eco_chemicals", "eco_handicraft", "eco_pharma", "eco_auto", "eco_aerospace"].includes(iid)) return "industry";
    if (["eco_trade", "eco_market", "eco_transport"].includes(iid)) return "trade";
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
    c.classList.remove("economy-list-grid"); c.classList.add("infra-card-list");
    const entries = Object.entries(player.economy).filter(([iid]) => currentEconomyFilter === "all" || economyCategoryFor(iid) === currentEconomyFilter)
        .sort((x, y) => Number((x[1].level > 0 ? x[1].current?.income : x[1].next?.income) || 0) - Number((y[1].level > 0 ? y[1].current?.income : y[1].next?.income) || 0)); // کمترین درآمد بالا، بیشترین پایین
    if (!entries.length) {
        c.innerHTML = `<div class="economy-empty-state">در این دسته هنوز گزینه‌ای وجود ندارد.</div>`;
        return;
    }
    entries.forEach(([iid, item]) => {
        const built = item.level > 0;
        const next = item.next;
        const pips = Array.from({ length: item.max_level || 0 }, (_, i) => `<i class="${i < item.level ? "on" : ""}"></i>`).join("");
        const income = Number((built ? item.current?.income : next?.income) || 0);
        const upkeep = Number((built ? item.upkeep : item.next_upkeep) || 0);
        const short = !!next && Number(player.money || 0) < Number(next.cost || 0);
        const busy = !!next && !!homeActiveJob();
        let btnLabel = !next ? "حداکثر سطح" : built ? `ارتقا به سطح ${item.level + 1} — ${formatMoney(next.cost)}` : `سرمایه‌گذاری — ${formatMoney(next.cost)}`;
        if (busy) btnLabel = "⏳ صف خانه مشغول است";
        const card = document.createElement("div");
        card.className = `ic-card ${built ? "ic-card--built" : ""} ${short ? "ic-card--short" : ""}`;
        card.innerHTML = `
            <div class="ic-top">
                <div class="ic-hex"><span>${item.icon || "💼"}</span></div>
                <div class="ic-titles">
                    <div class="ic-name">${escapeHtml(item.name || "سرمایه‌گذاری")}</div>
                    <div class="ic-pips">${pips}</div>
                </div>
                <div class="ic-main"><b>${formatMoney(income)}</b><small>درآمد روزانه</small></div>
            </div>
            <div class="ic-chips">
                <span class="ic-chip">💰 قیمت ${next ? formatMoney(next.cost) : "—"}</span>
                <span class="ic-chip">📈 درآمد روزانه ${formatMoney(income)}</span>
                <span class="ic-chip ic-chip--upkeep">🔧 هزینه روزانه ${formatMoney(upkeep)}</span>
            </div>
            <div class="ic-foot">
                <button class="ic-btn ${short ? "ic-btn--short" : ""}" ${next ? "" : "disabled"}>${btnLabel}</button>
            </div>`;
        if (next) card.addEventListener("click", () => openEconomySheet(iid));
        c.appendChild(card);
    });
}

function openEconomySheet(iid) {
    const item = player?.economy?.[iid];
    if (!item) return;
    closeInfraSheet();
    const built = item.level > 0, next = item.next;
    const curInc = Number(item.current?.income || 0), nextInc = Number(next?.income || 0);
    const busyJob = homeActiveJob();
    const cost = Number(next?.cost || 0);
    const moneyOk = !next || Number(player.money || 0) >= cost;
    const powerOk = !next || !item.power_required || freePower() >= item.power_required;
    const rows = [];
    if (busyJob) rows.push(`<div class="is-row is-bad"><span>⏳ فعالیت در حال انجام</span><b>${escapeHtml(busyJob.label || "فعالیت")} <small>(${fmtCountdown(Date.parse(busyJob.end) - serverNowMs())} مانده)</small></b></div>`);
    rows.push(`<div class="is-row"><span>💵 درآمد روزانه</span><b>${next ? (built ? `از ${formatMoney(curInc)} به ${formatMoney(nextInc)}` : formatMoney(nextInc)) : formatMoney(curInc)}</b></div>`);
    if (next && built) rows.push(`<div class="is-row"><span>📈 افزایش درآمد</span><b>+${formatMoney(nextInc - curInc)} / روز</b></div>`);
    if (next) {
        const upNow = Number(item.upkeep || 0), upNext = Number(item.next_upkeep || 0);
        rows.push(`<div class="is-row"><span>🔧 هزینهٔ روزانه</span><b>${built ? `از ${formatMoney(upNow)} به ${formatMoney(upNext)}` : formatMoney(upNext)}</b></div>`);
    } else {
        rows.push(`<div class="is-row"><span>🔧 هزینهٔ روزانه</span><b>${formatMoney(Number(item.upkeep || 0))}</b></div>`);
    }
    if (next) rows.push(`<div class="is-row"><span>⏱️ زمان ساخت</span><b>${fmtDurationFa(next.time)}</b></div>`);
    rows.push(`<div class="is-row ${powerOk ? "" : "is-bad"}"><span>⚡ برق لازم</span><b>${formatNumber(item.power_required || 0)} واحد <small>(برق آزاد: ${formatNumber(freePower())})</small></b></div>`);
    rows.push(`<div class="is-row"><span>📊 سطح</span><b>${built ? `${item.level} از ${item.max_level}` : `۰ از ${item.max_level}`}</b></div>`);
    let okLabel = !next ? "حداکثر سطح" : built ? "ارتقا" : "سرمایه‌گذاری";
    if (next) { if (busyJob) okLabel = "صف خانه مشغول است"; else if (!moneyOk) okLabel = "پول کافی نیست"; else if (!powerOk) okLabel = "برق کافی نیست"; }
    const canGo = !!next && moneyOk && powerOk && !busyJob;
    const ov = document.createElement("div");
    ov.id = "infra-sheet"; ov.className = "modal-overlay";
    ov.innerHTML = `
        <div class="ic-sheet">
            <div class="is-head">
                <div class="ic-hex"><span>${item.icon || "💼"}</span></div>
                <div class="is-titles"><div class="is-name">${escapeHtml(item.name || "")}</div><div class="is-sub">${built ? `ارتقا از سطح ${item.level} به ${item.level + 1}` : "سرمایه‌گذاری جدید · سطح ۱"}</div></div>
                <button class="is-close" aria-label="بستن">✕</button>
            </div>
            <p class="is-desc">${escapeHtml(item.desc || "")}</p>
            <div class="is-rows">${rows.join("")}</div>
            ${next ? `<div class="is-price ${moneyOk ? "" : "is-bad"}"><span>قیمت</span><b>${formatMoney(cost)}</b></div>` : ""}
            ${next && !moneyOk ? `<div class="is-lack">${formatMoney(cost - Number(player.money || 0))} کم دارید</div>` : ""}
            <div class="modal-actions"><button class="modal-cancel">انصراف</button><button class="modal-ok" ${canGo ? "" : "disabled"}>${okLabel}</button></div>
        </div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) closeInfraSheet(); });
    ov.querySelector(".is-close").onclick = closeInfraSheet;
    ov.querySelector(".modal-cancel").onclick = closeInfraSheet;
    const okBtn = ov.querySelector(".modal-ok");
    okBtn.onclick = async () => {
        if (okBtn.disabled) return;
        okBtn.disabled = true;
        closeInfraSheet();
        await upgradeEconomy(iid);
    };
}
async function upgradeEconomy(iid) {
    if (!userId) return;
    try {
        const d = await apiPost("/api/upgrade-economy", { category: iid });
        if (!d.success) { showToast(d.message || "خطا", "error"); if (d.error === "home_busy") await refreshPlayer(); renderEconomyList(); return; }
        player = d.player; updateHomeStats(); renderEconomyList();
        if (d.queued) showToast(`سرمایه‌گذاری در صف قرار گرفت؛ حدود ${fmtDurationFa(d.ready_in)} دیگر کامل می‌شود.`, "success");
    } catch (e) { showToast("خطا."); }
}

/* =========================================================
   Army
========================================================= */
async function openArmyPage() {
    showGamePage("army");
    currentArmyTab = "land";
    armyDetailGroup = null;
    document.querySelectorAll(".army-tab").forEach(t => t.classList.toggle("active", t.dataset.armyTab === "land"));
    await refreshPlayer();
    renderArmySummary();
    renderBaseCards();
    renderArmyTabsCounts();
    renderArmyUnitsNew();
    renderFactoryPanel();
}

function selectArmyTabAndReveal(group, scroll = true) {
    currentArmyTab = group;
    document.querySelectorAll(".army-tab").forEach(t => t.classList.toggle("active", t.dataset.armyTab === group));
    renderArmyUnitsNew();
    renderFactoryPanel();
    if (scroll) {
        requestAnimationFrame(() => document.getElementById("army-units-new")?.scrollIntoView({behavior: "smooth", block: "start"}));
    }
}

document.querySelectorAll(".army-tab").forEach(tab => {
    tab.addEventListener("click", () => selectArmyTabAndReveal(tab.dataset.armyTab, false));
});
document.querySelectorAll("[data-army-jump]").forEach(card => {
    const activate = () => { armyDetailGroup = card.dataset.armyJump; renderArmyBaseDetail(); selectArmyTabAndReveal(card.dataset.armyJump, true); };
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

// موقعیت یگان: در خانه + بیرون از خانه (مواضع و در راه)
function armyLoc(uid_) {
    const l = player?.unit_locations?.[uid_];
    if (l) return l;
    const home = player?.units?.[uid_] ?? 0;
    return { home, sites: [], transit: 0, away: 0, total: home };
}
function getGroupUsed(group) {
    let t = 0;
    Object.entries(ARMY_UNITS).forEach(([uid_, u]) => {
        if (u.group === group) t += armyLoc(uid_).total;
    });
    // یگان‌های هنوز تحویل‌نشدهٔ صف کارخانه هم ظرفیت را اشغال می‌کنند
    (player?.factory_queues?.[group] || []).forEach(o => {
        t += Math.max(0, (Number(o.count) || 0) - (Number(o.delivered) || 0));
    });
    return t;
}

function renderArmySummary() {
    const el = document.getElementById("army-total-power");
    if (!el || !player) return;
    el.textContent = formatNumber(player.army);
}

let armyDetailGroup = null;
const BASE_INFO = {
    land: { name: "پادگان", icon: "🪖" }, air: { name: "فرودگاه", icon: "✈️" },
    naval: { name: "بندر", icon: "⚓" }, missile: { name: "انبار موشک", icon: "🚀" },
};
// پنل جزئیات زیر ۴ باکس: هر یگان چقدر است، چقدر در خانه و چقدر بیرون از خانه (مأموریت)
function renderArmyBaseDetail() {
    const box = document.getElementById("army-base-detail");
    if (!box) return;
    document.querySelectorAll("[data-army-jump]").forEach(c => c.classList.toggle("active", c.dataset.armyJump === armyDetailGroup));
    if (!armyDetailGroup || !player) { box.classList.add("hidden"); box.innerHTML = ""; return; }
    const info = BASE_INFO[armyDetailGroup] || { name: "", icon: "" };
    let totHome = 0, totAway = 0;
    const rows = Object.entries(ARMY_UNITS).filter(([, u]) => u.group === armyDetailGroup).map(([id, u]) => {
        const l = armyLoc(id); totHome += l.home; totAway += l.away;
        const where = [...l.sites.map(s => `${escapeHtml(s.name)}: ${formatNumber(s.count)}`), ...(l.transit ? [`در راه: ${formatNumber(l.transit)}`] : [])];
        return `<div class="abd-row">
            <div class="abd-top"><b>${escapeHtml(u.name)}</b><span>مجموع ${formatNumber(l.total)}</span></div>
            <div class="abd-chips"><span class="abd-chip home">🏠 در خانه ${formatNumber(l.home)}</span><span class="abd-chip away">🧭 بیرون از خانه (مأموریت) ${formatNumber(l.away)}</span></div>
            ${where.length ? `<small class="abd-where">${where.join(" · ")}</small>` : ""}
        </div>`;
    }).join("");
    box.innerHTML = `<div class="abd-head"><span>${info.icon} ${info.name} — جزئیات یگان‌ها</span>
            <small>در خانه ${formatNumber(totHome)} · بیرون ${formatNumber(totAway)}</small>
            <button type="button" class="abd-close" data-abd-close aria-label="بستن">✕</button></div>${rows}`;
    box.classList.remove("hidden");
    box.querySelector("[data-abd-close]").onclick = () => { armyDetailGroup = null; renderArmyBaseDetail(); };
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
    renderArmyBaseDetail();
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
        const count = armyLoc(uid_).total;
        const missing = missingReqs(u);
        const full = used >= cap;
        const totalPower = Math.round(count * (u.attack + u.defense * (player.def_mult?.[group] ?? 1)));

        const queueFull = (player.factory_queues?.[group] || []).length >= factoryLimit(group);
        let statusText = "آماده آموزش";
        if (missing.length) statusText = "🔒 قفل است — برای دیدن نیازها «تولید» را بزنید";
        else if (queueFull) statusText = "صف کارخانه پر است.";
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
            <div class="unit-card-new-info">
                <span>⚔️ قدرت هر یگان <b>${formatNumber(Math.round(u.attack + u.defense * (player.def_mult?.[group] ?? 1)))}</b></span>
                <span>⏱ زمان ساخت <b>${u.build_seconds ? fmtDurationFa(u.build_seconds) : "—"}</b></span>
                <span>👥 نیروی انسانی <b>${formatNumber(u.manpower)}</b></span>
            </div>
            <div class="unit-card-new-action">
                <button class="unit-produce-btn" ${!missing.length && (full || queueFull) ? "disabled" : ""}>⚙️ تولید <small class="unit-price">· ${formatMoney(unitCost(u))}</small></button>
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

let trainInFlight = false;
function newRequestId() {
    return (window.crypto?.randomUUID?.()) || `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
async function trainUnit(uid_, count, requestId) {
    if (!userId || trainInFlight) return false;      // دوبار کلیک پشت‌سرهم سفارش دوباره ثبت نمی‌کند
    trainInFlight = true;
    try {
        const d = await apiPost("/api/train-unit", { unit_id: uid_, count, request_id: requestId || newRequestId() });
        if (!d.success) { showToast(d.message || "خطا", "error"); return false; }
        player = d.player; if (player) player._clientAt = Date.now();
        if (d.queued && !d.duplicate) showToast(`سفارش در صف کارخانه ثبت شد؛ تکمیل کامل حدود ${fmtDurationFa(d.ready_in)} دیگر.`, "success");
        updateHomeStats(); renderArmySummary(); renderBaseCards(); renderArmyTabsCounts(); renderArmyUnitsNew(); renderFactoryPanel();
        return true;
    } catch (e) { showToast("خطا."); return false; }
    finally { trainInFlight = false; }
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
        <div class="ic-sheet tr-sheet">
            <div class="tr-head">
                <div class="tr-icon">${GROUP_ICONS[u.group] || "🪖"}</div>
                <div class="tr-titles">
                    <div class="tr-name">${u.name}</div>
                    <div class="tr-pills">
                        <span>⚔️ حمله <b>${formatNumber(u.attack)}</b></span>
                        <span>🛡️ دفاع <b>${formatNumber(Math.round(u.defense * (player.def_mult?.[u.group] ?? 1)))}</b></span>
                    </div>
                </div>
                <button class="is-close" aria-label="بستن">✕</button>
            </div>
            <div class="tr-qty-card">
                <div class="tr-qty">
                    <button class="tr-step" data-d="-1" aria-label="کم کن">−</button>
                    <input class="tr-input" type="number" inputmode="numeric" min="1" value="1" aria-label="تعداد">
                    <button class="tr-step" data-d="1" aria-label="زیاد کن">+</button>
                </div>
                <div class="tr-quick"><button data-n="1">۱</button><button data-n="10">۱۰</button><button data-n="50">۵۰</button><button class="tr-max">حداکثر</button></div>
            </div>
            <div class="tr-grid" id="tr-rows"></div>
            <div class="tr-total" id="tr-price"></div>
            <div class="tr-actions">
                <button class="modal-cancel">انصراف</button>
                <button class="modal-ok" id="tr-ok">تولید</button>
            </div>
        </div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector(".tr-input"), okBtn = ov.querySelector("#tr-ok");
    let sheetRequestId = newRequestId();
    const getN = () => Math.max(0, Math.floor(Number(inp.value) || 0));
    const tile = (label, value, sub = "", bad = false, wide = false) =>
        `<div class="tr-tile${bad ? " is-bad" : ""}${wide ? " wide" : ""}"><span class="tr-tile-k">${label}</span><b class="tr-tile-v">${value}</b>${sub}</div>`;
    const update = () => {
        const n = getN(), tiles = [];
        const qLen = (player.factory_queues?.[u.group] || []).length, qMax = factoryLimit(u.group);
        const money = player.money ?? 0;
        let bad = false;
        if (u.build_seconds) tiles.push(tile("⏱ زمان ساخت هر واحد", fmtDurationFa(u.build_seconds)));
        tiles.push(tile(`🏭 صف ${GROUP_TITLES[u.group] || ""}`, `${formatNumber(qLen)} از ${formatNumber(qMax)}`, "", qLen >= qMax));
        if (u.transport_capacity) tiles.push(tile("🚚 ظرفیت حمل در دریا", formatNumber(u.transport_capacity), `<small class="tr-tile-s">تانک و پیاده</small>`));
        if (u.aircraft_capacity) tiles.push(tile("🛬 ظرفیت هواپیما در دریا", formatNumber(u.aircraft_capacity)));
        if (u.refuel_capacity) tiles.push(tile("⛽ سوخت‌رسانی در خشکی", formatNumber(u.refuel_capacity)));
        const need = (label, needed, have, extra = "") => {
            const isBad = needed > have; if (isBad) bad = true;
            tiles.push(tile(label, formatNumber(needed), `<small class="tr-tile-s">موجود: ${formatNumber(have)}</small>${extra}`, isBad));
        };
        need("👥 نیروی انسانی", u.manpower * n, Math.floor(player.manpower ?? 0));
        // هر منبع فقط یک کاشی دارد: هزینهٔ ساخت + (اگر دارد) مصرف روزانه در همان کاشی
        Object.entries(u.resources || {}).forEach(([k, a]) => {
            const d = u.daily?.[k];
            need(`${RESOURCE_ICONS[k] || ""} ${RESOURCE_NAMES[k] || k}`, a * n, Math.floor(player.resources?.[k] ?? 0),
                d ? `<small class="tr-tile-d">🔁 روزانه ${formatNumber(d * n)}</small>` : "");
        });
        Object.entries(u.daily || {}).filter(([k]) => !(u.resources || {})[k]).forEach(([k, d]) =>
            tiles.push(tile(`🔁 مصرف روزانه · ${RESOURCE_ICONS[k] || ""} ${RESOURCE_NAMES[k] || k}`, formatNumber(d * n), `<small class="tr-tile-s">هر عدد ${formatNumber(d)}</small>`)));
        if (qLen >= qMax) bad = true;
        if (n > capLeft) { bad = true; tiles.push(tile("📦 ظرفیت آزاد کافی نیست", formatNumber(capLeft), "", true, true)); }
        const total = cost * n, noMoney = total > money; if (noMoney) bad = true;
        ov.querySelector("#tr-rows").innerHTML = tiles.join("");
        const priceBox = ov.querySelector("#tr-price");
        priceBox.className = "tr-total" + (noMoney ? " is-bad" : "");
        priceBox.innerHTML = `<div><span>هزینهٔ کل ${formatNumber(n)} عدد</span><small>${noMoney ? "پول کافی نیست · " : ""}موجودی: ${formatMoney(money)}</small></div><b>${formatMoney(total)}</b>`;
        okBtn.disabled = bad || n < 1;
        okBtn.textContent = n < 1 ? "تعداد را وارد کنید" : qLen >= qMax ? "صف کارخانه پر است" : bad ? "امکان تولید نیست" : `ثبت سفارش ${formatNumber(n)} عدد`;
    };
    ov.querySelectorAll(".tr-step").forEach(b => b.onclick = () => { inp.value = Math.max(1, getN() + Number(b.dataset.d)); update(); });
    ov.querySelectorAll(".tr-quick button[data-n]").forEach(b => b.onclick = () => { inp.value = b.dataset.n; update(); });
    ov.querySelector(".tr-max").onclick = () => { inp.value = Math.max(1, trainLimits(u)); update(); };
    inp.addEventListener("input", update);
    ov.addEventListener("click", e => { if (e.target === ov) closeInfraSheet(); });
    ov.querySelector(".is-close").onclick = closeInfraSheet;
    ov.querySelector(".modal-cancel").onclick = closeInfraSheet;
    okBtn.onclick = async () => {
        if (okBtn.disabled) return;
        okBtn.disabled = true;
        if (await trainUnit(uid_, getN(), sheetRequestId)) closeInfraSheet(); else { sheetRequestId = newRequestId(); update(); }
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
function siteIcon(s) { return s.kind === "strait" || s.kind === "port" ? "⚓" : s.kind === "front" ? "🪖" : (RESOURCE_ICONS[s.type] || "📍"); }
function unitChips(units) {
    return Object.entries(units || {}).filter(([, n]) => n > 0)
        .map(([k, n]) => `<span class="wf-chip">${unitName(k)} <b>${formatNumber(n)}</b></span>`).join("");
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
    await loadWarData(); // فهرست جنگ‌ها و مستعمره‌های دشمن قبل از اعزام آماده باشد.
    expandedLoc = null; forcesFilter = "all";
    showWarTab("war-forces-panel");
}
function openDispatchTo(siteId) { openDispatch({ to: siteId }); }

/* ---------- نیروها ---------- */
const seenIncomingAlerts = new Set();
function checkIncomingAlerts(f) {
    (f?.incoming || []).forEach(t => {
        if (!t.id || seenIncomingAlerts.has(t.id)) return;
        seenIncomingAlerts.add(t.id);
        showToast(`🚨 ${t.country_name || "دشمن"} به ${t.to_name || "یکی از مواضع شما"} نیرو فرستاده است`, "error", 6000);
    });
}
// رفرش کلی خودکار: وقتی بازیکن در بخش جنگ نیست هم هشدار نیروی دشمن را زود ببیند
setInterval(async () => {
    try {
        if (document.hidden || !player?.country) return;
        const warPage = document.getElementById("war");
        if (warPage && !warPage.classList.contains("hidden")) return; // خود بخش جنگ هر ۲٫۵ ثانیه رفرش می‌شود
        const f = await apiGet("/api/war/forces");
        if (f && f.home) {
            warForces = f; if (f.now) transitSkew = Date.parse(f.now) - Date.now();
            checkIncomingAlerts(f);
        }
    } catch (e) {}
}, 10000);
async function loadForces() {
    try {
        const [f, s] = await Promise.all([apiGet("/api/war/forces"), apiGet("/api/map-sites")]);
        if (f && f.home) { warForces = f; if (f.now) transitSkew = Date.parse(f.now) - Date.now(); checkIncomingAlerts(f); }
        warSites = Array.isArray(s) ? s : [];
        if (player?.satellite_built) await loadScanState();
    } catch (e) { console.error(e); }
    renderForcesTab();
}
function poolOf(loc) { return loc === "home" ? warForces.home : (warForces.sites.find(s => s.id === loc)?.units || {}); }
function locName(loc) {
    if (loc === "home") return "خانه";
    if (typeof loc === "string" && loc.startsWith("country:")) {
        const cid = loc.split(":")[1];
        return countries[cid]?.occupier ? `بندر مستعمرهٔ ${COUNTRY_NAMES[cid] || cid}` : `بندر ${COUNTRY_NAMES[cid] || cid}`;
    }
    return siteLabel(loc);
}
const wfStat = (n, label) => `<div class="wf-stat"><b>${formatNumber(n)}</b><span>${label}</span></div>`;

function locCardHtml(l) {
    const total = sumVals(l.units), open = expandedLoc === l.id;
    const isHome = l.kind === "home";
    const ico = isHome ? flagInline(selectedCountry) : siteIcon(l);
    const title = isHome ? `خانه · ${COUNTRY_NAMES[selectedCountry] || ""}` : l.name;
    const sub = isHome ? "خانه" : (l.kind === "strait" ? "تنگه" : l.kind === "front" ? "جبههٔ زمینی" : l.kind === "port" ? "بندر دریایی" : "سکو / معدن");
    const locPower = Number(l.power ?? Object.entries(l.units || {}).reduce((sum, [k,n]) => sum + Number(n || 0) * Number(ARMY_UNITS[k]?.attack || 0), 0));
    return `<div class="wf-loc">
        <div class="wf-loc-top" data-toggle="${l.id}">
            <span class="wf-ico">${ico}</span>
            <div class="wf-loc-name"><b>${title}</b><small>${sub} · قدرت ${formatNumber(locPower)}</small></div>
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
    const sub = isHome ? "خانه" : (l.kind === "strait" ? "تنگه" : l.kind === "front" ? "جبههٔ زمینی" : l.kind === "port" ? "بندر دریایی" : "سکو / معدن");
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
        if (f) { closeLocSheet(); openDispatch({ from: f.dataset.from }); }
        else if (h) { closeLocSheet(); openDispatch({ from: h.dataset.home, to: "home" }); }
    });
    document.body.appendChild(ov);
}

function unitCondHint(k) {
    const u = ARMY_UNITS[k] || {}, t = [];
    if (u.group === "missile") t.push("موشک؛ به مواضع اعزام نمی‌شود");
    else if (u.group === "naval") t.push("فقط دریا");
    if (k === "transport_ship" && u.transport_capacity) t.push(`حمل ${formatNumber(u.transport_capacity)} پیاده‌نظام/تانک`);
    if (k === "aircraft_carrier" && u.aircraft_capacity) t.push(`حمل ${formatNumber(u.aircraft_capacity)} هواپیما`);
    if (k === "air_tanker" && u.refuel_capacity) t.push(`سوخت‌رسانی ${formatNumber(u.refuel_capacity)} هواپیما در خشکی`);
    if (k === "infantry" || k === "tank") t.push("در دریا: ناو ترابری لازم است");
    if (k === "fighter" || k === "bomber") t.push("دریا: ناو هواپیمابر · خشکی: سوخت‌رسان");
    return t.join(" · ");
}

function dispatchPanelHtml() {
    const { from, to } = dispatchSel;
    const box = (id, label, val, empty) => `<button type="button" class="dp-sq ${val ? "set" : ""}" id="${id}"><small>${label}</small><b>${val ? escapeHtml(locName(val)) : empty}</b></button>`;
    let h = `<div class="dp-panel"><div class="dp-squares">
        ${box("dp-from", "مبدا", from, "انتخاب مبدا")}
        <div class="dp-arrow">←</div>
        ${box("dp-to", "مقصد", to, "انتخاب مقصد")}
    </div>`;
    if (from) {
        const rows = Object.entries(poolOf(from)).filter(([, n]) => n > 0);
        h += `<div class="dp-sec">نیروهای موجود در ${escapeHtml(locName(from))}</div>`;
        h += rows.length ? `<div class="dp-units">` + rows.map(([k, n]) => `
            <div class="dp-unit" data-u="${k}">
                <span class="dp-un">${escapeHtml(unitName(k))}<small>موجود ${formatNumber(n)}</small>${unitCondHint(k) ? `<small class="dp-cond">${unitCondHint(k)}</small>` : ""}</span>
                <div class="dp-qty"><button type="button" data-d="-1">−</button>
                    <input type="number" inputmode="numeric" min="0" max="${n}" value="${dispatchSel.units[k] || 0}">
                    <button type="button" data-d="1">+</button><button type="button" class="dp-all">همه</button></div>
            </div>`).join("") + `</div>` : `<div class="dp-hint">در این مبدا نیرویی وجود ندارد.</div>`;
    } else {
        h += `<div class="dp-hint">مبدا را انتخاب کن تا نیروهای موجود نمایش داده شود.</div>`;
    }
    h += `<div class="dp-rules-bar"><button type="button" class="dp-help-btn" id="dp-help-btn" aria-label="شرایط لازم برای اعزام" title="شرایط لازم برای اعزام">؟</button></div>
        <div class="dp-rules hidden" id="dp-rules"><b>شرایط لازم برای اعزام</b>
        <ul><li>در دریا، پیاده‌نظام و تانک فقط همراه ناو ترابری حرکت می‌کنند.</li>
        <li>در دریا، جنگنده و بمب‌افکن به ناو هواپیمابر نیاز دارند؛ بالگرد نیازی ندارد.</li>
        <li>در خشکی، جنگنده و بمب‌افکن به هواپیمای سوخت‌رسان نیاز دارند.</li>
        <li>ناوها به خشکی و موشک‌ها به هیچ موضعی اعزام نمی‌شوند.</li>
        <li>برای تصرف معدن، پیاده‌نظام یا تانک همراه ناو ترابری لازم است.</li></ul></div>
        <div class="dp-summary" id="dp-summary"></div>
        <button type="button" class="wf-send-btn dp-go" id="dp-go" disabled>اعزام</button></div>`;
    return h;
}

/* قوانین اعزام (آینهٔ قوانین سرور): دریا/خشکی، ناو ترابری، ناو هواپیمابر، سوخت‌رسان */
function dispatchRuleErrors(units, zone, groundOverride) {
    const errs = [], U = k => ARMY_UNITS[k] || {}, n = k => Math.max(0, units[k] || 0);
    const sum = (...ids) => ids.reduce((a, k) => a + n(k), 0);
    const banned = Object.keys(units).filter(k => n(k) > 0 && U(k).group &&
        (U(k).group === "missile" || (zone === "land" && U(k).group === "naval")));
    if (banned.length) errs.push(`این یگان‌ها نمی‌توانند به ${zone === "land" ? "خشکی" : "این موضع"} بروند: ${banned.map(unitName).join("، ")}`);
    if (zone === "sea") {
        const g = (groundOverride ?? sum("infantry", "tank")), c1 = n("transport_ship") * (U("transport_ship").transport_capacity || 0);
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
    if (typeof to === "string" && to.startsWith("country:")) {
        const errs = dispatchRuleErrors(picked, "sea");
        const ground = (picked.infantry || 0) + (picked.tank || 0);
        if ((picked.transport_ship || 0) > 0 && ground < 1) errs.push("ناو ترابری بدون محموله نمی‌تواند برای حمله یا تصرف برود؛ حداقل یک پیاده‌نظام یا تانک همراهش بفرست.");
        if (ground > 0 && !(picked.transport_ship > 0)) errs.push("برای انتقال پیاده‌نظام یا تانک تا بندر دشمن، ناو ترابری لازم است.");
        if (!Object.keys(picked).some(k => (picked[k] || 0) > 0 && ARMY_UNITS[k]?.group === "naval")) errs.push("برای این مسیر دریایی باید ناو انتخاب کنی.");
        return errs;
    }
    const dst = warSites.find(s => s.id === to);
    const combined = { ...picked };
    if (dst?.owner === selectedCountry) Object.entries(poolOf(to)).forEach(([k, v]) => combined[k] = (combined[k] || 0) + v);
    const sentGround = (picked.infantry || 0) + (picked.tank || 0);
    const errs = dispatchRuleErrors(combined, dst?.zone || (dst?.kind === "strait" ? "sea" : "land"), sentGround);
    if (dst?.owner !== selectedCountry && (picked.transport_ship || 0) > 0 && sentGround < 1)
        errs.push("ناو ترابری بدون محموله نمی‌تواند برای حمله یا تصرف برود؛ حداقل یک پیاده‌نظام یا تانک همراهش بفرست.");
    if (from && from !== "home") {
        const zs = warSites.find(s => s.id === from)?.zone || (warSites.find(s => s.id === from)?.kind === "strait" ? "sea" : "land");
        const before = poolOf(from), after = {};
        Object.keys(before).forEach(k => after[k] = before[k] - (picked[k] || 0));
        if (!dispatchRuleErrors(before, zs, 0).length && dispatchRuleErrors(after, zs, 0).length)
            errs.push("با خروج این یگان‌ها، نیروهای باقی‌مانده در مبدأ بدون پشتیبان می‌مانند");
    }
    return errs;
}

function dispatchKindText() {
    const { to } = dispatchSel;
    const dst = warSites.find(s => s.id === to);
    if (!to) return "مقصد را انتخاب کن.";
    if (to === "home") return "🏠 بازگشت به خانه";
    if (typeof to === "string" && to.startsWith("country:")) return `⚓ مسیر دریایی تا بندر ${COUNTRY_NAMES[to.split(":")[1]] || to.split(":")[1]}؛ کشتی‌ها در بندر می‌مانند و فقط نیروی زمینی با ترابری وارد کشور می‌شود`;
    if (!dst?.owner) return "🚩 موضع بی‌صاحب است؛ اشغال می‌شود";
    if (dst.owner === selectedCountry) return "🛡️ موضع خودی؛ نیروها تقویت می‌شوند";
    let kind = `⚔️ حمله به ${COUNTRY_NAMES[dst.owner] || dst.owner}`;
    const sc = scanState.sites?.[to];
    if (sc?.owner) kind += ` · قدرت دفاعی اسکن‌شده: ${formatNumber(sc.power)}`;
    return kind;
}

function updateDpSummary() {
    const sum = document.getElementById("dp-summary"), go = document.getElementById("dp-go");
    if (!sum || !go) return;
    const { from, to } = dispatchSel, total = sumVals(dispatchSel.units);
    const dst = warSites.find(s => s.id === to);
    const atk = Object.entries(dispatchSel.units).reduce((a, [k, n]) => a + n * (ARMY_UNITS[k]?.attack || 0), 0);
    const hostile = dst?.owner && dst.owner !== selectedCountry;
    const picked = Object.fromEntries(Object.entries(dispatchSel.units).filter(([, v]) => v > 0));
    const errs = (total > 0 && to) ? dispatchErrorsFor(from, to, picked) : [];
    sum.innerHTML = `<div>${dispatchKindText()}</div>` + (from ? `<div>${formatNumber(total)} یگان انتخاب شده${hostile ? ` · قدرت حمله ${formatNumber(atk)}` : ""}</div>` : "")
        + errs.map(e => `<div class="dp-error">⚠️ ${escapeHtml(e)}</div>`).join("");
    go.disabled = !from || !to || total < 1 || errs.length > 0;
}

function renderForcesTab() {
    const root = document.getElementById("war-forces-root");
    if (!root) return;
    const homeN = sumVals(warForces.home);
    const siteN = warForces.sites.reduce((a, s) => a + sumVals(s.units), 0);
    const locs = [{ id: "home", kind: "home", name: "خانه", units: warForces.home }, ...warForces.sites];
    const shown = locs.filter(l => forcesFilter === "all" || l.kind === forcesFilter);
    const chips = [["all", "همهٔ مواضع"], ["home", "خانه"], ["resource", "سکوها و معادن"], ["strait", "تنگه‌ها"], ["port", "بندرهای من"], ["front", "جبهه‌های من"]];
    root.innerHTML = `
        <div class="wf-stats">${wfStat(homeN, "در خانه")}${wfStat(siteN, `در ${formatNumber(warForces.sites.length)} موضع`)}${wfStat(homeN + siteN, "کل نیروها")}</div>
        ${incomingHtml()}
        ${transitsHtml()}
        <button class="wf-send-btn" id="wf-send-toggle">🧭 اعزام نیرو</button>
        <div class="wf-section"><span>مواضع</span><small>${formatNumber(locs.length)} مکان</small></div>
        <div class="wf-chips">${chips.map(([k, l]) => `<button class="wf-fchip ${forcesFilter === k ? "active" : ""}" data-f="${k}">${l}</button>`).join("")}</div>
        <div>${shown.map(locCardHtml).join("")}</div>`;

    root.querySelector("#wf-send-toggle").onclick = () => openDispatch({});
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
        return `<div class="wf-transit ${t.battle ? "wf-transit-live" : ""}">
            ${t.battle ? `<div class="war-live-strip">⚔️ درگیری زنده — نتیجه تا پایان نبرد اعلام می‌شود</div>` : ""}
            <div class="wf-tr-top"><b>${t.from_name} ← ${t.to_name}</b><small>${t.battle ? "در حال نبرد" : (t.kind === "back" ? "در حال بازگشت" : "در حال حرکت")} · ${formatNumber(total)} یگان</small></div>
            <div class="wf-tr-bar"><i data-tr-bar="${t.id}"></i></div>
            <div class="wf-tr-bottom"><span>⏱ <b data-tr-eta="${t.id}" dir="ltr">—</b></span>
                ${t.kind === "go" && !t.battle ? `<button class="wf-tr-cancel" data-recall="${t.id}">بازگرداندن</button>` : ""}</div>
        </div>`;
    }).join("");
}
function incomingHtml() {
    const list = warForces.incoming || [];
    if (!list.length) return "";
    return `<div class="wf-section"><span>🚨 نیروی دشمن در راه</span><small>${formatNumber(list.length)} گروه</small></div>` + list.map(t => `
        <div class="wf-transit wf-incoming">
            <div class="war-live-strip">🚨 ${flagInline(t.country, true)} ${escapeHtml(t.country_name || "")} به ${escapeHtml(t.to_name || "")} نیرو فرستاده است</div>
            <div class="wf-tr-top"><small>${t.battle ? "⚔️ نبرد در جریان است" : "زمان باقی‌مانده تا رسیدن نیروی دشمن"}</small></div>
            <div class="wf-tr-bar"><i data-in-bar="${t.id}"></i></div>
            <div class="wf-tr-bottom"><span>⏱ <b data-in-eta="${t.id}" dir="ltr">—</b></span></div>
        </div>`).join("");
}
function tickTransits() {
    const list = warForces.transits || [];
    const now = Date.now() + transitSkew;
    let done = false;
    (warForces.incoming || []).forEach(t => {
        const etaAr = Date.parse(t.eta_arrive || t.arrive), st = Date.parse(t.start);
        const left = etaAr - now, pct = Math.max(0, Math.min(100, ((now - st) / Math.max(1, etaAr - st)) * 100));
        const e = document.querySelector(`[data-in-eta="${t.id}"]`), bar = document.querySelector(`[data-in-bar="${t.id}"]`);
        if (e) e.textContent = left > 0 ? fmtEta(left) : "رسید";
        if (bar) bar.style.width = pct + "%";
        if (left <= -1500) done = true;
    });
    list.forEach(t => {
        // نوار و شمارنده باید با هم باشند: هر دو از شروع کل سفر تا زمان رسیدن نهایی.
        const ar = Date.parse(t.arrive);
        const etaAr = Date.parse(t.eta_arrive || t.arrive);
        const st = Date.parse(t.battle ? t.start : (t.trip_start || t.start));
        const left = etaAr - now, pct = Math.max(0, Math.min(100, ((now - st) / Math.max(1, etaAr - st)) * 100));
        const e = document.querySelector(`[data-tr-eta="${t.id}"]`), bar = document.querySelector(`[data-tr-bar="${t.id}"]`);
        if (e) e.textContent = left > 0 ? fmtEta(left) : "رسید";
        if (bar) bar.style.width = pct + "%";
        if (ar - now <= -1500) done = true;
    });
    if (done) { clearInterval(transitTimer); transitTimer = null; setTimeout(loadForces, 600); }
}
function startTransitTicker() {
    clearInterval(transitTimer); transitTimer = null;
    if (!(warForces.transits || []).length && !(warForces.incoming || []).length) return;
    tickTransits();
    transitTimer = setInterval(() => {
        if (document.getElementById("war")?.classList.contains("hidden")) return;
        tickTransits();
    }, 1000);
}

function closeDispatchSheet() { document.getElementById("dp-sheet")?.remove(); dispatchOpen = false; }

let dispatchLoading = false;
// ورودی واحد برای هر دو روش: از روی نقشه ({to}) و از بخش جنگ ({})
async function openDispatch(opts = {}) {
    if (dispatchLoading || document.getElementById("dp-sheet")) return;
    dispatchLoading = true;
    try {
        if (!Object.keys(ARMY_UNITS).length) await loadArmyCatalog();
        const [f, sites] = await Promise.all([apiGet("/api/war/forces"), apiGet("/api/map-sites")]);
        if (!f || !f.home) throw new Error("forces");
        warForces = f; if (f.now) transitSkew = Date.parse(f.now) - Date.now();
        warSites = Array.isArray(sites) ? sites : [];
        if (player?.satellite_built) await loadScanState();
        await loadWarData();
    } catch (e) {
        console.error(e); showToast("بارگذاری اطلاعات اعزام ناموفق بود.", "error");
        dispatchLoading = false; return;
    }
    dispatchLoading = false;
    dispatchSel = { from: opts.from || null, to: opts.to || null, units: {} };
    if (dispatchSel.from && dispatchSel.from === dispatchSel.to) dispatchSel.to = null;
    dispatchOpen = true;
    renderDispatchSheet();
}

// پنجرهٔ اعزام: از پایین تا کمی مانده به بالای صفحه، روی همان صفحه‌ای که هستی
function renderDispatchSheet() {
    let ov = document.getElementById("dp-sheet");
    if (!dispatchOpen) { ov?.remove(); return; }
    const prevScroll = ov?.querySelector(".gs-sheet-list")?.scrollTop || 0;
    if (!ov) {
        ov = document.createElement("div");
        ov.id = "dp-sheet"; ov.className = "gs-overlay gs-bottom";
        ov.addEventListener("click", e => {
            if (e.target === ov || e.target.closest(".gs-x")) {
                dispatchSel = { from: null, to: null, units: {} }; closeDispatchSheet();
            }
        });
        document.body.appendChild(ov);
    }
    ov.innerHTML = `<div class="gs-sheet dp-tall">
        <div class="gs-sheet-head"><button type="button" class="gs-x" aria-label="بستن">✕</button><span>🧭 اعزام نیرو</span></div>
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
    ov.querySelector("#dp-go").onclick = sendDispatch;
    ov.querySelector("#dp-help-btn")?.addEventListener("click", () => ov.querySelector("#dp-rules")?.classList.toggle("hidden"));
    updateDpSummary();
}

function placeRow(id, icon, name, sub) {
    return `<button type="button" class="ps-row" data-id="${escapeHtml(id)}" data-q="${escapeHtml(name)}"><span class="ps-ic">${icon}</span><span class="ps-t"><b>${escapeHtml(name)}</b><small>${escapeHtml(sub)}</small></span></button>`;
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
        (window.__activeWarTargets || []).forEach(cid => {
            const colonyOwner = countries[cid]?.occupier;
            const label = colonyOwner ? `مستعمرهٔ ${COUNTRY_NAMES[cid] || cid}` : `کشور ${COUNTRY_NAMES[cid] || cid}`;
            list.push(placeRow(`country:${cid}`, "⚓", label, `حمله از مسیر دریایی${colonyOwner ? ` · متعلق به ${COUNTRY_NAMES[colonyOwner] || colonyOwner}` : ""} · ناو ترابری برای نیروی زمینی لازم است`));
        });
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
        rows = list.join("") || `<div class="diplomacy-item-empty">مقصدی موجود نیست.</div>`;
    }
    const ov = document.createElement("div");
    ov.id = "infra-sheet"; ov.className = "modal-overlay";
    ov.innerHTML = `<div class="ic-sheet">
        <div class="is-head"><div class="is-titles"><div class="is-name">${mode === "from" ? "مبدا کجاست؟" : "مقصد کجاست؟"}</div>
            <div class="is-sub">${mode === "from" ? "جایی که نیرو داری" : "سکوها، معادن، تنگه‌ها و کشورها"}</div></div>
            <button type="button" class="is-close" aria-label="بستن">✕</button></div>
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
        closeInfraSheet(); renderDispatchSheet();
    });
}

// صفحهٔ تأیید نهایی: مبدا، مقصد و تعداد دقیق نیروها
function showDispatchConfirm(picked) {
    return new Promise(resolve => {
        const { from, to } = dispatchSel, total = sumVals(picked);
        const dst = warSites.find(s => s.id === to);
        const hostile = (typeof to === "string" && to.startsWith("country:")) || (dst?.owner && dst.owner !== selectedCountry);
        const rows = Object.entries(picked).map(([k, n]) => `<div class="is-row"><span>${escapeHtml(unitName(k))}</span><b>${formatNumber(n)}</b></div>`).join("");
        const ov = document.createElement("div");
        ov.className = "gs-overlay dp-confirm";
        ov.innerHTML = `<div class="gs-dialog dp-confirm-box">
            <div class="gs-dialog-title">تأیید اعزام نیرو</div>
            <div class="dp-route"><b>${escapeHtml(locName(from))}</b><span>←</span><b>${escapeHtml(locName(to))}</b></div>
            <div class="is-rows">${rows}</div>
            <div class="dp-confirm-total">جمع: <b>${formatNumber(total)}</b> یگان اعزام می‌شود</div>
            <div class="gs-dialog-msg ${hostile ? "dp-error" : ""}">${escapeHtml(dispatchKindText())}</div>
            <div class="gs-dialog-actions">
                <button type="button" class="gs-dbtn ${hostile ? "danger" : "ok"}" data-r="1">تأیید و اعزام</button>
                <button type="button" class="gs-dbtn cancel" data-r="0">بازگشت</button></div></div>`;
        const done = v => { ov.remove(); resolve(v); };
        ov.addEventListener("click", e => {
            const b = e.target.closest(".gs-dbtn");
            if (b) done(b.dataset.r === "1"); else if (e.target === ov) done(false);
        });
        document.body.appendChild(ov);
    });
}

function showDispatchSent(d) {
    const ov = document.createElement("div");
    ov.className = "gs-overlay gs-bottom";
    ov.innerHTML = `<div class="gs-sheet dispatch-sent-sheet"><div class="gs-sheet-head"><span>✅ نیروها اعزام شدند</span></div>
        <div class="dispatch-sent-body"><p>نیروهای شما حدود <b>${escapeHtml(d.eta_text || "")}</b> دیگر می‌رسند.</p>
        <p>برای پیگیری به بخش «جنگ» بروید.</p></div>
        <button type="button" class="wf-send-btn dispatch-sent-ok">تأیید</button></div>`;
    ov.addEventListener("click", e => { if (e.target === ov || e.target.closest(".dispatch-sent-ok")) ov.remove(); });
    document.body.appendChild(ov);
}
async function sendDispatch() {
    const { from, to } = dispatchSel;
    if (!from || !to) { showToast("مبدا و مقصد را انتخاب کن.", "error"); return; }
    const picked = Object.fromEntries(Object.entries(dispatchSel.units).filter(([, v]) => v > 0));
    if (!Object.keys(picked).length) { showToast("حداقل یک یگان انتخاب کن.", "error"); return; }
    if (!(await showDispatchConfirm(picked))) return;
    const btn = document.getElementById("dp-go"); if (btn) btn.disabled = true;
    try {
        const d = await apiPost("/api/war/dispatch", { from, to, units: picked });
        if (!d || !d.success) { showToast(d?.message || "اعزام انجام نشد.", "error"); if (btn) btn.disabled = false; return; }
        if (d.player) { player = d.player; updateHomeStats(); }
        dispatchSel = { from: null, to: null, units: {} };
        closeDispatchSheet();
        if (d.eta_seconds > 0) showDispatchSent(d); else showToast(d.message, "success");
        await loadForces();
        refreshMapSites();
    } catch (e) { console.error(e); showToast("خطا در ارتباط با سرور.", "error"); if (btn) btn.disabled = false; }
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
        const alreadyAtWar = occupied && (window.__activeWarTargets || []).includes(occupied);
        const warTarget = occupied || cid;
        const card = document.createElement("div");
        card.className = "war-target-card";
        const occText = occupied ? ` (مستعمرهٔ ${COUNTRY_NAMES[occupied] || occupied})` : "";
        const buttonText = occupied
            ? (alreadyAtWar ? `🔴 جنگ با ${COUNTRY_NAMES[occupied] || occupied} فعال است؛ از نقشه حمله کن` : `⚔️ اعلان جنگ با ${COUNTRY_NAMES[occupied] || occupied}`)
            : "⚔️ اعلان جنگ";
        card.innerHTML = `
            <div class="war-target-top">
                <div class="flag-wrap"><img class="flag-img" src="${countryImageUrl(cid)}" alt=""></div>
                <span class="war-target-name">${COUNTRY_NAMES[cid]}${occText}</span>
            </div>
            <button class="war-attack-button" data-declare="${warTarget}" ${alreadyAtWar ? "disabled" : ""}>${buttonText}</button>`;
        if (!alreadyAtWar) card.querySelector("[data-declare]").addEventListener("click", () => declareWar(warTarget));
        c.appendChild(card);
    });
}

async function askWarReason(target) {
    return new Promise(resolve => {
        const ov = document.createElement("div"); ov.className = "modal-overlay war-reason-overlay";
        ov.innerHTML = `<section class="modal-box war-reason-dialog" role="dialog" aria-modal="true" aria-labelledby="war-reason-title">
            <div class="ann-modal-head"><div><span class="ann-modal-kicker">درخواست رسمی</span><h2 class="modal-title" id="war-reason-title">اعلان جنگ به ${escapeHtml(COUNTRY_NAMES[target] || target)}</h2></div><button type="button" class="ann-modal-close" aria-label="بستن">×</button></div>
            <p>دلیل اعلان جنگ شما به کشور انتخابی چیست؟ این دلیل فقط برای سازمان ملل ارسال می‌شود؛ سازمان ملل دلیل رسمی خودش را برای همهٔ بازیکنان اعلام می‌کند.</p>
            <textarea id="war-reason-input" maxlength="1800" placeholder="دلیل خود را کامل و روشن بنویسید…"></textarea><small class="war-reason-foot">پس از تأیید سازمان ملل، زمان شروع جنگ را مدیر مشخص می‌کند و تا آن موقع فاز مذاکره است؛ سپس نیروها را از روی نقشه اعزام کن.</small>
            <div class="ann-modal-actions"><button type="button" class="modal-cancel" data-war-reason-cancel>انصراف</button><button type="button" class="ann-publish-button" data-war-reason-submit>ارسال به سازمان ملل</button></div>
        </section>`;
        document.body.appendChild(ov); const input = ov.querySelector("#war-reason-input");
        const close = value => { ov.remove(); resolve(value); };
        ov.querySelector(".ann-modal-close").onclick = () => close(null);
        ov.querySelector("[data-war-reason-cancel]").onclick = () => close(null);
        ov.addEventListener("click", e => { if (e.target === ov) close(null); });
        ov.querySelector("[data-war-reason-submit]").onclick = () => { const reason = input.value.trim(); if (!reason) { showToast("دلیل اعلان جنگ را بنویسید.", "error"); input.focus(); return; } close(reason); };
        input.focus();
    });
}

async function declareWar(target) {
    const reason = await askWarReason(target);
    if (!reason) return;
    try {
        const d = await apiPost("/api/war/declare", { target, reason });
        if (!d.success) { showToast(d.message || "امکان اعلام جنگ نیست.", "error"); return; }
        showToast(d.message || "اعلام جنگ برای بررسی ارسال شد.", "success");
        loadWarData();
    } catch (e) { showToast("خطا.", "error"); }
}

async function loadWarData() {
    try {
        await loadCountries(); // وضعیت مستعمره‌ها و مالک فعلی‌شان باید تازه باشد.
        const d = await apiGet("/api/wars");

        const enemyCountries = [...new Set([...(d.active || [])]
            .filter(w => w.status === "battle" && [w.attacker, w.defender].includes(selectedCountry))
            .map(w => w.attacker === selectedCountry ? w.defender : w.attacker))];
        const enemyColonies = Object.keys(countries || {}).filter(colony => {
            const occupier = countries[colony]?.occupier;
            return Boolean(occupier && enemyCountries.includes(occupier));
        });
        window.__activeWarTargets = [...new Set([...enemyCountries, ...enemyColonies])];
        const act = document.getElementById("war-active-list");
        if (act) {
            act.innerHTML = "";
            const all = [...(d.pending || []), ...(d.active || [])];
            if (!all.length) act.innerHTML = `<div class="diplomacy-item-empty">جنگ فعالی نیست.</div>`;
            all.forEach(w => {
                const div = document.createElement("div");
                div.className = "war-active-card";
                const leftMs = w.negotiation_ends ? new Date(w.negotiation_ends).getTime() - Date.now() : 0;
                const leftText = leftMs > 0 ? `${formatNumber(Math.floor(leftMs / 3600000))} ساعت و ${formatNumber(Math.floor((leftMs % 3600000) / 60000))} دقیقه` : "کمتر از یک دقیقه";
                let statusText = w.status === "pending_admin" ? "در انتظار تأیید سازمان ملل" :
                                 w.status === "negotiation" ? `🤝 فاز مذاکره — جنگ تا ${leftText} دیگر آغاز می‌شود` :
                                 w.status === "battle" ? "🔴 در جنگ؛ حرکت نیروها روی نقشه فعال است" : w.status;
                const involved = [w.attacker, w.defender].includes(selectedCountry);
                const votes = w.peace_votes || [];
                const iVoted = votes.includes(selectedCountry);
                const otherVoted = votes.some(c => c !== selectedCountry);
                const canPeace = involved && ["negotiation", "battle"].includes(w.status);
                const peaceNote = !canPeace ? "" : iVoted ? `<p class="war-peace-note">✅ پیشنهاد صلح شما ثبت شد؛ منتظر پذیرش طرف مقابل هستیم.</p>`
                    : otherVoted ? `<p class="war-peace-note">🕊️ طرف مقابل پیشنهاد صلح داده است؛ با زدن دکمه صلح برقرار می‌شود.</p>` : "";
                const peaceBtn = !canPeace ? "" : iVoted
                    ? `<button type="button" class="war-peace-btn is-cancel is-active" data-peace="cancel" data-war-id="${escapeHtml(w.id)}">لغو پیشنهاد صلح</button>`
                    : `<button type="button" class="war-peace-btn${otherVoted ? " is-active" : ""}" data-peace="offer" data-war-id="${escapeHtml(w.id)}">🕊️ صلح</button>`;
                div.innerHTML = `
                    <div class="war-live-strip">${w.status === "battle" ? "🔴 در جنگ — نیروها را روی نقشه اعزام کن" : w.status === "negotiation" ? "🤝 فاز مذاکره" : "وضعیت جنگ"}</div>
                    <h4>${COUNTRY_NAMES[w.attacker]} ← ${COUNTRY_NAMES[w.defender]}</h4>
                    <p>${statusText}${w.penalty ? ` — جریمهٔ ثبت‌شده: ${formatMoney(w.penalty)}` : ""}</p>
                    ${w.admin_reason ? `<p class="war-reason-display"><b>دلیل اعلان جنگ:</b> ${escapeHtml(w.admin_reason)}</p>` : (w.reason ? `<p class="war-reason-display"><b>دلیل:</b> ${escapeHtml(w.reason)}</p>` : "")}
                    ${peaceNote}${peaceBtn}`;
                div.querySelector("[data-peace]")?.addEventListener("click", async (ev) => {
                    const btn = ev.currentTarget; btn.disabled = true;
                    try {
                        const r = await apiPost("/api/war/peace", { war_id: btn.dataset.warId, action: btn.dataset.peace });
                        showToast(r.message || (r.success ? "ثبت شد." : "خطا"), r.success ? "success" : "error");
                    } catch (e) { showToast("خطای شبکه.", "error"); }
                    loadWarData();
                });
                act.appendChild(div);
            });
        }
        if (currentWarTab === "war-targets-panel") renderWarTargets();

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

const WAR_EVENT_ICONS = { peace: "🕊️", war_declared: "⚔️", war_started: "🔴", declare: "⚔️", occupy: "🚩", capture: "🚩", repel: "🛡️", release: "🏳️", send: "🧭", return: "🏠", turnback: "↩️" };

function renderWarNews() {
    const box = document.getElementById("war-news-list");
    if (!box) return;
    const list = warLog.events.filter(e =>
        (!newsCountry || (e.countries || []).includes(newsCountry)) && (!newsQ || e.text.includes(newsQ))).slice(0, 200);
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
            if (!d.completion_message) showToast(d.message);
            if (d.player) { player = d.player; updateHomeStats(); }
            renderSatTab();
        } catch (e) { showToast("خطا."); }
    };
    root.querySelector("#sat-launch").onclick = () => act("/api/satellite/launch", {});
    root.querySelectorAll(".sat-scan").forEach(b => b.onclick = () => act("/api/satellite/scan-country", { country: b.dataset.c }));
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
        if (!d.success) { showToast(d.message || "خطا", "error"); return; }
        showToast(d.message, "success"); loadDiplomacyStatus();
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
        if (!d.success) { showToast(d.message || "خطا", "error"); return; }
        showToast(accept ? "پذیرفته شد." : "رد شد.", "success");
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
        else if (page === "communications") {
            resetNewsFilter();
            Promise.allSettled([loadAnnouncements(), loadUnion(), loadNews({ markSeen: isNewsTabVisible() })]).catch(console.error);
            refreshNotificationBadge();
        }
        else if (page === "market") { loadMarketListings(); loadMyListings(); }
    });
});

/* =========================================================
   پنل مدیریت اختصاصی مدیر اصلی
========================================================= */
const ADMIN_TELEGRAM_ID = 8290076602;
let adminOverviewCache = null;
let adminCurrentDetailWorld = null;
let adminPanelLoading = false;
let adminPrivateMessagesCache = [];
let adminSelectedPlayerId = null;
let adminSelectedPlayerDetailOpen = false;
const adminCountryLabels = {germany:"آلمان",britain:"بریتانیا",ussr:"شوروی",usa:"آمریکا",france:"فرانسه",italy:"ایتالیا",china:"چین",japan:"ژاپن",saudi:"عربستان",iran:"ایران",turkey:"ترکیه",venezuela:"ونزوئلا",egypt:"مصر"};
const isAdminAccount = Number(userId) === ADMIN_TELEGRAM_ID;

/* راهنمای شروع: فقط بار اول خودکار نمایش داده می‌شود */
const guideModal = document.getElementById("guide-modal");
const guideSeenKey = () => `fl93_guide_seen_${userId || "guest"}_w${selectedWorldId || "1"}`;
function showGuideTab(name) {
    guideModal?.querySelectorAll(".guide-tab").forEach(b => b.classList.toggle("active", b.dataset.guideTab === name));
    guideModal?.querySelectorAll(".guide-pane").forEach(p => p.classList.toggle("active", p.id === `guide-pane-${name}`));
    const pane = guideModal?.querySelector(`#guide-pane-${name}`); if (pane) pane.scrollTop = 0;
}
function openGuide(tab = "logic") { guideModal?.classList.remove("hidden"); showGuideTab(tab); }
guideModal?.querySelectorAll(".guide-tab").forEach(b => b.addEventListener("click", () => showGuideTab(b.dataset.guideTab)));
const guideCloseWaiters = [];
function waitGuideClosed() {
    if (!guideModal || guideModal.classList.contains("hidden")) return Promise.resolve();
    return new Promise(resolve => guideCloseWaiters.push(resolve));
}
function closeGuide() {
    guideModal?.classList.add("hidden");
    try { localStorage.setItem(guideSeenKey(), "1"); } catch (e) {}
    guideCloseWaiters.splice(0).forEach(resolve => resolve());
}
async function maybeShowGuide() {
    // سرور تعیین‌کننده است: اگر این بازیکن (در این دنیا) راهنما را ندیده، همین حالا نشان بده.
    // پرچم مرورگر فقط وقتی استفاده می‌شود که سرور در دسترس نباشد.
    let serverSeen = null;
    try {
        const me = await apiGet("/api/player");
        if (me && typeof me === "object" && !me.error) serverSeen = !!me.guide_seen;
    } catch (e) {}
    if (serverSeen === null) {
        try { serverSeen = localStorage.getItem(guideSeenKey()) === "1"; } catch (e) { serverSeen = false; }
    }
    if (serverSeen) return;
    openGuide();
    try { localStorage.setItem(guideSeenKey(), "1"); } catch (e) {}
    try { await apiPost("/api/guide/seen", {}); } catch (e) {}
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
    const item = event.target.closest("[data-menu-page], #open-guide-menu");
    if (!item) return;
    closeGameMenu();
    if (item.id === "open-guide-menu") { openGuide(); return; }
    const page = item.dataset.menuPage;
    showGamePage(page);
    if (page === "map") setTimeout(() => initWorldMap(), 30);
    else if (page === "communications") {
        resetNewsFilter();
        loadAnnouncements().catch(console.error);
        loadUnion().catch(console.error);
        loadNews({ markSeen: isNewsTabVisible() }).catch(console.error);
    }
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
    if (!adminAutoRefreshTimer) adminAutoRefreshTimer = setInterval(() => {
        const panel = document.getElementById("admin");
        if (panel && !panel.classList.contains("hidden") && !document.hidden) loadAdminPanel();
    }, 10000);
    if (adminPanelLoading) return;
    adminPanelLoading = true;
    const requestWorldId = String(selectedWorldId);
    const error = document.getElementById("admin-access-error");
    error?.classList.add("hidden");
    const list = document.getElementById("admin-player-list");
    if (list && !adminOverviewCache) list.innerHTML = `<div class="admin-empty"><span class="admin-loader"></span>در حال دریافت اطلاعات بازی…</div>`;
    try {
        const [data, warsData, globalData, communicationsData, unData] = await Promise.all([
            apiGet("/api/admin/overview"), apiGet("/api/admin/wars"), apiGet("/api/admin/global"), apiGet("/api/admin/communications"),
            apiGet("/api/admin/un-messages")
        ]);
        if (requestWorldId !== String(selectedWorldId)) return;
        adminWarsCache = warsData?.wars || [];
        adminWorldsCache = globalData?.worlds || [];
        adminPrivateMessagesCache = communicationsData?.messages || [];
        adminUnMessagesCache = unData?.messages || [];
        renderAdminGlobal();
        renderAdminUnMessages();
        renderAdminCommunications();
        if (!data?.success) {
            if (error) { error.textContent = data?.message || (data?.error === "forbidden" ? "دسترسی به پنل مدیریت رد شد." : "احراز هویت تلگرام تأیید نشد؛ بازی را از داخل تلگرام باز کن."); error.classList.remove("hidden"); }
            if (list) list.innerHTML = `<div class="admin-empty">اطلاعات مدیریت دریافت نشد.</div>`;
            return;
        }
        adminOverviewCache = data;
        if (adminCurrentDetailWorld !== null && !document.querySelector("#admin input:focus, #admin textarea:focus, #admin select:focus") && !adminSelectedPlayerDetailOpen) renderAdminOverview();
        document.getElementById("admin-last-refresh").textContent = "آخرین بروزرسانی: " + new Date().toLocaleTimeString("fa-IR") + " · هر ۱۰ ثانیه";
    } catch (e) {
        if (error) { error.textContent = "ارتباط با سرور برقرار نشد. دوباره تلاش کن."; error.classList.remove("hidden"); }
        if (list && !adminOverviewCache) list.innerHTML = `<div class="admin-empty">خطا در دریافت اطلاعات.</div>`;
    } finally { adminPanelLoading = false; }
}
function renderAdminWars() {
    const root = document.getElementById("admin-war-list"); if (!root) return;
    const pending = (adminWarsCache || []).filter(w => ["pending_admin", "negotiation", "battle", "peace", "rejected", "resolved"].includes(w.status));
    if (!pending.length) { root.innerHTML = `<div class="admin-empty">درخواست جنگی برای این دنیا ثبت نشده است.</div>`; return; }
    root.innerHTML = pending.map(w => {
        const status = w.status === "pending_admin" ? "در انتظار بررسی مدیر" : w.status === "negotiation" ? "فاز مذاکره" : w.status === "battle" ? "جنگ آغاز شده" : w.status === "peace" ? "صلح برقرار شد" : w.status === "resolved" ? "مختومه" : "رد شده";
        const end = w.status === "negotiation" && w.negotiation_ends ? `پایان مذاکره و شروع جنگ: ${new Date(w.negotiation_ends).toLocaleString("fa-IR")}` : "";
        const officialReason = w.admin_reason ? `<div class="admin-war-reason"><b>دلیل رسمی شما (ارسال‌شده برای همه)</b><p>${escapeHtml(w.admin_reason)}</p></div>` : "";
        return `<article class="admin-war-card"><div class="admin-war-card-head"><div><b>${escapeHtml(w.attacker_name || COUNTRY_NAMES[w.attacker] || w.attacker)} ← ${escapeHtml(w.defender_name || COUNTRY_NAMES[w.defender] || w.defender)}</b><small>${escapeHtml(status)} · ${escapeHtml(w.created_at ? new Date(w.created_at).toLocaleString("fa-IR") : "")}</small></div><span class="admin-war-status">${escapeHtml(w.status)}</span></div><details class="admin-war-detail"><summary>👁️ بازکردن جزئیات و دلیل اعلان جنگ</summary><div class="admin-war-reason"><b>دلیل بازیکن</b><p>${escapeHtml(w.reason || "دلیلی ثبت نشده است.")}</p></div>${officialReason}${end ? `<small class="admin-war-meta">${escapeHtml(end)}</small>` : ""}</details>${w.status === "pending_admin" ? `<label class="admin-war-official"><b>✍️ دلیل رسمی شما (برای همهٔ بازیکنان ارسال می‌شود)</b><textarea class="admin-war-official-input" data-war-reason-for="${escapeHtml(w.id)}" maxlength="1000" placeholder="دلیل اعلان جنگ را اینجا بنویسید…"></textarea></label><label class="admin-war-official"><b>⏰ ساعت شروع جنگ (چند ساعت بعد از تأیید؟)</b><input type="number" class="admin-war-hours-input" data-war-hours-for="${escapeHtml(w.id)}" min="0" max="720" step="0.5" value="24" inputmode="decimal"><small>مثلاً ۲ یعنی دو ساعت بعد از تأیید، جنگ شروع می‌شود؛ ۰ یعنی همین الان.</small></label><div class="admin-war-actions"><button type="button" data-war-review="approve" data-war-id="${escapeHtml(w.id)}">✅ تأیید و اعلان جنگ</button><button type="button" data-war-review="reject" data-war-id="${escapeHtml(w.id)}">✕ رد درخواست</button></div>` : ""}</article>`;
    }).join("");
    root.querySelectorAll("[data-war-review]").forEach(button => button.addEventListener("click", async () => {
        const action = button.dataset.warReview, warId = button.dataset.warId;
        let adminReason = "", startHours = 24;
        if (action === "approve") {
            const box = root.querySelector(`[data-war-reason-for="${CSS.escape(warId)}"]`);
            adminReason = (box?.value || "").trim();
            if (!adminReason) { showToast("اول دلیل رسمی خودتان را بنویسید.", "error"); box?.focus(); return; }
            const hoursBox = root.querySelector(`[data-war-hours-for="${CSS.escape(warId)}"]`);
            startHours = Number(String(hoursBox?.value ?? "").replace(",", "."));
            if (hoursBox?.value === "" || !Number.isFinite(startHours) || startHours < 0 || startHours > 720) { showToast("ساعت شروع جنگ باید عددی بین ۰ تا ۷۲۰ باشد.", "error"); hoursBox?.focus(); return; }
            const whenTxt = startHours === 0 ? "جنگ همین الان شروع می‌شود" : `${startHours} ساعت فرصت مذاکره دارند و بعد از آن جنگ شروع می‌شود`;
            if (!confirm(`تأیید می‌کنی؟ به همهٔ بازیکنان پیام می‌رود که این کشور به آن کشور اعلان جنگ کرد (با دلیل تو)؛ ${whenTxt}.`)) return;
        }
        button.disabled = true;
        try {
            const result = await apiPost("/api/admin/war/review", { war_id: warId, action, admin_reason: adminReason, start_hours: startHours });
            showToast(result.message || (result.success ? "بررسی انجام شد." : "خطا"), result.success ? "success" : "error");
            if (result.success) await loadAdminPanel(); else button.disabled = false;
        } catch { showToast("ارتباط با سرور برقرار نشد.", "error"); button.disabled = false; }
    }));
}

async function switchAdminWorld(worldId) {
    selectedWorldId = String(worldId);
    adminSelectedPlayerId = null; adminSelectedPlayerDetailOpen = false;
    // مدیریت دنیا نباید حساب مدیر را به‌عنوان بازیکن به دنیای انتخاب‌شده اضافه کند.
    player = null; selectedCountry = null;
    adminCurrentDetailWorld = String(worldId);
    adminOverviewCache = null;
    renderAdminNavigation();
    await loadAdminPanel();
    showGamePage("admin");
}

function renderAdminNavigation() {
    const inside = adminCurrentDetailWorld !== null;
    document.getElementById("admin-world-detail")?.classList.toggle("hidden", !inside);
    document.getElementById("admin-global")?.classList.toggle("hidden", inside);
    document.getElementById("admin-current-world")?.classList.toggle("hidden", !inside);
    if (inside) {
        const w = adminWorldsCache.find(x => String(x.id) === String(adminCurrentDetailWorld));
        document.getElementById("admin-world-detail-title").textContent = "🌍 " + (w?.name || `دنیای ${adminCurrentDetailWorld}`);
    }
}
function renderAdminGlobal() {
    const data = adminWorldsCache || [];
    const stats = document.getElementById("admin-global-stats");
    const total = key => data.reduce((a,w) => a + Number(w[key] || 0), 0);
    if (stats) stats.innerHTML = [["🌍 دنیاها", data.length], ["👥 بازیکنان", total("total_players")], ["🏳️ کشورهای اشغال‌شده", total("countries_taken")], ["🟢 بازیکنان فعال", total("active_players")], ["⚔️ جنگ‌های در انتظار", total("pending_wars")], ["📨 پیام‌های خصوصی", total("private_message_count")]].map(([label,value]) => `<div class="admin-global-stat"><span>${label}</span><strong>${adminFormatNumber(value)}</strong></div>`).join("");
    const list = document.getElementById("admin-world-picker");
    if (list) renderAdminWorldPicker();
    renderAdminNavigation();
}
let adminOpenWorldId = null;
function renderAdminWorldPicker() {
    const root = document.getElementById("admin-world-picker"); if (!root) return;
    const ae = document.activeElement;
    if (ae && ae.tagName === "INPUT" && root.contains(ae)) return; // وسط تایپ نام، رفرش خودکار فرم را پاک نکند
    const worlds = adminWorldsCache || [];
    if (!worlds.length) { root.innerHTML = '<div class="admin-empty">دنیایی ثبت نشده است.</div>'; return; }
    root.innerHTML = worlds.map(w => {
        const id = String(w.id), open = String(adminOpenWorldId) === id;
        const name = w.name || `دنیای ${w.id}`;
        const started = Boolean(w.game_started_at), finished = Boolean(w.game_finished), regOpen = Boolean(w.registration_open);
        const total = Number(w.total_countries || 11);
        const dayTxt = finished ? `پایان‌یافته · برنده: ${escapeHtml(w.winner?.name || "—")}` : started ? `روز ${adminFormatNumber(w.day)} از ۳۱ · فصل ${escapeHtml(w.season || "")}` : "فصل شروع نشده";
        const info = `<small class="admin-pick-info"><span>📅 ${dayTxt}</span><span>📝 ثبت‌نام: ${regOpen ? "باز" : "بسته"}</span><span>🌍 ${adminFormatNumber(w.countries_taken)} کشور از ${adminFormatNumber(total)} کشور گرفته شده · ${adminFormatNumber(w.total_players)} بازیکن</span></small>`;
        const panel = open ? `<div class="admin-world-panel">
            <button type="button" class="admin-wp-enter" data-wp="enter" data-id="${id}">ورود به ${escapeHtml(name)} →</button>
            <div class="admin-wp-rename"><input type="text" maxlength="50" value="${escapeHtml(name)}" data-wp-name="${id}" aria-label="نام دنیا"><button type="button" data-wp="rename" data-id="${id}">✏️ ویرایش نام</button></div>
            ${!started && !finished ? `<button type="button" data-wp="start" data-id="${id}">▶ شروع فصل</button>` : ""}
            ${!finished ? `<button type="button" data-wp="registration" data-id="${id}" data-open="${regOpen ? "0" : "1"}">${regOpen ? "🔒 بستن ثبت‌نام" : "🔓 باز کردن ثبت‌نام"}</button>` : ""}
            <button type="button" class="admin-wp-delete" data-wp="delete" data-id="${id}">🗑 حذف دنیا</button>
        </div>` : "";
        return `<div class="admin-world-item ${open ? "open" : ""}"><button type="button" class="admin-pick-world" data-pick-world="${id}" aria-expanded="${open}"><span><b>🌐 ${escapeHtml(name)}</b>${info}</span><span class="admin-pick-chevron">${open ? "⌃" : "⌄"}</span></button>${panel}</div>`;
    }).join("");
}
function renderAdminCommunications() {
    const root = document.getElementById("admin-pm-list"); if (!root) return;
    const messages = adminPrivateMessagesCache || [];
    const flagged = messages.filter(m => /شکایت|اعتراض|سازمان ملل|گزارش تخلف|complaint|report/i.test(m.text || ""));
    const renderItem = m => `<article class="admin-news-row"><div><b>${escapeHtml(COUNTRY_NAMES[m.from] || m.from || "نامشخص")} ← ${escapeHtml(COUNTRY_NAMES[m.to] || m.to || "نامشخص")}</b><p>${escapeHtml(m.text || "")}</p><small>${escapeHtml(m.at ? new Date(m.at).toLocaleString("fa-IR") : "")}</small></div></article>`;
    root.innerHTML = `<h4>📋 پیام‌های دارای نشانه شکایت (${flagged.length})</h4>${flagged.length ? flagged.map(renderItem).join("") : '<div class="admin-empty">شکایتی از متن پیام‌ها شناسایی نشد.</div>'}<h4 style="margin-top:20px">💬 پیام‌های خصوصی اخیر (${messages.length})</h4>${messages.length ? messages.map(renderItem).join("") : '<div class="admin-empty">پیامی در این دنیا ثبت نشده است.</div>'}`;
}
document.getElementById("admin-add-world-btn")?.addEventListener("click", () => {
    const form = document.getElementById("admin-create-world-form");
    if (!form) return;
    const opened = form.classList.toggle("hidden") === false;
    if (opened) document.getElementById("admin-new-world-name")?.focus();
});
document.getElementById("admin-world-picker")?.addEventListener("click", async e => {
    const pick = e.target.closest("[data-pick-world]");
    if (pick) {
        const id = String(pick.dataset.pickWorld);
        adminOpenWorldId = String(adminOpenWorldId) === id ? null : id;
        renderAdminWorldPicker();
        return;
    }
    const btn = e.target.closest("[data-wp]"); if (!btn) return;
    const act = btn.dataset.wp, wid = String(btn.dataset.id);
    const w = (adminWorldsCache || []).find(x => String(x.id) === wid);
    const done = async () => { await fetchAvailableWorlds(); await loadAdminPanel(); };
    if (act === "enter") {
        btn.disabled = true;
        try { await switchAdminWorld(wid); document.querySelector('[data-admin-tab="players"]')?.click(); }
        catch { showToast("تغییر دنیا ناموفق بود.", "error"); }
        finally { btn.disabled = false; }
        return;
    }
    btn.disabled = true;
    try {
        if (act === "rename") {
            const name = (document.querySelector(`[data-wp-name="${CSS.escape(wid)}"]`)?.value || "").trim();
            if (!name) { showToast("نام دنیا را وارد کن.", "error"); btn.disabled = false; return; }
            const r = await apiPost("/api/admin/worlds/rename", { world_id: wid, name });
            showToast(r.message || (r.success ? "نام تغییر کرد." : "تغییر نام انجام نشد."), r.success ? "success" : "error");
            if (r.success) { document.activeElement?.blur?.(); await done(); }
        } else if (act === "start") {
            if (!confirm(`فصل «${w?.name || wid}» همین حالا آغاز شود؟ ثبت‌نام بسته می‌شود و زمان ۳۱ روزه برای همه یکسان خواهد بود.`)) { btn.disabled = false; return; }
            const r = await apiPost("/api/admin/world/start", {}, { world_id: wid });
            showToast(r.message || (r.success ? "فصل شروع شد." : "شروع فصل انجام نشد."), r.success ? "success" : "error");
            if (r.success) await done();
        } else if (act === "registration") {
            const r = await apiPost("/api/admin/world/registration", { open: btn.dataset.open === "1" }, { world_id: wid });
            showToast(r.message || (r.success ? "وضعیت ثبت‌نام تغییر کرد." : "عملیات انجام نشد."), r.success ? "success" : "error");
            if (r.success) await done();
        } else if (act === "delete") {
            if (!confirm(`دنیای «${w?.name || wid}» با همهٔ بازیکنان و اطلاعاتش برای همیشه حذف شود؟ این کار برگشت‌پذیر نیست.`)) { btn.disabled = false; return; }
            const r = await apiPost("/api/admin/worlds/delete", { world_id: wid });
            showToast(r.message || (r.success ? "دنیا حذف شد." : "حذف انجام نشد."), r.success ? "success" : "error");
            if (r.success) {
                adminOpenWorldId = null;
                await fetchAvailableWorlds();
                if (String(selectedWorldId) === wid) { const next = (availableWorlds || [])[0]; if (next) selectedWorldId = String(next.id); }
                await loadAdminPanel();
            }
        }
    } catch { showToast("ارتباط با سرور برقرار نشد.", "error"); }
    finally { btn.disabled = false; }
});
document.getElementById("admin-back-worlds")?.addEventListener("click", () => {
    adminCurrentDetailWorld = null;
    adminSelectedPlayerId = null;
    adminSelectedPlayerDetailOpen = false;
    renderAdminNavigation();
    document.getElementById("admin-world-picker")?.classList.remove("hidden");
    renderAdminWorldPicker();
    document.getElementById("admin-scroll")?.scrollTo(0,0);
});
function renderAdminWorldSwitcher() {
    const root = document.getElementById("admin-world-switcher"); if (!root) return;
    const worlds = adminWorldsCache || [];
    if (!worlds.length) { root.innerHTML = `<div class="admin-empty">هنوز دنیایی ثبت نشده است.</div>`; return; }
    const current = worlds.find(w => String(w.id) === String(selectedWorldId));
    root.innerHTML = `<div class="admin-world-switcher-head"><div><b>🌍 دنیاهای بازی</b><small>دنیای فعال: ${escapeHtml(current?.name || `دنیای ${selectedWorldId}`)}</small></div><span>${worlds.length} دنیا</span></div><div class="admin-world-switcher-list">${worlds.map(w => `<button type="button" class="admin-world-switch-chip ${String(w.id) === String(selectedWorldId) ? "active" : ""}" data-switch-world="${w.id}"><span>🌐 ${escapeHtml(w.name || `دنیای ${w.id}`)}</span><small>${formatNumber(w.players || 0)} بازیکن</small></button>`).join("")}</div>`;
    root.querySelectorAll("[data-switch-world]").forEach(button => button.addEventListener("click", async () => {
        if (String(button.dataset.switchWorld) === String(selectedWorldId)) return;
        button.disabled = true;
        try { await switchAdminWorld(button.dataset.switchWorld); }
        catch { showToast("تغییر دنیا ناموفق بود.", "error"); }
        finally { button.disabled = false; }
    }));
}

document.getElementById("admin-create-world-form")?.addEventListener("submit", async event => {
    event.preventDefault(); if (!isAdminAccount) return;
    const input = document.getElementById("admin-new-world-name"); const name = input?.value?.trim() || "";
    const submit = event.currentTarget.querySelector("[type=submit]"); if (submit) submit.disabled = true;
    try {
        const result = await apiPost("/api/admin/worlds/create", { name });
        showToast(result.message || (result.success ? "دنیای جدید ساخته شد." : "ساخت دنیا ناموفق بود."), result.success ? "success" : "error");
        if (result.success) { if (input) input.value = ""; document.getElementById("admin-create-world-form")?.classList.add("hidden"); await fetchAvailableWorlds(); await loadAdminPanel(); }
    } catch { showToast("ارتباط با سرور برقرار نشد.", "error"); }
    finally { if (submit) submit.disabled = false; }
});
document.getElementById("admin-wars-refresh")?.addEventListener("click", loadAdminPanel);
document.getElementById("admin-player-detail-back")?.addEventListener("click", () => { adminSelectedPlayerDetailOpen = false; adminSelectedPlayerId = null; document.getElementById("admin-player-editor")?.classList.remove("admin-detail-fullscreen"); renderAdminOverview(); document.getElementById("admin-player-list")?.scrollIntoView({ behavior: "instant", block: "start" }); });

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
            const stateTags = [p.vip ? "VIP" : "", p.is_eliminated ? "حذف‌شده" : "", p.is_online ? "آنلاین" : `آخرین ورود ${adminRelativeTime(p.last_seen_at)}`].filter(Boolean).join(" · ");
            const exactSeen = p.last_seen_at ? new Date(p.last_seen_at).toLocaleString("fa-IR") : "سابقهٔ ورود ثبت نشده";
            return `<div role="button" tabindex="0" class="admin-player-row ${Number(adminSelectedPlayerId) === Number(p.user_id) ? "selected" : ""} ${p.is_eliminated ? "eliminated" : ""}" data-admin-player="${p.user_id}"><span class="admin-player-flag">${escapeHtml(p.country_flag || "🌐")}</span><span class="admin-player-main"><b>${escapeHtml(name)}</b><small class="admin-player-handle">${escapeHtml(handle)}</small><small class="admin-player-id">آیدی تلگرام: <strong>${p.user_id}</strong> <button type="button" class="admin-copy-id" data-admin-copy-id="${p.user_id}" title="کپی آیدی">کپی</button></small><small>${escapeHtml(p.country_name || "بدون کشور")}${stateTags ? " · " + escapeHtml(stateTags) : ""}</small><small class="admin-player-last-seen">آخرین فعالیت دقیق: ${escapeHtml(exactSeen)}</small></span><span class="admin-player-metrics"><b>$${adminFormatNumber(p.money)}</b><small>نیرو ${adminFormatNumber(p.manpower)}</small><small>${escapeHtml(adminRelativeTime(p.last_seen_at))}</small></span><span class="admin-row-actions"><button type="button" class="admin-row-btn" data-admin-adjust="${p.user_id}">💰 افزایش موجودی</button><button type="button" class="admin-row-btn danger" data-admin-reset="${p.user_id}">♻️ ریست</button></span><span class="admin-player-chevron">›</span></div>`;
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
    renderAdminWars();
    renderAdminWorldSwitcher();
    const worldLabel = el("admin-current-world");
    if (worldLabel) {
        const current = (adminWorldsCache || []).find(w => String(w.id) === String(selectedWorldId));
        worldLabel.textContent = current ? `${current.name} · ${current.players} بازیکن` : `دنیای ${selectedWorldId}`;
    }
}
function renderAdminPlayerEditor(p) {
    const el = id => document.getElementById(id);
    el("admin-player-editor")?.classList.remove("hidden");
    el("admin-player-editor")?.classList.toggle("admin-detail-fullscreen", adminSelectedPlayerDetailOpen);
    if (el("admin-editor-title")) el("admin-editor-title").textContent = `${p.country_flag || "🌐"} ${adminPlayerName(p)}`;
    if (el("admin-editor-subtitle")) el("admin-editor-subtitle").textContent = `${p.country_name || "بدون کشور"} · درآمد خالص روزانه: $${adminFormatNumber(p.daily_income)}`;
    const identity = el("admin-identity-card");
    if (identity) identity.innerHTML = `<div class="admin-identity-main"><span class="admin-identity-avatar">${escapeHtml((adminPlayerName(p).trim()[0] || "👤"))}</span><div><b>${escapeHtml(adminPlayerName(p))}</b><small>${p.telegram_username ? "@" + escapeHtml(p.telegram_username) : "نام کاربری تلگرام ثبت نشده"}</small></div></div><div class="admin-identity-id"><span>آیدی عددی تلگرام</span><strong>${p.user_id}</strong><button type="button" class="admin-copy-id" data-admin-copy-id="${p.user_id}">کپی آیدی</button></div><div class="admin-identity-meta"><span>آخرین فعالیت: ${escapeHtml(adminRelativeTime(p.last_seen_at))}</span><span>ساعت دقیق: ${escapeHtml(p.last_seen_at ? new Date(p.last_seen_at).toLocaleString("fa-IR") : "ثبت نشده")}</span><span>زبان: ${escapeHtml(p.telegram_language_code || "نامشخص")}</span><span>شروع بازی: ${escapeHtml(p.started_at ? new Date(p.started_at).toLocaleString("fa-IR") : "هنوز شروع نکرده")}</span><span>آخرین به‌روزرسانی وضعیت بازی: ${escapeHtml(p.last_update ? new Date(p.last_update).toLocaleString("fa-IR") : "ثبت نشده")}</span><span>وضعیت: ${p.is_eliminated ? "حذف‌شده" : (p.is_online ? "آنلاین" : "آفلاین")}</span></div>`;
    const extra = el("admin-player-extra-details");
    if (extra) {
        const levels = p.infra_levels || {};
        const buildingRows = Object.entries(levels).filter(([, level]) => Number(level) > 0).map(([key, level]) => {
            const item = (p.building_catalog || {})[key];
            const name = item?.name || key;
            const group = item?.group === "economy" ? "اقتصاد" : "زیرساخت";
            return `<div class="admin-inventory-row"><span>${escapeHtml(name)} <small>${group}</small></span><b>سطح ${formatNumber(level)}</b></div>`;
        }).join("");
        const unitRows = Object.entries(p.army_units || p.units || {}).filter(([, amount]) => Number(amount) > 0).map(([key, amount]) => {
            const unit = ARMY_UNITS[key];
            return `<div class="admin-inventory-row"><span>${escapeHtml(unit?.name || key)} <small>یگان</small></span><b>${formatNumber(amount)}</b></div>`;
        }).join("");
        const resources = Object.entries(p.resources || {}).map(([key, amount]) => `<div class="admin-inventory-row"><span>${escapeHtml(RESOURCE_NAMES[key] || key)} <small>منبع</small></span><b>${formatNumber(amount)}</b></div>`).join("");
        const infoRows = (rows, renderRow, empty) => rows?.length ? rows.map(renderRow).join("") : `<p class="admin-inventory-empty">${empty}</p>`;
        const sites = p.owned_sites || [], straits = p.owned_straits || [], garrisons = p.garrisons || [];
        const loans = p.loans || [], listings = p.market_listings || [], wars = p.wars || [];
        const siteHtml = infoRows(sites, x => `<div class="admin-inventory-row"><span>${escapeHtml(x.name || x.id)} <small>${escapeHtml(x.type || "سکو / معدن")}</small></span><b>${formatNumber(x.production || 0)} / روز</b></div>`, "سکو یا معدنی در اختیار ندارد.");
        const straitHtml = infoRows(straits, x => `<div class="admin-inventory-row"><span>${escapeHtml(x.name || x.id)} <small>تنگه</small></span><b>عوارض ${formatNumber(x.toll || 0)}</b></div>`, "تنگه‌ای در اختیار ندارد.");
        const garrisonHtml = infoRows(garrisons, x => `<div class="admin-inventory-row"><span>${escapeHtml(x.name || x.id)} <small>پادگان موضع</small></span><b>${formatNumber(Object.values(x.units || {}).reduce((a, v) => a + Number(v || 0), 0))} یگان</b></div>`, "نیروی مستقر در سکو یا تنگه ندارد.");
        const loanHtml = infoRows(loans, x => `<div class="admin-inventory-row"><span>${x.lender === p.country ? "وام‌دهنده" : "وام‌گیرنده"} <small>${escapeHtml(x.status || "نامشخص")}</small></span><b>$${adminFormatNumber(x.remaining ?? x.amount ?? 0)}</b></div>`, "وام مرتبطی ندارد.");
        const marketHtml = infoRows(listings, x => `<div class="admin-inventory-row"><span>${x.side === "buy" ? "درخواست خرید" : "آگهی فروش"} <small>${escapeHtml(x.status || "نامشخص")}</small></span><b>${escapeHtml(RESOURCE_NAMES[x.resource] || x.resource || "کالا")} · ${formatNumber(x.amount || 0)}</b></div>`, "آگهی بازاری ثبت نکرده است.");
        const warHtml = infoRows(wars, x => `<div class="admin-inventory-row"><span>${escapeHtml(COUNTRY_NAMES[x.attacker] || x.attacker || "—")} ← ${escapeHtml(COUNTRY_NAMES[x.defender] || x.defender || "—")} <small>${escapeHtml(x.status || "نامشخص")}</small></span><b>${escapeHtml((x.reason || "").slice(0, 45) || "بدون دلیل")}</b></div>`, "درخواست یا سابقهٔ جنگی ثبت نشده است.");
        extra.innerHTML = `<div class="admin-editor-section-title"><b>ساختمان‌ها و ارتقاها</b><span>${Object.values(levels).filter(v => Number(v) > 0).length} مورد</span></div><div class="admin-inventory-grid">${buildingRows || `<p class="admin-inventory-empty">هنوز ساختمانی ساخته نشده است.</p>`}</div><div class="admin-editor-section-title"><b>یگان‌های ارتش</b><span>${Object.values(p.army_units || p.units || {}).reduce((a, v) => a + Number(v || 0), 0).toLocaleString("en-US")}</span></div><div class="admin-inventory-grid">${unitRows || `<p class="admin-inventory-empty">هنوز یگانی آموزش داده نشده است.</p>`}</div><div class="admin-editor-section-title"><b>موجودی منابع</b><span>وضعیت فعلی</span></div><div class="admin-inventory-grid">${resources || `<p class="admin-inventory-empty">منبعی ثبت نشده است.</p>`}</div><details class="admin-inventory-detail"><summary>🛢️ سکوها و معادن (${sites.length})</summary><div class="admin-inventory-grid">${siteHtml}</div></details><details class="admin-inventory-detail"><summary>⚓ تنگه‌ها (${straits.length})</summary><div class="admin-inventory-grid">${straitHtml}</div></details><details class="admin-inventory-detail"><summary>🪖 نیروهای مستقر (${garrisons.length})</summary><div class="admin-inventory-grid">${garrisonHtml}</div></details><details class="admin-inventory-detail"><summary>💳 وام‌ها (${loans.length})</summary><div class="admin-inventory-grid">${loanHtml}</div></details><details class="admin-inventory-detail"><summary>🌐 آگهی‌های بازار (${listings.length})</summary><div class="admin-inventory-grid">${marketHtml}</div></details><details class="admin-inventory-detail"><summary>⚔️ درخواست‌ها و سوابق جنگ (${wars.length})</summary><div class="admin-inventory-grid">${warHtml}</div></details>`;
    }
    // ویرایش سریع مدیر شامل منابع، تعداد یگان‌ها و سطح ساختمان‌هاست.
    const adjustSelect = el("admin-adjust-field");
    if (adjustSelect) {
        const previous = adjustSelect.value || "money";
        const base = [["money", "خزانه"], ["manpower", "نیروی انسانی"], ["food", "غذا"], ["steel", "آهن"], ["uranium", "اورانیوم"], ["oil", "نفت"]];
        const units = Object.entries(p.army_catalog || {}).map(([key, unit]) => [`unit:${key}`, `🪖 یگان: ${unit.name || key}`]);
        const buildings = Object.entries(p.building_catalog || {}).map(([key, item]) => [`building:${key}`, `🏗️ ${item.group === "economy" ? "اقتصاد" : "ساختمان"}: ${item.name || key}`]);
        adjustSelect.innerHTML = [...base.map(x => `<option value="${x[0]}">${escapeHtml(x[1])}</option>`), ...units.map(x => `<option value="${x[0]}">${escapeHtml(x[1])}</option>`), ...buildings.map(x => `<option value="${x[0]}">${escapeHtml(x[1])}</option>`)].join("");
        adjustSelect.value = [...adjustSelect.options].some(o => o.value === previous) ? previous : "money";
    }
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

function renderAdminUnMessages() {
    const root = document.getElementById("admin-un-list"); if (!root) return;
    const rows = adminUnMessagesCache || [];
    const pill = document.getElementById("admin-un-count"); if (pill) pill.textContent = adminFormatNumber(rows.length);
    if (!rows.length) { root.innerHTML = `<div class="admin-empty">هنوز پیامی به سازمان ملل ارسال نشده است.</div>`; return; }
    root.innerHTML = rows.map(m => {
        const who = [m.user_name, m.username ? "@" + m.username : ""].filter(Boolean).join(" · ") || "نام ثبت نشده";
        return `<article class="admin-news-row"><span class="admin-news-dot"></span><div><b>🌍 ${escapeHtml(m.world_name || ("دنیای " + m.world_id))} · ${escapeHtml(COUNTRY_FLAGS[m.country] || "")} ${escapeHtml(m.country_name || COUNTRY_NAMES[m.country] || m.country || "—")}</b><p>${escapeHtml(m.text || "")}</p><small class="admin-un-meta">👤 ${escapeHtml(who)} · آیدی تلگرام: ${escapeHtml(String(m.user_id))}<br>${escapeHtml(m.at ? new Date(m.at).toLocaleString("fa-IR") : "")}</small></div></article>`;
    }).join("");
}

async function adminResetPlayer(uid) {
    const p = adminOverviewCache?.players?.find(x => Number(x.user_id) === Number(uid));
    const label = p ? `${adminPlayerName(p)} (${p.country_name || "بدون کشور"})` : String(uid);
    if (!(await gameConfirm(`بازیکن «${label}» از همین دنیا حذف شود و بازی او کاملاً از ابتدا شروع شود؟\nاین کار قابل بازگشت نیست.`, { title: "ریست بازیکن", ok: "ریست", danger: true }))) return;
    try {
        const r = await apiPost("/api/admin/player/reset", { user_id: Number(uid) });
        showToast(r.message || (r.success ? "بازیکن ریست شد." : "ریست انجام نشد."), r.success ? "success" : "error");
        if (r.success) {
            if (Number(adminSelectedPlayerId) === Number(uid)) { adminSelectedPlayerId = null; adminSelectedPlayerDetailOpen = false; }
            await loadAdminPanel();
            renderAdminOverview();
        }
    } catch { showToast("ارتباط با سرور برقرار نشد.", "error"); }
}

function adminOpenAdjustModal(uid) {
    const p = adminOverviewCache?.players?.find(x => Number(x.user_id) === Number(uid));
    if (!p) { showToast("بازیکن پیدا نشد.", "error"); return; }
    document.getElementById("admin-adjust-modal")?.remove();
    const ov = document.createElement("div");
    ov.id = "admin-adjust-modal"; ov.className = "modal-overlay admin-adjust-modal";
    ov.innerHTML = `<section class="modal-box admin-adjust-box" role="dialog" aria-modal="true">
        <div class="modal-title">💰 موجودی ${escapeHtml(adminPlayerName(p))} <small>(${escapeHtml(p.country_name || "بدون کشور")})</small></div>
        <label>مورد<select id="aam-field"><option value="money">خزانه ($)</option><option value="manpower">نیروی انسانی</option><option value="food">غذا</option><option value="steel">آهن</option><option value="uranium">اورانیوم</option><option value="oil">نفت</option></select></label>
        <label>مقدار<input id="aam-amount" type="number" min="1" step="1" inputmode="numeric" placeholder="مثلاً 1000000"></label>
        <div class="admin-adjust-actions"><button type="button" class="add" data-op="add">＋ افزودن</button><button type="button" class="sub" data-op="subtract">− کسر</button></div>
        <button type="button" class="modal-cancel">بستن</button></section>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    ov.querySelector(".modal-cancel").onclick = close;
    ov.querySelectorAll("[data-op]").forEach(btn => btn.onclick = async () => {
        const amount = Number(ov.querySelector("#aam-amount").value);
        if (!Number.isSafeInteger(amount) || amount <= 0) { showToast("مقدار باید عدد صحیح و بزرگ‌تر از صفر باشد.", "error"); return; }
        btn.disabled = true;
        try {
            const r = await apiPost("/api/admin/player/adjust", { user_id: Number(uid), field: ov.querySelector("#aam-field").value, amount, operation: btn.dataset.op });
            if (!r.success) { showToast(r.message || "تغییر انجام نشد.", "error"); btn.disabled = false; return; }
            showToast(r.message || "موجودی به‌روزرسانی شد.", "success");
            close();
            await loadAdminPanel();
            if (!adminSelectedPlayerDetailOpen) renderAdminOverview();
        } catch { showToast("ارتباط با سرور برقرار نشد.", "error"); btn.disabled = false; }
    });
    ov.querySelector("#aam-amount").focus();
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
    const adjBtn = event.target.closest("[data-admin-adjust]");
    if (adjBtn) { event.stopPropagation(); adminOpenAdjustModal(Number(adjBtn.dataset.adminAdjust)); return; }
    const resetBtn = event.target.closest("[data-admin-reset]");
    if (resetBtn) { event.stopPropagation(); adminResetPlayer(Number(resetBtn.dataset.adminReset)); return; }
    const row = event.target.closest("[data-admin-player]"); if (!row) return;
    adminSelectedPlayerId = Number(row.dataset.adminPlayer); adminSelectedPlayerDetailOpen = true; renderAdminOverview();
    document.getElementById("admin-player-editor")?.scrollIntoView({ behavior: "instant", block: "start" });
});
document.getElementById("admin-player-list")?.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-admin-player]")) { event.preventDefault(); adminSelectedPlayerId = Number(event.target.dataset.adminPlayer); adminSelectedPlayerDetailOpen = true; renderAdminOverview(); }
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
        if (page.id === "admin") { gameHeaderForScroll.style.transform = "translate3d(0, 0, 0)"; return; }
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
            <div class="ann-img-picker" id="ann-img-picker"><div class="ann-img-title">تصویر بیانیه <b>(انتخاب اجباری)</b></div><div class="ann-img-list" id="ann-img-list"><div class="ann-img-empty">در حال دریافت تصاویر…</div></div></div>
            <textarea id="ann-composer-text" class="ann-input ann-composer-text" maxlength="${ANNOUNCEMENT_LIMIT}" placeholder="متن بیانیه را بنویسید…" aria-label="متن بیانیه"></textarea>
            <div class="ann-composer-meta"><span id="ann-char-count">۰ / ۲۰٬۰۰۰</span><span>نوبت ${ANNOUNCEMENT_SLOT_NAMES[currentSlot - 1]} انتشار</span></div>
            <div class="ann-modal-actions"><button type="button" class="modal-cancel ann-modal-cancel">انصراف</button><button type="button" class="ann-publish-button" id="ann-publish-confirm">انتشار بیانیه · ${announcementCurrency(currentCost)}</button></div>
        </section>`;
    document.body.appendChild(ov);
    const input = ov.querySelector("#ann-composer-text");
    const counter = ov.querySelector("#ann-char-count");
    const publish = ov.querySelector("#ann-publish-confirm");
    const imgList = ov.querySelector("#ann-img-list");
    let selectedImage = null;
    const updatePublishState = () => { publish.disabled = !selectedImage; };
    updatePublishState();
    (async () => {
        try {
            const r = await apiGet("/api/announcements/images");
            const imgs = Array.isArray(r?.images) ? r.images : [];
            if (!imgs.length) { imgList.innerHTML = `<div class="ann-img-empty">برای کشور شما تصویری ثبت نشده است؛ انتشار ممکن نیست.</div>`; return; }
            imgList.innerHTML = imgs.map(im => `<button type="button" class="ann-img-opt" data-img="${escapeHtml(im.id)}" aria-pressed="false"><img src="${escapeHtml(im.url)}" alt="" loading="lazy"><span class="ann-img-check">✓</span></button>`).join("");
            imgList.querySelectorAll(".ann-img-opt").forEach(btn => btn.addEventListener("click", () => {
                selectedImage = btn.dataset.img;
                imgList.querySelectorAll(".ann-img-opt").forEach(b => { const on = b === btn; b.classList.toggle("selected", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
                updatePublishState();
            }));
        } catch (e) { imgList.innerHTML = `<div class="ann-img-empty">دریافت تصاویر ناموفق بود.</div>`; }
    })();
    const close = () => ov.remove();
    ov.querySelector(".ann-modal-close").onclick = close;
    ov.querySelector(".ann-modal-cancel").onclick = close;
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    input.addEventListener("input", () => { counter.textContent = `${input.value.length.toLocaleString("fa-IR")} / ${ANNOUNCEMENT_LIMIT.toLocaleString("fa-IR")}`; });
    publish.onclick = async () => {
        const text = input.value.trim();
        if (!selectedImage) { showToast("ابتدا یک تصویر برای بیانیه انتخاب کنید.", "error"); return; }
        if (!text) { showToast("متن بیانیه را بنویسید.", "error"); input.focus(); return; }
        publish.disabled = true;
        publish.textContent = "در حال انتشار…";
        try {
            const d = await apiPost("/api/announcements/create", { text, image: selectedImage });
            if (!d.success) {
                showToast(d.message || "انتشار بیانیه انجام نشد.", "error");
                publish.textContent = `انتشار بیانیه · ${announcementCurrency(currentCost)}`;
                updatePublishState();
                await loadAnnouncementStatus(true);
                return;
            }
            close();
            showToast("بیانیه منتشر شد.", "success");
            await loadAnnouncementStatus(true);
            loadAnnouncements();
        } catch (e) {
            showToast("ارتباط با سرور برقرار نشد.", "error");
            updatePublishState();
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
                ${(supportFlags || accuseFlags) ? `<div class="ann-flags ann-flags-split"><div class="ann-flags-col support"><span class="ann-flags-head">✅ حمایت‌کنندگان</span><div class="ann-flags-items">${supportFlags || '<small class="ann-flags-none">—</small>'}</div></div><div class="ann-flags-col accuse"><span class="ann-flags-head">⚑ محکوم‌کنندگان</span><div class="ann-flags-items">${accuseFlags || '<small class="ann-flags-none">—</small>'}</div></div></div>` : ""}
                <div class="ann-card-footer"><button type="button" class="ann-reply-button" data-reply-ann="${escapeHtml(a.id)}">↩ پاسخ‌ها <span>${(a.comments || []).length}</span></button></div>`;
            // پس‌زمینهٔ تصویر کشور: web/images/announcements/<شناسه‌کشور>.jpg (اگر فایل نبود، کارت ساده می‌ماند)
            if (a.image || a.from_country) {
                const bgUrl = a.image || annBackgroundUrl(a.from_country);
                const probe = new Image();
                probe.onload = () => { div.style.setProperty("--ann-bg", `url("${bgUrl}")`); div.classList.add("has-bg"); };
                probe.src = bgUrl;
            }
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
        if (!comments.length) commentsBox.innerHTML = `<div class="ann-thread-empty"><span>🌍</span><strong>هنوز پاسخی ثبت نشده</strong><p>اولین پاسخ را بنویس و گفتگو را شروع کن.</p></div>`;
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
    if (error && typeof error === "object" && error.message) return error.message;
    if (error && typeof error === "object") error = error.error;
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
            if (!r.success) { showToast(unionErrorText(r), "error"); submit.disabled = false; submit.textContent = "ساخت اتحادیه"; return; }
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
        if (!r.success) showToast(unionErrorText(r), "error");
        else showToast("درخواست عضویت برای مالک اتحادیه فرستاده شد.", "success");
        await loadUnion();
    });
    c.querySelectorAll("[data-invite-accept]").forEach(b => b.onclick = async () => respondInvite(b.dataset.inviteAccept, true));
    c.querySelectorAll("[data-invite-reject]").forEach(b => b.onclick = async () => respondInvite(b.dataset.inviteReject, false));
}

async function respondInvite(uId, accept) {
    const r = await apiPost("/api/union/respond", { union_id: uId, accept });
    if (!r.success) { showToast(unionErrorText(r), "error"); return; }
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
    if (!r.success) { showToast(unionErrorText(r), "error"); return; }
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
            if (!r.success) { showToast(unionErrorText(r), "error"); return; }
            showToast(`دعوت ${COUNTRY_NAMES[target]} ارسال شد.`, "success");
            ov.remove(); await openUnionMembers();
        };
        ov.querySelectorAll("[data-kick-member]").forEach(b => b.onclick = async () => {
            const target = b.dataset.kickMember;
            if (!(await gameConfirm(`کشور ${COUNTRY_NAMES[target]} از اتحادیه اخراج شود؟`, { title: "اخراج عضو", ok: "اخراج", danger: true }))) return;
            const r = await apiPost("/api/union/kick", { union_id: u.id, target });
            if (!r.success) { showToast(unionErrorText(r), "error"); return; }
            showToast("عضو از اتحادیه اخراج شد.", "success"); ov.remove(); await refreshUnionChat(); await openUnionMembers();
        });
        ov.querySelectorAll("[data-join-response]").forEach(b => b.onclick = async () => {
            const target = b.dataset.joinResponse, accept = b.dataset.accept === "true";
            const r = await apiPost("/api/union/request/respond", { union_id: u.id, target, accept });
            if (!r.success) { showToast(unionErrorText(r), "error"); return; }
            showToast(accept ? `${COUNTRY_NAMES[target]} به اتحادیه پیوست.` : "درخواست رد شد.", "success");
            ov.remove(); await refreshUnionChat(); await openUnionMembers();
        });
    }
    ov.querySelector("#union-leave").onclick = async () => {
        const message = isLeader ? "با خروج مالک، اتحادیه منحل می‌شود. ادامه می‌دهید؟" : "از اتحادیه خارج می‌شوید؟";
        if (!(await gameConfirm(message, { title: "خروج از اتحادیه", ok: "خروج", danger: true }))) return;
        const r = await apiPost("/api/union/leave", {});
        if (!r.success) { showToast(unionErrorText(r), "error"); return; }
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
    if (["پیمان", "عدم تجاوز", "دیپلماسی", "مذاکره"].some(x => source.includes(x))) return "diplomacy";
    if (["جنگ", "نبرد", "دفاع", "حمله", "اشغال", "تلفات", "نیرو", "ارتش", "پیروزی", "شکست"].some(x => source.includes(x))) return "military";
    if (["بیانیه"].some(x => source.includes(x))) return "general";
    if (["معامله", "تجارت", "بازار", "مرز زمینی", "حمل‌ونقل", "حمل و نقل"].some(x => source.includes(x))) return "trade";
    if (["تصرف", "تنگه", "قلمرو", "مرز", "منطقه"].some(x => source.includes(x))) return "territory";
    if (["وام", "درآمد", "اقتصاد", "تسویه", "غذا", "نفت", "آهن", "اورانیوم", "منبع", "منابع"].some(x => source.includes(x))) return "economy";
    return "general";
}

let newsNewIds = new Set();
function renderNewsList() {
    const c = document.getElementById("news-list");
    if (!c) return;
    const list = (currentNewsFilter === "all" ? newsItemsCache : newsItemsCache.filter(item => inferNewsCategory(item) === currentNewsFilter)).slice(0, 120);
    c.innerHTML = "";
    if (!list.length) {
        c.innerHTML = `<div class="diplomacy-item-empty">در این دسته‌بندی خبری وجود ندارد.</div>`;
        return;
    }
    list.forEach(item => {
        const div = document.createElement("article");
        const isNewItem = !!item.id && newsNewIds.has(item.id);
        div.className = `news-item news-category-${inferNewsCategory(item)}${isNewItem ? " is-new" : ""}`;
        const categoryNames = { military: "نظامی", diplomacy: "دیپلماسی", economy: "اقتصاد", trade: "تجارت", territory: "قلمرو", union: "اتحادیه", general: "عمومی" };
        const newsFlags = (Array.isArray(item.countries) ? item.countries : []).map(c => flagInline(c, true)).join("");
        div.innerHTML = `<div class="news-item-top"><h3>${newsFlags ? `<span class="news-flags">${newsFlags}</span>` : ""}${escapeHtml(item.title || "خبر")}</h3>${isNewItem ? '<span class="news-new-tag">جدید</span>' : ""}<span class="news-category-label">${categoryNames[inferNewsCategory(item)] || "عمومی"}</span></div>
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
    newsNewIds = new Set();
    document.querySelectorAll("[data-news-filter]").forEach(item => item.classList.toggle("active", item.dataset.newsFilter === "all"));
    renderNewsList();
}

function isNewsTabVisible() {
    const p = document.getElementById("comm-news");
    return !!p && !p.classList.contains("hidden");
}

// markSeen=false: فقط شمارندهٔ «جدید» به‌روز می‌شود و خبرها دیده‌شده حساب نمی‌شوند (مثلاً وقتی تب بیانیه‌ها باز است)
async function loadNews(opts) {
    const markSeen = !opts || opts.markSeen !== false;
    const c = document.getElementById("news-list");
    if (!c) return;
    try {
        const news = await apiGet("/api/news");
        newsItemsCache = Array.isArray(news) ? news : [];
        knownNewsIds = newsItemsCache.map(n => n.id).filter(Boolean);
        const seenNow = getSeenNews();
        // همهٔ خبرهای دیده‌نشده برچسب «جدید» می‌گیرند؛ برچسب‌ها تا خروج از تب اخبار ثابت می‌مانند
        knownNewsIds.forEach(id => { if (!seenNow.has(id)) newsNewIds.add(id); });
        renderNewsList();
        if (markSeen) {
            knownNewsIds.forEach(id => seenNow.add(id));
            saveSeenNews(seenNow);
            setNotifBadge(0);
        } else syncNewsBadges();
    } catch (e) {
        c.innerHTML = `<div class="news-item"><h3>اخبار</h3><p>دریافت خبرها ممکن نشد.</p></div>`;
    }
}

/* =========================================================
   Private Messages
========================================================= */
function setPmBadges(n) {
    pmUnreadCount = n || 0; updateFooterCommBadge();
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
        un.innerHTML = `<div class="contact-info"><span class="un-pm-icon">🌐</span><div class="pm-conv-text"><span class="contact-name">سازمان ملل</span><span class="pm-conv-last">گفت‌وگوی رسمی با مدیریت</span></div></div><span class="un-pm-tag">رسمی</span>`;
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
    box.innerHTML = `<div class="un-pm-placeholder"><span>🌐</span><strong>گفت‌وگوی سازمان ملل</strong><p>پیام شما برای مدیریت سازمان ملل ارسال می‌شود و فقط مدیر آن را می‌بیند.</p></div>`;
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
    input.value = ""; input.disabled = false; input.placeholder = "پیام به سازمان ملل...";
    send.disabled = false;
    document.getElementById("pm-conversation").classList.add("un-pm-local");
    document.getElementById("pm-conversation").classList.remove("un-pm-readonly", "hidden");
    apiGet("/api/un/mine").then(d => {
        if (Array.isArray(d?.messages)) {
            unPmLocalMessages = d.messages.map(m => m.text);
            if (currentPMTarget === UN_PM_TARGET) renderUnitedNationsPMMessages();
        }
    }).catch(() => {});
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
        try {
            const r = await apiPost("/api/un/send", { text });
            if (!r.success) { ta.value = text; showToast(r.message || "ارسال پیام ناموفق بود.", "error"); return; }
            unPmLocalMessages.push(text);
            renderUnitedNationsPMMessages();
            showToast("پیام برای مدیریت سازمان ملل ارسال شد.", "success");
        } catch { ta.value = text; showToast("ارتباط با سرور برقرار نشد.", "error"); }
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
let marketCreateSide = "sell", marketFilter = "all", marketRows = [], marketSanctions = [];

function marketResourceText(k, n) { return `${RESOURCE_ICONS[k] || "📦"} ${formatNumber(n)} ${RESOURCE_NAMES[k] || k}`; }
function marketModeLabel(m) { return m === "land" ? "🚚 زمینی" : m === "sea" ? "🚢 دریایی" : "✈️ هوایی"; }
function fmtDurationFa(sec) {
    const s = Math.max(0, Math.ceil(Number(sec) || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h && m) return `${formatNumber(h)} ساعت و ${formatNumber(m)} دقیقه`;
    if (h) return `${formatNumber(h)} ساعت`;
    return `${formatNumber(Math.max(1, m))} دقیقه`;
}
function marketModeCost(route) { return route ? formatMoney(route.transport_cost) : "—"; }

async function loadMarketListings() {
    const c = document.getElementById("market-listings"); if (!c) return;
    c.innerHTML = `<div class="market-loading">در حال دریافت کالاها…</div>`;
    try {
        const d = await apiGet("/api/market", {country: selectedCountry || ""});
        marketRows = d.listings || [];
        marketSanctions = d.sanctions || [];
        renderMarketListings();
        renderMarketSanctions();
    } catch (e) { c.innerHTML = `<div class="diplomacy-item-empty">بازار در دسترس نیست.</div>`; }
}

function renderMarketSanctions() {
    const target = document.getElementById("market-sanction-target");
    const list = document.getElementById("market-sanctions-list");
    if (target) {
        const current = target.value;
        target.innerHTML = `<option value="">کشور را انتخاب کن</option>` + Object.keys(COUNTRY_NAMES).filter(cid => cid !== selectedCountry).map(cid => `<option value="${cid}">${COUNTRY_NAMES[cid]}</option>`).join("");
        if (current && [...target.options].some(o => o.value === current)) target.value = current;
    }
    if (!list) return;
    if (!marketSanctions.length) { list.innerHTML = `<div class="diplomacy-item-empty">هنوز کشوری تحریم نشده است.</div>`; return; }
    list.innerHTML = marketSanctions.map(s => {
        const mine = s.by === selectedCountry;
        return `<article class="market-sanction-row"><span>⛔ <b>${escapeHtml(COUNTRY_NAMES[s.by] || s.by)}</b>، <b>${escapeHtml(COUNTRY_NAMES[s.target] || s.target)}</b> را تحریم کرده است.</span>${mine ? `<button type="button" data-lift-sanction="${escapeHtml(s.target)}">رفع تحریم</button>` : ""}</article>`;
    }).join("");
    list.querySelectorAll("[data-lift-sanction]").forEach(b => b.onclick = () => submitMarketSanction(b.dataset.liftSanction, "lift"));
}

async function submitMarketSanction(target, action = "sanction") {
    if (!target) { showToast("ابتدا کشور مقصد را انتخاب کن.", "error"); return; }
    const other = COUNTRY_NAMES[target] || target;
    if (action === "sanction" && !confirm(`کشور ${other} از خرید در بازار جهانی محروم شود؟`)) return;
    try {
        const result = await apiPost("/api/market/sanction", { target, action });
        showToast(result.message || (result.success ? "انجام شد." : "عملیات ناموفق بود."), result.success ? "success" : "error");
        if (result.success) await loadMarketListings();
    } catch (e) { showToast("ارتباط با سرور برقرار نشد.", "error"); }
}
document.getElementById("market-sanction-submit")?.addEventListener("click", () => submitMarketSanction(document.getElementById("market-sanction-target")?.value, "sanction"));

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
    const paint=()=>{
        const q=routes.find(x=>x.mode===chosen);
        if(!q){detail.innerHTML=`هیچ مسیر فعالی نیست.`;return;}
        const icon=q.mode==="sea"?"🚢":q.mode==="land"?"🚚":"✈️";
        const kmNote=q.mode==="sea"?` · مسیر دریایی ${formatNumber(q.distance_km)} کیلومتر`:` · ${formatNumber(q.distance_km)} کیلومتر`;
        const straitRows=(q.strait_costs||[]).map(x=>`<div class="mk-bd-row"><span>⚓ عوارض ${escapeHtml(x.name)}</span><b>${x.cost?formatMoney(x.cost):"رایگان"}</b></div>`).join("");
        detail.innerHTML=`<div class="mk-bd-row"><span>${icon} هزینه حمل${kmNote}</span><b>${formatMoney(q.freight_cost ?? (q.transport_cost-(q.toll||0)))}</b></div>
            ${straitRows}
            ${q.mode==="sea"&&!(q.strait_costs||[]).length?`<div class="mk-bd-note">این مسیر از هیچ تنگهٔ عوارضی عبور نمی‌کند.</div>`:""}
            <div class="mk-bd-row total"><span>مجموع هزینه حمل و عوارض</span><b>${formatMoney(q.transport_cost)}</b></div>
            <div class="mk-bd-note">⏱ زمان حمل: ${fmtDurationFa(q.travel_seconds)}</div>`;
    };
    paint();
    ov.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{if(b.disabled)return;chosen=b.dataset.mode;ov.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("selected",x===b));paint();});
    ov.querySelector("#market-confirm-trade").onclick=async()=>{ if(!chosen)return; const q=routes.find(x=>x.mode===chosen); const d=await apiPost("/api/market/accept",{listing_id:lid,mode:chosen,expected_total:q?.transport_cost}); if(!d.success){showToast(d.message||"معامله انجام نشد"); if(d.error==="price_changed"){ov.remove(); await loadMarketListings();} return;} ov.remove(); showToast(`معامله ثبت شد · هزینه حمل ${formatMoney(d.transport_cost)} · رسیدن کالا حدود ${d.eta_text || fmtDurationFa(d.eta_seconds)}`); await refreshPlayer(); loadMarketListings(); loadMyListings(); loadShipments(); };
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


/* ---------- کالاهای در راه ---------- */
let marketShipments = [], shipSkew = 0, shipLoading = false, shipTimer = null, shipPollAt = 0, shipKnownIds = null;
const marketPageOpen = () => !document.getElementById("market")?.classList.contains("hidden");

async function loadShipments() {
    if (shipLoading || !userId) return;
    shipLoading = true;
    try {
        const d = await apiGet("/api/market/shipments");
        if (!d || d.error) throw new Error("shipments");
        if (d.now) shipSkew = Date.parse(d.now) - Date.now();
        const list = d.shipments || [];
        // کالایی که قبلاً در راه بود و حالا نیست یعنی رسیده؛ موجودی را به‌روز کن.
        if (shipKnownIds) {
            const arrived = [...shipKnownIds].filter(id => !list.some(s => s.id === id));
            if (arrived.length) {
                refreshPlayer().then(() => { try { updateHomeStats(); } catch (e) {} });
                showToast("📦 محمولهٔ کالا رسید و به موجودی اضافه شد.", "success");
            }
        }
        shipKnownIds = new Set(list.filter(s => s.direction === "in").map(s => s.id));
        marketShipments = list;
        renderShipments();
    } catch (e) {
        console.error(e);
        const c = document.getElementById("market-transit");
        if (c && !marketShipments.length) c.innerHTML = `<div class="diplomacy-item-empty">دریافت اطلاعات کالاهای در راه ممکن نشد.</div>`;
    } finally { shipLoading = false; shipPollAt = Date.now(); }
}

function shipStatus(s, now) {
    const st = Date.parse(s.start), ar = Date.parse(s.arrive);
    if (now >= ar) return { label: "در حال تحویل", pct: 100, left: 0 };
    return { label: s.direction === "in" ? "در راه به سمت شما" : "در راه به سمت خریدار",
             pct: Math.max(0, Math.min(100, ((now - st) / Math.max(1, ar - st)) * 100)), left: ar - now };
}

function renderShipments() {
    const badge = document.getElementById("market-transit-badge");
    const incoming = marketShipments.filter(s => s.direction === "in").length;
    if (badge) { badge.textContent = formatNumber(marketShipments.length); badge.classList.toggle("hidden", !marketShipments.length); }
    const c = document.getElementById("market-transit"); if (!c) return;
    if (!marketShipments.length) {
        c.innerHTML = `<div class="diplomacy-item-empty">کالایی در راه نیست.<br><small>پس از هر خرید از بازار جهانی، محموله اینجا تا لحظهٔ رسیدن نمایش داده می‌شود.</small></div>`;
        return;
    }
    const now = Date.now() + shipSkew;
    const card = s => {
        const st = shipStatus(s, now);
        const strait = (s.straits || []).map(x => (typeof mapSites !== "undefined" ? mapSites.find(m => m.id === x)?.name : null) || x).join("، ");
        return `<article class="market-card mk-ship side-${s.direction === "in" ? "sell" : "buy"}" data-ship="${escapeHtml(s.id)}">
            <div class="market-card-head"><span class="mk-country">${marketModeLabel(s.mode)}</span><b class="mk-badge">${s.direction === "in" ? "دریافتی" : "ارسالی"}</b></div>
            <div class="market-card-main"><div class="market-product"><span class="mk-ico">${RESOURCE_ICONS[s.resource] || "📦"}</span><div class="mk-prod-text"><strong>${escapeHtml(RESOURCE_NAMES[s.resource] || s.resource)}</strong><b>${formatNumber(s.amount)}</b><small>واحد</small></div></div></div>
            <div class="mk-ship-route"><span>${flagInline(s.from, true)} ${escapeHtml(COUNTRY_NAMES[s.from] || s.from)}</span><i>←</i><span>${flagInline(s.to, true)} ${escapeHtml(COUNTRY_NAMES[s.to] || s.to)}</span></div>
            <div class="wf-tr-bar"><i data-ship-bar="${escapeHtml(s.id)}" style="width:${st.pct.toFixed(1)}%"></i></div>
            <div class="wf-tr-bottom"><span data-ship-status="${escapeHtml(s.id)}">${st.label}</span><span>⏱ <b data-ship-eta="${escapeHtml(s.id)}" dir="ltr">${st.left > 0 ? fmtEta(st.left) : "—"}</b></span></div>
            ${strait ? `<div class="market-card-detail">عبور از: ${escapeHtml(strait)}</div>` : ""}
        </article>`;
    };
    const part = (title, dir) => {
        const rows = marketShipments.filter(s => s.direction === dir);
        return rows.length ? `<div class="wf-section"><span>${title}</span><small>${formatNumber(rows.length)} محموله</small></div>${rows.map(card).join("")}` : "";
    };
    c.innerHTML = part("به سمت شما", "in") + part("فروخته‌شده و در مسیر خریدار", "out");
    startShipTicker();
}

function tickShipments() {
    const now = Date.now() + shipSkew;
    let due = false;
    marketShipments.forEach(s => {
        const st = shipStatus(s, now);
        const e = document.querySelector(`[data-ship-eta="${s.id}"]`), bar = document.querySelector(`[data-ship-bar="${s.id}"]`), lb = document.querySelector(`[data-ship-status="${s.id}"]`);
        if (e) e.textContent = st.left > 0 ? fmtEta(st.left) : "—";
        if (bar) bar.style.width = st.pct + "%";
        if (lb) lb.textContent = st.label;
        if (st.left <= 0) due = true;
    });
    if (due && !shipLoading && Date.now() - shipPollAt > 2500) loadShipments();
}

function startShipTicker() {
    if (shipTimer) return;
    shipTimer = setInterval(() => {
        if (!userId) return;
        if (marketShipments.length && marketPageOpen()) tickShipments();
        // همگام‌سازی دوره‌ای با سرور (حتی خارج از بازار برای نشان تعداد و اعلان رسیدن)
        const every = marketPageOpen() ? 8000 : 30000;
        if (!shipLoading && Date.now() - shipPollAt > every && (marketPageOpen() || marketShipments.length)) loadShipments();
    }, 1000);
}
startShipTicker();

document.querySelectorAll(".market-tab").forEach(tab => tab.addEventListener("click", () => {
    document.querySelectorAll(".market-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".market-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById(tab.dataset.marketTab)?.classList.remove("hidden");
    if (tab.dataset.marketTab === "market-list-panel") loadMarketListings();
    else if (tab.dataset.marketTab === "market-mine-panel") loadMyListings();
    else if (tab.dataset.marketTab === "market-transit-panel") loadShipments();
    else if (tab.dataset.marketTab === "market-sanctions-panel") loadMarketListings();
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

/* ---------- نقشه سیاسی ۱۹۳۶ ----------
   داده‌ی نقشه مرزهای امروزی دارد؛ این بخش آن را به قلمروهای سال ۱۹۳۶ تبدیل می‌کند:
   ۱) ادغام کشورهای امروزی در قلمرو ۱۹۳۶ (مستعمرات، جمهوری‌های شوروی)
   ۲) برش‌های جغرافیایی (شرق آلمان، لهستان شرقی، ساخالین جنوبی) که با مرز امروزی فرق دارند. */
const SOVIET_BLOC = true;    // true: «شوروی» ۱۹۳۶ = روسیه + جمهوری‌های اتحادیه | false: فقط روسیه
const MAP_COLONIES = true;   // true: مستعمرات ۱۹۳۶ هم‌رنگ کشور مادر | false: فقط خاک اصلی
const MAP_1936_REALMS = {
    // شوروی ۱۹۳۶: بدون بالتیک و مولداوی (لهستان شرقی در برش‌ها جدا می‌شود)
    643: SOVIET_BLOC ? [643, 804, 112, 51, 31, 268, 398, 860, 795, 762, 417] : [643],
    // امپراتوری بریتانیا (دومینیون‌ها مثل کانادا، استرالیا، آفریقای جنوبی و ایرلند جدا هستند)
    826: MAP_COLONIES
        ? [826, 356, 586, 50, 104, 144, 458, 96, 702, 376, 275, 400, 196, "N. Cyprus", 729, 728, 404, 800, 834,
           566, 288, 694, 270, 894, 716, 454, 72, 426, 748, "Somaliland", 84, 328, 388, 780, 44, 238, 242]
        : [826],
    // امپراتوری فرانسه
    250: MAP_COLONIES
        ? [250, 12, 788, 504, 478, 686, 466, 562, 148, 854, 324, 384, 204, 266, 178, 140, 120, 768, 450, 262,
           760, 422, 704, 418, 116, 540]
        : [250],
    // ایتالیا + لیبی + شرق آفریقای ایتالیا (اتیوپی پس از ۱۹۳۶)
    380: MAP_COLONIES ? [380, 434, 231, 232, 706] : [380],
    // ژاپن + کره + تایوان
    392: MAP_COLONIES ? [392, 410, 408, 158] : [392],
    // آمریکا + فیلیپین
    840: MAP_COLONIES ? [840, 608] : [840],
    710: [710, 516]                // آفریقای جنوبی + نامیبیا
};
// جفت‌مرزهای امروزی که در ۱۹۳۶ وجود نداشتند (به‌جایشان خط‌های دستی پایین کشیده می‌شود)
const MAP_1936_CUT_PAIRS = [[616, 276], [616, 643], [616, 112], [616, 804], [804, 703], [804, 348], [804, 642]];
// برش‌ها: بخشی از خاک امروزی کشور «منبع» که در ۱۹۳۶ مال کشور دیگری بوده. ring = [طول, عرض]
// to: کلید کشور بازی؛ null یعنی کشور غیرفعال (طوسی)
const MAP_1936_CLIPS = [
    { name: "پومرانیا، نویمارک و سیلزی (آلمان)", to: "germany", sources: [616, 643],
      ring: [[18.0,54.9],[17.95,54.55],[17.65,54.2],[17.45,53.95],[17.35,53.65],[17.3,53.4],[17.1,53.1],[16.85,52.9],
             [16.35,52.7],[16.1,52.45],[15.85,52.25],[15.75,52.0],[16.3,51.75],[16.8,51.65],[17.3,51.5],[17.9,51.3],
             [18.1,51.05],[18.5,50.75],[18.85,50.5],[18.85,50.3],[18.7,50.15],[18.5,50.0],
             [18.0,49.3],[11.0,49.3],[11.0,55.3],[18.0,55.3]] },
    { name: "پروس شرقی (آلمان)", to: "germany", sources: [616, 643],
      ring: [[19.3,54.5],[19.2,54.25],[19.0,54.0],[18.95,53.75],[19.15,53.55],[19.55,53.5],[19.85,53.45],[20.05,53.42],
             [20.35,53.33],[21.0,53.3],[21.5,53.35],[22.0,53.5],[22.35,53.7],[22.55,53.95],[22.75,54.1],[22.8,54.36],
             [23.1,54.36],[23.1,55.6],[19.0,55.6]] },
    { name: "ساخالین جنوبی (ژاپن)", to: "japan", sources: [643],
      ring: [[141.2,45.5],[141.2,50.0],[146.0,50.0],[146.0,45.5]] }
];
if (SOVIET_BLOC) MAP_1936_CLIPS.push(
    { name: "لهستان شرقی، بوکووینا و زاکارپاتیا (غیرفعال)", to: null, sources: [112, 804],
      ring: [[27.6,55.9],[27.2,55.4],[27.0,54.9],[27.15,54.4],[27.25,53.95],[27.05,53.4],[26.75,52.9],[26.85,52.4],
             [27.45,52.1],[27.55,51.7],[27.2,51.3],[27.35,50.9],[27.1,50.6],[26.55,50.3],[26.2,49.85],[26.45,49.4],
             [26.55,48.95],[26.55,48.65],[26.6,48.4],[26.62,48.26],
             [26.62,47.0],[20.0,47.0],[20.0,56.2],[27.6,56.2]] });
// خط‌های مرزی ۱۹۳۶ که روی نقشه کشیده می‌شوند
const MAP_1936_LINES = [
    // آلمان ↔ لهستان/دانتسیگ (پومرانیا و سیلزی)
    [[18.0,54.9],[17.95,54.55],[17.65,54.2],[17.45,53.95],[17.35,53.65],[17.3,53.4],[17.1,53.1],[16.85,52.9],
     [16.35,52.7],[16.1,52.45],[15.85,52.25],[15.75,52.0],[16.3,51.75],[16.8,51.65],[17.3,51.5],[17.9,51.3],
     [18.1,51.05],[18.5,50.75],[18.85,50.5],[18.85,50.3],[18.7,50.15],[18.5,50.0]],
    // آلمان ↔ لهستان/دانتسیگ (پروس شرقی)
    [[19.3,54.5],[19.2,54.25],[19.0,54.0],[18.95,53.75],[19.15,53.55],[19.55,53.5],[19.85,53.45],[20.05,53.42],
     [20.35,53.33],[21.0,53.3],[21.5,53.35],[22.0,53.5],[22.35,53.7],[22.55,53.95],[22.75,54.1],[22.8,54.36]],
    // آلمان ↔ چکسلواکی (در سیلزی)
    [[14.82,50.87],[15.1,50.8],[15.45,50.78],[15.9,50.68],[16.2,50.62],[16.4,50.45],[16.6,50.2],[17.2,50.25],
     [17.7,50.3],[18.0,50.05],[18.5,49.95]],
    // ژاپن ↔ شوروی در ساخالین (مدار ۵۰)
    [[141.2,50.0],[142.0,50.0],[143.0,50.0],[144.0,50.0],[145.0,50.0],[146.0,50.0]]
];
if (SOVIET_BLOC) MAP_1936_LINES.push(
    // شوروی ↔ لهستان (خط ریگا) و ادامه تا دنیستر
    [[27.6,55.9],[27.2,55.4],[27.0,54.9],[27.15,54.4],[27.25,53.95],[27.05,53.4],[26.75,52.9],[26.85,52.4],
     [27.45,52.1],[27.55,51.7],[27.2,51.3],[27.35,50.9],[27.1,50.6],[26.55,50.3],[26.2,49.85],[26.45,49.4],
     [26.55,48.95],[26.55,48.65],[26.6,48.4],[26.62,48.26]]);
let mapClips = [], mapCustomBorders = null;
// اسم مستعمره‌ها در ۱۹۳۶ (کلید: id عددی یا اسم فیچر). چند فیچر با اسم یکسان یک برچسب می‌گیرند.
const MAP_COLONY_NAMES = {
    356: "هند بریتانیا", 586: "هند بریتانیا", 50: "هند بریتانیا", 104: "برمه", 144: "سیلان", 458: "مالایا", 96: "برونئی",
    702: "سنگاپور", 376: "فلسطین", 275: "فلسطین", 400: "شرق اردن", 196: "قبرس", "N. Cyprus": "قبرس",
    729: "سودان", 728: "سودان", 404: "کنیا", 800: "اوگاندا", 834: "تانگانیکا", 566: "نیجریه", 288: "ساحل طلا",
    694: "سیرالئون", 270: "گامبیا", 894: "رودزیای شمالی", 716: "رودزیای جنوبی", 454: "نیاسالند", 72: "بچوانالند",
    426: "باسوتولند", 748: "سوازیلند", "Somaliland": "سومالی بریتانیا", 84: "بلیز", 328: "گویان بریتانیا",
    388: "جامائیکا", 780: "ترینیداد", 44: "باهاما", 238: "فالکلند", 242: "فیجی",
    12: "الجزایر", 788: "تونس", 504: "مراکش", 478: "موریتانی", 686: "سنگال", 466: "سودان فرانسه", 562: "نیجر",
    148: "چاد", 854: "ولتای علیا", 324: "گینه", 384: "ساحل عاج", 204: "داهومی", 266: "گابن", 178: "کنگو فرانسه",
    140: "اوبانگی‌شاری", 120: "کامرون", 768: "توگو", 450: "ماداگاسکار", 262: "سومالی فرانسه", 760: "سوریه", 422: "لبنان",
    704: "هندوچین فرانسه", 418: "هندوچین فرانسه", 116: "هندوچین فرانسه", 540: "کالدونیای نو",
    434: "لیبی", 231: "اتیوپی", 232: "اریتره", 706: "سومالی ایتالیا",
    410: "کره", 408: "کره", 158: "تایوان", 608: "فیلیپین"
};
let mapLabelItems = [];


function clipSourcePolys(ft, bb) {
    const g = ft.geometry; if (!g) return null;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    const keep = polys.filter(p => p[0].some(([x, y]) => x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3]));
    return keep.length ? { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: keep } } : null;
}
function buildMapClips(land) {
    return MAP_1936_CLIPS.map(c => {
        const ring = c.ring.slice(); ring.push(ring[0]);
        let coords = ring;
        if (d3.geoArea({ type: "Polygon", coordinates: [coords] }) > 2 * Math.PI) coords = ring.slice().reverse();
        const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
        const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        const feats = [];
        c.sources.forEach(id => {
            const ft = land.features.find(x => Number(x.id) === id);
            const part = ft && clipSourcePolys(ft, bb);
            if (part) feats.push(part);
        });
        return { to: c.to, poly: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } }, feats };
    });
}
function mapClipHit(ll) {
    for (const c of mapClips) {
        if (!c.feats.length || !d3.geoContains(c.poly, ll)) continue;
        if (c.feats.some(ft => d3.geoContains(ft, ll))) return c;
    }
    return null;
}
function realm1936(f) {
    const id = (f.id === undefined || f.id === null) ? null : Number(f.id);
    const nm = f.properties && f.properties.name;
    for (const [rid, members] of Object.entries(MAP_1936_REALMS)) {
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
let mapSiteCache = null, mapSitesSig = "", mapRoutesSig = "";
let mapTransits = [], mapRouteSkew = 0, mapRoutesVisible = true;
try { mapRoutesVisible = localStorage.getItem("mapRoutes") !== "off"; } catch (e) {}
let mapCanvas = null, mapCtx = null, mapDpr = 1, mapW = 320, mapH = 300;
let mapFeatures = [], mapGroups = [], mapWaterItems = [], mapGraticule = null, mapRaf = 0;
let mapBorders = null, mapCoast = null, mapLand = null, mapCoastPts = null;

const mapYield = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
function setMapLoading(state) {
    const box = document.querySelector(".map-box");
    const msg = document.getElementById("map-loading");
    if (box) box.classList.toggle("is-loading", state === true || state === "error");
    if (!msg) return;
    msg.classList.toggle("hidden", !state);
    msg.classList.toggle("is-error", state === "error");
    const t = msg.querySelector(".map-loading-text");
    if (t) t.textContent = state === "error" ? "بارگذاری نقشه ناموفق بود؛ دوباره وارد صفحه نقشه شوید." : "در حال بارگذاری نقشه…";
}
async function initWorldMap() {
    if (!document.querySelector(".map-box") || !document.getElementById("map-globe")) return;
    const firstBuild = !mapInitialized && !mapInitializing;
    if (firstBuild) setMapLoading(true);
    try { await _initWorldMapInner(); }
    catch (e) { console.error(e); mapInitializing = false; }
    finally { if (firstBuild) setMapLoading(mapInitialized ? false : "error"); }
}
async function _initWorldMapInner() {
    const box = document.querySelector(".map-box");
    const svgEl = document.getElementById("map-globe");
    if (!box || !svgEl) return;

    if (mapInitialized) { updateMapColors(); redrawMap(); refreshMapSites(); loadMapRoutes(); return; }
    if (mapInitializing) return;
    mapInitializing = true;

    // سکوها هم‌زمان با ساخت کره دریافت می‌شوند (نه بعد از آن)
    const sitesRawP = apiGet("/api/map-sites").catch(() => []);
    await mapYield();   // اجازه می‌دهیم متن «در حال بارگذاری» قبل از کار سنگین نمایش داده شود

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
        .rotate(mapRotation).clipAngle(90).precision(1.5);
    mapPath = d3.geoPath(mapProjection, mapCtx);

    const keyById = {};
    Object.entries(COUNTRY_IDS).forEach(([k, id]) => { keyById[id] = k; });
    const R = Math.PI / 180;

    // ---- قلمروهای ۱۹۳۶ ----
    const geoms = world.objects.countries.geometries;
    const realmOfGeom = new Map();
    const realms = new Map();
    land.features.forEach((f, i) => {
        const rid = realm1936(f);
        realmOfGeom.set(geoms[i], rid);
        let r = realms.get(rid);
        if (!r) { r = { rid, feats: [] }; realms.set(rid, r); }
        r.feats.push(f);
    });
    // فقط مرزِ بین دو قلمرو مختلف + ساحل کشیده می‌شود (مرز داخلی شوروی/یوگسلاوی دیده نمی‌شود)
    const inGameRealm = rid => typeof rid === "number" && !!keyById[rid];
    mapBorders = topojson.mesh(world, world.objects.countries, (x, y) => {
        const rx = realmOfGeom.get(x), ry = realmOfGeom.get(y);
        // فقط مرزی که حداقل یک طرفش کشور حاضر در بازی است؛ مرز کشورهای اضافه‌نشده کشیده نمی‌شود
        if (rx === ry || !(inGameRealm(rx) || inGameRealm(ry))) return false;
        const ix = Number(x.id), iy = Number(y.id);
        // مرزهایی که در ۱۹۳۶ وجود نداشتند (مثلاً اودر-نایسه) کشیده نمی‌شوند
        return !MAP_1936_CUT_PAIRS.some(([p, q]) => (ix === p && iy === q) || (ix === q && iy === p));
    });
    mapClips = buildMapClips(land);
    mapCustomBorders = { type: "MultiLineString", coordinates: MAP_1936_LINES };
    mapCoast = topojson.mesh(world, world.objects.countries, (x, y) => x === y);
    mapLand = land;
    mapCoastPts = buildCoastPoints(mapCoast);
    siteOffsetCache = {};   // با ساخت دوبارهٔ نقشه، فاصله از ساحل دوباره حساب شود

    // اطلاعات ثابت هر قلمرو یک‌بار محاسبه می‌شود (نه در هر فریم)
    mapFeatures = Array.from(realms.values()).map(r => {
        const f = r.feats.length === 1 ? r.feats[0] : combineFeatures(r.feats, r.rid);
        const id = typeof r.rid === "number" ? r.rid : NaN;
        const key = keyById[id] || null;
        // اسم فقط برای کشورهایی که در بازی هستند؛ بقیه بی‌نام
        const name = key ? COUNTRY_NAMES[key] : "";
        const homeFt = r.feats.find(ft => Number(ft.id) === r.rid) || f;   // برچسب روی خاک اصلی، نه مستعمرات
        const mf = mainLandFeature(homeFt);
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
        m.label = labelG.append("text").attr("class", "map-country-label")
            .attr("text-anchor", "middle").attr("dominant-baseline", "central")
            .attr("font-size", 10).text(m.name).node();
    });
    // اندازه‌گیری همهٔ متن‌ها بعد از ساخت آن‌ها (یک‌بار چیدمان، نه یک‌بار برای هر اسم)
    mapFeatures.forEach(m => {
        if (!m.label) return;
        let tw = 0;
        try { tw = m.label.getComputedTextLength(); } catch (e) {}
        m.tw = tw > 0 ? tw / 10 : m.name.length * 0.5;   // عرض متن به‌ازای هر ۱px فونت
        m.label.style.display = "none";
    });

    // برچسب مستعمره‌ها: اسم مستعمره + «مستعمره کشور مادر»
    mapLabelItems = mapFeatures.filter(m => m.label);
    if (MAP_COLONIES) {
        const mkText = (cls, txt) => labelG.append("text").attr("class", cls)
            .attr("text-anchor", "middle").attr("dominant-baseline", "central")
            .attr("font-size", 10).text(txt).node();
        const widthOf = n => { let w = 0; try { w = n.getComputedTextLength(); } catch (e) {} return w > 0 ? w / 10 : 4; };
        realms.forEach(r => {
            const ownerKey = typeof r.rid === "number" ? keyById[r.rid] : null;
            if (!ownerKey || !COUNTRY_NAMES[ownerKey]) return;
            const groups = new Map();
            r.feats.forEach(ft => {
                const fid = (ft.id === undefined || ft.id === null) ? null : Number(ft.id);
                if (fid === r.rid) return;   // خاک اصلی
                const nm = (fid !== null && MAP_COLONY_NAMES[fid]) || MAP_COLONY_NAMES[ft.properties && ft.properties.name];
                if (!nm) return;
                if (!groups.has(nm)) groups.set(nm, []);
                groups.get(nm).push(ft);
            });
            groups.forEach((fts, nm) => {
                const f = fts.length === 1 ? fts[0] : combineFeatures(fts, r.rid);
                const mf = mainLandFeature(f);
                const bb = d3.geoBounds(mf);
                let dLon = bb[1][0] - bb[0][0]; if (dLon < 0) dLon += 360;
                const c = d3.geoCentroid(mf);
                const sArea = Math.sqrt(d3.geoArea(mf)) * 1.7;
                const n1 = mkText("map-country-label map-colony-label", nm);
                const n2 = mkText("map-country-label map-colony-label map-colony-owner", "مستعمره " + COUNTRY_NAMES[ownerKey]);
                n1.style.display = "none"; n2.style.display = "none";
                mapLabelItems.push({
                    c, label: n1, label2: n2, shown: false,
                    tw: Math.max(widthOf(n1), widthOf(n2) * 0.8),
                    sw: Math.min(dLon * R * Math.max(0.2, Math.cos(c[1] * R)), sArea),
                    sh: Math.min((bb[1][1] - bb[0][1]) * R, sArea)
                });
            });
        });
    }

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

    // نقشه فقط وقتی نمایش داده می‌شود که کره، سکوها، معادن و مسیرها همه آماده باشند
    try {
        const rawSites = await sitesRawP;
        mapSites = Array.isArray(rawSites) ? rawSites : [];
        spreadSitesFromLand(mapSites);
    } catch (e) { mapSites = []; }
    renderMapSites();
    mapSitesSig = JSON.stringify(mapSites) + "|" + selectedCountry;
    await loadMapRoutes();
    updateMapSitePositions();
    mapInitialized = true; mapInitializing = false;
    redrawMap();
}

/* ---------- مسیر نیروهای در حال حرکت (برای همه) ---------- */
async function loadMapRoutes() {
    if (!mapRoutesSvg) return;
    try {
        const d = await apiGet("/api/map/transits");
        mapTransits = Array.isArray(d?.transits) ? d.transits : [];
        if (d?.now) mapRouteSkew = Date.parse(d.now) - Date.now();
        mapTransits.forEach(t => {
            t.pathOffset = 0;
            t.from_ll = remapSiteLL(t.from_ll); t.to_ll = remapSiteLL(t.to_ll);
            if (Array.isArray(t.path)) t.path = t.path.map(remapSiteLL);
        });
    } catch (e) { mapTransits = []; }
    const sig = mapTransits.map(t => [t.id, t.leg, t.battle ? 1 : 0, t.start, t.arrive, t.whole_path ? 1 : 0].join(":")).join("|") + "|" + selectedCountry + "|" + mapRoutesVisible;
    const same = sig === mapRoutesSig && (!mapRoutesVisible || mapRoutesSvg.selectAll(".map-route").size() === mapTransits.length);
    if (same) { updateMapRoutes(); return; }
    mapRoutesSig = sig;
    renderMapRoutes();
}
function renderMapRoutes() {
    if (!mapRoutesSvg) return;
    mapRoutesSvg.selectAll("*").remove();
    if (!mapRoutesVisible) return;
    const g = mapRoutesSvg.selectAll(".map-route").data(mapTransits, d => d.id).enter().append("g").attr("class", "map-route");
    g.append("path").attr("class", d => "map-route-line" + (d.country === selectedCountry ? " mine" : "") + (d.battle ? " route-battle" : ""));
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
        const line = d3.select(this).select(".map-route-line");
        const poly = (Array.isArray(d.path) && d.path.length > 2 && !d.battle) ? d.path : [d.from_ll, d.to_ll];
        line.attr("d", pathGen({ type: "LineString", coordinates: poly }) || "");
        if (d.pathOffset && mapProjection) {
            const pa = mapProjection(d.from_ll), pb = mapProjection(d.to_ll);
            if (pa && pb && Number.isFinite(pa[0]) && Number.isFinite(pb[0])) {
                const dx = pb[0] - pa[0], dy = pb[1] - pa[1], len = Math.max(1, Math.hypot(dx, dy));
                line.attr("transform", `translate(${(-dy / len * d.pathOffset).toFixed(2)},${(dx / len * d.pathOffset).toFixed(2)})`);
            } else line.attr("transform", null);
        } else line.attr("transform", null);
        // مرحلهٔ ۵: بازگشت دریایی یک مسیر چندپاره است؛ جای کشتی بر اساس طول واقعی کل مسیر (نه فقط یک پاره) محاسبه می‌شود.
        let wholePos = null;
        if (d.whole_path && !d.battle && poly.length > 2) {
            const segs = []; let tot = 0;
            for (let i = 0; i < poly.length - 1; i++) { const l = d3.geoDistance(poly[i], poly[i + 1]); segs.push(l); tot += l; }
            let rest = f * tot;
            for (let i = 0; i < segs.length; i++) {
                if (rest <= segs[i] || i === segs.length - 1) { wholePos = d3.geoInterpolate(poly[i], poly[i + 1])(segs[i] > 0 ? Math.min(1, rest / segs[i]) : 1); break; }
                rest -= segs[i];
            }
        }
        const pos = wholePos ? wholePos : d.battle && Array.isArray(d.battle_ll) && d.battle_ll.length === 2
            ? d.battle_ll
            : (poly.length > 2 && Array.isArray(d.path) && d.path[d.leg] && d.path[d.leg + 1]
                ? d3.geoInterpolate(d.path[d.leg], d.path[d.leg + 1])(f)
                : d3.geoInterpolate(d.from_ll, d.to_ll)(f));
        const p = viewCos(pos[0], pos[1], rot) > 0.02 ? mapProjection(pos) : null;
        const head = d3.select(this).select(".map-route-head");
        if (p) head.attr("transform", `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})`).style("display", "");
        else head.style("display", "none");
    });
}
setInterval(() => {
    if (mapInitialized && !document.getElementById("map")?.classList.contains("hidden")) { loadMapRoutes(); }
}, 1000);
setInterval(() => {
    if (mapInitialized && mapTransits.length && !document.getElementById("map")?.classList.contains("hidden")) updateMapRoutes();
}, 1000);

async function refreshMapSites() {
    if (!mapSitesSvg) return;
    await loadMapSites();
    const sig = JSON.stringify(mapSites) + "|" + selectedCountry;
    if (sig !== mapSitesSig) { mapSitesSig = sig; renderMapSites(); }
    updateMapSitePositions();
    loadMapRoutes();
}
setInterval(() => {
    if (mapInitialized && !document.getElementById("map")?.classList.contains("hidden")) refreshMapSites();
}, 15000);

/* ---------- فاصله‌دادن سکوها/معادن/ماهیگیری‌ها از ساحل ----------
   مختصات سرور دست‌نخورده می‌ماند؛ فقط محل نمایش روی نقشه کمی به سمت دریای باز جابه‌جا می‌شود.
   (تنگه‌ها جابه‌جا نمی‌شوند چون باید دقیقاً روی خود تنگه باشند.) */
const SITE_CLEAR_TARGET = 4.0;   // درجه (~۴۴۰ کیلومتر) فاصلهٔ دلخواه از ساحل
const SITE_MAX_MOVE = 4.0;       // حداکثر جابه‌جایی (درجه)
const SITE_MIN_SEP = 3.4;        // حداقل فاصلهٔ دو نشانگر از هم (درجه) تا روی هم نیفتند
let siteOffsetCache = {};
function _degDist(lon1, lat1, lon2, lat2) {
    let dl = Math.abs(lon1 - lon2); if (dl > 180) dl = 360 - dl;
    const dla = lat1 - lat2, c = Math.cos((lat1 + lat2) * 0.5 * Math.PI / 180);
    return Math.sqrt(dla * dla + dl * dl * c * c);
}
function buildCoastPoints(coast) {
    const pts = [];
    (coast && coast.coordinates || []).forEach(line => {
        for (let i = 0; i < line.length; i++) {
            const a = line[i];
            pts.push(a);
            const b = line[i + 1];
            if (!b || Math.abs(a[0] - b[0]) > 180) continue;
            const n = Math.floor(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) / 0.5);
            for (let k = 1; k <= n; k++) pts.push([a[0] + (b[0] - a[0]) * k / (n + 1), a[1] + (b[1] - a[1]) * k / (n + 1)]);
        }
    });
    return pts;
}
function _landAt(lon, lat) {
    try { return mapLand ? d3.geoContains(mapLand, [lon, lat]) : false; } catch (e) { return false; }
}
function spreadSitesFromLand(sites) {
    if (!mapCoastPts || !mapCoastPts.length || !mapLand) return;
    const movable = sites.filter(s => s.kind === "resource" && typeof s.lon === "number" && typeof s.lat === "number");
    movable.forEach(s => { s.lon0 = s.lon; s.lat0 = s.lat; });
    const needCompute = movable.some(s => !siteOffsetCache[s.id]);
    if (needCompute) {
        // نشانگرهای ثابت (تنگه‌ها) جابه‌جا نمی‌شوند ولی سکوها از آن‌ها هم فاصله می‌گیرند
        const placed = sites.filter(s => s.kind === "strait" && typeof s.lon === "number")
            .map(s => ({ lon: s.lon, lat: s.lat }));
        const order = movable.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
        const R = SITE_CLEAR_TARGET + SITE_MAX_MOVE + 1;
        order.forEach(s => {
            const near = mapCoastPts.filter(p => Math.abs(p[1] - s.lat) < R && _degDist(p[0], p[1], s.lon, s.lat) < R);
            const clear = (lo, la) => { let m = 99; for (const p of near) { const d = _degDist(p[0], p[1], lo, la); if (d < m) m = d; } return m; };
            const cost = (lo, la, r) => {
                let c = Math.max(0, SITE_CLEAR_TARGET - clear(lo, la)) * 2 + r * 0.12;
                for (const q of placed) c += Math.max(0, SITE_MIN_SEP - _degDist(lo, la, q.lon, q.lat)) * 3;
                return c;
            };
            const cands = [{ lo: s.lon, la: s.lat, r: 0, c: cost(s.lon, s.lat, 0) }];
            for (let r = 0.5; r <= SITE_MAX_MOVE + 1e-9; r += 0.5) {
                const n = r < 2 ? 16 : 24;
                for (let k = 0; k < n; k++) {
                    const ang = k * 2 * Math.PI / n;
                    const lo = s.lon + r * Math.sin(ang) / Math.max(0.3, Math.cos(s.lat * Math.PI / 180));
                    const la = Math.max(-80, Math.min(80, s.lat + r * Math.cos(ang)));
                    cands.push({ lo, la, r, c: cost(lo, la, r) });
                }
            }
            cands.sort((x, y) => x.c - y.c || x.r - y.r);
            const valid = x => {
                if (x.r === 0) return true;
                if (_landAt(x.lo, x.la)) return false;
                for (const f of [0.25, 0.5, 0.75]) if (_landAt(s.lon + (x.lo - s.lon) * f, s.lat + (x.la - s.lat) * f)) return false;
                return true;
            };
            const pick = cands.slice(0, 40).find(valid) || cands[0];
            siteOffsetCache[s.id] = { lon: pick.lo, lat: pick.la };
            placed.push({ lon: pick.lo, lat: pick.la });
        });
    }
    movable.forEach(s => {
        const off = siteOffsetCache[s.id];
        if (off) { s.lon = off.lon; s.lat = off.lat; }
    });
}
// مسیر ناوها/نیروها باید به محل نمایش‌داده‌شدهٔ سکو برسد، نه مختصات خام سرور
function remapSiteLL(ll) {
    if (!Array.isArray(ll) || ll.length < 2) return ll;
    for (const id in siteOffsetCache) {
        const s = (mapSites || []).find(x => x.id === id);
        if (s && s.lon0 !== undefined && Math.abs(s.lon0 - ll[0]) < 1e-4 && Math.abs(s.lat0 - ll[1]) < 1e-4) return [s.lon, s.lat];
    }
    return ll;
}

async function loadMapSites() {
    try { mapSites = await apiGet("/api/map-sites"); }
    catch (e) { mapSites = []; }
    if (!Array.isArray(mapSites)) mapSites = [];
    spreadSitesFromLand(mapSites);
}

const MAP_CAPITALS = {
    germany: [13.40, 52.52], britain: [-0.13, 51.51], ussr: [37.62, 55.75], usa: [-77.04, 38.90],
    france: [2.35, 48.86], italy: [12.50, 41.90], china: [116.40, 39.90], japan: [139.69, 35.69],
    saudi: [46.72, 24.63], iran: [51.39, 35.69], turkey: [32.86, 39.93], venezuela: [-66.90, 10.48], egypt: [31.24, 30.04]
};
const MAP_PORTS = {
    germany: [8.15, 53.53], britain: [-1.10, 50.80], ussr: [30.20, 59.93], usa: [-76.30, 36.90],
    france: [-4.49, 48.39], italy: [14.27, 40.85], china: [121.50, 31.23], japan: [139.65, 35.45],
    saudi: [39.17, 21.49], iran: [56.27, 27.18], turkey: [28.98, 41.00], venezuela: [-66.93, 10.60], egypt: [29.92, 31.20]
};
function renderMapSites() {
    if (!mapSitesSvg) return;
    mapSiteCache = null;
    mapSitesSvg.selectAll("*").remove();
    const marks = [];
    Object.keys(MAP_CAPITALS).forEach(c => {
        marks.push({ c, kind: "capital", lon: MAP_CAPITALS[c][0], lat: MAP_CAPITALS[c][1] });
        marks.push({ c, kind: "port", lon: MAP_PORTS[c][0], lat: MAP_PORTS[c][1] });
    });
    const mg = mapSitesSvg.selectAll(".map-mark").data(marks).enter().append("g")
        .attr("class", d => "map-mark map-mark-" + d.kind).style("display", "none")
        .style("pointer-events", "none");
    mg.each(function (d) {
        const s = d3.select(this);
        if (d.kind === "capital") s.append("path").attr("d", "M0,-3.2L0.9,-1L3.2,-1L1.4,0.5L2,2.8L0,1.5L-2,2.8L-1.4,0.5L-3.2,-1L-0.9,-1Z").attr("fill", "#ffd54a").attr("stroke", "#222").attr("stroke-width", 0.4);
        else s.append("text").attr("text-anchor", "middle").attr("dominant-baseline", "central").attr("font-size", 4.6).text("⚓");
    });
    const g = mapSitesSvg.selectAll(".map-site").data(mapSites).enter().append("g")
        .attr("class", d => `map-site map-site-${d.kind === "strait" ? "strait" : d.type}` +
            (!d.owner ? " site-free" : d.owner === selectedCountry ? " site-mine" : " site-other"))
        .style("display", "none")
        .on("click", (e, d) => { e.stopPropagation(); showSiteInfo(d); });
    g.append("rect").attr("class", "site-hit")
        .attr("x", -11).attr("y", -11).attr("width", 22).attr("height", 22);
    g.each(function (d) {
        const s = d3.select(this);
        if (d.kind === "strait") {
            // درخشش تنگه‌های آزاد بدون filter (filter در هر فریم چرخش کره را کند می‌کرد)
            if (!d.owner) s.append("circle").attr("class", "site-glow").attr("r", 8.5).attr("fill", "rgba(255,214,10,0.30)").style("pointer-events", "none");
            s.append("circle").attr("class", "site-shape").attr("r", 4.8);
            // اگر تنگه برای کشور من بسته است، علامت بزرگ ممنوع روی آن نشان داده می‌شود
            const rule = d.country_rules && d.country_rules[selectedCountry];
            const closedForMe = !!d.owner && d.owner !== selectedCountry && Boolean(rule && rule.closed !== undefined ? rule.closed : d.closed);
            if (closedForMe) {
                const ban = s.append("g").attr("class", "site-ban").style("pointer-events", "none");
                ban.append("circle").attr("r", 10).attr("fill", "#e11d2e").attr("stroke", "#fff").attr("stroke-width", 2);
                ban.append("rect").attr("x", -6.5).attr("y", -1.7).attr("width", 13).attr("height", 3.4).attr("rx", 1.2)
                    .attr("fill", "#fff").attr("transform", "rotate(-45)");
            }
        }
        else {
            const big = d.type === "oil";
            // سکوی نفت دایره؛ معدن‌ها (آهن، اورانیوم، غذا) مربع
            if (big) s.append("circle").attr("class", "site-shape").attr("r", 9);
            else s.append("rect").attr("class", "site-shape").attr("x", -8).attr("y", -8).attr("width", 16).attr("height", 16);
        }
    });
}

function updateMapSitePositions() {
    updateMapRoutes();
    if (!mapSitesSvg || !mapProjection) return;
    const rot = mapProjection.rotate();
    const zoom = mapProjection.scale() / mapSize;
    // با دورشدن کوچک می‌شوند تا روی کشورهای کوچک نیفتند؛ با نزدیک‌شدن کمی بزرگ‌تر
    const kBig = Math.max(0.18, Math.min(1.2, 0.32 * Math.pow(zoom, 0.7)));   // نفت و تنگه
    const kSmall = kBig;                                                       // معدن و ماهیگیری هم‌اندازهٔ سکو
    const kMark = Math.max(0.5, Math.min(1.1, 0.7 * Math.pow(zoom, 0.5)));
    if (!mapSiteCache) mapSiteCache = { marks: mapSitesSvg.selectAll(".map-mark").nodes(), sites: mapSitesSvg.selectAll(".map-site").nodes() };
    const setShown = (node, on) => { const v = on ? "" : "none"; if (node.style.display !== v) node.style.display = v; };
    const kMarkS = kMark.toFixed(2), kBigS = kBig.toFixed(2), kSmallS = kSmall.toFixed(2);
    for (const node of mapSiteCache.marks) {
        const d = node.__data__;
        const p = viewCos(d.lon, d.lat, rot) > 0.02 ? mapProjection([d.lon, d.lat]) : null;
        if (p) { node.setAttribute("transform", `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) scale(${kMarkS})`); setShown(node, true); }
        else setShown(node, false);
    }
    for (const node of mapSiteCache.sites) {
        const d = node.__data__;
        const k = (d.kind === "strait" || d.type === "oil") ? kBigS : kSmallS;
        const p = viewCos(d.lon, d.lat, rot) > 0.02 ? mapProjection([d.lon, d.lat]) : null;
        if (p) { node.setAttribute("transform", `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) scale(${k})`); setShown(node, true); }
        else setShown(node, false);
    }
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
        const clip = mapClipHit(ll);
        if (clip) {
            const ch = clip.to ? mapFeatures.find(m => m.key === clip.to) : null;
            showCountryInfo(ch ? ch.f : { id: -1 });
            return;
        }
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
    // (خط‌های مدار و نصف‌النهار روی کره حذف شد)

    // خشکی‌ها (هم‌رنگ‌ها در یک مسیر؛ کشورهای اضافه‌نشده هاشور)
    ctx.lineJoin = "round";
    for (const g of mapGroups) {
        ctx.beginPath();
        for (const m of g.items) mapPath(m.f);
        ctx.fillStyle = g.fill;
        ctx.fill();
        ctx.lineWidth = 0.5; ctx.strokeStyle = g.fill; ctx.stroke();   // پوشاندن درز
    }
    // برش‌های ۱۹۳۶ (مثلاً شرق آلمان) روی خاک امروزیِ کشور دیگر
    for (const c of mapClips) {
        if (!c.feats.length) continue;
        const fill = mapFillFor({ key: c.to });
        ctx.save();
        ctx.beginPath(); mapPath(c.poly); ctx.clip();
        ctx.beginPath(); for (const ft of c.feats) mapPath(ft);
        ctx.fillStyle = fill; ctx.fill();
        ctx.lineWidth = 0.5; ctx.strokeStyle = fill; ctx.stroke();
        ctx.restore();
    }
    // مرز کشورها و ساحل
    if (mapBorders) {
        // مرز مشکی و خوش‌حالت؛ ضخامت با زوم تنظیم می‌شود و یک هالهٔ روشن و نازک زیرش می‌نشیند تا روی همهٔ رنگ‌ها خوانا باشد
        const bz = Math.max(1, Math.min(4, mapProjection.scale() / (mapSize || 1)));
        const bw = Math.min(2.4, 0.9 + bz * 0.22);
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); mapPath(mapBorders); if (mapCustomBorders) mapPath(mapCustomBorders);   // مسیر فقط یک‌بار ساخته می‌شود
        ctx.lineWidth = bw + 1.2; ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.stroke();
        ctx.lineWidth = bw; ctx.strokeStyle = "#000"; ctx.stroke();
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

    // اسم کشور و مستعمره: فقط اگر روی خودِ آن جا شود
    for (const m of mapLabelItems) {
        const node = m.label;
        if (!node) continue;
        let p = null;
        const z = viewCos(m.c[0], m.c[1], rot);
        const lines = m.label2 ? 2.5 : 1.5;
        if (z > 0.25 && m.sw * scale * z >= m.tw * fs * 1.1 && m.sh * scale * z >= fs * lines) {
            p = mapProjection(m.c);
            if (p && (p[0] < -20 || p[0] > mapW + 20 || p[1] < -20 || p[1] > mapH + 20)) p = null;
        }
        if (p) {
            const y1 = m.label2 ? p[1] - fs * 0.6 : p[1];
            node.setAttribute("x", p[0].toFixed(1));
            node.setAttribute("y", y1.toFixed(1));
            node.setAttribute("font-size", fs.toFixed(1));
            if (m.label2) {
                m.label2.setAttribute("x", p[0].toFixed(1));
                m.label2.setAttribute("y", (p[1] + fs * 0.7).toFixed(1));
                m.label2.setAttribute("font-size", (fs * 0.8).toFixed(1));
            }
            if (!m.shown) { node.style.display = ""; if (m.label2) m.label2.style.display = ""; m.shown = true; }
        } else if (m.shown) { node.style.display = "none"; if (m.label2) m.label2.style.display = "none"; m.shown = false; }
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
    if (info?.occupier) return mapFillFor({ key: info.occupier });   // رنگ اشغالگر
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

// دارایی‌های یک کشور روی نقشه: تنگه‌ها، سکوهای نفت، معادن و ماهیگیری‌هایی که در دست دارد
const HOLDING_GROUPS = [
    { title: "⚓ تنگه‌ها", match: s => s.kind === "strait" },
    { title: "🛢️ سکوهای نفت", match: s => s.kind === "resource" && s.type === "oil" },
    { title: "⛏️ معادن", match: s => s.kind === "resource" && (s.type === "steel" || s.type === "uranium") },
    { title: "🎣 ماهیگیری", match: s => s.kind === "resource" && s.type === "food" }
];
function ensureHoldingsBox() {
    let box = document.getElementById("map-info-holdings");
    if (!box) {
        box = document.createElement("div");
        box.id = "map-info-holdings";
        box.className = "map-info-holdings hidden";
        const anchor = document.getElementById("map-info-strait-controls") || document.getElementById("map-info-desc");
        anchor.insertAdjacentElement("afterend", box);
    }
    return box;
}
function renderCountryHoldings(key) {
    const box = ensureHoldingsBox();
    const mine = (Array.isArray(mapSites) ? mapSites : []).filter(s => s.owner === key);
    let html = "";
    HOLDING_GROUPS.forEach(g => {
        const items = mine.filter(g.match);
        if (!items.length) return;
        html += `<div class="holding-group"><div class="holding-title">${g.title} <span>${items.length.toLocaleString("fa-IR")}</span></div>` +
            `<div class="holding-list">${items.map(s => `<span class="holding-chip">${escapeHtml(s.name || s.id)}</span>`).join("")}</div></div>`;
    });
    box.innerHTML = html || `<div class="holding-empty">تنگه، سکو، معدن یا ماهیگیری در دست ندارد.</div>`;
    box.classList.remove("hidden");
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
    { const hb = document.getElementById("map-info-holdings"); if (hb) { hb.classList.add("hidden"); hb.innerHTML = ""; } }

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
    // دارایی‌های کشور (فقط کشورهای بازیکن‌دار یا کشور خودم)؛ بعد از بارگیری تازهٔ نقشه دوباره رسم می‌شود
    if (key === selectedCountry || info?.taken) {
        renderCountryHoldings(key);
        loadMapSites().then(() => {
            if (!panel.classList.contains("hidden") && nameEl.textContent === COUNTRY_NAMES[key]) renderCountryHoldings(key);
        }).catch(() => {});
    }
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
    { const hb = document.getElementById("map-info-holdings"); if (hb) { hb.classList.add("hidden"); hb.innerHTML = ""; } }

    if (site.kind === "strait") {
        flagEl.textContent = "⚓";
        const personalRule = site.country_rules?.[selectedCountry];
        const effectiveToll = site.owner === selectedCountry ? 0 : Number(personalRule?.toll ?? site.toll ?? 0);
        const effectiveClosed = site.owner === selectedCountry ? false : Boolean(personalRule?.closed ?? site.closed ?? false);
        const policyLabel = personalRule && site.owner !== selectedCountry ? "قانون ویژهٔ کشور شما" : "قانون عمومی";
        descEl.textContent = `عوارض برای شما: ${effectiveToll === 0 ? "رایگان" : formatMoney(effectiveToll)} · ${effectiveClosed ? "عبور بسته" : "عبور باز"} (${policyLabel})`;
    } else {
        flagEl.textContent = RESOURCE_ICONS[site.type] || "📍";
        const zoneTxt = site.zone === "sea" ? "🌊 در دریا" : (site.zone === "land" ? "⛰️ در خشکی" : "");
        descEl.textContent = `تولید: ${formatNumber(Math.floor(Number(site.production || 0) / 5))} در روز` + (zoneTxt ? ` — ${zoneTxt}` : "")
            + ((site.type === "steel" || site.type === "uranium") ? " — تصرف: ارتش + ناو ترابری" : "");
    }
    nameEl.textContent = site.name;
    if (site.owner) {
        statusEl.innerHTML = `متعلق به ${flagInline(site.owner, true)} ${COUNTRY_NAMES[site.owner] || site.owner}`;
    } else {
        statusEl.textContent = "بی‌صاحب";
    }

    actionBtn.classList.remove("hidden");
    actionBtn.textContent = "🧭 اعزام نیرو";
    actionBtn.onclick = () => openDispatchTo(site.id);
    if (site.kind === "strait" && site.owner === selectedCountry && controls) {
        controls.classList.remove("hidden"); controls.classList.add("sp");
        const MODES = { close: ["🔒", "بستن"], toll: ["💰", "عوارض"], free: ["🟢", "رایگان"] };
        const modeOf = (toll, closed) => closed ? "close" : (Number(toll) > 0 ? "toll" : "free");
        const modeText = (toll, closed) => closed ? "بسته" : (Number(toll) > 0 ? `عوارض ${formatMoney(toll)}` : "رایگان");
        const rules = site.country_rules || {};
        const effective = cid => {
            const r = cid ? rules[cid] : null;
            return { toll: Number(r?.toll ?? site.toll ?? 0), closed: Boolean(r?.closed ?? site.closed ?? false), custom: Boolean(r) };
        };
        const segHtml = scope => Object.entries(MODES).map(([act, [ic, lb]]) =>
            `<button type="button" class="sp-btn" data-scope="${scope}" data-act="${act}"><i>${ic}</i><span>${lb}</span></button>`).join("");
        const tollBoxHtml = scope => `<div class="sp-toll hidden" data-toll-box="${scope}">
            <input type="number" inputmode="numeric" min="1" step="1" placeholder="مبلغ عوارض ($)" data-toll-input="${scope}">
            <button type="button" class="sp-ok" data-toll-ok="${scope}">ثبت</button></div>`;
        const exIds = Object.keys(rules).filter(k => COUNTRY_NAMES[k] && k !== selectedCountry);
        const countryOptions = Object.entries(COUNTRY_NAMES).filter(([id]) => id !== selectedCountry).map(([id, name]) =>
            `<option value="${id}">${COUNTRY_FLAGS[id] || "🏳️"} ${name}</option>`).join("");
        controls.innerHTML = `
            <div class="sp-head"><b>⚓ مدیریت تنگه</b><span class="sp-state" id="sp-global-state"></span></div>
            <div class="sp-seg">${segHtml("global")}</div>
            ${tollBoxHtml("global")}
            <div class="sp-sep"></div>
            <div class="sp-head"><b>🌐 استثنا</b><span class="sp-sub">تنظیم فقط برای یک کشور</span></div>
            <select id="sp-country" class="sp-select"><option value="">انتخاب کشور…</option>${countryOptions}</select>
            ${exIds.length ? `<div class="sp-chips">${exIds.map(id => { const e = effective(id); return `<button type="button" class="sp-chip" data-pick="${id}">${COUNTRY_FLAGS[id] || "🏳️"} ${MODES[modeOf(e.toll, e.closed)][0]}</button>`; }).join("")}</div>` : ""}
            <div class="sp-country-box hidden" id="sp-country-box">
                <div class="sp-seg">${segHtml("country")}</div>
                ${tollBoxHtml("country")}
                <div class="sp-foot"><span id="sp-country-state"></span><button type="button" class="sp-clear" id="sp-clear">حذف استثنا</button></div>
            </div>`;

        const $ = sel => controls.querySelector(sel);
        const sel = $("#sp-country");
        const markActive = (scope, mode) => controls.querySelectorAll(`.sp-btn[data-scope="${scope}"]`)
            .forEach(b => b.classList.toggle("active", b.dataset.act === mode));
        const closeTollBox = scope => $(`[data-toll-box="${scope}"]`)?.classList.add("hidden");
        const refreshGlobal = () => {
            $("#sp-global-state").textContent = modeText(site.toll, site.closed);
            markActive("global", modeOf(site.toll, site.closed));
        };
        const refreshCountry = () => {
            const cid = sel.value, box = $("#sp-country-box");
            box.classList.toggle("hidden", !cid);
            if (!cid) return;
            const e = effective(cid);
            markActive("country", modeOf(e.toll, e.closed));
            $("#sp-country-state").textContent = `${modeText(e.toll, e.closed)} · ${e.custom ? "استثنای فعال" : "طبق قانون عمومی"}`;
            $("#sp-clear").classList.toggle("hidden", !e.custom);
            closeTollBox("country");
        };
        const reloadSite = async (message, keepCountry) => {
            if (message) showToast(message, "success");
            await loadMapSites();
            const updated = mapSites.find(x => x.id === site.id);
            if (updated) {
                showSiteInfo(updated);
                if (keepCountry) {
                    const s2 = document.getElementById("sp-country");
                    if (s2) { s2.value = keepCountry; s2.dispatchEvent(new Event("change")); }
                }
            }
        };
        const send = async payload => {
            const d = await apiPost("/api/strait/settings", { site_id: site.id, ...payload });
            if (!d?.success) { showToast(d?.message || "ذخیره تنظیمات انجام نشد.", "error"); return null; }
            return d;
        };
        const act = async (scope, action, toll) => {
            const countryId = scope === "country" ? sel.value : undefined;
            if (scope === "country" && !countryId) { showToast("ابتدا کشور را انتخاب کنید.", "error"); return; }
            const d = await send({ action, ...(action === "toll" ? { toll } : {}), ...(countryId ? { country_id: countryId } : {}) });
            if (!d) return;
            if (d.changed === false) { showToast(d.message, undefined); return; }
            await reloadSite(d.message, countryId);
        };
        controls.querySelectorAll(".sp-btn").forEach(b => b.onclick = () => {
            const scope = b.dataset.scope, action = b.dataset.act;
            if (action === "toll") {
                const box = $(`[data-toll-box="${scope}"]`), input = $(`[data-toll-input="${scope}"]`);
                const e = scope === "country" ? effective(sel.value) : { toll: site.toll };
                box.classList.toggle("hidden");
                if (!box.classList.contains("hidden")) { input.value = Number(e.toll) > 0 ? Math.floor(e.toll) : ""; input.focus(); }
                return;
            }
            closeTollBox(scope); act(scope, action);
        });
        controls.querySelectorAll("[data-toll-ok]").forEach(b => b.onclick = () => {
            const scope = b.dataset.tollOk, v = Math.floor(Number($(`[data-toll-input="${scope}"]`).value));
            if (!Number.isFinite(v) || v <= 0) { showToast("یک مبلغ عوارض معتبر (بزرگ‌تر از صفر) وارد کنید.", "error"); return; }
            act(scope, "toll", v);
        });
        controls.querySelectorAll("[data-toll-input]").forEach(i => i.addEventListener("keydown", ev => {
            if (ev.key === "Enter") { ev.preventDefault(); controls.querySelector(`[data-toll-ok="${i.dataset.tollInput}"]`).click(); }
        }));
        sel.addEventListener("change", refreshCountry);
        controls.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { sel.value = b.dataset.pick; refreshCountry(); });
        $("#sp-clear").onclick = async () => {
            const country_id = sel.value; if (!country_id) return;
            const d = await send({ country_id, clear_country_rule: true });
            if (d) await reloadSite(`استثنای ${COUNTRY_NAMES[country_id]} حذف شد؛ قانون عمومی اعمال می‌شود.`, country_id);
        };
        refreshGlobal(); refreshCountry();
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
                if (!d.completion_message) showToast(d.message);
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


/* =========================================================
   Init
========================================================= */
(async function init() {
    showOnly("loading");
    const t0 = Date.now();
    try { await fetchAvailableWorlds(); }
    catch (e) { console.error("World list:", e); }
    const elapsed = Date.now() - t0;
    if (elapsed < 550) await new Promise(r => setTimeout(r, 550 - elapsed));
    const openAdmin = new URLSearchParams(window.location.search).get("open") === "admin";
    if (openAdmin) {
        if (!isAdminAccount) {
            showToast("این پیوند مخصوص مدیر اصلی است.", "error");
            showWorldSelection();
            return;
        }
        // پنل مدیریت یک مسیر مستقل است؛ هدر و منوی بازی نمایش داده نمی‌شوند.
        document.body.classList.add("admin-direct");
        await loadArmyCatalog();
        showOnly("game");
        document.getElementById("game")?.classList.remove("booting");
        showGamePage("admin");
        renderAdminNavigation();
        await loadAdminPanel();
        return;
    }
    // اولین ورود (یا ورودی که انتخاب دنیا/کشور در آن کامل نشده) همیشه با صفحهٔ انتخاب دنیا شروع می‌شود.
    // اگر سرور بگوید این بازیکن قبلاً در یک دنیا کشور گرفته، مستقیم وارد آخرین دنیا و کشور او می‌شویم.
    const mine = availableWorlds.filter(w => w.mine);
    if (mine.length) {
        const auto = mine.find(w => String(w.id) === String(selectedWorldId)) || mine[0];
        selectedWorldId = String(auto.id); await enterSelectedWorld(); return;
    }
    await showWorldSelection();
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
    const sx = d.season_consumption_extra || {}, sp = d.season_consumption_pct || {};
    const seasonLines = [];
    if (Number(d.season_income_pct || 0) < 0) seasonLines.push(`<div class="st-line st-season-line"><span>کاهش درآمد به دلیل فصل ${escapeHtml(d.season || "")} (${formatNumber(Math.abs(d.season_income_pct))}٪)</span><b>−${formatStatsAmount(d.season_income_loss)}</b></div>`);
    if (Number(sx.food || 0) > 0) seasonLines.push(`<div class="st-line st-season-line"><span>مصرف بیشتر غذا به دلیل فصل ${escapeHtml(d.season || "")} (+${formatNumber(sp.food || 0)}٪)</span><b>−${formatNumber(sx.food)} در روز</b></div>`);
    if (Number(sx.oil || 0) > 0) seasonLines.push(`<div class="st-line st-season-line"><span>مصرف بیشتر نفت به دلیل فصل ${escapeHtml(d.season || "")} (+${formatNumber(sp.oil || 0)}٪)</span><b>−${formatNumber(sx.oil)} در روز</b></div>`);
    const seasonStatsHtml = seasonLines.join("");
    body.innerHTML = `
        <div class="st-card st-finance-card">
            <div class="st-finance-head"><div><small>درآمد کل روزانه پیش از هزینه‌ها</small><strong>${formatStatsAmount(d.total_income)}</strong></div><span class="st-finance-icon">💰</span></div>
            <div class="st-finance-breakdown">
                <div class="st-line"><span>درآمد پایهٔ کشور</span><b>${formatStatsAmount(d.income_base)}</b></div>
                ${Number(d.income_economy || 0) ? `<div class="st-line"><span>سرمایه‌گذاری‌های اقتصادی</span><b>${formatStatsAmount(d.income_economy)}</b></div>` : ""}
                ${Number(d.income_occupation || 0) ? `<div class="st-line"><span>کشورهای اشغال‌شده</span><b>${formatStatsAmount(d.income_occupation)}</b></div>` : ""}
                ${seasonStatsHtml}
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
        <div class="st-card st-card-plain welfare-events-card">
            <h3>رویدادها و امنیت</h3>
            <p class="st-muted">رویدادهای محتمل در کشور شما: ${risks.length ? escapeHtml(risks.join("، ")) : "—"}</p>
            <p class="st-text">بیمارستان، پلیس، شهرک مسکونی، دانشگاه و مترو می‌توانند احتمال یا شدت برخی رویدادها را کاهش دهند. افت رفاه به‌مرور جبران می‌شود.</p>
            <div class="welfare-events-heading">رویدادهای اخیر</div>
            <ul class="st-events">${events.length ? events.map(e => `<li><span class="st-ev-text">${escapeHtml(e.text || "")}</span><span class="st-ev-time">${timeAgo(e.at, d.now)}</span></li>`).join("") : `<li><span class="st-ev-text">هنوز رویدادی رخ نداده است.</span></li>`}</ul>
        </div>`;
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

setInterval(() => {
    const warPage = document.getElementById("war");
    if (warPage && !warPage.classList.contains("hidden")) {
        if (currentWarTab === "war-targets-panel") loadWarData();
        if (currentWarTab === "war-forces-panel") loadForces();
    }
}, 2500);


/* ---------- دکمهٔ خانه روی نقشه ---------- */
document.getElementById("map-home-btn")?.addEventListener("click", () => {
    const cap = MAP_CAPITALS[player?.country];
    if (!cap || !mapProjection) { showToast("کشور شما مشخص نیست.", "error"); return; }
    setMapSpin(false);
    mapRotation = [-cap[0], -cap[1]];
    redrawMap();
});
