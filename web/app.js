/* =========================================================
   WW2 TELEGRAM GAME
   app.js
   ========================================================= */

"use strict";

/* =========================================================
   Telegram
   ========================================================= */

const tg = window.Telegram?.WebApp || null;

if (tg) {
    try {
        tg.ready();
        tg.expand();
        tg.enableClosingConfirmation?.();
    } catch (error) {
        console.warn("Telegram WebApp init error:", error);
    }
}

/* =========================================================
   Global State
   ========================================================= */

let userId = null;
let player = null;
let countries = [];
let selectedCountry = null;
let currentPage = "home";
let currentInfraTab = "power";
let loadingFinished = false;

const API_BASE = "";

/* =========================================================
   Helpers
   ========================================================= */

function $(selector) {
    return document.querySelector(selector);
}

function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatNumber(value) {
    const number = Number(value || 0);

    return Math.round(number).toLocaleString("fa-IR");
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getCountryData(countryId) {
    return countries.find(country => country.id === countryId);
}

function countryName(countryId) {
    const country = getCountryData(countryId);

    if (!country) {
        return countryId || "کشور";
    }

    return country.name || countryId;
}

function countryFlag(countryId) {
    const country = getCountryData(countryId);

    if (!country) {
        return "🌍";
    }

    return country.flag || "🌍";
}

function showToast(message, type = "info") {
    let toast = $("#game-toast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "game-toast";

        Object.assign(toast.style, {
            position: "fixed",
            left: "50%",
            bottom: "90px",
            transform: "translateX(-50%)",
            zIndex: "99999",
            padding: "12px 18px",
            borderRadius: "12px",
            background: "rgba(15,18,22,.96)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,.15)",
            boxShadow: "0 10px 35px rgba(0,0,0,.45)",
            fontSize: "13px",
            maxWidth: "85%",
            textAlign: "center",
            transition: "opacity .25s ease"
        });

        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = "1";

    clearTimeout(toast._timer);

    toast._timer = setTimeout(() => {
        toast.style.opacity = "0";
    }, 2600);
}

/* =========================================================
   Loading Screen
   ========================================================= */

function setLoadingText(text) {
    const elements = [
        $("#loading-text"),
        $("#connection-text"),
        $("#loading-message")
    ];

    for (const element of elements) {
        if (element) {
            element.textContent = text;
        }
    }
}

function showLoading(text = "در حال اتصال به تلگرام....") {
    const loading = $("#loading");

    if (!loading) {
        return;
    }

    loading.classList.remove("hidden");
    loading.style.display = "flex";
    loading.setAttribute("aria-hidden", "false");

    setLoadingText(text);
}

function hideLoading() {
    const loading = $("#loading");

    if (!loading) {
        return;
    }

    loading.classList.add("hidden");
    loading.style.display = "none";
    loading.setAttribute("aria-hidden", "true");

    loadingFinished = true;
}

/* =========================================================
   User ID
   ========================================================= */

function getTelegramUserId() {
    try {
        if (
            tg &&
            tg.initDataUnsafe &&
            tg.initDataUnsafe.user &&
            tg.initDataUnsafe.user.id
        ) {
            return String(tg.initDataUnsafe.user.id);
        }
    } catch (error) {
        console.warn("Telegram user error:", error);
    }

    /*
       برای تست مستقیم در مرورگر.
       اگر داخل تلگرام اجرا شود، Telegram ID واقعی استفاده می‌شود.
    */

    const savedTestId = localStorage.getItem("ww2_test_user_id");

    if (savedTestId) {
        return savedTestId;
    }

    const generated = "test_" + Date.now();

    localStorage.setItem("ww2_test_user_id", generated);

    return generated;
}

/* =========================================================
   API
   ========================================================= */

async function apiGet(path, params = {}) {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (
            value !== undefined &&
            value !== null &&
            value !== ""
        ) {
            query.set(key, value);
        }
    }

    const separator = path.includes("?") ? "&" : "?";

    const url =
        API_BASE +
        path +
        (query.toString()
            ? separator + query.toString()
            : "");

    const response = await fetch(url, {
        method: "GET",
        cache: "no-store"
    });

    let data = null;

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        const error = new Error(
            data.message ||
            data.error ||
            "خطا در ارتباط با سرور"
        );

        error.status = response.status;
        error.data = data;

        throw error;
    }

    return data;
}

