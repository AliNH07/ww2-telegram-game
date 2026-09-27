/* =========================================================
   WW2 TELEGRAM GAME
   web/app.js
   ========================================================= */

"use strict";

/* =========================================================
   TELEGRAM
   ========================================================= */

const tg = window.Telegram?.WebApp || null;

if (tg) {
    try {
        tg.ready();
        tg.expand();
    } catch (e) {
        console.warn("Telegram WebApp init error:", e);
    }
}

const userId =
    tg?.initDataUnsafe?.user?.id ||
    tg?.initDataUnsafe?.query_id ||
    null;


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let player = null;
let countries = {};
let selectedCountry = null;

let currentPage = "home";
let currentInfraTab = "power";

let statsInterval = null;
let playerLoading = false;

let worldSvg = null;
let worldProjection = null;
let worldPath = null;
let worldZoom = null;
let worldMapReady = false;

const API = "";


/* =========================================================
   COUNTRY DATA
   ========================================================= */

const COUNTRY_INFO = {
    germany: {
        name: "آلمان",
        flag: "🇩🇪",
        image: "/images/germany.jpg"
    },
    britain: {
        name: "بریتانیا",
        flag: "🇬🇧",
        image: "/images/britain.jpg"
    },
    ussr: {
        name: "شوروی",
        flag: "🇷🇺",
        image: "/images/ussr.jpg"
    },
    usa: {
        name: "ایالات متحده",
        flag: "🇺🇸",
        image: "/images/usa.jpg"
    },
    france: {
        name: "فرانسه",
        flag: "🇫🇷",
        image: "/images/france.jfif"
    },
    italy: {
        name: "ایتالیا",
        flag: "🇮🇹",
        image: "/images/italy.jfif"
    },
    china: {
        name: "چین",
        flag: "🇨🇳",
        image: "/images/china.jfif"
    },
    japan: {
        name: "ژاپن",
        flag: "🇯🇵",
        image: "/images/japan.jfif"
    }
};


/* =========================================================
   ARMY UNITS
   ========================================================= */

const ARMY_UNITS = {
    land: {
        name: "گردان زمینی",
        icon: "🪖",
        infra: "barracks",
        cost: 50000,
        manpower: 300,
        power: 5,
        attack: 15
    },

    air: {
        name: "اسکادران هوایی",
        icon: "✈️",
        infra: "airport",
        cost: 200000,
        manpower: 150,
        power: 15,
        attack: 40
    },

    navy: {
        name: "ناو دریایی",
        icon: "🚢",
        infra: "port",
        cost: 250000,
        manpower: 200,
        power: 15,
        attack: 35
    }
};


/* =========================================================
   HELPERS
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatNumber(value) {
    const number = Number(value || 0);

    return new Intl.NumberFormat("fa-IR", {
        maximumFractionDigits: 0
    }).format(number);
}

function formatMoney(value) {
    return formatNumber(value) + " 💰";
}

function getCountryInfo(countryId) {
    return COUNTRY_INFO[countryId] || {
        name: countryId || "کشور",
        flag: "🌍",
        image: ""
    };
}

function countryName(countryId) {
    if (countries[countryId]?.name) {
        return countries[countryId].name;
    }

    return getCountryInfo(countryId).name;
}

function countryFlag(countryId) {
    return getCountryInfo(countryId).flag;
}

function showToast(message, type = "normal") {
    let toast = document.querySelector(".game-toast");

    if (!toast) {
        toast = document.createElement("div");
        toast.className = "game-toast";
        document.body.appendChild(toast);
    }

    toast.className = `game-toast ${type}`;
    toast.textContent = message;

    requestAnimationFrame(() => {
        toast.classList.add("show");
    });

    clearTimeout(toast._timer);

    toast._timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

function setText(id, value) {
    const el = $(id);
    if (el) {
        el.textContent = value;
    }
}

function setImage(id, src) {
    const el = $(id);

    if (!el || !src) {
        return;
    }

    el.src = src;
}

function getQueryParams() {
    const params = new URLSearchParams(window.location.search);

    return {
        userId: params.get("user_id")
    };
}


/* =========================================================
   LOADING SCREEN
   ========================================================= */

function createLoadingScreen() {
    let loading = document.getElementById("app-loading");

    if (loading) {
        return loading;
    }

    loading = document.createElement("div");
    loading.id = "app-loading";

    loading.innerHTML = `
        <div class="loading-frame">

            <div class="loading-top-line">
                <span class="loading-dot"></span>
                <span id="loading-connection-text">
                    در حال اتصال به تلگرام....
                </span>
            </div>

            <div class="loading-title">
                WW2 COMMAND
            </div>

            <div class="loading-subtitle">
                در حال بارگذاری فرماندهی...
            </div>

            <div class="loading-progress-frame">
                <div id="loading-progress-bar"></div>
            </div>

            <div id="loading-status">
                برقراری ارتباط با سرور
            </div>

        </div>
    `;

    document.body.appendChild(loading);

    return loading;
}

function showLoading(message = "در حال بارگذاری فرماندهی...") {
    const loading = createLoadingScreen();

    loading.classList.remove("hidden");

    const status = $("loading-status");
    const connection = $("loading-connection-text");

    if (status) {
        status.textContent = message;
    }

    if (connection) {
        connection.textContent = "در حال اتصال به تلگرام....";
    }

    const bar = $("loading-progress-bar");

    if (bar) {
        bar.style.width = "15%";

        setTimeout(() => {
            bar.style.width = "45%";
        }, 200);

        setTimeout(() => {
            bar.style.width = "72%";
        }, 600);
    }
}

function updateLoading(message, progress = null) {
    const status = $("loading-status");

    if (status) {
        status.textContent = message;
    }

    const bar = $("loading-progress-bar");

    if (bar && progress !== null) {
        bar.style.width = `${progress}%`;
    }
}

function hideLoading() {
    const loading = $("app-loading");

    if (!loading) {
        return;
    }

    const bar = $("loading-progress-bar");

    if (bar) {
        bar.style.width = "100%";
    }

    setTimeout(() => {
        loading.classList.add("hidden");
    }, 250);
}


/* =========================================================
   API
   ========================================================= */

async function apiRequest(endpoint, options = {}) {
    const url = new URL(endpoint, window.location.origin);

    if (userId) {
        url.searchParams.set("user_id", userId);
    }

    const response = await fetch(url.toString(), {
        method: options.method || "GET",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        body: options.body
            ? JSON.stringify(options.body)
            : undefined
    });

    let data = null;

    try {
        data = await response.json();
    } catch (e) {
        data = {};
    }

    if (!response.ok) {
        const error = new Error(
            data?.message ||
            data?.error ||
            `HTTP ${response.status}`
        );

        error.data = data;
        error.status = response.status;

        throw error;
    }

    return data;
}


/* =========================================================
   PLAYER
   ========================================================= */

