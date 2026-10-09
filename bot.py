import os, json, hmac, hashlib, uuid, logging, asyncio, random, math
from datetime import datetime, timezone, timedelta
from urllib.parse import parse_qsl

from aiohttp import web
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, MenuButtonWebApp
from aiogram.client.session.middlewares.base import BaseRequestMiddleware
from aiogram.methods import SendMessage
from aiogram.client.default import DefaultBotProperties
from dotenv import load_dotenv

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
WEB_APP_URL = os.getenv("WEB_APP_URL", "https://ww2-telegram-game.onrender.com")
ADMIN_ID = int(os.getenv("ADMIN_ID", "0"))
AUTH_REQUIRED = os.getenv("AUTH_REQUIRED", "0") == "1"
DATA_DIR = os.getenv("DATA_DIR", "data")
STATE_FILE = os.path.join(DATA_DIR, "state.json")

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

COUNTRIES = {
    "germany": {"name": "آلمان", "flag": "🇩🇪"}, "britain": {"name": "بریتانیا", "flag": "🇬🇧"},
    "ussr": {"name": "شوروی", "flag": "☭"}, "usa": {"name": "آمریکا", "flag": "🇺🇸"},
    "france": {"name": "فرانسه", "flag": "🇫🇷"}, "italy": {"name": "ایتالیا", "flag": "🇮🇹"},
    "china": {"name": "چین", "flag": "🇨🇳"}, "japan": {"name": "ژاپن", "flag": "🇯🇵"},
}

STARTING_MONEY = 10_000_000
STARTING_MANPOWER = 50_000
BASE_DAILY_INCOME = 500_000
BASE_MANPOWER_PRODUCTION = 10_000
DAYS_PER_SEASON = 3
GAME_TOTAL_DAYS = 12

# ---- وام ----
LOAN_INTEREST_STEP_HOURS = 12      # به ازای هر ۱۲ ساعت کامل
LOAN_INTEREST_PER_STEP = 0.10      # ۱۰٪ مبلغ
LOAN_MAX_HOURS = 72                # حداکثر مهلت (=۶۰٪)
LOAN_FEE = 0.05                    # کارمزد ۵٪ از هر دریافت
LOAN_CAP_FRACTION = 0.50           # سقف هر وام: ۵۰٪ درآمد روزانهٔ وام‌دهنده
LOAN_END_MARGIN_SECONDS = 60       # سررسید همه وام‌ها ۱ دقیقه پیش از جنگ جهانی (پایان بازی)
LOAN_PENDING_TTL_HOURS = 24        # پیشنهادهای بی‌پاسخ منقضی می‌شوند
SEASONS = ["بهار", "تابستان", "پاییز", "زمستان"]

# اثر هر فصل روی تولید غذا و نفت (ضریب)
SEASON_FOOD_OIL_MULT = {
    "بهار":   1.00,
    "تابستان": 0.90,
    "پاییز":   0.75,
    "زمستان":  0.55,
}
SEASON_HINTS = {
    "بهار":   "🌱 هوا معتدل",
    "تابستان": "☀️ مصرف سوخت و غذا کمی افزایش می‌یابد",
    "پاییز":  "🍂 مصرف سوخت و غذا بیشتر می‌شود",
    "زمستان": "❄️ مصرف سوخت و غذا خیلی زیاد می‌شود",
}

STARTING_RESOURCES = {"food": 5_000, "steel": 0, "uranium": 0, "oil": 5_000}
RESOURCE_NAMES = {"food": "غذا", "steel": "آهن", "uranium": "اورانیوم", "oil": "نفت"}
GROUP_NAMES = {"land": "زمینی", "naval": "دریایی", "air": "هوایی",
               "power": "برق", "manpower": "نیروی انسانی", "resource": "منابع", "missile": "موشکی"}
TREATY_TYPE_NAMES = {"alliance": "پیمان اتحاد", "non_aggression": "پیمان عدم تجاوز"}
ANN_COSTS = {1: 0, 2: 0, 3: 10_000, 4: 400_000}
ANNOUNCEMENT_TZ = timezone(timedelta(hours=4))  # ریست سهمیه در نیمه‌شب باکو
ANNOUNCEMENT_INTERVAL_SECONDS = 3600


def _announcement_day(now=None):
    now = now or utcnow()
    return now.astimezone(ANNOUNCEMENT_TZ).strftime("%Y-%m-%d")


def _announcement_reset_seconds(now=None):
    now = now or utcnow()
    local_now = now.astimezone(ANNOUNCEMENT_TZ)
    next_midnight = local_now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    return max(0, int((next_midnight - local_now).total_seconds()))


def _announcement_cooldown_seconds(today_list, now=None):
    now = now or utcnow()
    if not today_list:
        return 0
    last = parse_dt(today_list[-1])
    if not last:
        return 0
    elapsed = max(0, (now - last).total_seconds())
    return max(0, int(ANNOUNCEMENT_INTERVAL_SECONDS - elapsed + 0.999))
WAR_PENALTY_ALLIANCE = 2_000_000
NEGOTIATION_HOURS = 24
DEFAULT_COST = 150_000
DEFAULT_TIME = 0

def L(**kw):
    kw.setdefault("cost", DEFAULT_COST)
    kw.setdefault("time", DEFAULT_TIME)
    return kw

INFRASTRUCTURE = {
    # ==================== برق ====================
    "power_coal": {
        "name": "نیروگاه زغال‌سنگ", "group": "power", "icon": "⚡",
        "desc": "ارزان و در دسترس، اما برق کمی تولید می‌کند.",
        "levels": [L(cost=900_000, capacity=20), L(cost=1_200_000, capacity=40), L(cost=1_500_000, capacity=60)],
    },
    "power_wind": {
        "name": "نیروگاه بادی", "group": "power", "icon": "💨",
        "desc": "برق متوسط با هزینهٔ نگهداری کم. هر سطح برق بیشتری تولید می‌کند.",
        "levels": [L(cost=1_300_000, capacity=34), L(cost=2_100_000, capacity=56), L(cost=2_500_000, capacity=60)],
    },
    "power_solar": {
        "name": "نیروگاه خورشیدی", "group": "power", "icon": "☀️",
        "desc": "برقی بیشتر از نیروگاه بادی با ساخت گران‌تر.",
        "levels": [L(cost=2_400_000, capacity=72), L(cost=2_700_000, capacity=86), L(cost=3_000_000, capacity=90)],
    },
    "power_nuclear": {
        "name": "نیروگاه هسته‌ای", "group": "power", "icon": "☢️",
        "desc": "پربازده‌ترین نیروگاه. برق زیادی تولید می‌کند اما اورانیوم مصرف می‌کند.",
        "levels": [
            L(cost=6_400_000, capacity=164, resources={"uranium": 5_000}),
            L(cost=8_000_000, capacity=180, resources={"uranium": 12_000}),
            L(cost=10_000_000, capacity=260, resources={"uranium": 25_000}),
        ],
    },

    # ==================== نیروی انسانی ====================
    "manpower_camp": {
        "power_required": 2,
        "name": "اردوگاه آموزشی", "group": "manpower", "icon": "👥",
        "desc": "پایگاه آموزش نیرو. هر سطح نیروی بیشتری تربیت می‌کند.",
        "levels": [L(cost=220_000, production=200), L(cost=480_000, production=500), L(cost=1_050_000, production=1200), L(cost=2_000_000, production=2500), L(cost=3_600_000, production=5000)],
    },
    "manpower_barracks_training": {
        "power_required": 3,
        "name": "پادگان آموزشی", "group": "manpower", "icon": "👥",
        "desc": "پادگان تخصصی آموزش سرباز.",
        "levels": [L(cost=300_000, production=300), L(cost=650_000, production=700), L(cost=1_400_000, production=1600), L(cost=2_700_000, production=3400), L(cost=4_900_000, production=6800)],
    },
    "manpower_volunteer": {
        "power_required": 2,
        "name": "پایگاه داوطلبان", "group": "manpower", "icon": "👥",
        "desc": "داوطلبان داوطلبانه ثبت‌نام می‌کنند.",
        "levels": [L(cost=180_000, production=240), L(cost=430_000, production=560), L(cost=1_050_000, production=1300), L(cost=2_300_000, production=2800), L(cost=4_600_000, production=5500)],
    },
    "manpower_medical": {
        "power_required": 3,
        "name": "مرکز پزشکی", "group": "manpower", "icon": "👥",
        "desc": "سلامت سربازان را تأمین می‌کند و تولید نیرو را بالا می‌برد.",
        "levels": [L(cost=260_000, production=260), L(cost=560_000, production=620), L(cost=1_250_000, production=1400), L(cost=2_500_000, production=3000), L(cost=4_700_000, production=6000)],
    },
    "manpower_mobilization": {
        "power_required": 4,
        "name": "مرکز بسیج", "group": "manpower", "icon": "👥",
        "desc": "در زمان جنگ نیروهای بیشتری جذب می‌کند.",
        "levels": [L(cost=340_000, production=380), L(cost=720_000, production=900), L(cost=1_500_000, production=2000), L(cost=2_900_000, production=4200), L(cost=5_300_000, production=8500)],
    },
    "manpower_academy": {
        "power_required": 5,
        "name": "آکادمی نظامی", "group": "manpower", "icon": "👥",
        "desc": "افسران کارآزموده پرورش می‌دهد.",
        "levels": [L(cost=430_000, production=450), L(cost=900_000, production=1100), L(cost=1_800_000, production=2400), L(cost=3_400_000, production=5000), L(cost=6_000_000, production=10000)],
    },

    # ==================== غذا (۳ آیتم) ====================
    "resource_farm": {
        "power_required": 2,
        "name": "مجتمع کشاورزی", "group": "resource", "resource_key": "food", "icon": "🌾",
        "desc": "غذای زیادی تولید می‌کند. برای فصل‌هایی که مصرف بالاست مناسب است.",
        "levels": [L(cost=240_000, production=200_000), L(cost=480_000, production=300_000), L(cost=840_000, production=440_000)],
    },
    "resource_greenhouse": {
        "power_required": 5,
        "name": "گلخانه صنعتی", "group": "resource", "resource_key": "food", "icon": "🌱",
        "desc": "غذا در همه فصل‌ها با بازده بالا تولید می‌کند.",
        "levels": [L(cost=3_000_000, production=1_000_000), L(cost=6_000_000, production=1_500_000), L(cost=10_500_000, production=2_200_000)],
    },
    "resource_livestock": {
        "power_required": 4,
        "name": "دامداری", "group": "resource", "resource_key": "food", "icon": "🐄",
        "desc": "گوشت و لبنیات فراوان تولید می‌کند؛ گران است ولی در تابستان، پاییز و زمستان به کار می‌آید.",
        "levels": [L(cost=8_000_000, production=4_000_000), L(cost=16_000_000, production=6_000_000), L(cost=28_000_000, production=8_800_000)],
    },

    # ==================== منابع ====================
    "resource_oil_well": {
        "power_required": 4,
        "name": "چاه نفت", "group": "resource", "resource_key": "oil", "icon": "🛢️",
        "desc": "نفت خام استخراج می‌کند. برای پالایشگاه و ارتش ضروری است.",
        "levels": [L(cost=800_000, production=50_000), L(cost=1_820_000, production=130_000), L(cost=4_000_000, production=300_000), L(cost=8_000_000, production=700_000), L(cost=15_270_000, production=1_500_000)],
    },
    "resource_steel_mill": {
        "power_required": 5,
        "name": "کارخانه آهن", "group": "resource", "resource_key": "steel", "icon": "⚙️",
        "desc": "آهن تولید می‌کند. پایهٔ صنعت و ساخت تانک است.",
        "levels": [L(cost=1_200_000, production=50_000), L(cost=2_700_000, production=130_000), L(cost=6_000_000, production=300_000), L(cost=12_000_000, production=700_000), L(cost=22_500_000, production=1_500_000)],
    },
    "resource_uranium_mine": {
        "power_required": 6,
        "name": "معدن اورانیوم", "group": "resource", "resource_key": "uranium", "icon": "☢️",
        "desc": "اورانیوم استخراج می‌کند. تنها نیروگاه هسته‌ای مصرفش می‌کند.",
        "levels": [L(cost=2_000_000, production=50_000), L(cost=4_470_000, production=130_000), L(cost=10_000_000, production=300_000), L(cost=19_470_000, production=700_000), L(cost=36_840_000, production=1_500_000)],
    },

    # ==================== نظامی ====================
    "land_barracks": {
        "power_required": 2,
        "name": "پادگان", "group": "land", "icon": "🪖",
        "desc": "تانک‌ها و نیروهای ارتش داخل پادگان می‌مانند. بعد از ساخت می‌شود آن را ارتقا داد و ظرفیتش را بیشتر کرد.",
        "levels": [L(cost=250_000, capacity=1000), L(cost=560_000, capacity=2000), L(cost=1_190_000, capacity=3000), L(cost=2_250_000, capacity=4000), L(cost=4_000_000, capacity=5000)],
    },
    "land_hq": {
        "power_required": 3,
        "name": "ستاد فرماندهی", "group": "land", "icon": "🎖️",
        "desc": "فرماندهی کل نیروی زمینی. ساخت آن شرط تولید یگان‌های زمینی است. از سطح ۲ به بعد هر ارتقا ۱۰٪ به دفاع یگان‌های زمینی اضافه می‌کند.",
        "bonus": {"defense": 0.10},
        "levels": [L(cost=500_000), L(cost=1_100_000), L(cost=2_300_000), L(cost=4_300_000), L(cost=7_500_000)],
    },
    "land_tank_factory": {
        "power_required": 5,
        "name": "کارخانه تانک‌سازی", "group": "land", "icon": "🛡️",
        "desc": "تانک تولید می‌کند. از سطح ۲ به بعد هر ارتقا ۵٪ به دفاع یگان‌های زمینی اضافه می‌کند.",
        "bonus": {"defense": 0.05},
        "levels": [L(cost=600_000), L(cost=1_300_000), L(cost=2_800_000), L(cost=5_200_000), L(cost=9_000_000)],
    },
    "naval_port": {
        "power_required": 4,
        "name": "بندر", "group": "naval", "icon": "⚓",
        "desc": "محل پهلو گرفتن ناوگان. هر سطح ظرفیت بندر را بیشتر می‌کند.",
        "levels": [L(cost=500_000, capacity=2000), L(cost=1_090_000, capacity=4000), L(cost=2_360_000, capacity=6000), L(cost=4_360_000, capacity=8000), L(cost=7_730_000, capacity=10000)],
    },
    "naval_shipyard": {
        "power_required": 8,
        "name": "کشتی‌سازی", "group": "naval", "icon": "🚢",
        "desc": "زیردریایی، ناو، ناو ترابری و ناو هواپیمابر تولید می‌کند. از سطح ۲ به بعد هر ارتقا ۵٪ به دفاع یگان‌های دریایی اضافه می‌کند.",
        "bonus": {"defense": 0.05},
        "levels": [L(cost=750_000), L(cost=1_580_000), L(cost=3_330_000), L(cost=6_080_000), L(cost=10_420_000)],
    },
    "air_airport": {
        "power_required": 5,
        "name": "فرودگاه", "group": "air", "icon": "🛫",
        "desc": "محل استقرار جنگنده، بمب‌افکن و بالگرد. هر سطح ظرفیت فرودگاه را بیشتر می‌کند.",
        "levels": [L(cost=550_000, capacity=2500), L(cost=1_180_000, capacity=5000), L(cost=2_450_000, capacity=7500), L(cost=4_570_000, capacity=10000), L(cost=7_870_000, capacity=12500)],
    },
    "air_arsenal": {
        "power_required": 7,
        "name": "ادوات هوایی", "group": "air", "icon": "✈️",
        "desc": "جنگنده، بمب‌افکن و بالگرد تولید می‌کند. از سطح ۲ به بعد هر ارتقا ۵٪ به دفاع یگان‌های هوایی اضافه می‌کند.",
        "bonus": {"defense": 0.05},
        "levels": [L(cost=800_000), L(cost=1_680_000), L(cost=3_540_000), L(cost=6_400_000), L(cost=10_950_000)],
    },
    "missile_depot": {
        "power_required": 8,
        "name": "انبار موشک", "group": "missile", "icon": "🚀",
        "desc": "محل نگهداری موشک‌ها. هر سطح ظرفیت انبار را بیشتر می‌کند.",
        "levels": [L(cost=2_000_000, capacity=4000), L(cost=4_200_000, capacity=8000), L(cost=8_800_000, capacity=12000), L(cost=16_000_000, capacity=16000), L(cost=27_000_000, capacity=20000)],
    },
    "missile_factory": {
        "power_required": 10,
        "name": "موشک‌سازی", "group": "missile", "icon": "🎯",
        "desc": "موشک تولید می‌کند. سطح بالاتر موشک‌های قوی‌تر را باز می‌کند و از سطح ۲ به بعد هر ارتقا ۵٪ به دفاع موشک‌ها اضافه می‌کند.",
        "bonus": {"defense": 0.05},
        "levels": [L(cost=2_400_000), L(cost=5_040_000), L(cost=10_560_000), L(cost=19_200_000), L(cost=32_400_000)],
    },
    "satellite": {
        "power_required": 6,
        "name": "ماهواره", "group": "strategy", "icon": "🛰️",
        "desc": "پایگاه ماهواره‌ای. تب «ماهواره» در بخش جنگ را باز می‌کند: پرتاب ماهواره، اسکن سکوها و تنگه‌ها و اسکن کشورها.",
        "levels": [L(cost=6_000_000)],
    },
    # ==================== رفاه و امنیت ====================
    "hospital": {
        "power_required": 6, "name": "بیمارستان", "group": "welfare", "icon": "🏥",
        "desc": "هر سطح ۲٪ به پاداش رفاه اضافه می‌کند و اثر همه‌گیری را کم می‌کند.",
        "levels": [L(cost=500_000, welfare=2), L(cost=1_100_000, welfare=2), L(cost=2_200_000, welfare=2), L(cost=4_200_000, welfare=2), L(cost=7_500_000, welfare=2)],
    },
    "police": {
        "power_required": 4, "name": "ایستگاه پلیس", "group": "welfare", "icon": "🚓",
        "desc": "هر سطح ۲٪ به پاداش رفاه اضافه می‌کند و اثر موج سرقت را کم می‌کند.",
        "levels": [L(cost=350_000, welfare=2), L(cost=800_000, welfare=2), L(cost=1_600_000, welfare=2), L(cost=3_100_000, welfare=2), L(cost=5_600_000, welfare=2)],
    },
    "housing": {
        "power_required": 8, "name": "شهرک مسکونی", "group": "welfare", "icon": "🏘️",
        "desc": "هر سطح ۲٪ به پاداش رفاه اضافه می‌کند و اثر زلزله را کم می‌کند.",
        "levels": [L(cost=600_000, welfare=2), L(cost=1_300_000, welfare=2), L(cost=2_600_000, welfare=2), L(cost=5_000_000, welfare=2), L(cost=9_000_000, welfare=2)],
    },
    "metro": {
        "power_required": 12, "name": "مترو", "group": "welfare", "icon": "🚇",
        "desc": "هر سطح ۲٪ به پاداش رفاه اضافه می‌کند و اثر قحطی را کم می‌کند.",
        "levels": [L(cost=800_000, welfare=2), L(cost=1_800_000, welfare=2), L(cost=3_600_000, welfare=2), L(cost=6_800_000, welfare=2), L(cost=12_000_000, welfare=2)],
    },
    "university": {
        "power_required": 10, "name": "دانشگاه", "group": "welfare", "icon": "🎓",
        "desc": "هر سطح ۲٪ به پاداش رفاه اضافه می‌کند و اثر خشکسالی را کم می‌کند.",
        "levels": [L(cost=700_000, welfare=2), L(cost=1_500_000, welfare=2), L(cost=3_000_000, welfare=2), L(cost=5_800_000, welfare=2), L(cost=10_000_000, welfare=2)],
    },
}