/* =========================================================
   Countries
   ========================================================= */

async function loadCountries() {
    try {
        const data = await apiGet("/api/countries");

        if (Array.isArray(data)) {
            countries = data;
        } else if (
            data &&
            Array.isArray(data.countries)
        ) {
            countries = data.countries;
        } else {
            countries = [];
        }

        renderCountrySelection();

        return countries;
    } catch (error) {
        console.error("Countries error:", error);

        showToast(
            "دریافت فهرست کشورها انجام نشد."
        );

        return [];
    }
}

/* =========================================================
   Player
   ========================================================= */

async function loadPlayer() {
    if (!userId) {
        throw new Error("شناسه بازیکن وجود ندارد.");
    }

    const data = await apiGet("/api/player", {
        user_id: userId
    });

    player = data;

    return data;
}

/* =========================================================
   SCREEN CONTROL
   ========================================================= */

/*
   مهم:
   مشکل نسخه قبلی این بود که فقط active تغییر می‌کرد
   ولی hidden باقی می‌ماند.

   این تابع hidden را هم حذف می‌کند.
*/

function showOnly(id) {
    const screens = $all(".screen");

    screens.forEach(screen => {
        const isTarget = screen.id === id;

        screen.classList.toggle("active", isTarget);
        screen.classList.toggle("hidden", !isTarget);

        if (isTarget) {
            screen.style.display = "";
        } else {
            screen.style.display = "none";
        }
    });
}

/* =========================================================
   GAME PAGE CONTROL
   ========================================================= */

function showGamePage(pageId) {
    const pages = $all(".game-page");

    pages.forEach(page => {
        const isTarget = page.id === pageId;

        page.classList.toggle("active", isTarget);
        page.classList.toggle("hidden", !isTarget);

        if (isTarget) {
            page.style.display = "";
        } else {
            page.style.display = "none";
        }
    });

    currentPage = pageId;

    $all(".nav-item").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.page === pageId
        );
    });

    if (pageId === "home") {
        renderHome();
    }

    if (pageId === "infrastructure") {
        renderInfrastructure();
    }

    if (pageId === "army") {
        renderArmy();
    }

    if (pageId === "war") {
        renderWar();
    }

    if (pageId === "diplomacy") {
        loadDiplomacy();
    }

    if (pageId === "communications") {
        loadCommunications();
    }

    if (pageId === "map") {
        renderWorldMap();
    }

    if (pageId === "subscription") {
        renderSubscription();
    }

    if (pageId === "market") {
        renderWorldMarket();
    }
}

/* =========================================================
   Country Selection
   ========================================================= */

function renderCountrySelection() {
    const grid =
        document.querySelector(".country-grid");

    if (!grid) {
        return;
    }

    if (!countries.length) {
        grid.innerHTML = `
            <div class="empty-state">
                اطلاعات کشورها دریافت نشد.
            </div>
        `;

        return;
    }

    grid.innerHTML = countries.map(country => {
        const taken = Boolean(country.taken);

        return `
            <button
                class="country-card ${taken ? "taken" : ""}"
                data-country-card="${escapeHtml(country.id)}"
                ${taken ? "disabled" : ""}
            >

                <div class="country-card-flag">
                    ${escapeHtml(country.flag || "🌍")}
                </div>

                <div class="country-card-info">

                    <strong>
                        ${escapeHtml(country.name || country.id)}
                    </strong>

                    <span>
                        ${
                            taken
                                ? "این کشور انتخاب شده است"
                                : "انتخاب کشور"
                        }
                    </span>

                </div>

                <div class="country-card-status">
                    ${
                        taken
                            ? "🔒"
                            : "›"
                    }
                </div>

            </button>
        `;
    }).join("");

    $all("[data-country-card]").forEach(card => {
        card.addEventListener("click", () => {
            if (card.disabled) {
                return;
            }

            const id = card.dataset.countryCard;

            openCountryPreview(id);
        });
    });
}

/* =========================================================
   Country Preview
   ========================================================= */

function openCountryPreview(countryId) {
    const country = getCountryData(countryId);

    if (!country) {
        return;
    }

    selectedCountry = country;

    showOnly("country-preview");

    const flag = $("#selected-country-flag");
    const name = $("#preview-country-name");

    if (flag) {
        flag.textContent =
            country.flag || "🌍";
    }

    if (name) {
        name.textContent =
            country.name || country.id;
    }

    renderPreviewGlobe(countryId);
}

