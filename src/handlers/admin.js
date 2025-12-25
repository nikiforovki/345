const config = require("../config");
const userService = require("../services/userService");
const keyService = require("../services/keyService");
const orderService = require("../services/orderService");
const { Markup } = require("telegraf");

const adminCommands = {
  // Проверка прав администратора
  isAdmin(user_id) {
    return config.ADMIN_IDS.includes(user_id);
  },

  // Обработка всех админ-команд
  async handleAdminCommands(ctx) {
    try {
      const user = ctx.from;

      // Проверяем, является ли пользователь администратором
      if (!this.isAdmin(user.id)) {
        await ctx.reply("У вас нет прав администратора.");
        return;
      }

      const command = ctx.message.text.split(" ")[0].substring(1); // Убираем слеш из команды
      const args = ctx.message.text.split(" ").slice(1); // Аргументы команды

      switch (command) {
        case "admin":
          await this.handleAdminMenu(ctx);
          break;
        case "add_keys":
          await this.handleAddKeys(ctx, args);
          break;
        case "keys_stats":
          await this.handleKeysStats(ctx);
          break;
        case "user":
          await this.handleUserInfo(ctx, args);
          break;
        case "add_balance":
          await this.handleAddBalance(ctx, args);
          break;
        case "stats":
          await this.handleGeneralStats(ctx);
          break;
        default:
          await ctx.reply(
            "Неизвестная админ-команда. Доступные команды:\n/admin - админ-меню\n/add_keys - добавить ключи\n/keys_stats - статистика по ключам\n/user <user_id> - информация о пользователе\n/add_balance <user_id> <amount> - пополнить баланс\n/stats - общая статистика"
          );
      }
    } catch (error) {
      console.error("Ошибка при обработке админ-команды:", error);
      await ctx.reply("Произошла ошибка при выполнении команды");
    }
  },

  // Админ-меню
  async handleAdminMenu(ctx) {
    const adminMenu = Markup.keyboard([
      ["/keys_stats", "/stats"],
      ["/add_keys", "/user"],
      ["/add_balance"],
    ]).resize();

    const menuMessage = `
🔧 Админ-панель

Доступные команды:
• /keys_stats - Статистика по ключам
• /stats - Общая статистика
• /add_keys - Добавить ключи
• /user <user_id> - Информация о пользователе
• /add_balance <user_id> <amount> - Пополнить баланс пользователя
    `;

    await ctx.reply(menuMessage, adminMenu);
  },

  // Добавление ключей
  async handleAddKeys(ctx, args) {
    try {
      // Проверяем, есть ли текст или файл
      if (ctx.message.text && ctx.message.text.split(" ").length > 1) {
        // Ключи переданы в тексте команды
        const keysText = ctx.message.text.substring("/add_keys".length).trim();
        if (!keysText) {
          await ctx.reply("Пожалуйста, укажите ключи для добавления.");
          return;
        }

        const keys = keysText.split("\n").filter((key) => key.trim() !== "");
        const result = await keyService.addKeys(keys);

        await ctx.reply(
          `Добавлено: ${result.inserted} ключей. Пропущено (дубликаты): ${result.duplicates}.`
        );
      } else if (ctx.message.document) {
        // Ключи переданы в виде файла
        await ctx.reply("Загрузка ключей из файла...");

        // Получаем информацию о файле
        const file = await ctx.telegram.getFile(ctx.message.document.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`;

        // Загружаем и обрабатываем файл
        const axios = require("axios");
        const response = await axios.get(fileUrl);
        const keysText = response.data;
        const keys = keysText.split("\n").filter((key) => key.trim() !== "");

        const result = await keyService.addKeys(keys);

        await ctx.reply(
          `Добавлено: ${result.inserted} ключей. Пропущено (дубликаты): ${result.duplicates}.`
        );
      } else {
        await ctx.reply(
          "Пожалуйста, отправьте ключи текстом или файлом (.txt)."
        );
      }
    } catch (error) {
      console.error("Ошибка при добавлении ключей:", error);
      await ctx.reply("Произошла ошибка при добавлении ключей");
    }
  },

  // Статистика по ключам
  async handleKeysStats(ctx) {
    try {
      const stats = await keyService.getKeysStats();

      let statsMessage = "📊 Статистика по ключам:\n\n";

      if (stats.length > 0) {
        stats.forEach((typeStat) => {
          statsMessage += `📋 Тип: ${typeStat._id}\n`;
          statsMessage += `• Доступно: ${typeStat.available}\n`;
          statsMessage += `• Продано: ${typeStat.sold}\n\n`;
        });
      } else {
        statsMessage += "Ключи отсутствуют в системе.";
      }

      await ctx.reply(statsMessage);
    } catch (error) {
      console.error("Ошибка при получении статистики по ключам:", error);
      await ctx.reply("Произошла ошибка при получении статистики по ключам");
    }
  },

  // Информация о пользователе
  async handleUserInfo(ctx, args) {
    try {
      if (args.length === 0) {
        await ctx.reply("Пожалуйста, укажите user_id: /user <user_id>");
        return;
      }

      const userId = parseInt(args[0]);
      if (isNaN(userId)) {
        await ctx.reply("Некорректный user_id. Укажите числовое значение.");
        return;
      }

      const userInfo = await userService.getAdminUserInfo(userId);

      if (!userInfo) {
        await ctx.reply("Пользователь не найден.");
        return;
      }

      const userInfoMessage = `
📋 Информация о пользователе:

🆔 User ID: ${userInfo.user_id}
👤 Username: ${userInfo.username || "не указан"}
💰 Баланс: ${userInfo.balance} ₽
🔑 Активный ключ: ${userInfo.hasActiveKey ? "Да" : "Нет"}
${
  userInfo.hasActiveKey
    ? `   - ID: ${userInfo.activeKeyId}\n   - Тип: ${userInfo.activeKeyType}\n   - Значение: ${userInfo.activeKeyValuePreview}`
    : ""
}
📊 Количество покупок: ${userInfo.purchaseCount}
      `;

      await ctx.reply(userInfoMessage);
    } catch (error) {
      console.error("Ошибка при получении информации о пользователе:", error);
      await ctx.reply(
        "Произошла ошибка при получении информации о пользователе"
      );
    }
  },

  // Пополнение баланса пользователя
  async handleAddBalance(ctx, args) {
    try {
      if (args.length !== 2) {
        await ctx.reply(
          "Пожалуйста, укажите user_id и сумму: /add_balance <user_id> <amount>"
        );
        return;
      }

      const userId = parseInt(args[0]);
      const amount = parseFloat(args[1]);

      if (isNaN(userId) || isNaN(amount)) {
        await ctx.reply(
          "Некорректные параметры. Укажите числовые значения: /add_balance <user_id> <amount>"
        );
        return;
      }

      const success = await userService.adminAddBalance(userId, amount);

      if (success) {
        await ctx.reply(
          `Баланс пользователя ${userId} успешно пополнен на ${amount} ₽.`
        );

        // Отправляем уведомление пользователю
        try {
          await ctx.telegram.sendMessage(
            userId,
            `Администратор пополнил ваш баланс на ${amount} ₽.\nТекущий баланс: ${await userService.getUserById(
              userId
            ).balance} ₽`
          );
        } catch (notificationError) {
          console.error(
            "Ошибка при отправке уведомления пользователю:",
            notificationError
          );
        }
      } else {
        await ctx.reply(
          "Не удалось пополнить баланс пользователя. Пользователь может не существовать."
        );
      }
    } catch (error) {
      console.error("Ошибка при пополнении баланса пользователя:", error);
      await ctx.reply("Произошла ошибка при пополнении баланса пользователя");
    }
  },

  // Общая статистика
  async handleGeneralStats(ctx) {
    try {
      // Получаем статистику пользователей
      const totalUsers = await userService.getTotalUsersCount();

      // Получаем статистику по заказам
      const ordersStats = await orderService.getOrdersStats();
      const ordersStatsByType = await orderService.getOrdersStatsByType();

      let statsMessage = "📈 Общая статистика:\n\n";
      statsMessage += `👥 Всего пользователей: ${totalUsers}\n`;
      statsMessage += `📦 Всего покупок: ${ordersStats.totalOrders}\n`;
      statsMessage += `💰 Суммарная выручка: ${ordersStats.totalRevenue} ₽\n\n`;

      if (ordersStatsByType.length > 0) {
        statsMessage += "Продажи по типам ключей:\n";
        ordersStatsByType.forEach((type) => {
          statsMessage += `• ${type._id}: ${type.count} шт. на сумму ${type.revenue} ₽\n`;
        });
      } else {
        statsMessage += "Пока нет продаж.";
      }

      await ctx.reply(statsMessage);
    } catch (error) {
      console.error("Ошибка при получении общей статистики:", error);
      await ctx.reply("Произошла ошибка при получении общей статистики");
    }
  },
};

module.exports = adminCommands;
