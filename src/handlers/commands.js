const { Markup } = require("telegraf");
const config = require("../config");
const userService = require("../services/userService");
const keyService = require("../services/keyService");

// Импортируем главное меню из отдельного файла
const { buildMainKeyboard } = require("../keyboards/mainMenu");

const commands = {
  // Обработка команды /start
  async handleStart(ctx) {
    try {
      const user = ctx.from;
      const userRecord = await userService.createUserOrGet(
        user.id,
        user.username
      );

      const welcomeMessage = `
Добро пожаловать в VPN-магазин! 🛡️

Ваш баланс: ${userRecord.balance} ₽

Выберите действие в меню ниже:
      `;

      await ctx.reply(welcomeMessage, buildMainKeyboard(userRecord));
    } catch (error) {
      console.error("Ошибка при обработке команды /start:", error);
      await ctx.reply("Произошла ошибка, попробуйте позже");
    }
  },

  // Обработка команды /balance
  async handleBalance(ctx) {
    try {
      const user = ctx.from;
      const userRecord = await userService.getUserById(user.id);

      if (!userRecord) {
        await ctx.reply(
          "Вы не зарегистрированы в системе. Используйте /start для регистрации."
        );
        return;
      }

      const stats = await userService.getUserStats(user.id);

      const balanceMessage = `
💼 Ваш баланс: ${userRecord.balance} ₽

📊 Статистика:
• Количество покупок: ${stats.totalPurchases}
• Всего потрачено: ${stats.totalSpent} ₽
      `;

      await ctx.reply(balanceMessage, buildMainKeyboard(userRecord));
    } catch (error) {
      console.error("Ошибка при обработке команды /balance:", error);
      await ctx.reply(
        "Произошла ошибка при получении баланса, попробуйте позже"
      );
    }
  },

  // Обработка команды /mykey
  async handleMyKey(ctx) {
    try {
      const user = ctx.from;
      const userRecord = await userService.getUserById(user.id);

      if (!userRecord) {
        await ctx.reply(
          "Вы не зарегистрированы в системе. Используйте /start для регистрации."
        );
        return;
      }

      const userKey = await keyService.getUserActiveKey(user.id);

      if (userKey) {
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
        const noKeyMessage = `
❌ У вас пока нет активного ключа или срок действия вашего ключа истек.

Хотите купить VPN-ключ?
        `;

        await ctx.reply(
          noKeyMessage,
          Markup.keyboard([
            ["🛒 Купить VPN‑ключ"],
            ["💳 Пополнить баланс", "💼 Мой баланс / История"],
            ["ℹ️ Помощь / FAQ"],
          ]).resize()
        );
      }
    } catch (error) {
      console.error("Ошибка при обработке команды /mykey:", error);
      await ctx.reply("Произошла ошибка при получении ключа, попробуйте позже");
    }
  },

  // Обработка команды /help
  async handleHelp(ctx) {
    try {
      const helpMessage = `
ℹ️ Помощь по боту:

💳 *Пополнить баланс* - Пополнение баланса для покупки VPN-ключей
🛒 *Купить VPN‑ключ* - Приобрести VPN-ключ за баланс
🔑 *Мой ключ* - Посмотреть текущий VPN-ключ
💼 *Мой баланс / История* - Проверить баланс историю покупок
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

🔹 *Проблемы с оплатой или ключом?*
Обратитесь в поддержку: @your_support_username

Цена VPN-ключа: ${config.KEY_PRICE} ₽
      `;

      await ctx.reply(helpMessage, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Ошибка при обработке команды /help:", error);
      await ctx.reply(
        "Произошла ошибка при получении справки, попробуйте позже"
      );
    }
  },
};

module.exports = commands;
