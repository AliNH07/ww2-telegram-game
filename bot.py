import os
import asyncio
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from aiohttp import web
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import (
    Message,
    WebAppInfo,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    CallbackQuery,
)

from config import BOT_TOKEN


# =========================================================
# CONFIG
# =========================================================

BASE_DIR = Path(__file__).resolve().parent

PORT = int(os.environ.get("PORT", "10000"))
HOST = "0.0.0.0"

WEB_APP_URL = os.environ.get(
    "WEB_APP_URL",
    "https://ww2-telegram-game.onrender.com",
)

ADMIN_ID = 8900923747

DAILY_SECONDS = 24 * 60 * 60
WAR_PREPARATION_SECONDS = 24 * 60 * 60
SITE_TRAVEL_SECONDS = 2 * 60 * 60

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)

logger = logging.getLogger("ww2-game")


# =========================================================
# TELEGRAM
# =========================================================

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


# =========================================================
# GLOBAL GAME STORAGE
# =========================================================

players: dict[str, dict[str, Any]] = {}
country_owner: dict[str, str] = {}

wars: dict[str, dict[str, Any]] = {}
treaties: dict[str, dict[str, Any]] = {}

statements: list[dict[str, Any]] = []
statement_comments: list[dict[str, Any]] = []

unions: dict[str, dict[str, Any]] = {}
union_invites: list[dict[str, Any]] = []
union_messages: dict[str, list[dict[str, Any]]] = {}

private_messages: list[dict[str, Any]] = []

market_orders: dict[str, dict[str, Any]] = {}

notifications: list[dict[str, Any]] = []

strategic_sites: dict[str, dict[str, Any]] = {}

news_items: list[dict[str, Any]] = []

pending_war_notifications: dict[str, set[str]] = {}


# =========================================================
# COUNTRY DATA
# =========================================================

COUNTRIES = {
    "germany": {
        "name": "آلمان",
        "flag": "🇩🇪",
        "economy": 850,
        "army": 900,
        "population": 80_000_000,
        "income": 120_000,
        "production": {
            "food": 4_500,
            "steel": 5_500,
            "uranium": 700,
            "oil": 1_500,
        },
    },
    "britain": {
        "name": "بریتانیا",
        "flag": "🇬🇧",
        "economy": 800,
        "army": 700,
        "population": 47_000_000,
        "income": 115_000,
        "production": {
            "food": 5_000,
            "steel": 4_200,
            "uranium": 600,
            "oil": 1_000,
        },
    },
    "ussr": {
        "name": "شوروی",
        "flag": "☭",
        "economy": 750,
        "army": 950,
        "population": 170_000_000,
        "income": 105_000,
        "production": {
            "food": 6_000,
            "steel": 6_000,
            "uranium": 800,
            "oil": 2_500,
        },
    },
    "usa": {
        "name": "آمریکا",
        "flag": "🇺🇸",
        "economy": 950,
        "army": 750,
        "population": 132_000_000,
        "income": 150_000,
        "production": {
            "food": 7_000,
            "steel": 7_000,
            "uranium": 900,
            "oil": 4_000,
        },
    },
    "france": {
        "name": "فرانسه",
        "flag": "🇫🇷",
        "economy": 720,
        "army": 680,
        "population": 42_000_000,
        "income": 100_000,
        "production": {
            "food": 5_000,
            "steel": 3_800,
            "uranium": 500,
            "oil": 900,
        },
    },
    "italy": {
        "name": "ایتالیا",
        "flag": "🇮🇹",
        "economy": 650,
        "army": 620,
        "population": 44_000_000,
        "income": 90_000,
        "production": {
            "food": 4_200,
            "steel": 3_200,
            "uranium": 450,
            "oil": 700,
        },
    },
    "china": {
        "name": "چین",
        "flag": "🇨🇳",
        "economy": 620,
        "army": 700,
        "population": 520_000_000,
        "income": 80_000,
        "production": {
            "food": 7_500,
            "steel": 2_800,
            "uranium": 350,
            "oil": 800,
        },
    },
    "japan": {
        "name": "ژاپن",
        "flag": "🇯🇵",
        "economy": 730,
        "army": 760,
        "population": 71_000_000,
        "income": 105_000,
        "production": {
            "food": 3_800,
            "steel": 4_000,
            "uranium": 500,
            "oil": 500,
        },
    },
}


# =========================================================
# RESOURCES
# =========================================================

RESOURCE_NAMES = {
    "food": "غذا",
    "steel": "فولاد",
    "uranium": "اورانیوم",
    "oil": "نفت",
}


# =========================================================
# ARMY
# =========================================================

ARMY_UNITS = {
    "infantry": {
        "name": "گردان پیاده‌نظام",
        "group": "land",
        "attack": 20,
        "defense": 10,
        "cost": {
            "money": 8_000,
            "food": 100,
            "steel": 50,
            "oil": 0,
            "uranium": 0,
        },
        "upkeep": {
            "food": 4,
        },
        "factory": "barracks",
    },

    "tank": {
        "name": "گردان تانک",
        "group": "land",
        "attack": 50,
        "defense": 25,
        "cost": {
            "money": 35_000,
            "food": 150,
            "steel": 450,
            "oil": 120,
            "uranium": 0,
        },
        "upkeep": {
            "food": 6,
            "oil": 3,
        },
        "factory": "tank_factory",
    },

    "fighter": {
        "name": "اسکادران جنگنده",
        "group": "air",
        "attack": 60,
        "defense": 30,
        "cost": {
            "money": 45_000,
            "food": 100,
            "steel": 250,
            "oil": 300,
            "uranium": 0,
        },
        "upkeep": {
            "food": 4,
            "oil": 8,
        },
        "factory": "airbase",
    },

    "bomber": {
        "name": "اسکادران بمب‌افکن",
        "group": "air",
        "attack": 75,
        "defense": 20,
        "cost": {
            "money": 60_000,
            "food": 120,
            "steel": 350,
            "oil": 400,
            "uranium": 0,
        },
        "upkeep": {
            "food": 5,
            "oil": 10,
        },
        "factory": "airbase",
    },

    "warship": {
        "name": "ناو جنگی",
        "group": "naval",
        "attack": 50,
        "defense": 60,
        "cost": {
            "money": 80_000,
            "food": 200,
            "steel": 900,
            "oil": 350,
            "uranium": 0,
        },
        "upkeep": {
            "food": 8,
            "oil": 8,
        },
        "factory": "shipyard",
    },

    "submarine": {
        "name": "زیردریایی",
        "group": "naval",
        "attack": 45,
        "defense": 25,
        "cost": {
            "money": 65_000,
            "food": 120,
            "steel": 650,
            "oil": 250,
            "uranium": 0,
        },
        "upkeep": {
            "food": 5,
            "oil": 6,
        },
        "factory": "shipyard",
    },
}


# =========================================================
# INFRASTRUCTURE
# =========================================================

INFRASTRUCTURE = {
    "power": {
        "name": "نیروگاه",
        "base_cost": 100_000,
        "cost_growth": 1.35,
        "max_level": 10,
    },

    "manpower": {
        "name": "مرکز نیروی انسانی",
        "base_cost": 120_000,
        "cost_growth": 1.40,
        "max_level": 10,
    },

    "food": {
        "name": "مزرعه و صنایع غذایی",
        "base_cost": 80_000,
        "cost_growth": 1.30,
        "max_level": 10,
    },

    "barracks": {
        "name": "پادگان",
        "base_cost": 150_000,
        "cost_growth": 1.40,
        "max_level": 10,
    },

    "tank_factory": {
        "name": "کارخانه تانک",
        "base_cost": 450_000,
        "cost_growth": 1.55,
        "max_level": 8,
    },

    "airbase": {
        "name": "پایگاه هوایی",
        "base_cost": 400_000,
        "cost_growth": 1.50,
        "max_level": 8,
    },

    "shipyard": {
        "name": "کارخانه کشتی‌سازی",
        "base_cost": 500_000,
        "cost_growth": 1.55,
        "max_level": 8,
    },
}


# =========================================================
# STRATEGIC SITES
# =========================================================

SITE_DATA = [
    {
        "id": "gibraltar",
        "name": "تنگه جبل‌الطارق",
        "type": "strait",
        "lat": 35.9,
        "lon": -5.6,
        "resource": None,
    },
    {
        "id": "bosporus",
        "name": "تنگه بسفر",
        "type": "strait",
        "lat": 41.1,
        "lon": 29.0,
        "resource": None,
    },
    {
        "id": "hormuz",
        "name": "تنگه هرمز",
        "type": "strait",
        "lat": 26.6,
        "lon": 56.3,
        "resource": "oil",
    },
    {
        "id": "bab_el_mandeb",
        "name": "باب‌المندب",
        "type": "strait",
        "lat": 12.6,
        "lon": 43.3,
        "resource": "oil",
    },
    {
        "id": "suez",
        "name": "کانال سوئز",
        "type": "canal",
        "lat": 30.6,
        "lon": 32.3,
        "resource": None,
    },
    {
        "id": "dover",
        "name": "تنگه دوور",
        "type": "strait",
        "lat": 50.9,
        "lon": 1.4,
        "resource": None,
    },
    {
        "id": "panama",
        "name": "کانال پاناما",
        "type": "canal",
        "lat": 9.1,
        "lon": -79.6,
        "resource": None,
    },
    {
        "id": "malacca",
        "name": "تنگه مالاکا",
        "type": "strait",
        "lat": 1.3,
        "lon": 103.8,
        "resource": "oil",
    },
    {
        "id": "taiwan",
        "name": "تنگه تایوان",
        "type": "strait",
        "lat": 24.0,
        "lon": 121.0,
        "resource": None,
    },
    {
        "id": "korea",
        "name": "تنگه کره",
        "type": "strait",
        "lat": 34.0,
        "lon": 129.9,
        "resource": None,
    },

    {
        "id": "north_sea_oil",
        "name": "میدان نفتی دریای شمال",
        "type": "oil_platform",
        "lat": 57.0,
        "lon": 2.0,
        "resource": "oil",
    },
    {
        "id": "caspian_oil",
        "name": "میدان نفتی خزر",
        "type": "oil_field",
        "lat": 40.0,
        "lon": 50.0,
        "resource": "oil",
    },
    {
        "id": "caucasus_oil",
        "name": "میدان نفتی قفقاز",
        "type": "oil_field",
        "lat": 43.0,
        "lon": 45.0,
        "resource": "oil",
    },
    {
        "id": "urals_steel",
        "name": "معادن فولاد اورال",
        "type": "mine",
        "lat": 57.0,
        "lon": 60.0,
        "resource": "steel",
    },
    {
        "id": "central_asia_uranium",
        "name": "معادن اورانیوم آسیای مرکزی",
        "type": "mine",
        "lat": 45.0,
        "lon": 67.0,
        "resource": "uranium",
    },
]


