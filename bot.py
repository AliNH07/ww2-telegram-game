import os, json, hmac, hashlib, uuid, logging, asyncio, random
from datetime import datetime, timezone, timedelta
from urllib.parse import parse_qsl

from aiohttp import web
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.client.default import DefaultBotProperties
from dotenv import load_dotenv

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
WEB_APP_URL = os.getenv("WEB_APP_URL", "https://ww2-telegram-game.onrender.com")
ADMIN_ID = int(os.getenv("ADMIN_ID", "0"))
AUTH_REQUIRED = os.getenv("AUTH_REQUIRED", "0") == "1"

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

COUNTRIES = {
    "germany": {"name": "آلمان", "flag": "🇩🇪"}, "britain": {"name": "بریتانیا", "flag": "🇬🇧"},
    "ussr": {"name": "شوروی", "flag": "☭"}, "usa": {"name": "آمریکا", "flag": "🇺🇸"},
    "france": {"name": "فرانسه", "flag": "🇫🇷"}, "italy": {"name": "ایتالیا", "flag": "🇮🇹"},
    "china": {"name": "چین", "flag": "🇨🇳"}, "japan": {"name": "ژاپن", "flag": "🇯🇵"},
}

STARTING_MONEY = 10_000_000
STARTING_MANPOWER = 50_000
BASE_DAILY_INCOME = 100_000
BASE_MANPOWER_PRODUCTION = 500
GAME_TOTAL_DAYS = 31
DAYS_PER_SEASON = 7
SEASONS = ["بهار", "تابستان", "پاییز", "زمستان"]
STARTING_RESOURCES = {"food": 150_000, "steel": 150_000, "uranium": 150_000, "oil": 150_000}
RESOURCE_NAMES = {"food": "غذا", "steel": "فولاد", "uranium": "اورانیوم", "oil": "نفت"}
GROUP_NAMES = {"land": "زمینی", "naval": "دریایی", "air": "هوایی",
               "power": "برق", "manpower": "نیروی انسانی", "resource": "منابع"}
TREATY_TYPE_NAMES = {"alliance": "پیمان اتحاد", "non_aggression": "پیمان عدم تجاوز"}
ANN_COSTS = {1: 0, 2: 0, 3: 10_000, 4: 400_000}
WAR_PENALTY_ALLIANCE = 2_000_000
NEGOTIATION_HOURS = 24
DEFAULT_COST = 150_000
DEFAULT_TIME = 0

def L(**kw):
    """ساخت یک سطح با هزینهٔ ثابت"""
    kw.setdefault("cost", DEFAULT_COST)
    kw.setdefault("time", DEFAULT_TIME)
    return kw

INFRASTRUCTURE = {
    # ==================== برق ====================
    "power_coal": {
        "name": "نیروگاه زغال‌سنگ", "group": "power", "icon": "⚡",
        "desc": "ارزان‌ترین نیروگاه، اما آلودگی و هزینهٔ نگهداری بیشتری دارد.",
        "levels": [L(cost=250_000, capacity=10), L(cost=550_000, capacity=25), L(cost=1_300_000, capacity=55), L(cost=2_600_000, capacity=100), L(cost=4_800_000, capacity=180)],
    },
    "power_gas": {
        "name": "نیروگاه گازی", "group": "power", "icon": "⚡",
        "desc": "برق بیشتری از زغال‌سنگ تولید می‌کند اما سوخت بیشتری می‌خواهد.",
        "levels": [L(cost=380_000, capacity=15), L(cost=820_000, capacity=35), L(cost=1_900_000, capacity=70), L(cost=3_700_000, capacity=130), L(cost=6_600_000, capacity=230)],
    },
    "power_wind": {
        "name": "نیروگاه بادی", "group": "power", "icon": "⚡",
        "desc": "ارزان‌ترین نیروگاه با کمترین هزینهٔ نگهداری. هر سطح برق بیشتری تولید می‌کند.",
        "levels": [L(cost=200_000, capacity=9), L(cost=460_000, capacity=22), L(cost=1_050_000, capacity=48), L(cost=2_100_000, capacity=95), L(cost=3_800_000, capacity=165)],
    },
    "power_solar": {
        "name": "نیروگاه خورشیدی", "group": "power", "icon": "⚡",
        "desc": "برقی بیشتر از نیروگاه بادی، با قیمتی کمتر از برق‌آبی.",
        "levels": [L(cost=260_000, capacity=12), L(cost=580_000, capacity=28), L(cost=1_300_000, capacity=62), L(cost=2_500_000, capacity=120), L(cost=4_500_000, capacity=210)],
    },
    "power_hydro": {
        "name": "نیروگاه برق‌آبی", "group": "power", "icon": "⚡",
        "desc": "برقی بیشتر از خورشیدی، اما ساختش طولانی‌تر است.",
        "levels": [L(cost=420_000, capacity=18), L(cost=900_000, capacity=40), L(cost=2_000_000, capacity=85), L(cost=3_800_000, capacity=160), L(cost=6_700_000, capacity=280)],
    },
    "power_geothermal": {
        "name": "نیروگاه زمین‌گرمایی", "group": "power", "icon": "⚡",
        "desc": "تولید پایدار در همه فصل‌ها.",
        "levels": [L(cost=520_000, capacity=22), L(cost=1_050_000, capacity=50), L(cost=2_200_000, capacity=105), L(cost=4_000_000, capacity=195), L(cost=6_800_000, capacity=340)],
    },
    "power_nuclear": {
        "name": "نیروگاه هسته‌ای", "group": "power", "icon": "⚡",
        "desc": "پر بازده‌ترین نیروگاه. هزینهٔ نگهداری ندارد اما اورانیوم مصرف می‌کند.",
        "levels": [
            L(cost=1_400_000, capacity=35, resources={"uranium": 5_000}),
            L(cost=3_000_000, capacity=85, resources={"uranium": 12_000}),
            L(cost=6_000_000, capacity=180, resources={"uranium": 25_000}),
            L(cost=10_500_000, capacity=340, resources={"uranium": 50_000}),
            L(cost=17_500_000, capacity=600, resources={"uranium": 90_000}),
        ],
    },

    # ==================== نیروی انسانی ====================
    "manpower_camp": {
        "name": "اردوگاه آموزشی", "group": "manpower", "icon": "👥",
        "desc": "پایگاه آموزش نیرو. هر سطح نیروی بیشتری تربیت می‌کند.",
        "levels": [L(cost=220_000, production=200), L(cost=480_000, production=500), L(cost=1_050_000, production=1200), L(cost=2_000_000, production=2500), L(cost=3_600_000, production=5000)],
    },
    "manpower_barracks_training": {
        "name": "پادگان آموزشی", "group": "manpower", "icon": "👥",
        "desc": "پادگان تخصصی آموزش سرباز.",
        "levels": [L(cost=300_000, production=300), L(cost=650_000, production=700), L(cost=1_400_000, production=1600), L(cost=2_700_000, production=3400), L(cost=4_900_000, production=6800)],
    },
    "manpower_volunteer": {
        "name": "پایگاه داوطلبان", "group": "manpower", "icon": "👥",
        "desc": "داوطلبان داوطلبانه ثبت‌نام می‌کنند.",
        "levels": [L(cost=180_000, production=240), L(cost=430_000, production=560), L(cost=1_050_000, production=1300), L(cost=2_300_000, production=2800), L(cost=4_600_000, production=5500)],
    },
    "manpower_medical": {
        "name": "مرکز پزشکی", "group": "manpower", "icon": "👥",
        "desc": "سلامت سربازان را تأمین می‌کند و تولید نیرو را بالا می‌برد.",
        "levels": [L(cost=260_000, production=260), L(cost=560_000, production=620), L(cost=1_250_000, production=1400), L(cost=2_500_000, production=3000), L(cost=4_700_000, production=6000)],
    },
    "manpower_mobilization": {
        "name": "مرکز بسیج", "group": "manpower", "icon": "👥",
        "desc": "در زمان جنگ نیروهای بیشتری جذب می‌کند.",
        "levels": [L(cost=340_000, production=380), L(cost=720_000, production=900), L(cost=1_500_000, production=2000), L(cost=2_900_000, production=4200), L(cost=5_300_000, production=8500)],
    },
    "manpower_academy": {
        "name": "آکادمی نظامی", "group": "manpower", "icon": "👥",
        "desc": "افسران کارآزموده پرورش می‌دهد.",
        "levels": [L(cost=430_000, production=450), L(cost=900_000, production=1100), L(cost=1_800_000, production=2400), L(cost=3_400_000, production=5000), L(cost=6_000_000, production=10000)],
    },

    # ==================== غذا ====================
    "resource_farm": {
        "name": "مجتمع کشاورزی", "group": "resource", "resource_key": "food", "icon": "🌾",
        "desc": "غذا تولید می‌کند. از کشاورزی ارزان‌تر است و سریع‌تر ساخته می‌شود.",
        "levels": [L(cost=150_000, production=50_000), L(cost=350_000, production=130_000), L(cost=800_000, production=300_000), L(cost=1_600_000, production=700_000), L(cost=3_000_000, production=1_500_000)],
    },

    # ==================== منابع ====================
    "resource_oil_well": {
        "name": "چاه نفت", "group": "resource", "resource_key": "oil", "icon": "🛢️",
        "desc": "نفت خام استخراج می‌کند. برای پالایشگاه و ارتش ضروری است.",
        "levels": [L(cost=220_000, production=50_000), L(cost=500_000, production=130_000), L(cost=1_100_000, production=300_000), L(cost=2_200_000, production=700_000), L(cost=4_200_000, production=1_500_000)],
    },
    "resource_steel_mill": {
        "name": "کارخانه فولاد", "group": "resource", "resource_key": "steel", "icon": "⚙️",
        "desc": "فولاد تولید می‌کند. پایهٔ صنعت و ساخت تانک است.",
        "levels": [L(cost=240_000, production=50_000), L(cost=540_000, production=130_000), L(cost=1_200_000, production=300_000), L(cost=2_400_000, production=700_000), L(cost=4_500_000, production=1_500_000)],
    },
    "resource_uranium_mine": {
        "name": "معدن اورانیوم", "group": "resource", "resource_key": "uranium", "icon": "☢️",
        "desc": "اورانیوم استخراج می‌کند. تنها نیروگاه هسته‌ای مصرفش می‌کند.",
        "levels": [L(cost=380_000, production=50_000), L(cost=850_000, production=130_000), L(cost=1_900_000, production=300_000), L(cost=3_700_000, production=700_000), L(cost=7_000_000, production=1_500_000)],
    },

    # ==================== نظامی ====================
    "land_barracks": {
        "name": "پادگان", "group": "land", "icon": "🪖",
        "desc": "محل استقرار پیاده‌نظام. هر سطح ظرفیت را ۱۰۰۰ نفر بیشتر می‌کند.",
        "levels": [L(cost=200_000, capacity=1000), L(cost=450_000, capacity=2000), L(cost=950_000, capacity=3000), L(cost=1_800_000, capacity=4000), L(cost=3_200_000, capacity=5000)],
    },
    "land_hq": {
        "name": "ستاد فرماندهی", "group": "land", "icon": "🪖",
        "desc": "پیاده‌نظام اینجا تولید می‌شود. هر سطح ۱۰٪ به دفاع کشور در برابر حملات مستقیم اضافه می‌کند.",
        "levels": [L(cost=500_000, capacity=3), L(cost=1_100_000, capacity=8), L(cost=2_300_000, capacity=18), L(cost=4_300_000, capacity=35), L(cost=7_500_000, capacity=60)],
    },
    "land_tank_factory": {
        "name": "کارخانه تانک", "group": "land", "icon": "🪖",
        "desc": "تانک و لانچر تولید می‌کند. هر سطح تولید را سریع‌تر و دفاع تانک‌ها را قوی‌تر می‌کند.",
        "levels": [L(cost=600_000, capacity=3), L(cost=1_300_000, capacity=8), L(cost=2_800_000, capacity=16), L(cost=5_200_000, capacity=30), L(cost=9_000_000, capacity=55)],
    },
    "naval_port": {
        "name": "بندر", "group": "naval", "icon": "⚓",
        "desc": "محل پهلو گرفتن ناوگان. هر سطح ظرفیت بندر را بیشتر می‌کند.",
        "levels": [L(cost=550_000, capacity=3), L(cost=1_200_000, capacity=8), L(cost=2_600_000, capacity=18), L(cost=4_800_000, capacity=30), L(cost=8_500_000, capacity=55)],
    },
    "naval_shipyard": {
        "name": "کارخانه کشتی‌سازی", "group": "naval", "icon": "⚓",
        "desc": "زیردریایی، ناوشکن، ناو ترابری و ناو هواپیمابر تولید می‌کند.",
        "levels": [L(cost=900_000, capacity=2), L(cost=1_900_000, capacity=6), L(cost=4_000_000, capacity=14), L(cost=7_300_000, capacity=25), L(cost=12_500_000, capacity=45)],
    },
    "air_airport": {
        "name": "فرودگاه نظامی", "group": "air", "icon": "✈️",
        "desc": "محل استقرار جنگنده، بمب‌افکن، بالگرد و هواپیمای سوخت‌رسان.",
        "levels": [L(cost=650_000, capacity=3), L(cost=1_400_000, capacity=8), L(cost=2_900_000, capacity=18), L(cost=5_400_000, capacity=30), L(cost=9_300_000, capacity=55)],
    },
    "air_arsenal": {
        "name": "کارخانه ادوات هوایی", "group": "air", "icon": "✈️",
        "desc": "جنگنده، بمب‌افکن و بالگرد تولید می‌کند. هر سطح تولید را سریع‌تر می‌کند.",
        "levels": [L(cost=950_000, capacity=2), L(cost=2_000_000, capacity=6), L(cost=4_200_000, capacity=14), L(cost=7_600_000, capacity=25), L(cost=13_000_000, capacity=45)],
    },
}

