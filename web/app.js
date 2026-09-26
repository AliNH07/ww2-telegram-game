const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
}

const userId =
    tg?.initDataUnsafe?.user?.id ||
    null;

let player = null;
let countries = {};
let selectedCountry = null;
let worldData = null;
let statsInterval = null;

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

const SECTION_NAMES = {
    war: "جنگ",
    army: "ارتش",
    diplomacy: "دیپلماسی",
    economy: "اقتصاد",
    infrastructure: "زیرساخت",
    market: "بازار جهانی"
};

/* اقیانوس‌ها - [lon, lat, نام] */

const OCEAN_LABELS = [
    [-40, 25, "اقیانوس اطلس"],
    [-150, 0, "اقیانوس آرام"],
    [75, -20, "اقیانوس هند"],
    [90, 65, "اقیانوس منجمد شمالی"],
    [20, -60, "اقیانوس منجمد جنوبی"]
];

/* تنگه‌های مهم دنیا - [lon, lat, نام, توضیح کوتاه] */

const STRAITS = [
    { lon: -5.6, lat: 35.9, name: "تنگه جبل‌الطارق", desc: "اتصال دریای مدیترانه به اقیانوس اطلس؛ یکی از پرتردد‌ترین آبراه‌های نظامی و تجاری دنیا." },
    { lon: 29.0, lat: 41.1, name: "تنگه بسفر", desc: "تنها راه دریایی دریای سیاه به مدیترانه؛ کنترل آن یعنی کنترل دسترسی شرق اروپا به آب‌های آزاد." },
    { lon: 56.3, lat: 26.6, name: "تنگه هرمز", desc: "مسیر اصلی صادرات نفت خلیج فارس؛ حیاتی‌ترین تنگه انرژی جهان." },
    { lon: 43.3, lat: 12.6, name: "تنگه باب‌المندب", desc: "دروازه ورودی دریای سرخ و کانال سوئز؛ مسیر کوتاه اروپا به آسیا." },
    { lon: 32.3, lat: 30.6, name: "کانال سوئز", desc: "کوتاه‌ترین مسیر دریایی اروپا به آسیا بدون دور زدن آفریقا." },
    { lon: 1.4, lat: 50.9, name: "تنگه دوور", desc: "باریک‌ترین نقطه کانال مانش بین بریتانیا و فرانسه." },
    { lon: -79.6, lat: 9.1, name: "کانال پاناما", desc: "اتصال اقیانوس اطلس و آرام؛ حذف مسیر طولانی دور آمریکای جنوبی." },
    { lon: 103.8, lat: 1.3, name: "تنگه مالاکا", desc: "شریان اصلی تجارت دریایی میان اقیانوس هند و آرام." },
    { lon: -5.9, lat: 43.4, name: "خلیج بیسکای", desc: "مسیر دریایی مهم غرب اروپا در اقیانوس اطلس." },
    { lon: 121.0, lat: 24.0, name: "تنگه تایوان", desc: "آبراه راهبردی میان دریای چین شرقی و جنوبی." },
    { lon: 129.9, lat: 34.0, name: "تنگه کره", desc: "اتصال دریای ژاپن به دریای زرد؛ مسیر راهبردی نزدیک ژاپن." }
];


/* =========================================================
   ابزارهای عمومی
========================================================= */