function renderPreviewGlobe(countryId) {
    const container =
        $("#preview-globe-container");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const globe = document.createElement("div");

    globe.id = "preview-globe";

    globe.className = "preview-globe-fallback";

    globe.innerHTML = `
        <div class="preview-earth">
            🌍
        </div>

        <div class="preview-location">
            ${escapeHtml(countryName(countryId))}
        </div>
    `;

    container.appendChild(globe);
}

/* =========================================================
   Select Country
   ========================================================= */

async function selectCountry(countryId) {
    try {
        showLoading(
            "در حال ثبت کشور فرماندهی..."
        );

        const data = await apiGet(
            "/api/select-country",
            {
                user_id: userId,
                country: countryId
            }
        );

        if (!data.success) {
            throw new Error(
                data.message ||
                "انتخاب کشور انجام نشد."
            );
        }

        player = data.player;

        selectedCountry =
            getCountryData(countryId);

        await loadCountries();

        hideLoading();

        enterGame();

    } catch (error) {
        console.error(
            "Select country error:",
            error
        );

        hideLoading();

        if (
            error.data &&
            error.data.error === "country_taken"
        ) {
            showToast(
                "این کشور قبلاً توسط بازیکن دیگری انتخاب شده است."
            );

            await loadCountries();

            showOnly("country");

            return;
        }

        showToast(
            error.message ||
            "انتخاب کشور انجام نشد."
        );
    }
}

/* =========================================================
   Enter Game
   ========================================================= */

function enterGame() {
    if (!player || !player.country) {
        showOnly("country");
        return;
    }

    showOnly("game");

    updateGameHeader();

    setupNavigation();

    showGamePage("home");

    renderHome();
}

/* =========================================================
   Header
   ========================================================= */

function updateGameHeader() {
    if (!player) {
        return;
    }

    const countryId =
        player.country;

    const flag =
        countryFlag(countryId);

    const name =
        countryName(countryId);

    const headerFlag =
        $("#game-country-flag");

    if (headerFlag) {
        headerFlag.textContent = flag;
    }

    const homeFlag =
        $("#home-country-flag");

    if (homeFlag) {
        homeFlag.textContent = flag;
    }

    const homeName =
        $("#home-country-name");

    if (homeName) {
        homeName.textContent = name;
    }
}

/* =========================================================
   Home
   ========================================================= */

function renderHome() {
    if (!player) {
        return;
    }

    updateGameHeader();

    setText(
        "home-money",
        formatNumber(player.money)
    );

    setText(
        "home-income",
        formatNumber(
            player.daily_income ??
            player.income ??
            0
        )
    );

    setText(
        "home-manpower",
        formatNumber(player.manpower)
    );

    setText(
        "home-manpower-production",
        formatNumber(
            player.manpower_production
        )
    );

    setText(
        "home-power",
        formatNumber(
            player.power_capacity
        )
    );

    setText(
        "home-power-sub",
        "ظرفیت برق"
    );

    setText(
        "home-army",
        formatNumber(player.army)
    );

    setText(
        "home-season",
        player.season || "بهار"
    );

    const seasonEnd =
        [
            player.season_days_left,
            "روز"
        ].join(" ");

    setText(
        "home-season-end",
        seasonEnd
    );

    setHomeCountryPhoto();
}

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value ?? "";
    }
}

function setHomeCountryPhoto() {
    const element =
        $("#home-card-photo");

    if (!element || !player?.country) {
        return;
    }

    const countryId =
        player.country;

    /*
       تصویر کشور در صورت وجود.
       اگر تصویر نبود، پس‌زمینه کلی بازی حفظ می‌شود.
    */

    const imagePath =
        `/images/countries/${countryId}.jpg`;

    element.style.backgroundImage =
        `url("${imagePath}")`;

    element.style.backgroundSize = "cover";
    element.style.backgroundPosition = "center";
}

/* =========================================================
   Infrastructure
   ========================================================= */

function renderInfrastructure() {
    if (!player) {
        return;
    }

    renderInfraTab(currentInfraTab);
}

