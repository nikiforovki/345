# Интеграция с платежной системой Nicepay

## Переменные окружения

Для работы с Nicepay необходимо заполнить следующие переменные в файле `.env`:

```env
# Настройки Nicepay
NICEPAY_BASE_URL=ваш_base_url_здесь
NICEPAY_PUBLIC_KEY=ваш_public_key_здесь
NICEPAY_SECRET_KEY=ваш_secret_key_здесь
NICEPAY_MERCHANT_ID=ваш_merchant_id_здесь

NICEPAY_CURRENCY=RUB
NICEPAY_MIN_AMOUNT=50
NICEPAY_MAX_AMOUNT=10000

# URL'ы
NICEPAY_WEBHOOK_PATH=/nicepay/callback
NICEPAY_SUCCESS_URL=https://ваш_домен/payment/success
NICEPAY_FAIL_URL=https://ваш_домен/payment/fail
```

## Настройка вебхука

В личном кабинете Nicepay необходимо указать URL для обработки вебхуков:

```
https://ваш_домен/nicepay/callback
```

## Тестирование

1. Используйте sandbox-окружение Nicepay для тестирования
2. Проверьте создание платежа на тестовую сумму
3. Убедитесь, что вебхук от Nicepay корректно обрабатывается и баланс пользователя увеличивается
4. Проверьте валидацию суммы платежа (должна быть в пределах от NICEPAY_MIN_AMOUNT до NICEPAY_MAX_AMOUNT)
