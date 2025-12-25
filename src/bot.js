const { Telegraf, Markup, session } = require("telegraf");
const config = require("./config");
const { initializeDatabase } = require("./db/connection");
const {
  handleStart,
  handleBalance,
  handleMyKey,
  handleHelp,
} = require("./handlers/commands");
const userMenu = require("./handlers/userMenu");
const adminCommands = require("./handlers/admin");
const keyService = require("./services/keyService");

// Инициализация Telegraf
const bot = new Telegraf(config.BOT_TOKEN);

// Использование сессий для хранения состояния пользователя
bot.use(session());

// Инициализация базы данных
async function initDatabase() {
  try {
    await initializeDatabase();
    console.log("Подключение к базе данных установлено");
  } catch (error) {
    console.error("Ошибка подключения к базе данных:", error);
    process.exit(1);
  }
}

// Импортируем главное меню из отдельного файла
const { buildMainKeyboard } = require("./keyboards/mainMenu");

// Асинхронная инициализация
async function initializeBot() {
  await initDatabase();

  // Обновляем даты истечения срока действия для старых ключей
  try {
    await keyService.updateMissingExpiryDates();
  } catch (error) {
    console.error(
      "Ошибка при обновлении дат истечения срока действия ключей:",
      error
    );
  }

  // Обработка команд
  bot.start((ctx) => {
    console.log(`Получена команда /start от пользователя ${ctx.from.id}`);
    return handleStart(ctx);
  });
  bot.command("balance", (ctx) => {
    console.log(`Получена команда /balance от пользователя ${ctx.from.id}`);
    return handleBalance(ctx);
  });
  bot.command("mykey", (ctx) => {
    console.log(`Получена команда /mykey от пользователя ${ctx.from.id}`);
    return handleMyKey(ctx);
  });
  bot.command("help", (ctx) => {
    console.log(`Получена команда /help от пользователя ${ctx.from.id}`);
    return handleHelp(ctx);
  });
  bot.command("available_keys", (ctx) => {
    console.log(
      `Получена команда /available_keys от пользователя ${ctx.from.id}`
    );
    return userMenu.handleAvailableKeysInfo(ctx);
  });

  // Админ-команды
  bot.command("admin", (ctx) => {
    console.log(`Получена админ-команда /admin от пользователя ${ctx.from.id}`);
    return adminCommands.handleAdminCommands(ctx);
  });
  bot.command("add_keys", (ctx) => {
    console.log(
      `Получена админ-команда /add_keys от пользователя ${ctx.from.id}`
    );
    return adminCommands.handleAdminCommands(ctx);
  });
  bot.command("keys_stats", (ctx) => {
    console.log(
      `Получена админ-команда /keys_stats от пользователя ${ctx.from.id}`
    );
    return adminCommands.handleAdminCommands(ctx);
  });
  bot.command("user", (ctx) => {
    console.log(`Получена админ-команда /user от пользователя ${ctx.from.id}`);
    return adminCommands.handleAdminCommands(ctx);
  });
  bot.command("add_balance", (ctx) => {
    console.log(
      `Получена админ-команда /add_balance от пользователя ${ctx.from.id}`
    );
    return adminCommands.handleAdminCommands(ctx);
  });
  bot.command("stats", (ctx) => {
    console.log(`Получена админ-команда /stats от пользователя ${ctx.from.id}`);
    return adminCommands.handleAdminCommands(ctx);
  });

  // Обработка callback-запросов (inline-кнопки)
  bot.action(/^amount_(\d+)$/, async (ctx) => {
    const amount = parseInt(ctx.match[1]);
    console.log(
      `Пользователь ${ctx.from.id} выбрал сумму ${amount} ₽ для пополнения`
    );

    const userRecord = await require("./services/userService").getUserById(
      ctx.from.id
    );

    try {
      // Создаем инвойс через Nicepay
      const nicepayService = require("./services/nicepayService");
      const invoiceResult = await nicepayService.createInvoice(
        userRecord,
        amount
      );

      const message = `
Для пополнения баланса на ${amount} ₽ перейдите по ссылке ниже и следуйте инструкциям:

${invoiceResult.paymentUrl}

После оплаты ваш баланс будет автоматически пополнен.
      `;

      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Оплатить", url: invoiceResult.paymentUrl }],
          ],
        },
      });
    } catch (error) {
      console.error(
        "Ошибка при создании платежа через Nicepay:",
        error.message || error
      );
      await ctx.reply(
        "Не удалось создать платёж через Nicepay. Попробуйте позже или обратитесь в поддержку."
      );
    }
  });

  bot.action("other_amount", async (ctx) => {
    console.log(`Пользователь ${ctx.from.id} выбрал ввод другой суммы`);
    await ctx.reply("Введите сумму для пополнения (в рублях):");
    ctx.session = { waiting_for_amount: true };
  });

  bot.action(/^check_payment_(.+)$/, async (ctx) => {
    // Удаленная обработка проверки платежа - теперь все обрабатывается автоматически через вебхук
    await ctx.reply(
      "Проверка статуса платежа... Платежи обрабатываются автоматически через вебхук."
    );
  });

  // Обработка сообщений главного меню
  bot.hears("💳 Пополнить баланс", (ctx) => {
    console.log(`Пользователь ${ctx.from.id} нажал кнопку "Пополнить баланс"`);
    return userMenu.handleUserMenu(ctx);
  });
  bot.hears("🛒 Купить VPN‑ключ", (ctx) => {
    console.log(`Пользователь ${ctx.from.id} нажал кнопку "Купить VPN‑ключ"`);
    return userMenu.handleUserMenu(ctx);
  });
  bot.hears("🔑 Мой ключ", (ctx) => {
    console.log(`Пользователь ${ctx.from.id} нажал кнопку "Мой ключ"`);
    return userMenu.handleUserMenu(ctx);
  });
  bot.hears("💼 Мой баланс / История", (ctx) => {
    console.log(
      `Пользователь ${ctx.from.id} нажал кнопку "Мой баланс / История"`
    );
    return userMenu.handleUserMenu(ctx);
  });
  bot.hears("ℹ️ Помощь / FAQ", (ctx) => {
    console.log(`Пользователь ${ctx.from.id} нажал кнопку "Помощь / FAQ"`);
    return userMenu.handleUserMenu(ctx);
  });

  // Обработка кнопки тестового ключа
  bot.hears("🆓 Тестовый VPN‑ключ на 3 дня", async (ctx) => {
    console.log(
      "BOT: trial button pressed by telegram user_id =",
      ctx.from && ctx.from.id
    );
    try {
      // Получаем пользователя из базы данных
      const userRecord = await require("./services/userService").getUserById(
        ctx.from.id
      );
      // Если пользователя нет, создаем его
      if (!userRecord) {
        await require("./services/userService").createUserOrGet(
          ctx.from.id,
          ctx.from.username
        );
        // Заново получаем пользователя, чтобы убедиться, что он создан
        const freshUser = await require("./services/userService").getUserById(
          ctx.from.id
        );
        console.log(
          "BOT: calling handleTrialKeyRequest for telegram user_id =",
          ctx.from && ctx.from.id
        );
        return userMenu.handleTrialKeyRequest(ctx, freshUser);
      }
      console.log(
        "BOT: calling handleTrialKeyRequest for telegram user_id =",
        ctx.from && ctx.from.id
      );
      return userMenu.handleTrialKeyRequest(ctx, userRecord);
    } catch (error) {
      console.error("Ошибка при обработке запроса тестового ключа:", error);
      ctx.reply("Произошла ошибка при обработке запроса. Попробуйте позже.");
    }
  });

  // Обработка текстовых сообщений (для ввода суммы и других операций)
  bot.on("text", (ctx) => {
    // Логируем только те текстовые сообщения, которые не являются командами меню
    if (
      ![
        "💳 Пополнить баланс",
        "🛒 Купить VPN‑ключ",
        "🔑 Мой ключ",
        "💼 Мой баланс / История",
        "ℹ️ Помощь / FAQ",
      ].includes(ctx.message.text)
    ) {
      console.log(
        `Пользователь ${ctx.from.id} отправил текстовое сообщение: ${ctx.message.text}`
      );
    }
    return userMenu.handleUserMenu(ctx);
  });

  // Обработка ошибок
  bot.catch((err, ctx) => {
    console.error(`Ошибка в боте у пользователя ${ctx.from.id}:`, err);
    try {
      ctx.reply("Произошла ошибка, попробуйте позже");
    } catch (replyErr) {
      console.error("Ошибка при отправке сообщения об ошибке:", replyErr);
    }
  });

  return bot;
}