async function loadPlayer() {
    if (playerLoading) {
        return;
    }

    playerLoading = true;

    showLoading("در حال دریافت اطلاعات فرماندهی...");

    try {
        if (!userId) {
            updateLoading(
                "شناسه تلگرام پیدا نشد. بازی را از داخل تلگرام باز کنید.",
                100
            );

            showToast(
                "بازی باید از داخل تلگرام اجرا شود.",
                "error"
            );

            return;
        }

        updateLoading(
            "در حال دریافت اطلاعات بازیکن...",
            40
        );

        const data = await apiRequest("/api/player");

        player = data;

        updateLoading(
            "در حال بررسی کشور فرماندهی...",
            65
        );

        /*
         * بسیار مهم:
         * اگر بازیکن قبلاً کشور انتخاب کرده باشد،
         * مستقیماً وارد بازی می‌شود.
         *
         * بنابراین صفحه انتخاب کشور برای چند ثانیه
         * نمایش داده نمی‌شود.
         */

        if (player?.country) {

            updateLoading(
                "فرماندهی شما شناسایی شد...",
                85
            );

            await new Promise(resolve => setTimeout(resolve, 350));

            hideLoading();

            showGame();

        } else {

            updateLoading(
                "فرمانده، کشور خود را انتخاب کنید...",
                90
            );

            await new Promise(resolve => setTimeout(resolve, 250));

            hideLoading();

            showCountrySelection();
        }

    } catch (error) {

        console.error("Player loading error:", error);

        updateLoading(
            "خطا در اتصال به سرور بازی.",
            100
        );

        showToast(
            error.message || "خطا در دریافت اطلاعات بازی",
            "error"
        );

    } finally {
        playerLoading = false;
    }
}


/* =========================================================
   COUNTRIES
   ========================================================= */

async function loadCountries() {
    try {
        const data = await apiRequest("/api/countries");

        if (Array.isArray(data)) {
            countries = {};

            data.forEach(country => {
                if (country.id) {
                    countries[country.id] = country;
                }
            });
        } else {
            countries = data || {};
        }

        return countries;

    } catch (error) {

        console.error("Countries error:", error);

        countries = {};

        return countries;
    }
}


/* =========================================================
   SCREEN CONTROL
   ========================================================= */

function hideAllScreens() {
    document
        .querySelectorAll(".screen")
        .forEach(screen => {
            screen.classList.remove("active");
            screen.style.display = "none";
        });
}

function showOnly(id) {
    hideAllScreens();

    const screen = $(id);

    if (!screen) {
        console.warn(`Screen not found: ${id}`);
        return;
    }

    screen.style.display = "";
    screen.classList.add("active");
}

function showCountrySelection() {
    showOnly("country");

    renderCountrySelection();

    if (player?.country) {
        showGame();
    }
}


/* =========================================================
   COUNTRY SELECTION
   ========================================================= */

function renderCountrySelection() {
    const container =
        document.querySelector("#country-list") ||
        document.querySelector(".country-list") ||
        document.querySelector(".countries-grid");

    if (!container) {
        console.warn("Country list container not found");
        return;
    }

    container.innerHTML = "";

    Object.entries(countries).forEach(([id, country]) => {

        const info = getCountryInfo(id);

        const taken =
            country.taken === true ||
            country.owner_id ||
            country.owner ||
            country.user_id;

        const card = document.createElement("button");

        card.type = "button";
        card.className =
            `country-card ${taken ? "taken" : "available"}`;

        card.dataset.country = id;

        card.innerHTML = `
            <div class="country-card-flag">
                ${info.flag}
            </div>

            <div class="country-card-content">

                <div class="country-card-name">
                    ${escapeHtml(country.name || info.name)}
                </div>

                <div class="country-card-stats">

                    <span>
                        💰
                        ${formatNumber(country.economy || 0)}
                    </span>

                    <span>
                        🪖
                        ${formatNumber(country.army || 0)}
                    </span>

                    <span>
                        👥
                        ${formatNumber(country.population || 0)}
                    </span>

                </div>

                ${
                    taken
                        ? `<div class="country-card-taken">
                            این کشور انتخاب شده است
                           </div>`
                        : `<div class="country-card-status">
                            انتخاب کشور
                           </div>`
                }

            </div>
        `;

        if (taken) {
            card.disabled = true;
        } else {
            card.addEventListener("click", () => {
                selectCountry(id);
            });
        }

        container.appendChild(card);
    });
}

async function selectCountry(countryId) {

    if (!countryId) {
        return;
    }

    const info = getCountryInfo(countryId);

    showToast(
        `در حال انتخاب ${info.flag} ${info.name}...`
    );

    try {

        const data = await apiRequest(
            "/api/select-country"
        );

        /*
         * Backend فعلی endpoint را با GET می‌خواند
         * و country_id را از query دریافت می‌کند.
         */

    } catch (firstError) {

        try {

            const url = new URL(
                "/api/select-country",
                window.location.origin
            );

            url.searchParams.set("user_id", userId);
            url.searchParams.set("country_id", countryId);

            const response = await fetch(
                url.toString()
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message ||
                    data.error ||
                    "انتخاب کشور ناموفق بود"
                );
            }

            player = data.player || data;

            selectedCountry = countryId;

            showCountryPreview(countryId);

        } catch (error) {

            console.error(error);

            if (
                error?.data?.error === "country_taken" ||
                error.message.includes("قبلاً")
            ) {
                showToast(
                    "این کشور توسط بازیکن دیگری انتخاب شده است.",
                    "error"
                );

                await loadCountries();
                renderCountrySelection();

                return;
            }

            showToast(
                error.message || "انتخاب کشور ناموفق بود",
                "error"
            );
        }
    }
}


/* =========================================================
   COUNTRY PREVIEW
   ========================================================= */

function showCountryPreview(countryId) {

    selectedCountry = countryId;

    showOnly("country-preview");

    const info = getCountryInfo(countryId);

    setText(
        "preview-country-name",
        `${info.flag} ${countryName(countryId)}`
    );

    setText(
        "selected-country-flag",
        info.flag
    );

    const image = document.querySelector(
        "#country-preview img"
    );

    if (image && info.image) {
        image.src = info.image;
    }

    createPreviewGlobe(countryId);
}

function createPreviewGlobe(countryId) {

    const container =
        $("preview-globe-container") ||
        $("preview-globe");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const globe = document.createElement("div");

    globe.className = "preview-globe-fallback";

    globe.innerHTML = `
        <div class="globe-circle">
            <span>${countryFlag(countryId)}</span>
        </div>
    `;

    container.appendChild(globe);
}

function enterGame() {

    if (!player?.country && !selectedCountry) {
        showToast(
            "ابتدا یک کشور انتخاب کنید.",
            "error"
        );

        return;
    }

    showGame();
}


/* =========================================================
   MAIN GAME
   ========================================================= */

function showGame() {

    if (!player) {
        return;
    }

    showOnly("game");

    updateGameHeader();

    showGamePage("home");

    updateAllStats();

    startPlayerPolling();
}

