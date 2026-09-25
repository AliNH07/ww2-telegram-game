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

const SECTION_NAMES = {
    war: "جنگ",
    army: "ارتش",
    diplomacy: "دیپلماسی",
    economy: "اقتصاد",
    infrastructure: "زیرساخت",
    market: "بازار جهانی"
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


function formatMoney(value) {

    return "$" + Number(value ?? 0).toLocaleString("en-US");
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

            /*
             * بازیکنی که قبلاً واقعاً وارد بازی شده
             * (کشورش در بک‌اند ثبت شده است).
             */

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

            /*
             * اگر کشور متعلق به خود کاربر است،
             * نباید خاکستری شود.
             */
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
   دکمه بازگشت (فقط تغییر انتخاب محلی، چیزی در بک‌اند تغییر نمی‌کند)
========================================================= */

document
    .getElementById("preview-back-button")
    .addEventListener("click", () => {

        selectedCountry = null;

        showCountrySelection();
    });


/* =========================================================
   ورود به بازی -> اینجاست که کشور واقعاً برای کاربر ثبت می‌شود
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


    /*
     * اگر این بازیکن قبلاً همین کشور را
     * در بک‌اند ثبت کرده (مثلاً بعد از رفرش صفحه)،
     * نیازی به فراخوانی دوباره API نیست.
     */

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
        "home-money"
    ).textContent =
        formatMoney(player.money);

    document.getElementById(
        "home-army"
    ).textContent =
        player.army ?? 0;

    document.getElementById(
        "home-power"
    ).textContent =
        player.power ?? 0;

    document.getElementById(
        "home-season"
    ).textContent =
        player.season ?? "بهار";

    document.getElementById(
        "home-day"
    ).textContent =
        `${player.day ?? 1} / 31`;
}


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

                createGlobe(
                    "map-globe-container",
                    "map-globe",
                    selectedCountry
                );

            }, 50);
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
   کره جهان
========================================================= */

function getTouchDistance(touches) {

    const dx =
        touches[0].clientX - touches[1].clientX;

    const dy =
        touches[0].clientY - touches[1].clientY;

    return Math.hypot(dx, dy);
}


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

    /*
     * نزدیک‌تر از قبل شروع می‌شود
     * (قبلاً 0.42 بود)
     */

    const size =
        Math.min(width, height) * 0.62;

    const minScale = size * 0.5;
    const maxScale = size * 3;

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
    let pinching = false;

    let lastX = 0;
    let lastY = 0;

    let pinchStartDistance = 0;
    let pinchStartScale = size;


    function redraw() {

        svg.selectAll("path")
            .attr("d", path);
    }


    function rotate() {

        if (!dragging && !pinching) {

            rotation[0] += 0.08;

            projection.rotate(rotation);

            redraw();
        }

        requestAnimationFrame(rotate);
    }

    requestAnimationFrame(rotate);


    /* موس - چرخش */

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


    /* موس - زوم با چرخ */

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
                    minScale,
                    Math.min(maxScale, next)
                )
            );

            redraw();

        },
        { passive: false }
    );


    /* لمس موبایل - چرخش با یک انگشت / زوم با دو انگشت */

    svgElement.addEventListener(
        "touchstart",
        event => {

            if (event.touches.length === 2) {

                pinching = true;
                dragging = false;

                pinchStartDistance =
                    getTouchDistance(event.touches);

                pinchStartScale =
                    projection.scale();

                return;
            }

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
        event => {

            dragging = false;

            if (event.touches.length < 2) {
                pinching = false;
            }
        },
        { passive: true }
    );


    svgElement.addEventListener(
        "touchmove",
        event => {

            if (pinching && event.touches.length === 2) {

                event.preventDefault();

                const distance =
                    getTouchDistance(event.touches);

                const ratio =
                    distance / pinchStartDistance;

                const next =
                    pinchStartScale * ratio;

                projection.scale(
                    Math.max(
                        minScale,
                        Math.min(maxScale, next)
                    )
                );

                redraw();

                return;
            }

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
}


/* =========================================================
   شروع
========================================================= */

(async function init() {

    await loadCountries();

    await loadPlayer();

})();
