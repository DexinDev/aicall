# Настройка Stripe для локального тестирования

## Шаг 1: Установка Stripe CLI

Для macOS (через Homebrew):
```bash
brew install stripe/stripe-cli/stripe
```

Или скачайте с официального сайта: https://stripe.com/docs/stripe-cli

## Шаг 2: Авторизация в Stripe CLI

```bash
stripe login
```

Это откроет браузер для авторизации. После успешной авторизации CLI будет использовать ваш аккаунт Stripe.

## Шаг 3: Получение STRIPE_WEBHOOK_SECRET для локального тестирования

1. **Запустите Stripe CLI в режиме прослушивания** (в отдельном терминале):

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

2. **Скопируйте Webhook Signing Secret** из вывода команды. Он будет выглядеть примерно так:
   ```
   > Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxx
   ```

3. **Добавьте его в `.env` файл**:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
   ```

## Шаг 4: Запуск приложения

1. Убедитесь, что в `.env` указан **test mode ключ** (начинается с `sk_test_`):
   ```
   STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxx
   ```

2. Запустите сервер:
   ```bash
   npm run dev
   ```

3. **Важно**: Stripe CLI должен быть запущен одновременно с сервером!

## Шаг 5: Тестирование платежей

1. Откройте приложение в браузере: `http://localhost:3000`
2. Пройдите процесс бронирования
3. На странице оплаты Stripe используйте **тестовые карты**:
   - Успешная оплата: `4242 4242 4242 4242`
   - Любая будущая дата для срока действия (например, `12/34`)
   - Любой CVC (например, `123`)
   - Любой почтовый индекс

4. После успешной оплаты:
   - Webhook будет автоматически передан через Stripe CLI на ваш локальный сервер
   - В терминале с `stripe listen` вы увидите события
   - Бронирование будет помечено как оплаченное
   - Отправятся email и Telegram уведомления (если настроены)

## Полезные команды Stripe CLI

- **Просмотр событий в реальном времени**:
  ```bash
  stripe listen --forward-to localhost:3000/webhooks/stripe
  ```

- **Триггер тестового события** (без реальной оплаты):
  ```bash
  stripe trigger checkout.session.completed
  ```

- **Просмотр логов**:
  ```bash
  stripe logs tail
  ```

## Важные замечания

1. **Для локального тестирования используйте только test mode ключи** (`sk_test_...` и `whsec_...` из `stripe listen`)
2. **В production** вам нужно будет:
   - Использовать live mode ключи (`sk_live_...`)
   - Настроить webhook endpoint в Stripe Dashboard: https://dashboard.stripe.com/webhooks
   - Получить webhook signing secret из Dashboard (он будет начинаться с `whsec_`)
3. **APP_BASE_URL** для локального тестирования должен быть `http://localhost:3000`

## Проверка настройки

После настройки проверьте, что:
- ✅ `STRIPE_SECRET_KEY` начинается с `sk_test_`
- ✅ `STRIPE_WEBHOOK_SECRET` начинается с `whsec_`
- ✅ Stripe CLI запущен и показывает "Ready!"
- ✅ Сервер запущен на порту 3000
- ✅ В терминале Stripe CLI видны события при тестовых платежах