ECONOMY = {
    "eco_agriculture": {
        "name": "کشاورزی و دامداری", "group": "eco", "icon": "🌾",
        "desc": "پایهٔ اقتصاد. غذای اضافی می‌فروشد و درآمد می‌دهد.",
        "power_required": 5,
        "levels": [L(cost=90_000, income=30_000), L(cost=220_000, income=80_000), L(cost=500_000, income=190_000), L(cost=1_050_000, income=420_000), L(cost=2_100_000, income=850_000)],
    },
    "eco_textile": {
        "name": "کارخانه نساجی", "group": "eco", "icon": "🧵",
        "desc": "پوشاک و منسوجات تولید می‌کند.",
        "power_required": 8,
        "levels": [L(cost=160_000, income=45_000), L(cost=400_000, income=115_000), L(cost=920_000, income=270_000), L(cost=1_950_000, income=600_000), L(cost=3_900_000, income=1_200_000)],
    },
    "eco_mining": {
        "name": "معدن‌کاری", "group": "eco", "icon": "⛏️",
        "desc": "مواد معدنی استخراج و صادر می‌کند.",
        "power_required": 12,
        "levels": [L(cost=280_000, income=70_000), L(cost=700_000, income=180_000), L(cost=1_600_000, income=420_000), L(cost=3_400_000, income=920_000), L(cost=6_800_000, income=1_850_000)],
    },
    "eco_steel": {
        "name": "کارخانه فولاد", "group": "eco", "icon": "⚙️",
        "desc": "فولاد را به محصولات صنعتی تبدیل می‌کند.",
        "power_required": 18,
        "levels": [L(cost=420_000, income=100_000), L(cost=1_050_000, income=260_000), L(cost=2_400_000, income=600_000), L(cost=5_100_000, income=1_300_000), L(cost=10_200_000, income=2_600_000)],
    },
    "eco_trade": {
        "name": "تجارت بین‌الملل", "group": "eco", "icon": "🚢",
        "desc": "شبکهٔ تجاری کشور را گسترش می‌دهد.",
        "power_required": 20,
        "levels": [L(cost=700_000, income=130_000), L(cost=1_750_000, income=330_000), L(cost=4_000_000, income=760_000), L(cost=8_400_000, income=1_600_000), L(cost=16_800_000, income=3_200_000)],
    },
    "eco_oil": {
        "name": "پالایشگاه نفت", "group": "eco", "icon": "🛢️",
        "desc": "نفت خام را پالایش و صادر می‌کند.",
        "power_required": 25,
        "levels": [L(cost=800_000, income=140_000), L(cost=2_000_000, income=360_000), L(cost=4_500_000, income=820_000), L(cost=9_500_000, income=1_750_000), L(cost=19_000_000, income=3_500_000)],
    },
    "eco_bank": {
        "name": "بانک مرکزی", "group": "eco", "icon": "🏦",
        "desc": "سیستم مالی کشور را مدیریت می‌کند.",
        "power_required": 30,
        "levels": [L(cost=1_600_000, income=180_000), L(cost=4_000_000, income=460_000), L(cost=9_200_000, income=1_050_000), L(cost=19_500_000, income=2_200_000), L(cost=39_000_000, income=4_400_000)],
    },
}

ARMY_UNITS = {
    "infantry": {"name": "پیاده‌نظام", "group": "land", "requires": "land_barracks",
        "cost": 50_000, "manpower": 300, "resources": {"food": 100},
        "attack": 20, "defense": 10},
    "tank": {"name": "تانک", "group": "land", "requires": "land_tank_factory",
        "cost": 150_000, "manpower": 250, "resources": {"steel": 300, "food": 150},
        "attack": 50, "defense": 25},
    "ship": {"name": "ناو دریایی", "group": "naval", "requires": "naval_port",
        "cost": 250_000, "manpower": 200, "resources": {"oil": 250, "food": 150},
        "attack": 50, "defense": 60},
    "submarine": {"name": "زیردریایی", "group": "naval", "requires": "naval_shipyard",
        "cost": 200_000, "manpower": 120, "resources": {"oil": 200, "steel": 150},
        "attack": 45, "defense": 25},
    "fighter": {"name": "جنگنده", "group": "air", "requires": "air_airport",
        "cost": 200_000, "manpower": 150, "resources": {"oil": 200, "steel": 100},
        "attack": 45, "defense": 40},
    "bomber": {"name": "بمب‌افکن", "group": "air", "requires": "air_arsenal",
        "cost": 250_000, "manpower": 180, "resources": {"oil": 300, "steel": 150},
        "attack": 60, "defense": 15},
}

