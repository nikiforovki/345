const { Markup } = require("telegraf");

function buildMainKeyboard(user) {
  const rows = [
    ["💳 Пополнить баланс", "🛒 Купить VPN‑ключ"],
    ["🔑 Мой ключ", "💼 Мой баланс / История"],
    ["📦 Подключение VPN-ключа"],
    ["🆓 Тестовый VPN‑ключ на 3 дня"],
    ["ℹ️ Помощь / FAQ"],
  ];

  return Markup.keyboard(rows).resize();
}

module.exports = { buildMainKeyboard };