function updateGameHeader() {

    const countryId = player?.country;

    if (!countryId) {
        return;
    }

    const info = getCountryInfo(countryId);

    setText(
        "game-country-flag",
        info.flag
    );

    setText(
        "home-country-name",
        countryName(countryId)
    );

    setText(
        "home-country-flag",
        info.flag
    );

    setText(
        "game-country-name",
        countryName(countryId)
    );
}


/* =========================================================
   PAGE NAVIGATION
   ========================================================= */

function getGamePages() {
    return [
        "home",
        "infrastructure",
        "army",
        "war",
        "diplomacy",
        "communications",
        "map",
        "subscription",
        "world-market"
    ];
}

function showGamePage(page) {

    currentPage = page;

    const pages = getGamePages();

    pages.forEach(id => {

        const element = $(id);

        if (!element) {
            return;
        }

        element.classList.remove("active");

        if (id === page) {
            element.style.display = "";
            element.classList.add("active");
        } else {
            element.style.display = "none";
        }
    });

    /*
     * اگر صفحه‌ای در HTML فعلی وجود ندارد،
     * آن را به صورت داینامیک ایجاد می‌کنیم.
     */

    if (!$(page)) {

        if (page === "world-market") {
            createWorldMarketPage();
        }

    }

    const selected = $(page);

    if (selected) {
        selected.style.display = "";
        selected.classList.add("active");
    }

    updateNavState(page);

    if (page === "home") {
        renderHome();
    }

    if (page === "infrastructure") {
        renderInfrastructure();
    }

    if (page === "army") {
        renderArmy();
    }

    if (page === "war") {
        renderWar();
    }

    if (page === "diplomacy") {
        renderDiplomacy();
    }

    if (page === "communications") {
        renderCommunications();
    }

    if (page === "map") {
        setTimeout(() => {
            renderWorldMap();
        }, 100);
    }

    if (page === "subscription") {
        renderSubscription();
    }

    if (page === "world-market") {
        renderWorldMarket();
    }
}

function updateNavState(page) {

    document
        .querySelectorAll(".nav-item")
        .forEach(item => {

            const itemPage =
                item.dataset.page;

            item.classList.toggle(
                "active",
                itemPage === page
            );
        });
}


/* =========================================================
   FOOTER
   ========================================================= */

function setupNavigation() {

    document
        .querySelectorAll(".nav-item")
        .forEach(button => {

            button.addEventListener("click", () => {

                const page =
                    button.dataset.page;

                if (!page) {
                    return;
                }

                showGamePage(page);
            });
        });

    /*
     * نسخه فعلی index.html چهار آیتم دارد.
     * آیتم بازار جهانی را به صورت خودکار اضافه می‌کنیم.
     */

    const nav =
        document.querySelector(".bottom-nav");

    if (nav &&
        !nav.querySelector(
            '[data-page="world-market"]'
        )
    ) {

        const marketButton =
            document.createElement("button");

        marketButton.className = "nav-item";
        marketButton.dataset.page =
            "world-market";

        marketButton.innerHTML = `
            <span>💱</span>
            <small>بازار</small>
        `;

        marketButton.addEventListener(
            "click",
            () => showGamePage("world-market")
        );

        /*
         * قبل از ارتباطات قرار می‌دهیم تا
         * ترتیب کلی RTL حفظ شود.
         */

        const communications =
            nav.querySelector(
                '[data-page="communications"]'
            );

        if (communications) {
            nav.insertBefore(
                marketButton,
                communications
            );
        } else {
            nav.appendChild(marketButton);
        }
    }
}


/* =========================================================
   HOME
   ========================================================= */

function renderHome() {

    if (!player) {
        return;
    }

    const info =
        getCountryInfo(player.country);

    setText(
        "home-country-name",
        countryName(player.country)
    );

    setText(
        "home-country-flag",
        info.flag
    );

    if (info.image) {
        setImage(
            "home-card-photo",
            info.image
        );
    }

    setText(
        "home-money",
        formatNumber(player.money)
    );

    setText(
        "home-income",
        formatNumber(player.daily_income || 0)
    );

    setText(
        "home-manpower",
        formatNumber(player.manpower)
    );

    setText(
        "home-manpower-production",
        `+${formatNumber(
            player.manpower_production || 0
        )}`
    );

    setText(
        "home-power",
        `${formatNumber(
            player.power_used || 0
        )} / ${formatNumber(
            player.power_capacity || 0
        )}`
    );

    setText(
        "home-power-sub",
        `${formatNumber(
            player.power_available || 0
        )} ظرفیت آزاد`
    );

    setText(
        "home-army",
        formatNumber(
            getTotalArmy()
        )
    );

    setText(
        "home-season",
        player.season ||
        "1939"
    );

    setText(
        "home-season-end",
        player.season_end ||
        ""
    );

    renderEconomyPreview();
}

function renderEconomyPreview() {

    const home =
        $("home");

    if (!home) {
        return;
    }

    let container =
        $("home-economy-list");

    if (!container) {

        container =
            document.createElement("div");

        container.id =
            "home-economy-list";

        container.className =
            "economy-preview-grid";

        const target =
            home.querySelector(
                ".home-content"
            ) || home;

        target.appendChild(container);
    }

    const economy =
        player?.economy || {};

    const entries =
        Object.entries(economy).slice(0, 4);

    if (!entries.length) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = entries.map(
        ([key, item]) => {

            const level =
                item.level || 0;

            return `
                <div class="economy-preview-card">

                    <div class="economy-preview-icon">
                        ${getBuildingIcon(key)}
                    </div>

                    <div>
                        <strong>
                            ${escapeHtml(
                                item.name || key
                            )}
                        </strong>

                        <small>
                            سطح ${formatNumber(level)}
                            / 5
                        </small>
                    </div>

                </div>
            `;
        }
    ).join("");
}


/* =========================================================
   ECONOMY
   ========================================================= */

const ECONOMY_ICONS = {
    factory: "🏭",
    agriculture: "🌾",
    mine: "⛏️",
    oil: "🛢️",
    steel: "⚙️",
    trade: "📦",
    bank: "🏦",
    market: "🏪",
    infrastructure: "🏗️",
    industry: "🏭"
};

function getBuildingIcon(key) {
    return ECONOMY_ICONS[key] || "🏢";
}

