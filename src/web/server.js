const express = require("express");
const cors = require("cors");
const config = require("../config");
const { setupRoutes } = require("./routes");

// Создание Express-приложения
const app = express();

// Middleware для обработки JSON
app.use(
  express.json({
    verify: (req, res, buf, encoding) => {
      // Сохраняем тело запроса в rawBody для проверки подписи
      req.rawBody = buf;
    },
  })
);

// Middleware для обработки URL-кодированных данных
app.use(express.urlencoded({ extended: true }));

// CORS для безопасности
app.use(
  cors({
    origin: false, // Отключаем CORS для webhook, чтобы избежать проблем с внешними источниками
    credentials: true,
  })
);

// Настройка маршрутов
setupRoutes(app);

// Подключение маршрутов Nicepay
const nicepayRoutes = require("./nicepayRoutes");
app.use("/", nicepayRoutes);

// Обработка 404 ошибок
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Маршрут не найден",
    path: req.originalUrl,
  });
});

// Глобальная обработка ошибок
app.use((error, req, res, next) => {
  console.error("Ошибка в сервере:", error);
  res.status(500).json({
    error: "Внутренняя ошибка сервера",
    message:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Произошла ошибка",
  });
});

// Запуск сервера
function startServer() {
  const server = app.listen(config.WEBHOOK_PORT, () => {
    console.log(`HTTP-сервер запущен на порту ${config.WEBHOOK_PORT}`);
    console.log(
      `Webhook URL: http://localhost:${config.WEBHOOK_PORT}${config.WEBHOOK_PATH}`
    );
  });

  // Обработка сигналов завершения
  process.on("SIGTERM", () => {
    console.log("Получен SIGTERM, завершаем работу сервера...");
    server.close(() => {
      console.log("HTTP-сервер остановлен");
    });
  });

  process.on("SIGINT", () => {
    console.log("Получен SIGINT, завершаем работу сервера...");
    server.close(() => {
      console.log("HTTP-сервер остановлен");
    });
  });

  return server;
}

module.exports = { app, startServer };
