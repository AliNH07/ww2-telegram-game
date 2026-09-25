// ---------------------------------------
// اطلاعات بازیکن
// ---------------------------------------

let player = {
    country: null,
    money: 1000,
    army: 500,
    year: 1939
};


// ---------------------------------------
// Telegram WebApp
// ---------------------------------------

const tg = window.Telegram
    ? window.Telegram.WebApp
    : null;

let userId = null;

if (tg) {

    tg.ready();
    tg.expand();

    if (
        tg.initDataUnsafe &&
        tg.initDataUnsafe.user
    ) {
        userId = tg.initDataUnsafe.user.id;
    }
}


// ---------------------------------------
// تغییر صفحه
// ---------------------------------------

function showPage(pageName) {

    const pages = document.querySelectorAll(".page");

    pages.forEach(page => {
        page.style.display = "none";
    });

    const target = document.getElementById(pageName);

    if (target) {
        target.style.display = "block";
    }
}


// ---------------------------------------
// دریافت اطلاعات بازیکن
// ---------------------------------------

async function loadPlayer() {

    if (!userId) {
        console.log("Telegram user ID پیدا نشد.");
        return;
    }

    try {

        const response = await fetch(
            `/api/player?user_id=${userId}`
        );

        const data = await response.json();

        player = data;

        updatePlayerUI();

        // اگر کشور انتخاب نشده
        if (!player.country) {

            showCountrySelection();

        } else {

            showGame();

        }

    } catch (error) {

        console.error(
            "خطا در دریافت بازیکن:",
            error
        );
    }
}


// ---------------------------------------
// نمایش اطلاعات بازیکن
// ---------------------------------------

function updatePlayerUI() {

    const moneyElements =
        document.querySelectorAll(
            "[data-money]"
        );

    moneyElements.forEach(element => {

        element.textContent =
            player.money;
    });


    const armyElements =
        document.querySelectorAll(
            "[data-army]"
        );

    armyElements.forEach(element => {

        element.textContent =
            player.army;
    });
}


// ---------------------------------------
// نمایش صفحه انتخاب کشور
// ---------------------------------------

function showCountrySelection() {

    console.log(
        "بازیکن هنوز کشور انتخاب نکرده است."
    );

    // بخش انتخاب کشور را نشان بده
    const countryPage =
        document.getElementById("country");

    if (countryPage) {
        countryPage.style.display = "block";
    }

    // بقیه صفحات را مخفی کن
    const pages =
        document.querySelectorAll(".page");

    pages.forEach(page => {

        if (page.id !== "country") {
            page.style.display = "none";
        }

    });

    // منوی پایین را مخفی کن
    const nav =
        document.querySelector(".bottom-nav");

    if (nav) {
        nav.style.display = "none";
    }

    // دریافت وضعیت کشورها
    loadCountries();
}


// ---------------------------------------
// نمایش بازی بعد از انتخاب کشور
// ---------------------------------------

function showGame() {

    console.log(
        "کشور بازیکن:",
        player.country
    );

    const nav =
        document.querySelector(".bottom-nav");

    if (nav) {
        nav.style.display = "flex";
    }

    showPage("home");
}


// ---------------------------------------
// دریافت کشورهای بازی
// ---------------------------------------

async function loadCountries() {

    try {

        const response =
            await fetch("/api/countries");

        const countries =
            await response.json();

        updateCountryMap(countries);

    } catch (error) {

        console.error(
            "خطا در دریافت کشورها:",
            error
        );
    }
}


// ---------------------------------------
// بروزرسانی نقشه کشورها
// ---------------------------------------

function updateCountryMap(countries) {

    /*
        این قسمت کشورها را پیدا می‌کند.

        برای اینکه با ساختار فعلی نقشه
        سازگار باشد، چند روش مختلف
        برای پیدا کردن country استفاده می‌کنیم.
    */

    Object.keys(countries).forEach(countryId => {

        const country =
            countries[countryId];

        const elements =
            document.querySelectorAll(
                `[data-country="${countryId}"]`
            );

        elements.forEach(element => {

            // پاک کردن وضعیت‌های قبلی
            element.classList.remove(
                "country-taken"
            );

            element.classList.remove(
                "country-owned"
            );

            // -----------------------------------
            // کشور گرفته شده
            // -----------------------------------

            if (country.taken) {

                element.classList.add(
                    "country-taken"
                );

                element.style.opacity = "0.25";
                element.style.filter =
                    "grayscale(100%)";

                element.style.cursor =
                    "not-allowed";

                element.onclick = function () {

                    showTakenCountryMessage(
                        country.name
                    );

                };

            }

            // -----------------------------------
            // کشور خود بازیکن
            // -----------------------------------

            else if (
                player.country === countryId
            ) {

                element.classList.add(
                    "country-owned"
                );

                element.style.opacity = "1";
                element.style.filter =
                    "none";

                element.style.cursor =
                    "default";

                element.onclick = null;

            }

            // -----------------------------------
            // کشور آزاد
            // -----------------------------------

            else {

                element.style.opacity = "1";

                element.style.filter =
                    "none";

                element.style.cursor =
                    "pointer";

                element.onclick = function () {

                    selectCountry(
                        countryId
                    );

                };

            }

        });

    });


    /*
        اگر نقشه از دکمه یا کارت به جای
        data-country استفاده کند، این قسمت
        کارت‌های کشور را هم بروزرسانی می‌کند.
    */

    document
        .querySelectorAll("[data-country-card]")
        .forEach(card => {

            const countryId =
                card.dataset.countryCard;

            const country =
                countries[countryId];

            if (!country) {
                return;
            }

            if (country.taken) {

                card.classList.add(
                    "country-taken"
                );

                card.style.opacity = "0.35";

                card.style.filter =
                    "grayscale(100%)";

                card.style.cursor =
                    "not-allowed";

                card.onclick = function () {

                    showTakenCountryMessage(
                        country.name
                    );

                };

            } else {

                card.classList.remove(
                    "country-taken"
                );

                card.style.opacity = "1";

                card.style.filter =
                    "none";

                card.style.cursor =
                    "pointer";

                card.onclick = function () {

                    selectCountry(
                        countryId
                    );

                };

            }

        });
}