function renderEconomyPage() {

    let page = $("economy");

    if (!page) {

        page = document.createElement("section");

        page.id = "economy";
        page.className = "screen";

        page.innerHTML = `
            <div class="page-header">
                <h2>اقتصاد کشور</h2>
                <p>
                    توسعه اقتصادی و افزایش درآمد روزانه
                </p>
            </div>

            <div
                id="economy-buildings"
                class="economy-grid"
            ></div>
        `;

        $("game")?.appendChild(page);
    }

    const container =
        $("economy-buildings");

    if (!container) {
        return;
    }

    const economy =
        player?.economy || {};

    container.innerHTML =
        Object.entries(economy)
            .map(([key, item]) => {

                const level =
                    Number(item.level || 0);

                const next =
                    item.next || {};

                const cost =
                    Number(next.cost || 0);

                const income =
                    Number(
                        next.daily_income ||
                        next.income ||
                        0
                    );

                const power =
                    Number(next.power_use || 0);

                const maxed =
                    level >= 5;

                return `
                    <div class="building-card">

                        <div class="building-icon">
                            ${getBuildingIcon(key)}
                        </div>

                        <div class="building-main">

                            <h3>
                                ${escapeHtml(
                                    item.name || key
                                )}
                            </h3>

                            <div class="building-level">
                                سطح
                                ${formatNumber(level)}
                                / 5
                            </div>

                            <div class="building-stats">

                                <span>
                                    💰
                                    ${formatNumber(
                                        item.daily_income ||
                                        item.income ||
                                        0
                                    )}
                                    درآمد روزانه
                                </span>

                                ${
                                    power
                                        ? `<span>
                                            ⚡ ${formatNumber(power)}
                                           </span>`
                                        : ""
                                }

                            </div>

                            ${
                                maxed
                                    ? `
                                        <button
                                            class="upgrade-button disabled"
                                            disabled
                                        >
                                            حداکثر سطح
                                        </button>
                                      `
                                    : `
                                        <button
                                            class="upgrade-button"
                                            onclick="upgradeEconomy('${key}')"
                                        >
                                            ارتقا —
                                            ${formatNumber(cost)}
                                            💰
                                        </button>
                                      `
                            }

                        </div>

                    </div>
                `;

            })
            .join("");
}


/* =========================================================
   INFRASTRUCTURE
   ========================================================= */

const INFRA_GROUPS = {
    power: {
        title: "⚡ برق",
        description:
            "تولید برق مورد نیاز صنایع و ارتش",
        keys: [
            "coal_plant",
            "oil_plant",
            "hydro_plant",
            "nuclear_plant",
            "gas_plant",
            "solar_plant",
            "power_station"
        ]
    },

    manpower: {
        title: "👥 نیروی انسانی",
        description:
            "افزایش تولید و ظرفیت نیروی انسانی",
        keys: [
            "training_center",
            "university",
            "hospital",
            "housing",
            "administration",
            "recruitment_center"
        ]
    },

    military: {
        title: "🪖 زیرساخت نظامی",
        description:
            "توسعه ظرفیت نیروهای زمینی، دریایی و هوایی",
        groups: {
            ground: {
                title: "نیروی زمینی",
                keys: [
                    "barracks",
                    "command_hq"
                ]
            },

            naval: {
                title: "نیروی دریایی",
                keys: [
                    "port",
                    "shipyard"
                ]
            },

            air: {
                title: "نیروی هوایی",
                keys: [
                    "airport",
                    "air_base"
                ]
            }
        }
    }
};

function getInfraData(category) {

    if (!player?.infra) {
        return {};
    }

    /*
     * Backend جدید:
     * player.infra.power
     * player.infra.manpower
     * player.infra.military
     */

    if (
        category === "power" ||
        category === "manpower" ||
        category === "military"
    ) {
        const data =
            player.infra[category];

        if (data && typeof data === "object") {
            return data;
        }
    }

    return player.infra;
}

function renderInfrastructure() {

    const container =
        $("infrastructure");

    if (!container) {
        return;
    }

    setupInfrastructureTabs();

    renderInfrastructureTab();
}

function setupInfrastructureTabs() {

    const infrastructure =
        $("infrastructure");

    if (!infrastructure) {
        return;
    }

    let tabs =
        infrastructure.querySelector(
            ".infra-tabs"
        );

    if (!tabs) {

        tabs =
            document.createElement("div");

        tabs.className =
            "infra-tabs";

        tabs.innerHTML = `
            <button
                class="infra-tab"
                data-infra="power"
            >
                ⚡ برق
            </button>

            <button
                class="infra-tab"
                data-infra="manpower"
            >
                👥 نیروی انسانی
            </button>

            <button
                class="infra-tab"
                data-infra="military"
            >
                🪖 نظامی
            </button>
        `;

        const first =
            infrastructure.firstElementChild;

        if (first) {
            infrastructure.insertBefore(
                tabs,
                first
            );
        } else {
            infrastructure.appendChild(
                tabs
            );
        }

        tabs
            .querySelectorAll(".infra-tab")
            .forEach(tab => {

                tab.addEventListener(
                    "click",
                    () => {

                        currentInfraTab =
                            tab.dataset.infra;

                        renderInfrastructureTab();
                    }
                );
            });
    }

    tabs
        .querySelectorAll(".infra-tab")
        .forEach(tab => {

            tab.classList.toggle(
                "active",
                tab.dataset.infra ===
                currentInfraTab
            );
        });
}

function renderInfrastructureTab() {

    const container =
        $("infrastructure");

    if (!container) {
        return;
    }

    const old =
        container.querySelector(
            ".infra-render-area"
        );

    if (old) {
        old.remove();
    }

    const area =
        document.createElement("div");

    area.className =
        "infra-render-area";

    container.appendChild(area);

    if (currentInfraTab === "military") {
        renderMilitaryInfrastructure(
            area
        );
        return;
    }

    const data =
        getInfraData(
            currentInfraTab
        );

    const keys =
        INFRA_GROUPS[
            currentInfraTab
        ]?.keys || [];

    area.innerHTML = `
        <div class="infra-section-title">
            <h2>
                ${
                    INFRA_GROUPS[
                        currentInfraTab
                    ]?.title || ""
                }
            </h2>

            <p>
                ${
                    INFRA_GROUPS[
                        currentInfraTab
                    ]?.description || ""
                }
            </p>
        </div>

        <div class="infra-grid">
            ${
                keys
                    .map(key =>
                        renderInfraCard(
                            key,
                            data[key] ||
                            player?.infra?.[key]
                        )
                    )
                    .join("")
            }
        </div>
    `;
}

function renderMilitaryInfrastructure(
    container
) {

    const data =
        getInfraData("military");

    let html = `
        <div class="infra-section-title">
            <h2>🪖 زیرساخت نظامی</h2>

            <p>
                توسعه جداگانه نیروهای زمینی،
                دریایی و هوایی
            </p>
        </div>
    `;

    const groups =
        INFRA_GROUPS.military.groups;

    Object.entries(groups)
        .forEach(([groupKey, group]) => {

            html += `
                <div class="military-infra-group">

                    <div class="military-group-title">
                        ${group.title}
                    </div>

                    <div class="infra-grid">
                        ${
                            group.keys
                                .map(key =>
                                    renderInfraCard(
                                        key,
                                        data[key] ||
                                        player?.infra?.[key]
                                    )
                                )
                                .join("")
                        }
                    </div>

                </div>
            `;
        });

    container.innerHTML = html;
}

