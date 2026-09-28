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
let mapInitialized = false;
let mapZoom = null;
let mapSvg = null;
let mapProjection = null;
let mapRoot = null;

let currentCommunicationTab = "statements";
let currentMarketTab = "orders";
let currentDiplomacyTab = "treaties";
let selectedMessageCountry = null;

const ADMIN_ID = "8900923747";

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
germany: "🇩🇪",
britain: "🇬🇧",
ussr: "☭",
usa: "🇺🇸",
france: "🇫🇷",
italy: "🇮🇹",
china: "🇨🇳",
japan: "🇯🇵"
};

const COUNTRY_NAMES = {
germany: "آلمان",
britain: "بریتانیا",
ussr: "شوروی",
usa: "آمریکا",
france: "فرانسه",
italy: "ایتالیا",
china: "چین",
japan: "ژاپن"
};

const COUNTRY_IDS = {
germany: 276,
britain: 826,
ussr: 643,
usa: 840,
france: 250,
italy: 380,
china: 156,
japan: 392
};

const RESOURCE_NAMES = {
food: "غذا",
steel: "فولاد",
uranium: "اورانیوم",
oil: "نفت"
};

const RESOURCE_ICONS = {
food: "🌾",
steel: "⚙️",
uranium: "☢️",
oil: "🛢️"
};

const GROUP_ICONS = {
land: "🪖",
naval: "⚓",
air: "✈️"
};

const GROUP_TITLES = {
land: "نیروی زمینی",
naval: "نیروی دریایی",
air: "نیروی هوایی"
};

const TREATY_TYPE_NAMES = {
alliance: "پیمان اتحاد",
non_aggression: "پیمان عدم تجاوز"
};

const ATTACK_TYPE_NAMES = {
land: "زمینی",
air: "هوایی",
navy: "دریایی"
};

const OCEAN_LABELS = [
[-40, 25, "اقیانوس اطلس"],
[-150, 0, "اقیانوس آرام"],
[75, -20, "اقیانوس هند"],
[90, 65, "اقیانوس منجمد شمالی"],
[20, -60, "اقیانوس منجمد جنوبی"]
];

const STRAITS = [
{
lon: -5.6,
lat: 35.9,
name: "تنگه جبل‌الطارق",
desc: "اتصال مدیترانه به اقیانوس اطلس."
},
{
lon: 29.0,
lat: 41.1,
name: "تنگه بسفر",
desc: "مسیر راهبردی دریای سیاه."
},
{
lon: 56.3,
lat: 26.6,
name: "تنگه هرمز",
desc: "مسیر راهبردی انتقال نفت."
},
{
lon: 43.3,
lat: 12.6,
name: "باب‌المندب",
desc: "دروازه دریای سرخ."
},
{
lon: 32.3,
lat: 30.6,
name: "کانال سوئز",
desc: "مسیر راهبردی اروپا و آسیا."
},
{
lon: 1.4,
lat: 50.9,
name: "تنگه دوور",
desc: "مسیر دریایی بریتانیا و اروپا."
},
{
lon: -79.6,
lat: 9.1,
name: "کانال پاناما",
desc: "اتصال اقیانوس اطلس و آرام."
},
{
lon: 103.8,
lat: 1.3,
name: "تنگه مالاکا",
desc: "یکی از مهم‌ترین مسیرهای تجاری آسیا."
},
{
lon: 121.0,
lat: 24.0,
name: "تنگه تایوان",
desc: "آبراه راهبردی شرق آسیا."
},
{
lon: 129.9,
lat: 34.0,
name: "تنگه کره",
desc: "مسیر راهبردی شرق آسیا."
}
];

const RESOURCE_SITES = [
{
id: "hormuz-oil",
type: "oil",
name: "میدان نفتی هرمز",
lon: 56.2,
lat: 26.5,
production: 1800,
travelHours: 2
},
{
id: "north-sea-oil",
type: "oil",
name: "سکوهای نفتی دریای شمال",
lon: 2.5,
lat: 57.5,
production: 1500,
travelHours: 2
},
{
id: "persian-oil",
type: "oil",
name: "سکوهای خلیج فارس",
lon: 51.5,
lat: 27.0,
production: 1700,
travelHours: 2
},
{
id: "baku-oil",
type: "oil",
name: "میدان نفتی باکو",
lon: 50.0,
lat: 40.0,
production: 1300,
travelHours: 2
},
{
id: "sweden-steel",
type: "steel",
name: "معادن فولاد اسکاندیناوی",
lon: 17.5,
lat: 60.5,
production: 1100,
travelHours: 2
},
{
id: "central-europe-steel",
type: "steel",
name: "معادن فولاد اروپای مرکزی",
lon: 18.5,
lat: 49.0,
production: 1200,
travelHours: 2
},
{
id: "congo-uranium",
type: "uranium",
name: "معادن اورانیوم آفریقا",
lon: 23.0,
lat: -4.0,
production: 600,
travelHours: 2
},
{
id: "canada-uranium",
type: "uranium",
name: "معادن اورانیوم کانادا",
lon: -105.0,
lat: 57.0,
production: 650,
travelHours: 2
}
];

let ARMY_UNITS = {};

function countryImageUrl(country) {
const ext = COUNTRY_IMAGE_EXT[country] || "jpg";
return /images/countries/${country}.${ext};
}

function getApiUrl(path, params = {}) {
const url = new URL(path, window.location.origin);

Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
    }
});

return url.toString();

}

function formatNumber(value) {
const number = Number(value || 0);

return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
}).format(Math.round(number));

}

function formatMoney(value) {
return $${formatNumber(value)};
}

function formatDate(value) {
if (!value) return "";

const date = new Date(value);

if (Number.isNaN(date.getTime())) {
    return "";
}

return date.toLocaleString("fa-IR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
});

}

