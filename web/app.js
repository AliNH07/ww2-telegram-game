const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
}

const userId =
    tg?.initDataUnsafe?.user?.id || null;


let player = null;
let countries = {};
let selectedCountry = null;
let messageTargetCountry = null;


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


/* =====================================================
   API
===================================================== */

function getApiUrl(path, params = {}) {

    const url =
        new URL(path, window.location.origin);

    Object.entries(params).forEach(
        ([key, value]) => {
            url.searchParams.set(key, value);
        }
    );

    return url.toString();
}


/* =====================================================
   نمایش صفحه
===================================================== */

function showOnly(id) {

    document
        .querySelectorAll(".screen")
        .forEach(screen => {
            screen.classList.add("hidden");
        });

    const target =
        document.getElementById(id);

    if (target) {
        target.classList.remove("hidden");
    }
}


/* =====================================================
   کشورها
===================================================== */

async function loadCountries() {

    try {

        const response =
            await fetch("/api/countries");

        const data =
            await response.json();

        countries = {};

        data.forEach(country => {
            countries[country.id] = country;
        });

        updateCountryCards();

    } catch (error) {

        console.error(
            "Countries error:",
            error
        );
    }
}


/* =====================================================
   بازیکن
===================================================== */

async function loadPlayer() {

    if (!userId) {

        showOnly("country");

        return;
    }

    try {

        const response =
            await fetch(
                getApiUrl(
                    "/api/player",
                    {
                        user_id: userId
                    }
                )
            );

        player =
            await response.json();

        if (player.country) {

            selectedCountry =
                player.country;

            showCountryPreview();

        } else {

            showCountrySelection();
        }

    } catch (error) {

        console.error(error);

        showCountrySelection();
    }
}


/* =====================================================
   انتخاب کشور
===================================================== */

function showCountrySelection() {

    showOnly("country");

    updateCountryCards();
}


function updateCountryCards() {

    document
        .querySelectorAll(
            "[data-country-card]"
        )
        .forEach(card => {

            const id =
                card.dataset.country;

            const country =
                countries[id];

            if (!country) {
                return;
            }

            if (
                country.taken &&
                player?.country !== id
            ) {

                card.classList.add("taken");

            } else {

                card.classList.remove("taken");
            }
        });
}


document
    .querySelectorAll(
        "[data-country-card]"
    )
    .forEach(card => {

        card.addEventListener(
            "click",
            async () => {

                const id =
                    card.dataset.country;

                const country =
                    countries[id];

                if (
                    country?.taken &&
                    player?.country !== id
                ) {

                    showMessage(
                        "این کشور قبلاً توسط بازیکن دیگری انتخاب شده است."
                    );

                    return;
                }

                await selectCountry(id);
            }
        );
    });


async function selectCountry(countryId) {

    if (!userId) {

        showMessage(
            "بازی را از داخل تلگرام باز کنید."
        );

        return;
    }

    try {

        const response =
            await fetch(
                getApiUrl(
                    "/api/select-country",
                    {
                        user_id: userId,
                        country: countryId
                    }
                )
            );

        const data =
            await response.json();

        if (!response.ok) {

            if (
                data.error ===
                "country_taken"
            ) {

                showMessage(
                    "این کشور قبلاً گرفته شده است."
                );

                await loadCountries();

                return;
            }

            if (
                data.error ===
                "already_has_country"
            ) {

                showMessage(
                    "شما قبلاً کشور انتخاب کرده‌اید."
                );

                return;
            }

            throw new Error(
                data.error
            );
        }

        player = data;

        selectedCountry =
            countryId;

        await loadCountries();

        showCountryPreview();

    } catch (error) {

        console.error(error);

        showMessage(
            "خطا در انتخاب کشور."
        );
    }
}


/* =====================================================
   پیام انتخاب کشور
===================================================== */

function showMessage(text) {

    const box =
        document.getElementById(
            "country-message"
        );

    if (!box) {
        return;
    }

    box.textContent = text;

    setTimeout(() => {

        if (box.textContent === text) {
            box.textContent = "";
        }

    }, 4000);
}


/* =====================================================
   پیش نمایش کشور
===================================================== */

function showCountryPreview() {

    if (!selectedCountry) {

        showCountrySelection();

        return;
    }

    showOnly("country-preview");


    const flag =
        COUNTRY_FLAGS[selectedCountry] ||
        "🌍";


    const name =
        COUNTRY_NAMES[selectedCountry] ||
        selectedCountry;


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


/* =====================================================
   برگشت برای عوض کردن کشور
===================================================== */

document
    .getElementById(
        "back-to-country-button"
    )
    .addEventListener(
        "click",
        () => {

            showCountrySelection();
        }
    );


/* =====================================================
   ورود به بازی
===================================================== */

document
    .getElementById(
        "enter-game-button"
    )
    .addEventListener(
        "click",
        () => {

            showGame();
        }
    );


function showGame() {

    showOnly("game");

    updateGameHeader();

    updateHomeStats();

    loadNews();

    setTimeout(() => {

        createGlobe(
            "globe-container",
            "globe",
            selectedCountry
        );

    }, 100);
}


/* =====================================================
   هدر
===================================================== */

function updateGameHeader() {

    const flag =
        COUNTRY_FLAGS[selectedCountry] ||
        "🌍";

    document.getElementById(
        "game-country-flag"
    ).textContent = flag;
}


/* =====================================================
   آمار
===================================================== */

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
            ? formatPopulation(
                country.population
            )
            : "0";


    document.getElementById(
        "home-year"
    ).textContent =
        player.year ?? 1939;
}