function renderInfraCard(
    key,
    item
) {

    if (!item) {

        return `
            <div class="building-card unavailable">

                <div class="building-icon">
                    🏗️
                </div>

                <div class="building-main">

                    <h3>
                        ${escapeHtml(key)}
                    </h3>

                    <p>
                        اطلاعات این ساختمان
                        هنوز از سرور دریافت نشده است.
                    </p>

                </div>

            </div>
        `;
    }

    const level =
        Number(item.level || 0);

    const maxLevel =
        Number(
            item.max_level ||
            5
        );

    const next =
        item.next || {};

    const cost =
        Number(next.cost || 0);

    const capacity =
        Number(
            next.capacity ||
            item.current?.capacity ||
            0
        );

    const production =
        Number(
            next.production ||
            item.current?.production ||
            0
        );

    const maxed =
        level >= maxLevel;

    return `
        <div class="building-card infra-card">

            <div class="building-icon">
                ${getInfraIcon(key)}
            </div>

            <div class="building-main">

                <h3>
                    ${escapeHtml(
                        item.name || key
                    )}
                </h3>

                <div class="building-level">
                    سطح
                    ${formatNumber(level)}
                    /
                    ${formatNumber(maxLevel)}
                </div>

                <div class="building-stats">

                    ${
                        capacity
                            ? `<span>
                                📦 ظرفیت:
                                ${formatNumber(capacity)}
                               </span>`
                            : ""
                    }

                    ${
                        production
                            ? `<span>
                                ⚡ تولید:
                                ${formatNumber(production)}
                               </span>`
                            : ""
                    }

                    ${
                        next.power_use
                            ? `<span>
                                ⚡ مصرف:
                                ${formatNumber(
                                    next.power_use
                                )}
                               </span>`
                            : ""
                    }

                </div>

                ${
                    maxed
                        ? `
                            <button
                                class="upgrade-button disabled"
                                disabled
                            >
                                حداکثر سطح
                            </button>
                          `
                        : `
                            <button
                                class="upgrade-button"
                                onclick="upgradeInfra('${key}')"
                            >
                                ارتقا —
                                ${formatNumber(cost)}
                                💰
                            </button>
                          `
                }

            </div>

        </div>
    `;
}

function getInfraIcon(key) {

    const icons = {

        coal_plant: "🏭",
        oil_plant: "🛢️",
        hydro_plant: "💧",
        nuclear_plant: "☢️",
        gas_plant: "🔥",
        solar_plant: "☀️",
        power_station: "⚡",

        training_center: "🎖️",
        university: "🎓",
        hospital: "🏥",
        housing: "🏠",
        administration: "🏛️",
        recruitment_center: "👥",

        barracks: "🪖",
        command_hq: "🏢",

        port: "⚓",
        shipyard: "🚢",

        airport: "✈️",
        air_base: "🛩️"
    };

    return icons[key] || "🏗️";
}


/* =========================================================
   UPGRADE
   ========================================================= */

async function upgradeInfra(category) {

    try {

        showToast(
            "در حال ارتقای زیرساخت..."
        );

        const url =
            new URL(
                "/api/upgrade-infra",
                window.location.origin
            );

        url.searchParams.set(
            "user_id",
            userId
        );

        url.searchParams.set(
            "category",
            category
        );

        const response =
            await fetch(
                url.toString()
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.message ||
                data.error ||
                "ارتقا ناموفق بود"
            );
        }

        player =
            data.player || data;

        showToast(
            "زیرساخت با موفقیت ارتقا یافت.",
            "success"
        );

        updateAllStats();
        renderInfrastructure();

    } catch (error) {

        console.error(error);

        showToast(
            error.message ||
            "ارتقای زیرساخت انجام نشد.",
            "error"
        );
    }
}

async function upgradeEconomy(category) {

    try {

        showToast(
            "در حال توسعه ساختمان اقتصادی..."
        );

        const url =
            new URL(
                "/api/upgrade-economy",
                window.location.origin
            );

        url.searchParams.set(
            "user_id",
            userId
        );

        url.searchParams.set(
            "category",
            category
        );

        const response =
            await fetch(
                url.toString()
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.message ||
                data.error ||
                "ارتقا ناموفق بود"
            );
        }

        player =
            data.player || data;

        showToast(
            "ساختمان اقتصادی ارتقا یافت.",
            "success"
        );

        updateAllStats();

        if (
            currentPage ===
            "world-market"
        ) {
            renderWorldMarket();
        }

        renderEconomyPage();

    } catch (error) {

        console.error(error);

        showToast(
            error.message ||
            "ارتقای اقتصادی انجام نشد.",
            "error"
        );
    }
}


/* =========================================================
   ARMY
   ========================================================= */

function getTotalArmy() {

    if (!player) {
        return 0;
    }

    const units =
        player.units || {};

    return Object.values(units)
        .reduce(
            (sum, value) =>
                sum + Number(value || 0),
            0
        );
}

function renderArmy() {

    const container =
        $("army-units");

    if (!container) {
        return;
    }

    const units =
        player?.units || {};

    container.innerHTML =
        Object.entries(ARMY_UNITS)
            .map(([id, unit]) => {

                const count =
                    Number(
                        units[id] || 0
                    );

                const infra =
                    player?.infra?.[unit.infra];

                const capacity =
                    Number(
                        infra?.current?.capacity ||
                        0
                    );

                return `
                    <div class="army-unit-card">

                        <div class="army-unit-icon">
                            ${unit.icon}
                        </div>

                        <div class="army-unit-info">

                            <h3>
                                ${unit.name}
                            </h3>

                            <div>
                                تعداد:
                                ${formatNumber(count)}
                                ${
                                    capacity
                                        ? ` / ${formatNumber(capacity)}`
                                        : ""
                                }
                            </div>

                            <small>
                                💰 ${formatNumber(unit.cost)}
                                &nbsp;
                                👥 ${formatNumber(unit.manpower)}
                                &nbsp;
                                ⚡ ${formatNumber(unit.power)}
                            </small>

                        </div>

                        <button
                            class="train-unit-button"
                            onclick="trainUnit('${id}')"
                        >
                            آموزش
                        </button>

                    </div>
                `;

            })
            .join("");
}

async function trainUnit(unitId) {

    const unit =
        ARMY_UNITS[unitId];

    if (!unit) {
        return;
    }

    try {

        const url =
            new URL(
                "/api/train-unit",
                window.location.origin
            );

        url.searchParams.set(
            "user_id",
            userId
        );

        url.searchParams.set(
            "unit_id",
            unitId
        );

        const response =
            await fetch(
                url.toString()
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.message ||
                data.error ||
                "آموزش نیرو ناموفق بود"
            );
        }

        player =
            data.player || data;

        showToast(
            `${unit.name} آموزش داده شد.`,
            "success"
        );

        updateAllStats();
        renderArmy();

    } catch (error) {

        showToast(
            error.message ||
            "آموزش نیرو انجام نشد.",
            "error"
        );
    }
}