def initialize_sites():
    for site in SITE_DATA:
        strategic_sites[site["id"]] = {
            **site,
            "owner": None,
            "pending": None,
        }


initialize_sites()


# =========================================================
# HELPERS
# =========================================================

def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None):
    if not dt:
        return None

    return dt.isoformat()


def parse_dt(value):
    if not value:
        return None

    try:
        result = datetime.fromisoformat(
            value.replace("Z", "+00:00")
        )

        if result.tzinfo is None:
            result = result.replace(
                tzinfo=timezone.utc
            )

        return result

    except Exception:
        return None


def json_response(data, status=200):
    return web.json_response(
        data,
        status=status,
        dumps=lambda x: __import__("json").dumps(
            x,
            ensure_ascii=False,
        ),
    )


def get_user_id(request):
    user_id = (
        request.query.get("user_id")
        or request.headers.get("X-Telegram-User-ID")
    )

    if not user_id:
        return None

    return str(user_id)


def get_player(user_id):
    if not user_id:
        return None

    return players.get(str(user_id))


def get_country_player(country):
    user_id = country_owner.get(country)

    if not user_id:
        return None

    return players.get(user_id)


def country_name(country):
    data = COUNTRIES.get(country)

    if not data:
        return country

    return data["name"]


def country_flag(country):
    data = COUNTRIES.get(country)

    if not data:
        return ""

    return data["flag"]


def make_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


# =========================================================
# PLAYER CREATION
# =========================================================

def create_player(user_id, country):
    base = COUNTRIES[country]

    player = {
        "user_id": str(user_id),
        "country": country,

        "money": 1_000_000,

        "resources": {
            "food": 150_000,
            "steel": 150_000,
            "uranium": 150_000,
            "oil": 150_000,
        },

        "population": base["population"],
        "manpower": 500_000,

        "army": {
            "infantry": 50,
            "tank": 10,
            "fighter": 5,
            "bomber": 2,
            "warship": 3,
            "submarine": 2,
        },

        "infrastructure": {
            "power": 1,
            "manpower": 1,
            "food": 1,
            "barracks": 1,
            "tank_factory": 0,
            "airbase": 0,
            "shipyard": 0,
        },

        "economy": base["economy"],
        "development": 1,

        "occupied_territories": [],

        "created_at": iso(now()),
        "last_tick": iso(now()),

        "statement_day": now().date().isoformat(),
        "statement_count": 0,
        "last_statement_at": None,

        "notifications": [],

        "union_id": None,

        "eliminated": False,
    }

    players[str(user_id)] = player
    country_owner[country] = str(user_id)

    return player


# =========================================================
# ECONOMY TICK
# =========================================================

def update_player_economy(player):
    if not player:
        return

    if player.get("eliminated"):
        return

    last_tick = parse_dt(
        player.get("last_tick")
    )

    current = now()

    if not last_tick:
        player["last_tick"] = iso(current)
        return

    elapsed = (
        current - last_tick
    ).total_seconds()

    if elapsed < 1:
        return

    days = elapsed / DAILY_SECONDS

    country = player["country"]
    base = COUNTRIES.get(country, {})

    infra = player["infrastructure"]

    income = base.get(
        "income",
        50_000,
    )

    income *= (
        1
        + max(
            0,
            player.get("development", 1) - 1,
        )
        * 0.05
    )

    income *= days

    player["money"] += int(income)

    production = base.get(
        "production",
        {},
    )

    food_bonus = 1 + (
        infra.get("food", 1) - 1
    ) * 0.15

    for resource, amount in production.items():

        multiplier = 1

        if resource == "food":
            multiplier = food_bonus

        if resource == "oil":
            multiplier += (
                count_resource_sites(
                    country,
                    "oil",
                )
                * 0.25
            )

        if resource == "steel":
            multiplier += (
                count_resource_sites(
                    country,
                    "steel",
                )
                * 0.20
            )

        if resource == "uranium":
            multiplier += (
                count_resource_sites(
                    country,
                    "uranium",
                )
                * 0.20
            )

        generated = (
            amount
            * multiplier
            * days
        )

        player["resources"][resource] = (
            player["resources"].get(resource, 0)
            + int(generated)
        )

    # مصرف روزانه ارتش
    upkeep_days = days

    for unit_id, quantity in player["army"].items():

        unit = ARMY_UNITS.get(unit_id)

        if not unit:
            continue

        for resource, cost in unit["upkeep"].items():

            consumption = (
                cost
                * quantity
                * upkeep_days
            )

            player["resources"][resource] = max(
                0,
                player["resources"].get(resource, 0)
                - int(consumption),
            )

    player["last_tick"] = iso(current)


def update_all_players():
    for player in players.values():
        update_player_economy(player)


# =========================================================
# RESOURCE SITES
# =========================================================

def count_resource_sites(country, resource):
    total = 0

    for site in strategic_sites.values():
        if (
            site.get("owner") == country
            and site.get("resource") == resource
        ):
            total += 1

    return total


# =========================================================
# NEWS
# =========================================================

def add_news(
    title,
    description,
    category="general",
    country=None,
):
    item = {
        "id": make_id("news"),
        "title": title,
        "description": description,
        "category": category,
        "country": country,
        "created_at": iso(now()),
    }

    news_items.insert(0, item)

    if len(news_items) > 300:
        del news_items[300:]

    return item


# =========================================================
# NOTIFICATIONS
# =========================================================

def add_notification(
    user_id,
    title,
    message,
    category="general",
):
    item = {
        "id": make_id("notification"),
        "title": title,
        "message": message,
        "category": category,
        "created_at": iso(now()),
        "read": False,
    }

    if user_id in players:
        players[user_id]["notifications"].insert(
            0,
            item,
        )

        players[user_id]["notifications"] = (
            players[user_id]["notifications"][:100]
        )

    notifications.append(
        {
            **item,
            "user_id": user_id,
        }
    )

    return item


async def telegram_notify(
    user_id,
    text,
):
    try:
        await bot.send_message(
            int(user_id),
            text,
            parse_mode="HTML",
        )
    except Exception as exc:
        logger.warning(
            "Telegram notification failed for %s: %s",
            user_id,
            exc,
        )


async def broadcast_telegram(text):
    tasks = []

    for user_id, player in players.items():

        if player.get("eliminated"):
            continue

        tasks.append(
            telegram_notify(
                user_id,
                text,
            )
        )

    if tasks:
        await asyncio.gather(
            *tasks,
            return_exceptions=True,
        )


# =========================================================
# API: HEALTH
# =========================================================

async def api_health(request):
    return json_response(
        {
            "success": True,
            "status": "online",
            "players": len(players),
            "countries_taken": len(country_owner),
            "wars": len(wars),
            "time": iso(now()),
        }
    )


# =========================================================
# API: COUNTRIES
# =========================================================

async def api_countries(request):
    update_all_players()

    result = {}

    for country_id, data in COUNTRIES.items():

        owner_id = country_owner.get(
            country_id
        )

        owner = players.get(
            owner_id
        ) if owner_id else None

        result[country_id] = {
            "id": country_id,
            "name": data["name"],
            "flag": data["flag"],
            "economy": data["economy"],
            "army": data["army"],
            "population": data["population"],
            "taken": bool(owner_id),
            "owner_id": owner_id,
            "occupied_by": (
                owner.get("country")
                if owner
                else None
            ),
        }

    return json_response(
        {
            "success": True,
            "countries": result,
        }
    )


# =========================================================
# API: PLAYER
# =========================================================

def serialize_player(player):
    if not player:
        return None

    update_player_economy(player)

    country = player["country"]

    base = COUNTRIES[country]

    army_power = 0

    for unit_id, quantity in player["army"].items():

        unit = ARMY_UNITS.get(unit_id)

        if unit:
            army_power += (
                quantity
                * (
                    unit["attack"]
                    + unit["defense"]
                )
            )

    return {
        **player,
        "country_name": base["name"],
        "country_flag": base["flag"],
        "army_power": army_power,
        "daily_income": base["income"],
        "daily_production": base["production"],
        "occupation_sites": [
            site["id"]
            for site in strategic_sites.values()
            if site.get("owner") == country
        ],
    }


async def api_player(request):
    user_id = get_user_id(request)

    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": True,
                "player": None,
            }
        )

    return json_response(
        {
            "success": True,
            "player": serialize_player(player),
        }
    )


# =========================================================
# API: SELECT COUNTRY
# =========================================================

