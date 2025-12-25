const { Markup } = require("telegraf");
const config = require("../config");
const userService = require("../services/userService");
const keyService = require("../services/keyService");
const orderService = require("../services/orderService");
const { buildMainKeyboard } = require("../keyboards/mainMenu");

const userMenu = {
  // Обработка нажатий на кнопки главного меню
  async handleUserMenu(ctx) {
    try {
      const user = ctx.from;
      console.log(
        `Получено сообщение от пользователя ${user.id} (@${
          user.username || "неизвестно"
        })`
      );

      const userRecord = await userService.getUserById(user.id);

      if (!userRecord) {
        console.log(`Пользователь ${user.id} не найден в базе данных`);
        await ctx.reply(
          "Вы не зарегистрированы в системе. Используйте /start для регистрации."
        );
        return;
      }

      const messageText = ctx.message?.text;
      console.log(
        `Пользователь ${user.id} выбрал действие: ${
          messageText || "неизвестное сообщение"
        }`
      );

      if (messageText === "💳 Пополнить баланс") {
        await userMenu.handleBalanceReplenishment(ctx, userRecord);
      } else if (messageText === "🛒 Купить VPN‑ключ") {
        await userMenu.handleKeyPurchase(ctx, userRecord);
      } else if (messageText === "🔑 Мой ключ") {
        await userMenu.handleShowKey(ctx, userRecord);
      } else if (messageText === "💼 Мой баланс / История") {
        await userMenu.handleBalanceAndHistory(ctx, userRecord);
      } else if (messageText === "ℹ️ Помощь / FAQ") {
        await userMenu.handleHelp(ctx);
      } else if (messageText === "📦 Подключение VPN-ключа") {
        await userMenu.handleAvailableKeysInfo(ctx);
      } else if (messageText === "🆓 Тестовый VPN‑ключ на 3 дня") {
        await userMenu.handleTrialKeyRequest(ctx, userRecord);
      } else if (ctx.session?.waiting_for_amount) {
        // Обработка ввода суммы для пополнения
        await userMenu.handleAmountInput(ctx, userRecord);
      } else if (ctx.session?.waiting_for_manual_payment_check) {
        // Обработка проверки статуса платежа
        await userMenu.handleManualPaymentCheck(ctx, userRecord);
      } else {
        // Если сообщение не соответствует ни одной кнопке
        await ctx.reply(
          "Пожалуйста, воспользуйтесь кнопками в меню.",
          buildMainKeyboard(userRecord)
        );
      }
    } catch (error) {
      console.error("Ошибка при обработке пользовательского меню:", error);
      await ctx.reply("Произошла ошибка, попробуйте позже");
    }
  },

  // Обработка пополнения баланса
  async handleBalanceReplenishment(ctx, userRecord) {
    const amountButtons = config.DEFAULT_PAYMENT_OPTIONS.map((amount) => [
      Markup.button.callback(`${amount} ₽`, `amount_${amount}`),
    ]);

    amountButtons.push([
      Markup.button.callback("Другая сумма", "other_amount"),
    ]);

    const paymentMenu = Markup.inlineKeyboard(amountButtons);

    await ctx.reply(
      `💳 Выберите сумму для пополнения баланса или введите свою сумму (от ${config.nicepay.minAmount} до ${config.nicepay.maxAmount} ₽):`,
      paymentMenu
    );
  },

  // Обработка ввода суммы для пополнения
  async handleAmountInput(ctx, userRecord) {
    const amountText = ctx.message?.text;
    console.log(
      `Пользователь ${userRecord.user_id} ввел сумму для пополнения: ${amountText}`
    );

    if (!amountText) {
      console.log(`Пользователь ${userRecord.user_id} не ввел сумму`);
      await ctx.reply("Пожалуйста, введите сумму числом.");
      return;
    }

    const amount = parseFloat(amountText.replace(/,/g, "."));

    if (
      isNaN(amount) ||
      amount < config.nicepay.minAmount ||
      amount > config.nicepay.maxAmount
    ) {
      console.log(
        `Пользователь ${userRecord.user_id} ввел некорректную сумму: ${amountText}`
      );
      await ctx.reply(
        `Пожалуйста, введите корректную сумму от ${config.nicepay.minAmount} до ${config.nicepay.maxAmount} ₽`
      );
      return;
    }

    try {
      console.log(
        `Создание платежа через Nicepay для пользователя ${userRecord.user_id} на сумму ${amount} ₽`
      );

      // Создаем инвойс через Nicepay
      const nicepayService = require("../services/nicepayService");
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

      // Сброс сессии
      ctx.session = {};
    } catch (error) {
      console.error(
        "Ошибка при создании платежа через Nicepay:",
        error.message || error
      );
      await ctx.reply(
        "Не удалось создать платёж через Nicepay. Попробуйте позже или обратитесь в поддержку."
      );
    }
  },

  // Обработка покупки VPN-ключа
  async handleKeyPurchase(ctx, userRecord) {
    try {
      console.log(
        `Пользователь ${userRecord.user_id} пытается купить VPN-ключ`
      );

      // Проверяем, есть ли у пользователя уже активный ключ
      const hasActiveKey = await keyService.hasActiveKey(userRecord.user_id);

      if (hasActiveKey) {
        console.log(
          `Пользователь ${userRecord.user_id} уже имеет активный ключ`
        );
        await ctx.reply(
          "У вас уже есть активный ключ. Сначала используйте его, прежде чем покупать новый.",
          Markup.keyboard([
            ["🔑 Мой ключ"],
            ["💼 Мой баланс / История", "ℹ️ Помощь / FAQ"],
          ]).resize()
        );
        return;
      }

      // Проверяем баланс
      if (userRecord.balance < config.KEY_PRICE) {
        console.log(
          `Пользователь ${userRecord.user_id} не имеет достаточного баланса. Баланс: ${userRecord.balance}, цена ключа: ${config.KEY_PRICE}`
        );
        await ctx.reply(
          `Недостаточно средств. Ваш баланс: ${userRecord.balance} ₽. Цена ключа: ${config.KEY_PRICE} ₽.`,
          Markup.keyboard([
            ["💳 Пополнить баланс"],
            ["💼 Мой баланс / История", "ℹ️ Помощь / FAQ"],
          ]).resize()
        );
        return;
      }

      // Проверяем наличие доступных ключей до начала транзакции
      const availableCount = await keyService.getAvailableKeysCount();
      console.log(
        `Доступно ${availableCount} ключей до начала покупки для пользователя ${userRecord.user_id}`
      );

      if (availableCount <= 0) {
        await ctx.reply(
          "В настоящее время все ключи закончились. Администратор скоро добавит новые ключи. Попробуйте позже."
        );
        return;
      }

      // Атомарная транзакция резервации ключа и списания средств
      const session = require("../db/connection").getClient().startSession();
      console.log(
        `Начинаем транзакцию покупки ключа для пользователя ${userRecord.user_id}`
      );

      try {
        let reservedKey = null;
        let order = null;

        await session.withTransaction(async () => {
          // Проверяем баланс внутри транзакции
          const freshUser = await userService.getUserById(userRecord.user_id);
          if (freshUser.balance < config.KEY_PRICE) {
            console.log(
              `Недостаточно средств для покупки ключа. Баланс: ${freshUser.balance}, цена ключа: ${config.KEY_PRICE}`
            );
            throw new Error("Недостаточно средств для покупки");
          }

          console.log(
            `Баланс пользователя ${userRecord.user_id} внутри транзакции: ${freshUser.balance} ₽`
          );

          // Резервируем ключ внутри транзакции
          reservedKey = await keyService.findAndReserveKeyForUser(
            userRecord.user_id
          );

          if (!reservedKey) {
            console.log(
              `Не удалось зарезервировать ключ для пользователя ${userRecord.user_id} внутри транзакции`
            );
            throw new Error("Нет доступных ключей для покупки");
          }

          console.log(
            `Ключ ${reservedKey._id} успешно зарезервирован для пользователя ${userRecord.user_id} внутри транзакции`
          );

          // Проверяем баланс пользователя перед списанием
          const balanceBeforeDeduction = freshUser.balance;
          console.log(
            `Баланс пользователя ${userRecord.user_id} перед списанием: ${balanceBeforeDeduction} ₽`
          );

          // Списываем средства с баланса с использованием сессии для транзакции
          const balanceUpdateResult = await userService.updateUserBalance(
            userRecord.user_id,
            -config.KEY_PRICE,
            session
          );

          if (!balanceUpdateResult) {
            console.log(
              `Не удалось обновить баланс пользователя ${userRecord.user_id} в транзакции`
            );
            throw new Error("Не удалось обновить баланс пользователя");
          }

          console.log(
            `Списано ${config.KEY_PRICE} ₽ с баланса пользователя ${userRecord.user_id} в транзакции`
          );

          // Проверяем баланс пользователя после списания
          const userAfterDeduction = await userService.getUserById(
            userRecord.user_id
          );
          console.log(
            `Баланс пользователя ${userRecord.user_id} после списания: ${userAfterDeduction.balance} ₽`
          );

          // Создаем запись о заказе
          order = await orderService.createOrder(
            userRecord.user_id,
            reservedKey._id,
            config.KEY_PRICE,
            session
          );

          console.log(
            `Создан заказ ${order._id} для пользователя ${userRecord.user_id}`
          );
        });

        // Отправляем ключ пользователю
        const keyMessage = `
✅ Поздравляем с покупкой VPN-ключа!

🔑 Ваш новый VPN-ключ:
\`\`\`
${reservedKey.key_value}
\`\`\`

📋 Информация:
• Тип: ${reservedKey.type}
• Дата покупки: ${new Date(reservedKey.sold_at).toLocaleDateString("ru-RU")}
• Цена: ${config.KEY_PRICE} ₽

⚠️ Важно: Не делитесь ключом с другими пользователями!
        `;

        await ctx.reply(keyMessage, { parse_mode: "Markdown" });
        console.log(
          `Ключ успешно отправлен пользователю ${userRecord.user_id}`
        );
      } catch (transactionError) {
        console.error("Ошибка транзакции при покупке ключа:", transactionError);
        let errorMessage = "Произошла ошибка при покупке ключа. ";

        if (transactionError.message.includes("Недостаточно средств")) {
          errorMessage += "Недостаточно средств на балансе.";
        } else if (transactionError.message.includes("нет доступных ключей")) {
          errorMessage +=
            "К сожалению, все ключи уже были куплены другим пользователем. Попробуйте позже.";
        } else {
          errorMessage += "Попробуйте позже.";
        }

        await ctx.reply(errorMessage);
      } finally {
        await session.endSession();
        console.log(
          `Транзакция для пользователя ${userRecord.user_id} завершена`
        );
      }
    } catch (error) {
      console.error("Ошибка при покупке VPN-ключа:", error);
      await ctx.reply("Произошла ошибка при покупке ключа, попробуйте позже");
    }
  },

  // Обработка показа ключа
  async handleShowKey(ctx, userRecord) {
    console.log(`Пользователь ${userRecord.user_id} запрашивает свой VPN-ключ`);
    const userKey = await keyService.getUserActiveKey(userRecord.user_id);

    if (userKey) {
      console.log(
        `Найден ключ для пользователя ${userRecord.user_id}: ${userKey._id}`
      );
      const keyInfo = `
🔑 Ваш VPN-ключ:
\`\`\`
${userKey.key_value || "Неизвестен"}
\`\`\`

📋 Информация:
• Тип: ${userKey.type || "Неизвестен"}
• Дата покупки: ${
        userKey.sold_at
          ? new Date(userKey.sold_at).toLocaleDateString("ru-RU")
          : "Неизвестна"
      }
• Срок действия: ${
        userKey.expires_at
          ? new Date(userKey.expires_at).toLocaleDateString("ru-RU")
          : "Неизвестен"
      }
• Важно: Не делитесь ключом с другими пользователями!
      `;

      await ctx.reply(keyInfo, { parse_mode: "Markdown" });
    } else {
      console.log(`У пользователя ${userRecord.user_id} нет активного ключа`);
      await ctx.reply(
        "❌ У вас пока нет активного ключа или срок действия вашего ключа истек.\n\nХотите купить VPN-ключ?",
        Markup.keyboard([
          ["🛒 Купить VPN‑ключ"],
          ["💳 Пополнить баланс", "💼 Мой баланс / История"],
          ["ℹ️ Помощь / FAQ"],
        ]).resize()
      );
    }
  },

  // Обработка баланса истории
  async handleBalanceAndHistory(ctx, userRecord) {
    try {
      console.log(
        `Пользователь ${userRecord.user_id} запрашивает баланс и историю`
      );
      const stats = await userService.getUserStats(userRecord.user_id);
      const history = await userService.getUserPurchaseHistory(
        userRecord.user_id
      );
      console.log(
        `Получена статистика для пользователя ${userRecord.user_id}: покупок ${stats.totalPurchases}, потрачено ${stats.totalSpent} ₽`
      );

      let historyText = "Последние покупки:\n";
      if (history.length > 0) {
        console.log(
          `Найдено ${history.length} записей истории для пользователя ${userRecord.user_id}`
        );
        history.forEach((order, index) => {
          historyText += `• ${new Date(order.created_at).toLocaleDateString(
            "ru-RU"
          )} - ${order.amount} ₽ (${order.key_type})\n`;
        });
      } else {
        console.log(
          `Нет истории покупок для пользователя ${userRecord.user_id}`
        );
        historyText += "Покупок пока нет\n";
      }

      const balanceMessage = `
 💼 Ваш баланс: ${userRecord.balance} ₽

 📊 Статистика:
 • Количество покупок: ${stats.totalPurchases}
 • Всего потрачено: ${stats.totalSpent} ₽

 ${historyText}
      `;

      await ctx.reply(balanceMessage, buildMainKeyboard(userRecord));
    } catch (error) {
      console.error("Ошибка при получении истории:", error);
      await ctx.reply(
        "Произошла ошибка при получении истории, попробуйте позже"
      );
    }
  },

  // Обработка справки
  async handleHelp(ctx) {
    const helpMessage = `
ℹ️ Помощь по боту:

💳 *Пополнить баланс* - Пополнение баланса для покупки VPN-ключей
🛒 *Купить VPN‑ключ* - Приобрести VPN-ключ за баланс
🔑 *Мой ключ* - Посмотреть текущий VPN-ключ
💼 *Мой баланс / История* - Проверить баланс и историю покупок
ℹ️ *Помощь / FAQ* - Эта справка

🔹 *Как пополнить баланс?*
1. Нажмите "💳 Пополнить баланс"
2. Выберите сумму или введите свою
3. Перейдите по ссылке для оплаты
4. После оплаты баланс пополнится автоматически

🔹 *Как купить VPN-ключ?*
1. Убедитесь, что у вас достаточно средств
2. Нажмите "🛒 Купить VPN‑ключ"
3. Система автоматически выдаст вам доступный ключ

🔹 *Подключение VPN‑ключа*
1. Скачайте приложение v2rayTun для iPhone или Android.
2. Скопируйте ключ в боте в разделе «🔑 Мой ключ».
3. В приложении нажмите кнопку «+» и выберите «Импорт из буфера обмена».
4. Нажмите «Подключить» и наслаждайтесь безопасным интернетом!

🔹 *Проблемы с оплатой или ключом?*
Обратитесь в поддержку: @Nzkmsk

Цена VPN-ключа: ${config.KEY_PRICE} ₽
    `;

    await ctx.reply(helpMessage, { parse_mode: "Markdown" });
  },

  // Обработка ручной проверки платежа
  async handleManualPaymentCheck(ctx, userRecord) {
    // В реальной реализации это будет обрабатываться через inline-кнопки
    // Этот метод оставлен для совместимости
  },

  // Обработка запроса информации о доступных ключах
  async handleAvailableKeysInfo(ctx) {
    try {
      console.log(
        `Пользователь ${ctx.from.id} запросил информацию о доступных ключах`
      );
      const availableCount = await keyService.getAvailableKeysCount();

      let message = `🔹 *Подключение VPN‑ключа*
1. Скачайте приложение v2rayTun для iPhone или Android.
2. Скопируйте ключ в боте в разделе «🔑 Мой ключ».
3. В приложении нажмите кнопку «+» и выберите «Импорт из буфера обмена».
4. Нажмите «Подключить» и наслаждайтесь безопасным интернетом!
`;

      if (availableCount > 0) {
        message += `\n\n📦 Сейчас доступно ключей: ${availableCount}\n\nВы можете купить ключ через меню: «🛒 Купить VPN‑ключ».`;
      } else {
        message += `\n\n📦 Сейчас нет доступных ключей для покупки.\n\nПопробуйте позже — администратор скоро добавит новые ключи.`;
      }

      await ctx.reply(message);
    } catch (error) {
      console.error(
        "Ошибка при получении информации о доступных ключах:",
        error
      );
      await ctx.reply(
        "Произошла ошибка при получении информации о доступных ключах, попробуйте позже."
      );
    }
  },

  // Обработка запроса на тестовый ключ
  async handleTrialKeyRequest(ctx, userRecord) {
    try {
      console.log(
        `TRIAL_HANDLER: user_id =`,
        userRecord.user_id,
        "hasTrial =",
        userRecord.hasTrial
      );

      // Проверка 1: уже ли пользователь получил тестовый ключ
      const hasUserTrial = await keyService.hasUserTrialKey(userRecord.user_id);
      if (hasUserTrial || userRecord.hasTrial) {
        console.log(
          "TRIAL_HANDLER: user",
          userRecord.user_id,
          "already has trial, not issuing new one"
        );
        await ctx.reply(
          "У вас уже есть или был выдан тестовый ключ.\n\nПолучить тестовый ключ можно только один раз.",
          buildMainKeyboard(userRecord)
        );
        return;
      }

      // Проверка 2: покупал ли пользователь платные ключи
      const hasUserPaidKeys = await keyService.hasUserPaidKeys(
        userRecord.user_id
      );
      if (hasUserPaidKeys) {
        console.log(
          "TRIAL_HANDLER: user",
          userRecord.user_id,
          "has purchased paid keys, not issuing trial"
        );
        await ctx.reply(
          "Тестовый ключ доступен только новым пользователям.\n\nУ вас уже есть оплаченные ключи, поэтому тестовый ключ недоступен.",
          buildMainKeyboard(userRecord)
        );
        return;
      }

      console.log(
        "TRIAL_HANDLER: calling findAndReserveTrialKeyForUser for user_id =",
        userRecord.user_id
      );

      // Атомарно берем один свободный тестовый ключ
      const trialKey = await keyService.findAndReserveTrialKeyForUser(
        userRecord.user_id
      );

      console.log("TRIAL_HANDLER: trialKey result =", trialKey);

      if (!trialKey) {
        console.log(
          "TRIAL_HANDLER: sending 'no trial keys available' to user",
          userRecord.user_id
        );
        await ctx.reply(
          "Извините, сейчас нет доступных тестовых ключей. Попробуйте позже или купите полный ключ.",
          buildMainKeyboard(userRecord)
        );
        return;
      }

      // Обновляем флаг получения тестового ключа у пользователя
      const updateResult = await userService.updateUserHasTrial(
        userRecord.user_id,
        true
      );
      if (!updateResult) {
        console.error(
          `Не удалось обновить флаг hasTrial для пользователя ${userRecord.user_id}`
        );
        // Возвращаем ключ в свободное состояние, если не удалось обновить пользователя
        await keyService.returnKeyToAvailable(trialKey._id);
        await ctx.reply(
          "Произошла ошибка при выдаче тестового ключа. Попробуйте позже.",
          buildMainKeyboard(userRecord)
        );
        return;
      }

      // Форматируем дату окончания действия ключа
      const endDate = new Date(trialKey.expires_at);
      const endDateFormatted = `${endDate
        .getDate()
        .toString()
        .padStart(2, "0")}.${(endDate.getMonth() + 1)
        .toString()
        .padStart(2, "0")}.${endDate.getFullYear()} ${endDate
        .getHours()
        .toString()
        .padStart(2, "0")}:${endDate.getMinutes().toString().padStart(2, "0")}`;

      // Отправляем ключ пользователю
      const keyMessage = `
Ваш тестовый VPN‑ключ на 3 дня:

\`\`\`
${trialKey.key_value}
\`\`\`

Срок действия: до ${endDateFormatted}.
      `;

      console.log(
        "TRIAL_HANDLER: sending TRIAL KEY to user",
        userRecord.user_id,
        "key_id =",
        trialKey && trialKey._id
      );

      await ctx.reply(keyMessage, { parse_mode: "Markdown" });

      // Отправляем дополнительное уведомление
      await ctx.reply(
        "Вам выдан тестовый ключ на 3 дня.\n\n" +
          "Получить тестовый ключ можно только один раз.\n\n" +
          "По окончании срока действия вы можете приобрести полноценный VPN‑ключ в меню бота."
      );

      // Отправляем обновленное главное меню (без кнопки теста)
      await ctx.reply("Выберите действие:", buildMainKeyboard(userRecord));
    } catch (error) {
      console.error("Ошибка при обработке запроса на тестовый ключ:", error);
      await ctx.reply(
        "Произошла ошибка при выдаче тестового ключа, попробуйте позже"
      );
    }
  },

  // Обработка нажатий на кнопки главного меню (дублирующая функция - удалить при необходимости)
  // async handleUserMenu(ctx) {
  //   try {
  //     const user = ctx.from;
  //     console.log(
  //       `Получено сообщение от пользователя ${user.id} (@${
  //         user.username || "неизвестно"
  //       })`
  //     );

  //     const userRecord = await userService.getUserById(user.id);

  //     if (!userRecord) {
  //       console.log(`Пользователь ${user.id} не найден в базе данных`);
  //       await ctx.reply(
  //         "Вы не зарегистрированы в системе. Используйте /start для регистрации."
  //       );
  //       return;
  //     }

  //     const messageText = ctx.message?.text;
  //     console.log(
  //       `Пользователь ${user.id} выбрал действие: ${
  //         messageText || "неизвестное сообщение"
  //       }`
  //     );

  //     if (messageText === "💳 Пополнить баланс") {
  //       await userMenu.handleBalanceReplenishment(ctx, userRecord);
  //     } else if (messageText === "🛒 Купить VPN‑ключ") {
  //       await userMenu.handleKeyPurchase(ctx, userRecord);
  //     } else if (messageText === "🔑 Мой ключ") {
  //       await userMenu.handleShowKey(ctx, userRecord);
  //     } else if (messageText === "💼 Мой баланс / История") {
  //       await userMenu.handleBalanceAndHistory(ctx, userRecord);
  //     } else if (messageText === "ℹ️ Помощь / FAQ") {
  //       await userMenu.handleHelp(ctx);
  //     } else if (messageText === "📦 Подключение VPN-ключа") {
  //       await userMenu.handleAvailableKeysInfo(ctx);
  //     } else if (messageText === "🆓 Тестовый VPN‑ключ на 3 дня") {
  //       await userMenu.handleTrialKeyRequest(ctx, userRecord);
  //     } else if (ctx.session?.waiting_for_amount) {
  //       // Обработка ввода суммы для пополнения
  //       await userMenu.handleAmountInput(ctx, userRecord);
  //     } else if (ctx.session?.waiting_for_manual_payment_check) {
  //       // Обработка проверки статуса платежа
  //       await userMenu.handleManualPaymentCheck(ctx, userRecord);
  //     } else {
  //       // Если сообщение не соответствует ни одной кнопке
  //       await ctx.reply(
  //         "Пожалуйста, воспользуйтесь кнопками в меню.",
  //         buildMainKeyboard(userRecord)
  //       );
  //     }
  //   } catch (error) {
  //     console.error("Ошибка при обработке пользовательского меню:", error);
  //     await ctx.reply("Произошла ошибка, попробуйте позже");
  //   }
  // },
};
// Добавлена недостающая закрывающая фигурная скобка

module.exports = userMenu;
