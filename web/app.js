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
let previousScreen = null;

const COUNTRY_FLAGS = {
    germany: "🇩🇪",
    britain: "🇬🇧",
    ussr: "☭",
    usa: "🇺🇸",
    france: "🇫🇷",
    italy: "🇮🇹"
};

const COUNTRY_NAMES = {
    germany: "آلمان",
    britain: "بریتانیا",
    ussr: "شوروی",
    usa: "آمریکا",
    france: "فرانسه",
    italy: "ایتالیا"
};

const COUNTRY_IDS = {
    germany: 276,
    britain: 826,
    ussr: 643,
    usa: 840,
    france: 250,
    italy: 380
};


/* =========================================================
   ابزارهای عمومی
========================================================= */

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

            showCountryPreview();

        } else {

            showCountrySelection();
        }

    } catch (error) {

        console.error(error);

        showCountrySelection();
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
   انتخاب کشور
========================================================= */

document.querySelectorAll("[data-country-card]").forEach(card => {

    card.addEventListener("click", async () => {

        const countryId = card.dataset.country;

        const country = countries[countryId];

        if (country?.taken && player?.country !== countryId) {

            showMessage(
                "این کشور قبلاً توسط بازیکن دیگری انتخاب شده است."
            );

            return;
        }

        await selectCountry(countryId);
    });
});


async function selectCountry(countryId) {

    if (!userId) {

        showMessage(
            "برای اجرای بازی باید از داخل تلگرام وارد شوید."
        );

        return;
    }

    try {

        const response = await fetch(
            getApiUrl("/api/select-country", {
                user_id: userId,
                country: countryId
            })
        );

        const data = await response.json();

        if (!response.ok) {

            if (data.error === "country_taken") {

                showMessage(
                    "این کشور قبلاً توسط بازیکن دیگری انتخاب شده است."
                );

                await loadCountries();

                return;
            }

            if (data.error === "already_has_country") {

                showMessage(
                    "شما قبلاً یک کشور انتخاب کرده‌اید."
                );

                return;
            }

            throw new Error(
                data.error || "Country selection failed"
            );
        }

        player = data;

        selectedCountry = countryId;

        await loadCountries();

        showCountryPreview();

    } catch (error) {

        console.error(error);

        showMessage(
            "خطا در انتخاب کشور. دوباره امتحان کنید."
        );
    }
}


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

    const flag =
        COUNTRY_FLAGS[selectedCountry] || "🌍";

    const name =
        COUNTRY_NAMES[selectedCountry] || selectedCountry;

    document.getElementById(
        "selected-country-flag"
    ).textContent = flag;

    document.getElementById(
        "preview-country-name"
    ).textContent = name;

    createGlobe(
        "preview-globe-container",
        "preview-globe",
        selectedCountry
    );
}


/* =========================================================
   ورود به بازی
========================================================= */

document
    .getElementById("enter-game-button")
    .addEventListener("click", () => {

        showGame();
    });


function showGame() {

    showOnly("game");

    updateGameHeader();
    updateHomeStats();

    // تنظیم صفحه پیش‌فرض روی خانه
    switchPage("home");

    createGlobe(
        "globe-container",
        "globe",
        selectedCountry
    );

    loadNews();
}


/* =========================================================
   هدر بازی
========================================================= */

function updateGameHeader() {

    const flag =
        COUNTRY_FLAGS[selectedCountry] || "🌍";

    document.getElementById(
        "game-country-flag"
    ).textContent = flag;
}


/* =========================================================
   آمار خانه
========================================================= */

function updateHomeStats() {

    if (!player) {
        return;
    }

    document.getElementById(
        "home-economy"
    ).textContent =
        player.money ?? 0;

    document.getElementById(
        "home-army"
    ).textContent =
        player.army ?? 0;

    const country =
        countries[selectedCountry];

    document.getElementById(
        "home-population"
    ).textContent =
        country?.population
            ? formatPopulation(country.population)
            : "0";

    document.getElementById(
        "home-year"
    ).textContent =
        player.year ?? 1939;
}


function formatPopulation(value) {

    if (value >= 1000000) {
        return Math.round(value / 1000000) + "M";
    }

    return value;
}


/* =========================================================
   تغییر صفحه (توسط فوتر یا دکمه‌ها)
========================================================= */