function setupInfrastructureTabs() {
    $all("[data-infra-tab]").forEach(button => {
        button.addEventListener(
            "click",
            () => {
                currentInfraTab =
                    button.dataset.infraTab;

                $all("[data-infra-tab]")
                    .forEach(item => {
                        item.classList.toggle(
                            "active",
                            item === button
                        );
                    });

                renderInfraTab(
                    currentInfraTab
                );
            }
        );
    });
}

function renderInfraTab(tab) {
    const infra =
        player?.infra || {};

    const categories = {
        power: ["infra-power"],
        manpower_camp: ["infra-manpower_camp"],
        barracks: ["infra-barracks"],
        airport: ["infra-airport"],
        port: ["infra-port"]
    };

    Object.values(categories)
        .flat()
        .forEach(id => {
            const element =
                document.getElementById(id);

            if (element) {
                element.innerHTML = "";
            }
        });

    const targetIds =
        categories[tab] || [];

    const data =
        infra[tab];

    if (!targetIds.length) {
        return;
    }

    const target =
        document.getElementById(
            targetIds[0]
        );

    if (!target) {
        return;
    }

    target.innerHTML =
        createInfraCard(
            tab,
            data
        );
}

function createInfraCard(category, data) {
    if (!data) {
        return `
            <div class="empty-state">
                اطلاعات زیرساخت موجود نیست.
            </div>
        `;
    }

    const level =
        Number(data.level || 0);

    const max =
        Number(data.max_level || 5);

    const next =
        data.next;

    const current =
        data.current;

    let details = "";

    if (current) {
        details += `
            <div class="infra-detail">
                سطح فعلی:
                <strong>
                    ${formatNumber(level)}
                </strong>
            </div>
        `;
    }

    if (next) {
        details += `
            <div class="infra-detail">
                هزینه ارتقا:
                <strong>
                    ${formatNumber(next.cost)}
                </strong>
            </div>
        `;

        if (next.capacity !== undefined) {
            details += `
                <div class="infra-detail">
                    ظرفیت:
                    <strong>
                        ${formatNumber(next.capacity)}
                    </strong>
                </div>
            `;
        }

        if (next.production !== undefined) {
            details += `
                <div class="infra-detail">
                    تولید:
                    <strong>
                        ${formatNumber(next.production)}
                    </strong>
                </div>
            `;
        }
    }

    return `
        <div class="infra-card-inner">

            <div class="infra-card-title">
                <h3>
                    ${escapeHtml(
                        data.name || category
                    )}
                </h3>

                <span>
                    ${formatNumber(level)}
                    /
                    ${formatNumber(max)}
                </span>
            </div>

            <div class="infra-details">
                ${details}
            </div>

            <button
                class="primary-button"
                data-upgrade-infra="${escapeHtml(category)}"
                ${!next ? "disabled" : ""}
            >
                ${
                    next
                        ? "ارتقای زیرساخت"
                        : "حداکثر سطح"
                }
            </button>

        </div>
    `;
}

/* =========================================================
   Infrastructure Upgrade
   ========================================================= */

async function upgradeInfrastructure(category) {
    try {
        const data =
            await apiGet(
                "/api/upgrade-infra",
                {
                    user_id: userId,
                    category
                }
            );

        if (!data.success) {
            throw new Error(
                data.message ||
                "ارتقا انجام نشد."
            );
        }

        player = data.player;

        renderHome();
        renderInfrastructure();

        showToast(
            "زیرساخت با موفقیت ارتقا یافت. ✅"
        );

    } catch (error) {
        console.error(
            "Infrastructure error:",
            error
        );

        showToast(
            error.message ||
            "ارتقا انجام نشد."
        );
    }
}

/* =========================================================
   Army
   ========================================================= */

const ARMY_UNITS = [
    {
        id: "land",
        title: "نیروهای زمینی",
        icon: "🪖",
        infra: "barracks"
    },
    {
        id: "air",
        title: "نیروی هوایی",
        icon: "✈️",
        infra: "airport"
    },
    {
        id: "navy",
        title: "نیروی دریایی",
        icon: "⚓",
        infra: "port"
    }
];