async def api_select_country(request):
    user_id = get_user_id(request)

    if not user_id:
        return json_response(
            {
                "success": False,
                "message": "شناسه کاربر ارسال نشده است.",
            },
            400,
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    country = (
        data.get("country")
        or request.query.get("country")
    )

    if country not in COUNTRIES:
        return json_response(
            {
                "success": False,
                "message": "کشور نامعتبر است.",
            },
            400,
        )

    existing = players.get(user_id)

    if existing:
        return json_response(
            {
                "success": False,
                "message": "شما قبلاً کشور انتخاب کرده‌اید.",
                "player": serialize_player(existing),
            },
            409,
        )

    if country in country_owner:
        return json_response(
            {
                "success": False,
                "message": "این کشور قبلاً توسط بازیکن دیگری انتخاب شده است.",
            },
            409,
        )

    player = create_player(
        user_id,
        country,
    )

    add_news(
        "انتخاب کشور جدید",
        f"{country_flag(country)} {country_name(country)} وارد بازی شد.",
        "country",
        country,
    )

    return json_response(
        {
            "success": True,
            "message": "کشور با موفقیت انتخاب شد.",
            "player": serialize_player(player),
        }
    )


# =========================================================
# API: ARMY CATALOG
# =========================================================

async def api_army_units(request):
    result = {}

    for unit_id, unit in ARMY_UNITS.items():
        result[unit_id] = {
            "id": unit_id,
            **unit,
        }

    return json_response(
        {
            "success": True,
            "units": result,
        }
    )


# =========================================================
# API: TRAIN UNIT
# =========================================================

async def api_train_unit(request):
    user_id = get_user_id(request)
    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    update_player_economy(player)

    try:
        data = await request.json()
    except Exception:
        data = {}

    unit_id = (
        data.get("unit")
        or data.get("unit_id")
    )

    try:
        quantity = int(
            data.get(
                "quantity",
                1,
            )
        )
    except Exception:
        quantity = 1

    quantity = max(
        1,
        min(quantity, 1000),
    )

    unit = ARMY_UNITS.get(unit_id)

    if not unit:
        return json_response(
            {
                "success": False,
                "message": "یگان نامعتبر است.",
            },
            400,
        )

    factory = unit["factory"]

    if player["infrastructure"].get(
        factory,
        0,
    ) < 1:

        return json_response(
            {
                "success": False,
                "message": (
                    f"برای ساخت {unit['name']} "
                    f"ابتدا باید {INFRASTRUCTURE[factory]['name']} "
                    "را بسازید."
                ),
            },
            400,
        )

    total_cost = {}

    for resource, cost in unit["cost"].items():
        total_cost[resource] = (
            cost * quantity
        )

    for resource, cost in total_cost.items():

        if resource == "money":
            current = player["money"]
        else:
            current = player["resources"].get(
                resource,
                0,
            )

        if current < cost:
            return json_response(
                {
                    "success": False,
                    "message": (
                        f"منابع کافی برای تولید "
                        f"{quantity:,} واحد وجود ندارد."
                    ),
                },
                400,
            )

    for resource, cost in total_cost.items():

        if resource == "money":
            player["money"] -= cost
        else:
            player["resources"][resource] -= cost

    player["army"][unit_id] = (
        player["army"].get(unit_id, 0)
        + quantity
    )

    add_news(
        "تولید تجهیزات نظامی",
        (
            f"{country_flag(player['country'])} "
            f"{country_name(player['country'])} "
            f"{quantity:,} واحد {unit['name']} تولید کرد."
        ),
        "military",
        player["country"],
    )

    return json_response(
        {
            "success": True,
            "message": "تولید با موفقیت انجام شد.",
            "player": serialize_player(player),
        }
    )


# =========================================================
# API: INFRASTRUCTURE
# =========================================================

async def api_upgrade_infra(request):
    user_id = get_user_id(request)
    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    update_player_economy(player)

    try:
        data = await request.json()
    except Exception:
        data = {}

    infra_id = (
        data.get("infrastructure")
        or data.get("type")
    )

    config = INFRASTRUCTURE.get(
        infra_id
    )

    if not config:
        return json_response(
            {
                "success": False,
                "message": "زیرساخت نامعتبر است.",
            },
            400,
        )

    current_level = player[
        "infrastructure"
    ].get(
        infra_id,
        0,
    )

    if current_level >= config["max_level"]:
        return json_response(
            {
                "success": False,
                "message": "این زیرساخت به حداکثر سطح رسیده است.",
            },
            400,
        )

    cost = int(
        config["base_cost"]
        * (
            config["cost_growth"]
            ** current_level
        )
    )

    if player["money"] < cost:
        return json_response(
            {
                "success": False,
                "message": "پول کافی نیست.",
            },
            400,
        )

    player["money"] -= cost

    player["infrastructure"][infra_id] = (
        current_level + 1
    )

    if infra_id == "food":
        player["development"] += 0.05

    if infra_id == "power":
        player["development"] += 0.03

    if infra_id == "manpower":
        player["manpower"] += 25_000

    add_news(
        "توسعه زیرساخت",
        (
            f"{country_flag(player['country'])} "
            f"{country_name(player['country'])} "
            f"{config['name']} را به سطح "
            f"{current_level + 1} رساند."
        ),
        "development",
        player["country"],
    )

    return json_response(
        {
            "success": True,
            "message": "زیرساخت ارتقا یافت.",
            "cost": cost,
            "player": serialize_player(player),
        }
    )


# =========================================================
# API: ECONOMY
# =========================================================

async def api_upgrade_economy(request):
    user_id = get_user_id(request)
    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    update_player_economy(player)

    cost = int(
        250_000
        * (
            1.45
            ** max(
                0,
                player["development"] - 1,
            )
        )
    )

    if player["money"] < cost:
        return json_response(
            {
                "success": False,
                "message": "پول کافی نیست.",
            },
            400,
        )

    player["money"] -= cost
    player["economy"] += 35
    player["development"] += 1

    add_news(
        "رشد اقتصادی",
        (
            f"{country_flag(player['country'])} "
            f"{country_name(player['country'])} "
            "اقتصاد خود را توسعه داد."
        ),
        "economy",
        player["country"],
    )

    return json_response(
        {
            "success": True,
            "message": "اقتصاد توسعه یافت.",
            "cost": cost,
            "player": serialize_player(player),
        }
    )


# =========================================================
# TREATY HELPERS
# =========================================================

def treaty_key(country_a, country_b):
    return "|".join(
        sorted(
            [
                country_a,
                country_b,
            ]
        )
    )


def get_treaty(country_a, country_b):
    return treaties.get(
        treaty_key(
            country_a,
            country_b,
        )
    )


def active_treaty(
    country_a,
    country_b,
    treaty_type=None,
):
    treaty = get_treaty(
        country_a,
        country_b,
    )

    if not treaty:
        return False

    if treaty["status"] != "active":
        return False

    if treaty_type:
        return treaty["type"] == treaty_type

    return True


# =========================================================
# API: DIPLOMACY
# =========================================================

async def api_diplomacy(request):
    user_id = get_user_id(request)
    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    country = player["country"]

    result = []

    for other_country in COUNTRIES:

        if other_country == country:
            continue

        treaty = get_treaty(
            country,
            other_country,
        )

        result.append(
            {
                "country": other_country,
                "name": country_name(other_country),
                "flag": country_flag(other_country),
                "treaty": treaty,
            }
        )

    return json_response(
        {
            "success": True,
            "country": country,
            "relations": result,
        }
    )


# =========================================================
# API: PROPOSE TREATY
# =========================================================

async def api_propose_treaty(request):
    user_id = get_user_id(request)
    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    target = data.get("target_country")
    treaty_type = data.get("type")

    if target not in COUNTRIES:
        return json_response(
            {
                "success": False,
                "message": "کشور مقصد نامعتبر است.",
            },
            400,
        )

    if target == player["country"]:
        return json_response(
            {
                "success": False,
                "message": "نمی‌توانید با خودتان پیمان ببندید.",
            },
            400,
        )

    if treaty_type not in (
        "alliance",
        "non_aggression",
    ):
        return json_response(
            {
                "success": False,
                "message": "نوع پیمان نامعتبر است.",
            },
            400,
        )

    key = treaty_key(
        player["country"],
        target,
    )

    existing = treaties.get(key)

    if existing and existing["status"] == "active":
        return json_response(
            {
                "success": False,
                "message": "پیمان فعال وجود دارد.",
            },
            400,
        )

    treaty = {
        "id": make_id("treaty"),
        "country_a": player["country"],
        "country_b": target,
        "type": treaty_type,
        "status": "pending",
        "proposed_by": player["country"],
        "created_at": iso(now()),
    }

    treaties[key] = treaty

    target_player = get_country_player(
        target
    )

    if target_player:

        add_notification(
            target_player["user_id"],
            "پیشنهاد دیپلماتیک",
            (
                f"{country_flag(player['country'])} "
                f"{country_name(player['country'])} "
                f"پیشنهاد {TREATY_TYPE_NAMES(treaty_type)} "
                "ارسال کرده است."
            ),
            "diplomacy",
        )

    return json_response(
        {
            "success": True,
            "message": "پیشنهاد پیمان ارسال شد.",
            "treaty": treaty,
        }
    )


# =========================================================
# TREATY NAME
# =========================================================

def TREATY_TYPE_NAMES(treaty_type):
    return {
        "alliance": "پیمان اتحاد",
        "non_aggression": "پیمان عدم تجاوز",
    }.get(
        treaty_type,
        treaty_type,
    )


# =========================================================
# API: ACCEPT TREATY
# =========================================================

async def api_accept_treaty(request):
    user_id = get_user_id(request)

    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    treaty_id = data.get("treaty_id")

    target_treaty = None

    for treaty in treaties.values():
        if treaty["id"] == treaty_id:
            target_treaty = treaty
            break

    if not target_treaty:
        return json_response(
            {
                "success": False,
                "message": "پیمان پیدا نشد.",
            },
            404,
        )

    if player["country"] not in (
        target_treaty["country_a"],
        target_treaty["country_b"],
    ):
        return json_response(
            {
                "success": False,
                "message": "شما عضو این پیمان نیستید.",
            },
            403,
        )

    if target_treaty["status"] != "pending":
        return json_response(
            {
                "success": False,
                "message": "این پیشنهاد دیگر فعال نیست.",
            },
            400,
        )

    target_treaty["status"] = "active"
    target_treaty["accepted_at"] = iso(now())

    other_country = (
        target_treaty["country_a"]
        if player["country"]
        == target_treaty["country_b"]
        else target_treaty["country_b"]
    )

    other_player = get_country_player(
        other_country
    )

    if other_player:
        add_notification(
            other_player["user_id"],
            "پیمان تأیید شد",
            (
                f"{country_flag(player['country'])} "
                f"{country_name(player['country'])} "
                "پیمان دیپلماتیک را پذیرفت."
            ),
            "diplomacy",
        )

    add_news(
        "پیمان دیپلماتیک",
        (
            f"{country_flag(target_treaty['country_a'])} "
            f"{country_name(target_treaty['country_a'])} و "
            f"{country_flag(target_treaty['country_b'])} "
            f"{country_name(target_treaty['country_b'])} "
            f"پیمان {TREATY_TYPE_NAMES(target_treaty['type'])} بستند."
        ),
        "diplomacy",
    )

    return json_response(
        {
            "success": True,
            "treaty": target_treaty,
        }
    )


# =========================================================
# API: REJECT TREATY
# =========================================================

async def api_reject_treaty(request):
    user_id = get_user_id(request)
    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    treaty_id = data.get("treaty_id")

    for key, treaty in treaties.items():

        if treaty["id"] != treaty_id:
            continue

        if player["country"] not in (
            treaty["country_a"],
            treaty["country_b"],
        ):
            return json_response(
                {
                    "success": False,
                    "message": "دسترسی غیرمجاز.",
                },
                403,
            )

        treaty["status"] = "rejected"

        return json_response(
            {
                "success": True,
                "treaty": treaty,
            }
        )

    return json_response(
        {
            "success": False,
            "message": "پیمان پیدا نشد.",
        },
        404,
    )


# =========================================================
# WAR HELPERS
# =========================================================

def player_has_military(player):
    return any(
        quantity > 0
        for quantity in player["army"].values()
    )


def calculate_army_power(
    player,
    group=None,
):
    power = 0

    for unit_id, quantity in player["army"].items():

        unit = ARMY_UNITS.get(unit_id)

        if not unit:
            continue

        if group and unit["group"] != group:
            continue

        power += (
            quantity
            * unit["attack"]
        )

    return power


def calculate_defense_power(
    player,
    group=None,
):
    power = 0

    for unit_id, quantity in player["army"].items():

        unit = ARMY_UNITS.get(unit_id)

        if not unit:
            continue

        if group and unit["group"] != group:
            continue

        power += (
            quantity
            * unit["defense"]
        )

    return power


def count_sent_units(forces):
    total = 0

    for value in forces.values():

        if isinstance(value, dict):
            for quantity in value.values():
                total += int(quantity)

        else:
            total += int(value or 0)

    return total


def normalize_war_forces(
    player,
    raw_forces,
):
    result = {
        "land": {},
        "naval": {},
        "air": {},
    }

    if not isinstance(raw_forces, dict):
        return result

    for group in result:

        group_data = raw_forces.get(
            group,
            {},
        )

        if not isinstance(group_data, dict):
            continue

        for unit_id, quantity in group_data.items():

            unit = ARMY_UNITS.get(unit_id)

            if not unit:
                continue

            if unit["group"] != group:
                continue

            try:
                quantity = int(quantity)
            except Exception:
                quantity = 0

            quantity = max(
                0,
                quantity,
            )

            available = player["army"].get(
                unit_id,
                0,
            )

            quantity = min(
                quantity,
                available,
            )

            if quantity:
                result[group][unit_id] = quantity

    return result


def remove_forces(
    player,
    forces,
):
    for group in forces.values():

        for unit_id, quantity in group.items():

            player["army"][unit_id] = max(
                0,
                player["army"].get(
                    unit_id,
                    0,
                ) - quantity,
            )


def force_attack_power(
    forces,
    group,
):
    power = 0

    for unit_id, quantity in forces.get(
        group,
        {},
    ).items():

        unit = ARMY_UNITS[unit_id]

        power += (
            quantity
            * unit["attack"]
        )

    return power


def force_defense_power(
    forces,
    group,
):
    power = 0

    for unit_id, quantity in forces.get(
        group,
        {},
    ).items():

        unit = ARMY_UNITS[unit_id]

        power += (
            quantity
            * unit["defense"]
        )

    return power


def casualty_forces(
    forces,
    ratio,
):
    casualties = {}

    for group, units in forces.items():

        casualties[group] = {}

        for unit_id, quantity in units.items():

            casualties[group][unit_id] = max(
                0,
                int(quantity * ratio),
            )

    return casualties


def apply_casualties(
    player,
    casualties,
):
    for group in casualties.values():

        for unit_id, quantity in group.items():

            player["army"][unit_id] = max(
                0,
                player["army"].get(
                    unit_id,
                    0,
                ) - quantity,
            )


# =========================================================
# WAR DECLARATION
# =========================================================

async def api_declare_war(request):
    user_id = get_user_id(request)
    attacker = get_player(user_id)

    if not attacker:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    update_player_economy(attacker)

    try:
        data = await request.json()
    except Exception:
        data = {}

    target_country = (
        data.get("target_country")
        or data.get("target")
    )

    if target_country not in COUNTRIES:
        return json_response(
            {
                "success": False,
                "message": "کشور هدف نامعتبر است.",
            },
            400,
        )

    if target_country == attacker["country"]:
        return json_response(
            {
                "success": False,
                "message": "نمی‌توانید به خودتان حمله کنید.",
            },
            400,
        )

    defender = get_country_player(
        target_country
    )

    if not defender:
        return json_response(
            {
                "success": False,
                "message": "کشور هدف هنوز توسط بازیکن انتخاب نشده است.",
            },
            400,
        )

    if not player_has_military(attacker):
        return json_response(
            {
                "success": False,
                "message": "برای اعلام جنگ باید نیرو داشته باشید.",
            },
            400,
        )

    if active_treaty(
        attacker["country"],
        target_country,
        "non_aggression",
    ):
        return json_response(
            {
                "success": False,
                "message": "بین دو کشور پیمان عدم تجاوز فعال است.",
            },
            400,
        )

    # بررسی اتحاد
    alliance_violation = active_treaty(
        attacker["country"],
        target_country,
        "alliance",
    )

    if alliance_violation:
        attacker["money"] = max(
            0,
            attacker["money"] - 2_000_000,
        )

        add_news(
            "نقض پیمان اتحاد",
            (
                f"{country_flag(attacker['country'])} "
                f"{country_name(attacker['country'])} "
                "پیمان اتحاد را نقض کرد و ۲,۰۰۰,۰۰۰ جریمه شد."
            ),
            "diplomacy",
            attacker["country"],
        )

    raw_forces = data.get(
        "forces",
        {},
    )

    forces = normalize_war_forces(
        attacker,
        raw_forces,
    )

    if count_sent_units(forces) <= 0:
        return json_response(
            {
                "success": False,
                "message": "حداقل یک نیروی نظامی باید اعزام شود.",
            },
            400,
        )

    # بررسی جنگ فعال
    for war in wars.values():

        if war["status"] in (
            "pending",
            "preparing",
            "active",
        ):

            pair = {
                war["attacker_country"],
                war["defender_country"],
            }

            if pair == {
                attacker["country"],
                target_country,
            }:
                return json_response(
                    {
                        "success": False,
                        "message": "بین این دو کشور جنگ فعال وجود دارد.",
                    },
                    400,
                )

    war_id = make_id("war")

    war = {
        "id": war_id,

        "attacker_user_id": attacker["user_id"],
        "defender_user_id": defender["user_id"],

        "attacker_country": attacker["country"],
        "defender_country": target_country,

        "forces": forces,

        "status": "pending",

        "created_at": iso(now()),
        "approved_at": None,
        "battle_at": None,
        "resolved_at": None,

        "result": None,
        "battle_report": None,
    }

    wars[war_id] = war

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ تأیید جنگ",
                    callback_data=f"war_approve:{war_id}",
                ),
                InlineKeyboardButton(
                    text="❌ رد جنگ",
                    callback_data=f"war_reject:{war_id}",
                ),
            ]
        ]
    )

    text = (
        "🌐 <b>درخواست جدید اعلام جنگ</b>\n\n"
        f"⚔️ مهاجم: {country_flag(attacker['country'])} "
        f"<b>{country_name(attacker['country'])}</b>\n"
        f"🛡️ مدافع: {country_flag(target_country)} "
        f"<b>{country_name(target_country)}</b>\n\n"
        "نیروهای اعزامی:\n"
        f"🪖 زمینی: {sum(forces['land'].values()):,}\n"
        f"⚓ دریایی: {sum(forces['naval'].values()):,}\n"
        f"✈️ هوایی: {sum(forces['air'].values()):,}\n\n"
        f"🆔 <code>{war_id}</code>\n\n"
        "پس از تأیید، دوره ۲۴ ساعته مذاکره و آماده‌سازی آغاز می‌شود."
    )

    try:
        await bot.send_message(
            ADMIN_ID,
            text,
            reply_markup=keyboard,
            parse_mode="HTML",
        )
    except Exception as exc:
        logger.error(
            "Could not notify admin: %s",
            exc,
        )

    add_news(
        "اعلام جنگ",
        (
            f"{country_flag(attacker['country'])} "
            f"{country_name(attacker['country'])} "
            f"علیه {country_flag(target_country)} "
            f"{country_name(target_country)} اعلام جنگ کرد. "
            "در انتظار تأیید."
        ),
        "war",
    )

    return json_response(
        {
            "success": True,
            "message": "درخواست جنگ برای تأیید ارسال شد.",
            "war": war,
        }
    )