MAP_RESOURCES = {
    "oil_gulf": {"type": "oil", "name": "سکوی نفتی خلیج فارس", "lon": 51.5, "lat": 27.0, "production": 5_000_000},
    "oil_caspian": {"type": "oil", "name": "سکوی نفتی خزر", "lon": 51.0, "lat": 41.5, "production": 3_000_000},
    "oil_northsea": {"type": "oil", "name": "سکوی نفتی دریای شمال", "lon": 2.0, "lat": 56.5, "production": 4_000_000},
    "oil_texas": {"type": "oil", "name": "میدان نفتی تگزاس", "lon": -100.0, "lat": 31.0, "production": 4_000_000},
    "steel_ural": {"type": "steel", "name": "معدن فولاد اورال", "lon": 60.0, "lat": 58.0, "production": 3_000_000},
    "steel_ruhr": {"type": "steel", "name": "معدن فولاد رور", "lon": 7.0, "lat": 51.4, "production": 4_000_000},
    "steel_brazil": {"type": "steel", "name": "معدن فولاد برزیل", "lon": -50.0, "lat": -15.0, "production": 3_500_000},
    "uranium_kazakh": {"type": "uranium", "name": "معدن اورانیوم قزاقستان", "lon": 68.0, "lat": 48.0, "production": 2_500_000},
    "uranium_canada": {"type": "uranium", "name": "معدن اورانیوم کانادا", "lon": -105.0, "lat": 58.0, "production": 2_000_000},
    "uranium_aussie": {"type": "uranium", "name": "معدن اورانیوم استرالیا", "lon": 134.0, "lat": -25.0, "production": 2_200_000},
    "food_ukraine": {"type": "food", "name": "دشت‌های کشاورزی اوکراین", "lon": 32.0, "lat": 49.0, "production": 2_500_000},
    "food_india": {"type": "food", "name": "دشت‌های هند", "lon": 78.0, "lat": 22.0, "production": 2_500_000},
}

STRAITS_DATA = {
    "gibraltar": {"name": "تنگه جبل‌الطارق", "lon": -5.6, "lat": 35.9, "income": 20_000},
    "bosporus": {"name": "تنگه بسفر", "lon": 29.0, "lat": 41.1, "income": 20_000},
    "hormuz": {"name": "تنگه هرمز", "lon": 56.3, "lat": 26.6, "income": 20_000},
    "babmandeb": {"name": "تنگه باب‌المندب", "lon": 43.3, "lat": 12.6, "income": 20_000},
    "suez": {"name": "کانال سوئز", "lon": 32.3, "lat": 30.6, "income": 20_000},
    "dover": {"name": "تنگه دوور", "lon": 1.4, "lat": 50.9, "income": 20_000},
    "panama": {"name": "کانال پاناما", "lon": -79.6, "lat": 9.1, "income": 20_000},
    "malacca": {"name": "تنگه مالاکا", "lon": 103.8, "lat": 1.3, "income": 20_000},
    "taiwan": {"name": "تنگه تایوان", "lon": 121.0, "lat": 24.0, "income": 20_000},
    "korea": {"name": "تنگه کره", "lon": 129.9, "lat": 34.0, "income": 20_000},
}

def utcnow(): return datetime.now(timezone.utc)

def parse_dt(s):
    if not s: return None
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except: return None

def _is_expired(t, now=None):
    """آیا پیمان منقضی شده است؟"""
    now = now or utcnow()
    exp = parse_dt(t.get("expires_at"))
    return exp is not None and now >= exp

