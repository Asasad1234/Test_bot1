# Test_bot1

## Развертывание на Render

1. Создайте в Render новый **Blueprint** и подключите этот GitHub-репозиторий.
2. Render прочитает корневой [`render.yaml`](./render.yaml), соберёт Docker-образ приложения и создаст постоянный диск для данных.
3. Нажмите **Apply** для создания сервиса и запуска деплоя.

Firebase-конфигурация берётся из `Test_bot-main/Bot_nastroyki-main/firebase-applet-config.json`; вручную задавать `FIREBASE_CONFIG_JSON` в Render не нужно.