UPKEEP_RATE = 0.005   # هزینهٔ نگهداری روزانه = ۰٫۵٪ مجموع پولِ خرج‌شده روی ساخت و ارتقا

def infra_upkeep(item, lv):
    if lv <= 0 or item.get("group") == "eco": return 0
    levels = item["levels"]
    invested = sum(l["cost"] for l in levels[:min(lv, len(levels))])
    return int(round(invested * UPKEEP_RATE / 100.0)) * 100

ECONOMY = {
    "eco_agriculture": {
        "name": "کشاورزی و دامداری", "group": "eco", "icon": "🌾",
        "desc": "سرمایه‌گذاری کم‌ریسک در تولید و صادرات محصولات غذایی.", "power_required": 2,
        "levels": [L(cost=900_000, income=250_000), L(cost=1_500_000, income=400_000), L(cost=2_300_000, income=600_000), L(cost=3_300_000, income=850_000), L(cost=4_500_000, income=1_150_000)],
    },
    "eco_textile": {
        "name": "کارخانه نساجی", "group": "eco", "icon": "🧵",
        "desc": "تولید پوشاک و منسوجات برای بازار داخلی و صادرات.", "power_required": 3,
        "levels": [L(cost=1_140_000, income=300_000), L(cost=1_820_000, income=480_000), L(cost=2_740_000, income=720_000), L(cost=3_800_000, income=1_000_000), L(cost=5_300_000, income=1_400_000)],
    },
    "eco_fishing": {
        "name": "شیلات و فرآوری غذا", "group": "eco", "icon": "🐟",
        "desc": "صادرات محصولات دریایی با سرمایه‌گذاری آغازین مناسب.", "power_required": 2,
        "levels": [L(cost=1_050_000, income=275_000), L(cost=1_700_000, income=450_000), L(cost=2_600_000, income=680_000), L(cost=3_700_000, income=950_000), L(cost=5_000_000, income=1_300_000)],
    },
    "eco_construction": {
        "name": "شرکت عمرانی", "group": "eco", "icon": "🏗️",
        "desc": "پروژه‌های ساخت‌وساز داخلی و قراردادهای عمرانی.", "power_required": 3,
        "levels": [L(cost=1_520_000, income=400_000), L(cost=2_280_000, income=600_000), L(cost=3_420_000, income=900_000), L(cost=4_750_000, income=1_250_000), L(cost=6_460_000, income=1_700_000)],
    },
    "eco_mining": {
        "name": "معدن‌کاری", "group": "eco", "icon": "⛏️",
        "desc": "استخراج و فروش مواد معدنی؛ درآمد مناسب با مصرف برق بیشتر.", "power_required": 4,
        "levels": [L(cost=1_520_000, income=400_000), L(cost=2_360_000, income=620_000), L(cost=3_420_000, income=900_000), L(cost=4_750_000, income=1_250_000), L(cost=6_460_000, income=1_700_000)],
    },
    "eco_steel": {
        "name": "کارخانه فولاد", "group": "eco", "icon": "⚙️",
        "desc": "تولید محصولات فلزی و صنعتی با هزینهٔ آغازین بالاتر.", "power_required": 5,
        "levels": [L(cost=1_900_000, income=500_000), L(cost=2_890_000, income=760_000), L(cost=4_100_000, income=1_080_000), L(cost=5_620_000, income=1_480_000), L(cost=7_600_000, income=2_000_000)],
    },
    "eco_tourism": {
        "name": "گردشگری و هتل‌داری", "group": "eco", "icon": "🏨",
        "desc": "درآمد از گردشگری، هتل‌ها و خدمات شهری.", "power_required": 4,
        "levels": [L(cost=2_090_000, income=550_000), L(cost=3_040_000, income=800_000), L(cost=4_370_000, income=1_150_000), L(cost=6_080_000, income=1_600_000), L(cost=8_170_000, income=2_150_000)],
    },
    "eco_trade": {
        "name": "تجارت بین‌الملل", "group": "eco", "icon": "🚢",
        "desc": "گسترش شبکهٔ واردات و صادرات کشور.", "power_required": 6,
        "levels": [L(cost=2_470_000, income=650_000), L(cost=3_610_000, income=950_000), L(cost=5_130_000, income=1_350_000), L(cost=7_030_000, income=1_850_000), L(cost=9_500_000, income=2_500_000)],
    },
    "eco_electronics": {
        "name": "کارخانهٔ تجهیزات الکترونیکی", "group": "eco", "icon": "🔌",
        "desc": "مونتاژ و فروش تجهیزات برقی و الکترونیکی.", "power_required": 7,
        "levels": [L(cost=2_660_000, income=700_000), L(cost=3_990_000, income=1_050_000), L(cost=5_700_000, income=1_500_000), L(cost=7_790_000, income=2_050_000), L(cost=10_260_000, income=2_700_000)],
    },
    "eco_oil": {
        "name": "پالایشگاه نفت", "group": "eco", "icon": "🛢️",
        "desc": "تبدیل نفت خام به فرآورده‌های قابل صادرات.", "power_required": 8,
        "levels": [L(cost=3_230_000, income=850_000), L(cost=4_560_000, income=1_200_000), L(cost=6_460_000, income=1_700_000), L(cost=8_740_000, income=2_300_000), L(cost=11_780_000, income=3_100_000)],
    },
    "eco_chemicals": {
        "name": "مجتمع پتروشیمی", "group": "eco", "icon": "🧪",
        "desc": "تولید مواد شیمیایی و فرآورده‌های صنعتی برای صادرات.", "power_required": 9,
        "levels": [L(cost=3_420_000, income=900_000), L(cost=5_130_000, income=1_350_000), L(cost=7_220_000, income=1_900_000), L(cost=9_690_000, income=2_550_000), L(cost=12_540_000, income=3_300_000)],
    },
    "eco_bank": {
        "name": "بانک مرکزی", "group": "eco", "icon": "🏦",
        "desc": "زیرساخت مالی کشور؛ درآمد بالا با سرمایه‌گذاری بیشتر.", "power_required": 10,
        "levels": [L(cost=3_800_000, income=1_000_000), L(cost=5_700_000, income=1_500_000), L(cost=8_360_000, income=2_200_000), L(cost=11_400_000, income=3_000_000), L(cost=15_200_000, income=4_000_000)],
    },
}

ARMY_UNITS = {
    "infantry": {"name": "پیاده‌نظام", "group": "land", "requires": ["land_barracks", "land_hq"],
        "cost": 50_000, "manpower": 300, "resources": {"food": 100},
        "attack": 20, "defense": 10},
    "tank": {"name": "تانک", "group": "land", "requires": ["land_barracks", "land_hq", "land_tank_factory"],
        "cost": 150_000, "manpower": 250, "resources": {"steel": 300, "food": 150},
        "attack": 50, "defense": 25},
    "ship": {"name": "ناو دریایی", "group": "naval", "requires": ["naval_port", "naval_shipyard"],
        "cost": 250_000, "manpower": 200, "resources": {"oil": 250, "food": 150},
        "attack": 50, "defense": 60},
    "submarine": {"name": "زیردریایی", "group": "naval", "requires": ["naval_port", "naval_shipyard"],
        "cost": 200_000, "manpower": 120, "resources": {"oil": 200, "steel": 150},
        "attack": 45, "defense": 25},
    "transport_ship": {"name": "ناو ترابری", "group": "naval", "requires": ["naval_port", "naval_shipyard"],
        "cost": 180_000, "manpower": 150, "resources": {"oil": 150, "steel": 200},
        "attack": 5, "defense": 40, "transport_capacity": 500},
    "aircraft_carrier": {"name": "ناو هواپیمابر", "group": "naval", "requires": ["naval_port", "naval_shipyard"],
        "cost": 800_000, "manpower": 500, "resources": {"oil": 800, "steel": 1200},
        "attack": 25, "defense": 90, "aircraft_capacity": 40},
    "fighter": {"name": "جنگنده", "group": "air", "requires": ["air_airport", "air_arsenal"],
        "cost": 200_000, "manpower": 150, "resources": {"oil": 200, "steel": 100},
        "attack": 45, "defense": 40},
    "bomber": {"name": "بمب‌افکن", "group": "air", "requires": ["air_airport", "air_arsenal"],
        "cost": 250_000, "manpower": 180, "resources": {"oil": 300, "steel": 150},
        "attack": 60, "defense": 15},
    "helicopter": {"name": "بالگرد", "group": "air", "requires": ["air_airport", "air_arsenal"],
        "cost": 120_000, "manpower": 100, "resources": {"oil": 120, "steel": 60},
        "attack": 30, "defense": 35},
    "air_tanker": {"name": "هواپیمای سوخت‌رسان", "group": "air", "requires": ["air_airport", "air_arsenal"],
        "cost": 220_000, "manpower": 120, "resources": {"oil": 250, "steel": 120},
        "attack": 2, "defense": 20, "refuel_capacity": 20},
    # موشک‌ها: علاوه بر هزینهٔ یک‌باره، هر موشکِ موجود هر روز غذا، نفت و آهن مصرف می‌کند
    "cruise_missile": {"name": "موشک کروز", "group": "missile", "requires": ["missile_depot", "missile_factory"],
        "min_level": {"missile_factory": 1},
        "cost": 400_000, "manpower": 100, "resources": {"steel": 300, "oil": 200, "food": 50},
        "daily": {"food": 2, "oil": 5, "steel": 3},
        "attack": 70, "defense": 5},
    "ballistic_missile": {"name": "موشک بالستیک", "group": "missile", "requires": ["missile_depot", "missile_factory"],
        "min_level": {"missile_factory": 3},
        "cost": 900_000, "manpower": 150, "resources": {"steel": 600, "oil": 400, "food": 100},
        "daily": {"food": 3, "oil": 10, "steel": 6},
        "attack": 120, "defense": 10},
    "icbm": {"name": "موشک قاره‌پیما", "group": "missile", "requires": ["missile_depot", "missile_factory"],
        "min_level": {"missile_factory": 5},
        "cost": 2_500_000, "manpower": 300, "resources": {"steel": 1200, "oil": 900, "food": 200},
        "daily": {"food": 5, "oil": 20, "steel": 12},
        "attack": 250, "defense": 20},
}