/* =========================================================
   WAR
   ========================================================= */

function renderWar() {

    const container =
        $("war-target-list");

    if (!container) {
        return;
    }

    const own =
        player?.country;

    container.innerHTML =
        Object.entries(countries)
            .filter(
                ([id]) => id !== own
            )
            .map(([id, country]) => {

                return `
                    <div class="war-target-card">

                        <div>
                            <strong>
                                ${countryFlag(id)}
                                ${escapeHtml(
                                    country.name ||
                                    countryName(id)
                                )}
                            </strong>
                        </div>

                        <button
                            onclick="attackCountry('${id}', 'land')"
                        >
                            ⚔️ حمله
                        </button>

                    </div>
                `;
            })
            .join("");
}

async function attackCountry(
    target,
    attackType = "land"
) {

    try {

        const url =
            new URL(
                "/api/attack",
                window.location.origin
            );

        url.searchParams.set(
            "user_id",
            userId
        );

        url.searchParams.set(
            "target",
            target
        );

        url.searchParams.set(
            "attack_type",
            attackType
        );

        const response =
            await fetch(
                url.toString()
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.message ||
                data.error ||
                "عملیات ناموفق بود"
            );
        }

        showToast(
            data.message ||
            "عملیات آغاز شد.",
            "success"
        );

    } catch (error) {

        showToast(
            error.message ||
            "عملیات انجام نشد.",
            "error"
        );
    }
}


/* =========================================================
   DIPLOMACY
   ========================================================= */

async function renderDiplomacy() {

    const target =
        $("diplomacy-target");

    if (target) {

        target.innerHTML =
            Object.entries(countries)
                .filter(
                    ([id]) =>
                        id !== player?.country
                )
                .map(
                    ([id, country]) =>
                        `
                        <option value="${id}">
                            ${countryFlag(id)}
                            ${escapeHtml(
                                country.name ||
                                countryName(id)
                            )}
                        </option>
                        `
                )
                .join("");
    }

    await loadDiplomacy();
}

async function loadDiplomacy() {

    try {

        const data =
            await apiRequest(
                "/api/diplomacy"
            );

        renderDiplomacyLists(data);

    } catch (error) {

        console.error(
            "Diplomacy error:",
            error
        );
    }
}

function renderDiplomacyLists(data) {

    const treaties =
        $("diplomacy-treaties");

    const sent =
        $("diplomacy-sent");

    if (treaties) {

        treaties.innerHTML =
            (data.treaties || [])
                .map(
                    treaty =>
                        `
                        <div class="diplomacy-card">
                            🤝
                            ${escapeHtml(
                                treaty.country_a
                            )}
                            —
                            ${escapeHtml(
                                treaty.country_b
                            )}
                        </div>
                        `
                )
                .join("") ||
            `<div class="empty-state">
                پیمان فعالی وجود ندارد.
             </div>`;
    }

    if (sent) {

        sent.innerHTML =
            (data.sent || [])
                .map(
                    proposal =>
                        `
                        <div class="diplomacy-card">
                            📩
                            پیشنهاد ارسال شده
                        </div>
                        `
                )
                .join("") ||
            `<div class="empty-state">
                پیشنهادی ارسال نشده است.
             </div>`;
    }
}

async function proposeTreaty() {

    const target =
        $("diplomacy-target")?.value;

    const type =
        $("diplomacy-type")?.value ||
        "non_aggression";

    const duration =
        $("diplomacy-duration")?.value ||
        "30";

    if (!target) {
        showToast(
            "کشور مقصد را انتخاب کنید.",
            "error"
        );

        return;
    }

    try {

        const url =
            new URL(
                "/api/propose-treaty",
                window.location.origin
            );

        url.searchParams.set(
            "user_id",
            userId
        );

        url.searchParams.set(
            "target",
            target
        );

        url.searchParams.set(
            "treaty_type",
            type
        );

        url.searchParams.set(
            "duration",
            duration
        );

        const response =
            await fetch(
                url.toString()
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.message ||
                data.error ||
                "ارسال پیشنهاد ناموفق بود"
            );
        }

        showToast(
            data.message ||
            "پیشنهاد ارسال شد.",
            "success"
        );

        loadDiplomacy();

    } catch (error) {

        showToast(
            error.message ||
            "ارسال پیشنهاد انجام نشد.",
            "error"
        );
    }
}


/* =========================================================
   COMMUNICATIONS
   ========================================================= */

function renderCommunications() {

    renderNews();

    renderContacts();
}

async function renderNews() {

    const list =
        $("news-list");

    if (!list) {
        return;
    }

    try {

        const data =
            await apiRequest(
                "/api/news"
            );

        const news =
            Array.isArray(data)
                ? data
                : data.news || [];

        list.innerHTML =
            news.map(
                item =>
                    `
                    <article class="news-card">

                        <div class="news-card-header">
                            <span>
                                📰
                            </span>

                            <small>
                                ${escapeHtml(
                                    item.date ||
                                    ""
                                )}
                            </small>
                        </div>

                        <h3>
                            ${escapeHtml(
                                item.title ||
                                "خبر"
                            )}
                        </h3>

                        <p>
                            ${escapeHtml(
                                item.text ||
                                item.description ||
                                ""
                            )}
                        </p>

                    </article>
                    `
            ).join("") ||
            `
                <div class="empty-state">
                    خبری برای نمایش وجود ندارد.
                </div>
            `;

    } catch (error) {

        list.innerHTML = `
            <div class="empty-state">
                دریافت اخبار ممکن نشد.
            </div>
        `;
    }
}

function renderContacts() {

    const list =
        $("contact-list");

    if (!list) {
        return;
    }

    list.innerHTML =
        Object.entries(countries)
            .filter(
                ([id]) =>
                    id !== player?.country
            )
            .map(
                ([id, country]) =>
                    `
                    <div class="contact-card">

                        <div class="contact-country">
                            <span>
                                ${countryFlag(id)}
                            </span>

                            <strong>
                                ${escapeHtml(
                                    country.name ||
                                    countryName(id)
                                )}
                            </strong>
                        </div>

                        <button
                            onclick="messageCountry('${id}')"
                        >
                            💬 پیام
                        </button>

                    </div>
                    `
            )
            .join("");
}

function messageCountry(countryId) {

    const info =
        getCountryInfo(countryId);

    /*
     * Backend فعلی هنوز endpoint مستقل
     * برای پیام مستقیم کشور ندارد.
     *
     * بنابراین فعلاً پیام را دریافت می‌کنیم
     * و بعداً به API پیام متصل می‌کنیم.
     */

    const message =
        window.prompt(
            `پیام به ${info.flag} ${info.name}:`
        );

    if (!message?.trim()) {
        return;
    }

    showToast(
        "سیستم پیام‌رسانی کشورها در حال آماده‌سازی است."
    );
}