function switchPage(page) {

    // مخفی کردن همه صفحات بازی
    document.querySelectorAll(".game-page").forEach(
        element => {
            element.classList.add("hidden");
        }
    );

    // نمایش صفحه مقصد
    const target =
        document.getElementById(page);

    if (target) {
        target.classList.remove("hidden");
    }

    // به‌روزرسانی وضعیت فوتر
    document.querySelectorAll(".nav-item").forEach(
        nav => {
            nav.classList.remove("active");
        }
    );

    const activeNav =
        document.querySelector(`.nav-item[data-page="${page}"]`);

    if (activeNav) {
        activeNav.classList.add("active");
    }

    // اگر صفحه خانه بود، کره را دوباره بساز
    if (page === "home") {

        setTimeout(() => {

            createGlobe(
                "globe-container",
                "globe",
                selectedCountry
            );

        }, 50);
    }

    // اگر صفحه نقشه جهانی بود، کره نقشه را بساز
    if (page === "map") {

        setTimeout(() => {

            createGlobe(
                "map-globe-container",
                "map-globe",
                selectedCountry
            );

        }, 50);
    }

    // اگر صفحه اخبار بود، اخبار را بارگذاری کن
    if (page === "news") {

        loadNews();
    }
}


/* =========================================================
   فوتر (نوار پایین)
========================================================= */

document.querySelectorAll(".nav-item").forEach(item => {

    item.addEventListener("click", () => {

        const page = item.dataset.page;

        switchPage(page);
    });
});


/* =========================================================
   دکمه بازگشت
========================================================= */

document
    .getElementById("back-button")
    ?.addEventListener("click", () => {

        // اگر در صفحه ارتباطات هستیم
        if (!document.getElementById("communications").classList.contains("hidden")) {

            // اگر زیرصفحه باز است، ببند
            if (!document.getElementById("communications-sub").classList.contains("hidden")) {

                document.getElementById("communications-sub").classList.add("hidden");
                document.getElementById("communications-main").classList.remove("hidden");

                updatePageTitle("ارتباطات", "روابط بین کشورها");

                return;
            }
        }

        // اگر در صفحه نقشه هستیم
        if (!document.getElementById("map").classList.contains("hidden")) {

            switchPage("home");
            return;
        }

        // اگر در صفحه اخبار هستیم
        if (!document.getElementById("news").classList.contains("hidden")) {

            switchPage("home");
            return;
        }

        // اگر در صفحه اشتراک هستیم
        if (!document.getElementById("subscription").classList.contains("hidden")) {

            switchPage("home");
            return;
        }
    });


function updatePageTitle(title, subtitle) {

    const titleElement =
        document.querySelector("#communications-main .page-title h1");

    const subtitleElement =
        document.querySelector("#communications-main .page-title span");

    if (titleElement) {
        titleElement.textContent = title;
    }

    if (subtitleElement) {
        subtitleElement.textContent = subtitle;
    }
}


/* =========================================================
   ارتباطات - زیرصفحه‌ها
========================================================= */

// دکمه اخبار در ارتباطات
document
    .getElementById("comm-news-button")
    ?.addEventListener("click", () => {

        switchPage("news");
    });


// دکمه پیام به کشورها در ارتباطات
document
    .getElementById("comm-message-button")
    ?.addEventListener("click", () => {

        document.getElementById("communications-main").classList.add("hidden");
        document.getElementById("communications-sub").classList.remove("hidden");
    });


// دکمه بازگشت از زیرصفحه ارتباطات
document
    .getElementById("comm-back-button")
    ?.addEventListener("click", () => {

        document.getElementById("communications-sub").classList.add("hidden");
        document.getElementById("communications-main").classList.remove("hidden");
    });


// دکمه ارسال پیام
document
    .getElementById("send-message-button")
    ?.addEventListener("click", () => {

        const targetCountry =
            document.getElementById("message-target")?.value;

        const messageText =
            document.getElementById("message-text")?.value;

        if (!targetCountry || !messageText) {

            alert("لطفاً کشور هدف و متن پیام را وارد کنید.");
            return;
        }

        alert(`پیام به ${COUNTRY_NAMES[targetCountry] || targetCountry} ارسال شد.`);

        // پاک کردن فرم
        document.getElementById("message-target").value = "";
        document.getElementById("message-text").value = "";
    });


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
   کره جهان
========================================================= */

