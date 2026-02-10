# Диагностика проблем с отправкой email

## Важно: Email отправляется только после успешной оплаты

Email отправляется автоматически **только после успешной оплаты** через Stripe webhook. Если вы просто создали бронирование, но не оплатили его, email не будет отправлен.

## Шаги для диагностики

### 1. Проверьте, была ли успешная оплата

Проверьте статус бронирования в базе данных или через API:
```bash
# Если знаете bookingId
curl http://localhost:3000/api/bookings/YOUR_BOOKING_ID
```

Статус должен быть `paid`, а не `pending`.

### 2. Проверьте логи сервера

После успешной оплаты в логах сервера должны появиться сообщения:
```
[Webhook] Received event: checkout.session.completed
[Webhook] Processing checkout.session.completed for booking: xxx
[Webhook] Booking xxx marked as paid. Sending notifications...
[Email] Attempting to send confirmation to your@email.com
[Email] Successfully sent confirmation to your@email.com. MessageId: ...
```

Если этих сообщений нет, значит webhook не был вызван.

### 3. Проверьте, запущен ли Stripe CLI

Для локального тестирования должен быть запущен:
```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

Если Stripe CLI не запущен, webhook не будет доставлен на ваш локальный сервер.

### 4. Проверьте настройки SMTP в `.env`

Убедитесь, что в `.env` заполнены все необходимые поля:
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_username
SMTP_PASS=your_password
SMTP_FROM=bookings@handyman.com
```

Если какое-то поле не заполнено, в логах появится ошибка:
```
SMTP credentials are not configured. Missing: SMTP_HOST, SMTP_USER
```

### 5. Проверьте ошибки в логах

Если при отправке email возникает ошибка, она будет в логах:
```
[Webhook] Failed to finalize booking xxx: email: SMTP connection error...
```

## Частые проблемы

### Проблема: Webhook не вызывается

**Причины:**
- Stripe CLI не запущен
- `STRIPE_WEBHOOK_SECRET` не настроен или неверный
- Сервер не доступен на `localhost:3000`

**Решение:**
1. Запустите `stripe listen --forward-to localhost:3000/webhooks/stripe`
2. Убедитесь, что `STRIPE_WEBHOOK_SECRET` в `.env` совпадает с секретом из вывода команды
3. Перезапустите сервер

### Проблема: SMTP не настроен

**Признаки в логах:**
```
SMTP credentials are not configured. Missing: SMTP_HOST
```

**Решение:**
Заполните все SMTP настройки в `.env` файле.

### Проблема: SMTP подключение не работает

**Признаки в логах:**
```
[Email] Attempting to send confirmation to...
[Webhook] Failed to finalize booking: email: Connection timeout
```

**Решение:**
- Проверьте правильность SMTP настроек
- Убедитесь, что SMTP сервер доступен
- Проверьте, не блокирует ли firewall подключение
- Для Gmail может потребоваться "App Password" вместо обычного пароля

## Тестирование без реальной оплаты

Вы можете протестировать отправку email без реальной оплаты, используя Stripe CLI:

```bash
# Создайте тестовое событие
stripe trigger checkout.session.completed
```

Но для этого нужно сначала создать бронирование в базе данных с правильным `bookingId` в metadata.

## Проверка статуса бронирования

Чтобы проверить статус вашего бронирования, используйте API:

```bash
# Замените YOUR_BOOKING_ID на реальный ID
curl http://localhost:3000/api/bookings/YOUR_BOOKING_ID
```

Или откройте в браузере:
```
http://localhost:3000/?bookingId=YOUR_BOOKING_ID
```