/* =========================================================
   WORLD MAP
   ========================================================= */

async function renderWorldMap() {

    const container =
        $("map-globe");

    if (!container) {
        return;
    }

    if (
        typeof d3 === "undefined" ||
        typeof topojson === "undefined"
    ) {

        container.innerHTML = `
            <div class="map-error">
                کتابخانه نقشه بارگذاری نشده است.
            </div>
        `;

        return;
    }

    container.innerHTML = "";

    const width =
        container.clientWidth || 700;

    const height =
        container.clientHeight || 500;

    worldProjection =
        d3.geoOrthographic()
            .scale(
                Math.min(width, height) * 0.43
            )
            .translate([
                width / 2,
                height / 2
            ])
            .clipAngle(90);

    worldPath =
        d3.geoPath()
            .projection(
                worldProjection
            );

    worldSvg =
        d3.select(container)
            .append("svg")
            .attr("width", width)
            .attr("height", height);

    try {

        const response =
            await fetch(
                "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
            );

        const world =
            await response.json();

        const land =
            topojson.feature(
                world,
                world.objects.countries
            );

        worldSvg
            .append("path")
            .datum(land)
            .attr(
                "class",
                "world-land"
            )
            .attr(
                "d",
                worldPath
            );

        /*
         * مرزها فقط برای کشورهایی که در بازی هستند.
         */

        const playable =
            Object.keys(countries);

        const selected =
            player?.country;

        worldSvg
            .selectAll(
                ".country-shape"
            )
            .data(
                land.features
            )
            .enter()
            .append("path")
            .attr(
                "class",
                "country-shape"
            )
            .attr(
                "d",
                worldPath
            )
            .attr(
                "data-country",
                d => findCountryFromMapFeature(d)
            )
            .classed(
                "playable",
                d => {
                    const id =
                        findCountryFromMapFeature(d);

                    return playable.includes(id);
                }
            )
            .classed(
                "own-country",
                d => {
                    const id =
                        findCountryFromMapFeature(d);

                    return id === selected;
                }
            )
            .classed(
                "taken-country",
                d => {

                    const id =
                        findCountryFromMapFeature(d);

                    return (
                        playable.includes(id) &&
                        id !== selected &&
                        isCountryTaken(id)
                    );
                }
            )
            .on(
                "click",
                (_, d) => {

                    const id =
                        findCountryFromMapFeature(d);

                    if (id) {
                        showMapCountryInfo(id);
                    }
                }
            );

        worldZoom =
            d3.zoom()
                .scaleExtent([
                    0.7,
                    3
                ])
                .on(
                    "zoom",
                    event => {

                        const transform =
                            event.transform;

                        worldProjection.scale(
                            Math.min(
                                width,
                                height
                            ) * 0.43 *
                            transform.k
                        );

                        worldPath =
                            d3.geoPath()
                                .projection(
                                    worldProjection
                                );

                        worldSvg
                            .selectAll("path")
                            .attr(
                                "d",
                                worldPath
                            );
                    }
                );

        worldSvg.call(
            worldZoom
        );

        worldMapReady = true;

        setupMapControls();

    } catch (error) {

        console.error(
            "World map error:",
            error
        );

        container.innerHTML = `
            <div class="map-error">
                دریافت نقشه جهان ممکن نشد.
            </div>
        `;
    }
}

function findCountryFromMapFeature(
    feature
) {

    /*
     * world-atlas از numeric ISO IDs استفاده می‌کند.
     *
     * این جدول برای کشورهای اصلی بازی است.
     */

    const map = {
        "276": "germany",
        "826": "britain",
        "643": "ussr",
        "840": "usa",
        "250": "france",
        "380": "italy",
        "156": "china",
        "392": "japan"
    };

    return map[
        String(feature.id)
    ] || null;
}

function isCountryTaken(countryId) {

    const country =
        countries[countryId];

    if (!country) {
        return false;
    }

    return Boolean(
        country.taken ||
        country.owner_id ||
        country.owner ||
        country.user_id
    );
}

function setupMapControls() {

    const zoomIn =
        $("map-zoom-in");

    const zoomOut =
        $("map-zoom-out");

    const reset =
        $("map-reset");

    if (zoomIn) {

        zoomIn.onclick = () => {

            if (!worldSvg || !worldZoom) {
                return;
            }

            worldSvg
                .transition()
                .duration(350)
                .call(
                    worldZoom.scaleBy,
                    1.35
                );
        };
    }

    if (zoomOut) {

        zoomOut.onclick = () => {

            if (!worldSvg || !worldZoom) {
                return;
            }

            worldSvg
                .transition()
                .duration(350)
                .call(
                    worldZoom.scaleBy,
                    0.75
                );
        };
    }

    if (reset) {

        reset.onclick = () => {

            if (!worldSvg || !worldZoom) {
                return;
            }

            worldSvg
                .transition()
                .duration(500)
                .call(
                    worldZoom.transform,
                    d3.zoomIdentity
                );
        };
    }
}

function showMapCountryInfo(
    countryId
) {

    const panel =
        $("map-info-panel");

    if (!panel) {
        return;
    }

    const info =
        getCountryInfo(countryId);

    const country =
        countries[countryId] || {};

    setText(
        "map-info-flag",
        info.flag
    );

    setText(
        "map-info-name",
        country.name ||
        info.name
    );

    let status =
        "کشور قابل بازی";

    if (
        countryId ===
        player?.country
    ) {
        status =
            "کشور شما";
    } else if (
        isCountryTaken(countryId)
    ) {
        status =
            "تحت فرمان بازیکن دیگر";
    }

    setText(
        "map-info-status",
        status
    );

    setText(
        "map-info-desc",
        country.description ||
        "اطلاعات این کشور در حال حاضر محدود است."
    );

    panel.classList.add("active");
}


/* =========================================================
   WORLD MARKET
   ========================================================= */

function createWorldMarketPage() {

    if ($("world-market")) {
        return;
    }

    const page =
        document.createElement("section");

    page.id =
        "world-market";

    page.className =
        "screen";

    page.innerHTML = `
        <div class="page-header">

            <h2>
                💱 بازار جهانی
            </h2>

            <p>
                تجارت، منابع و اقتصاد بین‌المللی
            </p>

        </div>

        <div
            id="market-content"
            class="market-grid"
        ></div>
    `;

    $("game")?.appendChild(page);
}