MAP_RESOURCES = {
    # همهٔ سکوها و معدن‌ها در دریا هستند (روی خشکی کشور فعال نمی‌افتند) — zone: sea
    # ---------- نفت ----------
    "oil_gulf": {"type": "oil", "zone": "sea", "name": "سکوی قطر", "lon": 51.5, "lat": 27.0, "production": 5_000_000},
    "oil_caspian": {"type": "oil", "zone": "sea", "name": "سکوی آذربایجان", "lon": 50.8, "lat": 40.2, "production": 3_000_000},
    "oil_northsea": {"type": "oil", "zone": "sea", "name": "سکوی دانمارک", "lon": 3.2, "lat": 56.5, "production": 4_000_000},
    "oil_gom": {"type": "oil", "zone": "sea", "name": "سکوی آمریکا (خلیج مکزیک)", "lon": -90.5, "lat": 28.2, "production": 4_000_000},
    "oil_campos": {"type": "oil", "zone": "sea", "name": "سکوی برزیل", "lon": -40.0, "lat": -22.5, "production": 2_500_000},
    "oil_texas": {"type": "oil", "zone": "sea", "name": "سکوی مکزیک", "lon": -94.5, "lat": 26.5, "production": 4_000_000},
    "oil_ghawar": {"type": "oil", "zone": "sea", "name": "سکوی امارات", "lon": 54.0, "lat": 25.6, "production": 5_000_000},
    "oil_siberia": {"type": "oil", "zone": "sea", "name": "سکوی روسیه (کارا)", "lon": 74.0, "lat": 76.0, "production": 4_000_000},
    "oil_westafrica": {"type": "oil", "zone": "sea", "name": "سکوی نیجریه", "lon": 5.0, "lat": 3.0, "production": 3_500_000},
    "oil_angola": {"type": "oil", "zone": "sea", "name": "سکوی آنگولا", "lon": 11.0, "lat": -9.0, "production": 3_000_000},
    "oil_barents": {"type": "oil", "zone": "sea", "name": "سکوی روسیه (بارنتس)", "lon": 38.0, "lat": 73.0, "production": 3_000_000},
    "oil_southchina": {"type": "oil", "zone": "sea", "name": "سکوی ویتنام", "lon": 111.0, "lat": 13.0, "production": 3_500_000},
    "oil_beaufort": {"type": "oil", "zone": "sea", "name": "سکوی آمریکا (بوفورت)", "lon": -145.0, "lat": 71.5, "production": 3_000_000},
    "oil_norway": {"type": "oil", "zone": "sea", "name": "سکوی نروژ", "lon": 2.0, "lat": 60.5, "production": 3_500_000},
    "oil_india": {"type": "oil", "zone": "sea", "name": "سکوی هند", "lon": 70.5, "lat": 19.5, "production": 3_500_000},
    "oil_medeast": {"type": "oil", "zone": "sea", "name": "سکوی مصر", "lon": 29.5, "lat": 33.0, "production": 2_500_000},
    # ---------- آهن ----------
    "steel_ural": {"type": "steel", "zone": "sea", "name": "معدن آهن قزاقستان (خزر)", "lon": 50.5, "lat": 42.5, "production": 3_000_000},
    "steel_ruhr": {"type": "steel", "zone": "sea", "name": "معدن آهن هلند", "lon": 3.0, "lat": 53.5, "production": 4_000_000},
    "steel_brazil": {"type": "steel", "zone": "sea", "name": "معدن آهن برزیل", "lon": -33.0, "lat": -8.0, "production": 3_500_000},
    "steel_mesabi": {"type": "steel", "zone": "sea", "name": "معدن آهن کانادا (گرند بنکس)", "lon": -51.0, "lat": 44.0, "production": 3_000_000},
    "steel_anshan": {"type": "steel", "zone": "sea", "name": "معدن آهن چین", "lon": 123.5, "lat": 35.5, "production": 3_500_000},
    "steel_japan": {"type": "steel", "zone": "sea", "name": "معدن آهن ژاپن", "lon": 145.0, "lat": 35.0, "production": 3_500_000},
    "steel_tasman": {"type": "steel", "zone": "sea", "name": "معدن آهن استرالیا", "lon": 156.0, "lat": -30.0, "production": 3_000_000},
    "steel_arabian": {"type": "steel", "zone": "sea", "name": "معدن آهن هند", "lon": 71.0, "lat": 15.0, "production": 3_000_000},
    "steel_biscay": {"type": "steel", "zone": "sea", "name": "معدن آهن فرانسه", "lon": -6.0, "lat": 45.5, "production": 3_000_000},
    # ---------- اورانیوم ----------
    "uranium_kazakh": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم یونان (آیونی)", "lon": 18.0, "lat": 35.5, "production": 2_500_000},
    "uranium_canada": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم کانادا", "lon": -85.0, "lat": 59.5, "production": 2_000_000},
    "uranium_aussie": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم استرالیا", "lon": 128.0, "lat": -11.5, "production": 2_200_000},
    "uranium_niger": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم موریتانی", "lon": -20.0, "lat": 18.0, "production": 2_000_000},
    "uranium_namibia": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم نامیبیا", "lon": 7.0, "lat": -22.0, "production": 2_000_000},
    "uranium_indian": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم اقیانوس هند", "lon": 75.0, "lat": -10.0, "production": 2_200_000},
    "uranium_pacific": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم اقیانوس آرام", "lon": -150.0, "lat": 0.0, "production": 2_200_000},
    "uranium_baltic": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم لیتوانی", "lon": 19.5, "lat": 55.5, "production": 2_000_000},
    # ---------- غذا (آبزیان) ----------
    "food_ukraine": {"type": "food", "zone": "sea", "name": "ماهیگیری رومانی (دریای سیاه)", "lon": 31.0, "lat": 43.5, "production": 2_500_000},
    "food_india": {"type": "food", "zone": "sea", "name": "ماهیگیری هند (خلیج بنگال)", "lon": 88.0, "lat": 14.0, "production": 2_500_000},
    "food_peru": {"type": "food", "zone": "sea", "name": "ماهیگیری پرو", "lon": -80.0, "lat": -12.5, "production": 2_500_000},
    "food_norway": {"type": "food", "zone": "sea", "name": "ماهیگیری نروژ", "lon": 5.0, "lat": 67.0, "production": 2_500_000},
    "food_japansea": {"type": "food", "zone": "sea", "name": "ماهیگیری ژاپن", "lon": 135.0, "lat": 40.0, "production": 2_500_000},
    "food_bering": {"type": "food", "zone": "sea", "name": "ماهیگیری آمریکا (برینگ)", "lon": -170.0, "lat": 58.0, "production": 2_500_000},
    # ---------- آفریقا: منابع بیشتر از هر منطقهٔ دیگر ----------
    "oil_gabon": {"type": "oil", "zone": "sea", "name": "سکوی گابن", "lon": 8.0, "lat": -2.5, "production": 3_500_000},
    "oil_ghana": {"type": "oil", "zone": "sea", "name": "سکوی غنا", "lon": -2.5, "lat": 3.8, "production": 3_000_000},
    "oil_libya": {"type": "oil", "zone": "sea", "name": "سکوی لیبی", "lon": 19.0, "lat": 33.0, "production": 4_000_000},
    "oil_algeria": {"type": "oil", "zone": "sea", "name": "سکوی الجزایر", "lon": 5.0, "lat": 38.0, "production": 3_500_000},
    "oil_redsea": {"type": "oil", "zone": "sea", "name": "سکوی سودان (دریای سرخ)", "lon": 37.8, "lat": 21.5, "production": 3_000_000},
    "oil_mozambique": {"type": "oil", "zone": "sea", "name": "سکوی موزامبیک", "lon": 42.5, "lat": -13.5, "production": 3_000_000},
    "oil_namibia": {"type": "oil", "zone": "sea", "name": "سکوی نامیبیا", "lon": 11.0, "lat": -27.0, "production": 3_000_000},
    "oil_senegal": {"type": "oil", "zone": "sea", "name": "سکوی سنگال", "lon": -18.0, "lat": 13.5, "production": 3_000_000},
    "steel_safrica": {"type": "steel", "zone": "sea", "name": "معدن آهن آفریقای جنوبی", "lon": 16.0, "lat": -34.5, "production": 3_500_000},
    "steel_morocco": {"type": "steel", "zone": "sea", "name": "معدن آهن مراکش", "lon": -11.5, "lat": 31.0, "production": 3_000_000},
    "steel_tanzania": {"type": "steel", "zone": "sea", "name": "معدن آهن تانزانیا", "lon": 41.5, "lat": -7.0, "production": 3_000_000},
    "steel_guinea": {"type": "steel", "zone": "sea", "name": "معدن آهن گینه بیسائو", "lon": -17.5, "lat": 10.0, "production": 3_000_000},
    "uranium_safrica": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم آفریقای جنوبی", "lon": 15.0, "lat": -31.5, "production": 2_400_000},
    "uranium_madagascar": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم ماداگاسکار", "lon": 50.8, "lat": -17.0, "production": 2_200_000},
    "uranium_gabon": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم کنگو", "lon": 7.0, "lat": -6.0, "production": 2_200_000},
    "food_namibia": {"type": "food", "zone": "sea", "name": "ماهیگیری نامیبیا (بنگوئلا)", "lon": 12.5, "lat": -24.0, "production": 2_500_000},
    "food_senegal": {"type": "food", "zone": "sea", "name": "ماهیگیری سنگال", "lon": -18.5, "lat": 15.5, "production": 2_500_000},
    "food_somalia": {"type": "food", "zone": "sea", "name": "ماهیگیری سومالی", "lon": 52.5, "lat": 10.0, "production": 2_500_000},
    "food_madagascar": {"type": "food", "zone": "sea", "name": "ماهیگیری ماداگاسکار", "lon": 42.5, "lat": -19.0, "production": 2_500_000},
    "food_safrica": {"type": "food", "zone": "sea", "name": "ماهیگیری آفریقای جنوبی", "lon": 14.5, "lat": -31.0, "production": 2_500_000},
    # ---------- نفتِ بیشتر در سایر مناطق ----------
    "oil_brunei": {"type": "oil", "zone": "sea", "name": "سکوی برونئی", "lon": 113.0, "lat": 5.8, "production": 3_000_000},
    "oil_indonesia": {"type": "oil", "zone": "sea", "name": "سکوی اندونزی", "lon": 108.0, "lat": -4.5, "production": 3_000_000},
    "oil_australia": {"type": "oil", "zone": "sea", "name": "سکوی استرالیا", "lon": 115.0, "lat": -19.5, "production": 3_000_000},
    "oil_venezuela": {"type": "oil", "zone": "sea", "name": "سکوی ونزوئلا", "lon": -64.0, "lat": 12.5, "production": 3_500_000},
    "oil_guyana": {"type": "oil", "zone": "sea", "name": "سکوی گویان", "lon": -56.0, "lat": 8.5, "production": 3_000_000},
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
    "taiwan": {"name": "تنگه تایوان", "lon": 119.6, "lat": 24.4, "income": 20_000},
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

def get_game_time(player):
    started_at = player.get("started_at")
    if not started_at:
        return {"day": 1, "season": SEASONS[0], "season_days_left": DAYS_PER_SEASON,
                "season_hours_left": 0, "next_season": SEASONS[1],
                "season_hint": SEASON_HINTS[SEASONS[0]]}
    started = parse_dt(started_at); now = utcnow()
    elapsed_days = max(0, (now - started).total_seconds() / 86400)
    day = min(GAME_TOTAL_DAYS, int(elapsed_days) + 1)
    si = ((day - 1) // DAYS_PER_SEASON) % len(SEASONS)
    season_end = started + timedelta(days=(si + 1) * DAYS_PER_SEASON)
    game_end = started + timedelta(days=GAME_TOTAL_DAYS)
    season_end = min(season_end, game_end)
    remaining = season_end - now
    if remaining.total_seconds() < 0: remaining = timedelta(0)
    return {"season_end": season_end.isoformat(), "day": day, "season": SEASONS[si], "season_days_left": remaining.days,
            "season_hours_left": remaining.seconds // 3600,
            "next_season": SEASONS[(si + 1) % len(SEASONS)],
            "season_hint": SEASON_HINTS.get(SEASONS[si], "")}

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
        if lv > 0: total += item["levels"][min(lv, len(item["levels"])) - 1]["capacity"]
    return total

def get_power_used(player):
    total = 0
    for item_id, item in ECONOMY.items():
        lv = get_infra_level(player, item_id)
        if lv > 0: total += item["power_required"] * lv
    for item_id, item in INFRASTRUCTURE.items():
        lv = get_infra_level(player, item_id)
        if lv > 0: total += item.get("power_required", 0) * min(lv, len(item["levels"]))
    return total

def get_group_capacity(player, group):
    total = 0
    for item_id, item in INFRASTRUCTURE.items():
        if item.get("group") != group: continue
        lv = get_infra_level(player, item_id)
        if lv > 0: total += item["levels"][min(lv, len(item["levels"])) - 1].get("capacity", 0)
    return total

def group_defense_mult(player, group):
    # سطح ۱ اثری ندارد؛ از سطح ۲ به بعد هر ارتقا درصدِ دفاع اضافه می‌کند
    t = 0.0
    for iid, item in INFRASTRUCTURE.items():
        v = item.get("bonus", {}).get("defense")
        if not v or item.get("group") != group: continue
        t += v * max(0, min(get_infra_level(player, iid), len(item["levels"])) - 1)
    return 1 + t

def get_group_units(player, group):
    total = 0
    dep = deployed_units(player.get("country"))
    for unit_id, unit in ARMY_UNITS.items():
        if unit["group"] == group:
            total += player.get("units", {}).get(unit_id, 0) + dep.get(unit_id, 0)
    return total

def recompute_army(player):
    """قدرت کل همهٔ یگان‌های زندهٔ کشور؛ خانه، مواضع تصرف‌شده و مسیر حرکت."""
    total = 0
    cid = player.get("country")
    dep = deployed_units(cid)
    in_transit = {}
    # اعزام نیرو آن‌ها را از واحدهای داخل کشور خارج می‌کند؛ تا رسیدن/بازگشت،
    # نباید قدرتشان از جمع قدرت نظامی ناپدید شود.
    for transit in transits:
        if transit.get("owner") != cid:
            continue
        for uid_, count in (transit.get("units") or {}).items():
            in_transit[uid_] = in_transit.get(uid_, 0) + max(0, int(count or 0))
    for unit_id, unit in ARMY_UNITS.items():
        dm = group_defense_mult(player, unit["group"])
        count = (player.get("units", {}).get(unit_id, 0)
                 + dep.get(unit_id, 0) + in_transit.get(unit_id, 0))
        total += max(0, count) * (unit["attack"] + unit["defense"] * dm)
    player["army"] = int(round(total))

def ensure_player_fields(player):
    player.setdefault("resources", dict(STARTING_RESOURCES))
    for k in RESOURCE_NAMES: player["resources"].setdefault(k, 0)
    units = player.setdefault("units", {})
    for uid_ in ARMY_UNITS: units.setdefault(uid_, 0)
    for stale in [k for k in units if k not in ARMY_UNITS]: del units[stale]
    lv_map = player.setdefault("infra_levels", {})
    for k in list(lv_map):
        if k in INFRASTRUCTURE: lv_map[k] = min(lv_map[k], len(INFRASTRUCTURE[k]["levels"]))
        elif k not in ECONOMY: del lv_map[k]
    player.setdefault("map_holdings", {})
    player.setdefault("strait_holdings", {})
    player.setdefault("announcements", {}); player.setdefault("land_trade_open", True)
    player.setdefault("is_eliminated", False)
    player.setdefault("scans", 0)
    player.setdefault("scan_active", {})
    player.setdefault("vip", False)
    player.setdefault("welfare_events", [])

# ---------------- رفاه و امنیت ----------------
WELFARE_PER_LEVEL = 2.0                 # هر سطح ساختمان = ۲ واحد (٪)
WELFARE_MAX = 50.0                      # سقف پاداش
WELFARE_RECOVERY_PER_PERIOD = 3.0       # هر دوره ۳ واحد جبران می‌شود
WELFARE_RECOVERY_PERIOD_HOURS = 6
WELFARE_EVENT_MIN_H, WELFARE_EVENT_MAX_H = 2, 6
WELFARE_EVENTS = {
    "earthquake": {"name": "زلزله",     "icon": "🌋", "bld": "housing",    "drop": 6.0, "chance": 0.7},
    "pandemic":   {"name": "همه‌گیری",   "icon": "🦠", "bld": "hospital",   "drop": 5.0, "chance": 0.7},
    "crime":      {"name": "موج سرقت",  "icon": "🚨", "bld": "police",     "drop": 4.0, "chance": 0.8},
    "drought":    {"name": "خشکسالی",   "icon": "⚠️", "bld": "university", "drop": 3.0, "chance": 0.7},
    "famine":     {"name": "قحطی",      "icon": "🍞", "bld": "metro",      "drop": 5.0, "chance": 0.6},
}
COUNTRY_RISKS = {"germany": ["crime"], "britain": ["pandemic"], "ussr": ["famine", "drought"],
                 "usa": ["crime", "earthquake"], "france": ["drought"], "italy": ["earthquake"],
                 "china": ["pandemic", "earthquake"], "japan": ["earthquake"]}

def welfare_gross(player):
    total = 0
    for item_id, item in INFRASTRUCTURE.items():
        if item.get("group") != "welfare": continue
        lv = min(get_infra_level(player, item_id), len(item["levels"]))
        total += lv * WELFARE_PER_LEVEL
    return min(WELFARE_MAX, total)

def welfare_penalty_now(player):
    pen = player.get("welfare_penalty", 0) or 0
    at = parse_dt(player.get("welfare_pen_at"))
    if pen <= 0 or not at: return 0.0
    hours = max(0.0, (utcnow() - at).total_seconds() / 3600)
    return max(0.0, pen - WELFARE_RECOVERY_PER_PERIOD * hours / WELFARE_RECOVERY_PERIOD_HOURS)

def welfare_bonus(player):
    return max(0.0, welfare_gross(player) - welfare_penalty_now(player))

def compute_rates(player):
    power_capacity = get_power_total(player)
    power_consumption = get_power_used(player)
    manpower_production = BASE_MANPOWER_PRODUCTION
    resource_production = {k: 0 for k in RESOURCE_NAMES}
    resource_consumption = {k: 0 for k in RESOURCE_NAMES}
    base_income = BASE_DAILY_INCOME
    income = base_income
    eco_income = 0
    map_income = 0
    strait_income = 0
    occupation_income = 0
    upkeep = 0

    for item_id, item in INFRASTRUCTURE.items():
        group = item.get("group")
        lv = min(get_infra_level(player, item_id), len(item["levels"]))
        if lv <= 0: continue
        upkeep += infra_upkeep(item, lv)
        lvl = item["levels"][lv - 1]
        if group == "manpower": manpower_production += lvl["production"]
        elif group == "resource":
            key = item.get("resource_key")
            if key: resource_production[key] += lvl["production"]

    for item_id, item in ECONOMY.items():
        lv = get_infra_level(player, item_id)
        if lv > 0: eco_income += item["levels"][lv - 1]["income"]
    # درآمد ساختمان‌های اقتصادی ابتدا بدون پاداش رفاه جمع می‌شود.
    income += eco_income
    wb = welfare_bonus(player)

    country = player.get("country")

    # ----- منابع تصرف‌شده روی نقشه (باگ قبلی: از دیکشنری گلوبال می‌خوانیم) -----
    for key, owner in map_holdings.items():
        if owner != country: continue
        res = MAP_RESOURCES.get(key)
        if not res: continue
        if res["type"] == "oil":
            gain = res["production"] // 10
            income += gain
            map_income += gain
            resource_production["oil"] += res["production"] // 5
        elif res["type"] == "food":    resource_production["food"]    += res["production"] // 5
        elif res["type"] == "steel":   resource_production["steel"]   += res["production"] // 5
        elif res["type"] == "uranium": resource_production["uranium"] += res["production"] // 5

    for key, owner in strait_holdings.items():
        if owner != country: continue
        s = STRAITS_DATA.get(key)
        if s:
            income += s["income"]
            strait_income += s["income"]

    for target_country, occupier in occupied_countries.items():
        if occupier == country:
            income += 500_000
            occupation_income += 500_000

    # پاداش رفاه روی درآمد کل روزانه اعمال می‌شود تا در خزانه و آمار روزانه دیده شود.
    income_before_welfare = income
    welfare_extra_income = income_before_welfare * wb / 100.0
    income += welfare_extra_income

    # ----- اثر فصل روی غذا/نفت -----
    season = get_game_time(player)["season"]
    mult = SEASON_FOOD_OIL_MULT.get(season, 1.0)
    if mult < 1.0:
        for key in ("food", "oil"):
            raw = resource_production[key]
            reduced = int(raw * mult)
            resource_consumption[key] = raw - reduced
            resource_production[key] = reduced

    # مصرف روزانهٔ موشک‌ها
    for uid_, u in ARMY_UNITS.items():
        n = player.get("units", {}).get(uid_, 0)
        if n > 0:
            for k, a in u.get("daily", {}).items(): resource_consumption[k] += a * n

    return {"gross_income": income, "income_before_welfare": income_before_welfare,
            "base_income": base_income, "economy_income": eco_income,
            "map_income": map_income, "strait_income": strait_income,
            "occupation_income": occupation_income,
            "welfare_extra_income": welfare_extra_income,
            "net_income": income - upkeep, "daily_upkeep": upkeep,
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
    _gain = rates["net_income"] * f
    player["money"] = max(0, player.get("money", STARTING_MONEY) + _gain)
    if _gain > 0:
        player["money"] -= loan_garnish(player, min(_gain, player["money"]))
    player["manpower"] = player.get("manpower", STARTING_MANPOWER) + rates["manpower_production"] * f
    ensure_player_fields(player)
    for key, amount in rates["resource_production"].items():
        player["resources"][key] = player["resources"].get(key, 0) + amount * f
    for key, amount in rates["resource_consumption"].items():
        if amount > 0:
            player["resources"][key] = max(0, player["resources"].get(key, 0) - amount * f)
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
            "resource_key": item.get("resource_key"), "bonus": item.get("bonus"),
            "power_required": item.get("power_required"),
            "level": lv, "max_level": len(levels),
            "current": current, "next": next_info,
            "upkeep": infra_upkeep(item, lv),
            "next_upkeep": infra_upkeep(item, nxt) if next_info else 0,
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
    data["daily_upkeep"] = rates["daily_upkeep"]
    data["infra"] = build_catalog_status(player, INFRASTRUCTURE)
    data["economy"] = build_catalog_status(player, ECONOMY)
    data["satellite_built"] = get_infra_level(player, "satellite") > 0
    data["def_mult"] = {g: group_defense_mult(player, g) for g in ("land", "naval", "air", "missile")}
    return data

# =========================================================
# State
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
pm_read = {}   # cid -> {other_cid: تعداد پیام‌های دیده‌شده}
market_listings = {}
news_feed = []
site_forces = {}   # site_id -> {"owner": country, "units": {unit_id: n}}
war_events = []    # خبرهای جنگ
war_history = []   # تاریخچهٔ درگیری‌ها
transits = []      # نیروهای در راه
loans = {}         # وام‌ها

def create_player(user_id):
    return {"user_id": user_id, "country": None, "money": STARTING_MONEY, "army": 0,
            "manpower": STARTING_MANPOWER, "infra_levels": {},
            "units": {uid_: 0 for uid_ in ARMY_UNITS}, "resources": dict(STARTING_RESOURCES),
            "map_holdings": {}, "strait_holdings": {}, "announcements": {}, "land_trade_open": True,
            "is_eliminated": False, "started_at": None, "last_update": None}

def get_player_by_country(country_id):
    for uid_, p in players.items():
        if p.get("country") == country_id: return uid_, p
    return None, None

def classify_news(title, text="", kind="info"):
    """دسته‌بندی اخبار برای فیلترهای بخش ارتباطات."""
    source = f"{title or ''} {text or ''}".lower()
    if "اتحادیه" in source:
        return "union"
    if any(word in source for word in ("جنگ", "نبرد", "دفاع", "حمله", "اشغال", "تلفات", "نیرو", "ارتش", "پیروزی", "شکست")):
        return "military"
    if any(word in source for word in ("پیمان", "عدم تجاوز", "اتحاد", "دیپلماسی", "بیانیه", "مذاکره")):
        return "diplomacy"
    if any(word in source for word in ("معامله", "تجارت", "بازار", "مرز زمینی", "حمل‌ونقل", "حمل و نقل")):
        return "trade"
    if any(word in source for word in ("تصرف", "تنگه", "قلمرو", "مرز", "منطقه")):
        return "territory"
    if any(word in source for word in ("وام", "درآمد", "اقتصاد", "تسویه", "غذا", "نفت", "آهن", "اورانیوم", "منبع", "منابع")):
        return "economy"
    return "general"

def push_news(title, text, kind="info"):
    news_feed.append({"id": str(uuid.uuid4()), "title": title, "text": text,
                      "kind": kind, "category": classify_news(title, text, kind),
                      "at": utcnow().isoformat()})
    if len(news_feed) > 200: del news_feed[:50]

def save_state():
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        state = {"players": {str(k): v for k, v in players.items()},
                 "diplomacy_proposals": diplomacy_proposals, "active_treaties": active_treaties,
                 "map_holdings": map_holdings, "strait_holdings": strait_holdings,
                 "occupied_countries": occupied_countries, "war_declarations": war_declarations,
                 "active_wars": active_wars, "war_reports": war_reports[-50:],
                 "announcements": announcements[-100:], "unions": unions,
                 "private_messages": private_messages, "pm_read": pm_read, "market_listings": market_listings,
                 "news_feed": news_feed[-200:],
                 "straits_data": STRAITS_DATA,
                 "transits": transits, "site_forces": site_forces, "war_events": war_events[-300:], "war_history": war_history[-300:],
                 "loans": loans}
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False)
        os.replace(tmp, STATE_FILE)
    except Exception as e:
        logging.error("save_state failed: %s", e)

def load_state():
    global diplomacy_proposals, active_treaties, map_holdings, strait_holdings
    global occupied_countries, war_declarations, active_wars, war_reports
    global announcements, unions, private_messages, pm_read, market_listings, news_feed
    global site_forces, war_events, war_history, loans, transits
    if not os.path.exists(STATE_FILE):
        logging.info("No state, fresh start."); return
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f: state = json.load(f)
        for k, v in state.get("players", {}).items(): players[int(k)] = v
        diplomacy_proposals = state.get("diplomacy_proposals", {})
        active_treaties = state.get("active_treaties", [])
        map_holdings = state.get("map_holdings", {})
        strait_holdings = state.get("strait_holdings", {})
        occupied_countries = state.get("occupied_countries", {})
        war_declarations = state.get("war_declarations", {})
        active_wars = state.get("active_wars", {})
        war_reports = state.get("war_reports", [])
        announcements = state.get("announcements", [])
        unions = state.get("unions", {})
        private_messages = state.get("private_messages", {})
        pm_read = state.get("pm_read", {})
        market_listings = state.get("market_listings", {})
        news_feed = state.get("news_feed", [])
        for _sid, _sv in state.get("straits_data", {}).items():
            if _sid in STRAITS_DATA:
                STRAITS_DATA[_sid].update({"toll": _sv.get("toll", STRAITS_DATA[_sid].get("toll",0)), "closed": _sv.get("closed", STRAITS_DATA[_sid].get("closed",False))})
        site_forces = state.get("site_forces", {})
        war_events = state.get("war_events", [])
        war_history = state.get("war_history", [])
        transits = state.get("transits", [])
        loans = state.get("loans", {})
        logging.info("State loaded: %d players", len(players))
    except Exception as e:
        logging.error("load_state failed: %s", e)

async def autosave_loop():
    while True:
        await asyncio.sleep(60); save_state()

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

class GameEntryButtonMiddleware(BaseRequestMiddleware):
    """Append a persistent WebApp entry button to every message sent by the bot."""
    async def __call__(self, make_request, bot, method):
        if isinstance(method, SendMessage):
            entry_button = InlineKeyboardButton(
                text="🎮 ورود به بازی",
                web_app=WebAppInfo(url=WEB_APP_URL)
            )
            markup = getattr(method, "reply_markup", None)
            if isinstance(markup, InlineKeyboardMarkup):
                rows = [list(row) for row in markup.inline_keyboard]
                already_present = any(
                    button.web_app is not None and button.web_app.url == WEB_APP_URL
                    for row in rows for button in row
                )
                if not already_present:
                    rows.append([entry_button])
                method.reply_markup = InlineKeyboardMarkup(inline_keyboard=rows)
            else:
                # SendMessage permits only one reply markup type; inline markup is
                # used here so the game entry button is always available below text.
                method.reply_markup = InlineKeyboardMarkup(inline_keyboard=[[entry_button]])
        return await make_request(bot, method)

bot.session.middleware(GameEntryButtonMiddleware())

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
        text = "⚔️ به FRONT-LINE 1993 خوش آمدید.\nابتدا کشور خود را انتخاب کنید."
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
        push_war("declare", f"{COUNTRIES[w['attacker']]['name']} به {COUNTRIES[w['defender']]['name']} اعلان جنگ کرد.", [w["attacker"], w["defender"]])
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
    req_power = item.get("power_required", 0)
    if req_power and get_power_total(p) < get_power_used(p) + req_power:
        return web.json_response({"success": False, "error": "not_enough_power",
                                  "message": "برق کافی ندارید. ابتدا نیروگاه بسازید یا ارتقا دهید."}, status=400)
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
    count = max(1, min(count, 100000))
    if unit_id not in ARMY_UNITS:
        return web.json_response({"success": False, "error": "invalid_unit"}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    if not p.get("country") or p.get("is_eliminated"):
        return web.json_response({"success": False, "error": "invalid_state"}, status=400)
    ensure_player_fields(p); accrue_player(p)
    unit = ARMY_UNITS[unit_id]; group = unit["group"]
    ml = unit.get("min_level", {}); missing = []
    for r in unit["requires"]:
        need = ml.get(r, 1)
        if get_infra_level(p, r) < need:
            missing.append(INFRASTRUCTURE[r]["name"] + (f" سطح {need}" if need > 1 else ""))
    if missing:
        return web.json_response({"success": False, "error": "no_infra",
                                  "message": "ابتدا بسازید: " + "، ".join(f"«{m}»" for m in missing)}, status=400)
    cap = get_group_capacity(p, group); used = get_group_units(p, group)
    store = {"land": "پادگان", "naval": "بندر", "air": "فرودگاه", "missile": "انبار موشک"}.get(group, "")
    if cap <= 0:
        return web.json_response({"success": False, "error": "no_storage",
                                  "message": f"برای نگهداری یگان‌ها ابتدا «{store}» را بسازید."}, status=400)
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
    now = utcnow()
    sent = [x for x in diplomacy_proposals.values() if x["from_user"] == uid and x["status"] == "pending"]
    recv = [x for x in diplomacy_proposals.values() if x["to_user"] == uid and x["status"] == "pending"]
    tr = [t for t in active_treaties if cid and (t["country_a"] == cid or t["country_b"] == cid)
          and (parse_dt(t.get("expires_at")) or now) > now]
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
    now = utcnow()
    for t in active_treaties:
        if t["treaty_type"] != kind: continue
        exp = parse_dt(t.get("expires_at"))
        if exp and now >= exp: continue
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
    global active_treaties
    now = utcnow()
    for wid, w in list(war_declarations.items()):
        if w["status"] == "negotiation" and w.get("negotiation_ends"):
            end = parse_dt(w["negotiation_ends"])
            if end and now >= end:
                w["status"] = "battle"
                active_wars[wid] = w
                push_news("جنگ آغاز شد",
                    f"مذاکره بین {COUNTRIES[w['attacker']]['name']} و {COUNTRIES[w['defender']]['name']} بی‌نتیجه ماند.")
    # پیمان‌های منقضی را پاک کن
    active_treaties[:] = [
        t for t in active_treaties
        if not (parse_dt(t.get("expires_at")) and parse_dt(t.get("expires_at")) <= now)
    ]
    # جنگ‌های تمام‌شده را از active_wars حذف کن
    for wid in list(active_wars.keys()):
        if active_wars[wid].get("resolved"):
            del active_wars[wid]

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
            p += player.get("units", {}).get(uid_, 0) * u["defense"] * group_defense_mult(player, side_kind)
        return p

    def total_units(player, side_kind):
        return {uid_: player.get("units", {}).get(uid_, 0)
                for uid_, u in ARMY_UNITS.items() if u["group"] == side_kind}

    sent_atk = {k: max(0, int(fronts.get(k, 0) or 0)) for k in ["land", "air", "naval"]}
    report = {"attacker": w["attacker"], "defender": w["defender"], "fronts": {},
              "at": utcnow().isoformat(), "winner": None}
    attacker_wins = 0; defender_wins = 0; air_winner = None

    has_carrier = atk["units"].get("aircraft_carrier", 0) > 0

    for front in ["air", "naval", "land"]:
        atk_attack = 0
        # بدون ناو هواپیمابر، هیچ حملهٔ هوایی ممکن نیست
        if front == "air" and not has_carrier:
            dfd_def = def_power(dfd, front) * 1.10
            dfd_final = dfd_def * (1 + random.uniform(-0.08, 0.08))
            report["fronts"][front] = {"attacker_power": 0,
                                       "defender_power": int(dfd_final),
                                       "winner": "defender"}
            defender_wins += 1
            air_winner = w["defender"]
            continue

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
        for k in list(site_forces):
            if site_owner(k) != site_forces[k].get("owner"): del site_forces[k]
        dfd["is_eliminated"] = True
        push_news("اشغال کشور",
            f"{COUNTRIES[w['attacker']]['name']} کشور {COUNTRIES[w['defender']]['name']} را اشغال کرد.")
    else:
        report["winner"] = "defender"
        push_news("دفاع موفق",
            f"{COUNTRIES[w['defender']]['name']} در برابر {COUNTRIES[w['attacker']]['name']} مقاومت کرد.")

    _an, _dn = COUNTRIES[w["attacker"]]["name"], COUNTRIES[w["defender"]]["name"]
    push_history("country", f"حملهٔ {_an} به {_dn}", w["attacker"], w["defender"], report["winner"], "")
    if report["winner"] == "attacker":
        push_war("occupy", f"{_an} کشور {_dn} را اشغال کرد.", [w["attacker"], w["defender"]])
    else:
        push_war("repel", f"{_dn} حملهٔ {_an} را دفع کرد.", [w["attacker"], w["defender"]])
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
                      "zone": "sea", "owner": strait_holdings.get(k),
                      "toll": info.get("toll", 0), "closed": info.get("closed", False)})
    return web.json_response(sites)

async def capture_site(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); site_id = data.get("site_id")
    if site_id not in MAP_RESOURCES and site_id not in STRAITS_DATA:
        return web.json_response({"success": False, "error": "invalid_site"}, status=400)
    if is_mine(site_id):
        return web.json_response({"success": False, "error": "need_army",
            "message": "معدن را فقط با ارتش (پیاده‌نظام/تانک) و ناو ترابری می‌شود گرفت؛ از بخش جنگ نیرو اعزام کنید."}, status=400)
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
    divert_transits(site_id, country)
    if site_id in MAP_RESOURCES:
        map_holdings[site_id] = country
        push_news("تصرف منبع", f"{COUNTRIES[country]['name']} {MAP_RESOURCES[site_id]['name']} را تصرف کرد.")
    else:
        strait_holdings[site_id] = country
        push_news("تصرف تنگه", f"{COUNTRIES[country]['name']} {STRAITS_DATA[site_id]['name']} را تصرف کرد.")
    save_state()
    return web.json_response({"success": True, "message": "تصرف موفق."})

# =========================================================
# نیروها روی نقشه / اخبار و تاریخچهٔ جنگ / ماهواره
# =========================================================
SCAN_HOURS = 24
SAT_LAUNCH_COST = 1_000_000
SAT_SCANS = 5
COUNTRY_SCAN_COST = 1_100_000

def cname(cid): return COUNTRIES[cid]["name"] if cid in COUNTRIES else "—"

def site_meta(site_id):
    if site_id in MAP_RESOURCES:
        i = MAP_RESOURCES[site_id]
        return {"id": site_id, "name": i["name"], "kind": "resource", "type": i.get("type"), "zone": i.get("zone", "land")}
    if site_id in STRAITS_DATA:
        return {"id": site_id, "name": STRAITS_DATA[site_id]["name"], "kind": "strait", "type": "strait", "zone": "sea"}
    return None

def site_zone(site_id):
    m = site_meta(site_id)
    return m["zone"] if m else None

def dispatch_rule_errors(units, zone):
    """قوانین اعزام: بررسی می‌کند ترکیب نیرو در موضعی با این zone (sea/land) مجاز و پشتیبانی‌شده باشد."""
    errs = []
    cnt = lambda *ids: sum(max(0, units.get(i, 0)) for i in ids)
    nm = lambda i: ARMY_UNITS[i]["name"]
    # یگان‌هایی که اصلاً نمی‌توانند به این نوع موضع بروند
    banned = [k for k, n in units.items() if n > 0 and k in ARMY_UNITS and (
        ARMY_UNITS[k]["group"] == "missile" or (zone == "land" and ARMY_UNITS[k]["group"] == "naval"))]
    if banned:
        errs.append("این یگان‌ها نمی‌توانند به " + ("خشکی" if zone == "land" else "این موضع") + " بروند: "
                    + "، ".join(nm(k) for k in banned))
    if zone == "sea":
        ground = cnt("infantry", "tank")
        cap = units.get("transport_ship", 0) * ARMY_UNITS["transport_ship"]["transport_capacity"]
        if ground > cap:
            errs.append(f"در دریا، تانک و پیاده‌نظام به {nm('transport_ship')} نیاز دارند "
                        f"(ظرفیت حمل {cap} از {ground} یگان).")
        planes = cnt("fighter", "bomber", "air_tanker")
        cap = units.get("aircraft_carrier", 0) * ARMY_UNITS["aircraft_carrier"]["aircraft_capacity"]
        if planes > cap:
            errs.append(f"در دریا، جنگنده و بمب‌افکن به {nm('aircraft_carrier')} نیاز دارند "
                        f"(ظرفیت {cap} از {planes} هواپیما). بالگرد نیازی ندارد.")
    elif zone == "land":
        jets = cnt("fighter", "bomber")
        cap = units.get("air_tanker", 0) * ARMY_UNITS["air_tanker"]["refuel_capacity"]
        if jets > cap:
            errs.append(f"در خشکی، جنگنده و بمب‌افکن به {nm('air_tanker')} نیاز دارند "
                        f"(ظرفیت سوخت‌رسانی {cap} از {jets} هواپیما). بالگرد نیازی ندارد.")
    return errs

def is_mine(site_id):
    i = MAP_RESOURCES.get(site_id)
    return bool(i and i.get("type") in ("steel", "uranium"))

def site_owner(site_id):
    return map_holdings.get(site_id) or strait_holdings.get(site_id)

def set_site_owner(site_id, cid):
    d = map_holdings if site_id in MAP_RESOURCES else strait_holdings
    if cid: d[site_id] = cid
    else: d.pop(site_id, None)

def garrison(site_id):
    g = site_forces.get(site_id)
    if g and g.get("owner") and g["owner"] == site_owner(site_id): return g["units"]
    return {}

def deployed_units(cid):
    t = {}
    if not cid: return t
    for sid, g in site_forces.items():
        if g.get("owner") == cid and site_owner(sid) == cid:
            for k, n in g["units"].items(): t[k] = t.get(k, 0) + n
    return t

def units_count(units): return sum(n for n in units.values() if n > 0)

def units_power(units, owner_player, key=None):
    t = 0.0
    for uid_, n in units.items():
        u = ARMY_UNITS.get(uid_)
        if not u or n <= 0: continue
        dm = group_defense_mult(owner_player, u["group"]) if owner_player else 1
        if key == "attack": t += n * u["attack"]
        elif key == "defense": t += n * u["defense"] * dm
        else: t += n * (u["attack"] + u["defense"] * dm)
    return t

def push_war(kind, text, countries=()):
    war_events.append({"id": str(uuid.uuid4()), "kind": kind, "text": text,
                       "countries": list(countries), "at": utcnow().isoformat()})
    if len(war_events) > 300: del war_events[:100]

def push_history(kind, title, attacker, defender, winner, detail=""):
    war_history.append({"id": str(uuid.uuid4()), "kind": kind, "title": title, "attacker": attacker,
                        "defender": defender, "winner": winner, "detail": detail, "at": utcnow().isoformat()})
    if len(war_history) > 300: del war_history[:100]

def _me(uid):
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]; ensure_player_fields(p); return p

