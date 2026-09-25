const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

const userId =
    tg.initDataUnsafe?.user?.id || null;


/* =========================================
   اطلاعات کشورها
========================================= */

const COUNTRY_FLAGS = {
    germany: "🇩🇪",
    britain: "🇬🇧",
    ussr: "🇷🇺",
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


/*
    نام کشورها در فایل World Atlas
*/
const COUNTRY_IDS = {
    germany: 276,
    britain: 826,
    ussr: 643,
    usa: 840,
    france: 250,
    italy: 380
};


/* =========================================
   متغیرهای اصلی
========================================= */

let player = null;
let countries = [];

let globeSvg = null;
let globeProjection = null;
let globePath = null;

let worldFeatures = [];

let rotation = [0, -10];
let scale = 1;

let isDragging = false;
let startMouse = null;
let startRotation = null;

let autoRotate = true;


/* =========================================
   شروع برنامه
========================================= */

document.addEventListener("DOMContentLoaded", async () => {

    setupNavigation();

    await loadPlayer();

});


/* =========================================
   دریافت اطلاعات بازیکن
========================================= */

async function loadPlayer() {

    if (!userId) {

        showMessage(
            "شناسه کاربر تلگرام دریافت نشد."
        );

        return;
    }

    try {

        const response = await fetch(
            `/api/player?user_id=${userId}`
        );

        if (!response.ok) {
            throw new Error("Player request failed");
        }

        player = await response.json();

        console.log("PLAYER:", player);


        /*
            اگر هنوز کشور انتخاب نشده
        */

        if (!player.country) {

            showCountrySelection();

            await loadCountries();

            return;
        }


        /*
            اگر کشور قبلاً انتخاب شده
        */

        showGame();

        await loadCountries();

    } catch (error) {

        console.error(error);

        showMessage(
            "خطا در دریافت اطلاعات بازیکن."
        );

    }
}


/* =========================================
   نمایش صفحه انتخاب کشور
========================================= */

function showCountrySelection() {

    const countryPage =
        document.getElementById("country");

    countryPage.style.display = "block";


    document.querySelectorAll(".page")
        .forEach(page => {

            page.style.display = "none";

        });


    const nav =
        document.getElementById("bottom-nav");

    if (nav) {
        nav.style.display = "none";
    }


    updateSelectedCountryBadge(null);

    loadGlobe(
        "globe"
    );
}


/* =========================================
   نمایش بازی
========================================= */

function showGame() {

    const countryPage =
        document.getElementById("country");

    if (countryPage) {
        countryPage.style.display = "none";
    }


    const nav =
        document.getElementById("bottom-nav");

    if (nav) {
        nav.style.display = "flex";
    }


    showPage("home");


    updateSelectedCountryBadge(
        player.country
    );


    updateHomeInfo();
}


/* =========================================
   اطلاعات کشورها از سرور
========================================= */

async function loadCountries() {

    try {

        const response =
            await fetch("/api/countries");

        if (!response.ok) {
            throw new Error(
                "Countries request failed"
            );
        }

        countries =
            await response.json();

        console.log(
            "COUNTRIES:",
            countries
        );


        updateCountryCards();

        updateGlobeColors();


    } catch (error) {

        console.error(error);

        showMessage(
            "خطا در دریافت اطلاعات کشورها."
        );
    }
}


/* =========================================
   کارت‌های پایین
========================================= */

function updateCountryCards() {

    document
        .querySelectorAll("[data-country-card]")
        .forEach(card => {

            const countryId =
                card.dataset.countryCard;

            const country =
                countries.find(
                    item =>
                        item.id === countryId
                );

            if (!country) {
                return;
            }


            card.classList.remove(
                "country-taken"
            );


            /*
                کشور خود بازیکن
            */

            if (
                player &&
                player.country === countryId
            ) {

                card.classList.remove(
                    "country-taken"
                );

                return;
            }


            /*
                کشور بازیکن دیگر
            */

            if (country.taken) {

                card.classList.add(
                    "country-taken"
                );

            }


            card.onclick = () => {

                if (country.taken) {

                    showMessage(
                        "این کشور قبلاً توسط بازیکن دیگری انتخاب شده است."
                    );

                    return;
                }


                selectCountry(
                    countryId
                );

            };

        });
}


/* =========================================
   انتخاب کشور
========================================= */

async function selectCountry(countryId) {

    if (!userId) {
        return;
    }


    /*
        اگر قبلاً انتخاب شده
    */

    if (
        player &&
        player.country &&
        player.country !== countryId
    ) {

        showMessage(
            "شما قبلاً یک کشور انتخاب کرده‌اید."
        );

        return;
    }


    showMessage(
        "در حال انتخاب کشور..."
    );


    try {

        const response =
            await fetch(
                `/api/select-country?user_id=${userId}&country=${countryId}`
            );


        const data =
            await response.json();


        /*
            کشور توسط شخص دیگری گرفته شده
        */

        if (
            response.status === 409 &&
            data.error === "country_taken"
        ) {

            showMessage(
                "این کشور قبلاً توسط بازیکن دیگری انتخاب شده است."
            );

            await loadCountries();

            return;
        }


        /*
            بازیکن قبلاً کشور دارد
        */

        if (
            response.status === 409 &&
            data.error === "already_has_country"
        ) {

            showMessage(
                "شما قبلاً کشور خود را انتخاب کرده‌اید."
            );

            return;
        }


        if (!response.ok) {

            throw new Error(
                "Country selection failed"
            );
        }


        /*
            موفقیت
        */

        player =
            data.player;


        updateSelectedCountryBadge(
            player.country
        );


        await loadCountries();


        /*
            ورود به بازی
        */

        setTimeout(() => {

            showGame();

        }, 500);


    } catch (error) {

        console.error(error);

        showMessage(
            "خطا در انتخاب کشور."
        );
    }
}


/* =========================================
   پرچم کشور انتخاب شده
========================================= */

function updateSelectedCountryBadge(
    countryId
) {

    const badge =
        document.getElementById(
            "selected-country-badge"
        );

    const flag =
        document.getElementById(
            "selected-country-flag"
        );

    const name =
        document.getElementById(
            "selected-country-name"
        );


    if (!badge) {
        return;
    }


    if (!countryId) {

        badge.classList.add(
            "hidden"
        );

        return;
    }


    badge.classList.remove(
        "hidden"
    );


    if (flag) {

        flag.textContent =
            COUNTRY_FLAGS[countryId] ||
            "🌍";
    }


    if (name) {

        name.textContent =
            COUNTRY_NAMES[countryId] ||
            countryId;
    }


    /*
        اطلاعات صفحه خانه
    */

    const homeFlag =
        document.getElementById(
            "home-country-flag"
        );

    const homeName =
        document.getElementById(
            "home-country-name"
        );


    if (homeFlag) {

        homeFlag.textContent =
            COUNTRY_FLAGS[countryId] ||
            "🌍";
    }


    if (homeName) {

        homeName.textContent =
            COUNTRY_NAMES[countryId] ||
            countryId;
    }
}


/* =========================================
   اطلاعات خانه
========================================= */

function updateHomeInfo() {

    if (!player) {
        return;
    }


    const money =
        document.getElementById(
            "money-value"
        );

    const army =
        document.getElementById(
            "army-value"
        );

    const year =
        document.getElementById(
            "year-value"
        );


    if (money) {
        money.textContent =
            player.money ?? 0;
    }

    if (army) {
        army.textContent =
            player.army ?? 0;
    }

    if (year) {
        year.textContent =
            player.year ?? 1939;
    }
}


/* =========================================
   پیام
========================================= */

function showMessage(message) {

    const element =
        document.getElementById(
            "country-message"
        );

    if (!element) {
        return;
    }


    element.textContent =
        message;


    clearTimeout(
        window.messageTimer
    );


    window.messageTimer =
        setTimeout(() => {

            element.textContent = "";

        }, 3500);
}


/* =========================================
   منوی پایین
========================================= */

function setupNavigation() {

    document
        .querySelectorAll(".nav-item")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const page =
                        button.dataset.page;

                    showPage(page);

                }
            );

        });
}


