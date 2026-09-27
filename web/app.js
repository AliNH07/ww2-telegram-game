const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
}

const userId = tg?.initDataUnsafe?.user?.id || null;

let player = null;
let countries = {};
let selectedCountry = null;
let worldData = null;
let statsInterval = null;
let warsData = { declared_by_me: [], declared_on_me: [], occupations: {} };

const COUNTRY_IMAGE_EXT = {
    germany: "jpg",
    britain: "jfif",
    ussr: "jfif",
    usa: "jfif",
    france: "jfif",
    italy: "jfif",
    china: "jfif",
    japan: "jfif"
};

const COUNTRY_FLAGS = {
    germany: "🇩🇪", britain: "🇬🇧", ussr: "☭", usa: "🇺🇸",
    france: "🇫🇷", italy: "🇮🇹", china: "🇨🇳", japan: "🇯🇵"
};

const COUNTRY_NAMES = {
    germany: "آلمان", britain: "بریتانیا", ussr: "شوروی", usa: "آمریکا",
    france: "فرانسه", italy: "ایتالیا", china: "چین", japan: "ژاپن"
};

const COUNTRY_IDS = {
    germany: 276, britain: 826, ussr: 643, usa: 840,
    france: 250, italy: 380, china: 156, japan: 392
};

const ARMY_UNITS = {
    land: { name: "گردان زمینی", group: "land", cost: 50_000, manpower: 300, power_required: 5, attack: 20, defense: 10 },
    air:  { name: "اسکادران هوایی", group: "air", cost: 200_000, manpower: 150, power_required: 15, attack: 60, defense: 30 },
    navy: { name: "ناو دریایی", group: "naval", cost: 250_000, manpower: 200, power_required: 15, attack: 50, defense: 60 }
};

const TREATY_TYPE_NAMES = { alliance: "پیمان اتحاد", non_aggression: "پیمان عدم تجاوز" };
const ATTACK_TYPE_NAMES = { land: "زمینی", air: "هوایی", navy: "دریایی" };
const GROUP_TITLES = { land: "زمینی", naval: "دریایی", air: "هوایی" };
const INFRA_GROUP_NEEDS = { land: "پادگان زمینی", naval: "بندر نظامی", air: "فرودگاه نظامی" };

const OCEAN_LABELS = [
    [-40, 25, "اقیانوس اطلس"],
    [-150, 0, "اقیانوس آرام"],
    [75, -20, "اقیانوس هند"],
    [90, 65, "اقیانوس منجمد شمالی"],
    [20, -60, "اقیانوس منجمد جنوبی"]
];

const STRAITS = [
    { lon: -5.6, lat: 35.9, name: "تنگه جبل‌الطارق", desc: "اتصال مدیترانه به اطلس." },
    { lon: 29.0, lat: 41.1, name: "تنگه بسفر", desc: "تنها راه دریایی دریای سیاه." },
    { lon: 56.3, lat: 26.6, name: "تنگه هرمز", desc: "حیاتی‌ترین تنگه انرژی جهان." },
    { lon: 43.3, lat: 12.6, name: "تنگه باب‌المندب", desc: "دروازه دریای سرخ." },
    { lon: 32.3, lat: 30.6, name: "کانال سوئز", desc: "کوتاه‌ترین مسیر اروپا-آسیا." },
    { lon: 1.4, lat: 50.9, name: "تنگه دوور", desc: "باریک‌ترین نقطه مانش." },
    { lon: -79.6, lat: 9.1, name: "کانال پاناما", desc: "اتصال اطلس و آرام." },
    { lon: 103.8, lat: 1.3, name: "تنگه مالاکا", desc: "شریان تجارت آسیا." },
    { lon: -5.9, lat: 43.4, name: "خلیج بیسکای", desc: "مسیر غرب اروپا." },
    { lon: 121.0, lat: 24.0, name: "تنگه تایوان", desc: "آبراه شرق آسیا." },
    { lon: 129.9, lat: 34.0, name: "تنگه کره", desc: "دریای ژاپن به زرد." }
];


/* ========================================================= */