def _bad(msg, code=400):
    return web.json_response({"success": False, "message": msg}, status=code)

async def get_forces(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    process_transits()
    p = _me(uid); cid = p.get("country"); sites = []
    for sid in list(site_forces):
        if cid and site_owner(sid) == cid:
            g = garrison(sid)
            if units_count(g) > 0:
                sites.append({**site_meta(sid), "units": {k: n for k, n in g.items() if n > 0}})
    mine = [{"id": t["id"], "from": t["from"], "to": t["to"], "from_name": "میانهٔ راه" if t["from"] == "mid" else loc_label(t["from"]),
             "to_name": loc_label(t["to"]), "kind": t["kind"], "units": t["units"], "start": t["start"], "arrive": t["arrive"]}
            for t in transits if t["owner"] == cid]
    return web.json_response({"home": {k: n for k, n in p["units"].items() if n > 0}, "sites": sites,
                              "transits": mine, "now": utcnow().isoformat()})

# ---------------- زمان سفر نیروها ----------------
TRAVEL_KM_PER_MIN = 40      # سرعت: ۴۰ کیلومتر در دقیقه (۱۰٬۰۰۰ کیلومتر ≈ ۴ ساعت)
TRAVEL_MIN_MINUTES = 3
TRAVEL_MAX_MINUTES = 480

def loc_coords(cid, loc):
    if loc == "home": return TRADE_COUNTRY_COORDS.get(cid)
    i = MAP_RESOURCES.get(loc) or STRAITS_DATA.get(loc)
    return (i["lon"], i["lat"]) if i else None

def geo_interp(a, b, f):
    """نقطهٔ f (۰ تا ۱) روی کمان بین دو مختصات (lon, lat)."""
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = 2 * math.asin(min(1, math.sqrt(math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)))
    if d < 1e-9: return (a[0], a[1])
    A = math.sin((1 - f) * d) / math.sin(d); B = math.sin(f * d) / math.sin(d)
    x = A * math.cos(lat1) * math.cos(lon1) + B * math.cos(lat2) * math.cos(lon2)
    y = A * math.cos(lat1) * math.sin(lon1) + B * math.cos(lat2) * math.sin(lon2)
    z = A * math.sin(lat1) + B * math.sin(lat2)
    return (math.degrees(math.atan2(y, x)), math.degrees(math.atan2(z, math.hypot(x, y))))

def travel_minutes(cid, a, b):
    ca, cb = loc_coords(cid, a), loc_coords(cid, b)
    if not ca or not cb: return TRAVEL_MIN_MINUTES
    lon1, lat1, lon2, lat2 = map(math.radians, (ca[0], ca[1], cb[0], cb[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    km = 6371 * 2 * math.asin(min(1, math.sqrt(h)))
    return max(TRAVEL_MIN_MINUTES, min(TRAVEL_MAX_MINUTES, km / TRAVEL_KM_PER_MIN))

def loc_label(loc):
    if loc == "home": return "خانه"
    m = site_meta(loc); return m["name"] if m else "—"

def announce(kind, title, text, countries=()):
    """اعلان همزمان در اخبار جنگ و اعلان‌ها/اخبار عمومی (بدون ذکر تعداد نیرو)."""
    push_war(kind, text, list(countries)); push_news(title, text)

def notify_country(cid, text):
    """پیام خصوصی تلگرام به بازیکنِ آن کشور (علاوه بر اعلان‌های درون بازی)."""
    uid_, _ = get_player_by_country(cid)
    if not uid_: return
    async def _send():
        try: await bot.send_message(uid_, text)
        except Exception as e: logging.warning("notify failed: %s", e)
    try: asyncio.get_running_loop().create_task(_send())
    except RuntimeError: pass

def _add_units(dest, sent):
    for k, n in sent.items(): dest[k] = dest.get(k, 0) + n

def start_transit(cid, src, dst, units, minutes, kind="go", dst_free=False, origin=None):
    now = utcnow()
    t = {"id": str(uuid.uuid4()), "owner": cid, "from": src, "to": dst, "units": dict(units), "kind": kind,
         "dst_free": dst_free, "origin": origin or src,
         "from_ll": loc_coords(cid, src), "to_ll": loc_coords(cid, dst),
         "start": now.isoformat(), "arrive": (now + timedelta(minutes=minutes)).isoformat()}
    transits.append(t); return t

def divert_transits(site_id, new_owner):
    """کسی موضع آزاد را گرفت: نیروهای دیگرانی که به آن می‌رفتند از میانهٔ راه برمی‌گردند."""
    now = utcnow()
    for t in list(transits):
        if t["to"] != site_id or t["kind"] != "go" or not t.get("dst_free") or t["owner"] == new_owner: continue
        _turn_back(t, now, f"{cname(new_owner)} {loc_label(site_id)} را گرفت")

def _turn_back(t, now, reason=None):
    """نیرو از همان نقطهٔ میانهٔ راه برمی‌گردد؛ زمان بازگشت = زمانی که تا اینجا رفته است."""
    st, ar = parse_dt(t["start"]), parse_dt(t["arrive"])
    elapsed = max(0.0, (now - st).total_seconds() / 60) if st else 0.0
    cid = t["owner"]; dst_name = loc_label(t["to"])
    total = (ar - st).total_seconds() / 60 if (st and ar) else 0
    fr = t.get("from_ll") or loc_coords(cid, t["from"]); to = t.get("to_ll") or loc_coords(cid, t["to"])
    here = geo_interp(fr, to, min(1.0, elapsed / total)) if (fr and to and total > 0) else fr
    t["from_ll"] = here; t["to_ll"] = loc_coords(cid, t["origin"])
    t["kind"] = "back"; t["to"] = t["origin"]; t["from"] = "mid"; t["dst_free"] = False
    t["start"] = now.isoformat(); t["arrive"] = (now + timedelta(minutes=elapsed)).isoformat()
    back_name = loc_label(t["to"])
    announce("turnback", "بازگشت نیرو از میانهٔ راه",
             f"{cname(cid)} نیروهای خود را که به {dst_name} می‌رفتند از میانهٔ راه به {back_name} بازگرداند"
             + (f"؛ دلیل: {reason}." if reason else "."), [cid])

def resolve_arrival(t):
    cid = t["owner"]; units = t["units"]; dst = t["to"]
    _, p = get_player_by_country(cid)
    if not p: return
    ensure_player_fields(p)
    if t["kind"] == "back":
        if dst == "home" or site_owner(dst) != cid:
            _add_units(p["units"], units)
        else:
            g = site_forces.get(dst)
            if not g or g.get("owner") != cid: g = site_forces[dst] = {"owner": cid, "units": {}}
            _add_units(g["units"], units)
        return
    if dst == "home":
        _add_units(p["units"], units); return
    meta = site_meta(dst); kind = meta["kind"]; owner = site_owner(dst)
    if owner and owner != cid and have_treaty(cid, owner, "non_aggression"):
        _add_units(p["units"], units)
        announce("turnback", "بازگشت نیرو", f"{cname(cid)} نیروهایش را که به {meta['name']} رسیده بودند بازگرداند؛ دلیل: پیمان عدم تجاوز با {cname(owner)}.", [cid, owner]); return
    if owner == cid:
        g = site_forces.get(dst)
        if not g or g.get("owner") != cid: g = site_forces[dst] = {"owner": cid, "units": {}}
        _add_units(g["units"], units)
    elif not owner:
        divert_transits(dst, cid)
        site_forces[dst] = {"owner": cid, "units": dict(units)}; set_site_owner(dst, cid)
        push_war("occupy", f"{cname(cid)} {meta['name']} را گرفت.", [cid])
        push_history(kind, f"حملهٔ {cname(cid)} به {meta['name']}", cid, None, "attacker", "بی‌صاحب بود")
        push_news("تصرف تنگه" if kind == "strait" else "تصرف منبع", f"{cname(cid)} {meta['name']} را تصرف کرد.")
        notify_country(cid, f"✅ نیروهای شما به {meta['name']} رسیدند و آن را با موفقیت گرفتند.")
    else:
        _, dfd = get_player_by_country(owner)
        gar = garrison(dst)
        atk_p = units_power(units, p, "attack") * (1 + random.uniform(-0.08, 0.08))
        def_p = units_power(gar, dfd, "defense") * 1.10 * (1 + random.uniform(-0.08, 0.08))
        empty = units_count(gar) == 0
        if empty or atk_p > def_p:
            surv = dict(units) if empty else {k: max(1, int(n * 0.8)) for k, n in units.items()}
            site_forces[dst] = {"owner": cid, "units": surv}; set_site_owner(dst, cid)
            push_war("capture", f"{cname(cid)} {meta['name']} را از {cname(owner)} گرفت.", [cid, owner])
            push_history(kind, f"حملهٔ {cname(cid)} به {meta['name']}", cid, owner, "attacker",
                         f"حمله {int(atk_p)} در برابر دفاع {int(def_p)}")
            push_news("تصرف تنگه" if kind == "strait" else "تصرف منبع", f"{cname(cid)} {meta['name']} را از {cname(owner)} گرفت.")
            notify_country(cid, f"✅ حمله موفق بود! {meta['name']} را از {cname(owner)} گرفتید.")
            notify_country(owner, f"⚠️ {cname(cid)} {meta['name']} را از شما گرفت.")
        else:
            _add_units(p["units"], {k: int(n * 0.3) for k, n in units.items()})
            for k in list(gar): gar[k] = int(gar[k] * 0.8)
            push_war("repel", f"{cname(owner)} حملهٔ {cname(cid)} به {meta['name']} را دفع کرد.", [cid, owner])
            push_history(kind, f"حملهٔ {cname(cid)} به {meta['name']}", cid, owner, "defender",
                         f"حمله {int(atk_p)} در برابر دفاع {int(def_p)}")
            notify_country(cid, f"❌ حمله شما به {meta['name']} دفع شد؛ بخشی از نیروها به خانه برگشتند.")
            notify_country(owner, f"🛡️ حملهٔ {cname(cid)} به {meta['name']} را دفع کردید.")

def process_transits():
    now = utcnow(); changed = False
    due = []
    for t in list(transits):
        ar = parse_dt(t["arrive"])
        if not ar or ar <= now: due.append(t)
    due.sort(key=lambda t: t["arrive"])
    for t in due:
        if t not in transits: continue
        ar = parse_dt(t["arrive"])
        if ar and ar > now: continue     # در همین دور از میانهٔ راه برگردانده شد
        transits.remove(t); changed = True
        try: resolve_arrival(t)
        except Exception as e: logging.error("resolve_arrival: %s", e)
    if changed: save_state()

async def transit_loop():
    while True:
        await asyncio.sleep(10)
        try: process_transits()
        except Exception as e: logging.error("transit tick: %s", e)

async def dispatch_forces(request):
    uid = get_auth_user_id(request)
    if not uid: return _bad("unauthorized", 401)
    process_transits()
    data = await read_json(request)
    src = data.get("from"); dst = data.get("to")
    p = _me(uid); cid = p.get("country")
    if not cid or p.get("is_eliminated"): return _bad("کشوری ندارید.")
    if src == dst: return _bad("مبدأ و مقصد یکی است.")
    if dst != "home" and not site_meta(dst): return _bad("مقصد نامعتبر است.")
    if src != "home" and (not site_meta(src) or site_owner(src) != cid): return _bad("این مکان در اختیار شما نیست.")
    pool = p["units"] if src == "home" else garrison(src)
    units = {}
    for k, v in (data.get("units") or {}).items():
        try: n = int(v)
        except (TypeError, ValueError): continue
        if k in ARMY_UNITS and n > 0: units[k] = n
    if not units: return _bad("هیچ یگانی انتخاب نشده.")
    for k, n in units.items():
        if pool.get(k, 0) < n: return _bad("تعداد انتخابی بیشتر از موجودی آن مکان است.")
    owner = site_owner(dst) if dst != "home" else None
    if owner and owner != cid and have_treaty(cid, owner, "non_aggression"):
        return _bad("با این کشور پیمان عدم تجاوز دارید.")

    if dst != "home":
        combined = dict(units)
        if owner == cid:  # تقویت موضع خودی: پشتیبانی‌های ازقبل مستقرشده هم حساب می‌شوند
            for k, n in garrison(dst).items(): combined[k] = combined.get(k, 0) + n
        errs = dispatch_rule_errors(combined, site_zone(dst))
        if errs: return _bad(errs[0])
        if is_mine(dst) and owner != cid and (units.get("infantry", 0) + units.get("tank", 0)) < 1:
            return _bad("برای تصرف معدن باید ارتش (پیاده‌نظام یا تانک) با ناو ترابری اعزام شود؛ ناو و زیردریایی به‌تنهایی کافی نیست.")
    if src != "home":  # با رفتن این یگان‌ها، نیروهای باقی‌مانده نباید بی‌پشتیبان بمانند
        zs = site_zone(src)
        after = {k: pool.get(k, 0) - units.get(k, 0) for k in pool}
        if not dispatch_rule_errors(pool, zs) and dispatch_rule_errors(after, zs):
            return _bad("با خروج این یگان‌ها، نیروهای باقی‌مانده در این موضع بدون پشتیبان (ناو ترابری / ناو هواپیمابر / سوخت‌رسان) می‌مانند.")

    for k, n in units.items(): pool[k] -= n
    # مالکیت موضع حتی با خالی‌شدن از نیرو برای خودش می‌ماند؛ فقط اگر کسی حمله کند راحت می‌گیرد.
    minutes = travel_minutes(cid, src, dst)
    start_transit(cid, src, dst, units, minutes, "go", dst_free=(dst != "home" and not owner))
    if dst == "home":
        announce("return", "بازگشت نیرو", f"{cname(cid)} از {loc_label(src)} نیروهایش را به خانه فرستاد.", [cid])
    else:
        target = f"به {loc_label(dst)}" if owner == cid else f"برای {loc_label(dst)}"
        if src == "home":
            announce("send", "اعزام نیرو", f"{cname(cid)} {target} نیرو فرستاد.", [cid] + ([owner] if owner and owner != cid else []))
        else:
            announce("send", "اعزام نیرو", f"{cname(cid)} از {loc_label(src)} نیروهایش را {target} فرستاد.", [cid] + ([owner] if owner and owner != cid else []))
    save_state()
    mins = int(math.ceil(minutes))
    eta = f"{mins} دقیقه" if mins < 60 else f"{mins // 60} ساعت و {mins % 60} دقیقه"
    return web.json_response({"success": True, "outcome": "sent", "message": f"نیروها به راه افتادند؛ رسیدن: حدود {eta}.",
                              "player": serialize_player(p)})

async def get_map_transits(request):
    """مسیر نیروهای در حال حرکت برای همهٔ بازیکنان (بدون تعداد نیرو)."""
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    process_transits()
    out = []
    for t in transits:
        cid = t["owner"]
        fr = t.get("from_ll") or loc_coords(cid, t["from"]); to = t.get("to_ll") or loc_coords(cid, t["to"])
        if not fr or not to: continue
        out.append({"id": t["id"], "country": cid, "from_ll": list(fr), "to_ll": list(to), "kind": t["kind"],
                    "from_name": "میانهٔ راه" if t["from"] == "mid" else loc_label(t["from"]), "to_name": loc_label(t["to"]),
                    "start": t["start"], "arrive": t["arrive"]})
    return web.json_response({"transits": out, "now": utcnow().isoformat()})

async def recall_forces(request):
    uid = get_auth_user_id(request)
    if not uid: return _bad("unauthorized", 401)
    process_transits()
    data = await read_json(request)
    p = _me(uid); cid = p.get("country")
    t = next((x for x in transits if x["id"] == data.get("id") and x["owner"] == cid), None)
    if not t: return _bad("این نیرو دیگر در راه نیست.")
    if t["kind"] != "go": return _bad("این نیرو در حال بازگشت است.")
    _turn_back(t, utcnow())
    save_state()
    return web.json_response({"success": True, "message": "نیروها از میانهٔ راه برمی‌گردند.", "player": serialize_player(p)})

async def get_war_log(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    p = _me(uid); cid = p.get("country")
    mine = [h for h in war_history if h.get("attacker") == cid or h.get("defender") == cid]
    wins = sum(1 for h in mine if (h["winner"] == "attacker" and h["attacker"] == cid)
               or (h["winner"] == "defender" and h["defender"] == cid))
    return web.json_response({"events": list(reversed(war_events[-80:])), "history": list(reversed(mine[-80:])),
                              "stats": {"fights": len(mine), "wins": wins, "losses": len(mine) - wins}})

def active_scans(p):
    now = utcnow(); sa = p.setdefault("scan_active", {})
    for k, exp in list(sa.items()):
        e = parse_dt(exp)
        if not e or e <= now: del sa[k]
    return sa

def site_scan_view(site_id):
    owner = site_owner(site_id)
    if not owner: return {"owner": None, "power": 0}
    op = get_player_by_country(owner)[1]
    return {"owner": owner, "power": int(round(units_power(garrison(site_id), op)))}

def country_scan_view(cid):
    _, tp = get_player_by_country(cid)
    if not tp: return None
    ensure_player_fields(tp); recompute_army(tp); rates = compute_rates(tp)
    home = {k: n for k, n in tp["units"].items() if n > 0}
    locs = [{"id": "home", "name": "خانه", "units": home, "count": sum(home.values())}]
    for sid in site_forces:
        if site_owner(sid) == cid:
            g = {k: n for k, n in garrison(sid).items() if n > 0}
            if g: locs.append({"id": sid, "name": site_meta(sid)["name"], "units": g, "count": sum(g.values())})
    return {"country": cid, "income": int(rates["net_income"]), "power": tp.get("army", 0), "locations": locs}

async def sat_get_scans(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    p = _me(uid); sa = active_scans(p); sites = {}; countries = {}
    for key, exp in sa.items():
        t, _, ident = key.partition(":")
        if t == "s":
            v = site_scan_view(ident); v["expires_at"] = exp; sites[ident] = v
        elif t == "c":
            v = country_scan_view(ident)
            if v: v["expires_at"] = exp; countries[ident] = v
    return web.json_response({"scans": p.get("scans", 0), "satellite_built": get_infra_level(p, "satellite") > 0,
                              "sites": sites, "countries": countries})

async def sat_launch(request):
    uid = get_auth_user_id(request)
    if not uid: return _bad("unauthorized", 401)
    p = _me(uid)
    if get_infra_level(p, "satellite") <= 0: return _bad("ابتدا «ماهواره» را در زیرساخت › استراتژی بسازید.")
    if p.get("money", 0) < SAT_LAUNCH_COST: return _bad("پول کافی نیست.")
    p["money"] -= SAT_LAUNCH_COST; p["scans"] = p.get("scans", 0) + SAT_SCANS
    save_state()
    return web.json_response({"success": True, "message": f"ماهواره پرتاب شد. {SAT_SCANS} اسکن اضافه شد.", "player": serialize_player(p)})

async def sat_scan_site(request):
    uid = get_auth_user_id(request)
    if not uid: return _bad("unauthorized", 401)
    data = await read_json(request); site_id = data.get("site_id")
    p = _me(uid); cid = p.get("country")
    if get_infra_level(p, "satellite") <= 0: return _bad("ابتدا ماهواره را بسازید.")
    if not site_meta(site_id): return _bad("مکان نامعتبر است.")
    owner = site_owner(site_id)
    if not owner or owner == cid: return _bad("این مکان بی‌صاحب یا مال خودتان است و اسکن نمی‌خواهد.")
    sa = active_scans(p); key = "s:" + site_id
    if key in sa:
        return web.json_response({"success": True, "message": "اسکن این مکان هنوز فعال است.", "player": serialize_player(p)})
    if p.get("scans", 0) < 1: return _bad("اسکن باقی نمانده. ماهواره را دوباره پرتاب کنید.")
    p["scans"] -= 1; sa[key] = (utcnow() + timedelta(hours=SCAN_HOURS)).isoformat()
    save_state()
    return web.json_response({"success": True, "message": "اسکن انجام شد و ۲۴ ساعت زنده است.", "player": serialize_player(p)})

async def sat_scan_country(request):
    uid = get_auth_user_id(request)
    if not uid: return _bad("unauthorized", 401)
    data = await read_json(request); target = data.get("country")
    p = _me(uid); cid = p.get("country")
    if get_infra_level(p, "satellite") <= 0: return _bad("ابتدا ماهواره را بسازید.")
    if target not in COUNTRIES or target == cid: return _bad("کشور نامعتبر است.")
    if get_player_by_country(target)[1] is None: return _bad("این کشور بازیکن ندارد.")
    sa = active_scans(p); key = "c:" + target
    if key in sa:
        return web.json_response({"success": True, "message": "اسکن این کشور هنوز فعال است.", "player": serialize_player(p)})
    if p.get("scans", 0) < 1: return _bad("اسکن باقی نمانده. ماهواره را دوباره پرتاب کنید.")
    if p.get("money", 0) < COUNTRY_SCAN_COST: return _bad("پول کافی نیست.")
    p["scans"] -= 1; p["money"] -= COUNTRY_SCAN_COST
    sa[key] = (utcnow() + timedelta(hours=SCAN_HOURS)).isoformat()
    save_state()
    return web.json_response({"success": True, "message": "اسکن کشور انجام شد و ۲۴ ساعت زنده است.", "player": serialize_player(p)})

# =========================================================
# API Announcements
# =========================================================
async def get_announcements(request):
    uid = get_auth_user_id(request)
    current_cid = players.get(uid, {}).get("country") if uid else None
    result = []
    comments_migrated = False
    for a in announcements[-50:]:
        reactions = a.get("reactions", {})
        support = [c for c, r in reactions.items() if r == "support"]
        accuse = [c for c, r in reactions.items() if r == "accuse"]
        # Give older replies stable identifiers so they can be replied to recursively.
        for cm in a.setdefault("comments", []):
            if not cm.get("id"):
                cm["id"] = str(uuid.uuid4()); comments_migrated = True
            if "parent_id" not in cm:
                cm["parent_id"] = None; comments_migrated = True
        result.append({"id": a["id"], "from_country": a["from_country"], "text": a["text"],
                       "created_at": a["created_at"], "support": support, "accuse": accuse,
                       "my_reaction": reactions.get(current_cid) if current_cid else None,
                       "is_mine": bool(current_cid and current_cid == a.get("from_country")),
                       "comments": a.get("comments", []),
                       "comments_count": len(a.get("comments", []))})
    if comments_migrated:
        save_state()
    result.reverse()
    return web.json_response(result)

async def get_announcement_status(request):
    uid = get_auth_user_id(request)
    if not uid:
        return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    if uid not in players:
        players[uid] = create_player(uid)
    p = players[uid]
    if not p.get("country"):
        return web.json_response({"success": False, "error": "no_country",
                                  "message": "ابتدا کشور خود را انتخاب کنید."}, status=400)
    now = utcnow()
    today = _announcement_day(now)
    anns = p.setdefault("announcements", {})
    used_list = anns.get(today, [])
    # Clean malformed legacy values defensively while preserving the stored timestamps.
    if not isinstance(used_list, list):
        used_list = []
        anns[today] = used_list
    used = len(used_list)
    next_number = used + 1 if used < 4 else None
    cooldown = _announcement_cooldown_seconds(used_list, now) if used < 4 else 0
    return web.json_response({"success": True, "count": used, "limit": 4,
                              "next_number": next_number,
                              "next_cost": ANN_COSTS.get(next_number, 0) if next_number else None,
                              "costs": {str(k): v for k, v in ANN_COSTS.items()},
                              "cooldown_seconds": cooldown,
                              "reset_seconds": _announcement_reset_seconds(now),
                              "can_publish": used < 4 and cooldown <= 0})

async def _broadcast_announcement_notification(cid, author_uid=None):
    """ارسال اعلان کوتاه بیانیه به دیگر بازیکنان؛ نویسنده اعلان خودش را نمی‌گیرد."""
    if cid not in COUNTRIES:
        return
    country_name = COUNTRIES[cid]["name"]
    text = (f"📢 بیانیهٔ جدید\nکشور «{country_name}» بیانیه‌ای منتشر کرد.\n"
            "متن بیانیه فقط در بخش «ارتباطات ← بیانیه‌ها» قابل مشاهده است.")
    semaphore = asyncio.Semaphore(8)
    async def send_to(uid):
        if author_uid is not None and str(uid) == str(author_uid):
            return
        async with semaphore:
            try:
                await bot.send_message(int(uid), text)
            except Exception as e:
                logging.warning("announcement notification failed for %s: %s", uid, e)
    recipients = [uid for uid in players.keys() if author_uid is None or str(uid) != str(author_uid)]
    await asyncio.gather(*(send_to(uid) for uid in recipients))

async def create_announcement(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); text = (data.get("text") or "").strip()[:20000]
    if not text: return web.json_response({"success": False, "error": "empty", "message": "متن بیانیه را بنویسید."}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]; cid = p.get("country")
    if not cid: return web.json_response({"success": False, "error": "no_country", "message": "ابتدا کشور خود را انتخاب کنید."}, status=400)
    now = utcnow()
    today = _announcement_day(now)
    anns = p.setdefault("announcements", {})
    today_list = anns.get(today, [])
    if not isinstance(today_list, list):
        today_list = []
    if len(today_list) >= 4:
        return web.json_response({"success": False, "error": "daily_limit",
                                  "reset_seconds": _announcement_reset_seconds(now),
                                  "message": "سهمیهٔ امروز تمام شده است؛ پس از نیمه‌شب دوباره فعال می‌شود."}, status=400)
    cooldown = _announcement_cooldown_seconds(today_list, now)
    if cooldown > 0:
        mins = max(1, (cooldown + 59) // 60)
        return web.json_response({"success": False, "error": "cooldown",
                                  "retry_after_seconds": cooldown,
                                  "message": f"برای انتشار بیانیهٔ بعدی {mins} دقیقه دیگر صبر کنید."}, status=400)
    cost = ANN_COSTS.get(len(today_list) + 1, 400_000)
    if p.get("money", 0) < cost:
        return web.json_response({"success": False, "error": "not_enough_money",
                                  "message": f"هزینهٔ این بیانیه {cost:,} دلار است."}, status=400)
    p["money"] -= cost
    published_at = utcnow().isoformat()
    today_list.append(published_at); anns[today] = today_list
    ann = {"id": str(uuid.uuid4()), "from_country": cid, "text": text,
           "created_at": published_at, "reactions": {}, "comments": []}
    announcements.append(ann)
    # متن کامل بیانیه هرگز وارد خبرهای عمومی/اعلان‌ها نمی‌شود.
    push_news("بیانیه", f"کشور «{COUNTRIES[cid]['name']}» بیانیه‌ای منتشر کرد؛ متن فقط در بخش بیانیه‌هاست.")
    save_state()
    try:
        asyncio.get_running_loop().create_task(_broadcast_announcement_notification(cid, uid))
    except RuntimeError:
        logging.warning("announcement notification skipped: no active event loop")
    return web.json_response({"success": True, "announcement": ann, "cost": cost,
                              "remaining_today": max(0, 4 - len(today_list))})

async def react_announcement(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); ann_id = data.get("announcement_id"); r = data.get("reaction")
    if r not in ("support", "accuse"):
        return web.json_response({"success": False, "error": "invalid"}, status=400)
    if uid not in players or not players[uid].get("country"):
        return web.json_response({"success": False, "error": "no_country", "message": "ابتدا کشور خود را انتخاب کنید."}, status=400)
    cid = players[uid].get("country")
    for a in announcements:
        if a["id"] == ann_id:
            reactions = a.setdefault("reactions", {})
            if cid in reactions:
                return web.json_response({"success": False, "error": "already_reacted",
                                          "message": "واکنش شما قبلاً برای همیشه ثبت شده و قابل تغییر یا حذف نیست."}, status=409)
            reactions[cid] = r
            save_state()
            owner_uid, _ = get_player_by_country(a.get("from_country"))
            if owner_uid and owner_uid != uid:
                country_name = COUNTRIES.get(cid, {}).get("name", cid)
                if r == "support":
                    note = f"✅ کشور «{country_name}» از بیانیهٔ شما حمایت کرد."
                else:
                    note = f"❌ کشور «{country_name}» بیانیهٔ شما را محکوم کرد."
                await notify_user(owner_uid, note)
            return web.json_response({"success": True, "reaction": r, "immutable": True})
    return web.json_response({"success": False, "error": "not_found"}, status=404)

async def comment_announcement(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request)
    ann_id = data.get("announcement_id")
    text = (data.get("text") or "").strip()[:5000]
    parent_id = data.get("parent_comment_id") or None
    if not text: return web.json_response({"success": False, "error": "empty", "message": "متن پاسخ را بنویسید."}, status=400)
    if not parent_id is None:
        parent_id = str(parent_id)
    if uid not in players or not players[uid].get("country"):
        return web.json_response({"success": False, "error": "no_country", "message": "ابتدا کشور خود را انتخاب کنید."}, status=400)
    cid = players[uid].get("country")
    for a in announcements:
        if a["id"] == ann_id:
            comments = a.setdefault("comments", [])
            for cm in comments:
                if not cm.get("id"):
                    cm["id"] = str(uuid.uuid4())
                if "parent_id" not in cm:
                    cm["parent_id"] = None
            if parent_id and not any(str(cm.get("id")) == parent_id for cm in comments):
                return web.json_response({"success": False, "error": "parent_not_found",
                                          "message": "پاسخی که می‌خواهید به آن جواب دهید پیدا نشد؛ گفتگو را تازه کنید."}, status=400)
            comment = {"id": str(uuid.uuid4()), "parent_id": parent_id, "from_country": cid,
                       "text": text, "at": utcnow().isoformat()}
            comments.append(comment)
            save_state()
            return web.json_response({"success": True, "comment": comment})
    return web.json_response({"success": False, "error": "not_found"}, status=404)

async def get_announcement_detail(request):
    aid = request.query.get("id")
    for a in announcements:
        if a["id"] == aid: return web.json_response(a)
    return web.json_response({"error": "not_found"}, status=404)

# =========================================================
# API Unions
# =========================================================
def _public_union(u):
    """اطلاعات عمومی اتحادیه؛ پیام‌ها و درخواست‌های عضویت خصوصی می‌مانند."""
    members = list(u.get("members", []))
    return {"id": u["id"], "name": u.get("name", "اتحادیه"),
            "leader_country": u.get("leader_country"), "members": members,
            "member_count": len(members), "created_at": u.get("created_at")}

async def get_union(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    cid = players.get(uid, {}).get("country")
    public_unions = [_public_union(u) for u in sorted(unions.values(), key=lambda x: x.get("created_at", ""), reverse=True)]
    current = next((u for u in unions.values() if cid and cid in u.get("members", [])), None)
    if current:
        payload = {**_public_union(current), "messages": current.get("messages", [])}
        is_leader = current.get("leader_country") == cid
        if is_leader:
            payload["join_requests"] = list(current.get("requests", []))
        return web.json_response({"union": payload, "is_leader": is_leader,
                                  "unions": public_unions, "invites": [], "requested_union_ids": []})

    invites = []
    requested = []
    for u in unions.values():
        if cid and cid in u.get("invites", []):
            invites.append({"union_id": u["id"], "name": u["name"], "leader": u["leader_country"]})
        if cid and cid in u.get("requests", []):
            requested.append(u["id"])
    return web.json_response({"union": None, "invites": invites, "unions": public_unions,
                              "requested_union_ids": requested})

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
                    "messages": [], "invites": [], "requests": [], "created_at": utcnow().isoformat()}
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
    if target in u.get("members", []): return web.json_response({"success": False, "error": "already_member"}, status=400)
    if any(target in other.get("members", []) for other in unions.values() if other["id"] != u_id):
        return web.json_response({"success": False, "error": "in_other"}, status=400)
    u.setdefault("invites", [])
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
    if accept and any(cid in other.get("members", []) for other in unions.values() if other["id"] != u_id):
        return web.json_response({"success": False, "error": "in_other"}, status=400)
    u["invites"].remove(cid)
    if accept and cid not in u.setdefault("members", []):
        u["members"].append(cid)
        for other in unions.values():
            if other["id"] == u_id: continue
            if cid in other.get("requests", []): other["requests"].remove(cid)
            if cid in other.get("invites", []): other["invites"].remove(cid)
    save_state()
    return web.json_response({"success": True})

async def request_union_membership(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    if not cid: return web.json_response({"success": False, "error": "no_country"}, status=400)
    data = await read_json(request); u_id = data.get("union_id")
    u = unions.get(u_id)
    if not u: return web.json_response({"success": False, "error": "no_union"}, status=404)
    if any(cid in other.get("members", []) for other in unions.values()):
        return web.json_response({"success": False, "error": "already_member"}, status=400)
    if cid in u.get("members", []): return web.json_response({"success": False, "error": "already_member"}, status=400)
    # هر کشور فقط یک درخواست عضویت فعال داشته باشد تا درخواست‌های قدیمی معلق نمانند.
    for other in unions.values():
        if other["id"] != u_id and cid in other.get("requests", []):
            other["requests"].remove(cid)
    requests = u.setdefault("requests", [])
    if cid not in requests: requests.append(cid)
    save_state()
    return web.json_response({"success": True, "pending": True})

async def respond_union_request(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    data = await read_json(request); u_id = data.get("union_id"); target = data.get("target")
    accept = bool(data.get("accept"))
    u = unions.get(u_id)
    if not u: return web.json_response({"success": False, "error": "no_union"}, status=404)
    if u.get("leader_country") != cid:
        return web.json_response({"success": False, "error": "not_leader"}, status=403)
    if target not in u.setdefault("requests", []):
        return web.json_response({"success": False, "error": "no_request"}, status=400)
    if accept and any(target in other.get("members", []) for other in unions.values() if other["id"] != u_id):
        return web.json_response({"success": False, "error": "in_other"}, status=400)
    u["requests"].remove(target)
    if accept and target not in u.setdefault("members", []):
        u["members"].append(target)
        if target in u.setdefault("invites", []): u["invites"].remove(target)
        for other in unions.values():
            if other["id"] == u_id: continue
            if target in other.get("requests", []): other["requests"].remove(target)
            if target in other.get("invites", []): other["invites"].remove(target)
    save_state()
    return web.json_response({"success": True})

async def kick_union_member(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    data = await read_json(request); u_id = data.get("union_id"); target = data.get("target")
    u = unions.get(u_id)
    if not u: return web.json_response({"success": False, "error": "no_union"}, status=404)
    if u.get("leader_country") != cid:
        return web.json_response({"success": False, "error": "not_leader"}, status=403)
    if target == cid: return web.json_response({"success": False, "error": "cannot_kick_self"}, status=400)
    if target not in u.get("members", []): return web.json_response({"success": False, "error": "not_member"}, status=400)
    u["members"].remove(target)
    save_state()
    return web.json_response({"success": True})

async def leave_union(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    for u in list(unions.values()):
        if cid in u.get("members", []):
            # اگر مالک خارج شود، اتحادیه حذف می‌شود تا بدون مالک نماند.
            if u.get("leader_country") == cid:
                del unions[u["id"]]
                push_news("اتحادیه", f"اتحادیه «{u.get('name', 'اتحادیه')}» با خروج مالک منحل شد.")
            else:
                u["members"].remove(cid)
            save_state(); return web.json_response({"success": True})
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
    # فرستنده پیام خودش را دیده است
    pm_read.setdefault(cid, {})[target] = len(private_messages[cid][target])
    save_state()
    try: notify_country(target, f"📩 از کشور {_lname(cid)} یک پیغام خصوصی آمد.\nبرای خواندن: ارتباطات ← پیام خصوصی")
    except Exception as e: logging.warning("pm notify failed: %s", e)
    return web.json_response({"success": True})

def _pm_unread(cid, other):
    msgs = private_messages.get(cid, {}).get(other, [])
    seen = pm_read.get(cid, {}).get(other, 0)
    return sum(1 for m in msgs[seen:] if m.get("from") == other)

async def get_pm(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    target = request.query.get("target")
    if uid not in players: return web.json_response({"messages": [], "conversations": [], "unread_total": 0})
    cid = players[uid].get("country")
    if not cid: return web.json_response({"messages": [], "conversations": [], "unread_total": 0})
    if target:
        msgs = private_messages.get(cid, {}).get(target, [])
        pm_read.setdefault(cid, {})[target] = len(msgs)
        return web.json_response({"messages": msgs, "with": target})
    convs = []
    for other, msgs in private_messages.get(cid, {}).items():
        if not msgs: continue
        last = msgs[-1]
        convs.append({"with": other, "last": last.get("text", ""), "last_from": last.get("from"),
                      "at": last.get("at"), "unread": _pm_unread(cid, other)})
    convs.sort(key=lambda c: c.get("at") or "", reverse=True)
    return web.json_response({"conversations": convs, "unread_total": sum(c["unread"] for c in convs)})

# =========================================================
# API Market — international trade
# =========================================================
TRADE_COUNTRY_COORDS = {
    "germany": (10.45, 51.16), "france": (2.21, 46.23), "italy": (12.57, 41.87),
    "britain": (-3.44, 55.38), "ussr": (90.00, 55.00), "usa": (-100.00, 38.00),
    "china": (103.82, 35.86), "japan": (138.25, 36.20),
}
# فقط همسایهٔ مستقیم؛ کشور واسطه برای تجارت زمینی استفاده نمی‌شود.
LAND_NEIGHBORS = {
    frozenset(("germany", "france")), frozenset(("germany", "ussr")),
    frozenset(("germany", "italy")), frozenset(("france", "italy")),
    frozenset(("ussr", "china")),
}
# مسیرهای دریایی ساده‌شدهٔ بازی. [] یعنی مسیر مستقیم و بدون تنگه.
SEA_ROUTE_HINTS = {
    frozenset(("germany", "britain")): [["dover"], []],
    frozenset(("france", "britain")): [["dover"], []],
    frozenset(("italy", "britain")): [["gibraltar", "dover"], ["gibraltar"], []],
    frozenset(("germany", "italy")): [["gibraltar"], []],
    frozenset(("france", "italy")): [["gibraltar"], []],
    frozenset(("germany", "china")): [["suez", "malacca"], ["gibraltar", "suez", "malacca"], []],
    frozenset(("france", "china")): [["suez", "malacca"], ["gibraltar", "suez", "malacca"], []],
    frozenset(("italy", "china")): [["suez", "malacca"], []],
    frozenset(("britain", "china")): [["suez", "malacca"], ["gibraltar", "suez", "malacca"], []],
    frozenset(("ussr", "japan")): [["korea"], ["taiwan"], []],
    frozenset(("china", "japan")): [["taiwan"], ["korea"], []],
    frozenset(("usa", "japan")): [["panama"], []],
    frozenset(("usa", "china")): [["panama", "malacca"], ["malacca"], []],
    frozenset(("usa", "germany")): [["panama", "gibraltar"], ["panama", "suez"], []],
    frozenset(("usa", "france")): [["panama", "gibraltar"], ["panama", "suez"], []],
    frozenset(("usa", "italy")): [["panama", "gibraltar"], ["panama", "suez"], []],
    frozenset(("usa", "britain")): [["panama", "gibraltar"], []],
    frozenset(("usa", "ussr")): [["panama", "gibraltar"], ["panama", "suez"], []],
}
TRADE_MODE_FACTOR = {"land": 0.65, "sea": 1.0, "air": 2.75}
TRADE_COST_PER_1000KM_PER_1000_UNITS = {"land": 900, "sea": 1500, "air": 4200}


def _trade_distance_km(a, b):
    from math import radians, sin, cos, asin, sqrt
    if a not in TRADE_COUNTRY_COORDS or b not in TRADE_COUNTRY_COORDS: return 1000.0
    lon1, lat1 = TRADE_COUNTRY_COORDS[a]; lon2, lat2 = TRADE_COUNTRY_COORDS[b]
    r = 6371.0
    dlon, dlat = radians(lon2-lon1), radians(lat2-lat1)
    x = sin(dlat/2)**2 + cos(radians(lat1))*cos(radians(lat2))*sin(dlon/2)**2
    return r * 2 * asin(sqrt(max(0, min(1, x))))


def _land_open(cid):
    _, p = get_player_by_country(cid)
    return bool((p or {}).get("land_trade_open", True))


def _war_between(a, b):
    if not a or not b: return False
    return any({w.get("attacker"), w.get("defender")} == {a, b}
               for w in active_wars.values() if not w.get("resolved"))


def _infra_ready(country, infra_id):
    _, p = get_player_by_country(country)
    return bool(p and get_infra_level(p, infra_id) > 0)


def _route_candidates(a, b):
    key = frozenset((a, b))
    out = []
    if key in LAND_NEIGHBORS and _land_open(a) and _land_open(b):
        out.append({"mode":"land", "straits":[]})
    # دریایی: هر دو طرف باید بندر داشته باشند.
    if _infra_ready(a, "naval_port") and _infra_ready(b, "naval_port"):
        for route in SEA_ROUTE_HINTS.get(key, [[]]):
            if all(not STRAITS_DATA.get(s, {}).get("closed", False) for s in route):
                out.append({"mode":"sea", "straits":route})
    # هوایی: هر دو طرف فرودگاه داشته باشند.
    if _infra_ready(a, "air_airport") and _infra_ready(b, "air_airport"):
        out.append({"mode":"air", "straits":[]})
    return out


def _route_quote(a, b, amount, preferred_mode=None):
    if _war_between(a, b):
        return None, "در زمان جنگ، تجارت مستقیم بین دو کشور تحریم است."
    routes = _route_candidates(a, b)
    if not routes:
        return None, "هیچ مسیر قابل استفاده‌ای بین دو کشور وجود ندارد."
    distance = max(100.0, _trade_distance_km(a, b))
    quotes = []
    for r in routes:
        mode = r["mode"]
        base = (max(1, amount) / 1000.0) * (distance / 1000.0) * TRADE_COST_PER_1000KM_PER_1000_UNITS[mode]
        toll = sum(max(0, int(STRAITS_DATA[s].get("toll", 0))) for s in r["straits"] if s in STRAITS_DATA)
        cost = int(round(base + toll))
        quotes.append({**r, "distance_km": int(round(distance)), "transport_cost": cost, "toll": toll,
                       "strait_costs":[{"id":s,"name":STRAITS_DATA[s]["name"],"cost":int(STRAITS_DATA[s].get("toll",0)),
                                         "owner":strait_holdings.get(s)} for s in r["straits"]]})
    if preferred_mode:
        same = [q for q in quotes if q["mode"] == preferred_mode]
        if not same: return None, "این نوع حمل برای این معامله ممکن نیست."
        return min(same, key=lambda x: x["transport_cost"]), None
    # ارزان‌ترین مسیر مجاز انتخاب می‌شود؛ اگر تنگه بسته باشد، مسیر دیگر خودکار انتخاب می‌شود.
    return min(quotes, key=lambda x: x["transport_cost"]), None


def _route_options(a, b, amount):
    if _war_between(a, b): return [], "در زمان جنگ، تجارت مستقیم بین دو کشور تحریم است."
    routes = _route_candidates(a, b)
    if not routes: return [], "هیچ مسیر قابل استفاده‌ای بین دو کشور وجود ندارد."
    distance = max(100.0, _trade_distance_km(a, b)); out=[]
    for r in routes:
        mode=r["mode"]; base=(max(1,amount)/1000.0)*(distance/1000.0)*TRADE_COST_PER_1000KM_PER_1000_UNITS[mode]
        toll=sum(max(0,int(STRAITS_DATA[s].get("toll",0))) for s in r["straits"] if s in STRAITS_DATA)
        out.append({**r,"distance_km":int(round(distance)),"transport_cost":int(round(base+toll)),"toll":toll,
                    "strait_costs":[{"id":s,"name":STRAITS_DATA[s]["name"],"cost":int(STRAITS_DATA[s].get("toll",0)),"owner":strait_holdings.get(s)} for s in r["straits"]]})
    return out, None

def _listing_view(l):
    side = l.get("side", "sell")
    if side == "sell":
        return {**l, "side":"sell", "country":l["seller"], "resource":l["sell_resource"],
                "amount":l["sell_amount"], "price_resource":l["want_resource"], "price_amount":l["want_amount"]}
    return {**l, "side":"buy", "country":l["buyer"], "resource":l["buy_resource"],
            "amount":l["buy_amount"], "price_resource":l["offer_resource"], "price_amount":l["offer_amount"]}


async def get_market(request):
    rows = []
    viewer_cid = request.query.get("country")
    for l in market_listings.values():
        if l.get("status") != "open": continue
        v = _listing_view(l)
        owner_cid = v["country"]
        if viewer_cid and viewer_cid in COUNTRIES and viewer_cid != owner_cid:
            if v["side"] == "sell":
                origin_cid, dest_cid = owner_cid, viewer_cid
            else:
                origin_cid, dest_cid = viewer_cid, owner_cid
            qs, err = _route_options(origin_cid, dest_cid, v["amount"])
            v["routes"] = qs; v["route_error"] = err
        else:
            v["routes"] = []
        rows.append(v)
    return web.json_response({"listings": rows,
                              "trade_modes":{"land":True,"sea":True,"air":True}})


async def create_listing(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success":False,"error":"unauthorized"}, status=401)
    data = await read_json(request); side = data.get("side", "sell")
    try:
        amount = int(data.get("amount", 0)); price_amount = int(data.get("price_amount", 0))
    except (TypeError, ValueError):
        return web.json_response({"success":False,"error":"invalid_amount","message":"مقدارها باید عدد صحیح باشند."}, status=400)
    resource = data.get("resource"); price_resource = data.get("price_resource")
    if resource not in RESOURCE_NAMES or (price_resource != "money" and price_resource not in RESOURCE_NAMES):
        return web.json_response({"success":False,"error":"invalid_res","message":"کالا و چیزی که در ازای آن می‌خواهید را انتخاب کنید."}, status=400)
    if side not in ("sell", "buy") or amount <= 0 or price_amount <= 0:
        return web.json_response({"success":False,"error":"invalid_amount","message":"هر دو مقدار باید عدد صحیح بزرگ‌تر از صفر باشند."}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    if not p.get("country"):
        return web.json_response({"success":False,"error":"no_country","message":"ابتدا کشور خود را انتخاب کنید."}, status=400)
    ensure_player_fields(p); accrue_player(p)
    cid = p.get("country")
    if side == "sell":
        available = int(p["resources"].get(resource, 0))
        if available < amount:
            return web.json_response({"success":False,"error":"not_enough_res","field":"amount","available":available,
                "message":f"موجودی شما {available:,} واحد {RESOURCE_NAMES[resource]} است."}, status=400)
        # Reserve the listed goods. Cancelling the order returns this escrow.
        p["resources"][resource] = p["resources"].get(resource, 0) - amount
        l = {"id":str(uuid.uuid4()),"side":"sell","seller":cid,"sell_resource":resource,"sell_amount":amount,
             "want_resource":price_resource,"want_amount":price_amount,"status":"open","escrowed":True,
             "created_at":utcnow().isoformat()}
    else:
        # Buy offers escrow the offered money/resource so the order cannot be posted twice with the same balance.
        available = int(p.get("money", 0)) if price_resource == "money" else int(p["resources"].get(price_resource, 0))
        if available < price_amount:
            label = "دلارِ خزانه" if price_resource == "money" else RESOURCE_NAMES[price_resource]
            return web.json_response({"success":False,"error":"not_enough_res" if price_resource != "money" else "not_enough_money",
                "field":"price_amount","available":available,
                "message":f"موجودی شما {available:,} {label} است."}, status=400)
        if price_resource == "money": p["money"] = p.get("money", 0) - price_amount
        else: p["resources"][price_resource] = p["resources"].get(price_resource, 0) - price_amount
        l = {"id":str(uuid.uuid4()),"side":"buy","buyer":cid,"buy_resource":resource,"buy_amount":amount,
             "offer_resource":price_resource,"offer_amount":price_amount,"status":"open","escrowed":True,
             "created_at":utcnow().isoformat()}
    market_listings[l["id"]] = l; save_state()
    return web.json_response({"success":True,"listing_id":l["id"]})


async def cancel_listing(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success":False,"error":"unauthorized"}, status=401)
    data = await read_json(request); lid = data.get("listing_id")
    p = players.get(uid); cid = p.get("country") if p else None
    l = market_listings.get(lid)
    owner = l.get("seller") if l and l.get("side", "sell") == "sell" else (l.get("buyer") if l else None)
    if not l: return web.json_response({"success":False,"error":"not_found","message":"آگهی پیدا نشد."}, status=404)
    if owner != cid: return web.json_response({"success":False,"error":"not_owner","message":"این آگهی متعلق به شما نیست."}, status=403)
    # Only newly escrowed listings need a refund; legacy listings were not deducted at creation.
    if l.get("escrowed") and p:
        ensure_player_fields(p)
        if l.get("side", "sell") == "sell":
            key = l["sell_resource"]
            p["resources"][key] = p["resources"].get(key, 0) + int(l.get("sell_amount", 0))
        else:
            key = l.get("offer_resource", "money"); value = int(l.get("offer_amount", 0))
            if key == "money": p["money"] = p.get("money", 0) + value
            else: p["resources"][key] = p["resources"].get(key, 0) + value
    del market_listings[lid]; save_state()
    return web.json_response({"success":True})


async def accept_listing(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success":False,"error":"unauthorized"}, status=401)
    data = await read_json(request); lid = data.get("listing_id")
    if uid not in players: players[uid] = create_player(uid)
    actor = players[uid]; actor_cid = actor.get("country"); l = market_listings.get(lid)
    if not l or l.get("status") != "open": return web.json_response({"success":False,"error":"closed","message":"این آگهی دیگر فعال نیست."}, status=400)
    side = l.get("side", "sell")
    owner_cid = l.get("seller") if side == "sell" else l.get("buyer")
    if owner_cid == actor_cid: return web.json_response({"success":False,"error":"self_buy","message":"نمی‌توانید آگهی کشور خودتان را قبول کنید."}, status=400)

    # Direction is important: for a sell order the owner sells to the visitor;
    # for a buy order the visitor sells to the owner.
    seller_cid = owner_cid if side == "sell" else actor_cid
    buyer_cid = actor_cid if side == "sell" else owner_cid
    _, seller = get_player_by_country(seller_cid); _, buyer = get_player_by_country(buyer_cid)
    if not seller or not buyer: return web.json_response({"success":False,"error":"player_gone","message":"یکی از کشورها دیگر بازیکن فعال ندارد."}, status=400)
    ensure_player_fields(seller); ensure_player_fields(buyer)
    accrue_player(seller); accrue_player(buyer)

    resource = l["sell_resource"] if side == "sell" else l["buy_resource"]
    amount = int(l["sell_amount"] if side == "sell" else l["buy_amount"])
    pay_res = l["want_resource"] if side == "sell" else l["offer_resource"]
    pay_amount = int(l["want_amount"] if side == "sell" else l["offer_amount"])
    escrowed = bool(l.get("escrowed"))
    payment_escrowed = side == "buy" and escrowed
    goods_escrowed = side == "sell" and escrowed

    route, route_err = _route_quote(seller_cid, buyer_cid, amount, data.get("mode"))
    if route_err: return web.json_response({"success":False,"error":"no_route","message":route_err}, status=400)
    if not goods_escrowed and seller["resources"].get(resource, 0) < amount:
        return web.json_response({"success":False,"error":"seller_no_res","message":f"فروشنده فقط {seller['resources'].get(resource,0):,} واحد {RESOURCE_NAMES[resource]} دارد."}, status=400)

    if pay_res == "money":
        required_now = route["transport_cost"] + (0 if payment_escrowed else pay_amount)
        if buyer.get("money", 0) < required_now:
            return web.json_response({"success":False,"error":"not_enough_money",
                "message":f"خزانه برای معامله و حمل کافی نیست؛ موجودی {buyer.get('money',0):,}$، مبلغ معامله {0 if payment_escrowed else pay_amount:,}$ و حمل {route['transport_cost']:,}$ است."}, status=400)
    else:
        if not payment_escrowed and buyer["resources"].get(pay_res, 0) < pay_amount:
            return web.json_response({"success":False,"error":"not_enough_res","message":f"موجودی {RESOURCE_NAMES[pay_res]} برای پرداخت کافی نیست."}, status=400)
        if buyer.get("money", 0) < route["transport_cost"]:
            return web.json_response({"success":False,"error":"not_enough_money","message":f"هزینه حمل {route['transport_cost']:,}$ است و خزانه کافی نیست."}, status=400)

    if pay_res == "money":
        if not payment_escrowed: buyer["money"] -= pay_amount
        seller["money"] = seller.get("money", 0) + pay_amount
    else:
        if not payment_escrowed: buyer["resources"][pay_res] -= pay_amount
        seller["resources"][pay_res] = seller["resources"].get(pay_res, 0) + pay_amount
    buyer["money"] -= route["transport_cost"]

    if not goods_escrowed:
        seller["resources"][resource] = seller["resources"].get(resource, 0) - amount
    buyer["resources"][resource] = buyer["resources"].get(resource, 0) + amount
    l["status"] = "filled"; l["actor"] = actor_cid; l["route"] = route; l["filled_at"] = utcnow().isoformat()
    for s in route.get("strait_costs", []):
        owner = s.get("owner")
        if owner:
            _, sp = get_player_by_country(owner)
            if sp: sp["money"] = sp.get("money", 0) + s["cost"]
    push_news("معامله بازار جهانی", f"{COUNTRIES[buyer_cid]['name']} {amount:,} {RESOURCE_NAMES[resource]} را از {COUNTRIES[seller_cid]['name']} خرید؛ مسیر {route['mode']} و هزینه حمل {route['transport_cost']:,}$.")
    save_state()
    return web.json_response({"success":True,"route":route,"transport_cost":route["transport_cost"]})


async def set_strait_settings(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success":False,"error":"unauthorized"}, status=401)
    data = await read_json(request); sid = data.get("site_id")
    if sid not in STRAITS_DATA: return web.json_response({"success":False,"error":"invalid_site"}, status=400)
    cid = players.get(uid,{}).get("country")
    if strait_holdings.get(sid) != cid: return web.json_response({"success":False,"error":"not_owner"}, status=403)
    toll = max(0, int(data.get("toll", STRAITS_DATA[sid].get("toll",0))))
    closed = bool(data.get("closed", STRAITS_DATA[sid].get("closed",False)))
    STRAITS_DATA[sid]["toll"] = toll; STRAITS_DATA[sid]["closed"] = closed
    state_word = "بسته" if closed else "باز"
    push_news("تغییر وضعیت تنگه", f"{COUNTRIES[cid]['name']} {STRAITS_DATA[sid]['name']} را {state_word} کرد و عوارض عبور را {toll:,}$ تعیین کرد.")
    save_state(); return web.json_response({"success":True,"toll":toll,"closed":closed})


async def set_border_settings(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success":False,"error":"unauthorized"}, status=401)
    if uid not in players: players[uid]=create_player(uid)
    p=players[uid];
    if not p.get("country"): return web.json_response({"success":False,"error":"no_country"}, status=400)
    open_=bool((await read_json(request)).get("open",True)); p["land_trade_open"]=open_
    push_news("مرز زمینی", f"{COUNTRIES[p['country']]['name']} مرزهای تجارت زمینی را {'باز' if open_ else 'بسته'} کرد.")
    save_state(); return web.json_response({"success":True,"open":open_})

# =========================================================
# API News / Rankings
# =========================================================
async def get_news(request):
    # برای ردیف‌های قدیمی بیانیه نیز متن قبلی را از خبر/اعلان پنهان می‌کنیم.
    rows = []
    for item in reversed(news_feed[-30:]):
        row = dict(item)
        title = str(row.get("title", ""))
        if "بیانیه" in title:
            old_text = str(row.get("text", ""))
            prefix = old_text.split(":", 1)[0].strip() if ":" in old_text else ""
            if prefix and len(prefix) <= 80 and not prefix.startswith("کشور"):
                row["text"] = f"کشور «{prefix}» بیانیه‌ای منتشر کرد؛ متن فقط در بخش بیانیه‌ها قابل مشاهده است."
            else:
                row["text"] = "بیانیه‌ای منتشر شد؛ متن فقط در بخش بیانیه‌ها قابل مشاهده است."
            row["title"] = "بیانیه"
        rows.append(row)
    return web.json_response(rows or [
        {"title": "سال ۱۹۹۳", "text": "جهان در آستانه یک بحران بزرگ قرار دارد."}])

def compute_rankings():
    rows = []
    for uid, p in players.items():
        cid = p.get("country")
        if not cid: continue
        ensure_player_fields(p); recompute_army(p); rates = compute_rates(p)
        eco = max(0, int(rates["net_income"] // 1000)); mil = p.get("army", 0)
        dip = 0
        for t in active_treaties:
            if t["country_a"] == cid or t["country_b"] == cid: dip += 100
        for u in unions.values():
            if cid in u.get("members", []): dip += 150
        dev = sum(p.get("infra_levels", {}).values()) * 50
        terr = (sum(1 for o in map_holdings.values() if o == cid)
                + sum(1 for o in strait_holdings.values() if o == cid)
                + 5 * sum(1 for o in occupied_countries.values() if o == cid))
        rows.append({"country": cid, "name": COUNTRIES[cid]["name"], "flag": COUNTRIES[cid]["flag"],
                     "economy": eco, "military": mil, "territory": terr, "diplomacy": dip,
                     "development": dev, "is_eliminated": p.get("is_eliminated", False)})
    W = {"economy": 30, "military": 25, "territory": 20, "development": 15, "diplomacy": 10}
    mx = {k: max([r[k] for r in rows] + [0]) for k in W}
    for r in rows:
        r["overall"] = round(sum(W[k] * r[k] / mx[k] for k in W if mx[k] > 0), 1)
    rows.sort(key=lambda x: x["overall"], reverse=True)
    for i, r in enumerate(rows): r["rank"] = i + 1
    return rows

async def get_rankings(request):
    return web.json_response(compute_rankings())

# =========================================================
# Health / Debug
# =========================================================
# =========================================================
# Loans (وام بین کشورها)
# =========================================================
def _game_window():
    starts = [parse_dt(p.get("started_at")) for p in players.values() if p.get("started_at")]
    starts = [s for s in starts if s]
    if not starts: return None, None
    start = min(starts)
    return start, start + timedelta(days=GAME_TOTAL_DAYS)

def loan_rate_for_hours(hours):
    steps = int(hours // LOAN_INTEREST_STEP_HOURS)
    return min(steps * LOAN_INTEREST_PER_STEP, LOAN_MAX_HOURS // LOAN_INTEREST_STEP_HOURS * LOAN_INTEREST_PER_STEP)

def loan_max_hours_now():
    _, end = _game_window()
    if not end: return float(LOAN_MAX_HOURS)
    left = (end - timedelta(seconds=LOAN_END_MARGIN_SECONDS) - utcnow()).total_seconds() / 3600
    return max(0.0, min(float(LOAN_MAX_HOURS), left))

def loan_lending_open():
    """(open, reason)"""
    start, end = _game_window()
    if not start: return False, "بازی هنوز شروع نشده است."
    now = utcnow()
    if now >= end - timedelta(seconds=LOAN_END_MARGIN_SECONDS):
        return False, "وام‌دهی بسته شده است؛ جنگ جهانی نزدیک است."
    return True, ""

def _is_vip(p): return bool(p and p.get("vip"))

def _active_debt(cid):
    for l in loans.values():
        if l["borrower"] == cid and l["status"] in ("active", "overdue"): return l
    return None

def _loan_fee_rates(lender_p, borrower_p, hours):
    if hours < LOAN_INTEREST_STEP_HOURS: return 0.0, 0.0   # وام زیر ۱۲ ساعت بدون کارمزد
    return (0.0 if _is_vip(lender_p) else LOAN_FEE), (0.0 if _is_vip(borrower_p) else LOAN_FEE)

def _daily_income(p):
    ensure_player_fields(p); recompute_army(p)
    return max(0.0, compute_rates(p)["net_income"])

def loan_lender_cap(p): return int(_daily_income(p) * LOAN_CAP_FRACTION)

def _loan_check(lender_cid, borrower_cid, amount, hours, ignore_pending_id=None):
    """اعتبارسنجی کامل؛ پیام خطا یا None."""
    ok, why = loan_lending_open()
    if not ok: return why
    if lender_cid == borrower_cid: return "نمی‌توانید به خودتان وام بدهید."
    lu, lp = get_player_by_country(lender_cid); bu, bp = get_player_by_country(borrower_cid)
    if not lp or lp.get("is_eliminated"): return "کشور وام‌دهنده معتبر نیست."
    if not bp or bp.get("is_eliminated"): return "کشور وام‌گیرنده معتبر نیست."
    if _active_debt(lender_cid): return "تا تسویه وام فعلی‌تان نمی‌توانید وام بدهید."
    if _active_debt(borrower_cid): return "این کشور هم‌اکنون یک وام تسویه‌نشده دارد."
    if amount <= 0: return "مبلغ نامعتبر است."
    maxh = loan_max_hours_now()
    if hours <= 0 or hours > maxh + 1e-9: return f"مهلت باید حداکثر {maxh:.1f} ساعت باشد."
    accrue_player(lp); accrue_player(bp)
    cap = loan_lender_cap(lp)
    if amount > cap: return f"مبلغ از سقف هر وام ({cap:,}$) بیشتر است."
    if lp.get("money", 0) < amount: return "موجودی خزانه برای این وام کافی نیست."
    repay = amount * (1 + loan_rate_for_hours(hours))
    ability = bp.get("money", 0) + _daily_income(bp) * hours / 24
    if ability < repay: return "وام‌گیرنده با خزانه و درآمدش نمی‌تواند در این مهلت بازپرداخت کند."
    return None

def _lname(cid): return f"{COUNTRIES[cid]['flag']} {COUNTRIES[cid]['name']}" if cid in COUNTRIES else "—"

async def notify_user(uid, text):
    try: await bot.send_message(uid, text)
    except Exception as e: logging.warning("notify_user %s: %s", uid, e)

def _credit_lender(l, amount):
    """بازگشت پول به وام‌دهنده (کارمزد ۵٪ از دریافت)."""
    _, lp = get_player_by_country(l["lender"])
    if lp is None: return
    lp["money"] = lp.get("money", 0) + amount * (1 - l.get("fee_lender", 0))

def _apply_payment(l, amount):
    amount = min(amount, l["remaining"])
    if amount <= 0: return 0
    _credit_lender(l, amount)
    l["remaining"] = max(0.0, l["remaining"] - amount)
    l["paid"] = l.get("paid", 0) + amount
    if l["remaining"] <= 0.5:
        l["remaining"] = 0.0; l["status"] = "settled"; l["settled_at"] = utcnow().isoformat()
        push_news("تسویه وام", f"{_lname(l['borrower'])} وام خود از {_lname(l['lender'])} را تسویه کرد.")
    return amount

def loan_garnish(player, available):
    """وام معوق: تا تسویه، درآمد وام‌گیرنده به وام‌دهنده می‌رسد. مقدار برداشت‌شده را برمی‌گرداند."""
    cid = player.get("country")
    if not cid or available <= 0: return 0
    l = _active_debt(cid)
    if not l or l["status"] != "overdue": return 0
    return _apply_payment(l, available)

def loan_tick():
    now = utcnow(); changed = False
    _, end = _game_window()
    lending_ok, _why = loan_lending_open()
    for l in list(loans.values()):
        if l["status"] == "pending":
            created = parse_dt(l["created_at"])
            if (created and now - created > timedelta(hours=LOAN_PENDING_TTL_HOURS)) or not lending_ok:
                l["status"] = "expired"; l["closed_at"] = now.isoformat(); changed = True
        elif l["status"] == "active":
            due = parse_dt(l["due_at"])
            if due and now >= due:
                _, bp = get_player_by_country(l["borrower"])
                if bp is not None: accrue_player(bp)
                pay = min(bp.get("money", 0) if bp else 0, l["remaining"])
                if bp is not None: bp["money"] = bp.get("money", 0) - pay
                _apply_payment(l, pay)
                if l["status"] != "settled":
                    l["status"] = "overdue"
                    push_news("وام معوق", f"{_lname(l['borrower'])} نتوانست وام خود را کامل بپردازد؛ درآمدش تا تسویه به {_lname(l['lender'])} می‌رسد.", "warning")
                changed = True
    if changed: save_state()

def _loan_view(l, my_cid):
    ts = l.get("settled_at") or l.get("closed_at") or l.get("accepted_at") or l["created_at"]
    v = {"id": l["id"], "lender": l["lender"], "borrower": l["borrower"],
         "lender_name": COUNTRIES[l["lender"]]["name"], "lender_flag": COUNTRIES[l["lender"]]["flag"],
         "borrower_name": COUNTRIES[l["borrower"]]["name"], "borrower_flag": COUNTRIES[l["borrower"]]["flag"],
         "amount": l["amount"], "hours": l["hours"], "rate": round(l["rate"] * 100),
         "repay": l["repay"], "remaining": l.get("remaining", l["repay"]), "early": l["early"],
         "status": l["status"], "at": ts, "due_at": l.get("due_at"),
         "role": "lender" if l["lender"] == my_cid else ("borrower" if l["borrower"] == my_cid else None)}
    v["can_accept"] = l["status"] == "pending" and l["borrower"] == my_cid
    v["can_cancel"] = l["status"] == "pending" and l["lender"] == my_cid
    v["can_repay"] = l["status"] == "active" and l["borrower"] == my_cid and l["early"]
    return v

async def get_loans(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    p = _me(uid); cid = p.get("country")
    if not cid: return web.json_response({"error": "no_country"}, status=400)
    loan_tick(); accrue_player(p)
    is_open, reason = loan_lending_open()
    debt = _active_debt(cid)
    block = reason if not is_open else ("تا تسویه وام فعلی‌تان نمی‌توانید وام بدهید." if debt else "")
    opts = []
    for ouid, op in players.items():
        oc = op.get("country")
        if oc and oc != cid and not op.get("is_eliminated"):
            opts.append({"id": oc, "name": COUNTRIES[oc]["name"], "flag": COUNTRIES[oc]["flag"],
                         "busy": _active_debt(oc) is not None})
    rows = sorted(loans.values(), key=lambda x: x["created_at"], reverse=True)
    return web.json_response({
        "now": utcnow().isoformat(), "my_country": cid, "lending_open": is_open and not debt,
        "block_reason": block, "cap": loan_lender_cap(p), "max_hours": round(loan_max_hours_now(), 2),
        "vip": _is_vip(p), "countries": opts, "owes": debt["remaining"] if debt else 0,
        "mine": [_loan_view(l, cid) for l in rows if cid in (l["lender"], l["borrower"])][:60],
        "book": [_loan_view(l, cid) for l in rows][:100]})

async def propose_loan(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "message": "unauthorized"}, status=401)
    p = _me(uid); cid = p.get("country")
    if not cid: return _bad("ابتدا کشور انتخاب کنید.")
    data = await read_json(request); to = data.get("to")
    try: amount = int(float(data.get("amount", 0))); hours = float(data.get("hours", 0))
    except Exception: return _bad("مقدار نامعتبر است.")
    if to not in COUNTRIES: return _bad("کشور وام‌گیرنده را انتخاب کنید.")
    loan_tick()
    err = _loan_check(cid, to, amount, hours)
    if err: return _bad(err)
    rate = loan_rate_for_hours(hours)
    lid = str(uuid.uuid4())
    loans[lid] = {"id": lid, "lender": cid, "borrower": to, "amount": amount, "hours": hours,
                  "rate": rate, "repay": round(amount * (1 + rate)), "remaining": round(amount * (1 + rate)),
                  "early": bool(data.get("early")), "status": "pending", "created_at": utcnow().isoformat()}
    save_state()
    bu, _ = get_player_by_country(to)
    if bu: await notify_user(bu, f"💰 {_lname(cid)} پیشنهاد وام {amount:,}$ با مهلت {hours:g} ساعت و بازپرداخت {loans[lid]['repay']:,}$ داد. از بخش وام پاسخ دهید.")
    return web.json_response({"success": True, "message": "پیشنهاد وام ارسال شد."})

async def respond_loan(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "message": "unauthorized"}, status=401)
    p = _me(uid); cid = p.get("country"); data = await read_json(request)
    l = loans.get(data.get("loan_id"))
    if not l or l["status"] != "pending": return _bad("پیشنهاد معتبر نیست.", 404)
    if l["borrower"] != cid: return _bad("این پیشنهاد برای شما نیست.", 403)
    if not data.get("accept"):
        l["status"] = "declined"; l["closed_at"] = utcnow().isoformat(); save_state()
        lu, _ = get_player_by_country(l["lender"])
        if lu: await notify_user(lu, f"❌ {_lname(cid)} پیشنهاد وام شما را رد کرد.")
        return web.json_response({"success": True, "message": "پیشنهاد رد شد."})
    err = _loan_check(l["lender"], cid, l["amount"], l["hours"])
    if err: return _bad(err)
    _, lp = get_player_by_country(l["lender"]); bp = p
    fee_l, fee_b = _loan_fee_rates(lp, bp, l["hours"])
    now = utcnow()
    lp["money"] -= l["amount"]
    bp["money"] = bp.get("money", 0) + l["amount"] * (1 - fee_b)
    l.update({"status": "active", "accepted_at": now.isoformat(),
              "due_at": (now + timedelta(hours=l["hours"])).isoformat(),
              "fee_lender": fee_l, "fee_borrower": fee_b, "remaining": l["repay"]})
    push_news("وام جدید", f"{_lname(l['lender'])} به {_lname(cid)} مبلغ {l['amount']:,}$ وام داد.")
    save_state()
    lu, _ = get_player_by_country(l["lender"])
    if lu: await notify_user(lu, f"✅ {_lname(cid)} وام {l['amount']:,}$ را پذیرفت.")
    return web.json_response({"success": True, "message": f"وام دریافت شد (کارمزد {fee_b*100:g}٪)."})

async def cancel_loan(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "message": "unauthorized"}, status=401)
    p = _me(uid); cid = p.get("country"); data = await read_json(request)
    l = loans.get(data.get("loan_id"))
    if not l or l["status"] != "pending": return _bad("پیشنهاد معتبر نیست.", 404)
    if l["lender"] != cid: return _bad("این پیشنهاد مال شما نیست.", 403)
    l["status"] = "cancelled"; l["closed_at"] = utcnow().isoformat(); save_state()
    return web.json_response({"success": True, "message": "پیشنهاد لغو شد."})

async def repay_loan(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "message": "unauthorized"}, status=401)
    p = _me(uid); cid = p.get("country"); data = await read_json(request)
    l = loans.get(data.get("loan_id"))
    if not l or l["status"] != "active": return _bad("وام فعالی پیدا نشد.", 404)
    if l["borrower"] != cid: return _bad("این وام مال شما نیست.", 403)
    if not l["early"]: return _bad("این وام فقط سر موعد قابل بازپرداخت است.")
    accrue_player(p)
    if p.get("money", 0) < l["remaining"]: return _bad("موجودی خزانه برای بازپرداخت کافی نیست.")
    p["money"] -= l["remaining"]; _apply_payment(l, l["remaining"]); save_state()
    return web.json_response({"success": True, "message": "وام تسویه شد."})

async def vip_command(message: types.Message):
    if not ADMIN_ID or message.from_user.id != ADMIN_ID: return
    parts = (message.text or "").split()
    if len(parts) < 2: await message.answer("/vip <user_id> [on|off]"); return
    try: tid = int(parts[1])
    except ValueError: await message.answer("user_id نامعتبر"); return
    on = not (len(parts) > 2 and parts[2].lower() == "off")
    if tid not in players: await message.answer("بازیکن پیدا نشد"); return
    players[tid]["vip"] = on; save_state()
    await message.answer(f"VIP {'فعال' if on else 'غیرفعال'} شد برای {tid}")

# =========================================================
# Stats (آمار کشور: رفاه و امنیت)
# =========================================================
def welfare_tick():
    import random
    now = utcnow(); changed = False
    for uid_, p in players.items():
        cid = p.get("country")
        if not cid or not p.get("started_at") or p.get("is_eliminated"): continue
        ensure_player_fields(p)
        nxt = parse_dt(p.get("welfare_next_at"))
        if nxt is None:
            p["welfare_next_at"] = (now + timedelta(hours=random.uniform(1, WELFARE_EVENT_MAX_H - 2))).isoformat()
            changed = True; continue
        if now < nxt: continue
        risks = COUNTRY_RISKS.get(cid, [])
        keys = list(WELFARE_EVENTS)
        key = random.choices(keys, weights=[3 if k in risks else 1 for k in keys])[0]
        ev = WELFARE_EVENTS[key]
        lvl = min(get_infra_level(p, ev["bld"]), len(INFRASTRUCTURE[ev["bld"]]["levels"]))
        p["welfare_next_at"] = (now + timedelta(hours=random.uniform(WELFARE_EVENT_MIN_H, WELFARE_EVENT_MAX_H))).isoformat()
        changed = True
        if random.random() > ev["chance"] * (1 - 0.15 * lvl): continue   # زیرساخت احتمال را کم می‌کند
        drop = ev["drop"] * (1 - 0.12 * lvl)                              # و افت را هم
        cur_pen = welfare_penalty_now(p); gross = welfare_gross(p)
        eff = max(0.0, min(drop, gross - cur_pen))                        # نه زیرِ صفر
        if eff < 0.05: eff = 0.0
        if eff > 0:
            p["welfare_penalty"] = cur_pen + eff; p["welfare_pen_at"] = now.isoformat()
        bname = INFRASTRUCTURE[ev["bld"]]["name"]
        text = (f"{ev['icon']} {ev['name']} — رفاه {eff:.1f} واحد کم شد ({bname} سطح {lvl} از 5)" if eff > 0
                else f"{ev['icon']} {ev['name']} — خسارتی به رفاه نزد ({bname} سطح {lvl} از 5)")
        evs = p.setdefault("welfare_events", [])
        evs.append({"at": now.isoformat(), "text": text, "key": key, "drop": round(eff, 2)})
        del evs[:-30]
    if changed: save_state()

async def get_stats(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    p = _me(uid); cid = p.get("country")
    if not cid: return web.json_response({"error": "no_country"}, status=400)
    rates = compute_rates(p)
    gross, pen = welfare_gross(p), welfare_penalty_now(p)
    bonus = max(0.0, gross - pen)
    eco_base = rates["economy_income"]
    blds = []
    for bid, item in INFRASTRUCTURE.items():
        if item.get("group") != "welfare": continue
        blds.append({"id": bid, "name": item["name"], "icon": item["icon"],
                     "level": min(get_infra_level(p, bid), len(item["levels"])), "max_level": len(item["levels"])})
    upkeep_items = []
    group_titles = {"power": "برق", "manpower": "نیروی انسانی", "resource": "منابع", "land": "نیروی زمینی",
                    "naval": "نیروی دریایی", "air": "نیروی هوایی", "missile": "موشکی", "strategy": "استراتژیک", "welfare": "رفاه و امنیت"}
    for bid, item in INFRASTRUCTURE.items():
        lv = min(get_infra_level(p, bid), len(item["levels"]))
        if lv <= 0: continue
        cost = infra_upkeep(item, lv)
        if cost <= 0: continue
        upkeep_items.append({"id": bid, "name": item["name"], "icon": item.get("icon", "🏗️"),
                             "group": group_titles.get(item.get("group"), "زیرساخت"), "amount": cost})
    upkeep_items.sort(key=lambda x: x["amount"], reverse=True)
    return web.json_response({
        "now": utcnow().isoformat(), "bonus": round(bonus, 1), "gross": round(gross, 1),
        "penalty": round(min(pen, gross), 1), "max": WELFARE_MAX, "eco_base": eco_base,
        "extra_income": int(round(rates["welfare_extra_income"])), "buildings": blds,
        "income_base": rates["base_income"], "income_economy": rates["economy_income"],
        "income_map": rates["map_income"], "income_straits": rates["strait_income"],
        "income_occupation": rates["occupation_income"],
        "income_before_welfare": rates["income_before_welfare"],
        "welfare_extra_income": rates["welfare_extra_income"],
        "total_income": rates["gross_income"], "daily_upkeep": rates["daily_upkeep"],
        "net_income": rates["net_income"], "upkeep_items": upkeep_items,
        "risks": [WELFARE_EVENTS[k]["name"] for k in COUNTRY_RISKS.get(cid, [])],
        "events": list(reversed(p.get("welfare_events", [])))[:20]})

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

NO_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"}
async def index(request): return web.FileResponse(os.path.join(WEB_DIR, "index.html"), headers=NO_CACHE)
async def style(request): return web.FileResponse(os.path.join(WEB_DIR, "style.css"), headers=NO_CACHE)
async def app_js(request): return web.FileResponse(os.path.join(WEB_DIR, "app.js"), headers=NO_CACHE)

async def create_web_app():
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_get("/", index)
    app.router.add_get("/style.css", style)
    app.router.add_get("/app.js", app_js)
    app.router.add_static("/images/", path=os.path.join(WEB_DIR, "images"), name="images")
    app.router.add_static("/fonts/", path=os.path.join(WEB_DIR, "fonts"), name="fonts")

    for path, h in [
        ("/api/player", get_player), ("/api/countries", get_countries),
        ("/api/army-units", get_army_units), ("/api/diplomacy", get_diplomacy),
        ("/api/wars", get_wars), ("/api/map-sites", get_map_sites),
        ("/api/announcements", get_announcements), ("/api/announcements/status", get_announcement_status), ("/api/announcement", get_announcement_detail),
        ("/api/union", get_union), ("/api/pm", get_pm), ("/api/market", get_market),
        ("/api/loans", get_loans), ("/api/stats", get_stats), ("/api/news", get_news), ("/api/rankings", get_rankings),
        ("/api/war/forces", get_forces), ("/api/map/transits", get_map_transits), ("/api/war/log", get_war_log), ("/api/satellite/scans", sat_get_scans),
        ("/api/debug-auth", debug_auth), ("/health", health)]:
        app.router.add_get(path, h)

    for path, h in [
        ("/api/select-country", select_country), ("/api/upgrade-infra", upgrade_infra),
        ("/api/upgrade-economy", upgrade_economy), ("/api/train-unit", train_unit),
        ("/api/propose-treaty", propose_treaty), ("/api/respond-treaty", respond_treaty),
        ("/api/war/declare", declare_war), ("/api/war/battle", perform_battle),
        ("/api/map/capture", capture_site), ("/api/war/dispatch", dispatch_forces), ("/api/war/recall", recall_forces),
        ("/api/satellite/launch", sat_launch), ("/api/satellite/scan-site", sat_scan_site),
        ("/api/satellite/scan-country", sat_scan_country),
        ("/api/announcements/create", create_announcement),
        ("/api/announcements/react", react_announcement),
        ("/api/announcements/comment", comment_announcement),
        ("/api/union/create", create_union), ("/api/union/invite", invite_union),
        ("/api/union/respond", respond_union_invite), ("/api/union/request", request_union_membership),
        ("/api/union/request/respond", respond_union_request), ("/api/union/kick", kick_union_member),
        ("/api/union/leave", leave_union), ("/api/union/message", send_union_message),
        ("/api/pm/send", send_pm),
        ("/api/market/create", create_listing), ("/api/market/cancel", cancel_listing),
        ("/api/market/accept", accept_listing), ("/api/strait/settings", set_strait_settings),
        ("/api/loans/propose", propose_loan), ("/api/loans/respond", respond_loan),
        ("/api/loans/cancel", cancel_loan), ("/api/loans/repay", repay_loan),
        ("/api/border/settings", set_border_settings)]:
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
    while True:
        await asyncio.sleep(30)
        try: await check_wars_tick()
        except Exception as e: logging.error("war tick: %s", e)
        try: welfare_tick()
        except Exception as e: logging.error("welfare tick: %s", e)
        try: loan_tick()
        except Exception as e: logging.error("loan tick: %s", e)

dp.message.register(vip_command, Command("vip"))

async def main():
    logging.info("FRONT-LINE 1993 GAME STARTING...")
    load_state()
    asyncio.create_task(autosave_loop())
    asyncio.create_task(war_tick_loop())
    asyncio.create_task(transit_loop())
    await start_web_server()
    await bot.delete_webhook(drop_pending_updates=True)
    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="🎮 بازی", web_app=WebAppInfo(url=WEB_APP_URL)))
        logging.info("MENU BUTTON SET")
    except Exception as e:
        logging.warning("set_chat_menu_button failed: %s", e)
    logging.info("BOT POLLING STARTED")
    await dp.start_polling(bot, drop_pending_updates=True, handle_signals=False)

if __name__ == "__main__":
    try: asyncio.run(main())
    except (KeyboardInterrupt, SystemExit): save_state()