# =========================================================
# ADMIN WAR APPROVAL
# =========================================================

async def approve_war(war_id):
    war = wars.get(war_id)

    if not war:
        return {
            "success": False,
            "message": "جنگ پیدا نشد.",
        }

    if war["status"] != "pending":
        return {
            "success": False,
            "message": "این جنگ قبلاً پردازش شده است.",
        }

    battle_time = (
        now()
        + timedelta(
            seconds=WAR_PREPARATION_SECONDS
        )
    )

    war["status"] = "preparing"
    war["approved_at"] = iso(now())
    war["battle_at"] = iso(
        battle_time
    )

    attacker = players.get(
        war["attacker_user_id"]
    )

    defender = players.get(
        war["defender_user_id"]
    )

    for player in (
        attacker,
        defender,
    ):

        if player:

            add_notification(
                player["user_id"],
                "اعلام جنگ تأیید شد",
                (
                    f"{country_flag(war['attacker_country'])} "
                    f"{country_name(war['attacker_country'])} "
                    "و "
                    f"{country_flag(war['defender_country'])} "
                    f"{country_name(war['defender_country'])} "
                    "وارد مرحله آماده‌سازی شدند."
                ),
                "war",
            )

    add_news(
        "جنگ تأیید شد",
        (
            f"{country_flag(war['attacker_country'])} "
            f"{country_name(war['attacker_country'])} "
            "و "
            f"{country_flag(war['defender_country'])} "
            f"{country_name(war['defender_country'])} "
            "پس از تأیید سازمان ملل وارد مرحله ۲۴ ساعته آماده‌سازی شدند."
        ),
        "war",
    )

    await broadcast_telegram(
        "⚔️ <b>جنگ جدید</b>\n\n"
        f"{country_flag(war['attacker_country'])} "
        f"<b>{country_name(war['attacker_country'])}</b> "
        "و "
        f"{country_flag(war['defender_country'])} "
        f"<b>{country_name(war['defender_country'])}</b> "
        "درگیر جنگ شدند.\n\n"
        "⏳ نبرد نهایی پس از ۲۴ ساعت آغاز می‌شود."
    )

    return {
        "success": True,
        "war": war,
    }