function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&")
.replaceAll("<", "<")
.replaceAll(">", ">")
.replaceAll('"', """)
.replaceAll("'", "'");
}

function showOnly(id) {
document.querySelectorAll(".screen").forEach(screen => {
screen.classList.add("hidden");
});

const target = document.getElementById(id);

if (target) {
    target.classList.remove("hidden");
}

}

function showGamePage(page) {
document.querySelectorAll(".game-page").forEach(item => {
item.classList.add("hidden");
});

const target = document.getElementById(`page-${page}`);

if (target) {
    target.classList.remove("hidden");
}

}

function showToast(message, type = "normal") {
let container = document.querySelector(".toast-container");

if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
}

const toast = document.createElement("div");
toast.className = `toast ${type}`;
toast.textContent = message;

container.appendChild(toast);

setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";

    setTimeout(() => {
        toast.remove();
    }, 220);
}, 2800);

}

function openModal({
title,
icon = "ℹ️",
html = "",
buttons = []
}) {
const old = document.querySelector(".modal-overlay");

if (old) {
    old.remove();
}

const overlay = document.createElement("div");
overlay.className = "modal-overlay";

const box = document.createElement("div");
box.className = "modal-box";

const actions = buttons
    .map(button => `
        <button
            class="modal-action ${button.primary ? "primary" : ""}"
            data-modal-action="${escapeHtml(button.id)}"
            ${button.disabled ? "disabled" : ""}
        >
            ${escapeHtml(button.text)}
        </button>
    `)
    .join("");

box.innerHTML = `
    <button class="modal-close" data-modal-close>×</button>

    <div class="modal-icon">${icon}</div>

    <h3>${escapeHtml(title)}</h3>

    <div class="modal-body">
        ${html}
    </div>

    ${
        actions
            ? `<div class="modal-actions">${actions}</div>`
            : ""
    }
`;

overlay.appendChild(box);
document.body.appendChild(overlay);

box.querySelector("[data-modal-close]")
    ?.addEventListener("click", () => overlay.remove());

overlay.addEventListener("click", event => {
    if (event.target === overlay) {
        overlay.remove();
    }
});

buttons.forEach(button => {
    const element = box.querySelector(
        `[data-modal-action="${CSS.escape(button.id)}"]`
    );

    element?.addEventListener("click", async () => {
        if (button.handler) {
            await button.handler(box, overlay);
        }

        if (button.close !== false) {
            overlay.remove();
        }
    });
});

return {
    overlay,
    box,
    close: () => overlay.remove()
};

}

function askText(title, placeholder = "", defaultValue = "") {
return new Promise(resolve => {
const modal = openModal({
title,
icon: "✍️",
html: <input class="modal-input" id="modal-text-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}" maxlength="1000" > ,
buttons: [
{
id: "cancel",
text: "انصراف"
},
{
id: "submit",
text: "تأیید",
primary: true,
handler: box => {
const input =
box.querySelector("#modal-text-input");

                    resolve(input?.value?.trim() || null);
                }
            }
        ]
    });

    modal.box
        .querySelector("#modal-text-input")
        ?.focus();
});

}

async function api(path, options = {}) {
const method = options.method || "GET";
const body = options.body;

const headers = {
    ...(options.headers || {})
};

let finalBody = body;

if (
    body &&
    typeof body === "object" &&
    !(body instanceof FormData)
) {
    headers["Content-Type"] = "application/json";
    finalBody = JSON.stringify(body);
}

const url = new URL(path, window.location.origin);

if (userId) {
    url.searchParams.set("user_id", userId);
}

const response = await fetch(url.toString(), {
    method,
    headers,
    body: finalBody
});

let data = null;

try {
    data = await response.json();
} catch {
    data = {};
}

if (!response.ok) {
    throw new Error(
        data?.detail ||
        data?.message ||
        "خطا در ارتباط با سرور"
    );
}

if (data?.ok === false) {
    throw new Error(
        data?.detail ||
        data?.message ||
        "عملیات انجام نشد"
    );
}

return data;

}

/* =========================================================
PLAYER
========================================================= */

async function loadPlayer() {
try {
const data = await api("/api/player");

    player = data.player || data;

    if (player?.country) {
        selectedCountry = player.country;
    }

    return player;
} catch (error) {
    console.error(error);
    player = null;
    return null;
}

}

async function refreshPlayer() {
return loadPlayer();
}

function stopStatsPolling() {
if (statsInterval) {
clearInterval(statsInterval);
statsInterval = null;
}
}

function startStatsPolling() {
stopStatsPolling();

statsInterval = setInterval(async () => {
    if (!player?.country) return;

    try {
        await refreshPlayer();

        const activePage =
            document.querySelector(".game-page:not(.hidden)")?.id;

        if (activePage === "page-home") {
            updateHomeStats();
        }
    } catch (error) {
        console.error(error);
    }
}, 30000);

}

/* =========================================================
COUNTRIES
========================================================= */

async function loadCountries() {
try {
const data = await api("/api/countries");

    countries = data.countries || data || {};

    updateCountryCards();

    return countries;
} catch (error) {
    console.error(error);

    showToast(
        "دریافت اطلاعات کشورها انجام نشد.",
        "error"
    );

    return {};
}

}

function updateCountryCards() {
document
.querySelectorAll("[data-country-card]")
.forEach(card => {
const country = card.dataset.country;

        const data = countries[country];

        const taken =
            Boolean(data?.taken) ||
            Boolean(data?.player_id) ||
            Boolean(data?.owner);

        card.classList.toggle("taken", taken);

        const status =
            card.querySelector(".country-status");

        if (status) {
            status.textContent = taken
                ? "انتخاب شده"
                : "آزاد";
        }
    });

}

function showCountrySelection() {
stopStatsPolling();
showOnly("country");

updateCountryCards();

}

async function selectCountry(country) {
if (!country) return;

const info = countries[country];

if (
    info?.taken &&
    info?.player_id &&
    String(info.player_id) !== String(userId)
) {
    showToast(
        "این کشور قبلاً توسط بازیکن دیگری انتخاب شده است.",
        "error"
    );

    return;
}

try {
    const data = await api("/api/select-country", {
        method: "POST",
        body: {
            country
        }
    });

    if (data?.ok === false) {
        throw new Error(
            data.message ||
            "انتخاب کشور انجام نشد."
        );
    }

    selectedCountry = country;

    await refreshPlayer();
    await loadCountries();

    showCountryPreview(country);
} catch (error) {
    showToast(
        error.message ||
        "انتخاب کشور انجام نشد.",
        "error"
    );

    await loadCountries();
}

}

function renderPreviewInfo(country) {
const data = countries[country] || {};
const flag = COUNTRY_FLAGS[country] || "🏳️";
const name =
data.name ||
COUNTRY_NAMES[country] ||
country;

const flagElement =
    document.getElementById("preview-flag");

const nameElement =
    document.getElementById("preview-country-name");

if (flagElement) {
    flagElement.textContent = flag;
}

if (nameElement) {
    nameElement.textContent = name;
}

const economy =
    document.getElementById("preview-economy");

const army =
    document.getElementById("preview-army");

const population =
    document.getElementById("preview-population");

if (economy) {
    economy.textContent =
        formatMoney(
            data.economy ||
            data.money ||
            0
        );
}

if (army) {
    army.textContent =
        formatNumber(
            data.army ||
            data.army_power ||
            0
        );
}

if (population) {
    population.textContent =
        formatNumber(
            data.population ||
            0
        );
}

}

function showCountryPreview(country) {
selectedCountry = country;

showOnly("country-preview");

renderPreviewInfo(country);

setTimeout(() => {
    initPreviewGlobe(country);
}, 40);

}

/* =========================================================
PREVIEW GLOBE
========================================================= */

async function loadWorldAtlas() {
if (worldData) {
return worldData;
}

const response = await fetch(
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
);

if (!response.ok) {
    throw new Error("نقشه جهان بارگذاری نشد.");
}

worldData = await response.json();

return worldData;

}

async function initPreviewGlobe(country) {
const container =
document.getElementById("preview-globe");

if (!container) return;

container.innerHTML = "";

try {
    const atlas = await loadWorldAtlas();

    const width =
        container.clientWidth || 350;

    const height =
        container.clientHeight || 350;

    const svg = d3
        .select(container)
        .append("svg")
        .attr("class", "globe")
        .attr("viewBox", `0 0 ${width} ${height}`);

    const projection =
        d3.geoOrthographic()
            .scale(Math.min(width, height) * 0.45)
            .translate([width / 2, height / 2])
            .clipAngle(90);

    const path = d3.geoPath(projection);

    const sphere = svg
        .append("circle")
        .attr("cx", width / 2)
        .attr("cy", height / 2)
        .attr("r", projection.scale())
        .attr("fill", "#0b2634")
        .attr("stroke", "rgba(255,255,255,.12)");

    const countriesGeo =
        topojson.feature(
            atlas,
            atlas.objects.countries
        );

    const countryId =
        COUNTRY_IDS[country];

    const countryFeature =
        countriesGeo.features.find(
            feature =>
                Number(feature.id) ===
                Number(countryId)
        );

    svg.append("g")
        .selectAll("path")
        .data(countriesGeo.features)
        .join("path")
        .attr("d", path)
        .attr("fill", feature => {
            if (
                countryFeature &&
                feature === countryFeature
            ) {
                return "#dcae45";
            }

            return "#101c24";
        })
        .attr("stroke", "rgba(255,255,255,.08)")
        .attr("stroke-width", 0.5);

    let rotation = 0;
    let timer = null;

    if (countryFeature) {
        const centroid =
            d3.geoCentroid(countryFeature);

        rotation = -centroid[0];

        projection.rotate([
            rotation,
            -centroid[1]
        ]);

        svg.selectAll("path")
            .attr("d", path);
    }

    timer = d3.timer(elapsed => {
        if (!document.getElementById("country-preview") ||
            document.getElementById("country-preview").classList.contains("hidden")) {
            timer.stop();
            return;
        }

        rotation += 0.012;

        const current =
            projection.rotate();

        projection.rotate([
            current[0] + 0.012,
            current[1]
        ]);

        svg.selectAll("path")
            .attr("d", path);
    });

    const drag =
        d3.drag()
            .on("start", () => {
                if (timer) timer.stop();
            })
            .on("drag", event => {
                const rotate =
                    projection.rotate();

                projection.rotate([
                    rotate[0] +
                        event.dx * 0.45,
                    rotate[1] -
                        event.dy * 0.45
                ]);

                svg.selectAll("path")
                    .attr("d", path);
            });

    svg.call(drag);

    svg.on("wheel", event => {
        event.preventDefault();

        const scale =
            projection.scale();

        const next =
            scale *
            (event.deltaY < 0 ? 1.08 : 0.92);

        projection.scale(
            Math.max(
                Math.min(width, height) * 0.25,
                Math.min(
                    Math.min(width, height) * 0.62,
                    next
                )
            )
        );

        sphere
            .attr("r", projection.scale());

        svg.selectAll("path")
            .attr("d", path);
    });
} catch (error) {
    console.error(error);

    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">🌍</div>
            <strong>نقشه بارگذاری نشد</strong>
            <p>اتصال اینترنت یا منبع نقشه را بررسی کنید.</p>
        </div>
    `;
}

}

/* =========================================================
SHOW GAME
========================================================= */

function showGame() {
if (!player?.country) {
showCountrySelection();
return;
}

showOnly("game");

updateHeader();

showGamePage("home");

updateHomeStats();

startStatsPolling();

}

function updateHeader() {
const country =
player?.country ||
selectedCountry;

const flag =
    COUNTRY_FLAGS[country] ||
    "🏳️";

const element =
    document.getElementById("header-country-flag");

if (element) {
    element.textContent = flag;
}

const title =
    document.getElementById("header-country-name");

if (title) {
    title.textContent =
        COUNTRY_NAMES[country] ||
        country ||
        "کشور";
}

}

/* =========================================================
HOME
========================================================= */

function updateText(id, value) {
const element = document.getElementById(id);

if (element) {
    element.textContent = value;
}

}

function updateHomeStats() {
if (!player) return;

const money =
    player.money ??
    player.treasury ??
    0;

const income =
    player.daily_income ??
    player.income ??
    0;

const manpower =
    player.manpower ??
    0;

const manpowerProduction =
    player.daily_manpower ??
    player.manpower_production ??
    0;

const power =
    player.power ??
    player.electricity ??
    0;

const powerConsumption =
    player.power_consumption ??
    player.electricity_consumption ??
    0;

const armyPower =
    player.army_power ??
    player.military_power ??
    player.army ??
    0;

updateText(
    "home-money",
    formatMoney(money)
);

updateText(
    "home-income",
    `+${formatMoney(income)} روزانه`
);

updateText(
    "home-manpower",
    formatNumber(manpower)
);

updateText(
    "home-manpower-income",
    `+${formatNumber(manpowerProduction)} روزانه`
);

updateText(
    "home-power",
    formatNumber(power)
);

updateText(
    "home-power-consumption",
    `مصرف ${formatNumber(powerConsumption)}`
);

updateText(
    "home-army-power",
    formatNumber(armyPower)
);

updateText(
    "home-season",
    player.season ||
    "زمستان ۱۹۳۹"
);

updateText(
    "home-country-name",
    COUNTRY_NAMES[player.country] ||
    player.country
);

updateText(
    "home-country-flag",
    COUNTRY_FLAGS[player.country] ||
    "🏳️"
);

updateResourceUI();
updateRankings();

}

function updateResourceUI() {
const resources =
player?.resources || {};

Object.keys(RESOURCE_NAMES)
    .forEach(resource => {
        const element =
            document.getElementById(
                `resource-${resource}`
            );

        if (element) {
            element.textContent =
                formatNumber(
                    resources[resource] || 0
                );
        }
    });

}

/* =========================================================
RANKINGS
========================================================= */

async function updateRankings() {
try {
const data =
await api("/api/rankings");

    const rankings =
        data.rankings ||
        data ||
        {};

    const map = {
        overall: "rank-overall",
        economic: "rank-economic",
        military: "rank-military",
        diplomacy: "rank-diplomacy",
        development: "rank-development"
    };

    Object.entries(map)
        .forEach(([key, id]) => {
            const item =
                rankings[key];

            const element =
                document.getElementById(id);

            if (!element) return;

            if (
                item &&
                typeof item === "object"
            ) {
                element.textContent =
                    item.rank
                        ? `#${item.rank}`
                        : "—";
            } else {
                element.textContent =
                    item
                        ? `#${item}`
                        : "—";
            }
        });

    const info =
        document.getElementById(
            "rank-info"
        );

    if (info) {
        info.textContent =
            rankings.info ||
            "رتبه‌ها بر اساس وضعیت فعلی کشورها محاسبه می‌شوند.";
    }
} catch (error) {
    console.warn(
        "rankings:",
        error.message
    );
}

}

/* =========================================================
INFRASTRUCTURE
========================================================= */

function renderResourceBars() {
const resources =
player?.resources || {};

Object.entries(RESOURCE_NAMES)
    .forEach(([key, name]) => {
        const value =
            Number(resources[key] || 0);

        const element =
            document.querySelector(
                `[data-resource-value="${key}"]`
            );

        if (element) {
            element.textContent =
                formatNumber(value);
        }

        const bar =
            document.querySelector(
                `[data-resource-bar="${key}"]`
            );

        if (bar) {
            const percent =
                Math.max(
                    0,
                    Math.min(
                        100,
                        value / 300000 * 100
                    )
                );

            bar.style.width =
                `${percent}%`;
        }
    });

}

function costText(cost = {}) {
return Object.entries(cost)
.map(([resource, value]) => {
return ${RESOURCE_ICONS[resource] || ""} ${formatNumber(value)};
})
.join(" • ");
}

async function openInfrastructure() {
showGamePage("infrastructure");

renderResourceBars();

const container =
    document.getElementById(
        "infrastructure-list"
    );

if (!container) return;

try {
    const data =
        await api("/api/infrastructure");

    const items =
        data.infrastructure ||
        data.items ||
        [];

    if (!items.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🏗️</div>
                <strong>زیرساختی برای نمایش وجود ندارد</strong>
                <p>بعداً دوباره بررسی کنید.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        items.map(renderInfrastructureCard)
            .join("");
} catch (error) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <strong>خطا در دریافت زیرساخت</strong>
            <p>${escapeHtml(error.message)}</p>
        </div>
    `;
}

}

function renderInfrastructureCard(item) {
const locked =
Boolean(item.locked);

return `
    <div class="upgrade-card ${locked ? "locked" : ""}">
        <div class="upgrade-card-header">
            <div class="upgrade-card-title">
                <div class="upgrade-card-icon">
                    ${item.icon || "🏗️"}
                </div>

                <div>
                    <strong>
                        ${escapeHtml(item.name || "زیرساخت")}
                    </strong>

                    <small>
                        سطح ${formatNumber(item.level || 0)}
                    </small>
                </div>
            </div>

            <div class="level-badge">
                ${locked ? "🔒 قفل" : "فعال"}
            </div>
        </div>

        <div class="upgrade-card-description">
            ${escapeHtml(
                item.description ||
                "ارتقای این زیرساخت ظرفیت کشور را افزایش می‌دهد."
            )}
        </div>

        ${
            item.cost
                ? `
                    <div class="cost-row">
                        <div class="cost-pill">
                            ${costText(item.cost)}
                        </div>
                    </div>
                `
                : ""
        }

        ${
            locked && item.requirement
                ? `
                    <div class="info-box">
                        🔒 شرط باز شدن:
                        ${escapeHtml(item.requirement)}
                    </div>
                `
                : ""
        }

        <button
            class="upgrade-button"
            ${locked ? "disabled" : ""}
            data-infra-upgrade="${escapeHtml(item.id || "")}"
        >
            ${locked ? "قفل است" : "ارتقا"}
        </button>
    </div>
`;

}

async function upgradeInfrastructure(id) {
if (!id) return;

try {
    const data =
        await api("/api/upgrade-infra", {
            method: "POST",
            body: {
                infrastructure: id
            }
        });

    showToast(
        data.message ||
        "زیرساخت ارتقا یافت.",
        "success"
    );

    await refreshPlayer();

    openInfrastructure();
} catch (error) {
    showToast(
        error.message ||
        "ارتقا انجام نشد.",
        "error"
    );
}

}

/* =========================================================
ECONOMY
========================================================= */

async function openEconomy() {
showGamePage("economy");

const container =
    document.getElementById(
        "economy-container"
    );

if (!container) return;

try {
    const data =
        await api("/api/economy");

    const economy =
        data.economy ||
        data;

    container.innerHTML = `
        <div class="economy-overview">

            <div class="economy-stat">
                <span>خزانه</span>
                <strong>
                    ${formatMoney(
                        economy.money ??
                        player?.money ??
                        0
                    )}
                </strong>
            </div>

            <div class="economy-stat">
                <span>درآمد روزانه</span>
                <strong>
                    +${formatMoney(
                        economy.daily_income ??
                        player?.daily_income ??
                        0
                    )}
                </strong>
            </div>

            <div class="economy-stat">
                <span>تولید غذا</span>
                <strong>
                    +${formatNumber(
                        economy.food_production ??
                        0
                    )}
                </strong>
            </div>

            <div class="economy-stat">
                <span>سطح اقتصاد</span>
                <strong>
                    ${formatNumber(
                        economy.level ??
                        0
                    )}
                </strong>
            </div>

        </div>

        <div class="economy-upgrade">
            <div class="section-heading">
                <div>
                    <span class="eyebrow">ECONOMY</span>
                    <h2>توسعه اقتصادی</h2>
                </div>
            </div>

            <p>
                توسعه اقتصاد درآمد روزانه کشور را افزایش می‌دهد.
                هزینه و شرط ارتقا بر اساس سطح فعلی محاسبه می‌شود.
            </p>

            <button
                class="primary-button"
                id="economy-upgrade-button"
                style="margin-top:12px"
            >
                💰 ارتقای اقتصاد
            </button>
        </div>
    `;

    document
        .getElementById(
            "economy-upgrade-button"
        )
        ?.addEventListener(
            "click",
            upgradeEconomy
        );
} catch (error) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <strong>خطا در اقتصاد</strong>
            <p>${escapeHtml(error.message)}</p>
        </div>
    `;
}

}

async function upgradeEconomy() {
try {
const data =
await api("/api/upgrade-economy", {
method: "POST"
});

    showToast(
        data.message ||
        "اقتصاد ارتقا یافت.",
        "success"
    );

    await refreshPlayer();
    openEconomy();
} catch (error) {
    showToast(
        error.message ||
        "ارتقای اقتصاد انجام نشد.",
        "error"
    );
}

}

/* =========================================================
ARMY
========================================================= */

async function loadArmyCatalog() {
try {
const data =
await api("/api/army-units");

    ARMY_UNITS =
        data.units ||
        data.army ||
        data ||
        {};

    return ARMY_UNITS;
} catch (error) {
    console.error(
        "army catalog:",
        error
    );

    ARMY_UNITS = {};

    return {};
}

}

async function openArmyPage() {
showGamePage("army");

const container =
    document.getElementById(
        "army-container"
    );

if (!container) return;

try {
    const data =
        await api("/api/army");

    const units =
        data.units ||
        data.army ||
        [];

    const totals =
        data.totals ||
        {};

    const allUnits =
        Array.isArray(units)
            ? units
            : Object.values(units);

    const grouped = {
        land: allUnits.filter(
            item => item.group === "land"
        ),
        naval: allUnits.filter(
            item => item.group === "naval"
        ),
        air: allUnits.filter(
            item => item.group === "air"
        )
    };

    container.innerHTML = `
        <div class="army-summary">
            <div class="army-summary-item">
                <span>زمینی</span>
                <strong>
                    ${formatNumber(totals.land || 0)}
                </strong>
            </div>

            <div class="army-summary-item">
                <span>دریایی</span>
                <strong>
                    ${formatNumber(totals.naval || 0)}
                </strong>
            </div>

            <div class="army-summary-item">
                <span>هوایی</span>
                <strong>
                    ${formatNumber(totals.air || 0)}
                </strong>
            </div>
        </div>

        ${renderArmyGroup(
            "land",
            grouped.land
        )}

        ${renderArmyGroup(
            "naval",
            grouped.naval
        )}

        ${renderArmyGroup(
            "air",
            grouped.air
        )}
    `;
} catch (error) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">🪖</div>
            <strong>اطلاعات ارتش دریافت نشد</strong>
            <p>${escapeHtml(error.message)}</p>
        </div>
    `;
}

}

function renderArmyGroup(group, units) {
return `
<section class="army-group">

        <div class="army-group-header">
            <div class="army-group-header-icon">
                ${GROUP_ICONS[group]}
            </div>

            <div>
                <h3>${GROUP_TITLES[group]}</h3>
                <p>
                    ${
                        group === "land"
                            ? "پیاده‌نظام و تانک"
                            : group === "naval"
                                ? "ناو و زیردریایی"
                                : "جنگنده و بمب‌افکن"
                    }
                </p>
            </div>
        </div>

        <div class="unit-list">
            ${
                units.length
                    ? units.map(renderUnitCard).join("")
                    : `
                        <div class="empty-state">
                            <strong>
                                واحدی در این بخش وجود ندارد
                            </strong>
                        </div>
                    `
            }
        </div>

    </section>
`;

}

function renderUnitCard(unit) {
const locked =
Boolean(unit.locked);

return `
    <div class="unit-card ${locked ? "locked" : ""}">

        <div class="unit-card-header">

            <div class="unit-icon">
                ${unit.icon || "🪖"}
            </div>

            <div>
                <strong>
                    ${escapeHtml(unit.name || "واحد")}
                </strong>

                <small>
                    ${escapeHtml(
                        unit.description ||
                        "واحد نظامی"
                    )}
                </small>
            </div>

            <div class="unit-count">
                <strong>
                    ${formatNumber(unit.count || 0)}
                </strong>
                <small>موجود</small>
            </div>

        </div>

        <div class="unit-stats">

            <div class="unit-stat">
                <span>حمله</span>
                <strong>
                    ${formatNumber(unit.attack || 0)}
                </strong>
            </div>

            <div class="unit-stat">
                <span>دفاع</span>
                <strong>
                    ${formatNumber(unit.defense || 0)}
                </strong>
            </div>

            <div class="unit-stat">
                <span>مصرف</span>
                <strong>
                    ${escapeHtml(
                        unit.consumption_text ||
                        "—"
                    )}
                </strong>
            </div>

        </div>

        ${
            unit.cost
                ? `
                    <div class="unit-costs">
                        <div class="cost-pill">
                            ${costText(unit.cost)}
                        </div>
                    </div>
                `
                : ""
        }

        ${
            unit.requirement
                ? `
                    <div class="info-box">
                        ${locked ? "🔒" : "ℹ️"}
                        ${escapeHtml(
                            unit.requirement
                        )}
                    </div>
                `
                : ""
        }

        <div class="unit-action-row">

            <button
                class="unit-train-button"
                data-train-unit="${escapeHtml(
                    unit.id || ""
                )}"
                data-amount="1"
                ${locked ? "disabled" : ""}
            >
                آموزش ×۱
            </button>

            <button
                class="unit-train-button secondary"
                data-train-unit="${escapeHtml(
                    unit.id || ""
                )}"
                data-amount="10"
                ${locked ? "disabled" : ""}
            >
                آموزش ×۱۰
            </button>

        </div>

    </div>
`;

}

async function trainUnit(unitId, amount) {
if (!unitId) return;

try {
    const data =
        await api("/api/train-unit", {
            method: "POST",
            body: {
                unit: unitId,
                amount: Number(amount)
            }
        });

    showToast(
        data.message ||
        "واحد نظامی تولید شد.",
        "success"
    );

    await refreshPlayer();
    openArmyPage();
} catch (error) {
    showToast(
        error.message ||
        "تولید واحد انجام نشد.",
        "error"
    );
}

}

/* =========================================================
WAR
========================================================= */

async function openWarPage() {
showGamePage("war");

const container =
    document.getElementById(
        "war-container"
    );

if (!container) return;

container.innerHTML = `
    <div class="empty-state">
        <div class="empty-state-icon">⚔️</div>
        <strong>در حال دریافت وضعیت جنگ...</strong>
        <p>اطلاعات جنگ‌ها و اعلام جنگ‌ها در حال بارگذاری است.</p>
    </div>
`;

try {
    const data =
        await api("/api/wars");

    const wars =
        data.wars ||
        [];

    const pending =
        data.pending ||
        [];

    const otherCountries =
        Object.entries(countries)
            .filter(
                ([key]) =>
                    key !== player?.country
            );

    container.innerHTML = `
        ${renderPendingWars(pending)}

        ${renderActiveWars(wars)}

        <div class="war-declare-form">

            <span class="eyebrow">
                DECLARE WAR
            </span>

            <h3 style="margin-top:4px">
                اعلام جنگ
            </h3>

            <p style="margin-top:5px;font-size:9px">
                ابتدا مشخص کن چه کشوری به چه کشوری اعلام جنگ می‌کند.
                درخواست ابتدا برای تأیید سازمان ملل ارسال می‌شود.
            </p>

            <div class="form-group">
                <label>کشور هدف</label>

                <select
                    id="war-target"
                    class="form-select"
                >
                    <option value="">
                        انتخاب کشور
                    </option>

                    ${
                        otherCountries
                            .map(
                                ([key, value]) => `
                                    <option value="${key}">
                                        ${COUNTRY_FLAGS[key] || "🏳️"}
                                        ${escapeHtml(
                                            value.name ||
                                            COUNTRY_NAMES[key] ||
                                            key
                                        )}
                                    </option>
                                `
                            )
                            .join("")
                    }
                </select>
            </div>

            <div class="form-group">

                <label>
                    نیروهای اعزامی
                </label>

                <div
                    id="war-force-selection"
                    class="force-selection"
                >
                    ${renderWarForces()}
                </div>

            </div>

            <div class="form-group">
                <label>
                    توضیح سیاسی / هدف جنگ
                </label>

                <textarea
                    id="war-reason"
                    class="form-textarea"
                    placeholder="مثلاً اختلاف مرزی، منابع یا پاسخ نظامی..."
                ></textarea>
            </div>

            <button
                id="declare-war-button"
                class="primary-button"
                style="margin-top:12px"
            >
                ⚔️ ارسال درخواست اعلام جنگ
            </button>

        </div>
    `;

    document
        .getElementById(
            "declare-war-button"
        )
        ?.addEventListener(
            "click",
            submitWarDeclaration
        );

} catch (error) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <strong>خطا در جنگ</strong>
            <p>${escapeHtml(error.message)}</p>
        </div>
    `;
}

}

function renderWarForces() {
const units =
player?.army_units ||
player?.units ||
{};

const list = [];

Object.entries(units)
    .forEach(([id, value]) => {
        const count =
            typeof value === "object"
                ? Number(value.count || 0)
                : Number(value || 0);

        const catalog =
            ARMY_UNITS[id] ||
            {};

        if (count <= 0) return;

        list.push({
            id,
            count,
            group:
                catalog.group ||
                "land",
            name:
                catalog.name ||
                id
        });
    });

if (!list.length) {
    return `
        <div class="info-box">
            ❌ هیچ نیروی نظامی آماده‌ای برای اعزام وجود ندارد.
        </div>
    `;
}

return list.map(item => `
    <label class="force-option">

        <input
            type="checkbox"
            value="${escapeHtml(item.id)}"
            data-force-unit
        >

        <div>
            <strong>
                ${GROUP_ICONS[item.group] || "🪖"}
                ${escapeHtml(item.name)}
            </strong>

            <small>
                موجودی:
                ${formatNumber(item.count)}
            </small>
        </div>

        <input
            class="form-input"
            type="number"
            min="0"
            max="${item.count}"
            value="0"
            data-force-amount="${escapeHtml(item.id)}"
            style="width:72px;min-height:32px"
        >

    </label>
`).join("");

}

function renderPendingWars(wars) {
if (!wars?.length) return "";

return `
    <div class="war-alerts">
        ${
            wars.map(war => `
                <div class="war-alert">
                    ⏳
                    ${
                        war.attacker === player?.country
                            ? "درخواست جنگ شما"
                            : "درخواست جنگ جدید"
                    }

                    <strong>
                        ${COUNTRY_NAMES[war.attacker] || war.attacker}
                    </strong>

                    علیه

                    <strong>
                        ${COUNTRY_NAMES[war.defender] || war.defender}
                    </strong>

                    <br>

                    وضعیت:
                    ${escapeHtml(
                        war.status_text ||
                        war.status ||
                        "در انتظار تأیید"
                    )}
                </div>
            `).join("")
        }
    </div>
`;

}

function renderActiveWars(wars) {
if (!wars?.length) return "";

return `
    <div class="section-block">
        <div class="section-heading">
            <div>
                <span class="eyebrow">
                    ACTIVE WARS
                </span>
                <h2>جنگ‌های فعال</h2>
            </div>
        </div>

        ${
            wars.map(renderWarCard).join("")
        }
    </div>
`;

}

function renderWarCard(war) {
const attacker =
war.attacker;

const defender =
    war.defender;

const same =
    attacker === player?.country ||
    defender === player?.country;

return `
    <div class="war-card ${same ? "active" : ""}">

        <div class="war-card-header">

            <div class="war-country">
                <span class="war-country-flag">
                    ${COUNTRY_FLAGS[attacker] || "🏳️"}
                </span>

                <div>
                    <strong>
                        ${COUNTRY_NAMES[attacker] || attacker}
                    </strong>
                    <small>مهاجم</small>
                </div>
            </div>

            <div class="war-vs">VS</div>

            <div class="war-country">
                <span class="war-country-flag">
                    ${COUNTRY_FLAGS[defender] || "🏳️"}
                </span>

                <div>
                    <strong>
                        ${COUNTRY_NAMES[defender] || defender}
                    </strong>
                    <small>مدافع</small>
                </div>
            </div>

        </div>

        <div class="war-status">
            ${escapeHtml(
                war.status_text ||
                war.status ||
                "جنگ فعال"
            )}
        </div>

        ${
            war.starts_at
                ? `
                    <div
                        class="war-timer"
                        data-war-timer="${escapeHtml(
                            war.starts_at
                        )}"
                    >
                        محاسبه زمان...
                    </div>
                `
                : ""
        }

        <div class="war-fronts">

            <div class="war-front">
                <span>✈️</span>
                <small>
                    هوایی
                    ${
                        war.air_winner
                            ? ` • ${escapeHtml(war.air_winner)}`
                            : ""
                    }
                </small>
            </div>

            <div class="war-front">
                <span>⚓</span>
                <small>
                    دریایی
                    ${
                        war.naval_winner
                            ? ` • ${escapeHtml(war.naval_winner)}`
                            : ""
                    }
                </small>
            </div>

            <div class="war-front">
                <span>🪖</span>
                <small>
                    زمینی
                    ${
                        war.land_winner
                            ? ` • ${escapeHtml(war.land_winner)}`
                            : ""
                    }
                </small>
            </div>

        </div>

    </div>
`;

}

async function submitWarDeclaration() {
const target =
document.getElementById(
"war-target"
)?.value;

if (!target) {
    showToast(
        "ابتدا کشور هدف را انتخاب کن.",
        "error"
    );

    return;
}

if (target === player?.country) {
    showToast(
        "نمی‌توانی به کشور خودت اعلام جنگ کنی.",
        "error"
    );

    return;
}

const forces = {};

document
    .querySelectorAll(
        "[data-force-amount]"
    )
    .forEach(input => {
        const id =
            input.dataset.forceAmount;

        const amount =
            Number(input.value || 0);

        if (amount > 0) {
            forces[id] = amount;
        }
    });

if (!Object.keys(forces).length) {
    showToast(
        "برای اعلام جنگ حداقل یک نیروی نظامی انتخاب کن.",
        "error"
    );

    return;
}

const reason =
    document.getElementById(
        "war-reason"
    )?.value?.trim() || "";

try {
    const data =
        await api("/api/declare-war", {
            method: "POST",
            body: {
                attacker: player.country,
                defender: target,
                forces,
                reason,
                admin_id: ADMIN_ID
            }
        });

    showToast(
        data.message ||
        "درخواست جنگ برای تأیید ارسال شد.",
        "success"
    );

    openWarPage();
} catch (error) {
    showToast(
        error.message ||
        "اعلام جنگ انجام نشد.",
        "error"
    );
}

}

/* =========================================================
DIPLOMACY
========================================================= */

async function openDiplomacyPage() {
showGamePage("diplomacy");

const container =
    document.getElementById(
        "diplomacy-container"
    );

if (!container) return;

try {
    const data =
        await api("/api/diplomacy");

    const treaties =
        data.treaties ||
        [];

    const incoming =
        data.incoming ||
        [];

    const outgoing =
        data.outgoing ||
        [];

    container.innerHTML = `
        <div class="diplomacy-tabs">

            <button
                class="diplomacy-tab ${
                    currentDiplomacyTab === "treaties"
                        ? "active"
                        : ""
                }"
                data-diplomacy-tab="treaties"
            >
                📜 پیمان‌ها
            </button>

            <button
                class="diplomacy-tab ${
                    currentDiplomacyTab === "proposals"
                        ? "active"
                        : ""
                }"
                data-diplomacy-tab="proposals"
            >
                🤝 پیشنهادها
            </button>

        </div>

        ${
            currentDiplomacyTab === "treaties"
                ? renderTreaties(treaties)
                : renderDiplomacyProposals(
                    incoming,
                    outgoing
                )
        }
    `;

    bindDiplomacyEvents();
} catch (error) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">🤝</div>
            <strong>خطا در دیپلماسی</strong>
            <p>${escapeHtml(error.message)}</p>
        </div>
    `;
}

}

function renderTreaties(treaties) {
return `
<div class="diplomacy-card">

        <div class="section-heading">
            <div>
                <span class="eyebrow">
                    TREATIES
                </span>
                <h2>پیمان‌های فعال</h2>
            </div>
        </div>

        ${
            treaties.length
                ? treaties.map(treaty => `
                    <div class="treaty-item">

                        <div class="treaty-item-header">

                            <strong>
                                ${
                                    COUNTRY_FLAGS[treaty.country] ||
                                    "🏳️"
                                }

                                ${
                                    COUNTRY_NAMES[treaty.country] ||
                                    treaty.country
                                }
                            </strong>

                            <span class="treaty-status">
                                ${
                                    TREATY_TYPE_NAMES[
                                        treaty.type
                                    ] ||
                                    treaty.type ||
                                    "فعال"
                                }
                            </span>

                        </div>

                        <div
                            style="
                                margin-top:6px;
                                color:var(--muted);
                                font-size:8px;
                            "
                        >
                            ${
                                treaty.expires_at
                                    ? `تا ${formatDate(treaty.expires_at)}`
                                    : "بدون تاریخ پایان"
                            }
                        </div>

                    </div>
                `).join("")
                : `
                    <div class="empty-state">
                        <div class="empty-state-icon">📜</div>
                        <strong>پیمان فعالی نداری</strong>
                        <p>
                            می‌توانی با کشورهای دیگر
                            پیمان اتحاد یا عدم تجاوز پیشنهاد کنی.
                        </p>
                    </div>
                `
        }

    </div>

    <div class="diplomacy-card" style="margin-top:10px">

        <h3>پیشنهاد پیمان جدید</h3>

        <div class="form-group">
            <label>کشور</label>

            <select
                class="form-select"
                id="diplomacy-target"
            >
                <option value="">
                    انتخاب کشور
                </option>

                ${
                    Object.entries(countries)
                        .filter(
                            ([key]) =>
                                key !== player?.country
                        )
                        .map(
                            ([key, value]) => `
                                <option value="${key}">
                                    ${
                                        COUNTRY_FLAGS[key] ||
                                        "🏳️"
                                    }
                                    ${
                                        value.name ||
                                        COUNTRY_NAMES[key] ||
                                        key
                                    }
                                </option>
                            `
                        )
                        .join("")
                }
            </select>
        </div>

        <div class="form-group">
            <label>نوع پیمان</label>

            <select
                class="form-select"
                id="diplomacy-type"
            >
                <option value="alliance">
                    پیمان اتحاد
                </option>

                <option value="non_aggression">
                    پیمان عدم تجاوز
                </option>
            </select>
        </div>

        <button
            class="primary-button"
            id="send-treaty-button"
            style="margin-top:11px"
        >
            ارسال پیشنهاد
        </button>

    </div>
`;

}

function renderDiplomacyProposals(
incoming,
outgoing
) {
return `
<div class="diplomacy-card">

        <h3>پیشنهادهای دریافتی</h3>

        ${
            incoming.length
                ? incoming.map(item => `
                    <div class="treaty-item">

                        <div class="treaty-item-header">
                            <strong>
                                ${
                                    COUNTRY_FLAGS[item.country] ||
                                    "🏳️"
                                }

                                ${
                                    COUNTRY_NAMES[item.country] ||
                                    item.country
                                }
                            </strong>

                            <span class="treaty-status">
                                ${
                                    TREATY_TYPE_NAMES[item.type] ||
                                    item.type
                                }
                            </span>
                        </div>

                        <div class="treaty-actions">

                            <button
                                class="small-button"
                                data-treaty-action="accept"
                                data-treaty-id="${escapeHtml(item.id)}"
                            >
                                قبول
                            </button>

                            <button
                                class="small-button"
                                data-treaty-action="reject"
                                data-treaty-id="${escapeHtml(item.id)}"
                            >
                                رد
                            </button>

                        </div>

                    </div>
                `).join("")
                : `
                    <div class="empty-state">
                        <strong>
                            پیشنهاد جدیدی وجود ندارد.
                        </strong>
                    </div>
                `
        }

    </div>

    <div class="diplomacy-card" style="margin-top:10px">

        <h3>پیشنهادهای ارسال‌شده</h3>

        ${
            outgoing.length
                ? outgoing.map(item => `
                    <div class="treaty-item">

                        <div class="treaty-item-header">
                            <strong>
                                ${
                                    COUNTRY_FLAGS[item.country] ||
                                    "🏳️"
                                }

                                ${
                                    COUNTRY_NAMES[item.country] ||
                                    item.country
                                }
                            </strong>

                            <span class="treaty-status">
                                ${
                                    item.status ||
                                    "در انتظار"
                                }
                            </span>
                        </div>

                    </div>
                `).join("")
                : `
                    <div class="empty-state">
                        <strong>
                            پیشنهادی ارسال نکرده‌ای.
                        </strong>
                    </div>
                `
        }

    </div>
`;

}

function bindDiplomacyEvents() {
document
.querySelectorAll("[data-diplomacy-tab]")
.forEach(button => {
button.addEventListener(
"click",
() => {
currentDiplomacyTab =
button.dataset.diplomacyTab;

                openDiplomacyPage();
            }
        );
    });

document
    .getElementById(
        "send-treaty-button"
    )
    ?.addEventListener(
        "click",
        sendTreatyProposal
    );

document
    .querySelectorAll(
        "[data-treaty-action]"
    )
    .forEach(button => {
        button.addEventListener(
            "click",
            () =>
                handleTreatyAction(
                    button.dataset.treatyAction,
                    button.dataset.treatyId
                )
        );
    });

}

async function sendTreatyProposal() {
const target =
document.getElementById(
"diplomacy-target"
)?.value;

const type =
    document.getElementById(
        "diplomacy-type"
    )?.value;

if (!target || !type) {
    showToast(
        "کشور و نوع پیمان را انتخاب کن.",
        "error"
    );

    return;
}

try {
    const data =
        await api("/api/propose-treaty", {
            method: "POST",
            body: {
                target,
                type
            }
        });

    showToast(
        data.message ||
        "پیشنهاد پیمان ارسال شد.",
        "success"
    );

    openDiplomacyPage();
} catch (error) {
    showToast(
        error.message ||
        "ارسال پیمان انجام نشد.",
        "error"
    );
}

}

async function handleTreatyAction(
action,
treatyId
) {
try {
const data =
await api("/api/treaty-action", {
method: "POST",
body: {
treaty_id: treatyId,
action
}
});

    showToast(
        data.message ||
        "عملیات انجام شد.",
        "success"
    );

    openDiplomacyPage();
} catch (error) {
    showToast(
        error.message ||
        "عملیات انجام نشد.",
        "error"
    );
}

}

/* =========================================================
MARKET
========================================================= */

async function openMarketPage() {
showGamePage("market");

const container =
    document.getElementById(
        "market-container"
    );

if (!container) return;

try {
    const data =
        await api("/api/market");

    const orders =
        data.orders ||
        [];

    const resources =
        data.resources ||
        RESOURCE_NAMES;

    container.innerHTML = `
        <div class="market-tabs">

            <button
                class="market-tab ${
                    currentMarketTab === "orders"
                        ? "active"
                        : ""
                }"
                data-market-tab="orders"
            >
                📋 سفارش‌ها
            </button>

            <button
                class="market-tab ${
                    currentMarketTab === "create"
                        ? "active"
                        : ""
                }"
                data-market-tab="create"
            >
                ➕ ثبت سفارش
            </button>

            <button
                class="market-tab ${
                    currentMarketTab === "mine"
                        ? "active"
                        : ""
                }"
                data-market-tab="mine"
            >
                📦 سفارش‌های من
            </button>

        </div>

        <div class="market-content">

            ${
                currentMarketTab === "orders"
                    ? renderMarketOrders(orders)
                    : currentMarketTab === "create"
                        ? renderCreateMarketOrder(resources)
                        : renderMyMarketOrders(
                            data.my_orders || []
                        )
            }

        </div>
    `;

    bindMarketEvents();
} catch (error) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">🏪</div>
            <strong>بازار در دسترس نیست</strong>
            <p>${escapeHtml(error.message)}</p>
        </div>
    `;
}

}

function renderMarketOrders(orders) {
if (!orders.length) {
return <div class="empty-state"> <div class="empty-state-icon">📦</div> <strong>هنوز سفارشی ثبت نشده</strong> <p> اولین سفارش بازار را ایجاد کن. </p> </div> ;
}

return orders.map(order => `
    <div class="market-order">

        <div class="market-order-header">

            <div class="market-resource">

                <span class="market-resource-icon">
                    ${
                        RESOURCE_ICONS[
                            order.resource
                        ] || "📦"
                    }
                </span>

                <div>
                    <strong>
                        ${
                            RESOURCE_NAMES[
                                order.resource
                            ] ||
                            order.resource
                        }
                    </strong>

                    <small>
                        کشور:
                        ${
                            COUNTRY_NAMES[
                                order.country
                            ] ||
                            order.country ||
                            "ناشناس"
                        }
                    </small>
                </div>

            </div>

            <span
                class="market-side ${
                    order.side === "sell"
                        ? "sell"
                        : "buy"
                }"
            >
                ${
                    order.side === "sell"
                        ? "فروش"
                        : "خرید"
                }
            </span>

        </div>

        <div class="market-order-details">

            <div class="market-detail">
                <span>مقدار</span>
                <strong>
                    ${formatNumber(order.amount)}
                </strong>
            </div>

            <div class="market-detail">
                <span>نرخ</span>
                <strong>
                    ${escapeHtml(
                        order.rate_text ||
                        formatMoney(order.rate || 0)
                    )}
                </strong>
            </div>

            <div class="market-detail">
                <span>مقابل</span>
                <strong>
                    ${
                        order.receive_resource
                            ? RESOURCE_NAMES[
                                order.receive_resource
                            ]
                            : "پول"
                    }
                </strong>
            </div>

        </div>

        <div class="market-order-actions">

            <button
                class="market-action primary"
                data-market-execute="${escapeHtml(
                    order.id
                )}"
            >
                اجرای سفارش
            </button>

            <button
                class="market-action"
                data-market-info="${escapeHtml(
                    order.id
                )}"
            >
                جزئیات
            </button>

        </div>

    </div>
`).join("");

}

function renderCreateMarketOrder(resources) {
return `
<div class="market-order">

        <div class="section-heading">
            <div>
                <span class="eyebrow">
                    GLOBAL MARKET
                </span>

                <h2>
                    ثبت سفارش
                </h2>
            </div>
        </div>

        <div class="form-group">
            <label>نوع سفارش</label>

            <select
                class="form-select"
                id="market-side"
            >
                <option value="sell">
                    فروش
                </option>

                <option value="buy">
                    خرید
                </option>
            </select>
        </div>

        <div class="form-group">
            <label>منبع</label>

            <select
                class="form-select"
                id="market-resource"
            >
                ${
                    Object.entries(
                        RESOURCE_NAMES
                    )
                    .map(
                        ([key, name]) => `
                            <option value="${key}">
                                ${
                                    RESOURCE_ICONS[key]
                                }
                                ${name}
                            </option>
                        `
                    )
                    .join("")
                }
            </select>
        </div>

        <div class="form-group">
            <label>مقدار</label>

            <input
                class="form-input"
                id="market-amount"
                type="number"
                min="1"
                placeholder="مثلاً 10000"
            >
        </div>

        <div class="form-group">
            <label>دریافت در مقابل</label>

            <select
                class="form-select"
                id="market-receive-resource"
            >
                <option value="money">
                    💵 پول
                </option>

                ${
                    Object.entries(
                        RESOURCE_NAMES
                    )
                    .map(
                        ([key, name]) => `
                            <option value="${key}">
                                ${
                                    RESOURCE_ICONS[key]
                                }
                                ${name}
                            </option>
                        `
                    )
                    .join("")
                }
            </select>
        </div>

        <div class="form-group">
            <label>نرخ</label>

            <input
                class="form-input"
                id="market-rate"
                type="number"
                min="1"
                placeholder="مثلاً 5"
            >
        </div>

        <button
            class="primary-button"
            id="create-market-order"
            style="margin-top:12px"
        >
            📦 ثبت سفارش در بازار
        </button>

    </div>
`;

}

function renderMyMarketOrders(orders) {
if (!orders.length) {
return <div class="empty-state"> <div class="empty-state-icon">📦</div> <strong> سفارش فعالی نداری </strong> <p> از بخش ثبت سفارش، سفارش جدید بساز. </p> </div> ;
}

return orders.map(order => `
    <div class="market-order">

        <div class="market-order-header">

            <div class="market-resource">
                <span class="market-resource-icon">
                    ${
                        RESOURCE_ICONS[
                            order.resource
                        ] || "📦"
                    }
                </span>

                <div>
                    <strong>
                        ${
                            RESOURCE_NAMES[
                                order.resource
                            ] ||
                            order.resource
                        }
                    </strong>

                    <small>
                        ${formatNumber(order.amount)}
                    </small>
                </div>
            </div>

            <span class="market-side sell">
                فعال
            </span>

        </div>

        <div class="market-order-actions">

            <button
                class="market-action primary"
                data-market-edit="${escapeHtml(
                    order.id
                )}"
            >
                ویرایش
            </button>

            <button
                class="market-action"
                data-market-delete="${escapeHtml(
                    order.id
                )}"
            >
                حذف
            </button>

        </div>

    </div>
`).join("");

}

function bindMarketEvents() {
document
.querySelectorAll("[data-market-tab]")
.forEach(button => {
button.addEventListener(
"click",
() => {
currentMarketTab =
button.dataset.marketTab;

                openMarketPage();
            }
        );
    });

document
    .getElementById(
        "create-market-order"
    )
    ?.addEventListener(
        "click",
        createMarketOrder
    );

document
    .querySelectorAll(
        "[data-market-execute]"
    )
    .forEach(button => {
        button.addEventListener(
            "click",
            () =>
                executeMarketOrder(
                    button.dataset.marketExecute
                )
        );
    });

document
    .querySelectorAll(
        "[data-market-delete]"
    )
    .forEach(button => {
        button.addEventListener(
            "click",
            () =>
                deleteMarketOrder(
                    button.dataset.marketDelete
                )
        );
    });

}

async function createMarketOrder() {
const side =
document.getElementById(
"market-side"
)?.value;

const resource =
    document.getElementById(
        "market-resource"
    )?.value;

const amount =
    Number(
        document.getElementById(
            "market-amount"
        )?.value || 0
    );

const receiveResource =
    document.getElementById(
        "market-receive-resource"
    )?.value;

const rate =
    Number(
        document.getElementById(
            "market-rate"
        )?.value || 0
    );

if (
    !side ||
    !resource ||
    amount <= 0 ||
    !receiveResource ||
    rate <= 0
) {
    showToast(
        "تمام اطلاعات سفارش را کامل کن.",
        "error"
    );

    return;
}

try {
    const data =
        await api("/api/market/order", {
            method: "POST",
            body: {
                side,
                resource,
                amount,
                receive_resource:
                    receiveResource,
                rate
            }
        });

    showToast(
        data.message ||
        "سفارش در بازار ثبت شد.",
        "success"
    );

    currentMarketTab = "mine";

    openMarketPage();
} catch (error) {
    showToast(
        error.message ||
        "ثبت سفارش انجام نشد.",
        "error"
    );
}

}

async function executeMarketOrder(orderId) {
try {
const data =
await api("/api/market/execute", {
method: "POST",
body: {
order_id: orderId
}
});

    showToast(
        data.message ||
        "سفارش اجرا شد.",
        "success"
    );

    await refreshPlayer();
    openMarketPage();
} catch (error) {
    showToast(
        error.message ||
        "اجرای سفارش انجام نشد.",
        "error"
    );
}

}

async function deleteMarketOrder(orderId) {
try {
const data =
await api("/api/market/delete", {
method: "POST",
body: {
order_id: orderId
}
});

    showToast(
        data.message ||
        "سفارش حذف شد.",
        "success"
    );

    openMarketPage();
} catch (error) {
    showToast(
        error.message ||
        "حذف سفارش انجام نشد.",
        "error"
    );
}

}

/* =========================================================
COMMUNICATIONS
========================================================= */

async function openCommunications() {
showGamePage("communications");

const container =
    document.getElementById(
        "communications-container"
    );

if (!container) return;

container.innerHTML = `
    <div class="communications-tabs">

        <button
            class="communication-tab ${
                currentCommunicationTab === "statements"
                    ? "active"
                    : ""
            }"
            data-communication-tab="statements"
        >
            📢 بیانیه‌ها
        </button>

        <button
            class="communication-tab ${
                currentCommunicationTab === "union"
                    ? "active"
                    : ""
            }"
            data-communication-tab="union"
        >
            🤝 اتحادیه
        </button>

        <button
            class="communication-tab ${
                currentCommunicationTab === "news"
                    ? "active"
                    : ""
            }"
            data-communication-tab="news"
        >
            📰 اخبار
        </button>

        <button
            class="communication-tab ${
                currentCommunicationTab === "messages"
                    ? "active"
                    : ""
            }"
            data-communication-tab="messages"
        >
            💬 پیام
        </button>

    </div>

    <div
        class="communication-panel"
        id="communication-panel"
    >
        <div class="empty-state">
            <div class="empty-state-icon">⏳</div>
            <strong>در حال بارگذاری...</strong>
        </div>
    </div>
`;

document
    .querySelectorAll(
        "[data-communication-tab]"
    )
    .forEach(button => {
        button.addEventListener(
            "click",
            () => {
                currentCommunicationTab =
                    button.dataset.communicationTab;

                openCommunications();
            }
        );
    });

await renderCommunicationPanel();

}

async function renderCommunicationPanel() {
const panel =
document.getElementById(
"communication-panel"
);

if (!panel) return;

try {
    if (
        currentCommunicationTab ===
        "statements"
    ) {
        await loadStatements(panel);
    }

    if (
        currentCommunicationTab ===
        "union"
    ) {
        await loadUnion(panel);
    }

    if (
        currentCommunicationTab ===
        "news"
    ) {
        await loadNews(panel);
    }

    if (
        currentCommunicationTab ===
        "messages"
    ) {
        await loadPrivateMessages(panel);
    }
} catch (error) {
    panel.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <strong>خطا در ارتباطات</strong>
            <p>${escapeHtml(error.message)}</p>
        </div>
    `;
}

}

/* =========================================================
STATEMENTS
========================================================= */

async function loadStatements(panel) {
const data =
await api("/api/statements");

const statements =
    data.statements ||
    [];

const daily =
    data.daily ||
    {};

panel.innerHTML = `
    <div class="statement-composer">

        <div class="section-heading">
            <div>
                <span class="eyebrow">
                    PUBLIC STATEMENT
                </span>

                <h2>
                    بیانیه رسمی
                </h2>
            </div>

            <span class="level-badge">
                ${formatNumber(
                    daily.used || 0
                )}/4
            </span>
        </div>

        <p>
            دو بیانیه اول رایگان هستند.
            بیانیه سوم ۱۰٬۰۰۰ دلار و
            بیانیه چهارم ۴۰۰٬۰۰۰ دلار هزینه دارد.
            فاصله هر بیانیه حداقل یک ساعت است.
        </p>

        <textarea
            id="statement-input"
            class="form-textarea"
            maxlength="1000"
            placeholder="بیانیه کشور خود را بنویس..."
            style="margin-top:10px"
        ></textarea>

        <button
            id="publish-statement"
            class="primary-button"
            style="margin-top:9px"
            ${
                daily.can_publish === false
                    ? "disabled"
                    : ""
            }
        >
            📢 انتشار بیانیه
        </button>

        ${
            daily.next_available_at
                ? `
                    <div class="info-box">
                        ⏱️ انتشار بعدی:
                        ${formatDate(
                            daily.next_available_at
                        )}
                    </div>
                `
                : ""
        }

    </div>

    <div>
        ${
            statements.length
                ? statements
                    .map(renderStatement)
                    .join("")
                : `
                    <div class="empty-state">
                        <div class="empty-state-icon">📢</div>
                        <strong>
                            هنوز بیانیه‌ای منتشر نشده است.
                        </strong>
                    </div>
                `
        }
    </div>
`;

document
    .getElementById(
        "publish-statement"
    )
    ?.addEventListener(
        "click",
        publishStatement
    );

document
    .querySelectorAll(
        "[data-statement-support]"
    )
    .forEach(button => {
        button.addEventListener(
            "click",
            () =>
                statementVote(
                    button.dataset.statementSupport,
                    "support"
                )
        );
    });

document
    .querySelectorAll(
        "[data-statement-accuse]"
    )
    .forEach(button => {
        button.addEventListener(
            "click",
            () =>
                statementVote(
                    button.dataset.statementAccuse,
                    "accuse"
                )
        );
    });

document
    .querySelectorAll(
        "[data-statement-comment]"
    )
    .forEach(button => {
        button.addEventListener(
            "click",
            () =>
                commentStatement(
                    button.dataset.statementComment
                )
        );
    });

}

function renderStatement(statement) {
const support =
statement.supporters ||
[];

const accuse =
    statement.accusers ||
    [];

return `
    <div class="statement-card">

        <div class="statement-header">

            <div class="statement-flag">
                ${
                    COUNTRY_FLAGS[
                        statement.country
                    ] || "🏳️"
                }
            </div>

            <div>
                <strong>
                    ${
                        COUNTRY_NAMES[
                            statement.country
                        ] ||
                        statement.country
                    }
                </strong>

                <small>
                    ${formatDate(
                        statement.created_at
                    )}
                </small>
            </div>

        </div>

        <div class="statement-text">
            ${escapeHtml(
                statement.text
            )}
        </div>

        <div class="statement-actions">

            <button
                class="statement-support"
                data-statement-support="${escapeHtml(
                    statement.id
                )}"
            >
                🟢 حمایت
                ${support.length}
            </button>

            <button
                class="statement-accuse"
                data-statement-accuse="${escapeHtml(
                    statement.id
                )}"
            >
                🔴 محکومیت
                ${accuse.length}
            </button>

        </div>

        <div class="statement-votes">

            ${
                support.map(country => `
                    <span
                        class="vote-flag"
                        title="حمایت"
                    >
                        ${
                            COUNTRY_FLAGS[country] ||
                            "🏳️"
                        }
                    </span>
                `).join("")
            }

            ${
                accuse.map(country => `
                    <span
                        class="vote-flag"
                        title="محکومیت"
                        style="
                            border:1px solid rgba(217,87,87,.35)
                        "
                    >
                        ${
                            COUNTRY_FLAGS[country] ||
                            "🏳️"
                        }
                    </span>
                `).join("")
            }

        </div>

        <div class="statement-comments">

            ${
                (statement.comments || [])
                    .map(comment => `
                        <div class="comment-item">
                            <strong>
                                ${
                                    COUNTRY_FLAGS[
                                        comment.country
                                    ] || "🏳️"
                                }
                                ${
                                    COUNTRY_NAMES[
                                        comment.country
                                    ] ||
                                    comment.country
                                }
                            </strong>

                            <p>
                                ${escapeHtml(
                                    comment.text
                                )}
                            </p>
                        </div>
                    `)
                    .join("")
            }

            <button
                class="small-button"
                style="margin-top:7px;width:100%"
                data-statement-comment="${escapeHtml(
                    statement.id
                )}"
            >
                💬 افزودن نظر
            </button>

        </div>

    </div>
`;

}

async function publishStatement() {
const input =
document.getElementById(
"statement-input"
);

const text =
    input?.value?.trim();

if (!text) {
    showToast(
        "متن بیانیه را وارد کن.",
        "error"
    );

    return;
}

if (text.length < 10) {
    showToast(
        "بیانیه باید حداقل ۱۰ کاراکتر باشد.",
        "error"
    );

    return;
}

try {
    const data =
        await api("/api/statements", {
            method: "POST",
            body: {
                text
            }
        });

    showToast(
        data.message ||
        "بیانیه منتشر شد.",
        "success"
    );

    openCommunications();
} catch (error) {
    showToast(
        error.message ||
        "انتشار بیانیه انجام نشد.",
        "error"
    );
}

}

async function statementVote(
statementId,
action
) {
try {
const data =
await api(
/api/statements/${encodeURIComponent( statementId )}/vote,
{
method: "POST",
body: {
action
}
}
);

    showToast(
        data.message ||
        "رأی ثبت شد.",
        "success"
    );

    openCommunications();
} catch (error) {
    showToast(
        error.message ||
        "ثبت رأی انجام نشد.",
        "error"
    );
}

}

async function commentStatement(statementId) {
const text =
await askText(
"نظر روی بیانیه",
"متن نظر..."
);

if (!text) return;

try {
    const data =
        await api(
            `/api/statements/${encodeURIComponent(
                statementId
            )}/comment`,
            {
                method: "POST",
                body: {
                    text
                }
            }
        );

    showToast(
        data.message ||
        "نظر ثبت شد.",
        "success"
    );

    openCommunications();
} catch (error) {
    showToast(
        error.message ||
        "ثبت نظر انجام نشد.",
        "error"
    );
}

}

/* =========================================================
UNION
========================================================= */

async function loadUnion(panel) {
const data =
await api("/api/union");

const union =
    data.union ||
    null;

const invites =
    data.invites ||
    [];

panel.innerHTML = `
    ${
        invites.length
            ? `
                <div class="union-card">

                    <div class="section-heading">
                        <div>
                            <span class="eyebrow">
                                INVITATIONS
                            </span>

                            <h2>
                                دعوت‌های اتحادیه
                            </h2>
                        </div>
                    </div>

                    ${
                        invites.map(invite => `
                            <div class="union-invite">

                                <strong>
                                    ${
                                        COUNTRY_FLAGS[
                                            invite.country
                                        ] || "🏳️"
                                    }

                                    ${
                                        COUNTRY_NAMES[
                                            invite.country
                                        ] ||
                                        invite.country
                                    }
                                </strong>

                                <p>
                                    شما را به اتحادیه
                                    «${escapeHtml(
                                        invite.union_name
                                    )}»
                                    دعوت کرده است.
                                </p>

                                <div class="invite-actions">

                                    <button
                                        class="small-button"
                                        data-union-invite="accept"
                                        data-invite-id="${escapeHtml(
                                            invite.id
                                        )}"
                                    >
                                        قبول
                                    </button>

                                    <button
                                        class="small-button"
                                        data-union-invite="reject"
                                        data-invite-id="${escapeHtml(
                                            invite.id
                                        )}"
                                    >
                                        رد
                                    </button>

                                </div>

                            </div>
                        `).join("")
                    }

                </div>
            `
            : ""
    }

    ${
        union
            ? renderUnion(union)
            : renderCreateUnion()
    }
`;

bindUnionEvents();

}

function renderCreateUnion() {
return `
<div class="union-card">

        <div class="section-heading">
            <div>
                <span class="eyebrow">
                    UNION
                </span>

                <h2>
                    ساخت اتحادیه
                </h2>
            </div>
        </div>

        <p>
            هر کشور فقط می‌تواند عضو یک اتحادیه باشد،
            اما تعداد اعضای یک اتحادیه محدود نیست.
        </p>

        <input
            id="union-name"
            class="form-input"
            placeholder="نام اتحادیه"
            style="margin-top:10px"
            maxlength="80"
        >

        <button
            id="create-union"
            class="primary-button"
            style="margin-top:9px"
        >
            🤝 ایجاد اتحادیه
        </button>

    </div>
`;

}

function renderUnion(union) {
return `
<div class="union-card">

        <div class="union-header">

            <div>
                <span class="eyebrow">
                    UNION
                </span>

                <h3>
                    🤝 ${escapeHtml(
                        union.name ||
                        "اتحادیه"
                    )}
                </h3>
            </div>

            <span class="level-badge">
                ${formatNumber(
                    (union.members || []).length
                )} عضو
            </span>

        </div>

        <p style="margin-top:7px">
            ${escapeHtml(
                union.description ||
                "اتحادیه بین‌المللی کشورها"
            )}
        </p>

        <div class="union-member-list">

            ${
                (union.members || [])
                    .map(member => `
                        <div class="union-member">

                            <div class="union-member-name">

                                <span>
                                    ${
                                        COUNTRY_FLAGS[
                                            member.country
                                        ] || "🏳️"
                                    }
                                </span>

                                <strong>
                                    ${
                                        COUNTRY_NAMES[
                                            member.country
                                        ] ||
                                        member.country
                                    }
                                </strong>

                            </div>

                            ${
                                member.owner
                                    ? `
                                        <span
                                            class="treaty-status"
                                        >
                                            مدیر
                                        </span>
                                    `
                                    : ""
                            }

                        </div>
                    `)
                    .join("")
            }

        </div>

        <button
            class="small-button"
            id="union-invite-button"
            style="width:100%;margin-top:9px"
        >
            ➕ دعوت کشور
        </button>

        <button
            class="small-button"
            id="union-chat-button"
            style="width:100%;margin-top:6px"
        >
            💬 چت اتحادیه
        </button>

    </div>
`;

}

function bindUnionEvents() {
document
.getElementById("create-union")
?.addEventListener(
"click",
createUnion
);

document
    .getElementById("union-invite-button")
    ?.addEventListener(
        "click",
        inviteToUnion
    );

document
    .getElementById("union-chat-button")
    ?.addEventListener(
        "click",
        openUnionChat
    );

document
    .querySelectorAll(
        "[data-union-invite]"
    )
    .forEach(button => {
        button.addEventListener(
            "click",
            () =>
                handleUnionInvite(
                    button.dataset.unionInvite,
                    button.dataset.inviteId
                )
        );
    });

}

async function createUnion() {
const name =
document.getElementById(
"union-name"
)?.value?.trim();

if (!name) {
    showToast(
        "نام اتحادیه را وارد کن.",
        "error"
    );

    return;
}

try {
    const data =
        await api("/api/union/create", {
            method: "POST",
            body: {
                name
            }
        });

    showToast(
        data.message ||
        "اتحادیه ساخته شد.",
        "success"
    );

    openCommunications();
} catch (error) {
    showToast(
        error.message ||
        "ساخت اتحادیه انجام نشد.",
        "error"
    );
}

}

async function inviteToUnion() {
const options =
Object.entries(countries)
.filter(
([country]) =>
country !== player?.country
)
.map(
([country, value]) => <option value="${country}"> ${ COUNTRY_FLAGS[country] || "🏳️" } ${ value.name || COUNTRY_NAMES[country] || country } </option>
)
.join("");

const modal =
    openModal({
        title: "دعوت به اتحادیه",
        icon: "🤝",
        html: `
            <select
                class="form-select"
                id="union-invite-target"
            >
                <option value="">
                    انتخاب کشور
                </option>

                ${options}
            </select>
        `,
        buttons: [
            {
                id: "cancel",
                text: "انصراف"
            },
            {
                id: "send",
                text: "ارسال دعوت",
                primary: true,
                handler: async box => {
                    const target =
                        box.querySelector(
                            "#union-invite-target"
                        )?.value;

                    if (!target) {
                        showToast(
                            "کشور را انتخاب کن.",
                            "error"
                        );

                        return;
                    }

                    try {
                        const data =
                            await api(
                                "/api/union/invite",
                                {
                                    method: "POST",
                                    body: {
                                        target
                                    }
                                }
                            );

                        showToast(
                            data.message ||
                            "دعوت ارسال شد.",
                            "success"
                        );

                        openCommunications();
                    } catch (error) {
                        showToast(
                            error.message ||
                            "ارسال دعوت انجام نشد.",
                            "error"
                        );
                    }
                }
            }
        ]
    });

return modal;

}

async function handleUnionInvite(
action,
inviteId
) {
try {
const data =
await api("/api/union/invite-action", {
method: "POST",
body: {
invite_id: inviteId,
action
}
});

    showToast(
        data.message ||
        "عملیات اتحادیه انجام شد.",
        "success"
    );

    openCommunications();
} catch (error) {
    showToast(
        error.message ||
        "عملیات انجام نشد.",
        "error"
    );
}

}

async function openUnionChat() {
const modal =
openModal({
title: "چت اتحادیه",
icon: "💬",
html: `
<div id="union-chat-messages" class="message-list" style="max-height:320px" >
در حال بارگذاری...
</div>

            <div
                class="message-compose"
                style="margin-top:8px"
            >
                <div class="message-compose-row">

                    <textarea
                        id="union-chat-input"
                        class="message-input"
                        placeholder="پیام برای اعضای اتحادیه..."
                    ></textarea>

                    <button
                        class="message-send"
                        id="union-chat-send"
                    >
                        ➤
                    </button>

                </div>
            </div>
        `,
        buttons: []
    });

try {
    const data =
        await api("/api/union/chat");

    const messages =
        data.messages ||
        [];

    const box =
        modal.box.querySelector(
            "#union-chat-messages"
        );

    if (box) {
        box.innerHTML =
            messages.length
                ? messages.map(renderMessageBubble).join("")
                : `
                    <div class="empty-state">
                        <strong>
                            هنوز پیامی نیست.
                        </strong>
                    </div>
                `;
    }

    modal.box
        .querySelector(
            "#union-chat-send"
        )
        ?.addEventListener(
            "click",
            async () => {
                const input =
                    modal.box.querySelector(
                        "#union-chat-input"
                    );

                const text =
                    input?.value?.trim();

                if (!text) return;

                try {
                    await api(
                        "/api/union/chat",
                        {
                            method: "POST",
                            body: {
                                text
                            }
                        }
                    );

                    input.value = "";

                    const refreshed =
                        await api(
                            "/api/union/chat"
                        );

                    const refreshedMessages =
                        refreshed.messages ||
                        [];

                    box.innerHTML =
                        refreshedMessages
                            .map(renderMessageBubble)
                            .join("");

                    box.scrollTop =
                        box.scrollHeight;
                } catch (error) {
                    showToast(
                        error.message ||
                        "ارسال پیام انجام نشد.",
                        "error"
                    );
                }
            }
        );
} catch (error) {
    const box =
        modal.box.querySelector(
            "#union-chat-messages"
        );

    if (box) {
        box.textContent =
            error.message;
    }
}

}

/* =========================================================
NEWS
========================================================= */

async function loadNews(panel = null) {
const target =
panel ||
document.getElementById(
"communication-panel"
);

if (!target) return;

try {
    const data =
        await api("/api/news");

    const news =
        data.news ||
        [];

    target.innerHTML = `
        ${
            news.length
                ? news.map(item => `
                    <div class="news-card">

                        <div class="news-card-header">

                            <span>
                                ${item.icon || "📰"}
                            </span>

                            <strong>
                                ${escapeHtml(
                                    item.title ||
                                    "خبر"
                                )}
                            </strong>

                            <small
                                class="news-card-time"
                            >
                                ${formatDate(
                                    item.created_at
                                )}
                            </small>

                        </div>

                        <p>
                            ${escapeHtml(
                                item.text ||
                                item.message ||
                                ""
                            )}
                        </p>

                    </div>
                `).join("")
                : `
                    <div class="empty-state">
                        <div class="empty-state-icon">📰</div>
                        <strong>
                            هنوز خبری ثبت نشده است.
                        </strong>
                        <p>
                            رویدادهای مهم بازی اینجا نمایش داده می‌شوند.
                        </p>
                    </div>
                `
        }
    `;
} catch (error) {
    target.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">📰</div>
            <strong>
                اخبار دریافت نشد.
            </strong>
            <p>${escapeHtml(error.message)}</p>
        </div>
    `;
}

}

/* =========================================================
PRIVATE MESSAGES
========================================================= */

async function loadPrivateMessages(panel) {
let data = {
messages: []
};

if (selectedMessageCountry) {
    try {
        data =
            await api(
                `/api/messages/${encodeURIComponent(
                    selectedMessageCountry
                )}`
            );
    } catch (error) {
        console.warn(error);
    }
}

panel.innerHTML = `
    <div class="messages-layout">

        <div class="contact-list">

            <div class="section-heading">
                <div>
                    <span class="eyebrow">
                        DIPLOMATIC CONTACTS
                    </span>

                    <h2>
                        کشورهای دیگر
                    </h2>
                </div>
            </div>

            ${renderContactList()}

        </div>

        ${
            selectedMessageCountry
                ? `
                    <div class="message-list">

                        ${
                            (data.messages || [])
                                .map(
                                    renderMessageBubble
                                )
                                .join("")
                        }

                    </div>

                    <div class="message-compose">

                        <div class="message-compose-row">

                            <textarea
                                id="private-message-input"
                                class="message-input"
                                placeholder="پیام خصوصی..."
                            ></textarea>

                            <button
                                class="message-send"
                                id="send-private-message"
                            >
                                ➤
                            </button>

                        </div>

                    </div>
                `
                : `
                    <div class="empty-state">
                        <div class="empty-state-icon">💬</div>
                        <strong>
                            یک کشور را برای گفتگو انتخاب کن.
                        </strong>
                        <p>
                            پیام‌ها فقط داخل بازی ارسال می‌شوند.
                        </p>
                    </div>
                `
        }

    </div>
`;

document
    .querySelectorAll(
        "[data-message-country]"
    )
    .forEach(button => {
        button.addEventListener(
            "click",
            () => {
                selectedMessageCountry =
                    button.dataset.messageCountry;

                openCommunications();
            }
        );
    });

document
    .getElementById(
        "send-private-message"
    )
    ?.addEventListener(
        "click",
        sendPrivateMessage
    );

}

function renderContactList() {
return Object.entries(countries)
.filter(
([country]) =>
country !== player?.country
)
.map(
([country, data]) => `
<div class="contact-item">

                <div class="contact-country">

                    <span>
                        ${
                            COUNTRY_FLAGS[country] ||
                            "🏳️"
                        }
                    </span>

                    <strong>
                        ${
                            data.name ||
                            COUNTRY_NAMES[country] ||
                            country
                        }
                    </strong>

                </div>

                <button
                    class="contact-message-button"
                    data-message-country="${country}"
                >
                    پیام
                </button>

            </div>
        `
    )
    .join("");

}

function renderMessageBubble(message) {
const mine =
String(message.sender) ===
String(player?.country);

return `
    <div class="message-bubble ${
        mine ? "mine" : ""
    }">

        <strong>
            ${
                COUNTRY_FLAGS[
                    message.sender
                ] || "🏳️"
            }

            ${
                COUNTRY_NAMES[
                    message.sender
                ] ||
                message.sender ||
                "کشور"
            }
        </strong>

        <p>
            ${escapeHtml(
                message.text ||
                ""
            )}
        </p>

        <small
            style="
                color:var(--muted-2);
                font-size:6px;
            "
        >
            ${formatDate(
                message.created_at
            )}
        </small>

    </div>
`;

}

async function sendPrivateMessage() {
if (!selectedMessageCountry) return;

const input =
    document.getElementById(
        "private-message-input"
    );

const text =
    input?.value?.trim();

if (!text) {
    showToast(
        "متن پیام را وارد کن.",
        "error"
    );

    return;
}

try {
    const data =
        await api(
            `/api/messages/${encodeURIComponent(
                selectedMessageCountry
            )}`,
            {
                method: "POST",
                body: {
                    text
                }
            }
        );

    showToast(
        data.message ||
        "پیام ارسال شد.",
        "success"
    );

    openCommunications();
} catch (error) {
    showToast(
        error.message ||
        "ارسال پیام انجام نشد.",
        "error"
    );
}

}

/* =========================================================
WORLD MAP
========================================================= */

async function initWorldMap() {
const container =
document.getElementById(
"world-map"
);

if (!container) return;

container.innerHTML = "";

try {
    const atlas =
        await loadWorldAtlas();

    const width =
        container.clientWidth || 700;

    const height =
        container.clientHeight || 420;

    mapSvg =
        d3.select(container)
            .append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr(
                "viewBox",
                `0 0 ${width} ${height}`
            )
            .attr(
                "preserveAspectRatio",
                "xMidYMid meet"
            );

    mapProjection =
        d3.geoNaturalEarth1();

    mapProjection.fitSize(
        [width, height],
        {
            type: "Sphere"
        }
    );

    const path =
        d3.geoPath(
            mapProjection
        );

    mapRoot =
        mapSvg.append("g");

    mapRoot
        .append("path")
        .datum({ type: "Sphere" })
        .attr("d", path)
        .attr("fill", "#081821")
        .attr(
            "stroke",
            "rgba(255,255,255,.08)"
        );

    const geoCountries =
        topojson.feature(
            atlas,
            atlas.objects.countries
        );

    const gameIds =
        new Set(
            Object.values(COUNTRY_IDS)
                .map(Number)
        );

    mapRoot
        .append("g")
        .attr("class", "map-countries")
        .selectAll("path")
        .data(
            geoCountries.features.filter(
                feature =>
                    gameIds.has(
                        Number(feature.id)
                    )
            )
        )
        .join("path")
        .attr("d", path)
        .attr(
            "data-country-id",
            feature => feature.id
        )
        .attr("fill", "#777f87")
        .attr(
            "stroke",
            "rgba(255,255,255,.10)"
        )
        .attr(
            "stroke-width",
            0.5
        )
        .on("click", (_, feature) => {
            const country =
                Object.entries(
                    COUNTRY_IDS
                ).find(
                    ([, id]) =>
                        Number(id) ===
                        Number(feature.id)
                )?.[0];

            if (country) {
                showMapCountryInfo(country);
            }
        });

    mapRoot
        .append("g")
        .attr("class", "map-ocean-labels")
        .selectAll("text")
        .data(OCEAN_LABELS)
        .join("text")
        .attr("class", "map-ocean-label")
        .attr(
            "x",
            d => mapProjection([d[0], d[1]])[0]
        )
        .attr(
            "y",
            d => mapProjection([d[0], d[1]])[1]
        )
        .text(d => d[2]);

    mapRoot
        .append("g")
        .attr("class", "map-sites");

    mapRoot
        .append("g")
        .attr("class", "map-straits");

    mapZoom =
        d3.zoom()
            .scaleExtent([0.75, 5])
            .on("zoom", event => {
                mapRoot.attr(
                    "transform",
                    event.transform
                );
            });

    mapSvg.call(mapZoom);

    renderStrategicSites();
    renderStraits();
    await updateMapColors();

    mapInitialized = true;
} catch (error) {
    console.error(error);

    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">🌍</div>
            <strong>نقشه بارگذاری نشد</strong>
            <p>${escapeHtml(error.message)}</p>
        </div>
    `;
}

}

function getCountryStatus(
country,
mapData = {}
) {
const info =
mapData[country] ||
countries[country] ||
{};

if (
    info.occupied_by ===
    player?.country
) {
    return "own-occupied";
}

if (
    info.occupied_by &&
    info.occupied_by !==
        player?.country
) {
    return "other-occupied";
}

if (
    country ===
    player?.country
) {
    return "own";
}

if (
    info.taken ||
    info.player_id ||
    info.owner
) {
    return "other";
}

return "unowned";

}

async function updateMapColors() {
if (!mapRoot) return;

let mapData = {};

try {
    const data =
        await api("/api/map");

    mapData =
        data.countries ||
        {};
} catch {
    mapData = countries;
}

const colorMap = {
    own: "#dcae45",
    other: "#4c8edb",
    unowned: "#777f87",
    "own-occupied": "#42c878",
    "other-occupied": "#9366d8"
};

mapRoot
    .selectAll(
        ".map-countries path"
    )
    .attr(
        "fill",
        function () {
            const id =
                Number(
                    this.dataset.countryId
                );

            const country =
                Object.entries(
                    COUNTRY_IDS
                ).find(
                    ([, value]) =>
                        Number(value) ===
                        id
                )?.[0];

            if (!country) {
                return "#777f87";
            }

            return colorMap[
                getCountryStatus(
                    country,
                    mapData
                )
            ];
        }
    );

await updateStrategicSites();

}

function renderStrategicSites() {
if (!mapRoot || !mapProjection) return;

const group =
    mapRoot.select(
        ".map-sites"
    );

const path =
    d3.geoPath(
        mapProjection
    );

group
    .selectAll("*")
    .remove();

const sites =
    group
        .selectAll("g")
        .data(RESOURCE_SITES)
        .join("g")
        .attr(
            "class",
            "map-strategic-site"
        );

sites
    .append("circle")
    .attr(
        "cx",
        d =>
            mapProjection(
                [d.lon, d.lat]
            )[0]
    )
    .attr(
        "cy",
        d =>
            mapProjection(
                [d.lon, d.lat]
            )[1]
    )
    .attr("r", 5)
    .attr(
        "fill",
        d =>
            d.type === "oil"
                ? "#dcae45"
                : d.type === "steel"
                    ? "#9aa7b1"
                    : "#9366d8"
    );

sites
    .append("text")
    .attr(
        "x",
        d =>
            mapProjection(
                [d.lon, d.lat]
            )[0]
    )
    .attr(
        "y",
        d =>
            mapProjection(
                [d.lon, d.lat]
            )[1] - 8
    )
    .text(
        d =>
            d.type === "oil"
                ? "نفت"
                : d.type === "steel"
                    ? "فولاد"
                    : "اورانیوم"
    );

sites.on("click", (_, site) => {
    showStrategicSiteInfo(site);
});

}

async function updateStrategicSites() {
if (!mapRoot) return;

let siteData = {};

try {
    const data =
        await api("/api/strategic-sites");

    siteData =
        data.sites ||
        {};
} catch {
    siteData = {};
}

mapRoot
    .selectAll(
        ".map-strategic-site circle"
    )
    .attr(
        "stroke",
        site => {
            const owner =
                siteData[
                    site.id
                ]?.owner;

            if (!owner) {
                return "#e8edf2";
            }

            if (
                owner ===
                player?.country
            ) {
                return "#42c878";
            }

            return "#9366d8";
        }
    )
    .attr(
        "stroke-width",
        2
    );

}

function renderStraits() {
if (!mapRoot || !mapProjection) return;

const group =
    mapRoot.select(
        ".map-straits"
    );

group
    .selectAll("*")
    .remove();

const straits =
    group
        .selectAll("g")
        .data(STRAITS)
        .join("g")
        .attr(
            "class",
            "map-strategic-site"
        );

straits
    .append("circle")
    .attr(
        "cx",
        d =>
            mapProjection(
                [d.lon, d.lat]
            )[0]
    )
    .attr(
        "cy",
        d =>
            mapProjection(
                [d.lon, d.lat]
            )[1]
    )
    .attr("r", 4)
    .attr(
        "fill",
        "#4c8edb"
    );

straits
    .append("text")
    .attr(
        "x",
        d =>
            mapProjection(
                [d.lon, d.lat]
            )[0]
    )
    .attr(
        "y",
        d =>
            mapProjection(
                [d.lon, d.lat]
            )[1] - 7
    )
    .text(
        d => d.name
    );

straits.on(
    "click",
    (_, strait) => {
        showStraitInfo(strait);
    }
);

}

function showMapCountryInfo(country) {
const info =
countries[country] ||
{};

const occupiedBy =
    info.occupied_by;

const status =
    getCountryStatus(
        country
    );

const statusText = {
    own: "کشور شما",
    other: "کشور بازیکن دیگر",
    unowned: "بدون بازیکن",
    "own-occupied": "سرزمین اشغال‌شده توسط شما",
    "other-occupied":
        "سرزمین اشغال‌شده توسط بازیکن دیگر"
};

const panel =
    document.getElementById(
        "map-info"
    );

if (!panel) return;

panel.innerHTML = `
    <strong>
        ${COUNTRY_FLAGS[country] || "🏳️"}
        ${
            info.name ||
            COUNTRY_NAMES[country] ||
            country
        }
    </strong>

    <div style="margin-top:4px">
        وضعیت:
        ${statusText[status] || "نامشخص"}
    </div>

    ${
        occupiedBy
            ? `
                <div style="margin-top:4px">
                    اشغال توسط:
                    ${
                        COUNTRY_FLAGS[occupiedBy] ||
                        "🏳️"
                    }
                    ${
                        COUNTRY_NAMES[occupiedBy] ||
                        occupiedBy
                    }
                </div>
            `
            : ""
    }
`;

}

function showStrategicSiteInfo(site) {
const panel =
document.getElementById(
"map-info"
);

if (!panel) return;

panel.innerHTML = `
    <strong>
        ${
            site.type === "oil"
                ? "🛢️"
                : site.type === "steel"
                    ? "⚙️"
                    : "☢️"
        }

        ${escapeHtml(site.name)}
    </strong>

    <div style="margin-top:4px">
        تولید روزانه:
        ${formatNumber(site.production)}
        واحد
    </div>

    <div style="margin-top:4px">
        زمان حرکت ناو:
        ${site.travelHours} ساعت
    </div>

    <div style="margin-top:5px;color:var(--muted)">
        برای تصرف باید نیروی دریایی به این موقعیت اعزام شود.
    </div>
`;

}

function showStraitInfo(strait) {
const panel =
document.getElementById(
"map-info"
);

if (!panel) return;

panel.innerHTML = `
    <strong>
        ⚓ ${escapeHtml(strait.name)}
    </strong>

    <div style="margin-top:5px">
        ${escapeHtml(strait.desc)}
    </div>

    <button
        class="small-button"
        style="width:100%;margin-top:8px"
        id="send-navy-strait"
    >
        ⚓ اعزام ناو
    </button>
`;

document
    .getElementById(
        "send-navy-strait"
    )
    ?.addEventListener(
        "click",
        () => sendNavyToStrategicSite(strait.name)
    );

}

async function sendNavyToStrategicSite(
target
) {
try {
const data =
await api(
"/api/strategic/send-navy",
{
method: "POST",
body: {
target
}
}
);

    showToast(
        data.message ||
        "نیروی دریایی اعزام شد.",
        "success"
    );

    await updateMapColors();
} catch (error) {
    showToast(
        error.message ||
        "اعزام نیرو انجام نشد.",
        "error"
    );
}

}

/* =========================================================
SUBSCRIPTION
========================================================= */

function openSubscriptionPage() {
showGamePage("subscription");
}

/* =========================================================
NAVIGATION
========================================================= */

function setActiveNav(page) {
document
.querySelectorAll(".nav-item")
.forEach(item => {
item.classList.toggle(
"active",
item.dataset.page === page
);
});
}

async function navigateToPage(page) {
setActiveNav(page);

if (page === "home") {
    showGamePage("home");
    updateHomeStats();
    return;
}

if (page === "map") {
    showGamePage("map");

    setTimeout(
        async () => {
            if (!mapInitialized) {
                await initWorldMap();
            } else {
                await updateMapColors();
            }
        },
        40
    );

    return;
}

if (page === "communications") {
    await openCommunications();
    return;
}

if (page === "subscription") {
    openSubscriptionPage();
    return;
}

if (page === "market") {
    await openMarketPage();
    return;
}

}

/* =========================================================
EVENT BINDINGS
========================================================= */

document.addEventListener(
"click",
async event => {
const countryCard =
event.target.closest(
"[data-country-card]"
);

    if (countryCard) {
        const country =
            countryCard.dataset.country;

        if (
            countryCard.classList.contains(
                "taken"
            )
        ) {
            showToast(
                "این کشور قبلاً انتخاب شده است.",
                "error"
            );

            return;
        }

        await selectCountry(country);

        return;
    }

    const enterGame =
        event.target.closest(
            "[data-enter-game]"
        );

    if (enterGame) {
        showGame();
        return;
    }

    const backCountry =
        event.target.closest(
            "[data-back-country]"
        );

    if (backCountry) {
        showCountrySelection();
        return;
    }

    const backGame =
        event.target.closest(
            "[data-back-game]"
        );

    if (backGame) {
        showGamePage("home");
        setActiveNav("home");
        return;
    }

    const pageButton =
        event.target.closest(
            "[data-open-page]"
        );

    if (pageButton) {
        const page =
            pageButton.dataset.openPage;

        setActiveNav(
            page === "infrastructure" ||
            page === "army" ||
            page === "war" ||
            page === "diplomacy" ||
            page === "economy"
                ? "home"
                : page
        );

        if (
            page === "infrastructure"
        ) {
            await openInfrastructure();
        }

        if (page === "army") {
            await openArmyPage();
        }

        if (page === "war") {
            await openWarPage();
        }

        if (page === "diplomacy") {
            await openDiplomacyPage();
        }

        if (page === "economy") {
            await openEconomy();
        }

        return;
    }

    const infraButton =
        event.target.closest(
            "[data-infra-upgrade]"
        );

    if (infraButton) {
        await upgradeInfrastructure(
            infraButton.dataset.infraUpgrade
        );

        return;
    }

    const trainButton =
        event.target.closest(
            "[data-train-unit]"
        );

    if (trainButton) {
        await trainUnit(
            trainButton.dataset.trainUnit,
            trainButton.dataset.amount
        );

        return;
    }

    const nav =
        event.target.closest(
            ".nav-item"
        );

    if (nav) {
        await navigateToPage(
            nav.dataset.page
        );

        return;
    }

    const mapZoomIn =
        event.target.closest(
            "[data-map-zoom-in]"
        );

    if (mapZoomIn && mapSvg && mapZoom) {
        mapSvg.transition()
            .duration(220)
            .call(
                mapZoom.scaleBy,
                1.25
            );

        return;
    }

    const mapZoomOut =
        event.target.closest(
            "[data-map-zoom-out]"
        );

    if (mapZoomOut && mapSvg && mapZoom) {
        mapSvg.transition()
            .duration(220)
            .call(
                mapZoom.scaleBy,
                0.8
            );

        return;
    }

    const mapReset =
        event.target.closest(
            "[data-map-reset]"
        );

    if (mapReset && mapSvg && mapZoom) {
        mapSvg.transition()
            .duration(250)
            .call(
                mapZoom.transform,
                d3.zoomIdentity
            );

        return;
    }
}

);

/* =========================================================
TIMER
========================================================= */

setInterval(() => {
document
.querySelectorAll(
"[data-war-timer]"
)
.forEach(element => {
const target =
new Date(
element.dataset.warTimer
);

        if (Number.isNaN(target.getTime())) {
            return;
        }

        const diff =
            target.getTime() -
            Date.now();

        if (diff <= 0) {
            element.textContent =
                "⚔️ زمان عملیات فرا رسیده است";

            return;
        }

        const totalSeconds =
            Math.floor(
                diff / 1000
            );

        const hours =
            Math.floor(
                totalSeconds / 3600
            );

        const minutes =
            Math.floor(
                (totalSeconds % 3600) /
                60
            );

        const seconds =
            totalSeconds % 60;

        element.textContent =
            `⏳ ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    });

}, 1000);

/* =========================================================
INITIALIZATION
========================================================= */

(async function init() {
showOnly("loading");

const startTime =
    Date.now();

try {
    await loadCountries();

    await loadPlayer();

    await loadArmyCatalog();

    const elapsed =
        Date.now() -
        startTime;

    const minDuration =
        900;

    if (
        elapsed <
        minDuration
    ) {
        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    minDuration -
                    elapsed
                )
        );
    }

    if (player?.country) {
        selectedCountry =
            player.country;

        showGame();
    } else {
        showCountrySelection();
    }
} catch (error) {
    console.error(error);

    showToast(
        "خطا در راه‌اندازی بازی.",
        "error"
    );

    showCountrySelection();
}

})();