function countryImageUrl(countryId) {
    const ext = COUNTRY_IMAGE_EXT[countryId] || "jpg";
    return `/images/countries/${countryId}.${ext}`;
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

function getApiUrl(path, params = {}) {
    const url = new URL(path, window.location.origin);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
}

function formatMoney(v) { return "$" + Math.round(Number(v ?? 0)).toLocaleString("en-US"); }
function formatNumber(v) { return Math.round(Number(v ?? 0)).toLocaleString("en-US"); }

async function loadWorldAtlas() {
    if (worldData) return worldData;
    const r = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
    worldData = await r.json();
    return worldData;
}


/* ========================================================= */

async function loadPlayer() {
    if (!userId) return;
    try {
        const r = await fetch(getApiUrl("/api/player", { user_id: userId }));
        if (!r.ok) throw new Error();
        player = await r.json();
        if (player.country) selectedCountry = player.country;
    } catch (e) { console.error(e); }
}

async function refreshPlayer() {
    if (!userId) return;
    try {
        const r = await fetch(getApiUrl("/api/player", { user_id: userId }));
        if (!r.ok) return;
        player = await r.json();
        updateHomeStats();
    } catch (e) { console.error(e); }
}

function startStatsPolling() {
    stopStatsPolling();
    statsInterval = setInterval(() => refreshPlayer(), 30000);
}

function stopStatsPolling() {
    if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
}


/* ========================================================= */

async function loadCountries() {
    try {
        const r = await fetch("/api/countries");
        if (!r.ok) throw new Error();
        const data = await r.json();
        countries = {};
        data.forEach(c => { countries[c.id] = c; });
        updateCountryCards();
    } catch (e) { console.error(e); }
}


/* ========================================================= */

function showCountrySelection() {
    showOnly("country");
    updateCountryCards();
}

function updateCountryCards() {
    document.querySelectorAll("[data-country-card]").forEach(card => {
        const cid = card.dataset.country;
        const c = countries[cid];
        if (!c) return;
        if (c.taken) {
            if (player?.country === cid) card.classList.remove("taken");
            else card.classList.add("taken");
        } else {
            card.classList.remove("taken");
        }
    });
}

document.querySelectorAll("[data-country-card]").forEach(card => {
    card.addEventListener("click", () => {
        const cid = card.dataset.country;
        const c = countries[cid];
        if (c?.taken && player?.country !== cid) {
            showMessage("این کشور قبلاً توسط بازیکن دیگری انتخاب شده است.");
            return;
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
    selectedCountry = null;
    showCountrySelection();
});

document.getElementById("enter-game-button").addEventListener("click", confirmCountrySelection);

async function confirmCountrySelection() {
    if (!userId) { alert("باید از داخل تلگرام وارد شوید."); return; }
    if (player?.country === selectedCountry) { showGame(); return; }

    try {
        const r = await fetch(getApiUrl("/api/select-country", {
            user_id: userId, country: selectedCountry
        }));
        const data = await r.json();

        if (!r.ok) {
            if (data.error === "country_taken") {
                alert("این کشور قبلاً انتخاب شده.");
                selectedCountry = null;
                await loadCountries();
                showCountrySelection();
                return;
            }
            if (data.error === "already_has_country") {
                alert("شما قبلاً کشور انتخاب کرده‌اید.");
                await loadPlayer();
                showGame();
                return;
            }
            throw new Error(data.error);
        }

        player = data.player;
        await loadCountries();
        showGame();
    } catch (e) {
        console.error(e);
        alert("خطا در ورود به بازی.");
    }
}

function showGame() {
    showOnly("game");
    showGamePage("home");
    updateGameHeader();
    updateHomeStats();
    startStatsPolling();
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    const homeNav = document.querySelector('[data-page="home"]');
    if (homeNav) homeNav.classList.add("active");
}

function updateGameHeader() {
    document.getElementById("game-country-flag").src = countryImageUrl(selectedCountry);
}


/* ========================================================= */

function updateHomeStats() {
    if (!player) return;

    const name = COUNTRY_NAMES[selectedCountry] || selectedCountry;

    document.getElementById("home-country-flag").src = countryImageUrl(selectedCountry);
    document.getElementById("home-country-name").textContent = name;

    const photo = document.getElementById("home-card-photo");
    if (photo) photo.style.backgroundImage = `url(${countryImageUrl(selectedCountry)})`;

    document.getElementById("home-money").textContent = formatMoney(player.money);
    document.getElementById("home-income").textContent = formatMoney(player.daily_income) + " / روز";
    document.getElementById("home-manpower").textContent = formatNumber(player.manpower);
    document.getElementById("home-manpower-production").textContent = formatNumber(player.manpower_production);
    document.getElementById("home-power").textContent = formatNumber(player.power_capacity);
    document.getElementById("home-power-sub").textContent = `مصرف: ${formatNumber(player.power_consumption ?? 0)}`;
    document.getElementById("home-army").textContent = formatNumber(player.army);
    document.getElementById("home-season").textContent = player.season ?? "بهار";
    document.getElementById("home-season-end").textContent =
        `پایان فصل تا ${player.season_days_left ?? 0} روز و ${player.season_hours_left ?? 0} ساعت`;

    const mapMoney = document.getElementById("map-money");
    if (mapMoney) mapMoney.textContent = formatMoney(player.money);

    if (player.rankings) {
        const r = player.rankings;
        document.getElementById("rank-overall").textContent = `#${r.overall.rank || "—"}/${r.overall.total || 0}`;
        document.getElementById("rank-economy").textContent = `#${r.economy.rank || "—"}/${r.economy.total || 0}`;
        document.getElementById("rank-military").textContent = `#${r.military.rank || "—"}/${r.military.total || 0}`;
        document.getElementById("rank-diplomacy").textContent = `#${r.diplomacy.rank || "—"}/${r.diplomacy.total || 0}`;
        document.getElementById("rank-development").textContent = `#${r.development.rank || "—"}/${r.development.total || 0}`;
    }
}


/* ========================================================= */

document.querySelectorAll(".action-card").forEach(card => {
    card.addEventListener("click", () => {
        const s = card.dataset.section;
        if (s === "infrastructure") return openInfrastructureMenu();
        if (s === "army") return openArmyPage();
        if (s === "war") return openWarPage();
        if (s === "diplomacy") return openDiplomacyPage();
        if (s === "economy") return openEconomyPage();
        if (s === "market") { alert("بازار جهانی به‌زودی فعال می‌شود."); return; }
    });
});

document.querySelectorAll(".sub-back-button").forEach(btn => {
    btn.addEventListener("click", () => {
        showGamePage(btn.dataset.backTo || "home");
    });
});


/* ========================================================= */

function openInfrastructureMenu() { showGamePage("infrastructure"); }

document.querySelectorAll("[data-infra-section]").forEach(tile => {
    tile.addEventListener("click", async () => {
        const s = tile.dataset.infraSection;
        await refreshPlayer();
        if (s === "power") {
            renderInfraList("infra-power-list", "power");
            showGamePage("infra-power");
        } else if (s === "manpower") {
            renderInfraList("infra-manpower-list", "manpower");
            showGamePage("infra-manpower");
        } else if (s === "military") {
            renderInfraList("infra-land-list", "land");
            renderInfraList("infra-naval-list", "naval");
            renderInfraList("infra-air-list", "air");
            showGamePage("infra-military");
        }
    });
});


/* ========================================================= */

function infraEffectText(item) {
    const g = item.group;

    if (!item.current) {
        let next = "";
        if (item.next) {
            if (g === "power") next = `سطح ۱: ظرفیت ${item.next.capacity} — ${formatMoney(item.next.cost)}`;
            else if (g === "manpower") next = `سطح ۱: تولید ${item.next.production} نفر — ${formatMoney(item.next.cost)}`;
            else next = `سطح ۱: ظرفیت ${item.next.capacity} — ${formatMoney(item.next.cost)}`;
        }
        return `هنوز ساخته نشده.<br>${next}`;
    }

    if (g === "power") {
        return `ظرفیت فعلی: ${item.current.capacity}<br>` +
            (item.next
                ? `سطح بعد: ${item.next.capacity} — ${formatMoney(item.next.cost)}`
                : "به حداکثر رسیده.");
    }
    if (g === "manpower") {
        return `تولید روزانه: ${item.current.production}<br>` +
            (item.next
                ? `سطح بعد: ${item.next.production} — ${formatMoney(item.next.cost)}`
                : "به حداکثر رسیده.");
    }
    return `ظرفیت: ${item.current.capacity}<br>` +
        (item.next
            ? `سطح بعد: ${item.next.capacity} — ${formatMoney(item.next.cost)}`
            : "به حداکثر رسیده.");
}

function renderInfraList(containerId, group) {
    const c = document.getElementById(containerId);
    if (!c || !player?.infra) return;
    c.innerHTML = "";
    Object.entries(player.infra).forEach(([id, item]) => {
        if (item.group !== group) return;
        const card = document.createElement("div");
        card.className = "infra-card";
        card.innerHTML = `
            <div class="infra-card-top">
                <span class="infra-card-name">${item.name}</span>
                <span class="infra-card-level">سطح ${item.level} از ${item.max_level}</span>
            </div>
            <div class="infra-card-detail">${infraEffectText(item)}</div>
            <button class="infra-upgrade-button" ${!item.next ? "disabled" : ""}>
                ${item.next ? "ارتقا" : "حداکثر سطح"}
            </button>`;
        const btn = card.querySelector(".infra-upgrade-button");
        if (item.next) btn.addEventListener("click", () => upgradeInfra(id));
        c.appendChild(card);
    });
}

async function upgradeInfra(id) {
    if (!userId) return;
    try {
        const r = await fetch(getApiUrl("/api/upgrade-infra", { user_id: userId, category: id }));
        const data = await r.json();
        if (!r.ok || !data.success) {
            alert(data.message || "امکان ارتقا نیست.");
            return;
        }
        player = data.player;
        updateHomeStats();
        const active = document.querySelector(".game-page:not(.hidden)");
        if (!active) return;
        const pid = active.id;
        if (pid === "infra-power") renderInfraList("infra-power-list", "power");
        else if (pid === "infra-manpower") renderInfraList("infra-manpower-list", "manpower");
        else if (pid === "infra-military") {
            renderInfraList("infra-land-list", "land");
            renderInfraList("infra-naval-list", "naval");
            renderInfraList("infra-air-list", "air");
        }
    } catch (e) { console.error(e); alert("خطا."); }
}


/* ========================================================= */

async function openEconomyPage() {
    showGamePage("economy");
    await refreshPlayer();
    renderEconomyList();
}

function renderEconomyList() {
    const c = document.getElementById("economy-list");
    if (!c || !player?.economy) return;
    c.innerHTML = "";

    const powerFree = (player.power_capacity ?? 0) - (player.power_consumption ?? 0);

    Object.entries(player.economy).forEach(([id, item]) => {
        const card = document.createElement("div");
        card.className = "infra-card";

        let detail = "";
        if (!item.current) {
            detail = `هنوز ساخته نشده.<br>`;
            if (item.next) detail += `سطح ۱: +${formatMoney(item.next.income)} — ${formatMoney(item.next.cost)} | برق: ${item.power_required}`;
        } else {
            detail = `درآمد فعلی: +${formatMoney(item.current.income)} / روز<br>`;
            detail += `برق مصرفی: ${item.power_required * item.level}`;
            if (item.next) detail += `<br>سطح بعد: +${formatMoney(item.next.income)} — ${formatMoney(item.next.cost)}`;
            else detail += `<br>به حداکثر رسیده.`;
        }

        let disabled = !item.next;
        let buttonText = item.next ? "سرمایه‌گذاری" : "حداکثر سطح";
        let hint = "";

        if (item.next && powerFree < item.power_required) {
            disabled = true;
            hint = `⚠️ نیاز به ${item.power_required} واحد برق. الان ${powerFree} واحد آزاد دارید. ابتدا نیروگاه بسازید.`;
        }

        card.innerHTML = `
            <div class="infra-card-top">
                <span class="infra-card-name">${item.name}</span>
                <span class="infra-card-level">سطح ${item.level} از ${item.max_level}</span>
            </div>
            <div class="infra-card-detail">${detail}</div>
            ${hint ? `<div class="disabled-hint">${hint}</div>` : ""}
            <button class="infra-upgrade-button" ${disabled ? "disabled" : ""}>${buttonText}</button>`;

        const btn = card.querySelector(".infra-upgrade-button");
        if (!disabled && item.next) btn.addEventListener("click", () => upgradeEconomy(id));
        c.appendChild(card);
    });
}

async function upgradeEconomy(id) {
    if (!userId) return;
    try {
        const r = await fetch(getApiUrl("/api/upgrade-economy", { user_id: userId, category: id }));
        const data = await r.json();
        if (!r.ok || !data.success) { alert(data.message || "امکان نیست."); return; }
        player = data.player;
        updateHomeStats();
        renderEconomyList();
    } catch (e) { console.error(e); alert("خطا."); }
}


/* ========================================================= */

async function openArmyPage() {
    showGamePage("army");
    await refreshPlayer();
    renderArmyUnits();
}

function getGroupCapacity(group) {
    if (!player?.infra) return 0;
    let total = 0;
    Object.values(player.infra).forEach(item => {
        if (item.group === group && item.current) total += item.current.capacity ?? 0;
    });
    return total;
}

function renderArmyUnits() {
    const c = document.getElementById("army-units");
    if (!c || !player) return;
    c.innerHTML = "";

    Object.entries(ARMY_UNITS).forEach(([unitId, unit]) => {
        const capacity = getGroupCapacity(unit.group);
        const hasInfra = capacity > 0;
        const count = player.units?.[unitId] ?? 0;
        const card = document.createElement("div");
        card.className = "unit-card";

        let statusText, hint = "", disabled = false;

        if (!hasInfra) {
            statusText = `نیاز به زیرساخت ${GROUP_TITLES[unit.group]}`;
            hint = `⚠️ ابتدا «${INFRA_GROUP_NEEDS[unit.group]}» را در بخش زیرساخت بسازید.`;
            disabled = true;
        } else if (count >= capacity) {
            statusText = "ظرفیت پر است";
            hint = "⚠️ ظرفیت زیرساخت پر شده. آن را ارتقا دهید.";
            disabled = true;
        } else if ((player.power_capacity ?? 0) < unit.power_required) {
            statusText = "برق کافی نیست";
            hint = `⚠️ نیاز به ${unit.power_required} واحد برق. نیروگاه بسازید.`;
            disabled = true;
        } else if (player.money < unit.cost) {
            statusText = "پول کافی نیست";
            hint = `⚠️ نیاز به ${formatMoney(unit.cost)}.`;
            disabled = true;
        } else if (player.manpower < unit.manpower) {
            statusText = "نیروی انسانی کم";
            hint = `⚠️ نیاز به ${formatNumber(unit.manpower)} نفر.`;
            disabled = true;
        } else {
            statusText = "آماده آموزش";
        }

        card.innerHTML = `
            <div class="unit-card-top">
                <span class="unit-card-name">${unit.name}</span>
                <span class="unit-card-count">${count} از ${capacity}</span>
            </div>
            <div class="unit-card-detail">
                💰 ${formatMoney(unit.cost)} | 👥 ${formatNumber(unit.manpower)} نفر | ⚡ ${unit.power_required}<br>
                ⚔️ حمله: ${unit.attack} | 🛡️ دفاع: ${unit.defense}<br>
                وضعیت: ${statusText}
            </div>
            ${hint ? `<div class="disabled-hint">${hint}</div>` : ""}
            <button class="unit-train-button" ${disabled ? "disabled" : ""}>آموزش</button>`;

        const btn = card.querySelector(".unit-train-button");
        if (!disabled) btn.addEventListener("click", () => trainUnit(unitId));
        c.appendChild(card);
    });
}

async function trainUnit(id) {
    if (!userId) return;
    try {
        const r = await fetch(getApiUrl("/api/train-unit", { user_id: userId, unit_id: id }));
        const data = await r.json();
        if (!r.ok || !data.success) { alert(data.message || "امکان نیست."); return; }
        player = data.player;
        updateHomeStats();
        renderArmyUnits();
    } catch (e) { console.error(e); alert("خطا."); }
}


/* ========================================================= */
/*                     WAR                                    */
/* ========================================================= */

async function loadWars() {
    if (!userId) return;
    try {
        const r = await fetch(getApiUrl("/api/wars", { user_id: userId }));
        if (!r.ok) return;
        warsData = await r.json();
    } catch (e) { console.error(e); }
}

async function openWarPage() {
    showGamePage("war");
    await refreshPlayer();
    await loadWars();
    renderWarPage();
}

function renderWarPage() {
    renderMyWars();
    renderIncomingWars();
    renderDeclareWarList();
}

function renderMyWars() {
    const c = document.getElementById("my-wars-list");
    if (!c) return;
    c.innerHTML = "";
    const wars = warsData.declared_by_me || [];
    if (!wars.length) {
        c.innerHTML = `<div class="wars-empty">هیچ جنگی اعلام نکرده‌اید.</div>`;
        return;
    }
    wars.forEach(war => {
        const t = war.defender;
        const card = document.createElement("div");
        card.className = "war-item";
        card.innerHTML = `
            <div class="war-item-top">
                <img class="war-target-flag" src="${countryImageUrl(t)}" alt="">
                <div>
                    <div class="war-item-name">علیه ${COUNTRY_NAMES[t]}</div>
                    <div class="war-item-status">در حال جنگ</div>
                </div>
            </div>
            <div class="war-attack-buttons">
                <button class="war-attack-button" data-target="${t}" data-attack="land">زمینی</button>
                <button class="war-attack-button" data-target="${t}" data-attack="air">هوایی</button>
                <button class="war-attack-button" data-target="${t}" data-attack="navy">دریایی</button>
            </div>`;
        card.querySelectorAll("[data-attack]").forEach(b => {
            b.addEventListener("click", () => launchAttack(b.dataset.target, b.dataset.attack));
        });
        c.appendChild(card);
    });
}

function renderIncomingWars() {
    const c = document.getElementById("incoming-wars-list");
    if (!c) return;
    c.innerHTML = "";
    const wars = warsData.declared_on_me || [];
    if (!wars.length) {
        c.innerHTML = `<div class="wars-empty">هیچ جنگی علیه شما اعلام نشده.</div>`;
        return;
    }
    wars.forEach(war => {
        const a = war.attacker;
        const card = document.createElement("div");
        card.className = "war-item incoming";
        card.innerHTML = `
            <div class="war-item-top">
                <img class="war-target-flag" src="${countryImageUrl(a)}" alt="">
                <div>
                    <div class="war-item-name">حمله از ${COUNTRY_NAMES[a]}</div>
                    <div class="war-item-status danger">در خطر</div>
                </div>
            </div>
            <div class="war-hint">⚠️ این کشور می‌تواند به شما حمله کند. ارتش خود را تقویت کنید.</div>`;
        c.appendChild(card);
    });
}

function renderDeclareWarList() {
    const c = document.getElementById("declare-war-list");
    if (!c) return;
    c.innerHTML = "";

    const myWars = (warsData.declared_by_me || []).map(w => w.defender);
    const incomingWars = (warsData.declared_on_me || []).map(w => w.attacker);

    Object.keys(COUNTRY_NAMES).forEach(cid => {
        if (cid === selectedCountry) return;
        const info = countries[cid];
        if (!info?.taken) return;
        if (myWars.includes(cid)) return;

        const card = document.createElement("div");
        card.className = "war-target-card";
        const alreadyAtWar = incomingWars.includes(cid);
        let hint = "";
        if (alreadyAtWar) {
            hint = `<div class="disabled-hint">این کشور قبلاً به شما اعلام جنگ کرده. در بخش بالا ببینید.</div>`;
        }
        card.innerHTML = `
            <div class="war-target-top">
                <img class="war-target-flag" src="${countryImageUrl(cid)}" alt="">
                <span class="war-target-name">${COUNTRY_NAMES[cid]}</span>
            </div>
            ${hint}
            <button class="declare-war-button" data-target="${cid}" ${alreadyAtWar ? "disabled" : ""}>⚔️ اعلام جنگ</button>`;
        const btn = card.querySelector(".declare-war-button");
        if (!alreadyAtWar) btn.addEventListener("click", () => declareWar(cid));
        c.appendChild(card);
    });
}

async function declareWar(target) {
    if (!userId) return;
    if (!confirm(`آیا از اعلام جنگ به ${COUNTRY_NAMES[target]} مطمئنید؟`)) return;
    try {
        const r = await fetch(getApiUrl("/api/declare-war", { user_id: userId, target }));
        const data = await r.json();
        if (!r.ok || !data.success) { alert(data.message || "امکان نیست."); return; }
        alert(data.message);
        await loadWars();
        renderWarPage();
    } catch (e) { console.error(e); alert("خطا."); }
}

async function launchAttack(target, type) {
    if (!userId) return;
    if (!confirm(`حمله ${ATTACK_TYPE_NAMES[type]} به ${COUNTRY_NAMES[target]}؟`)) return;
    try {
        const r = await fetch(getApiUrl("/api/attack", { user_id: userId, target, type }));
        const data = await r.json();
        if (!r.ok || !data.success) { alert(data.message || "امکان نیست."); return; }
        alert((data.log || []).join("\n"));
        player = data.player;
        updateHomeStats();
        await loadCountries();
        await loadWars();
        renderWarPage();
    } catch (e) { console.error(e); alert("خطا."); }
}


/* ========================================================= */
/*                  DIPLOMACY                                 */
/* ========================================================= */

function openDiplomacyPage() {
    showGamePage("diplomacy");
    const s = document.getElementById("diplomacy-target");
    s.innerHTML = "";
    Object.keys(COUNTRY_NAMES).forEach(cid => {
        if (cid === selectedCountry) return;
        const o = document.createElement("option");
        o.value = cid;
        o.textContent = COUNTRY_NAMES[cid];
        s.appendChild(o);
    });
    loadDiplomacyStatus();
}

document.getElementById("diplomacy-propose-button").addEventListener("click", async () => {
    if (!userId) return;
    const target = document.getElementById("diplomacy-target").value;
    const type = document.getElementById("diplomacy-type").value;
    const duration = document.getElementById("diplomacy-duration").value;
    try {
        const r = await fetch(getApiUrl("/api/propose-treaty", {
            user_id: userId, target, type, duration_days: duration
        }));
        const data = await r.json();
        if (!r.ok || !data.success) { alert(data.message || "امکان نیست."); return; }
        alert(data.message);
        loadDiplomacyStatus();
    } catch (e) { console.error(e); }
});

async function loadDiplomacyStatus() {
    if (!userId) return;
    try {
        const r = await fetch(getApiUrl("/api/diplomacy", { user_id: userId }));
        if (!r.ok) return;
        const data = await r.json();
        renderTreatyList(data.treaties || []);
        renderSentProposals(data.sent || []);
    } catch (e) { console.error(e); }
}

function renderTreatyList(treaties) {
    const c = document.getElementById("diplomacy-treaties");
    c.innerHTML = "";
    if (!treaties.length) {
        c.innerHTML = `<div class="diplomacy-item-empty">هیچ پیمان فعالی نیست.</div>`;
        return;
    }
    treaties.forEach(t => {
        const other = t.country_a === selectedCountry ? t.country_b : t.country_a;
        const item = document.createElement("div");
        item.className = "diplomacy-item";
        item.innerHTML = `<span>${TREATY_TYPE_NAMES[t.treaty_type]} با ${COUNTRY_NAMES[other] || other}</span>`;
        c.appendChild(item);
    });
}

function renderSentProposals(sent) {
    const c = document.getElementById("diplomacy-sent");
    c.innerHTML = "";
    if (!sent.length) {
        c.innerHTML = `<div class="diplomacy-item-empty">پیشنهاد در انتظار پاسخی نیست.</div>`;
        return;
    }
    sent.forEach(p => {
        const item = document.createElement("div");
        item.className = "diplomacy-item";
        item.innerHTML = `
            <span>${TREATY_TYPE_NAMES[p.treaty_type]} به ${COUNTRY_NAMES[p.to_country] || p.to_country}</span>
            <span>در انتظار پاسخ</span>`;
        c.appendChild(item);
    });
}


/* ========================================================= */
/*                  BOTTOM NAV                                */
/* ========================================================= */

document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
        const page = item.dataset.page;
        showGamePage(page);
        document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
        item.classList.add("active");
        if (page === "home") updateHomeStats();
        if (page === "map") setTimeout(() => initWorldMap(), 30);
        if (page === "communications") { loadNews(); renderContactList(); }
    });
});