function formatPopulation(value) {

    if (value >= 1000000) {

        return Math.round(
            value / 1000000
        ) + "M";
    }

    return value;
}


/* =====================================================
   فوتر
===================================================== */

document
    .querySelectorAll(".nav-item")
    .forEach(item => {

        item.addEventListener(
            "click",
            () => {

                const page =
                    item.dataset.page;

                openGamePage(page);

            }
        );
    });


function openGamePage(page) {

    document
        .querySelectorAll(".game-page")
        .forEach(element => {

            element.classList.add(
                "hidden"
            );

        });


    const target =
        document.getElementById(page);

    if (target) {

        target.classList.remove(
            "hidden"
        );
    }


    document
        .querySelectorAll(".nav-item")
        .forEach(nav => {

            nav.classList.remove(
                "active"
            );

        });


    const active =
        document.querySelector(
            `.nav-item[data-page="${page}"]`
        );

    if (active) {
        active.classList.add("active");
    }


    if (page === "home") {

        setTimeout(() => {

            createGlobe(
                "globe-container",
                "globe",
                selectedCountry
            );

        }, 100);
    }


    if (page === "world-map") {

        setTimeout(() => {

            createGlobe(
                "world-map-globe-container",
                "world-map-globe",
                selectedCountry
            );

        }, 100);
    }


    if (page === "communications") {

        resetCommunicationPage();
    }
}


/* =====================================================
   ارتباطات
===================================================== */

document
    .getElementById(
        "open-country-messages"
    )
    .addEventListener(
        "click",
        () => {

            const panel =
                document.getElementById(
                    "country-message-panel"
                );

            panel.classList.toggle(
                "hidden"
            );

            if (!panel.classList.contains("hidden")) {

                buildMessageCountryList();
            }
        }
    );


function resetCommunicationPage() {

    document
        .getElementById(
            "country-message-panel"
        )
        .classList.add("hidden");


    document
        .getElementById(
            "message-box"
        )
        .classList.add("hidden");
}


function buildMessageCountryList() {

    const list =
        document.getElementById(
            "message-country-list"
        );

    list.innerHTML = "";


    Object.values(countries)
        .forEach(country => {

            if (
                country.id ===
                selectedCountry
            ) {
                return;
            }


            const button =
                document.createElement(
                    "button"
                );


            button.className =
                "message-country-item";


            button.innerHTML = `

                <div class="message-country-flag">
                    ${COUNTRY_FLAGS[country.id] || "🌍"}
                </div>

                <div class="message-country-info">

                    <strong>
                        ${country.name}
                    </strong>

                    <small>
                        ارسال پیام
                    </small>

                </div>

                <span>←</span>
            `;


            button.addEventListener(
                "click",
                () => {

                    openMessageBox(
                        country.id,
                        country.name
                    );

                }
            );


            list.appendChild(button);

        });
}


/* =====================================================
   نوشتن پیام
===================================================== */

function openMessageBox(
    countryId,
    countryName
) {

    messageTargetCountry =
        countryId;


    document.getElementById(
        "message-target-name"
    ).textContent =
        "پیام به " + countryName;


    document.getElementById(
        "country-message-input"
    ).value = "";


    document.getElementById(
        "message-box"
    ).classList.remove(
        "hidden"
    );
}


/* =====================================================
   ارسال پیام
===================================================== */

document
    .getElementById(
        "send-country-message"
    )
    .addEventListener(
        "click",
        async () => {

            const input =
                document.getElementById(
                    "country-message-input"
                );


            const message =
                input.value.trim();


            if (!message) {

                alert(
                    "پیام را وارد کنید."
                );

                return;
            }


            if (!messageTargetCountry) {
                return;
            }


            /*
             * فعلاً پیام فقط برای تست
             * در سرور ثبت می‌شود.
             */

            try {

                const response =
                    await fetch(
                        getApiUrl(
                            "/api/message",
                            {
                                user_id: userId,
                                country:
                                    messageTargetCountry,
                                message:
                                    message
                            }
                        )
                    );


                if (response.ok) {

                    alert(
                        "پیام ارسال شد."
                    );

                    input.value = "";

                } else {

                    alert(
                        "ارسال پیام ناموفق بود."
                    );
                }

            } catch (error) {

                console.error(error);

                alert(
                    "خطا در ارسال پیام."
                );
            }
        }
    );


/* =====================================================
   اخبار
===================================================== */