function showPage(pageName) {

    document
        .querySelectorAll(".page")
        .forEach(page => {

            page.style.display =
                "none";

        });


    const selectedPage =
        document.getElementById(
            pageName
        );


    if (selectedPage) {

        selectedPage.style.display =
            "block";
    }


    document
        .querySelectorAll(".nav-item")
        .forEach(button => {

            button.classList.remove(
                "active"
            );

            if (
                button.dataset.page ===
                pageName
            ) {

                button.classList.add(
                    "active"
                );

            }

        });


    /*
        وقتی وارد نقشه می‌شویم
    */

    if (pageName === "map") {

        setTimeout(() => {

            loadGlobe(
                "game-globe"
            );

        }, 50);

    }


    /*
        اخبار
    */

    if (pageName === "news") {

        loadNews();

    }
}


/* =========================================
   ساخت کره زمین
========================================= */

async function loadGlobe(
    containerId
) {

    const container =
        document.getElementById(
            containerId
        );

    if (!container) {
        return;
    }


    /*
        اگر قبلاً ساخته شده
    */

    container.innerHTML = "";


    const width =
        container.clientWidth || 500;

    const height =
        container.clientHeight || 500;


    const size =
        Math.min(
            width,
            height
        );


    /*
        SVG
    */

    globeSvg =
        d3.select(
            `#${containerId}`
        )
        .append("svg")
        .attr("width", size)
        .attr("height", size)
        .attr(
            "viewBox",
            `0 0 ${size} ${size}`
        );


    /*
        Projection
    */

    globeProjection =
        d3.geoOrthographic()
            .scale(size * 0.46)
            .translate(
                [size / 2, size / 2]
            )
            .clipAngle(90);


    globePath =
        d3.geoPath()
            .projection(
                globeProjection
            );


    /*
        گرفتن نقشه جهان
    */

    try {

        const response =
            await fetch(
                "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
            );


        const world =
            await response.json();


        worldFeatures =
            topojson.feature(
                world,
                world.objects.countries
            ).features;


        drawGlobe();

        setupGlobeControls(
            container
        );

        startGlobeRotation();


    } catch (error) {

        console.error(
            "WORLD MAP ERROR:",
            error
        );

        showMessage(
            "خطا در بارگذاری نقشه جهان."
        );
    }
}