function renderArmy() {
    const container =
        $("#army-units");

    if (!container) {
        return;
    }

    const units =
        player?.units || {};

    container.innerHTML =
        ARMY_UNITS.map(unit => `
            <div class="army-card">

                <div class="army-icon">
                    ${unit.icon}
                </div>

                <div class="army-info">

                    <h3>
                        ${unit.title}
                    </h3>

                    <p>
                        تعداد:
                        ${formatNumber(
                            units[unit.id] || 0
                        )}
                    </p>

                </div>

                <button
                    class="primary-button train-button"
                    data-train-unit="${unit.id}"
                >
                    آموزش
                </button>

            </div>
        `).join("");
}

async function trainUnit(unitId) {
    try {
        const data =
            await apiGet(
                "/api/train-unit",
                {
                    user_id: userId,
                    unit_id: unitId
                }
            );

        if (!data.success) {
            throw new Error(
                data.message ||
                "آموزش یگان انجام نشد."
            );
        }

        player = data.player;

        renderHome();
        renderArmy();

        showToast(
            "یگان با موفقیت آموزش داده شد. ✅"
        );

    } catch (error) {
        console.error(
            "Train error:",
            error
        );

        showToast(
            error.message ||
            "آموزش یگان انجام نشد."
        );
    }
}

/* =========================================================
   War
   ========================================================= */

