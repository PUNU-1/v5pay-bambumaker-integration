# Переключение на боевой режим V5Pay

Делать, когда V5Pay создал боевой аккаунт и прислал доступ в боевой кабинет.
Рабочий сервер: `https://pay.bambumaker.com` (VPS, IP `194.67.113.151`, SSH-ключ
`%USERPROFILE%\.ssh\v5pay_vps`). Тест уже пройден, здесь только замена ключей.

## 1. Боевой кабинет V5Pay
1. Войти боевым логином из письма V5Pay, сменить выданный пароль, новый передать
   заказчице.
2. Applications → Application List → Edit у приложения:
   - взять `merchantNo` (Merchant ID), `appKey`, `secretKey`;
   - **Callback URL**: `https://pay.bambumaker.com/v5pay/callback`.
3. Убедиться, что IP `194.67.113.151` внесён у V5Pay в белый список.

Боевой Merchant ID может отличаться от тестового (`M2102304288287268881`).

## 2. Ключи на сервер (в PowerShell на своём компьютере)
```powershell
powershell -ExecutionPolicy Bypass -File "D:\Punhan\My files\Free\v5pay-integration\deploy\set-keys.ps1" -Server 194.67.113.151
```
Ответы на вопросы:
- `V5PAY_BASE_URL`: **`https://api.v5pay.com`** (не Enter!)
- `V5PAY_MERCHANT_NO`, `V5PAY_APP_KEY`: боевые
- `V5PAY_SECRET_KEY`: боевой (вставка правой кнопкой, символы не видны)

Ожидаемый ответ: `v5pay: active, base URL: https://api.v5pay.com, merchant: ...`.

## 3. Включить оплату для всех покупателей
1. В `public/tilda-embed.html` заменить `var TEST_ONLY = true;` на `var TEST_ONLY = false;`.
2. Тильда → Настройки сайта → Ещё → HTML-код для HEAD: **заменить** наш блок
   (от `<!--` «Оплата заказа из корзины…» до `</script>`) на новый, не дописывать
   рядом — иначе на каждый заказ будет два платежа. Сохранить,
   «Опубликовать все страницы».

## 4. Проверка
1. Окно инкогнито, обычная ссылка `https://bambumaker.com` (без `?v5pay_test=1`).
2. Заказ на минимально возможную сумму, оплата реальной картой; статус
   «успешно» в боевом кабинете. Заказ пометить «ТЕСТ», вернуть деньги через кабинет.
3. Логи сервера: `ssh -i %USERPROFILE%\.ssh\v5pay_vps root@194.67.113.151 "journalctl -u v5pay -n 30 --no-pager"`
   — должны быть строки `Создан платёж…` и `Заказ … статус: 2 (успешно)`.

## Если что-то пошло не так
- Вернуть тестовый режим: `TEST_ONLY = true` в коде Тильды + `set-keys.ps1` с
  тестовыми ключами и Enter на `V5PAY_BASE_URL`.
- Сервис: `systemctl restart v5pay`; nginx: `systemctl status nginx`.
- Сертификат обновляется сам (`certbot renew --dry-run` для проверки).

## Уборка после запуска
- Удалить сервис `v5pay-bambumaker-integration` на Render (не нужен).
- Владелице аккаунта REG.RU сменить пароль, который был в переписке.