/* =========================================
   رسم کره
========================================= */

function drawGlobe() {

    if (!globeSvg) {
        return;
    }


    globeSvg.selectAll("*")
        .remove();


    /*
        آب
    */

    globeSvg
        .append("circle")
        .attr(
            "cx",
            globeProjection.translate()[0]
        )
        .attr(
            "cy",
            globeProjection.translate()[1]
        )
        .attr(
            "r",
            globeProjection.scale()
        )
        .attr(
            "fill",
            "#101d24"
        );


    /*
        کشورها
    */

    globeSvg
        .selectAll(".country")
        .data(worldFeatures)
        .enter()
        .append("path")
        .attr(
            "class",
            "country"
        )
        .attr(
            "d",
            globePath
        )
        .attr(
            "fill",
            d => getCountryColor(d)
        )
        .attr(
            "stroke",
            d => getCountryStroke(d)
        )
        .attr(
            "stroke-width",
            d => getCountryStrokeWidth(d)
        )
        .style(
            "cursor",
            d => {

                const id =
                    getCountryGameId(d);

                return id ?
                    "pointer" :
                    "default";
            }
        )
        .on(
            "click",
            function(event, d) {

                const id =
                    getCountryGameId(d);

                if (!id) {
                    return;
                }

                handleGlobeCountryClick(
                    id
                );

            }
        );


    /*
        خطوط طول و عرض
        بسیار ظریف
    */

    const graticule =
        d3.geoGraticule();


    globeSvg
        .append("path")
        .datum(graticule())
        .attr(
            "class",
            "graticule"
        )
        .attr(
            "d",
            globePath
        )
        .attr(
            "fill",
            "none"
        )
        .attr(
            "stroke",
            "rgba(255,255,255,0.035)"
        )
        .attr(
            "stroke-width",
            0.5
        )
        .style(
            "pointer-events",
            "none"
        );


    /*
        مرز ظریف فقط کشورهای داخل بازی
    */

    countries.forEach(
        country => {

            const feature =
                worldFeatures.find(
                    f =>
                        Number(f.id) ===
                        COUNTRY_IDS[country.id]
                );

            if (!feature) {
                return;
            }

        }
    );
}


/* =========================================
   رنگ کشورها
========================================= */

function getCountryColor(feature) {

    const gameId =
        getCountryGameId(feature);


    /*
        کشور خارج از بازی
        فقط خشکی طبیعی
    */

    if (!gameId) {

        return "#202629";
    }


    /*
        کشور خود بازیکن
        نارنجی
    */

    if (
        player &&
        player.country === gameId
    ) {

        return "#d8781d";
    }


    /*
        کشور گرفته شده توسط بازیکن دیگر
        آبی
    */

    const country =
        countries.find(
            c =>
                c.id === gameId
        );


    if (
        country &&
        country.taken
    ) {

        return "#245a88";
    }


    /*
        کشور آزاد
        مشکی
    */

    return "#080b0d";
}


/* =========================================
   مرز کشور
========================================= */

function getCountryStroke(feature) {

    const gameId =
        getCountryGameId(feature);


    /*
        کشورهای خارج از بازی
        بدون مرز
    */

    if (!gameId) {

        return "none";
    }


    return "rgba(255,255,255,0.22)";
}


function getCountryStrokeWidth(feature) {

    const gameId =
        getCountryGameId(feature);


    if (!gameId) {
        return 0;
    }


    return 0.7;
}


/* =========================================
   تشخیص کشور بازی
========================================= */

function getCountryGameId(feature) {

    const numericId =
        Number(feature.id);


    for (
        const [gameId, numericIdValue]
        of Object.entries(COUNTRY_IDS)
    ) {

        if (
            numericId ===
            numericIdValue
        ) {

            return gameId;
        }

    }


    return null;
}