function renderWorldMarket() {

    createWorldMarketPage();

    const container =
        $("market-content");

    if (!container) {
        return;
    }

    const money =
        Number(player?.money || 0);

    const dailyIncome =
        Number(
            player?.daily_income || 0
        );

    const resources = [
        {
            name: "فولاد",
            icon: "⚙️",
            price: 120
        },
        {
            name: "نفت",
            icon: "🛢️",
            price: 180
        },
        {
            name: "زغال‌سنگ",
            icon: "⛏️",
            price: 75
        },
        {
            name: "غلات",
            icon: "🌾",
            price: 60
        },
        {
            name: "تجهیزات صنعتی",
            icon: "🏭",
            price: 250
        },
        {
            name: "مواد اولیه",
            icon: "📦",
            price: 100
        }
    ];

    container.innerHTML = `

        <div class="market-balance-card">

            <span>
                موجودی خزانه
            </span>

            <strong>
                ${formatNumber(money)}
                💰
            </strong>

            <small>
                درآمد روزانه:
                ${formatNumber(dailyIncome)}
            </small>

        </div>

        <div class="market-items">

            ${
                resources
                    .map(resource => `
                        <div class="market-item">

                            <div class="market-icon">
                                ${resource.icon}
                            </div>

                            <div class="market-info">

                                <strong>
                                    ${resource.name}
                                </strong>

                                <span>
                                    قیمت:
                                    ${formatNumber(
                                        resource.price
                                    )}
                                    💰
                                </span>

                            </div>

                            <button
                                onclick="marketBuy('${resource.name}')"
                            >
                                خرید
                            </button>

                        </div>
                    `)
                    .join("")
            }

        </div>
    `;
}

function marketBuy(resource) {

    showToast(
        `بازار جهانی: خرید ${resource} در نسخه بعدی فعال می‌شود.`
    );
}


/* =========================================================
   SUBSCRIPTION
   ========================================================= */

function renderSubscription() {

    const page =
        $("subscription");

    if (!page) {
        return;
    }

    const content =
        page.querySelector(
            ".subscription-content"
        ) || page;

    /*
     * فقط اگر صفحه خالی باشد
     * محتوای مدرن ایجاد می‌کنیم.
     */

    if (
        !content.dataset.ready
    ) {

        content.dataset.ready = "1";

        content.innerHTML = `

            <div class="subscription-header">

                <div class="subscription-icon">
                    ♛
                </div>

                <h2>
                    اشتراک فرماندهی
                </h2>

                <p>
                    امکانات ویژه برای فرماندهان
                </p>

            </div>

            <div class="subscription-plans">

                <div class="subscription-card">

                    <h3>
                        فرمانده
                    </h3>

                    <div class="subscription-price">
                        رایگان
                    </div>

                    <ul>
                        <li>✔ مدیریت کشور</li>
                        <li>✔ توسعه اقتصاد</li>
                        <li>✔ توسعه ارتش</li>
                        <li>✔ دیپلماسی</li>
                    </ul>

                    <button
                        disabled
                    >
                        فعال
                    </button>

                </div>

                <div class="subscription-card premium">

                    <h3>
                        فرمانده ویژه
                    </h3>

                    <div class="subscription-price">
                        به‌زودی
                    </div>

                    <ul>
                        <li>✔ امکانات اقتصادی ویژه</li>
                        <li>✔ گزارش‌های پیشرفته</li>
                        <li>✔ امکانات دیپلماسی بیشتر</li>
                        <li>✔ نشان فرمانده ویژه</li>
                    </ul>

                    <button
                        onclick="showToast('اشتراک ویژه به‌زودی فعال می‌شود.')"
                    >
                        به‌زودی
                    </button>

                </div>

            </div>
        `;
    }
}


/* =========================================================
   STATS
   ========================================================= */

function updateAllStats() {

    if (!player) {
        return;
    }

    renderHome();

    if (
        currentPage ===
        "infrastructure"
    ) {
        renderInfrastructure();
    }

    if (
        currentPage ===
        "army"
    ) {
        renderArmy();
    }

    if (
        currentPage ===
        "economy"
    ) {
        renderEconomyPage();
    }
}

function startPlayerPolling() {

    if (statsInterval) {
        clearInterval(
            statsInterval
        );
    }

    statsInterval =
        setInterval(
            refreshPlayerSilently,
            15000
        );
}

async function refreshPlayerSilently() {

    if (!userId) {
        return;
    }

    try {

        const data =
            await apiRequest(
                "/api/player"
            );

        if (data) {
            player = data;
            updateAllStats();
        }

    } catch (error) {

        console.warn(
            "Silent player refresh failed:",
            error
        );
    }
}


/* =========================================================
   EVENT BINDINGS
   ========================================================= */

function setupButtons() {

    const enter =
        $("enter-game-button");

    if (enter) {
        enter.addEventListener(
            "click",
            enterGame
        );
    }

    const back =
        $("preview-back-button");

    if (back) {

        back.addEventListener(
            "click",
            () => {

                showCountrySelection();

            }
        );
    }

    const closeMap =
        $("map-info-close");

    if (closeMap) {

        closeMap.addEventListener(
            "click",
            () => {

                $("map-info-panel")
                    ?.classList
                    .remove("active");

            }
        );
    }

    const notificationButtons =
        document.querySelectorAll(
            "#notification-button, #game-notification-button"
        );

    notificationButtons.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    showToast(
                        "در حال حاضر اعلان جدیدی ندارید."
                    );

                }
            );

        }
    );

    const economyActions =
        document.querySelectorAll(
            "[data-section='economy']"
        );

    economyActions.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    if (!$("economy")) {
                        renderEconomyPage();
                    }

                    showGamePage(
                        "economy"
                    );

                }
            );
        }
    );

    const infrastructureActions =
        document.querySelectorAll(
            "[data-section='infrastructure']"
        );

    infrastructureActions.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    showGamePage(
                        "infrastructure"
                    );

                }
            );
        }
    );

    const armyActions =
        document.querySelectorAll(
            "[data-section='army']"
        );

    armyActions.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    showGamePage(
                        "army"
                    );

                }
            );
        }
    );
}


/* =========================================================
   GLOBAL BACK BUTTON
   ========================================================= */

function setupBackButtons() {

    document
        .querySelectorAll(
            "[data-back]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    showGamePage("home");

                }
            );
        });
}


/* =========================================================
   WINDOW RESIZE
   ========================================================= */

window.addEventListener(
    "resize",
    () => {

        if (
            currentPage === "map" &&
            worldMapReady
        ) {
            renderWorldMap();
        }

    }
);


/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.selectCountry =
    selectCountry;

window.enterGame =
    enterGame;

window.upgradeInfra =
    upgradeInfra;

window.upgradeEconomy =
    upgradeEconomy;

window.trainUnit =
    trainUnit;

window.attackCountry =
    attackCountry;

window.proposeTreaty =
    proposeTreaty;

window.messageCountry =
    messageCountry;

window.marketBuy =
    marketBuy;


/* =========================================================
   INIT
   ========================================================= */

async function init() {

    createLoadingScreen();

    showLoading(
        "در حال اتصال به فرماندهی..."
    );

    setupNavigation();
    setupButtons();
    setupBackButtons();

    updateLoading(
        "در حال دریافت فهرست کشورها...",
        25
    );

    await loadCountries();

    updateLoading(
        "در حال شناسایی فرمانده...",
        55
    );

    await loadPlayer();

}


/* =========================================================
   START
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    init
);
