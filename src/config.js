const dotenv = require("dotenv");
const path = require("path");

// Загрузка переменных из .env файла
dotenv.config();

// Конфигурация приложения
const config = {
  // Telegram
  BOT_TOKEN: process.env.BOT_TOKEN,

  // База данных
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/vpn_shop",

  // Настройки Nicepay
  nicepay: {
    baseUrl: process.env.NICEPAY_BASE_URL,
    publicKey: process.env.NICEPAY_PUBLIC_KEY,
    secretKey: process.env.NICEPAY_SECRET_KEY,
    merchantId: process.env.NICEPAY_MERCHANT_ID,
    currency: process.env.NICEPAY_CURRENCY || "RUB",
    minAmount: Number(process.env.NICEPAY_MIN_AMOUNT || 250),
    maxAmount: Number(process.env.NICEPAY_MAX_AMOUNT || 10000),
    webhookPath: process.env.NICEPAY_WEBHOOK_PATH || "/nicepay/callback",
    successUrl: process.env.NICEPAY_SUCCESS_URL,
    failUrl: process.env.NICEPAY_FAIL_URL,
  },

  // Администраторы
  ADMIN_IDS: process.env.ADMIN_IDS
    ? process.env.ADMIN_IDS.split(",").map((id) => parseInt(id.trim()))
    : [],

  // Настройки приложения
  KEY_PRICE: parseInt(process.env.KEY_PRICE) || 150, // Цена VPN-ключа в рублях
  DEFAULT_PAYMENT_OPTIONS: [300, 400, 500, 700, 1000], // Варианты сумм для пополнения

  // Веб-сервер
  WEBHOOK_PORT: parseInt(process.env.WEBHOOK_PORT) || 300,

  // Типы ключей (для расширения в будущем)
  KEY_TYPES: {
    DEFAULT: "default",
    TRIAL: "trial",
  },

  // Статусы
  KEY_STATUSES: {
    AVAILABLE: "available",
    SOLD: "sold",
    REVOKED: "revoked",
    EXPIRED: "expired",
  },

  PAYMENT_STATUSES: {
    PENDING: "pending",
    PAID: "paid",
  },

  ORDER_STATUSES: {
    PAID: "paid",
  },

  // Настройки ключей
  KEY_VALIDITY_DAYS: 30, // Ключ действителен 30 дней
};

// Проверка обязательных переменных
const requiredEnvVars = [
  "BOT_TOKEN",
  "MONGODB_URI",
  "NICEPAY_BASE_URL",
  "NICEPAY_PUBLIC_KEY",
  "NICEPAY_SECRET_KEY",
  "NICEPAY_MERCHANT_ID",
];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error(
    "Отсутствуют обязательные переменные окружения:",
    missingEnvVars
  );
  process.exit(1);
}

module.exports = config;
