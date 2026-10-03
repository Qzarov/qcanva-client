# QCanva: подготовка релиза в Google Play

Сборка `.aab`/`.apk` в CI запускается пушем тега `v*` — см.
[`docs/release-tagging.md`](./release-tagging.md). Этот файл — про то, что
делать с уже собранным бандлом дальше, в Play Console.

## Техническая конфигурация

- application id: `pro.qzarov.qcanva`
- version: `1.0` (`versionCode 1`)
- minimum Android: API 24 (Android 7)
- target Android: API 36
- формат загрузки: подписанный Android App Bundle (`.aab`)
- production API: `https://canvas.qzarov.pro/api`

Новые приложения в Google Play нужно загружать как Android App Bundle и подключать к Play App Signing. Перед созданием `bundleRelease` нужен upload key.

## Upload key

1. Создайте отдельный ключ `qcanva-upload.jks` и сохраните его вне репозитория, например в корпоративном vault.
2. Скопируйте `android/keystore.properties.example` в `android/keystore.properties`.
3. Укажите абсолютный путь к ключу и его пароль/alias. Этот файл и ключ игнорируются Git.
4. Соберите bundle: `npm run android:bundle:release`.

Готовый файл будет лежать в `android/app/build/outputs/bundle/release/app-release.aab`.

## Перед загрузкой в Play Console

- зарегистрировать `pro.qzarov.qcanva` и включить Play App Signing;
- подготовить иконку 512×512, feature graphic 1024×500 и минимум два скриншота приложения;
- заполнить название, краткое и полное описание, категорию и контактный email;
- опубликовать privacy policy и указать её URL;
- заполнить Data safety по фактическим данным: QCanva обрабатывает данные аккаунта и пользовательский контент на `canvas.qzarov.pro`;
- начать с Internal testing, установить bundle на реальное устройство, затем переходить к closed/open testing и production.

Перед каждым обновлением увеличивайте `versionCode`.