// ---------------------------------------
// پیام کشور گرفته شده
// ---------------------------------------

function showTakenCountryMessage(
    countryName
) {

    const message =
        `${countryName}\n\n` +
        `🔒 این کشور قبلاً توسط ` +
        `بازیکن دیگری انتخاب شده است.`;

    if (tg && tg.showAlert) {

        tg.showAlert(message);

    } else {

        alert(message);

    }
}


// ---------------------------------------
// انتخاب کشور
// ---------------------------------------

async function selectCountry(countryId) {

    if (!userId) {

        alert(
            "شناسه کاربر تلگرام پیدا نشد."
        );

        return;
    }


    // اگر خود بازیکن قبلاً کشور دارد
    if (player.country) {

        showTakenCountryMessage(
            "شما قبلاً یک کشور انتخاب کرده‌اید."
        );

        return;
    }


    try {

        const response =
            await fetch(
                `/api/select-country?user_id=${userId}&country=${countryId}`
            );

        const data =
            await response.json();


        // -----------------------------------
        // کشور قبلاً گرفته شده
        // -----------------------------------

        if (
            response.status === 409 &&
            data.error === "country_taken"
        ) {

            if (tg && tg.showAlert) {

                tg.showAlert(
                    "🔒 این کشور قبلاً توسط بازیکن دیگری انتخاب شده است."
                );

            } else {

                alert(
                    "🔒 این کشور قبلاً توسط بازیکن دیگری انتخاب شده است."
                );

            }

            // نقشه را دوباره از سرور بگیر
            await loadCountries();

            return;
        }


        // -----------------------------------
        // بازیکن قبلاً کشور دارد
        // -----------------------------------

        if (
            response.status === 409 &&
            data.error === "already_has_country"
        ) {

            player =
                data.player;

            showGame();

            return;
        }


        // -----------------------------------
        // خطای عمومی
        // -----------------------------------

        if (!response.ok) {

            alert(
                data.message ||
                data.error ||
                "خطایی رخ داد."
            );

            return;
        }


        // -----------------------------------
        // انتخاب موفق
        // -----------------------------------

        if (data.success) {

            player =
                data.player;

            console.log(
                "کشور با موفقیت انتخاب شد:",
                player.country
            );


            // دوباره کشورها را از سرور بگیر
            await loadCountries();


            // ورود به بازی
            showGame();


            if (tg && tg.showPopup) {

                tg.showPopup({
                    title: "انتخاب کشور",
                    message:
                        "کشور شما با موفقیت انتخاب شد.",
                    buttons: [
                        {
                            type: "ok"
                        }
                    ]
                });

            }

        }

    } catch (error) {

        console.error(
            "خطا در انتخاب کشور:",
            error
        );

        alert(
            "ارتباط با سرور برقرار نشد."
        );
    }
}


// ---------------------------------------
// دریافت نام کشور
// ---------------------------------------

async function loadCountryName(countryId) {

    try {

        const response =
            await fetch("/api/countries");

        const countries =
            await response.json();

        if (
            countries[countryId]
        ) {

            return countries[countryId].name;

        }

    } catch (error) {

        console.error(error);

    }

    return countryId;
}


// ---------------------------------------
// اخبار
// ---------------------------------------

async function loadNews() {

    try {

        const response =
            await fetch("/api/news");

        const news =
            await response.json();

        console.log(
            "News:",
            news
        );

    } catch (error) {

        console.error(
            "خطا در دریافت اخبار:",
            error
        );
    }
}


// ---------------------------------------
// شروع برنامه
// ---------------------------------------

document.addEventListener(
    "DOMContentLoaded",
    function () {

        loadPlayer();

    }
);