async def reject_war(war_id):
    war = wars.get(war_id)

    if not war:
        return {
            "success": False,
            "message": "جنگ پیدا نشد.",
        }

    war["status"] = "rejected"

    attacker = players.get(
        war["attacker_user_id"]
    )

    if attacker:
        add_notification(
            attacker["user_id"],
            "اعلام جنگ رد شد",
            "درخواست اعلام جنگ شما توسط ادمین رد شد.",
            "war",
        )

    return {
        "success": True,
        "war": war,
    }


async def api_admin_war_approve(request):
    admin_id = get_user_id(request)

    if str(admin_id) != str(ADMIN_ID):
        return json_response(
            {
                "success": False,
                "message": "دسترسی غیرمجاز.",
            },
            403,
        )

    war_id = request.query.get(
        "war_id"
    )

    result = await approve_war(
        war_id
    )

    return json_response(result)


async def api_admin_war_reject(request):
    admin_id = get_user_id(request)

    if str(admin_id) != str(ADMIN_ID):
        return json_response(
            {
                "success": False,
                "message": "دسترسی غیرمجاز.",
            },
            403,
        )

    war_id = request.query.get(
        "war_id"
    )

    result = await reject_war(
        war_id
    )

    return json_response(result)


# =========================================================
# WAR RESOLUTION
# =========================================================

def resolve_front(
    attacker,
    defender,
    attacker_forces,
    group,
):
    attack_power = force_attack_power(
        attacker_forces,
        group,
    )

    defense_power = (
        force_defense_power(
            defender,
            group,
        )
        + int(
            defender.get("economy", 0)
            * 0.10
        )
    )

    # اگر مهاجم هیچ نیرویی ندارد
    if attack_power <= 0:
        return {
            "winner": "defender",
            "attacker_power": 0,
            "defender_power": defense_power,
            "attacker_losses": {},
            "defender_losses": {},
        }

    # ضریب تصادفی کوچک
    random_factor = (
        0.92
        + secrets.randbelow(1601) / 10000
    )

    effective_attack = (
        attack_power
        * random_factor
    )

    attacker_wins = (
        effective_attack
        > defense_power
    )

    if attacker_wins:

        attacker_losses = casualty_forces(
            attacker_forces,
            0.10,
        )

        defender_losses = {}

        for unit_id, quantity in defender["army"].items():

            unit = ARMY_UNITS.get(unit_id)

            if not unit:
                continue

            if unit["group"] != group:
                continue

            defender_losses.setdefault(
                group,
                {},
            )[unit_id] = int(
                quantity * 0.30
            )

        winner = "attacker"

    else:

        attacker_losses = casualty_forces(
            attacker_forces,
            0.30,
        )

        defender_losses = {}

        for unit_id, quantity in defender["army"].items():

            unit = ARMY_UNITS.get(unit_id)

            if not unit:
                continue

            if unit["group"] != group:
                continue

            defender_losses.setdefault(
                group,
                {},
            )[unit_id] = int(
                quantity * 0.10
            )

        winner = "defender"

    return {
        "winner": winner,
        "attacker_power": int(
            attack_power
        ),
        "defender_power": int(
            defense_power
        ),
        "attacker_losses": attacker_losses,
        "defender_losses": defender_losses,
    }


async def resolve_war(war_id):
    war = wars.get(war_id)

    if not war:
        return None

    if war["status"] not in (
        "preparing",
        "active",
    ):
        return war

    attacker = players.get(
        war["attacker_user_id"]
    )

    defender = players.get(
        war["defender_user_id"]
    )

    if not attacker or not defender:
        war["status"] = "cancelled"
        return war

    if attacker.get("eliminated"):
        war["status"] = "defender_victory"
        return war

    if defender.get("eliminated"):
        war["status"] = "attacker_victory"
        return war

    war["status"] = "active"

    fronts = {}

    attacker_forces = war["forces"]

    # دفاع از ارتش فعلی مدافع
    groups = [
        "air",
        "naval",
        "land",
    ]

    attacker_front_wins = 0
    defender_front_wins = 0

    air_bonus = 1.0

    for group in groups:

        result = resolve_front(
            attacker,
            defender,
            attacker_forces,
            group,
        )

        if group != "air":

            result["attacker_power"] = int(
                result["attacker_power"]
                * air_bonus
            )

        fronts[group] = result

        if result["winner"] == "attacker":
            attacker_front_wins += 1

            if group == "air":
                air_bonus = 1.15

        else:
            defender_front_wins += 1

    # اعمال تلفات
    for result in fronts.values():

        apply_casualties(
            attacker,
            result.get(
                "attacker_losses",
                {},
            ),
        )

        apply_casualties(
            defender,
            result.get(
                "defender_losses",
                {},
            ),
        )

    if attacker_front_wins >= 2:
        winner = "attacker"
    else:
        winner = "defender"

    report = {
        "fronts": fronts,
        "attacker_front_wins": attacker_front_wins,
        "defender_front_wins": defender_front_wins,
        "winner": winner,
    }

    war["battle_report"] = report
    war["resolved_at"] = iso(now())

    if winner == "attacker":

        war["status"] = "attacker_victory"

        transfer_country(
            attacker,
            defender,
        )

        # 40 درصد نیروی انسانی
        transferred_manpower = int(
            defender["manpower"]
            * 0.40
        )

        attacker["manpower"] += (
            transferred_manpower
        )

        # 50 درصد درآمد روزانه
        defender_base = COUNTRIES[
            defender["country"]
        ]

        attacker["money"] += int(
            defender_base["income"]
            * 0.50
        )

        add_news(
            "پیروزی در جنگ",
            (
                f"{country_flag(attacker['country'])} "
                f"{country_name(attacker['country'])} "
                f"در جنگ با "
                f"{country_flag(defender['country'])} "
                f"{country_name(defender['country'])} "
                "پیروز شد."
            ),
            "war",
        )

        add_notification(
            attacker["user_id"],
            "پیروزی در جنگ",
            "نیروهای شما در جنگ پیروز شدند.",
            "war",
        )

        add_notification(
            defender["user_id"],
            "شکست در جنگ",
            "کشور شما شکست خورد و تحت کنترل دشمن قرار گرفت.",
            "war",
        )

    else:

        war["status"] = "defender_victory"

        add_news(
            "دفاع موفق",
            (
                f"{country_flag(defender['country'])} "
                f"{country_name(defender['country'])} "
                "در برابر حمله دشمن مقاومت کرد."
            ),
            "war",
        )

        add_notification(
            defender["user_id"],
            "پیروزی دفاعی",
            "کشور شما حمله دشمن را دفع کرد.",
            "war",
        )

        add_notification(
            attacker["user_id"],
            "شکست نظامی",
            "حمله شما با شکست مواجه شد.",
            "war",
        )

    await broadcast_telegram(
        "⚔️ <b>گزارش نبرد</b>\n\n"
        f"{country_flag(war['attacker_country'])} "
        f"{country_name(war['attacker_country'])}\n"
        "در برابر\n"
        f"{country_flag(war['defender_country'])} "
        f"{country_name(war['defender_country'])}\n\n"
        f"نتیجه: "
        f"<b>{'پیروزی مهاجم' if winner == 'attacker' else 'پیروزی مدافع'}</b>"
    )

    return war


def transfer_country(
    winner,
    loser,
):
    winner_country = winner["country"]
    loser_country = loser["country"]

    loser["eliminated"] = True

    country_owner.pop(
        loser_country,
        None,
    )

    winner["occupied_territories"].append(
        loser_country
    )

    # کشور شکست‌خورده از بازیکنان فعال حذف می‌شود
    players.pop(
        loser["user_id"],
        None,
    )

    add_news(
        "اشغال کشور",
        (
            f"{country_flag(winner_country)} "
            f"{country_name(winner_country)} "
            f"سرزمین {country_flag(loser_country)} "
            f"{country_name(loser_country)} را تحت کنترل گرفت."
        ),
        "occupation",
        winner_country,
    )


# =========================================================
# API: WAR STATUS
# =========================================================

async def api_war_status(request):
    user_id = get_user_id(request)

    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "wars": [],
            }
        )

    country = player["country"]

    result = []

    for war in wars.values():

        if country in (
            war["attacker_country"],
            war["defender_country"],
        ):

            result.append(
                war
            )

    return json_response(
        {
            "success": True,
            "wars": result,
        }
    )


# =========================================================
# API: ALL WARS
# =========================================================

async def api_wars(request):
    return json_response(
        {
            "success": True,
            "wars": list(
                wars.values()
            ),
        }
    )


# =========================================================
# STATEMENTS
# =========================================================

def reset_statement_counter(player):

    today = now().date().isoformat()

    if player.get(
        "statement_day"
    ) != today:

        player["statement_day"] = today
        player["statement_count"] = 0
        player["last_statement_at"] = None


async def api_statements(request):
    return json_response(
        {
            "success": True,
            "statements": statements[:100],
            "comments": statement_comments[:200],
        }
    )