/* ========================================================= */

document.querySelectorAll(".comm-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        const tid = tab.dataset.tab;
        document.querySelectorAll(".comm-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        document.querySelectorAll(".comm-panel").forEach(p => p.classList.add("hidden"));
        const panel = document.getElementById(tid);
        if (panel) panel.classList.remove("hidden");
        if (tid === "comm-news") loadNews();
        if (tid === "comm-contacts") renderContactList();
    });
});

function renderContactList() {
    const c = document.getElementById("contact-list");
    if (!c) return;
    c.innerHTML = "";
    Object.keys(COUNTRY_NAMES).forEach(cid => {
        if (cid === selectedCountry) return;
        const item = document.createElement("div");
        item.className = "contact-item";
        item.innerHTML = `
            <div class="contact-info">
                <span class="contact-flag">${COUNTRY_FLAGS[cid]}</span>
                <span class="contact-name">${COUNTRY_NAMES[cid]}</span>
            </div>
            <button class="message-button">پیام</button>`;
        item.querySelector(".message-button").addEventListener("click", () => {
            alert(`ارسال پیام به ${COUNTRY_NAMES[cid]} به‌زودی.`);
        });
        c.appendChild(item);
    });
}

async function loadNews() {
    const c = document.getElementById("news-list");
    if (!c) return;
    try {
        const r = await fetch("/api/news");
        const news = await r.json();
        c.innerHTML = "";
        news.forEach(item => {
            const a = document.createElement("div");
            a.className = "news-item";
            a.innerHTML = `<h3>${item.title || ""}</h3><p>${item.text || ""}</p>`;
            c.appendChild(a);
        });
    } catch (e) {
        c.innerHTML = `<div class="news-item"><p>خبری نیست.</p></div>`;
    }
}