async function loadNews() {

    const container =
        document.getElementById(
            "news-list"
        );

    if (!container) {
        return;
    }


    try {

        const response =
            await fetch(
                "/api/news"
            );


        const news =
            await response.json();


        container.innerHTML = "";


        news.forEach(item => {

            const article =
                document.createElement(
                    "div"
                );


            article.className =
                "news-item";


            article.innerHTML = `
                <h3>
                    ${item.title || ""}
                </h3>

                <p>
                    ${item.text || ""}
                </p>
            `;


            container.appendChild(
                article
            );

        });

    } catch (error) {

        console.error(error);

        container.innerHTML = `
            <div class="news-item">
                <h3>اخبار</h3>
                <p>
                    فعلاً خبری وجود ندارد.
                </p>
            </div>
        `;
    }
}


/* =====================================================
   کره جهان
===================================================== */

async function createGlobe(
    containerId,
    svgId,
    selected
) {

    const container =
        document.getElementById(
            containerId
        );


    const svgElement =
        document.getElementById(
            svgId
        );


    if (
        !container ||
        !svgElement
    ) {
        return;
    }


    const width =
        container.clientWidth || 400;


    const height =
        container.clientHeight || 400;


    const size =
        Math.min(
            width,
            height
        ) * 0.42;


    d3.select(svgElement)
        .selectAll("*")
        .remove();


    const svg =
        d3.select(svgElement)
            .attr(
                "viewBox",
                `0 0 ${width} ${height}`
            );


    const projection =
        d3.geoOrthographic()
            .scale(size)
            .translate([
                width / 2,
                height / 2
            ])
            .clipAngle(90);


    const path =
        d3.geoPath(
            projection
        );


    let world;


    try {

        const response =
            await fetch(
                "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
            );


        world =
            await response.json();

    } catch (error) {

        console.error(
            "World map error:",
            error
        );

        return;
    }


    const land =
        topojson.feature(
            world,
            world.objects.countries
        );


    const sphere = {
        type: "Sphere"
    };


    svg.append("path")
        .datum(sphere)
        .attr(
            "class",
            "globe-water"
        )
        .attr(
            "d",
            path
        );


    svg.selectAll(
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
            path
        )
        .attr(
            "fill",
            d => {

                const id =
                    Number(d.id);


                if (
                    selected &&
                    COUNTRY_IDS[selected] === id
                ) {

                    return "#d98a25";
                }


                const taken =
                    Object.values(
                        countries
                    ).some(
                        country =>
                            country.taken &&
                            COUNTRY_IDS[
                                country.id
                            ] === id
                    );


                if (taken) {
                    return "#3978b7";
                }


                return "#151b21";
            }
        )
        .attr(
            "stroke",
            d => {

                const id =
                    Number(d.id);


                if (
                    Object.values(
                        COUNTRY_IDS
                    ).includes(id)
                ) {

                    return "#303a45";
                }


                return "none";
            }
        )
        .attr(
            "stroke-width",
            .6
        );


    let rotation =
        projection.rotate();


    let dragging = false;

    let lastX = 0;
    let lastY = 0;


    function redraw() {

        svg.selectAll("path")
            .attr(
                "d",
                path
            );
    }


    function rotate() {

        if (!dragging) {

            rotation[0] += .08;

            projection.rotate(
                rotation
            );

            redraw();
        }

        requestAnimationFrame(
            rotate
        );
    }


    requestAnimationFrame(
        rotate
    );


    svgElement.addEventListener(
        "mousedown",
        event => {

            dragging = true;

            lastX =
                event.clientX;

            lastY =
                event.clientY;
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
                event.clientX -
                lastX;


            const dy =
                event.clientY -
                lastY;


            rotation[0] +=
                dx * .5;


            rotation[1] -=
                dy * .5;


            rotation[1] =
                Math.max(
                    -90,
                    Math.min(
                        90,
                        rotation[1]
                    )
                );


            projection.rotate(
                rotation
            );


            redraw();


            lastX =
                event.clientX;

            lastY =
                event.clientY;
        }
    );


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
        {
            passive: true
        }
    );


    svgElement.addEventListener(
        "touchend",
        () => {

            dragging = false;

        },
        {
            passive: true
        }
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
                event.touches[0].clientX -
                lastX;


            const dy =
                event.touches[0].clientY -
                lastY;


            rotation[0] +=
                dx * .5;


            rotation[1] -=
                dy * .5;


            rotation[1] =
                Math.max(
                    -90,
                    Math.min(
                        90,
                        rotation[1]
                    )
                );


            projection.rotate(
                rotation
            );


            redraw();


            lastX =
                event.touches[0].clientX;


            lastY =
                event.touches[0].clientY;


            event.preventDefault();

        },
        {
            passive: false
        }
    );


    svgElement.addEventListener(
        "wheel",
        event => {

            event.preventDefault();


            const current =
                projection.scale();


            const next =
                current *
                (
                    event.deltaY > 0
                        ? .9
                        : 1.1
                );


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
        {
            passive: false
        }
    );
}


/* =====================================================
   شروع برنامه
===================================================== */

(async function init() {

    await loadCountries();

    await loadPlayer();

})();