async def api_create_statement(request):
    user_id = get_user_id(request)
    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    reset_statement_counter(
        player
    )

    try:
        data = await request.json()
    except Exception:
        data = {}

    text = str(
        data.get(
            "text",
            "",
        )
    ).strip()

    if not text:
        return json_response(
            {
                "success": False,
                "message": "متن بیانیه خالی است.",
            },
            400,
        )

    if len(text) > 1000:
        return json_response(
            {
                "success": False,
                "message": "بیانیه بیش از حد طولانی است.",
            },
            400,
        )

    count = player["statement_count"]

    if count >= 4:
        return json_response(
            {
                "success": False,
                "message": "سقف روزانه ۴ بیانیه است.",
            },
            400,
        )

    last_time = parse_dt(
        player.get(
            "last_statement_at"
        )
    )

    if last_time:

        minutes = (
            now() - last_time
        ).total_seconds() / 60

        if minutes < 60:
            return json_response(
                {
                    "success": False,
                    "message": (
                        "بین دو بیانیه باید حداقل یک ساعت فاصله باشد."
                    ),
                },
                400,
            )

    cost = 0

    if count == 2:
        cost = 10_000

    elif count == 3:
        cost = 400_000

    if player["money"] < cost:
        return json_response(
            {
                "success": False,
                "message": "برای انتشار این بیانیه پول کافی ندارید.",
            },
            400,
        )

    player["money"] -= cost

    statement = {
        "id": make_id("statement"),
        "country": player["country"],
        "country_name": country_name(
            player["country"]
        ),
        "flag": country_flag(
            player["country"]
        ),
        "text": text,
        "created_at": iso(now()),
        "supporters": [],
        "accusers": [],
    }

    statements.insert(
        0,
        statement,
    )

    player["statement_count"] += 1
    player["last_statement_at"] = iso(now())

    return json_response(
        {
            "success": True,
            "statement": statement,
            "cost": cost,
        }
    )


async def api_statement_react(request):
    user_id = get_user_id(request)
    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    statement_id = data.get(
        "statement_id"
    )

    reaction = data.get(
        "reaction"
    )

    if reaction not in (
        "support",
        "accuse",
    ):
        return json_response(
            {
                "success": False,
                "message": "واکنش نامعتبر است.",
            },
            400,
        )

    statement = next(
        (
            item
            for item in statements
            if item["id"] == statement_id
        ),
        None,
    )

    if not statement:
        return json_response(
            {
                "success": False,
                "message": "بیانیه پیدا نشد.",
            },
            404,
        )

    country = player["country"]

    statement["supporters"] = [
        x
        for x in statement["supporters"]
        if x != country
    ]

    statement["accusers"] = [
        x
        for x in statement["accusers"]
        if x != country
    ]

    if reaction == "support":
        statement["supporters"].append(
            country
        )
    else:
        statement["accusers"].append(
            country
        )

    return json_response(
        {
            "success": True,
            "statement": statement,
        }
    )


async def api_statement_comment(request):
    user_id = get_user_id(request)
    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    statement_id = data.get(
        "statement_id"
    )

    text = str(
        data.get(
            "text",
            "",
        )
    ).strip()

    if not text:
        return json_response(
            {
                "success": False,
                "message": "متن نظر خالی است.",
            },
            400,
        )

    comment = {
        "id": make_id("comment"),
        "statement_id": statement_id,
        "country": player["country"],
        "flag": country_flag(
            player["country"]
        ),
        "text": text[:500],
        "created_at": iso(now()),
    }

    statement_comments.insert(
        0,
        comment,
    )

    return json_response(
        {
            "success": True,
            "comment": comment,
        }
    )


# =========================================================
# UNIONS
# =========================================================

async def api_unions(request):
    user_id = get_user_id(request)
    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    result = []

    for union in unions.values():

        result.append(
            {
                **union,
                "member_count": len(
                    union["members"]
                ),
            }
        )

    invites = [
        invite
        for invite in union_invites
        if invite["target_country"]
        == player["country"]
        and invite["status"] == "pending"
    ]

    return json_response(
        {
            "success": True,
            "unions": result,
            "my_union": (
                unions.get(
                    player["union_id"]
                )
                if player["union_id"]
                else None
            ),
            "invites": invites,
        }
    )