/* ========================================================= */

function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
}

function isPointVisible(lon, lat, rotation) {
    const cLon = -rotation[0], cLat = -rotation[1];
    const toRad = d => (d * Math.PI) / 180;
    const lat1 = toRad(cLat), lat2 = toRad(lat);
    const dLon = toRad(lon - cLon);
    const cd = Math.sin(lat1) * Math.sin(lat2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return cd > 0;
}


/* ========================================================= */
/*                  PREVIEW GLOBE                             */
/* ========================================================= */

async function createPreviewGlobe(containerId, svgId, selected) {
    const container = document.getElementById(containerId);
    const svgElement = document.getElementById(svgId);
    if (!container || !svgElement) return;

    const width = container.clientWidth || 300;
    const height = container.clientHeight || 300;
    const size = Math.min(width, height) * 0.46;
    const minScale = size * 0.8;
    const maxScale = size * 4;

    d3.select(svgElement).selectAll("*").remove();
    const svg = d3.select(svgElement).attr("viewBox", `0 0 ${width} ${height}`);

    const projection = d3.geoOrthographic()
        .scale(size)
        .translate([width / 2, height / 2])
        .clipAngle(90);

    const path = d3.geoPath(projection);

    let world;
    try { world = await loadWorldAtlas(); } catch (e) { return; }

    const land = topojson.feature(world, world.objects.countries);

    svg.append("path")
        .datum({ type: "Sphere" })
        .attr("fill", "#0a1622")
        .attr("stroke", "#1c2836")
        .attr("d", path);

    svg.selectAll(".country-shape")
        .data(land.features)
        .enter()
        .append("path")
        .attr("d", path)
        .attr("fill", d => {
            const cid = Number(d.id);
            if (selected && COUNTRY_IDS[selected] === cid) return "#f0b429";
            const isTaken = Object.values(countries).some(c => c.taken && COUNTRY_IDS[c.id] === cid);
            if (isTaken) return "#3978b7";
            const isGame = Object.values(COUNTRY_IDS).includes(cid);
            return isGame ? "#111820" : "#151b21";
        })
        .attr("stroke", d => {
            const cid = Number(d.id);
            return Object.values(COUNTRY_IDS).includes(cid) ? "#26313c" : "none";
        })
        .attr("stroke-width", .6);

    let rotation = projection.rotate();
    let dragging = false, pinching = false;
    let lastX = 0, lastY = 0;
    let pinchStart = 0, pinchScale = size;

    function redraw() { svg.selectAll("path").attr("d", path); }
    function autoRotate() {
        if (!dragging && !pinching) {
            rotation[0] += 0.08;
            projection.rotate(rotation);
            redraw();
        }
        requestAnimationFrame(autoRotate);
    }
    requestAnimationFrame(autoRotate);

    svgElement.addEventListener("mousedown", e => {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener("mouseup", () => { dragging = false; });
    window.addEventListener("mousemove", e => {
        if (!dragging) return;
        rotation[0] += (e.clientX - lastX) * 0.5;
        rotation[1] -= (e.clientY - lastY) * 0.5;
        rotation[1] = Math.max(-90, Math.min(90, rotation[1]));
        projection.rotate(rotation); redraw();
        lastX = e.clientX; lastY = e.clientY;
    });
    svgElement.addEventListener("wheel", e => {
        e.preventDefault();
        const cur = projection.scale();
        const next = cur * (e.deltaY > 0 ? 0.9 : 1.1);
        projection.scale(Math.max(minScale, Math.min(maxScale, next)));
        redraw();
    }, { passive: false });
    svgElement.addEventListener("touchstart", e => {
        if (e.touches.length === 2) {
            pinching = true; dragging = false;
            pinchStart = getTouchDistance(e.touches);
            pinchScale = projection.scale();
            return;
        }
        if (!e.touches.length) return;
        dragging = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
    }, { passive: true });
    svgElement.addEventListener("touchend", e => {
        dragging = false;
        if (e.touches.length < 2) pinching = false;
    }, { passive: true });
    svgElement.addEventListener("touchmove", e => {
        if (pinching && e.touches.length === 2) {
            e.preventDefault();
            const d = getTouchDistance(e.touches);
            projection.scale(Math.max(minScale, Math.min(maxScale, pinchScale * (d / pinchStart))));
            redraw();
            return;
        }
        if (!dragging || !e.touches.length) return;
        rotation[0] += (e.touches[0].clientX - lastX) * 0.5;
        rotation[1] -= (e.touches[0].clientY - lastY) * 0.5;
        rotation[1] = Math.max(-90, Math.min(90, rotation[1]));
        projection.rotate(rotation); redraw();
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        e.preventDefault();
    }, { passive: false });
}


/* ========================================================= */
/*                  WORLD MAP                                 */
/* ========================================================= */

let mapProjection = null;
let mapPath = null;
let mapSvg = null;
let mapSize = 0;
let mapMinScale = 0;
let mapMaxScale = 0;
let mapRotation = [0, 0];
let mapInitialized = false;

async function initWorldMap() {
    const box = document.querySelector(".map-box");
    const svgElement = document.getElementById("map-globe");
    if (!box || !svgElement) return;

    if (mapInitialized) {
        updateMapColors();
        redrawMap();
        return;
    }

    const width = box.clientWidth || 320;
    const height = box.clientHeight || 300;

    mapSize = Math.min(width, height) * 0.46;
    mapMinScale = mapSize * 0.8;
    mapMaxScale = mapSize * 6;
    mapRotation = [0, -10];

    let world;
    try { world = await loadWorldAtlas(); } catch (e) { return; }

    const land = topojson.feature(world, world.objects.countries);

    mapProjection = d3.geoOrthographic()
        .scale(mapSize)
        .translate([width / 2, height / 2])
        .rotate(mapRotation)
        .clipAngle(90);

    mapPath = d3.geoPath(mapProjection);
    mapSvg = d3.select(svgElement).attr("viewBox", `0 0 ${width} ${height}`);
    mapSvg.selectAll("*").remove();

    mapSvg.append("path")
        .datum({ type: "Sphere" })
        .attr("fill", "#0a1622")
        .attr("stroke", "#1c2836")
        .attr("d", mapPath);

    mapSvg.selectAll(".map-country")
        .data(land.features)
        .enter()
        .append("path")
        .attr("class", "map-country")
        .attr("d", mapPath)
        .on("click", (e, d) => { e.stopPropagation(); showCountryInfo(d); });

    mapSvg.selectAll(".map-country-label")
        .data(land.features.filter(d => Object.values(COUNTRY_IDS).includes(Number(d.id))))
        .enter()
        .append("text")
        .attr("class", "map-country-label")
        .attr("text-anchor", "middle")
        .text(d => {
            const entry = Object.entries(COUNTRY_IDS).find(([, id]) => id === Number(d.id));
            return entry ? COUNTRY_NAMES[entry[0]] : "";
        });

    mapSvg.selectAll(".map-ocean-label")
        .data(OCEAN_LABELS)
        .enter()
        .append("text")
        .attr("class", "map-ocean-label")
        .attr("text-anchor", "middle")
        .text(d => d[2]);

    mapSvg.selectAll(".map-strait-dot")
        .data(STRAITS)
        .enter()
        .append("circle")
        .attr("class", "map-strait-dot")
        .attr("r", 2.6)
        .on("click", (e, d) => { e.stopPropagation(); showStraitInfo(d); });

    updateMapColors();
    redrawMap();
    attachMapInteractions(svgElement);

    document.getElementById("map-zoom-in").addEventListener("click", () => zoomMap(1.35));
    document.getElementById("map-zoom-out").addEventListener("click", () => zoomMap(1 / 1.35));
    document.getElementById("map-reset").addEventListener("click", () => {
        mapProjection.scale(mapSize);
        mapRotation = [0, -10];
        mapProjection.rotate(mapRotation);
        redrawMap();
    });
    document.getElementById("map-info-close").addEventListener("click", () => {
        document.getElementById("map-info-panel").classList.add("hidden");
    });

    mapInitialized = true;
}

function zoomMap(factor) {
    const cur = mapProjection.scale();
    mapProjection.scale(Math.max(mapMinScale, Math.min(mapMaxScale, cur * factor)));
    redrawMap();
}

function attachMapInteractions(svgElement) {
    let dragging = false, pinching = false;
    let lastX = 0, lastY = 0;
    let pinchStart = 0, pinchScale = mapSize;

    svgElement.addEventListener("mousedown", e => {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener("mouseup", () => { dragging = false; });
    window.addEventListener("mousemove", e => {
        if (!dragging) return;
        mapRotation[0] += (e.clientX - lastX) * 0.4;
        mapRotation[1] -= (e.clientY - lastY) * 0.4;
        mapRotation[1] = Math.max(-90, Math.min(90, mapRotation[1]));
        mapProjection.rotate(mapRotation); redrawMap();
        lastX = e.clientX; lastY = e.clientY;
    });
    svgElement.addEventListener("wheel", e => {
        e.preventDefault();
        zoomMap(e.deltaY > 0 ? 0.9 : 1.1);
    }, { passive: false });
    svgElement.addEventListener("touchstart", e => {
        if (e.touches.length === 2) {
            pinching = true; dragging = false;
            pinchStart = getTouchDistance(e.touches);
            pinchScale = mapProjection.scale();
            return;
        }
        if (!e.touches.length) return;
        dragging = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
    }, { passive: true });
    svgElement.addEventListener("touchend", e => {
        dragging = false;
        if (e.touches.length < 2) pinching = false;
    }, { passive: true });
    svgElement.addEventListener("touchmove", e => {
        if (pinching && e.touches.length === 2) {
            e.preventDefault();
            const d = getTouchDistance(e.touches);
            mapProjection.scale(Math.max(mapMinScale, Math.min(mapMaxScale, pinchScale * (d / pinchStart))));
            redrawMap();
            return;
        }
        if (!dragging || !e.touches.length) return;
        mapRotation[0] += (e.touches[0].clientX - lastX) * 0.4;
        mapRotation[1] -= (e.touches[0].clientY - lastY) * 0.4;
        mapRotation[1] = Math.max(-90, Math.min(90, mapRotation[1]));
        mapProjection.rotate(mapRotation); redrawMap();
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        e.preventDefault();
    }, { passive: false });
}

function redrawMap() {
    if (!mapSvg || !mapProjection) return;
    const rotation = mapProjection.rotate();
    const zoomRatio = mapProjection.scale() / mapSize;

    mapSvg.selectAll("path.map-country").attr("d", mapPath);

    const fs = Math.min(11, 6.5 * (1 + (zoomRatio - 1) * 0.25));

    mapSvg.selectAll(".map-ocean-label")
        .style("font-size", `${fs}px`)
        .attr("opacity", d => isPointVisible(d[0], d[1], rotation) ? 1 : 0)
        .attr("x", d => { const p = mapProjection([d[0], d[1]]); return p ? p[0] : -9999; })
        .attr("y", d => { const p = mapProjection([d[0], d[1]]); return p ? p[1] : -9999; });

    mapSvg.selectAll(".map-country-label")
        .attr("x", d => { const c = mapPath.centroid(d); return isNaN(c[0]) ? -9999 : c[0]; })
        .attr("y", d => { const c = mapPath.centroid(d); return isNaN(c[1]) ? -9999 : c[1]; })
        .attr("opacity", d => { const c = mapPath.centroid(d); return isNaN(c[0]) ? 0 : 1; });

    mapSvg.selectAll(".map-strait-dot")
        .attr("opacity", d => isPointVisible(d.lon, d.lat, rotation) ? 1 : 0)
        .attr("cx", d => { const p = mapProjection([d.lon, d.lat]); return p ? p[0] : -9999; })
        .attr("cy", d => { const p = mapProjection([d.lon, d.lat]); return p ? p[1] : -9999; });
}

function updateMapColors() {
    if (!mapSvg) return;
    mapSvg.selectAll(".map-country")
        .attr("fill", d => {
            const cid = Number(d.id);
            const entry = Object.entries(COUNTRY_IDS).find(([, id]) => id === cid);
            if (!entry) return "#151b21";
            const key = entry[0];
            const info = countries[key];

            if (info?.occupied_by) {
                if (info.occupied_by === selectedCountry) return "#e8b355";
                if (key === selectedCountry) return "#a33";
                return "#4a90e2";
            }

            if (key === selectedCountry) return "#d98a25";
            if (info?.taken) return "#3978b7";
            return "#1c2733";
        })
        .attr("stroke", d => {
            const cid = Number(d.id);
            return Object.values(COUNTRY_IDS).includes(cid) ? "#2d3a48" : "#141c25";
        })
        .attr("stroke-width", .6);
}

function showCountryInfo(feature) {
    const cid = Number(feature.id);
    const entry = Object.entries(COUNTRY_IDS).find(([, id]) => id === cid);

    const panel = document.getElementById("map-info-panel");
    const flagEl = document.getElementById("map-info-flag");
    const nameEl = document.getElementById("map-info-name");
    const statusEl = document.getElementById("map-info-status");
    const descEl = document.getElementById("map-info-desc");

    if (!entry) {
        flagEl.textContent = "🏳️";
        nameEl.textContent = "منطقه غیرقابل‌بازی";
        statusEl.textContent = "بی‌صاحب";
        descEl.textContent = "این منطقه در بازی کنترل نمی‌شود.";
        panel.classList.remove("hidden");
        return;
    }

    const key = entry[0];
    const info = countries[key];

    flagEl.textContent = COUNTRY_FLAGS[key];
    nameEl.textContent = COUNTRY_NAMES[key];

    if (info?.occupied_by) {
        const occ = COUNTRY_NAMES[info.occupied_by] || info.occupied_by;
        statusEl.textContent = `تحت اشغال ${occ}`;
        descEl.textContent = `این کشور توسط ${occ} تصرف شده است.`;
    } else if (key === selectedCountry) {
        statusEl.textContent = "کشور شما";
        descEl.textContent = "این کشور تحت فرماندهی شماست.";
    } else if (info?.taken) {
        statusEl.textContent = "در اختیار بازیکن دیگر";
        descEl.textContent = "این کشور توسط بازیکن دیگری کنترل می‌شود.";
    } else {
        statusEl.textContent = "بی‌صاحب";
        descEl.textContent = "هنوز بازیکنی این کشور را انتخاب نکرده است.";
    }

    panel.classList.remove("hidden");
}

function showStraitInfo(strait) {
    document.getElementById("map-info-flag").textContent = "⚓";
    document.getElementById("map-info-name").textContent = strait.name;
    document.getElementById("map-info-status").textContent = "تنگه راهبردی";
    document.getElementById("map-info-desc").textContent = strait.desc;
    document.getElementById("map-info-panel").classList.remove("hidden");
}


/* ========================================================= */

(async function init() {
    showOnly("loading");

    const start = Date.now();

    await loadCountries();
    await loadPlayer();

    const elapsed = Date.now() - start;
    if (elapsed < 1000) await new Promise(r => setTimeout(r, 1000 - elapsed));

    if (player?.country) {
        selectedCountry = player.country;
        showGame();
    } else {
        showCountrySelection();
    }
})();