function renderWar() {
    const container =
        $("#war-content");

    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="panel">

            <h2>عملیات نظامی</h2>

            <p>
                برای شروع عملیات، کشور هدف را انتخاب کنید.
            </p>

            <div class="war-target-list">
                ${
                    countries
                        .filter(
                            country =>
                                country.id !==
                                player?.country
                        )
                        .map(country => `
                            <button
                                class="country-target"
                                data-attack-target="${escapeHtml(country.id)}"
                            >
                                ${
                                    escapeHtml(
                                        country.flag ||
                                        "🌍"
                                    )
                                }

                                ${
                                    escapeHtml(
                                        country.name ||
                                        country.id
                                    )
                                }
                            </button>
                        `)
                        .join("")
                }
            </div>

        </div>
    `;
}

async function attackCountry(target) {
    try {
        const data =
            await apiGet(
                "/api/attack",
                {
                    user_id: userId,
                    target,
                    type: "land"
                }
            );

        if (!data.success) {
            throw new Error(
                data.message ||
                "عملیات انجام نشد."
            );
        }

        player =
            data.player ||
            player;

        renderHome();
        renderWar();

        showToast(
            data.message ||
            "عملیات انجام شد."
        );

    } catch (error) {
        console.error(
            "Attack error:",
            error
        );

        showToast(
            error.message ||
            "عملیات انجام نشد."
        );
    }
}

/* =========================================================
   Diplomacy
   ========================================================= */

async function loadDiplomacy() {
    try {
        const data =
            await apiGet(
                "/api/diplomacy",
                {
                    user_id: userId
                }
            );

        renderDiplomacy(data);

    } catch (error) {
        console.error(
            "Diplomacy error:",
            error
        );
    }
}

function renderDiplomacy(data) {
    const treaties =
        $("#diplomacy-treaties");

    const sent =
        $("#diplomacy-sent");

    if (treaties) {
        const list =
            data?.treaties || [];

        treaties.innerHTML =
            list.length
                ? list.map(treaty => `
                    <div class="treaty-card">
                        <strong>
                            پیمان
                        </strong>

                        <span>
                            ${
                                escapeHtml(
                                    treaty.treaty_type ||
                                    ""
                                )
                            }
                        </span>
                    </div>
                `).join("")
                : `
                    <div class="empty-state">
                        پیمان فعالی وجود ندارد.
                    </div>
                `;
    }

    if (sent) {
        const list =
            data?.sent || [];

        sent.innerHTML =
            list.length
                ? list.map(item => `
                    <div class="proposal-card">
                        پیشنهاد در انتظار پاسخ
                    </div>
                `).join("")
                : `
                    <div class="empty-state">
                        پیشنهادی ارسال نشده است.
                    </div>
                `;
    }
}

async function proposeTreaty() {
    const target =
        $("#diplomacy-target")?.value;

    const type =
        $("#diplomacy-type")?.value;

    const duration =
        $("#diplomacy-duration")?.value ||
        7;

    if (!target) {
        showToast(
            "کشور هدف را انتخاب کنید."
        );

        return;
    }

    try {
        const data =
            await apiGet(
                "/api/propose-treaty",
                {
                    user_id: userId,
                    target,
                    type,
                    duration
                }
            );

        if (!data.success) {
            throw new Error(
                data.message ||
                "پیشنهاد ارسال نشد."
            );
        }

        showToast(
            data.message ||
            "پیشنهاد ارسال شد. ✅"
        );

        loadDiplomacy();

    } catch (error) {
        console.error(
            "Treaty error:",
            error
        );

        showToast(
            error.message ||
            "پیشنهاد ارسال نشد."
        );
    }
}

/* =========================================================
   Communications
   ========================================================= */

function setupCommunicationTabs() {
    $all(".comm-tab").forEach(tab => {
        tab.addEventListener(
            "click",
            () => {
                const target =
                    tab.dataset.tab;

                $all(".comm-tab")
                    .forEach(item => {
                        item.classList.toggle(
                            "active",
                            item === tab
                        );
                    });

                $all(".comm-panel")
                    .forEach(panel => {
                        panel.classList.toggle(
                            "hidden",
                            panel.id !== target
                        );
                    });

                if (
                    target === "comm-news"
                ) {
                    loadNews();
                }

                if (
                    target === "comm-contacts"
                ) {
                    renderContacts();
                }
            }
        );
    });
}

async function loadCommunications() {
    loadNews();
    renderContacts();
}

async function loadNews() {
    const container =
        $("#news-list");

    if (!container) {
        return;
    }

    try {
        const data =
            await apiGet("/api/news");

        const news =
            Array.isArray(data)
                ? data
                : data.news || [];

        if (!news.length) {
            container.innerHTML = `
                <div class="empty-state">
                    خبری وجود ندارد.
                </div>
            `;

            return;
        }

        container.innerHTML =
            news.map(item => `
                <article class="news-card">

                    <div class="news-card-title">
                        ${escapeHtml(
                            item.title ||
                            "خبر"
                        )}
                    </div>

                    <div class="news-card-text">
                        ${escapeHtml(
                            item.text ||
                            ""
                        )}
                    </div>

                </article>
            `).join("");

    } catch (error) {
        console.error(
            "News error:",
            error
        );

        container.innerHTML = `
            <div class="empty-state">
                دریافت اخبار انجام نشد.
            </div>
        `;
    }
}

function renderContacts() {
    const container =
        $("#contact-list");

    if (!container) {
        return;
    }

    const available =
        countries.filter(
            country =>
                country.id !==
                player?.country
        );

    container.innerHTML =
        available.map(country => `
            <div class="contact-card">

                <div class="contact-country">

                    <span>
                        ${escapeHtml(
                            country.flag ||
                            "🌍"
                        )}
                    </span>

                    <strong>
                        ${escapeHtml(
                            country.name ||
                            country.id
                        )}
                    </strong>

                </div>

                <button
                    class="secondary-button"
                    data-message-country="${escapeHtml(country.id)}"
                >
                    پیام
                </button>

            </div>
        `).join("");
}

/*
   فعلاً API پیام مستقیم کشور در bot.py وجود ندارد.
   بنابراین این دکمه پیام را به‌عنوان قابلیت در رابط نشان می‌دهد
   و تا زمانی که API پیام اضافه نشود، خطا نمی‌دهد.
*/

function messageCountry(countryId) {
    showToast(
        `پیام به ${countryName(countryId)} در نسخه بعدی فعال می‌شود.`
    );
}

/* =========================================================
   World Map
   ========================================================= */

function renderWorldMap() {
    const container =
        $("#map-globe");

    if (!container) {
        return;
    }

    /*
       اگر نقشه D3 در HTML وجود داشته باشد،
       تلاش می‌کنیم همان را فعال کنیم.
    */

    container.innerHTML = `
        <div class="map-fallback">

            <div class="map-earth">
                🌍
            </div>

            <div class="map-country-label">
                ${
                    player?.country
                        ? escapeHtml(
                            countryName(
                                player.country
                            )
                        )
                        : "نقشه جهان"
                }
            </div>

        </div>
    `;

    renderMapInfo();
}

function renderMapInfo() {
    const flag =
        $("#map-info-flag");

    const name =
        $("#map-info-name");

    const status =
        $("#map-info-status");

    const desc =
        $("#map-info-desc");

    if (player?.country) {
        if (flag) {
            flag.textContent =
                countryFlag(
                    player.country
                );
        }

        if (name) {
            name.textContent =
                countryName(
                    player.country
                );
        }

        if (status) {
            status.textContent =
                "کشور شما";
        }

        if (desc) {
            desc.textContent =
                "این کشور تحت فرماندهی شما قرار دارد.";
        }
    }
}

function setupMapControls() {
    const zoomIn =
        $("#map-zoom-in");

    const zoomOut =
        $("#map-zoom-out");

    const reset =
        $("#map-reset");

    let scale = 1;

    function applyScale() {
        const globe =
            $("#map-globe .map-earth");

        if (globe) {
            globe.style.transform =
                `scale(${scale})`;
        }
    }

    if (zoomIn) {
        zoomIn.addEventListener(
            "click",
            () => {
                scale =
                    Math.min(
                        1.8,
                        scale + .1
                    );

                applyScale();
            }
        );
    }

    if (zoomOut) {
        zoomOut.addEventListener(
            "click",
            () => {
                scale =
                    Math.max(
                        .7,
                        scale - .1
                    );

                applyScale();
            }
        );
    }

    if (reset) {
        reset.addEventListener(
            "click",
            () => {
                scale = 1;
                applyScale();
            }
        );
    }
}

/* =========================================================
   World Market
   ========================================================= */

function ensureMarketPage() {
    let page =
        $("#market");

    if (page) {
        return page;
    }

    const game =
        $("#game");

    if (!game) {
        return null;
    }

    page =
        document.createElement("main");

    page.id = "market";
    page.className =
        "game-page hidden";

    page.innerHTML = `
        <div class="page-title">

            <span>
                اقتصاد بین‌الملل
            </span>

            <h1>
                بازار جهانی
            </h1>

        </div>

        <div class="panel">

            <h2>
                بازار جهانی
            </h2>

            <p>
                این بخش برای خرید و فروش منابع و کالاها آماده می‌شود.
            </p>

        </div>
    `;

    game.appendChild(page);

    return page;
}

function renderWorldMarket() {
    ensureMarketPage();
}

function ensureMarketNavigation() {
    const nav =
        $(".bottom-nav");

    if (!nav) {
        return;
    }

    if (
        nav.querySelector(
            '[data-page="market"]'
        )
    ) {
        return;
    }

    const button =
        document.createElement("button");

    button.className =
        "nav-item";

    button.dataset.page =
        "market";

    button.innerHTML = `
        <span>💰</span>
        <small>بازار جهانی</small>
    `;

    nav.appendChild(button);

    button.addEventListener(
        "click",
        () => {
            showGamePage("market");
        }
    );
}

/* =========================================================
   Subscription
   ========================================================= */

function renderSubscription() {
    // فعلاً صفحه اشتراک محتوای ثابت HTML دارد.
}

/* =========================================================
   Navigation
   ========================================================= */

function setupNavigation() {
    ensureMarketPage();
    ensureMarketNavigation();

    $all(".nav-item").forEach(button => {
        if (button.dataset.bound) {
            return;
        }

        button.dataset.bound = "1";

        button.addEventListener(
            "click",
            () => {
                const page =
                    button.dataset.page;

                if (!page) {
                    return;
                }

                showGamePage(page);
            }
        );
    });
}

/* =========================================================
   Global Clicks
   ========================================================= */

function setupGlobalClicks() {
    document.addEventListener(
        "click",
        event => {

            const upgrade =
                event.target.closest(
                    "[data-upgrade-infra]"
                );

            if (upgrade) {
                upgradeInfrastructure(
                    upgrade.dataset.upgradeInfra
                );

                return;
            }

            const train =
                event.target.closest(
                    "[data-train-unit]"
                );

            if (train) {
                trainUnit(
                    train.dataset.trainUnit
                );

                return;
            }

            const attack =
                event.target.closest(
                    "[data-attack-target]"
                );

            if (attack) {
                attackCountry(
                    attack.dataset.attackTarget
                );

                return;
            }

            const message =
                event.target.closest(
                    "[data-message-country]"
                );

            if (message) {
                messageCountry(
                    message.dataset.messageCountry
                );

                return;
            }
        }
    );
}

/* =========================================================
   Buttons
   ========================================================= */

function setupButtons() {

    const previewBack =
        $("#preview-back-button");

    if (previewBack) {
        previewBack.addEventListener(
            "click",
            () => {
                showOnly("country");
            }
        );
    }

    const enterGameButton =
        $("#enter-game-button");

    if (enterGameButton) {
        enterGameButton.addEventListener(
            "click",
            () => {

                if (
                    selectedCountry &&
                    selectedCountry.id
                ) {
                    selectCountry(
                        selectedCountry.id
                    );
                }
            }
        );
    }

    const backButtons =
        $all("[data-back]");

    backButtons.forEach(button => {
        button.addEventListener(
            "click",
            () => {
                const target =
                    button.dataset.back ||
                    "home";

                showGamePage(target);
            }
        );
    });

    const notification =
        $("#game-notification-button");

    if (notification) {
        notification.addEventListener(
            "click",
            () => {
                showToast(
                    "در حال حاضر اعلان جدیدی ندارید."
                );
            }
        );
    }

    const menu =
        $("#game-menu-button");

    if (menu) {
        menu.addEventListener(
            "click",
            () => {
                showToast(
                    "منوی فرماندهی"
                );
            }
        );
    }

    const infrastructureButton =
        document.querySelector(
            '[data-page="infrastructure"]'
        );

    if (infrastructureButton) {
        infrastructureButton.addEventListener(
            "click",
            () => {
                showGamePage(
                    "infrastructure"
                );
            }
        );
    }
}

/* =========================================================
   Initial UI
   ========================================================= */

function prepareInitialUI() {

    /*
       همه صفحه‌های داخلی بازی ابتدا مخفی.
       فقط loading قابل مشاهده است.
    */

    $all(".screen").forEach(screen => {
        screen.classList.add("hidden");
        screen.classList.remove("active");
        screen.style.display = "none";
    });

    $all(".game-page").forEach(page => {
        page.classList.add("hidden");
        page.classList.remove("active");
        page.style.display = "none";
    });

    const loading =
        $("#loading");

    if (loading) {
        loading.classList.remove("hidden");
        loading.style.display = "flex";
    }
}

/* =========================================================
   Main Startup
   ========================================================= */

async function startGame() {

    prepareInitialUI();

    showLoading(
        "در حال اتصال به تلگرام...."
    );

    try {

        await sleep(350);

        userId =
            getTelegramUserId();

        if (!userId) {
            throw new Error(
                "شناسه کاربر تلگرام پیدا نشد."
            );
        }

        setLoadingText(
            "در حال بارگذاری فرماندهی..."
        );

        /*
           اول player را می‌گیریم.
           اگر کشور داشته باشد، اصلاً صفحه انتخاب
           کشور را نشان نمی‌دهیم.
        */

        const playerData =
            await loadPlayer();

        await loadCountries();

        await sleep(300);

        if (
            playerData &&
            playerData.country
        ) {

            player =
                playerData;

            hideLoading();

            enterGame();

            return;
        }

        /*
           بازیکن جدید است.
        */

        hideLoading();

        showOnly("country");

    } catch (error) {

        console.error(
            "START ERROR:",
            error
        );

        setLoadingText(
            "خطا در اتصال به سرور"
        );

        showToast(
            error.message ||
            "اتصال به بازی برقرار نشد."
        );

        /*
           بعد از خطا، loading را برای همیشه
           روی صفحه نگه نمی‌داریم.
        */

        await sleep(900);

        hideLoading();

        /*
           اگر کشورها گرفته شده باشند،
           صفحه انتخاب کشور را نشان بده.
        */

        if (countries.length) {
            showOnly("country");
        }
    }
}

/* =========================================================
   Refresh Player
   ========================================================= */

async function refreshPlayer() {
    if (!userId) {
        return;
    }

    try {
        const data =
            await loadPlayer();

        if (
            data &&
            data.country
        ) {
            player = data;

            updateGameHeader();
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
        }

    } catch (error) {
        console.warn(
            "Refresh player failed:",
            error
        );
    }
}

/* =========================================================
   Periodic Updates
   ========================================================= */

function startPolling() {

    setInterval(
        () => {

            if (
                player &&
                player.country
            ) {
                refreshPlayer();
            }

        },
        15000
    );
}

/* =========================================================
   DOM Ready
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        setupInfrastructureTabs();
        setupCommunicationTabs();
        setupMapControls();
        setupGlobalClicks();
        setupButtons();

        startGame();
        startPolling();
    }
);
