const config = require("../config");
const paymentService = require("../services/paymentService");
const { setupFreeKassaRoutes } = require("./freekassaRoutes");

function setupRoutes(app) {
  // Подключаем маршруты FreeKassa
  setupFreeKassaRoutes(app);

  // Маршрут для webhook от kassa.ai
  app.post(config.WEBHOOK_PATH, async (req, res) => {
    try {
      console.log("Получен webhook от kassa.ai:", req.body);

      // Проверяем наличие необходимых данных
      if (!req.body || !req.body.id || !req.body.status) {
        console.error("Некорректные данные webhook:", req.body);
        return res.status(400).json({
          success: false,
          error: "Некорректные данные webhook",
        });
      }

      // Проверяем секретный ключ в заголовке или параметрах запроса
      const providedSecret =
        req.headers["x-webhook-secret"] || req.query.secret;
      if (providedSecret !== config.KASSA_WEBHOOK_SECRET) {
        console.error("Неверный webhook secret:", providedSecret);
        return res.status(401).json({
          success: false,
          error: "Неверный webhook secret",
        });
      }

      // Обрабатываем webhook
      const result = await paymentService.handleWebhook(
        req.body,
        req.headers["x-signature"]
      );

      if (result.success) {
        console.log("Webhook успешно обработан:", result.message);
        res.status(200).json({
          success: true,
          message: result.message,
        });
      } else {
        console.error("Ошибка обработки webhook:", result.message);
        res.status(500).json({
          success: false,
          error: result.message,
        });
      }
    } catch (error) {
      console.error("Ошибка при обработке webhook:", error);
      res.status(500).json({
        success: false,
        error: "Внутренняя ошибка сервера",
      });
    }
  });

  // Маршрут для проверки состояния сервера
  app.get("/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "VPN Shop Webhook Server",
    });
  });

  // Маршрут для проверки корректности настройки webhook
  app.get(config.WEBHOOK_PATH, (req, res) => {
    res.status(200).json({
      message: "Webhook endpoint is ready",
      webhook_path: config.WEBHOOK_PATH,
      shop_id: config.KASSA_SHOP_ID,
    });
  });

  // Маршрут для успешного возврата после оплаты (опционально)
  app.get("/success", (req, res) => {
    res.status(200).send(`
      <html>
        <head><title>Оплата прошла успешно</title></head>
        <body>
          <h1>Спасибо за оплату!</h1>
          <p>Ваш платёж был успешно обработан. Баланс будет пополнен в течение нескольких минут.</p>
          <p><a href="https://t.me/your_bot_username">Вернуться к боту</a></p>
        </body>
      </html>
    `);
  });

  // Маршрут для возврата при неудачной оплате (опционально)
  app.get("/fail", (req, res) => {
    res.status(200).send(`
      <html>
        <head><title>Ошибка оплаты</title></head>
        <body>
          <h1>Ошибка оплаты</h1>
          <p>Произошла ошибка при обработке вашего платежа. Пожалуйста, попробуйте снова.</p>
          <p><a href="https://t.me/your_bot_username">Вернуться к боту</a></p>
        </body>
      </html>
    `);
  });
}

module.exports = { setupRoutes };