/* =========================================
   بروزرسانی رنگ‌ها
========================================= */

function updateGlobeColors() {

    if (!globeSvg) {
        return;
    }


    globeSvg
        .selectAll(".country")
        .attr(
            "fill",
            d =>
                getCountryColor(d)
        )
        .attr(
            "stroke",
            d =>
                getCountryStroke(d)
        )
        .attr(
            "stroke-width",
            d =>
                getCountryStrokeWidth(d)
        );
}


/* =========================================
   کلیک روی کشور کره
========================================= */

function handleGlobeCountryClick(
    countryId
) {

    /*
        اگر کشور خودمان است
    */

    if (
        player &&
        player.country === countryId
    ) {

        showMessage(
            `کشور شما: ${COUNTRY_NAMES[countryId]}`
        );

        return;
    }


    /*
        پیدا کردن کشور
    */

    const country =
        countries.find(
            c =>
                c.id === countryId
        );


    /*
        اگر قبلاً گرفته شده
    */

    if (
        country &&
        country.taken
    ) {

        showMessage(
            "این کشور قبلاً توسط بازیکن دیگری انتخاب شده است."
        );

        return;
    }


    /*
        انتخاب
    */

    selectCountry(
        countryId
    );
}


/* =========================================
   کنترل کره
========================================= */

function setupGlobeControls(
    container
) {

    container.onmousedown =
        event => {

            isDragging = true;

            autoRotate = false;

            startMouse = [
                event.clientX,
                event.clientY
            ];

            startRotation =
                [...rotation];

        };


    window.onmousemove =
        event => {

            if (!isDragging) {
                return;
            }


            const dx =
                event.clientX -
                startMouse[0];

            const dy =
                event.clientY -
                startMouse[1];


            rotation = [

                startRotation[0] +
                    dx * 0.35,

                startRotation[1] -
                    dy * 0.25

            ];


            updateProjection();

        };


    window.onmouseup =
        () => {

            isDragging = false;

        };


    /*
        موبایل
    */

    container.ontouchstart =
        event => {

            if (
                event.touches.length !== 1
            ) {
                return;
            }


            isDragging = true;

            autoRotate = false;

            startMouse = [

                event.touches[0].clientX,

                event.touches[0].clientY

            ];

            startRotation =
                [...rotation];

        };


    container.ontouchmove =
        event => {

            if (
                !isDragging ||
                event.touches.length !== 1
            ) {
                return;
            }


            event.preventDefault();


            const dx =
                event.touches[0].clientX -
                startMouse[0];

            const dy =
                event.touches[0].clientY -
                startMouse[1];


            rotation = [

                startRotation[0] +
                    dx * 0.35,

                startRotation[1] -
                    dy * 0.25

            ];


            updateProjection();

        };


    container.ontouchend =
        () => {

            isDragging = false;

        };


    /*
        Zoom
    */

    container.onwheel =
        event => {

            event.preventDefault();


            scale +=
                event.deltaY > 0 ?
                -0.08 :
                0.08;


            scale =
                Math.max(
                    0.75,
                    Math.min(
                        scale,
                        1.7
                    )
                );


            updateProjection();

        };

}


/* =========================================
   بروزرسانی Projection
========================================= */

function updateProjection() {

    if (!globeProjection) {
        return;
    }


    globeProjection
        .rotate(rotation)
        .scale(
            Math.min(
                window.innerWidth,
                window.innerHeight
            ) *
            0.46 *
            scale
        );


    drawGlobe();

}


/* =========================================
   چرخش خودکار
========================================= */

function startGlobeRotation() {

    function rotate() {

        if (
            autoRotate &&
            globeProjection
        ) {

            rotation[0] += 0.08;

            updateProjection();

        }


        requestAnimationFrame(
            rotate
        );
    }


    rotate();
}


/* =========================================
   اخبار
========================================= */

async function loadNews() {

    const list =
        document.getElementById(
            "news-list"
        );


    if (!list) {
        return;
    }


    try {

        const response =
            await fetch("/api/news");


        if (!response.ok) {
            throw new Error(
                "News API unavailable"
            );
        }


        const news =
            await response.json();


        if (
            !news ||
            news.length === 0
        ) {

            list.innerHTML =
                `<div class="news-empty">
                    هنوز خبری ثبت نشده است.
                </div>`;

            return;
        }


        list.innerHTML =
            news.map(item => `
                <div class="news-item">
                    <h3>${item.title}</h3>
                    <p>${item.text}</p>
                </div>
            `).join("");


    } catch (error) {

        console.log(
            "News endpoint not ready."
        );

        list.innerHTML =
            `<div class="news-empty">
                هنوز خبری ثبت نشده است.
            </div>`;
    }
}