def get_game_time(player):
    started_at = player.get("started_at")
    if not started_at:
        return {"day": 1, "season": SEASONS[0], "season_days_left": DAYS_PER_SEASON,
                "season_hours_left": 0, "next_season": SEASONS[1]}
    started = parse_dt(started_at); now = utcnow()
    elapsed_days = max(0, (now - started).total_seconds() / 86400)
    day = min(GAME_TOTAL_DAYS, int(elapsed_days) + 1)
    # آخرین فصل تا پایان بازی ادامه دارد؛ در روز ۲۹-۳۱ دیگه به بهار برنمی‌گردیم
    si = min(len(SEASONS) - 1, (day - 1) // DAYS_PER_SEASON)
    if si == len(SEASONS) - 1:
        season_end = started + timedelta(days=GAME_TOTAL_DAYS)
    else:
        season_end = started + timedelta(days=(si + 1) * DAYS_PER_SEASON)
    remaining = season_end - now
    if remaining.total_seconds() < 0: remaining = timedelta(0)
    return {"day": day, "season": SEASONS[si], "season_days_left": remaining.days,
            "season_hours_left": remaining.seconds // 3600,
            "next_season": SEASONS[si + 1] if si < len(SEASONS) - 1 else SEASONS[si]}

def get_infra_level(player, item_id):
    return player.get("infra_levels", {}).get(item_id, 0)

def get_item_info(catalog, item_id, level):
    if level <= 0: return None
    levels = catalog[item_id]["levels"]
    return levels[min(level, len(levels)) - 1]

def get_power_total(player):
    total = 0
    for item_id, item in INFRASTRUCTURE.items():
        if item.get("group") != "power": continue
        lv = get_infra_level(player, item_id)
        if lv > 0: total += item["levels"][lv - 1]["capacity"]
    return total

def get_power_used(player):
    total = 0
    for item_id, item in ECONOMY.items():
        lv = get_infra_level(player, item_id)
        if lv > 0: total += item["power_required"] * lv
    return total

def get_group_capacity(player, group):
    total = 0
    for item_id, item in INFRASTRUCTURE.items():
        if item.get("group") != group: continue
        lv = get_infra_level(player, item_id)
        if lv > 0: total += item["levels"][lv - 1]["capacity"]
    return total

def get_group_units(player, group):
    total = 0
    for unit_id, unit in ARMY_UNITS.items():
        if unit["group"] == group:
            total += player.get("units", {}).get(unit_id, 0)
    return total

def recompute_army(player):
    total = 0
    for unit_id, unit in ARMY_UNITS.items():
        total += player.get("units", {}).get(unit_id, 0) * (unit["attack"] + unit["defense"])
    player["army"] = total

def ensure_player_fields(player):
    player.setdefault("resources", dict(STARTING_RESOURCES))
    for k in RESOURCE_NAMES: player["resources"].setdefault(k, 0)
    units = player.setdefault("units", {})
    for uid_ in ARMY_UNITS: units.setdefault(uid_, 0)
    for stale in [k for k in units if k not in ARMY_UNITS]: del units[stale]
    player.setdefault("infra_levels", {})
    player.setdefault("map_holdings", {})
    player.setdefault("strait_holdings", {})
    player.setdefault("announcements", {})
    player.setdefault("is_eliminated", False)

def compute_rates(player):
    power_capacity = get_power_total(player)
    power_consumption = get_power_used(player)
    manpower_production = BASE_MANPOWER_PRODUCTION
    resource_production = {k: 0 for k in RESOURCE_NAMES}
    resource_consumption = {k: 0 for k in RESOURCE_NAMES}
    income = BASE_DAILY_INCOME

    for item_id, item in INFRASTRUCTURE.items():
        group = item.get("group")
        lv = get_infra_level(player, item_id)
        if lv <= 0: continue
        lvl = item["levels"][lv - 1]
        if group == "manpower": manpower_production += lvl["production"]
        elif group == "resource":
            key = item.get("resource_key")
            if key: resource_production[key] += lvl["production"]

    for item_id, item in ECONOMY.items():
        lv = get_infra_level(player, item_id)
        if lv > 0: income += item["levels"][lv - 1]["income"]

    country = player.get("country")
    for key, owner in player.get("map_holdings", {}).items():
        if owner == country:
            res = MAP_RESOURCES.get(key)
            if res:
                if res["type"] == "oil":
                    income += res["production"] // 10
                    resource_production["oil"] += res["production"] // 5
                elif res["type"] == "food": resource_production["food"] += res["production"] // 5
                elif res["type"] == "steel": resource_production["steel"] += res["production"] // 5
                elif res["type"] == "uranium": resource_production["uranium"] += res["production"] // 5

    for key, owner in player.get("strait_holdings", {}).items():
        if owner == country:
            s = STRAITS_DATA.get(key)
            if s: income += s["income"]

    for target_country, occupier in occupied_countries.items():
        if occupier == country:
            income += 500_000

    return {"gross_income": income, "net_income": income,
            "power_capacity": power_capacity, "power_consumption": power_consumption,
            "manpower_production": manpower_production,
            "resource_production": resource_production,
            "resource_consumption": resource_consumption}

def accrue_player(player):
    if not player.get("started_at") or player.get("is_eliminated"): return
    now = utcnow()
    last = parse_dt(player.get("last_update")) or parse_dt(player["started_at"])
    if not last: return
    elapsed = max(0, (now - last).total_seconds())
    rates = compute_rates(player)
    f = elapsed / 86400
    player["money"] = player.get("money", STARTING_MONEY) + rates["net_income"] * f
    player["manpower"] = player.get("manpower", STARTING_MANPOWER) + rates["manpower_production"] * f
    ensure_player_fields(player)
    for key, amount in rates["resource_production"].items():
        player["resources"][key] = player["resources"].get(key, 0) + amount * f
    player["last_update"] = now.isoformat()

def build_catalog_status(player, catalog):
    result = {}
    for item_id, item in catalog.items():
        lv = get_infra_level(player, item_id)
        current = get_item_info(catalog, item_id, lv)
        levels = item["levels"]
        nxt = lv + 1
        next_info = levels[nxt - 1] if nxt <= len(levels) else None
        result[item_id] = {
            "name": item["name"], "group": item.get("group"),
            "icon": item.get("icon", ""),
            "desc": item.get("desc", ""),
            "resource_key": item.get("resource_key"),
            "power_required": item.get("power_required"),
            "level": lv, "max_level": len(levels),
            "current": current, "next": next_info,
        }
    return result

def serialize_player(player):
    ensure_player_fields(player); accrue_player(player); recompute_army(player)
    rates = compute_rates(player)
    data = dict(player); data.update(get_game_time(player))
    data["resource_production"] = rates["resource_production"]
    data["resource_consumption"] = rates["resource_consumption"]
    data["power_capacity"] = rates["power_capacity"]
    data["power_consumption"] = rates["power_consumption"]
    data["manpower_production"] = rates["manpower_production"]
    data["daily_income"] = rates["net_income"]
    data["infra"] = build_catalog_status(player, INFRASTRUCTURE)
    data["economy"] = build_catalog_status(player, ECONOMY)
    return data

# =========================================================
# State — حالت توسعه: هیچ ذخیره‌سازی روی دیسک انجام نمی‌شود
# با هر ری‌استارت، بازی از صفر شروع می‌شود.
# =========================================================
players = {}
diplomacy_proposals = {}
active_treaties = []
map_holdings = {}
strait_holdings = {}
occupied_countries = {}
war_declarations = {}
active_wars = {}
war_reports = []
announcements = []
unions = {}
private_messages = {}
market_listings = {}
news_feed = []

def save_state():
    """در حالت توسعه، ذخیره‌سازی غیرفعال است."""
    return

def load_state():
    """در حالت توسعه، بارگذاری غیرفعال است."""
    return

def create_player(user_id):
    return {"user_id": user_id, "country": None, "money": STARTING_MONEY, "army": 0,
            "manpower": STARTING_MANPOWER, "infra_levels": {},
            "units": {uid_: 0 for uid_ in ARMY_UNITS}, "resources": dict(STARTING_RESOURCES),
            "map_holdings": {}, "strait_holdings": {}, "announcements": {},
            "is_eliminated": False, "started_at": None, "last_update": None}

def get_player_by_country(country_id):
    for uid_, p in players.items():
        if p.get("country") == country_id: return uid_, p
    return None, None

def push_news(title, text, kind="info"):
    news_feed.append({"id": str(uuid.uuid4()), "title": title, "text": text,
                      "kind": kind, "at": utcnow().isoformat()})
    if len(news_feed) > 200: del news_feed[:50]

def cleanup_expired_data():
    """پاک‌سازی دوره‌ای داده‌های منقضی/مصرف‌شده برای جلوگیری از رشد حافظه."""
    global active_treaties
    now = utcnow()
    # پیمان‌های منقضی
    active_treaties[:] = [t for t in active_treaties if not _is_expired(t, now)]
    # سفارش‌های بسته‌شده بازار
    for lid in [k for k, v in market_listings.items() if v.get("status") != "open"]:
        del market_listings[lid]
    # جنگ‌های حل‌شده
    for wid in [k for k, v in war_declarations.items() if v.get("status") in ("resolved", "rejected")]:
        del war_declarations[wid]
    for wid in [k for k, v in active_wars.items() if v.get("resolved")]:
        del active_wars[wid]
    # چرخش لیست‌های بلند
    if len(war_reports) > 100: del war_reports[:50]
    if len(news_feed) > 200: del news_feed[:50]
    if len(announcements) > 100: del announcements[:50]

# =========================================================
# Auth
# =========================================================
def verify_init_data(init_data: str):
    if not init_data: return None
    try:
        parsed = dict(parse_qsl(init_data, keep_blank_values=True))
        rh = parsed.pop("hash", None)
        if not rh: return None
        dcs = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
        secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        computed = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(computed, rh): return None
        u = parsed.get("user")
        if u: return json.loads(u)
        return None
    except Exception as e:
        logging.error("verify_init_data: %s", e); return None

def get_auth_user_id(request):
    init_data = request.headers.get("X-Telegram-Init-Data") or request.query.get("init_data")
    if init_data:
        user = verify_init_data(init_data)
        if user and user.get("id"):
            return int(user["id"])
    if not AUTH_REQUIRED:
        uid = request.query.get("user_id")
        if uid:
            try: return int(uid)
            except: return None
    return None

async def read_json(request):
    try: return await request.json()
    except: return {}

@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS": response = web.Response()
    else:
        try: response = await handler(request)
        except web.HTTPException as ex: response = ex
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Telegram-Init-Data"
    response.headers["Access-Control-Max-Age"] = "3600"
    return response

# =========================================================
# Bot
# =========================================================
bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=None))
dp = Dispatcher()

@dp.message(Command("start"))
async def start_command(message: types.Message):
    user_id = message.from_user.id
    if user_id not in players:
        players[user_id] = create_player(user_id); save_state()
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🌍 ورود به بازی", web_app=WebAppInfo(url=WEB_APP_URL))]])
    if players[user_id]["country"]:
        c = COUNTRIES[players[user_id]["country"]]
        text = f"⚔️ کشور شما: {c['flag']} {c['name']}\n\nبرای ورود روی دکمه بزنید."
    else:
        text = "⚔️ به جنگ جهانی دوم خوش آمدید.\nابتدا کشور خود را انتخاب کنید."
    await message.answer(text, reply_markup=kb)

async def notify_admin(text, keyboard=None):
    if ADMIN_ID:
        try: await bot.send_message(ADMIN_ID, text, reply_markup=keyboard)
        except Exception as e: logging.warning("admin notify: %s", e)

@dp.callback_query(F.data.startswith("treaty:"))
async def treaty_cb(cb: types.CallbackQuery):
    _, action, pid = cb.data.split(":")
    p = diplomacy_proposals.get(pid)
    if not p or p["status"] != "pending": await cb.answer("منقضی"); return
    if cb.from_user.id != p["to_user"]: await cb.answer("برای شما نیست."); return
    tn = TREATY_TYPE_NAMES[p["treaty_type"]]
    if action == "accept":
        p["status"] = "accepted"
        active_treaties.append({"id": str(uuid.uuid4()), "country_a": p["from_country"],
            "country_b": p["to_country"], "treaty_type": p["treaty_type"],
            "expires_at": (utcnow() + timedelta(days=p["duration_days"])).isoformat()})
        await cb.message.edit_text(f"✅ {tn} پذیرفته شد.")
        push_news("پیمان جدید", f"{COUNTRIES[p['from_country']]['name']} و {COUNTRIES[p['to_country']]['name']} {tn} بستند.")
    else:
        p["status"] = "rejected"; await cb.message.edit_text(f"❌ {tn} رد شد.")
    save_state(); await cb.answer()

@dp.callback_query(F.data.startswith("war:"))
async def war_cb(cb: types.CallbackQuery):
    _, action, wid = cb.data.split(":")
    if cb.from_user.id != ADMIN_ID: await cb.answer("دسترسی ندارید."); return
    w = war_declarations.get(wid)
    if not w or w["status"] != "pending_admin": await cb.answer("منقضی"); return
    if action == "approve":
        w["status"] = "negotiation"
        w["negotiation_ends"] = (utcnow() + timedelta(hours=NEGOTIATION_HOURS)).isoformat()
        await cb.message.edit_text("✅ تأیید شد. ۲۴ ساعت مذاکره آغاز شد.")
        push_news("اعلام جنگ", f"{COUNTRIES[w['attacker']]['name']} به {COUNTRIES[w['defender']]['name']} اعلام جنگ کرد.")
    else:
        w["status"] = "rejected"; await cb.message.edit_text("❌ رد شد.")
    save_state(); await cb.answer()

