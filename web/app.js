let player = {
    country: null,
    money: 1000,
    army: 500,
    year: 1939
};


// ---------------------------------------
// Telegram
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

    const pages =
        document.querySelectorAll(".page");

    pages.forEach(page => {

        page.classList.remove("active");

    });


    const selected =
        document.getElementById(pageName);

    if (selected) {

        selected.classList.add("active");

    }


    if (pageName === "news") {

        loadNews();

    }


    if (pageName === "country") {

        loadCountries();

    }

}


// ---------------------------------------
// دریافت اطلاعات بازیکن
// ---------------------------------------

async function loadPlayer() {

    if (!userId) {

        updatePlayerUI();

        return;

    }


    try {

        const response =
            await fetch(
                `/api/player?user_id=${userId}`
            );

        player =
            await response.json();

        updatePlayerUI();

    }

    catch (error) {

        console.error(
            "Player error:",
            error
        );

    }

}


// ---------------------------------------
// نمایش اطلاعات بازیکن
// ---------------------------------------

function updatePlayerUI() {

    const money =
        document.getElementById("money");

    const army =
        document.getElementById("army");

    const year =
        document.getElementById("year");


    if (money) {

        money.textContent =
            player.money ?? 1000;

    }


    if (army) {

        army.textContent =
            player.army ?? 500;

    }


    if (year) {

        year.textContent =
            player.year ?? 1939;

    }


    if (player.country) {

        loadCountryName(
            player.country
        );

    }

}


// ---------------------------------------
// نمایش اسم کشور
// ---------------------------------------

async function loadCountryName(id) {

    try {

        const response =
            await fetch("/api/countries");

        const countries =
            await response.json();


        if (countries[id]) {

            const countryName =
                document.getElementById(
                    "countryName"
                );


            if (countryName) {

                countryName.textContent =
                    countries[id].name;

            }

        }

    }

    catch (error) {

        console.error(
            "Country name error:",
            error
        );

    }

}


// ---------------------------------------
// دریافت کشورها
// ---------------------------------------

async function loadCountries() {

    const container =
        document.getElementById(
            "countriesList"
        );


    if (!container) {

        return;

    }


    container.innerHTML =
        "در حال دریافت کشورها...";


    try {

        const response =
            await fetch(
                "/api/countries"
            );

        const countries =
            await response.json();


        container.innerHTML = "";


        Object.entries(countries)
            .forEach(
                ([id, country]) => {

                    const div =
                        document.createElement(
                            "div"
                        );


                    div.className =
                        "country-option";


                    div.innerHTML = `

                        <h3>
                            ${country.name}
                        </h3>

                        <p>
                            💰 اقتصاد:
                            ${country.economy}
                        </p>

                        <p>
                            ⚔️ ارتش:
                            ${country.army}
                        </p>

                        <p>
                            👥 جمعیت:
                            ${country.population.toLocaleString()}
                        </p>

                    `;


                    div.onclick = () => {

                        selectCountry(id);

                    };


                    container.appendChild(div);

                }
            );

    }

    catch (error) {

        console.error(
            "Countries error:",
            error
        );

        container.innerHTML =
            "خطا در دریافت کشورها.";

    }

}


// ---------------------------------------
// انتخاب کشور
// ---------------------------------------

async function selectCountry(countryId) {

    if (!userId) {

        alert(
            "این بازی باید از داخل تلگرام اجرا شود."
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


        if (data.success) {

            player =
                data.player;


            updatePlayerUI();


            showPage("home");

        }

    }

    catch (error) {

        console.error(
            "Select country error:",
            error
        );

        alert(
            "خطا در انتخاب کشور."
        );

    }

}


// ---------------------------------------
// دریافت اخبار
// ---------------------------------------

async function loadNews() {

    const container =
        document.getElementById(
            "newsList"
        );


    if (!container) {

        return;

    }


    container.innerHTML =
        "در حال دریافت اخبار...";


    try {

        const response =
            await fetch(
                "/api/news"
            );

        const news =
            await response.json();


        container.innerHTML = "";


        news.forEach(item => {

            const div =
                document.createElement(
                    "div"
                );


            div.className =
                "news-item";


            div.innerHTML = `

                <div class="news-country">
                    ${item.country}
                </div>

                <div class="news-title">
                    ${item.title}
                </div>

                <div class="news-text">
                    ${item.text}
                </div>

            `;


            container.appendChild(div);

        });

    }

    catch (error) {

        console.error(
            "News error:",
            error
        );

        container.innerHTML =
            "خطا در دریافت اخبار.";

    }

}


// ---------------------------------------
// شروع بازی
// ---------------------------------------

loadPlayer();

showPage("home");