async def api_create_union(request):
    user_id = get_user_id(request)
    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    if player.get("union_id"):
        return json_response(
            {
                "success": False,
                "message": "شما قبلاً عضو یک اتحادیه هستید.",
            },
            400,
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    name = str(
        data.get(
            "name",
            "",
        )
    ).strip()

    if not name:
        return json_response(
            {
                "success": False,
                "message": "نام اتحادیه را وارد کنید.",
            },
            400,
        )

    union_id = make_id("union")

    union = {
        "id": union_id,
        "name": name[:50],
        "leader_country": player["country"],
        "members": [
            player["country"]
        ],
        "created_at": iso(now()),
    }

    unions[union_id] = union

    union_messages[union_id] = []

    player["union_id"] = union_id

    add_news(
        "تشکیل اتحادیه",
        (
            f"{country_flag(player['country'])} "
            f"{country_name(player['country'])} "
            f"اتحادیه «{name}» را تشکیل داد."
        ),
        "union",
    )

    return json_response(
        {
            "success": True,
            "union": union,
        }
    )


async def api_union_invite(request):
    user_id = get_user_id(request)
    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    union_id = player.get(
        "union_id"
    )

    union = unions.get(
        union_id
    )

    if not union:
        return json_response(
            {
                "success": False,
                "message": "شما عضو اتحادیه نیستید.",
            },
            400,
        )

    if union["leader_country"] != player["country"]:
        return json_response(
            {
                "success": False,
                "message": "فقط رهبر اتحادیه می‌تواند دعوت ارسال کند.",
            },
            403,
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    target = data.get(
        "target_country"
    )

    target_player = get_country_player(
        target
    )

    if not target_player:
        return json_response(
            {
                "success": False,
                "message": "کشور هدف بازیکن ندارد.",
            },
            400,
        )

    if target_player.get(
        "union_id"
    ):
        return json_response(
            {
                "success": False,
                "message": "این کشور قبلاً عضو یک اتحادیه است.",
            },
            400,
        )

    invite = {
        "id": make_id("invite"),
        "union_id": union_id,
        "union_name": union["name"],
        "from_country": player["country"],
        "target_country": target,
        "status": "pending",
        "created_at": iso(now()),
    }

    union_invites.append(
        invite
    )

    add_notification(
        target_player["user_id"],
        "دعوت به اتحادیه",
        (
            f"شما به اتحادیه «{union['name']}» "
            "دعوت شده‌اید."
        ),
        "union",
    )

    return json_response(
        {
            "success": True,
            "invite": invite,
        }
    )


async def api_union_respond(request):
    user_id = get_user_id(request)
    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    invite_id = data.get(
        "invite_id"
    )

    action = data.get(
        "action"
    )

    invite = next(
        (
            x
            for x in union_invites
            if x["id"] == invite_id
        ),
        None,
    )

    if not invite:
        return json_response(
            {
                "success": False,
                "message": "دعوت پیدا نشد.",
            },
            404,
        )

    if invite["target_country"] != player["country"]:
        return json_response(
            {
                "success": False,
                "message": "این دعوت برای شما نیست.",
            },
            403,
        )

    if invite["status"] != "pending":
        return json_response(
            {
                "success": False,
                "message": "این دعوت دیگر فعال نیست.",
            },
            400,
        )

    if action == "accept":

        if player.get("union_id"):
            return json_response(
                {
                    "success": False,
                    "message": "شما قبلاً عضو یک اتحادیه هستید.",
                },
                400,
            )

        union = unions.get(
            invite["union_id"]
        )

        if not union:
            return json_response(
                {
                    "success": False,
                    "message": "اتحادیه پیدا نشد.",
                },
                404,
            )

        union["members"].append(
            player["country"]
        )

        player["union_id"] = union["id"]

        invite["status"] = "accepted"

    else:

        invite["status"] = "rejected"

    return json_response(
        {
            "success": True,
            "invite": invite,
        }
    )


async def api_union_chat(request):
    user_id = get_user_id(request)
    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    union_id = player.get(
        "union_id"
    )

    if not union_id:
        return json_response(
            {
                "success": False,
                "message": "شما عضو اتحادیه نیستید.",
            },
            400,
        )

    if request.method == "GET":

        return json_response(
            {
                "success": True,
                "messages": union_messages.get(
                    union_id,
                    [],
                )[-200:],
            }
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    text = str(
        data.get(
            "text",
            "",
        )
    ).strip()

    if not text:
        return json_response(
            {
                "success": False,
                "message": "پیام خالی است.",
            },
            400,
        )

    message = {
        "id": make_id("union_msg"),
        "country": player["country"],
        "flag": country_flag(
            player["country"]
        ),
        "text": text[:500],
        "created_at": iso(now()),
    }

    union_messages.setdefault(
        union_id,
        [],
    ).append(
        message
    )

    return json_response(
        {
            "success": True,
            "message": message,
        }
    )


# =========================================================
# PRIVATE MESSAGES
# =========================================================

async def api_messages(request):
    user_id = get_user_id(request)

    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    if request.method == "GET":

        country = player["country"]

        result = [
            message
            for message in private_messages
            if message["from_country"] == country
            or message["to_country"] == country
        ]

        return json_response(
            {
                "success": True,
                "messages": result[-200:],
            }
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    target = data.get(
        "target_country"
    )

    text = str(
        data.get(
            "text",
            "",
        )
    ).strip()

    if target not in COUNTRIES:
        return json_response(
            {
                "success": False,
                "message": "کشور مقصد نامعتبر است.",
            },
            400,
        )

    if not text:
        return json_response(
            {
                "success": False,
                "message": "پیام خالی است.",
            },
            400,
        )

    message = {
        "id": make_id("msg"),
        "from_country": player["country"],
        "to_country": target,
        "text": text[:1000],
        "created_at": iso(now()),
        "read": False,
    }

    private_messages.append(
        message
    )

    target_player = get_country_player(
        target
    )

    if target_player:
        add_notification(
            target_player["user_id"],
            "پیام جدید",
            (
                f"{country_flag(player['country'])} "
                f"{country_name(player['country'])} "
                "برای شما پیام فرستاد."
            ),
            "message",
        )

    return json_response(
        {
            "success": True,
            "message": message,
        }
    )


# =========================================================
# MARKET
# =========================================================

async def api_market(request):

    if request.method == "GET":

        return json_response(
            {
                "success": True,
                "orders": list(
                    market_orders.values()
                ),
            }
        )

    user_id = get_user_id(request)
    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    resource = data.get(
        "resource"
    )

    amount = int(
        data.get(
            "amount",
            0,
        )
    )

    price_money = int(
        data.get(
            "price_money",
            0,
        )
    )

    if resource not in RESOURCE_NAMES:
        return json_response(
            {
                "success": False,
                "message": "منبع نامعتبر است.",
            },
            400,
        )

    if amount <= 0:
        return json_response(
            {
                "success": False,
                "message": "مقدار سفارش نامعتبر است.",
            },
            400,
        )

    if price_money <= 0:
        return json_response(
            {
                "success": False,
                "message": "قیمت نامعتبر است.",
            },
            400,
        )

    if player["resources"].get(
        resource,
        0,
    ) < amount:

        return json_response(
            {
                "success": False,
                "message": "موجودی منبع کافی نیست.",
            },
            400,
        )

    # منابع سفارش تا زمان اجرا رزرو می‌شوند
    player["resources"][resource] -= amount

    order = {
        "id": make_id("order"),
        "seller_country": player["country"],
        "resource": resource,
        "amount": amount,
        "remaining": amount,
        "price_money": price_money,
        "created_at": iso(now()),
        "status": "open",
    }

    market_orders[
        order["id"]
    ] = order

    return json_response(
        {
            "success": True,
            "order": order,
        }
    )


# =========================================================
# MARKET EXECUTE
# =========================================================

async def api_market_execute(request):
    user_id = get_user_id(request)

    buyer = get_player(user_id)

    if not buyer:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    order_id = data.get(
        "order_id"
    )

    quantity = int(
        data.get(
            "quantity",
            0,
        )
    )

    order = market_orders.get(
        order_id
    )

    if not order:
        return json_response(
            {
                "success": False,
                "message": "سفارش پیدا نشد.",
            },
            404,
        )

    if order["status"] != "open":
        return json_response(
            {
                "success": False,
                "message": "سفارش دیگر فعال نیست.",
            },
            400,
        )

    if order["seller_country"] == buyer["country"]:
        return json_response(
            {
                "success": False,
                "message": "نمی‌توانید سفارش خودتان را اجرا کنید.",
            },
            400,
        )

    quantity = max(
        1,
        min(
            quantity,
            order["remaining"],
        ),
    )

    total_money = (
        order["price_money"]
        * quantity
    )

    if buyer["money"] < total_money:
        return json_response(
            {
                "success": False,
                "message": "پول کافی نیست.",
            },
            400,
        )

    seller = get_country_player(
        order["seller_country"]
    )

    if not seller:
        return json_response(
            {
                "success": False,
                "message": "فروشنده دیگر در بازی نیست.",
            },
            400,
        )

    buyer["money"] -= total_money
    seller["money"] += total_money

    buyer["resources"][
        order["resource"]
    ] += quantity

    order["remaining"] -= quantity

    if order["remaining"] <= 0:
        order["status"] = "completed"

    add_news(
        "معامله بازار",
        (
            f"{country_flag(buyer['country'])} "
            f"{country_name(buyer['country'])} "
            "یک معامله منابع انجام داد."
        ),
        "market",
    )

    return json_response(
        {
            "success": True,
            "order": order,
            "player": serialize_player(
                buyer
            ),
        }
    )


# =========================================================
# MARKET DELETE
# =========================================================

async def api_market_delete(request):
    user_id = get_user_id(request)

    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    order_id = request.query.get(
        "order_id"
    )

    order = market_orders.get(
        order_id
    )

    if not order:
        return json_response(
            {
                "success": False,
                "message": "سفارش پیدا نشد.",
            },
            404,
        )

    if order["seller_country"] != player["country"]:
        return json_response(
            {
                "success": False,
                "message": "این سفارش متعلق به شما نیست.",
            },
            403,
        )

    if order["status"] != "open":
        return json_response(
            {
                "success": False,
                "message": "این سفارش دیگر فعال نیست.",
            },
            400,
        )

    remaining = order["remaining"]

    player["resources"][
        order["resource"]
    ] += remaining

    order["remaining"] = 0
    order["status"] = "cancelled"

    return json_response(
        {
            "success": True,
            "order": order,
        }
    )


# =========================================================
# STRATEGIC SITES
# =========================================================

async def api_sites(request):

    result = []

    for site in strategic_sites.values():

        result.append(
            {
                **site,
                "owner_name": (
                    country_name(
                        site["owner"]
                    )
                    if site["owner"]
                    else None
                ),
                "owner_flag": (
                    country_flag(
                        site["owner"]
                    )
                    if site["owner"]
                    else None
                ),
            }
        )

    return json_response(
        {
            "success": True,
            "sites": result,
        }
    )


async def api_capture_site(request):
    user_id = get_user_id(request)

    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "message": "بازیکن پیدا نشد.",
            },
            404,
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    site_id = data.get(
        "site_id"
    )

    site = strategic_sites.get(
        site_id
    )

    if not site:
        return json_response(
            {
                "success": False,
                "message": "موقعیت راهبردی پیدا نشد.",
            },
            404,
        )

    if site.get("owner") == player["country"]:
        return json_response(
            {
                "success": False,
                "message": "این موقعیت در اختیار شماست.",
            },
            400,
        )

    if site.get("pending"):
        return json_response(
            {
                "success": False,
                "message": "یک عملیات برای این موقعیت در حال انجام است.",
            },
            400,
        )

    naval_count = (
        player["army"].get(
            "warship",
            0,
        )
        + player["army"].get(
            "submarine",
            0,
        )
    )

    if naval_count <= 0:
        return json_response(
            {
                "success": False,
                "message": "برای عملیات دریایی حداقل یک ناو یا زیردریایی لازم است.",
            },
            400,
        )

    arrival = (
        now()
        + timedelta(
            seconds=SITE_TRAVEL_SECONDS
        )
    )

    site["pending"] = {
        "country": player["country"],
        "arrival": iso(arrival),
    }

    add_news(
        "اعزام ناوگان",
        (
            f"{country_flag(player['country'])} "
            f"{country_name(player['country'])} "
            f"برای تصرف «{site['name']}» ناوگان اعزام کرد."
        ),
        "strategic",
        player["country"],
    )

    return json_response(
        {
            "success": True,
            "message": "ناوگان اعزام شد. زمان رسیدن ۲ ساعت است.",
            "site": site,
        }
    )


# =========================================================
# RANKS
# =========================================================

async def api_ranks(request):
    update_all_players()

    ranking_players = []

    for player in players.values():

        army_power = 0

        for unit_id, quantity in player["army"].items():

            unit = ARMY_UNITS.get(
                unit_id
            )

            if unit:
                army_power += (
                    quantity
                    * (
                        unit["attack"]
                        + unit["defense"]
                    )
                )

        diplomacy_score = 0

        for treaty in treaties.values():

            if (
                treaty["status"] == "active"
                and player["country"]
                in (
                    treaty["country_a"],
                    treaty["country_b"],
                )
            ):
                diplomacy_score += 100

        ranking_players.append(
            {
                "country": player["country"],
                "name": country_name(
                    player["country"]
                ),
                "flag": country_flag(
                    player["country"]
                ),
                "economic": player["money"],
                "military": army_power,
                "diplomacy": diplomacy_score,
                "development": player[
                    "development"
                ],
            }
        )

    def rank_by(key):
        return sorted(
            ranking_players,
            key=lambda x: x[key],
            reverse=True,
        )

    return json_response(
        {
            "success": True,
            "overall": rank_by("economic"),
            "economic": rank_by("economic"),
            "military": rank_by("military"),
            "diplomacy": rank_by("diplomacy"),
            "development": rank_by("development"),
        }
    )


# =========================================================
# NOTIFICATIONS
# =========================================================

async def api_notifications(request):
    user_id = get_user_id(request)

    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
                "notifications": [],
            }
        )

    return json_response(
        {
            "success": True,
            "notifications": player[
                "notifications"
            ][:100],
        }
    )


async def api_notification_read(request):
    user_id = get_user_id(request)

    player = get_player(user_id)

    if not player:
        return json_response(
            {
                "success": False,
            },
            404,
        )

    notification_id = request.query.get(
        "id"
    )

    for item in player["notifications"]:

        if item["id"] == notification_id:
            item["read"] = True

    return json_response(
        {
            "success": True,
        }
    )


# =========================================================
# GLOBAL NEWS
# =========================================================

async def api_news(request):
    return json_response(
        {
            "success": True,
            "news": news_items[:200],
        }
    )


# =========================================================
# GAME TICK
# =========================================================

async def game_tick():

    while True:

        try:

            update_all_players()

            current = now()

            # -----------------------------------------
            # جنگ‌های آماده برای نبرد
            # -----------------------------------------

            for war_id, war in list(
                wars.items()
            ):

                if (
                    war["status"] == "preparing"
                    and parse_dt(
                        war["battle_at"]
                    )
                    and parse_dt(
                        war["battle_at"]
                    ) <= current
                ):

                    logger.info(
                        "Resolving war %s",
                        war_id,
                    )

                    await resolve_war(
                        war_id
                    )

            # -----------------------------------------
            # موقعیت‌های راهبردی
            # -----------------------------------------

            for site in strategic_sites.values():

                pending = site.get(
                    "pending"
                )

                if not pending:
                    continue

                arrival = parse_dt(
                    pending.get(
                        "arrival"
                    )
                )

                if not arrival:
                    continue

                if arrival <= current:

                    country = pending[
                        "country"
                    ]

                    old_owner = site.get(
                        "owner"
                    )

                    site["owner"] = country
                    site["pending"] = None

                    add_news(
                        "تصرف موقعیت راهبردی",
                        (
                            f"{country_flag(country)} "
                            f"{country_name(country)} "
                            f"«{site['name']}» را تصرف کرد."
                        ),
                        "strategic",
                        country,
                    )

                    owner_id = country_owner.get(
                        country
                    )

                    if owner_id:
                        add_notification(
                            owner_id,
                            "تصرف موفق",
                            (
                                f"موقعیت «{site['name']}» "
                                "با موفقیت تصرف شد."
                            ),
                            "strategic",
                        )

                    if old_owner:

                        old_id = country_owner.get(
                            old_owner
                        )

                        if old_id:

                            add_notification(
                                old_id,
                                "از دست رفتن موقعیت",
                                (
                                    f"موقعیت «{site['name']}» "
                                    "توسط کشور دیگری تصرف شد."
                                ),
                                "strategic",
                            )

            await asyncio.sleep(30)

        except asyncio.CancelledError:
            break

        except Exception:
            logger.exception(
                "Game tick error"
            )

            await asyncio.sleep(30)


# =========================================================
# TELEGRAM START
# =========================================================

@dp.message(CommandStart())
async def command_start(message: Message):

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🎮 ورود به بازی",
                    web_app=WebAppInfo(
                        url=WEB_APP_URL
                    ),
                )
            ]
        ]
    )

    await message.answer(
        "🌍 <b>جنگ جهانی دوم</b>\n\n"
        "به بازی استراتژیک جنگ جهانی دوم خوش آمدید.\n\n"
        "کشور خود را انتخاب کنید و امپراتوری خود را بسازید.\n\n"
        "🪖 ارتش\n"
        "⚓ نیروی دریایی\n"
        "✈️ نیروی هوایی\n"
        "💰 اقتصاد\n"
        "🤝 دیپلماسی\n"
        "⚔️ جنگ\n"
        "🌍 کنترل مناطق راهبردی\n\n"
        "برای شروع وارد بازی شوید.",
        reply_markup=keyboard,
        parse_mode="HTML",
    )