# =========================================================
# API Player / Countries
# =========================================================
async def get_player(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    if uid not in players: players[uid] = create_player(uid); save_state()
    return web.json_response(serialize_player(players[uid]))

async def get_countries(request):
    result = []
    for cid, c in COUNTRIES.items():
        oid, _ = get_player_by_country(cid)
        result.append({"id": cid, "name": c["name"], "flag": c["flag"],
                       "taken": oid is not None, "occupier": occupied_countries.get(cid)})
    return web.json_response(result)

async def select_country(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); cid = data.get("country")
    if cid not in COUNTRIES:
        return web.json_response({"success": False, "error": "invalid_country"}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    if p["country"]:
        if p["country"] == cid: return web.json_response({"success": True, "player": serialize_player(p)})
        return web.json_response({"success": False, "error": "already_has_country"}, status=409)
    if cid in occupied_countries:
        return web.json_response({"success": False, "error": "occupied",
                                  "message": "این کشور اشغال شده است."}, status=409)
    oid, _ = get_player_by_country(cid)
    if oid is not None and oid != uid:
        return web.json_response({"success": False, "error": "country_taken"}, status=409)
    p["country"] = cid
    if not p.get("started_at"):
        now = utcnow().isoformat(); p["started_at"] = now; p["last_update"] = now
    save_state()
    return web.json_response({"success": True, "player": serialize_player(p)})

# =========================================================
# API Infra / Economy / Army
# =========================================================
async def upgrade_infra(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); item_id = data.get("category")
    if item_id not in INFRASTRUCTURE:
        return web.json_response({"success": False, "error": "invalid_category"}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    if not p.get("country") or p.get("is_eliminated"):
        return web.json_response({"success": False, "error": "invalid_state"}, status=400)
    accrue_player(p)
    item = INFRASTRUCTURE[item_id]; lv = get_infra_level(p, item_id); levels = item["levels"]
    if lv >= len(levels):
        return web.json_response({"success": False, "error": "max_level"}, status=400)
    cost = levels[lv]["cost"]; res_cost = levels[lv].get("resources", {})
    if p.get("money", 0) < cost:
        return web.json_response({"success": False, "error": "not_enough_money",
                                  "message": "پول کافی ندارید."}, status=400)
    ensure_player_fields(p)
    for k, a in res_cost.items():
        if p["resources"].get(k, 0) < a:
            return web.json_response({"success": False, "error": "not_enough_resource",
                                      "message": f"{RESOURCE_NAMES[k]} کافی ندارید."}, status=400)
    p["money"] -= cost
    for k, a in res_cost.items(): p["resources"][k] -= a
    p["infra_levels"][item_id] = lv + 1
    save_state()
    return web.json_response({"success": True, "player": serialize_player(p)})

async def upgrade_economy(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); item_id = data.get("category")
    if item_id not in ECONOMY:
        return web.json_response({"success": False, "error": "invalid_category"}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    if not p.get("country") or p.get("is_eliminated"):
        return web.json_response({"success": False, "error": "invalid_state"}, status=400)
    accrue_player(p)
    item = ECONOMY[item_id]; lv = get_infra_level(p, item_id); levels = item["levels"]
    if lv >= len(levels):
        return web.json_response({"success": False, "error": "max_level"}, status=400)
    cost = levels[lv]["cost"]
    if p.get("money", 0) < cost:
        return web.json_response({"success": False, "error": "not_enough_money"}, status=400)
    req_power = item["power_required"]
    if get_power_total(p) < get_power_used(p) + req_power:
        return web.json_response({"success": False, "error": "not_enough_power",
                                  "message": "برق کافی ندارید. ابتدا نیروگاه بسازید."}, status=400)
    p["money"] -= cost; p["infra_levels"][item_id] = lv + 1
    save_state()
    return web.json_response({"success": True, "player": serialize_player(p)})

async def train_unit(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); unit_id = data.get("unit_id")
    try: count = int(data.get("count", 1))
    except: count = 1
    count = max(1, min(count, 50))
    if unit_id not in ARMY_UNITS:
        return web.json_response({"success": False, "error": "invalid_unit"}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    if not p.get("country") or p.get("is_eliminated"):
        return web.json_response({"success": False, "error": "invalid_state"}, status=400)
    ensure_player_fields(p); accrue_player(p)
    unit = ARMY_UNITS[unit_id]; group = unit["group"]; req = unit["requires"]
    if get_infra_level(p, req) <= 0:
        return web.json_response({"success": False, "error": "no_infra",
                                  "message": f"ابتدا «{INFRASTRUCTURE[req]['name']}» را بسازید."}, status=400)
    cap = get_group_capacity(p, group); used = get_group_units(p, group)
    if used >= cap:
        return web.json_response({"success": False, "error": "capacity_full",
                                  "message": f"ظرفیت {GROUP_NAMES[group]} پر است."}, status=400)
    count = min(count, cap - used)
    total_cost = unit["cost"] * count; total_mp = unit["manpower"] * count
    if p.get("money", 0) < total_cost:
        return web.json_response({"success": False, "error": "not_enough_money"}, status=400)
    if p.get("manpower", 0) < total_mp:
        return web.json_response({"success": False, "error": "not_enough_manpower"}, status=400)
    for k, a in unit["resources"].items():
        if p["resources"].get(k, 0) < a * count:
            return web.json_response({"success": False, "error": "not_enough_resource",
                                      "message": f"{RESOURCE_NAMES[k]} کافی ندارید."}, status=400)
    p["money"] -= total_cost; p["manpower"] -= total_mp
    for k, a in unit["resources"].items(): p["resources"][k] -= a * count
    p["units"][unit_id] = p["units"].get(unit_id, 0) + count
    recompute_army(p); save_state()
    return web.json_response({"success": True, "player": serialize_player(p)})

async def get_army_units(request):
    return web.json_response({"units": ARMY_UNITS, "resources": RESOURCE_NAMES, "groups": GROUP_NAMES})

# =========================================================
# API Diplomacy
# =========================================================
async def propose_treaty(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request)
    target = data.get("target"); ttype = data.get("type")
    try: dur = int(data.get("duration_days", 10))
    except: dur = 10
    dur = max(1, min(dur, 30))
    if target not in COUNTRIES or ttype not in TREATY_TYPE_NAMES:
        return web.json_response({"success": False, "error": "invalid"}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]; fc = p.get("country")
    if not fc: return web.json_response({"success": False, "error": "no_country"}, status=400)
    if target == fc: return web.json_response({"success": False, "error": "self"}, status=400)
    tuid, _ = get_player_by_country(target)
    if tuid is None:
        return web.json_response({"success": False, "error": "unowned"}, status=400)
    pid = str(uuid.uuid4())
    diplomacy_proposals[pid] = {"id": pid, "from_user": uid, "from_country": fc,
        "to_user": tuid, "to_country": target, "treaty_type": ttype,
        "duration_days": dur, "status": "pending", "created_at": utcnow().isoformat()}
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ قبول", callback_data=f"treaty:accept:{pid}"),
        InlineKeyboardButton(text="❌ رد", callback_data=f"treaty:reject:{pid}")]])
    try:
        await bot.send_message(tuid,
            f"📜 پیشنهاد {TREATY_TYPE_NAMES[ttype]}\nاز {COUNTRIES[fc]['name']} به مدت {dur} روز",
            reply_markup=kb)
    except Exception as e: logging.warning("treaty msg: %s", e)
    save_state()
    return web.json_response({"success": True, "message": "پیشنهاد ثبت شد."})

async def get_diplomacy(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]; accrue_player(p)
    cid = p.get("country")
    sent = [x for x in diplomacy_proposals.values() if x["from_user"] == uid and x["status"] == "pending"]
    recv = [x for x in diplomacy_proposals.values() if x["to_user"] == uid and x["status"] == "pending"]
    # فقط پیمان‌های فعال (منقضی‌نشده) را برگردان
    tr = [t for t in active_treaties
          if cid and (t["country_a"] == cid or t["country_b"] == cid) and not _is_expired(t)]
    return web.json_response({"sent": sent, "received": recv, "treaties": tr})

async def respond_treaty(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); pid = data.get("proposal_id"); accept = bool(data.get("accept"))
    p = diplomacy_proposals.get(pid)
    if not p or p["status"] != "pending":
        return web.json_response({"success": False, "error": "invalid"}, status=400)
    if p["to_user"] != uid:
        return web.json_response({"success": False, "error": "not_yours"}, status=403)
    if accept:
        p["status"] = "accepted"
        active_treaties.append({"id": str(uuid.uuid4()), "country_a": p["from_country"],
            "country_b": p["to_country"], "treaty_type": p["treaty_type"],
            "expires_at": (utcnow() + timedelta(days=p["duration_days"])).isoformat()})
        push_news("پیمان جدید",
            f"{COUNTRIES[p['from_country']]['name']} و {COUNTRIES[p['to_country']]['name']} {TREATY_TYPE_NAMES[p['treaty_type']]} بستند.")
    else: p["status"] = "rejected"
    save_state()
    return web.json_response({"success": True})

def have_treaty(a, b, kind):
    for t in active_treaties:
        if t["treaty_type"] != kind: continue
        if _is_expired(t): continue
        if (t["country_a"] == a and t["country_b"] == b) or (t["country_a"] == b and t["country_b"] == a):
            return True
    return False

# =========================================================
# API War
# =========================================================
async def declare_war(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); target = data.get("target")
    if target not in COUNTRIES:
        return web.json_response({"success": False, "error": "invalid_target"}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    if not p.get("country") or p.get("is_eliminated"):
        return web.json_response({"success": False, "error": "invalid_state"}, status=400)
    attacker = p["country"]
    if target == attacker:
        return web.json_response({"success": False, "error": "self"}, status=400)
    if sum(p.get("units", {}).values()) == 0:
        return web.json_response({"success": False, "error": "no_units",
                                  "message": "هیچ یگانی ندارید."}, status=400)
    tuid, tp = get_player_by_country(target)
    if tuid is None: return web.json_response({"success": False, "error": "unowned"}, status=400)
    if target in occupied_countries:
        return web.json_response({"success": False, "error": "already_occupied"}, status=400)
    if have_treaty(attacker, target, "non_aggression"):
        return web.json_response({"success": False, "error": "non_aggression",
                                  "message": "پیمان عدم تجاوز فعال است."}, status=400)
    penalty = WAR_PENALTY_ALLIANCE if have_treaty(attacker, target, "alliance") else 0
    for w in war_declarations.values():
        if w["status"] in ("pending_admin", "negotiation") and w["attacker"] == attacker and w["defender"] == target:
            return web.json_response({"success": False, "error": "duplicate"}, status=400)
    wid = str(uuid.uuid4())
    war_declarations[wid] = {"id": wid, "attacker": attacker, "defender": target,
        "attacker_user": uid, "defender_user": tuid, "penalty": penalty,
        "status": "pending_admin", "created_at": utcnow().isoformat(), "negotiation_ends": None}
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ تأیید", callback_data=f"war:approve:{wid}"),
        InlineKeyboardButton(text="❌ رد", callback_data=f"war:reject:{wid}")]])
    await notify_admin(
        f"⚔️ اعلام جنگ\n{COUNTRIES[attacker]['name']} → {COUNTRIES[target]['name']}\n"
        f"جریمه اتحاد: {penalty}\nتأیید؟", kb)
    save_state()
    return web.json_response({"success": True, "message": "اعلام جنگ به سازمان ملل ارسال شد."})