// Запуск бота
async function startBot() {
  const initializedBot = await initializeBot();

  // Запуск в режиме polling
  initializedBot.launch();

  console.log("Бот запущен");

  // Запуск проверки истекших ключей
  startExpiredKeyCheck();

  // Остановка бота при завершении процесса
  process.once("SIGINT", () => initializedBot.stop("SIGINT"));
  process.once("SIGTERM", () => initializedBot.stop("SIGTERM"));
}

// Функция для проверки истекших ключей
async function startExpiredKeyCheck() {
  // Проверяем истекшие ключи каждые 24 часа
  setInterval(async () => {
    try {
      console.log("Проверка истекших ключей...");
      const expiredKeys =
        await require("./services/keyService").getExpiredKeys();

      // Также проверяем истекшие тестовые ключи
      const expiredTrialKeys =
        await require("./services/keyService").getExpiredTrialKeys();

      // Объединяем все истекшие ключи (обычные и тестовые)
      const allExpiredKeys = [...expiredKeys, ...expiredTrialKeys];

      for (const key of allExpiredKeys) {
        // Обновляем статус ключа на EXPIRED
        await require("./services/keyService").updateExpiredKeyStatus(key._id);

        // Отправляем уведомление пользователю
        try {
          await bot.telegram.sendMessage(
            key.user_id,
            `⏰ Уведомление: срок действия вашего VPN-ключа истек ${new Date(
              key.expires_at
            ).toLocaleDateString("ru-RU")}.
            \nДля продолжения использования VPN вы можете приобрести новый ключ в меню бота.`
          );
        } catch (notificationError) {
          console.error(
            "Ошибка при отправке уведомления пользователю:",
            notificationError
          );
        }
      }

      if (expiredKeys.length > 0) {
        console.log(
          `Обновлено статусов для ${expiredKeys.length} истекших ключей`
        );
      } else {
        console.log("Истекших ключей не найдено");
      }
    } catch (error) {
      console.error("Ошибка при проверке истекших ключей:", error);
    }
  }, 24 * 60 * 60 * 1000); // 24 часа в миллисекундах
}

module.exports = { bot, startBot, buildMainKeyboard };

// Автоматический запуск, если файл запускается напрямую
if (require.main === module) {
  startBot();
}