# =========================================================
# TELEGRAM WEB APP DATA
# =========================================================

@dp.message(F.web_app_data)
async def web_app_data(
    message: Message,
):

    logger.info(
        "WebApp data from %s: %s",
        message.from_user.id,
        message.web_app_data.data,
    )


# =========================================================
# ADMIN CALLBACK
# =========================================================

@dp.callback_query(
    F.data.startswith("war_approve:")
)
async def telegram_approve_war(
    callback: CallbackQuery,
):

    if callback.from_user.id != ADMIN_ID:

        await callback.answer(
            "⛔ دسترسی ندارید.",
            show_alert=True,
        )

        return

    war_id = callback.data.split(
        ":",
        1,
    )[1]

    result = await approve_war(
        war_id
    )

    if not result["success"]:

        await callback.answer(
            result["message"],
            show_alert=True,
        )

        return

    await callback.message.edit_text(
        "✅ <b>جنگ تأیید شد</b>\n\n"
        f"🆔 <code>{war_id}</code>\n\n"
        "⏳ دوره ۲۴ ساعته مذاکره و آماده‌سازی آغاز شد.",
        parse_mode="HTML",
    )

    await callback.answer(
        "جنگ تأیید شد."
    )


@dp.callback_query(
    F.data.startswith("war_reject:")
)
async def telegram_reject_war(
    callback: CallbackQuery,
):

    if callback.from_user.id != ADMIN_ID:

        await callback.answer(
            "⛔ دسترسی ندارید.",
            show_alert=True,
        )

        return

    war_id = callback.data.split(
        ":",
        1,
    )[1]

    result = await reject_war(
        war_id
    )

    if not result["success"]:

        await callback.answer(
            result["message"],
            show_alert=True,
        )

        return

    await callback.message.edit_text(
        "❌ <b>اعلام جنگ رد شد</b>\n\n"
        f"🆔 <code>{war_id}</code>",
        parse_mode="HTML",
    )

    await callback.answer(
        "اعلام جنگ رد شد."
    )


# =========================================================
# STATIC FILES
# =========================================================

async def index_handler(request):
    file = BASE_DIR / "index.html"

    if not file.exists():
        return web.Response(
            text="index.html پیدا نشد.",
            status=404,
        )

    return web.FileResponse(
        file
    )


async def style_handler(request):
    file = BASE_DIR / "style.css"

    if not file.exists():
        return web.Response(
            text="style.css پیدا نشد.",
            status=404,
        )

    return web.FileResponse(
        file
    )


async def js_handler(request):
    file = BASE_DIR / "app.js"

    if not file.exists():
        return web.Response(
            text="app.js پیدا نشد.",
            status=404,
        )

    return web.FileResponse(
        file
    )


# =========================================================
# CREATE WEB APP
# =========================================================

def create_app():

    app = web.Application()

    # -----------------------------------------
    # Frontend
    # -----------------------------------------

    app.router.add_get(
        "/",
        index_handler,
    )

    app.router.add_get(
        "/index.html",
        index_handler,
    )

    app.router.add_get(
        "/style.css",
        style_handler,
    )

    app.router.add_get(
        "/app.js",
        js_handler,
    )

    # -----------------------------------------
    # Images
    # -----------------------------------------

    images_dir = BASE_DIR / "images"

    if images_dir.exists():

        app.router.add_static(
            "/images/",
            images_dir,
        )

    # -----------------------------------------
    # Health
    # -----------------------------------------

    app.router.add_get(
        "/health",
        api_health,
    )

    # -----------------------------------------
    # Game API
    # -----------------------------------------

    app.router.add_get(
        "/api/countries",
        api_countries,
    )

    app.router.add_get(
        "/api/player",
        api_player,
    )

    app.router.add_post(
        "/api/select-country",
        api_select_country,
    )

    app.router.add_get(
        "/api/army-units",
        api_army_units,
    )

    app.router.add_post(
        "/api/train-unit",
        api_train_unit,
    )

    app.router.add_post(
        "/api/upgrade-infra",
        api_upgrade_infra,
    )

    app.router.add_post(
        "/api/upgrade-economy",
        api_upgrade_economy,
    )

    # -----------------------------------------
    # Diplomacy
    # -----------------------------------------

    app.router.add_get(
        "/api/diplomacy",
        api_diplomacy,
    )

    app.router.add_post(
        "/api/propose-treaty",
        api_propose_treaty,
    )

    app.router.add_post(
        "/api/accept-treaty",
        api_accept_treaty,
    )

    app.router.add_post(
        "/api/reject-treaty",
        api_reject_treaty,
    )

    # -----------------------------------------
    # War
    # -----------------------------------------

    app.router.add_post(
        "/api/war/declare",
        api_declare_war,
    )

    app.router.add_get(
        "/api/war/status",
        api_war_status,
    )

    app.router.add_get(
        "/api/wars",
        api_wars,
    )

    app.router.add_post(
        "/api/war/admin/approve",
        api_admin_war_approve,
    )

    app.router.add_post(
        "/api/war/admin/reject",
        api_admin_war_reject,
    )

    # -----------------------------------------
    # Communications
    # -----------------------------------------

    app.router.add_get(
        "/api/news",
        api_news,
    )

    app.router.add_get(
        "/api/notifications",
        api_notifications,
    )

    app.router.add_post(
        "/api/notification/read",
        api_notification_read,
    )

    app.router.add_get(
        "/api/statements",
        api_statements,
    )

    app.router.add_post(
        "/api/statements/create",
        api_create_statement,
    )

    app.router.add_post(
        "/api/statements/react",
        api_statement_react,
    )

    app.router.add_post(
        "/api/statements/comment",
        api_statement_comment,
    )

    # -----------------------------------------
    # Union
    # -----------------------------------------

    app.router.add_get(
        "/api/unions",
        api_unions,
    )

    app.router.add_post(
        "/api/unions/create",
        api_create_union,
    )

    app.router.add_post(
        "/api/unions/invite",
        api_union_invite,
    )

    app.router.add_post(
        "/api/unions/respond",
        api_union_respond,
    )

    app.router.add_get(
        "/api/unions/chat",
        api_union_chat,
    )

    app.router.add_post(
        "/api/unions/chat",
        api_union_chat,
    )

    # -----------------------------------------
    # Private Messages
    # -----------------------------------------

    app.router.add_get(
        "/api/messages",
        api_messages,
    )

    app.router.add_post(
        "/api/messages",
        api_messages,
    )

    # -----------------------------------------
    # Market
    # -----------------------------------------

    app.router.add_get(
        "/api/market",
        api_market,
    )

    app.router.add_post(
        "/api/market",
        api_market,
    )

    app.router.add_post(
        "/api/market/execute",
        api_market_execute,
    )

    app.router.add_delete(
        "/api/market/order",
        api_market_delete,
    )

    # -----------------------------------------
    # Strategic Sites
    # -----------------------------------------

    app.router.add_get(
        "/api/strategic-sites",
        api_sites,
    )

    app.router.add_post(
        "/api/strategic-sites/send",
        api_capture_site,
    )

    # -----------------------------------------
    # Ranks
    # -----------------------------------------

    app.router.add_get(
        "/api/ranks",
        api_ranks,
    )

    return app


# =========================================================
# MAIN
# =========================================================

async def main():

    logger.info(
        "======================================"
    )

    logger.info(
        "WW2 Telegram Game starting..."
    )

    logger.info(
        "Host: %s",
        HOST,
    )

    logger.info(
        "Port: %s",
        PORT,
    )

    logger.info(
        "Web App: %s",
        WEB_APP_URL,
    )

    logger.info(
        "Admin ID: %s",
        ADMIN_ID,
    )

    logger.info(
        "======================================"
    )

    app = create_app()

    runner = web.AppRunner(
        app
    )

    await runner.setup()

    site = web.TCPSite(
        runner,
        HOST,
        PORT,
    )

    await site.start()

    logger.info(
        "HTTP server is running on %s:%s",
        HOST,
        PORT,
    )

    # اجرای موتور بازی
    tick_task = asyncio.create_task(
        game_tick()
    )

    try:

        await dp.start_polling(
            bot
        )

    finally:

        tick_task.cancel()

        try:
            await tick_task
        except asyncio.CancelledError:
            pass

        await runner.cleanup()

        await bot.session.close()


# =========================================================
# START
# =========================================================

if __name__ == "__main__":

    try:
        asyncio.run(
            main()
        )

    except KeyboardInterrupt:

        logger.info(
            "Game stopped."
        )