async def get_wars(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    if uid not in players: players[uid] = create_player(uid)
    cid = players[uid].get("country")
    pend = [w for w in war_declarations.values() if w["status"] in ("pending_admin", "negotiation")]
    active = list(active_wars.values())
    mine = [r for r in war_reports if r.get("attacker") == cid or r.get("defender") == cid][-10:]
    return web.json_response({"pending": pend, "active": active, "reports": mine,
                              "occupied": occupied_countries})

async def check_wars_tick():
    now = utcnow()
    for wid, w in list(war_declarations.items()):
        if w["status"] == "negotiation" and w.get("negotiation_ends"):
            end = parse_dt(w["negotiation_ends"])
            if end and now >= end:
                w["status"] = "battle"
                active_wars[wid] = w
                push_news("جنگ آغاز شد",
                    f"مذاکره بین {COUNTRIES[w['attacker']]['name']} و {COUNTRIES[w['defender']]['name']} بی‌نتیجه ماند.")

async def perform_battle(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request)
    wid = data.get("war_id")
    fronts = data.get("fronts", {})
    w = active_wars.get(wid)
    if not w: return web.json_response({"success": False, "error": "no_war"}, status=400)
    if w["attacker_user"] != uid: return web.json_response({"success": False, "error": "not_attacker"}, status=403)
    if w.get("resolved"): return web.json_response({"success": False, "error": "resolved"}, status=400)

    atk = players[w["attacker_user"]]
    duid, dfd = get_player_by_country(w["defender"])
    if not dfd: return web.json_response({"success": False, "error": "defender_gone"}, status=400)

    def def_power(player, side_kind):
        p = 0
        for uid_, u in ARMY_UNITS.items():
            if u["group"] != side_kind: continue
            p += player.get("units", {}).get(uid_, 0) * u["defense"]
        return p

    def total_units(player, side_kind):
        return {uid_: player.get("units", {}).get(uid_, 0)
                for uid_, u in ARMY_UNITS.items() if u["group"] == side_kind}

    sent_atk = {k: max(0, int(fronts.get(k, 0) or 0)) for k in ["land", "air", "naval"]}
    report = {"attacker": w["attacker"], "defender": w["defender"], "fronts": {},
              "at": utcnow().isoformat(), "winner": None}
    attacker_wins = 0; defender_wins = 0; air_winner = None

    for front in ["air", "naval", "land"]:
        atk_attack = 0
        available = total_units(atk, front)
        requested = sent_atk.get(front, 0)
        total_available = sum(available.values())
        if total_available > 0 and requested > 0:
            ratio = min(1.0, requested / total_available)
            for uid_, count in available.items():
                u = ARMY_UNITS[uid_]
                sent = int(count * ratio)
                atk_attack += sent * u["attack"]
                atk["units"][uid_] -= sent
        dfd_def = def_power(dfd, front) * 1.10
        if air_winner == w["attacker"] and front in ["naval", "land"]: atk_attack *= 1.15
        elif air_winner == w["defender"] and front in ["naval", "land"]: dfd_def *= 1.15
        atk_final = atk_attack * (1 + random.uniform(-0.08, 0.08))
        dfd_final = dfd_def * (1 + random.uniform(-0.08, 0.08))

        if atk_final > dfd_final and atk_attack > 0:
            fw = "attacker"; attacker_wins += 1
            if front == "air": air_winner = w["attacker"]
            for uid_, c in total_units(dfd, front).items(): dfd["units"][uid_] = int(c * 0.7)
            for uid_, c in total_units(atk, front).items(): atk["units"][uid_] = int(c * 0.9)
        else:
            fw = "defender"; defender_wins += 1
            if front == "air": air_winner = w["defender"]
            for uid_, c in total_units(atk, front).items(): atk["units"][uid_] = int(c * 0.7)
            for uid_, c in total_units(dfd, front).items(): dfd["units"][uid_] = int(c * 0.9)

        report["fronts"][front] = {"attacker_power": int(atk_final), "defender_power": int(dfd_final),
                                   "winner": fw}
    report["attacker_wins"] = attacker_wins; report["defender_wins"] = defender_wins

    if attacker_wins >= 2:
        report["winner"] = "attacker"
        occupied_countries[w["defender"]] = w["attacker"]
        transfer_mp = int(dfd.get("manpower", 0) * 0.4)
        dfd["manpower"] = int(dfd.get("manpower", 0) * 0.6)
        atk["manpower"] = atk.get("manpower", 0) + transfer_mp
        if w["penalty"] > 0: atk["money"] = max(0, atk.get("money", 0) - w["penalty"])
        for k, owner in list(map_holdings.items()):
            if owner == w["defender"]: map_holdings[k] = w["attacker"]
        for k, owner in list(strait_holdings.items()):
            if owner == w["defender"]: strait_holdings[k] = w["attacker"]
        dfd["is_eliminated"] = True
        push_news("اشغال کشور",
            f"{COUNTRIES[w['attacker']]['name']} کشور {COUNTRIES[w['defender']]['name']} را اشغال کرد.")
    else:
        report["winner"] = "defender"
        push_news("دفاع موفق",
            f"{COUNTRIES[w['defender']]['name']} در برابر {COUNTRIES[w['attacker']]['name']} مقاومت کرد.")

    report["id"] = str(uuid.uuid4())
    war_reports.append(report)
    if len(war_reports) > 100: del war_reports[:50]
    w["resolved"] = True; w["status"] = "resolved"
    save_state()
    return web.json_response({"success": True, "report": report})

# =========================================================
# API Map sites / Capture
# =========================================================
async def get_map_sites(request):
    sites = []
    for k, info in MAP_RESOURCES.items():
        sites.append({**info, "id": k, "kind": "resource", "owner": map_holdings.get(k)})
    for k, info in STRAITS_DATA.items():
        sites.append({"id": k, "kind": "strait", "type": "strait", "name": info["name"],
                      "lon": info["lon"], "lat": info["lat"], "income": info["income"],
                      "owner": strait_holdings.get(k)})
    return web.json_response(sites)

async def capture_site(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); site_id = data.get("site_id")
    if site_id not in MAP_RESOURCES and site_id not in STRAITS_DATA:
        return web.json_response({"success": False, "error": "invalid_site"}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    if not p.get("country"): return web.json_response({"success": False, "error": "no_country"}, status=400)
    if p.get("units", {}).get("ship", 0) < 1 and p.get("units", {}).get("submarine", 0) < 1:
        return web.json_response({"success": False, "error": "no_navy",
                                  "message": "برای تصرف به ناو نیاز دارید."}, status=400)
    country = p["country"]
    current = map_holdings.get(site_id) or strait_holdings.get(site_id)
    if current == country:
        return web.json_response({"success": False, "error": "already_own"}, status=400)
    if p["units"].get("ship", 0) > 0: p["units"]["ship"] -= 1
    else: p["units"]["submarine"] -= 1
    if site_id in MAP_RESOURCES:
        map_holdings[site_id] = country
        push_news("تصرف منبع", f"{COUNTRIES[country]['name']} {MAP_RESOURCES[site_id]['name']} را تصرف کرد.")
    else:
        strait_holdings[site_id] = country
        push_news("تصرف تنگه", f"{COUNTRIES[country]['name']} {STRAITS_DATA[site_id]['name']} را تصرف کرد.")
    save_state()
    return web.json_response({"success": True, "message": "تصرف موفق."})

# =========================================================
# API Announcements
# =========================================================
async def get_announcements(request):
    result = []
    for a in announcements[-50:]:
        reactions = a.get("reactions", {})
        support = [c for c, r in reactions.items() if r == "support"]
        accuse = [c for c, r in reactions.items() if r == "accuse"]
        comments = a.get("comments", [])
        result.append({"id": a["id"], "from_country": a["from_country"], "text": a["text"],
                       "created_at": a["created_at"], "support": support, "accuse": accuse,
                       "comments_count": len(comments),
                       "comments": comments[-20:]})
    result.reverse()
    return web.json_response(result)

async def create_announcement(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); text = (data.get("text") or "").strip()[:500]
    if not text: return web.json_response({"success": False, "error": "empty"}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]; cid = p.get("country")
    if not cid: return web.json_response({"success": False, "error": "no_country"}, status=400)
    today = utcnow().strftime("%Y-%m-%d")
    anns = p.setdefault("announcements", {}); today_list = anns.get(today, [])
    if len(today_list) >= 4:
        return web.json_response({"success": False, "error": "daily_limit",
                                  "message": "سهمیه امروز تمام است."}, status=400)
    if today_list:
        last = parse_dt(today_list[-1])
        if last and (utcnow() - last).total_seconds() < 3600:
            mins = int((3600 - (utcnow() - last).total_seconds()) / 60)
            return web.json_response({"success": False, "error": "cooldown",
                                      "message": f"{mins} دقیقه دیگر."}, status=400)
    cost = ANN_COSTS.get(len(today_list) + 1, 400_000)
    if p.get("money", 0) < cost:
        return web.json_response({"success": False, "error": "not_enough_money",
                                  "message": f"هزینه {cost} دلار."}, status=400)
    p["money"] -= cost
    today_list.append(utcnow().isoformat()); anns[today] = today_list
    ann = {"id": str(uuid.uuid4()), "from_country": cid, "text": text,
           "created_at": utcnow().isoformat(), "reactions": {}, "comments": []}
    announcements.append(ann)
    push_news("بیانیه", f"{COUNTRIES[cid]['name']}: {text[:80]}")
    save_state()
    return web.json_response({"success": True, "announcement": ann})

async def react_announcement(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); ann_id = data.get("announcement_id"); r = data.get("reaction")
    if r not in ("support", "accuse"):
        return web.json_response({"success": False, "error": "invalid"}, status=400)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    for a in announcements:
        if a["id"] == ann_id:
            a.setdefault("reactions", {})[cid] = r
            save_state(); return web.json_response({"success": True})
    return web.json_response({"success": False, "error": "not_found"}, status=404)

async def comment_announcement(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); ann_id = data.get("announcement_id"); text = (data.get("text") or "").strip()[:300]
    if not text: return web.json_response({"success": False, "error": "empty"}, status=400)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    for a in announcements:
        if a["id"] == ann_id:
            a.setdefault("comments", []).append({"from_country": cid, "text": text, "at": utcnow().isoformat()})
            save_state(); return web.json_response({"success": True})
    return web.json_response({"success": False, "error": "not_found"}, status=404)

async def get_announcement_detail(request):
    aid = request.query.get("id")
    for a in announcements:
        if a["id"] == aid: return web.json_response(a)
    return web.json_response({"error": "not_found"}, status=404)

# =========================================================
# API Unions
# =========================================================
async def get_union(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    if uid not in players: return web.json_response({"union": None})
    cid = players[uid].get("country")
    for u in unions.values():
        if cid in u.get("members", []):
            return web.json_response({"union": u, "is_leader": u["leader_country"] == cid})
    invites = []
    for u in unions.values():
        if cid in u.get("invites", []):
            invites.append({"union_id": u["id"], "name": u["name"], "leader": u["leader_country"]})
    return web.json_response({"union": None, "invites": invites})

async def create_union(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); name = (data.get("name") or "").strip()[:40]
    if not name: return web.json_response({"success": False, "error": "no_name"}, status=400)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    if not cid: return web.json_response({"success": False, "error": "no_country"}, status=400)
    for u in unions.values():
        if cid in u.get("members", []):
            return web.json_response({"success": False, "error": "already_member"}, status=400)
    u_id = str(uuid.uuid4())
    unions[u_id] = {"id": u_id, "name": name, "leader_country": cid, "members": [cid],
                    "messages": [], "invites": [], "created_at": utcnow().isoformat()}
    push_news("اتحادیه", f"{COUNTRIES[cid]['name']} اتحادیه «{name}» را ساخت.")
    save_state()
    return web.json_response({"success": True, "union_id": u_id})

async def invite_union(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); u_id = data.get("union_id"); target = data.get("target")
    if target not in COUNTRIES: return web.json_response({"success": False, "error": "invalid"}, status=400)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    u = unions.get(u_id)
    if not u: return web.json_response({"success": False, "error": "no_union"}, status=404)
    if u["leader_country"] != cid: return web.json_response({"success": False, "error": "not_leader"}, status=403)
    if target in u["members"]: return web.json_response({"success": False, "error": "already_member"}, status=400)
    if target not in u["invites"]: u["invites"].append(target)
    save_state()
    return web.json_response({"success": True})

async def respond_union_invite(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); u_id = data.get("union_id"); accept = bool(data.get("accept"))
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    u = unions.get(u_id)
    if not u or cid not in u.get("invites", []):
        return web.json_response({"success": False, "error": "no_invite"}, status=400)
    u["invites"].remove(cid)
    for other in unions.values():
        if other["id"] != u_id and cid in other.get("members", []):
            return web.json_response({"success": False, "error": "in_other"}, status=400)
    if accept: u["members"].append(cid)
    save_state()
    return web.json_response({"success": True})

async def leave_union(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    for u in list(unions.values()):
        if cid in u.get("members", []):
            u["members"].remove(cid)
            if not u["members"]:
                # آخرین عضو خارج شد → اتحادیه منحل می‌شود
                del unions[u["id"]]
            elif u["leader_country"] == cid:
                # رهبر خارج شد → اولین عضو باقی‌مانده رهبر می‌شود
                u["leader_country"] = u["members"][0]
            save_state()
            return web.json_response({"success": True})
    return web.json_response({"success": False, "error": "not_member"}, status=400)

async def send_union_message(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); text = (data.get("text") or "").strip()[:500]
    if not text: return web.json_response({"success": False, "error": "empty"}, status=400)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    for u in unions.values():
        if cid in u.get("members", []):
            u.setdefault("messages", []).append({"from_country": cid, "text": text, "at": utcnow().isoformat()})
            if len(u["messages"]) > 200: del u["messages"][:50]
            save_state(); return web.json_response({"success": True})
    return web.json_response({"success": False, "error": "not_member"}, status=400)

# =========================================================
# API Private messages
# =========================================================
async def send_pm(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); target = data.get("target"); text = (data.get("text") or "").strip()[:500]
    if target not in COUNTRIES or not text:
        return web.json_response({"success": False, "error": "invalid"}, status=400)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    if not cid or target == cid:
        return web.json_response({"success": False, "error": "invalid"}, status=400)
    msg = {"from": cid, "to": target, "text": text, "at": utcnow().isoformat()}
    private_messages.setdefault(cid, {}).setdefault(target, []).append(msg)
    private_messages.setdefault(target, {}).setdefault(cid, []).append(msg)
    save_state()
    return web.json_response({"success": True})

async def get_pm(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    target = request.query.get("target")
    if uid not in players: return web.json_response({"messages": []})
    cid = players[uid].get("country")
    if not cid: return web.json_response({"messages": []})
    if target:
        return web.json_response({"messages": private_messages.get(cid, {}).get(target, []), "with": target})
    return web.json_response({"conversations": list(private_messages.get(cid, {}).keys())})

# =========================================================
# API Market
# =========================================================
async def get_market(request):
    return web.json_response({"listings": [l for l in market_listings.values() if l["status"] == "open"]})

async def create_listing(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request)
    sr = data.get("sell_resource"); wr = data.get("want_resource")
    try: sa = int(data.get("sell_amount", 0)); wa = int(data.get("want_amount", 0))
    except: return web.json_response({"success": False, "error": "invalid_amount"}, status=400)
    if sr not in RESOURCE_NAMES: return web.json_response({"success": False, "error": "invalid_res"}, status=400)
    if wr != "money" and wr not in RESOURCE_NAMES:
        return web.json_response({"success": False, "error": "invalid_want"}, status=400)
    if sa <= 0 or wa <= 0: return web.json_response({"success": False, "error": "invalid_amount"}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    if not p.get("country"): return web.json_response({"success": False, "error": "no_country"}, status=400)
    if p["resources"].get(sr, 0) < sa:
        return web.json_response({"success": False, "error": "not_enough_res"}, status=400)
    lid = str(uuid.uuid4())
    market_listings[lid] = {"id": lid, "seller": p["country"], "sell_resource": sr,
                            "sell_amount": sa, "want_resource": wr, "want_amount": wa,
                            "status": "open", "created_at": utcnow().isoformat()}
    save_state()
    return web.json_response({"success": True, "listing_id": lid})

async def cancel_listing(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); lid = data.get("listing_id")
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    l = market_listings.get(lid)
    if not l: return web.json_response({"success": False, "error": "not_found"}, status=404)
    if l["seller"] != cid: return web.json_response({"success": False, "error": "not_owner"}, status=403)
    del market_listings[lid]; save_state()
    return web.json_response({"success": True})

async def accept_listing(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); lid = data.get("listing_id")
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    buyer = players[uid]; bcid = buyer.get("country")
    l = market_listings.get(lid)
    if not l or l["status"] != "open":
        return web.json_response({"success": False, "error": "closed"}, status=400)
    if l["seller"] == bcid: return web.json_response({"success": False, "error": "self_buy"}, status=400)
    suid, seller = get_player_by_country(l["seller"])
    if not seller: return web.json_response({"success": False, "error": "seller_gone"}, status=400)
    ensure_player_fields(buyer); ensure_player_fields(seller)

    # === همه چک‌ها قبل از هر انتقالی ===
    if seller["resources"].get(l["sell_resource"], 0) < l["sell_amount"]:
        return web.json_response({"success": False, "error": "seller_no_res"}, status=400)
    if l["want_resource"] == "money":
        if buyer.get("money", 0) < l["want_amount"]:
            return web.json_response({"success": False, "error": "not_enough_money"}, status=400)
    else:
        if buyer["resources"].get(l["want_resource"], 0) < l["want_amount"]:
            return web.json_response({"success": False, "error": "not_enough_res"}, status=400)

    # === انتقال‌ها ===
    if l["want_resource"] == "money":
        buyer["money"] -= l["want_amount"]
        seller["money"] = seller.get("money", 0) + l["want_amount"]
    else:
        buyer["resources"][l["want_resource"]] -= l["want_amount"]
        seller["resources"][l["want_resource"]] = seller["resources"].get(l["want_resource"], 0) + l["want_amount"]
    seller["resources"][l["sell_resource"]] -= l["sell_amount"]
    buyer["resources"][l["sell_resource"]] = buyer["resources"].get(l["sell_resource"], 0) + l["sell_amount"]
    l["status"] = "filled"; l["buyer"] = bcid
    push_news("معامله", f"{COUNTRIES[bcid]['name']} از {COUNTRIES[l['seller']]['name']} "
                        f"{l['sell_amount']} {RESOURCE_NAMES[l['sell_resource']]} خرید.")
    save_state()
    return web.json_response({"success": True})

# =========================================================
# API News / Rankings
# =========================================================
async def get_news(request):
    return web.json_response(list(reversed(news_feed[-30:])) or [
        {"title": "سال ۱۹۳۹", "text": "اروپا در آستانه یک بحران بزرگ قرار دارد."}])

def compute_rankings():
    rows = []
    for uid, p in players.items():
        cid = p.get("country")
        if not cid: continue
        ensure_player_fields(p); recompute_army(p); rates = compute_rates(p)
        eco = rates["net_income"] // 1000; mil = p.get("army", 0)
        dip = 0
        for t in active_treaties:
            if _is_expired(t): continue
            if t["country_a"] == cid or t["country_b"] == cid: dip += 100
        for u in unions.values():
            if cid in u.get("members", []): dip += 150
        dev = sum(p.get("infra_levels", {}).values()) * 50
        total = eco + mil + dip + dev
        rows.append({"country": cid, "name": COUNTRIES[cid]["name"], "flag": COUNTRIES[cid]["flag"],
                     "overall": total, "economy": eco, "military": mil, "diplomacy": dip,
                     "development": dev, "is_eliminated": p.get("is_eliminated", False)})
    rows.sort(key=lambda x: x["overall"], reverse=True)
    for i, r in enumerate(rows): r["rank"] = i + 1
    return rows

async def get_rankings(request):
    return web.json_response(compute_rankings())

# =========================================================
# Health / Debug
# =========================================================
async def health(request):
    return web.json_response({"status": "ok", "players": len(players)})

async def debug_auth(request):
    init_data = request.headers.get("X-Telegram-Init-Data") or request.query.get("init_data") or ""
    user = verify_init_data(init_data)
    return web.json_response({"auth_required": AUTH_REQUIRED, "got_init_data": bool(init_data),
                              "verified": user is not None, "user": user,
                              "bot_token_set": bool(BOT_TOKEN), "players_count": len(players)})

# =========================================================
# Web Server
# =========================================================
WEB_DIR = os.path.join("web")

async def index(request): return web.FileResponse(os.path.join(WEB_DIR, "index.html"))
async def style(request): return web.FileResponse(os.path.join(WEB_DIR, "style.css"))
async def app_js(request): return web.FileResponse(os.path.join(WEB_DIR, "app.js"))

async def create_web_app():
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_get("/", index)
    app.router.add_get("/style.css", style)
    app.router.add_get("/app.js", app_js)
    app.router.add_static("/images/", path=os.path.join(WEB_DIR, "images"), name="images")

    for path, h in [
        ("/api/player", get_player), ("/api/countries", get_countries),
        ("/api/army-units", get_army_units), ("/api/diplomacy", get_diplomacy),
        ("/api/wars", get_wars), ("/api/map-sites", get_map_sites),
        ("/api/announcements", get_announcements), ("/api/announcement", get_announcement_detail),
        ("/api/union", get_union), ("/api/pm", get_pm), ("/api/market", get_market),
        ("/api/news", get_news), ("/api/rankings", get_rankings),
        ("/api/debug-auth", debug_auth), ("/health", health)]:
        app.router.add_get(path, h)

    for path, h in [
        ("/api/select-country", select_country), ("/api/upgrade-infra", upgrade_infra),
        ("/api/upgrade-economy", upgrade_economy), ("/api/train-unit", train_unit),
        ("/api/propose-treaty", propose_treaty), ("/api/respond-treaty", respond_treaty),
        ("/api/war/declare", declare_war), ("/api/war/battle", perform_battle),
        ("/api/map/capture", capture_site),
        ("/api/announcements/create", create_announcement),
        ("/api/announcements/react", react_announcement),
        ("/api/announcements/comment", comment_announcement),
        ("/api/union/create", create_union), ("/api/union/invite", invite_union),
        ("/api/union/respond", respond_union_invite), ("/api/union/leave", leave_union),
        ("/api/union/message", send_union_message), ("/api/pm/send", send_pm),
        ("/api/market/create", create_listing), ("/api/market/cancel", cancel_listing),
        ("/api/market/accept", accept_listing)]:
        app.router.add_post(path, h)

    app.router.add_route("OPTIONS", "/{tail:.*}", lambda r: web.Response())
    return app

async def start_web_server():
    app = await create_web_app()
    runner = web.AppRunner(app); await runner.setup()
    port = int(os.getenv("PORT", "10000"))
    site = web.TCPSite(runner, "0.0.0.0", port); await site.start()
    logging.info("WEB SERVER STARTED | port=%s", port)

async def war_tick_loop():
    """هر ۳۰ ثانیه: چک مذاکره‌ها + پاک‌سازی داده‌های منقضی."""
    while True:
        await asyncio.sleep(30)
        try:
            await check_wars_tick()
            cleanup_expired_data()
        except Exception as e:
            logging.error("war tick: %s", e)

async def main():
    logging.info("WW2 GAME STARTING (dev mode — no persistence)...")
    # توجه: در حالت توسعه، هیچ state ذخیره/بارگذاری نمی‌شود.
    # با هر ری‌استارت Render، بازی از صفر شروع می‌شود.
    asyncio.create_task(war_tick_loop())
    await start_web_server()
    await bot.delete_webhook(drop_pending_updates=True)
    logging.info("BOT POLLING STARTED")
    await dp.start_polling(bot, drop_pending_updates=True, handle_signals=False)

if __name__ == "__main__":
    try: asyncio.run(main())
    except (KeyboardInterrupt, SystemExit): pass