function countryImageUrl(countryId) {

    const ext = COUNTRY_IMAGE_EXT[countryId] || "jpg";

    return `/images/countries/${countryId}.${ext}`;
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


function getApiUrl(path, params = {}) {

    const url = new URL(path, window.location.origin);

    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    return url.toString();
}


function formatMoney(value) {

    return "$" + Math.round(Number(value ?? 0)).toLocaleString("en-US");
}


function formatNumber(value) {

    return Number(value ?? 0).toLocaleString("en-US");
}


async function loadWorldAtlas() {

    if (worldData) {
        return worldData;
    }

    const response = await fetch(
        "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
    );

    worldData = await response.json();

    return worldData;
}


/* =========================================================
   دریافت بازیکن
========================================================= */

async function loadPlayer() {

    if (!userId) {
        console.warn("Telegram user ID not found.");
        return;
    }

    try {

        const response = await fetch(
            getApiUrl("/api/player", {
                user_id: userId
            })
        );

        if (!response.ok) {
            throw new Error("Player API error");
        }

        player = await response.json();

        if (player.country) {

            selectedCountry = player.country;

            showGame();

        } else {

            showCountrySelection();
        }

    } catch (error) {

        console.error(error);

        showCountrySelection();
    }
}


async function refreshPlayer() {

    if (!userId) {
        return;
    }

    try {

        const response = await fetch(
            getApiUrl("/api/player", {
                user_id: userId
            })
        );

        if (!response.ok) {
            return;
        }

        player = await response.json();

        updateHomeStats();

    } catch (error) {

        console.error(error);
    }
}


function startStatsPolling() {

    stopStatsPolling();

    statsInterval = setInterval(() => {
        refreshPlayer();
    }, 30000);
}


function stopStatsPolling() {

    if (statsInterval) {

        clearInterval(statsInterval);

        statsInterval = null;
    }
}


/* =========================================================
   دریافت کشورها
========================================================= */

async function loadCountries() {

    try {

        const response = await fetch("/api/countries");

        if (!response.ok) {
            throw new Error("Countries API error");
        }

        const data = await response.json();

        countries = {};

        data.forEach(country => {
            countries[country.id] = country;
        });

        updateCountryCards();

    } catch (error) {

        console.error("Countries:", error);
    }
}


/* =========================================================
   نمایش صفحه انتخاب
========================================================= */

function showCountrySelection() {

    showOnly("country");

    updateCountryCards();
}


/* =========================================================
   وضعیت کشورها
========================================================= */

function updateCountryCards() {

    document.querySelectorAll("[data-country-card]").forEach(card => {

        const countryId = card.dataset.country;

        const country = countries[countryId];

        if (!country) {
            return;
        }

        if (country.taken) {

            if (player?.country === countryId) {
                card.classList.remove("taken");
            } else {
                card.classList.add("taken");
            }

        } else {

            card.classList.remove("taken");
        }
    });
}


/* =========================================================
   انتخاب کشور (فقط پیش‌نمایش - هنوز چیزی ثبت نمی‌شود)
========================================================= */

document.querySelectorAll("[data-country-card]").forEach(card => {

    card.addEventListener("click", () => {

        const countryId = card.dataset.country;

        const country = countries[countryId];

        if (country?.taken && player?.country !== countryId) {

            showMessage(
                "این کشور قبلاً توسط بازیکن دیگری انتخاب شده است."
            );

            return;
        }

        selectedCountry = countryId;

        showCountryPreview();
    });
});


/* =========================================================
   پیام
========================================================= */

function showMessage(message) {

    const element =
        document.getElementById("country-message");

    if (!element) {
        return;
    }

    element.textContent = message;

    setTimeout(() => {

        if (element.textContent === message) {
            element.textContent = "";
        }

    }, 4000);
}


/* =========================================================
   صفحه نمایش کشور
========================================================= */

function showCountryPreview() {

    if (!selectedCountry) {
        showCountrySelection();
        return;
    }

    showOnly("country-preview");

    const name =
        COUNTRY_NAMES[selectedCountry] || selectedCountry;

    document.getElementById(
        "selected-country-flag"
    ).src = countryImageUrl(selectedCountry);

    document.getElementById(
        "preview-country-name"
    ).textContent = name;

    createPreviewGlobe(
        "preview-globe-container",
        "preview-globe",
        selectedCountry
    );
}


/* =========================================================
   دکمه بازگشت
========================================================= */

document
    .getElementById("preview-back-button")
    .addEventListener("click", () => {

        selectedCountry = null;

        showCountrySelection();
    });


/* =========================================================
   ورود به بازی -> اینجا کشور واقعاً برای کاربر ثبت می‌شود
========================================================= */

document
    .getElementById("enter-game-button")
    .addEventListener("click", async () => {

        await confirmCountrySelection();
    });


async function confirmCountrySelection() {

    if (!userId) {

        alert(
            "برای اجرای بازی باید از داخل تلگرام وارد شوید."
        );

        return;
    }

    if (player?.country === selectedCountry) {

        showGame();

        return;
    }

    try {

        const response = await fetch(
            getApiUrl("/api/select-country", {
                user_id: userId,
                country: selectedCountry
            })
        );

        const data = await response.json();

        if (!response.ok) {

            if (data.error === "country_taken") {

                alert(
                    "این کشور قبلاً توسط بازیکن دیگری انتخاب شده است."
                );

                selectedCountry = null;

                await loadCountries();

                showCountrySelection();

                return;
            }

            if (data.error === "already_has_country") {

                alert(
                    "شما قبلاً یک کشور انتخاب کرده‌اید."
                );

                await loadPlayer();

                return;
            }

            throw new Error(
                data.error || "Country selection failed"
            );
        }

        player = data.player;

        await loadCountries();

        showGame();

    } catch (error) {

        console.error(error);

        alert(
            "خطا در ورود به بازی. دوباره امتحان کنید."
        );
    }
}


function showGame() {

    showOnly("game");

    updateGameHeader();
    updateHomeStats();

    startStatsPolling();
}


/* =========================================================
   هدر بازی
========================================================= */

function updateGameHeader() {

    document.getElementById(
        "game-country-flag"
    ).src = countryImageUrl(selectedCountry);
}


/* =========================================================
   آمار خانه
========================================================= */

function updateHomeStats() {

    if (!player) {
        return;
    }

    const name =
        COUNTRY_NAMES[selectedCountry] || selectedCountry;

    document.getElementById("home-country-flag").src =
        countryImageUrl(selectedCountry);

    document.getElementById("home-country-name").textContent = name;

    const photo =
        document.getElementById("home-card-photo");

    if (photo) {
        photo.style.backgroundImage =
            `url(${countryImageUrl(selectedCountry)})`;
    }

    document.getElementById("home-money").textContent =
        formatMoney(player.money);

    document.getElementById("home-income").textContent =
        formatMoney(player.daily_income) + " / روز";

    document.getElementById("home-manpower").textContent =
        formatNumber(player.manpower ?? 40000);

    document.getElementById("home-power").textContent =
        player.power ?? 0;

    document.getElementById("home-power-sub").textContent =
        `${player.power ?? 0} از ${player.power_capacity ?? 0}`;

    document.getElementById("home-army").textContent =
        player.army ?? 0;

    document.getElementById("home-season").textContent =
        player.season ?? "بهار";

    document.getElementById("home-season-end").textContent =
        `پایان فصل تا ${player.season_days_left ?? 0} روز و ${player.season_hours_left ?? 0} ساعت`;

    document.getElementById("home-next-season").textContent =
        player.next_season ?? "تابستان";

    document.getElementById("home-next-season-time").textContent =
        `${player.season_days_left ?? 0} روز و ${player.season_hours_left ?? 0} ساعت`;

    const mapMoney =
        document.getElementById("map-money");

    if (mapMoney) {
        mapMoney.textContent = formatMoney(player.money);
    }
}


document
    .getElementById("next-season-button")
    .addEventListener("click", () => {

        alert("فصل‌ها به‌صورت خودکار و بر اساس زمان واقعی تغییر می‌کنند.");
    });


/* =========================================================
   باکس‌های جنگ / ارتش / دیپلماسی / ...
========================================================= */

document.querySelectorAll(".action-card").forEach(card => {

    card.addEventListener("click", () => {

        const section = card.dataset.section;

        const name =
            SECTION_NAMES[section] || section;

        alert(`بخش ${name} به‌زودی فعال می‌شود.`);
    });
});


/* =========================================================
   نوار پایین
========================================================= */

document.querySelectorAll(".nav-item").forEach(item => {

    item.addEventListener("click", () => {

        const page = item.dataset.page;

        document.querySelectorAll(".game-page").forEach(
            element => {
                element.classList.add("hidden");
            }
        );

        const target =
            document.getElementById(page);

        if (target) {
            target.classList.remove("hidden");
        }

        document.querySelectorAll(".nav-item").forEach(
            nav => {
                nav.classList.remove("active");
            }
        );

        item.classList.add("active");

        if (page === "home") {

            updateHomeStats();
        }

        if (page === "map") {

            setTimeout(() => {
                initWorldMap();
            }, 30);
        }

        if (page === "communications") {

            loadNews();
            renderContactList();
        }
    });
});


/* =========================================================
   تب‌های ارتباطات
========================================================= */

document.querySelectorAll(".comm-tab").forEach(tab => {

    tab.addEventListener("click", () => {

        const targetId = tab.dataset.tab;

        document.querySelectorAll(".comm-tab").forEach(t => {
            t.classList.remove("active");
        });

        tab.classList.add("active");

        document.querySelectorAll(".comm-panel").forEach(panel => {
            panel.classList.add("hidden");
        });

        const panel =
            document.getElementById(targetId);

        if (panel) {
            panel.classList.remove("hidden");
        }

        if (targetId === "comm-news") {
            loadNews();
        }

        if (targetId === "comm-contacts") {
            renderContactList();
        }
    });
});


/* =========================================================
   لیست ارتباط با کشورها
========================================================= */

function renderContactList() {

    const container =
        document.getElementById("contact-list");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    Object.keys(COUNTRY_NAMES).forEach(countryId => {

        if (countryId === selectedCountry) {
            return;
        }

        const item =
            document.createElement("div");

        item.className = "contact-item";

        item.innerHTML = `
            <div class="contact-info">
                <span class="contact-flag">${COUNTRY_FLAGS[countryId]}</span>
                <span class="contact-name">${COUNTRY_NAMES[countryId]}</span>
            </div>
            <button class="message-button" data-message-country="${countryId}">
                پیام
            </button>
        `;

        container.appendChild(item);
    });

    container.querySelectorAll("[data-message-country]").forEach(button => {

        button.addEventListener("click", () => {

            sendCountryMessage(
                button.dataset.messageCountry
            );
        });
    });
}


function sendCountryMessage(countryId) {

    const name =
        COUNTRY_NAMES[countryId] || countryId;

    const message =
        window.prompt(`پیام برای ${name}:`);

    if (!message) {
        return;
    }

    // TODO: اتصال به یک API واقعی برای ارسال پیام بین کشورها
    alert(`پیام شما به ${name} ارسال شد.`);
}


/* =========================================================
   اخبار
========================================================= */

async function loadNews() {

    const container =
        document.getElementById("news-list");

    if (!container) {
        return;
    }

    try {

        const response =
            await fetch("/api/news");

        if (!response.ok) {
            throw new Error("News API error");
        }

        const news =
            await response.json();

        container.innerHTML = "";

        news.forEach(item => {

            const article =
                document.createElement("div");

            article.className = "news-item";

            article.innerHTML = `
                <h3>${item.title || ""}</h3>
                <p>${item.text || ""}</p>
            `;

            container.appendChild(article);
        });

    } catch (error) {

        console.error(error);

        container.innerHTML = `
            <div class="news-item">
                <h3>اخبار</h3>
                <p>فعلاً خبری برای نمایش وجود ندارد.</p>
            </div>
        `;
    }
}


/* =========================================================
   ابزار مشترک چرخش/زوم کره (پیش‌نمایش و نقشه)
========================================================= */

function getTouchDistance(touches) {

    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;

    return Math.hypot(dx, dy);
}


function isPointVisible(lon, lat, rotation) {

    const centerLon = -rotation[0];
    const centerLat = -rotation[1];

    const toRad = deg => (deg * Math.PI) / 180;

    const lat1 = toRad(centerLat);
    const lat2 = toRad(lat);
    const deltaLon = toRad(lon - centerLon);

    const cosDistance =
        Math.sin(lat1) * Math.sin(lat2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

    return cosDistance > 0;
}


/* =========================================================
   کره جهان (صفحه پیش‌نمایش کشور - چرخان، داخل کادر متوسط)
========================================================= */

async function createPreviewGlobe(
    containerId,
    svgId,
    selected
) {

    const container =
        document.getElementById(containerId);

    const svgElement =
        document.getElementById(svgId);

    if (!container || !svgElement) {
        return;
    }

    const width = container.clientWidth || 300;
    const height = container.clientHeight || 300;

    /*
     * کره داخل همین کادر شروع می‌شود؛
     * وقتی خیلی زوم شود، دیگر لبهٔ گرد آن دیده نمی‌شود
     * و فقط سطح آن کادر را پر می‌کند.
     */

    const size = Math.min(width, height) * 0.46;

    const minScale = size * 0.8;
    const maxScale = size * 4;

    d3.select(svgElement).selectAll("*").remove();

    const svg =
        d3.select(svgElement)
            .attr("viewBox", `0 0 ${width} ${height}`);

    const projection =
        d3.geoOrthographic()
            .scale(size)
            .translate([width / 2, height / 2])
            .clipAngle(90);

    const path = d3.geoPath(projection);

    let world;

    try {
        world = await loadWorldAtlas();
    } catch (error) {
        console.error("World map loading failed:", error);
        return;
    }

    const land =
        topojson.feature(world, world.objects.countries);

    const sphere = { type: "Sphere" };

    svg.append("path")
        .datum(sphere)
        .attr("class", "globe-water")
        .attr("d", path);

    svg.selectAll(".country-shape")
        .data(land.features)
        .enter()
        .append("path")
        .attr("class", "country-shape")
        .attr("d", path)
        .attr("fill", d => {

            const countryId = Number(d.id);

            if (selected && COUNTRY_IDS[selected] === countryId) {
                return "#d98a25";
            }

            const isTaken =
                Object.values(countries).some(
                    country =>
                        country.taken &&
                        COUNTRY_IDS[country.id] === countryId
                );

            if (isTaken) {
                return "#3978b7";
            }

            const isGameCountry =
                Object.values(COUNTRY_IDS).includes(countryId);

            return isGameCountry ? "#111820" : "#151b21";
        })
        .attr("stroke", d => {

            const countryId = Number(d.id);

            const isGameCountry =
                Object.values(COUNTRY_IDS).includes(countryId);

            return isGameCountry ? "#26313c" : "none";
        })
        .attr("stroke-width", .6);

    let rotation = projection.rotate();

    let dragging = false;
    let pinching = false;

    let lastX = 0;
    let lastY = 0;

    let pinchStartDistance = 0;
    let pinchStartScale = size;

    function redraw() {
        svg.selectAll("path").attr("d", path);
    }

    function autoRotate() {

        if (!dragging && !pinching) {

            rotation[0] += 0.08;

            projection.rotate(rotation);

            redraw();
        }

        requestAnimationFrame(autoRotate);
    }

    requestAnimationFrame(autoRotate);

    svgElement.addEventListener("mousedown", event => {
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
    });

    window.addEventListener("mouseup", () => {
        dragging = false;
    });

    window.addEventListener("mousemove", event => {

        if (!dragging) return;

        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;

        rotation[0] += dx * 0.5;
        rotation[1] -= dy * 0.5;
        rotation[1] = Math.max(-90, Math.min(90, rotation[1]));

        projection.rotate(rotation);
        redraw();

        lastX = event.clientX;
        lastY = event.clientY;
    });

    svgElement.addEventListener("wheel", event => {

        event.preventDefault();

        const current = projection.scale();
        const next = current * (event.deltaY > 0 ? 0.9 : 1.1);

        projection.scale(
            Math.max(minScale, Math.min(maxScale, next))
        );

        redraw();

    }, { passive: false });

    svgElement.addEventListener("touchstart", event => {

        if (event.touches.length === 2) {
            pinching = true;
            dragging = false;
            pinchStartDistance = getTouchDistance(event.touches);
            pinchStartScale = projection.scale();
            return;
        }

        if (!event.touches.length) return;

        dragging = true;
        lastX = event.touches[0].clientX;
        lastY = event.touches[0].clientY;

    }, { passive: true });

    svgElement.addEventListener("touchend", event => {

        dragging = false;

        if (event.touches.length < 2) {
            pinching = false;
        }

    }, { passive: true });

    svgElement.addEventListener("touchmove", event => {

        if (pinching && event.touches.length === 2) {

            event.preventDefault();

            const distance = getTouchDistance(event.touches);
            const ratio = distance / pinchStartDistance;
            const next = pinchStartScale * ratio;

            projection.scale(
                Math.max(minScale, Math.min(maxScale, next))
            );

            redraw();

            return;
        }

        if (!dragging || !event.touches.length) return;

        const dx = event.touches[0].clientX - lastX;
        const dy = event.touches[0].clientY - lastY;

        rotation[0] += dx * 0.5;
        rotation[1] -= dy * 0.5;
        rotation[1] = Math.max(-90, Math.min(90, rotation[1]));

        projection.rotate(rotation);
        redraw();

        lastX = event.touches[0].clientX;
        lastY = event.touches[0].clientY;

        event.preventDefault();

    }, { passive: false });
}


/* =========================================================
   نقشه جهان (فوتر) - کره واقعی داخل کادر
   کوچک: گرد دیده می‌شود | زوم زیاد: فقط سطح را پر می‌کند
========================================================= */

let mapProjection = null;
let mapPath = null;
let mapSvg = null;
let mapSize = 0;
let mapMinScale = 0;
let mapMaxScale = 0;
let mapRotation = [0, 0];
let mapInitialized = false;


async function initWorldMap() {

    const box =
        document.querySelector(".map-box");

    const svgElement =
        document.getElementById("map-globe");

    if (!box || !svgElement) {
        return;
    }

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

    try {
        world = await loadWorldAtlas();
    } catch (error) {
        console.error("World map loading failed:", error);
        return;
    }

    const land =
        topojson.feature(world, world.objects.countries);

    mapProjection =
        d3.geoOrthographic()
            .scale(mapSize)
            .translate([width / 2, height / 2])
            .rotate(mapRotation)
            .clipAngle(90);

    mapPath = d3.geoPath(mapProjection);

    mapSvg =
        d3.select(svgElement)
            .attr("viewBox", `0 0 ${width} ${height}`);

    mapSvg.selectAll("*").remove();

    mapSvg.append("path")
        .datum({ type: "Sphere" })
        .attr("class", "globe-water")
        .attr("d", mapPath);

    mapSvg.selectAll(".map-country")
        .data(land.features)
        .enter()
        .append("path")
        .attr("class", "map-country")
        .attr("d", mapPath)
        .attr("data-country-id", d => d.id)
        .on("click", (event, d) => {

            event.stopPropagation();

            showCountryInfo(d);
        });

    mapSvg.selectAll(".map-country-label")
        .data(
            land.features.filter(d =>
                Object.values(COUNTRY_IDS).includes(Number(d.id))
            )
        )
        .enter()
        .append("text")
        .attr("class", "map-country-label")
        .attr("text-anchor", "middle")
        .text(d => {

            const entry =
                Object.entries(COUNTRY_IDS).find(
                    ([, id]) => id === Number(d.id)
                );

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
        .on("click", (event, d) => {

            event.stopPropagation();

            showStraitInfo(d);
        });

    updateMapColors();
    redrawMap();

    attachMapInteractions(svgElement, width, height);

    document.getElementById("map-zoom-in")
        .addEventListener("click", () => {
            zoomMap(1.35);
        });

    document.getElementById("map-zoom-out")
        .addEventListener("click", () => {
            zoomMap(1 / 1.35);
        });

    document.getElementById("map-reset")
        .addEventListener("click", () => {

            mapProjection.scale(mapSize);
            mapRotation = [0, -10];
            mapProjection.rotate(mapRotation);

            redrawMap();
        });

    document.getElementById("map-info-close")
        .addEventListener("click", () => {

            document.getElementById("map-info-panel")
                .classList.add("hidden");
        });

    mapInitialized = true;
}


function zoomMap(factor) {

    const current = mapProjection.scale();

    const next = current * factor;

    mapProjection.scale(
        Math.max(mapMinScale, Math.min(mapMaxScale, next))
    );

    redrawMap();
}


function attachMapInteractions(svgElement, width, height) {

    let dragging = false;
    let pinching = false;

    let lastX = 0;
    let lastY = 0;

    let pinchStartDistance = 0;
    let pinchStartScale = mapSize;

    svgElement.addEventListener("mousedown", event => {
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
    });

    window.addEventListener("mouseup", () => {
        dragging = false;
    });

    window.addEventListener("mousemove", event => {

        if (!dragging) return;

        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;

        mapRotation[0] += dx * 0.4;
        mapRotation[1] -= dy * 0.4;
        mapRotation[1] = Math.max(-90, Math.min(90, mapRotation[1]));

        mapProjection.rotate(mapRotation);
        redrawMap();

        lastX = event.clientX;
        lastY = event.clientY;
    });

    svgElement.addEventListener("wheel", event => {

        event.preventDefault();

        zoomMap(event.deltaY > 0 ? 0.9 : 1.1);

    }, { passive: false });

    svgElement.addEventListener("touchstart", event => {

        if (event.touches.length === 2) {
            pinching = true;
            dragging = false;
            pinchStartDistance = getTouchDistance(event.touches);
            pinchStartScale = mapProjection.scale();
            return;
        }

        if (!event.touches.length) return;

        dragging = true;
        lastX = event.touches[0].clientX;
        lastY = event.touches[0].clientY;

    }, { passive: true });

    svgElement.addEventListener("touchend", event => {

        dragging = false;

        if (event.touches.length < 2) {
            pinching = false;
        }

    }, { passive: true });

    svgElement.addEventListener("touchmove", event => {

        if (pinching && event.touches.length === 2) {

            event.preventDefault();

            const distance = getTouchDistance(event.touches);
            const ratio = distance / pinchStartDistance;
            const next = pinchStartScale * ratio;

            mapProjection.scale(
                Math.max(mapMinScale, Math.min(mapMaxScale, next))
            );

            redrawMap();

            return;
        }

        if (!dragging || !event.touches.length) return;

        const dx = event.touches[0].clientX - lastX;
        const dy = event.touches[0].clientY - lastY;

        mapRotation[0] += dx * 0.4;
        mapRotation[1] -= dy * 0.4;
        mapRotation[1] = Math.max(-90, Math.min(90, mapRotation[1]));

        mapProjection.rotate(mapRotation);
        redrawMap();

        lastX = event.touches[0].clientX;
        lastY = event.touches[0].clientY;

        event.preventDefault();

    }, { passive: false });
}


function redrawMap() {

    if (!mapSvg || !mapProjection) {
        return;
    }

    const rotation = mapProjection.rotate();

    /* بزرگ‌نمایی نسبی نسبت به اندازه پایه (برای اسم اقیانوس‌ها و دایره تنگه‌ها) */

    const zoomRatio = mapProjection.scale() / mapSize;

    mapSvg.selectAll("path.globe-water, path.map-country")
        .attr("d", mapPath);

    /* برچسب اقیانوس‌ها - کمی بزرگ‌تر می‌شوند، نه به‌اندازه کل زوم */

    const oceanFontSize =
        Math.min(11, 6.5 * (1 + (zoomRatio - 1) * 0.25));

    mapSvg.selectAll(".map-ocean-label")
        .style("font-size", `${oceanFontSize}px`)
        .attr("opacity", d =>
            isPointVisible(d[0], d[1], rotation) ? 1 : 0
        )
        .attr("x", d => {
            const p = mapProjection([d[0], d[1]]);
            return p ? p[0] : -9999;
        })
        .attr("y", d => {
            const p = mapProjection([d[0], d[1]]);
            return p ? p[1] : -9999;
        });

    /* اسم کشورها */

    mapSvg.selectAll(".map-country-label")
        .attr("opacity", d => {

            const countryId = Number(d.id);

            const entry =
                Object.entries(COUNTRY_IDS).find(
                    ([, id]) => id === countryId
                );

            if (!entry) return 0;

            const [, id] = entry;

            const feature =
                mapSvg.selectAll(".map-country")
                    .data()
                    .find(f => Number(f.id) === id);

            if (!feature) return 0;

            const centroid = mapPath.centroid(feature);

            return isNaN(centroid[0]) ? 0 : 1;
        })
        .attr("x", d => {
            const c = mapPath.centroid(d);
            return isNaN(c[0]) ? -9999 : c[0];
        })
        .attr("y", d => {
            const c = mapPath.centroid(d);
            return isNaN(c[1]) ? -9999 : c[1];
        });

    /* دایره تنگه‌ها - اندازه ثابت، فقط جای‌شان دقیق تغییر می‌کند */

    mapSvg.selectAll(".map-strait-dot")
        .attr("opacity", d =>
            isPointVisible(d.lon, d.lat, rotation) ? 1 : 0
        )
        .attr("cx", d => {
            const p = mapProjection([d.lon, d.lat]);
            return p ? p[0] : -9999;
        })
        .attr("cy", d => {
            const p = mapProjection([d.lon, d.lat]);
            return p ? p[1] : -9999;
        });
}


function updateMapColors() {

    if (!mapSvg) {
        return;
    }

    mapSvg.selectAll(".map-country")
        .attr("fill", d => {

            const countryId = Number(d.id);

            const gameEntry =
                Object.entries(COUNTRY_IDS).find(
                    ([, id]) => id === countryId
                );

            if (!gameEntry) {
                return "#151b21";
            }

            const [countryKey] = gameEntry;

            if (countryKey === selectedCountry) {
                return "#d98a25";
            }

            const info = countries[countryKey];

            if (info?.taken) {
                return "#3978b7";
            }

            return "#1c2733";
        })
        .attr("stroke", d => {

            const countryId = Number(d.id);

            const isGameCountry =
                Object.values(COUNTRY_IDS).includes(countryId);

            return isGameCountry ? "#2d3a48" : "#141c25";
        })
        .attr("stroke-width", .6);
}


function showCountryInfo(feature) {

    const countryId = Number(feature.id);

    const gameEntry =
        Object.entries(COUNTRY_IDS).find(
            ([, id]) => id === countryId
        );

    const panel = document.getElementById("map-info-panel");
    const flagEl = document.getElementById("map-info-flag");
    const nameEl = document.getElementById("map-info-name");
    const statusEl = document.getElementById("map-info-status");
    const descEl = document.getElementById("map-info-desc");

    if (!gameEntry) {

        flagEl.textContent = "🏳️";
        nameEl.textContent = "منطقه غیرقابل‌بازی";
        statusEl.textContent = "بی‌صاحب";
        descEl.textContent =
            "این منطقه در حال حاضر توسط هیچ بازیکنی کنترل نمی‌شود.";

        panel.classList.remove("hidden");

        return;
    }

    const [countryKey] = gameEntry;
    const info = countries[countryKey];

    flagEl.textContent = COUNTRY_FLAGS[countryKey];
    nameEl.textContent = COUNTRY_NAMES[countryKey];

    if (countryKey === selectedCountry) {

        statusEl.textContent = "کشور شما";
        descEl.textContent = "این کشور تحت فرماندهی شماست.";

    } else if (info?.taken) {

        statusEl.textContent = "در اختیار بازیکن دیگر";
        descEl.textContent = "این کشور توسط بازیکن دیگری انتخاب شده است.";

    } else {

        statusEl.textContent = "بی‌صاحب";
        descEl.textContent = "هنوز هیچ بازیکنی این کشور را انتخاب نکرده است.";
    }

    panel.classList.remove("hidden");
}


function showStraitInfo(strait) {

    const panel = document.getElementById("map-info-panel");
    const flagEl = document.getElementById("map-info-flag");
    const nameEl = document.getElementById("map-info-name");
    const statusEl = document.getElementById("map-info-status");
    const descEl = document.getElementById("map-info-desc");

    flagEl.textContent = "⚓";
    nameEl.textContent = strait.name;
    statusEl.textContent = "تحت کنترل هیچ‌کس نیست";
    descEl.textContent = strait.desc;

    panel.classList.remove("hidden");
}


/* =========================================================
   شروع
========================================================= */

(async function init() {

    await loadCountries();

    await loadPlayer();

})();