async function createGlobe(
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

    const width =
        container.clientWidth || 400;

    const height =
        container.clientHeight || 400;

    const size =
        Math.min(width, height) * 0.42;

    d3.select(svgElement).selectAll("*").remove();

    const svg =
        d3.select(svgElement)
            .attr("viewBox", `0 0 ${width} ${height}`);

    const projection =
        d3.geoOrthographic()
            .scale(size)
            .translate([width / 2, height / 2])
            .clipAngle(90);

    const path =
        d3.geoPath(projection);

    let world;

    try {

        const response =
            await fetch(
                "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
            );

        world = await response.json();

    } catch (error) {

        console.error(
            "World map loading failed:",
            error
        );

        return;
    }

    const land =
        topojson.feature(
            world,
            world.objects.countries
        );

    const sphere =
        { type: "Sphere" };


    /* کره */

    svg.append("path")
        .datum(sphere)
        .attr("class", "globe-water")
        .attr("d", path);


    /* کشورها */

    svg.selectAll(".country-shape")
        .data(land.features)
        .enter()
        .append("path")
        .attr("class", "country-shape")
        .attr("d", path)
        .attr("data-country-id", d => d.id)
        .attr("fill", d => {

            const countryId =
                Number(d.id);

            if (
                selected &&
                COUNTRY_IDS[selected] === countryId
            ) {
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
                Object.values(COUNTRY_IDS)
                    .includes(countryId);

            if (isGameCountry) {
                return "#111820";
            }

            return "#151b21";
        })
        .attr("stroke", d => {

            const countryId =
                Number(d.id);

            const isGameCountry =
                Object.values(COUNTRY_IDS)
                    .includes(countryId);

            return isGameCountry
                ? "#26313c"
                : "none";
        })
        .attr("stroke-width", .6);


    /* چرخش */

    let rotation = projection.rotate();

    let dragging = false;
    let lastX = 0;
    let lastY = 0;


    function redraw() {

        svg.selectAll("path")
            .attr("d", path);
    }


    function rotate() {

        if (!dragging) {

            rotation[0] += 0.08;

            projection.rotate(rotation);

            redraw();
        }

        requestAnimationFrame(rotate);
    }

    requestAnimationFrame(rotate);


    /* موس */

    svgElement.addEventListener(
        "mousedown",
        event => {

            dragging = true;

            lastX = event.clientX;
            lastY = event.clientY;
        }
    );


    window.addEventListener(
        "mouseup",
        () => {

            dragging = false;
        }
    );


    window.addEventListener(
        "mousemove",
        event => {

            if (!dragging) {
                return;
            }

            const dx =
                event.clientX - lastX;

            const dy =
                event.clientY - lastY;

            rotation[0] += dx * 0.5;
            rotation[1] -= dy * 0.5;

            rotation[1] =
                Math.max(
                    -90,
                    Math.min(90, rotation[1])
                );

            projection.rotate(rotation);

            redraw();

            lastX = event.clientX;
            lastY = event.clientY;
        }
    );


    /* لمس موبایل */

    svgElement.addEventListener(
        "touchstart",
        event => {

            if (!event.touches.length) {
                return;
            }

            dragging = true;

            lastX =
                event.touches[0].clientX;

            lastY =
                event.touches[0].clientY;
        },
        { passive: true }
    );


    svgElement.addEventListener(
        "touchend",
        () => {

            dragging = false;
        },
        { passive: true }
    );


    svgElement.addEventListener(
        "touchmove",
        event => {

            if (
                !dragging ||
                !event.touches.length
            ) {
                return;
            }

            const dx =
                event.touches[0].clientX - lastX;

            const dy =
                event.touches[0].clientY - lastY;

            rotation[0] += dx * 0.5;
            rotation[1] -= dy * 0.5;

            rotation[1] =
                Math.max(
                    -90,
                    Math.min(90, rotation[1])
                );

            projection.rotate(rotation);

            redraw();

            lastX =
                event.touches[0].clientX;

            lastY =
                event.touches[0].clientY;

            event.preventDefault();

        },
        { passive: false }
    );


    /* زوم */

    svgElement.addEventListener(
        "wheel",
        event => {

            event.preventDefault();

            const current =
                projection.scale();

            const next =
                current *
                (event.deltaY > 0 ? 0.9 : 1.1);

            projection.scale(
                Math.max(
                    120,
                    Math.min(
                        size * 1.7,
                        next
                    )
                )
            );

            redraw();

        },
        { passive: false }
    );
}


/* =========================================================
   شروع
========================================================= */

(async function init() {

    await loadCountries();

    await loadPlayer();

})();
