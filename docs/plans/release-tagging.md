# Соглашение по релизным тегам

Пуш тега `v*` в этот репозиторий запускает `.github/workflows/android-release.yml`:
собирает подписанный Android-бандл (`.aab`) и APK по ABI и публикует их в GitHub Releases
под этим тегом. **В Google Play релиз не заливается автоматически** — это отдельный
ручной шаг, см. [`docs/google-play-release.md`](./google-play-release.md).

Веб (`qcanva.qzarov.pro`) деплоится отдельно, скриптом `scripts/deploy-production.sh`
на сервере, и с тегами никак не связан — можно задеплоить веб без тега и наоборот.

## Что попадает в релиз

| Файл | Для чего |
|---|---|
| `qcanva-X.Y.Z-arm64-v8a.apk` | Телефоны (почти все Android-устройства). Его и ставить вручную |
| `qcanva-X.Y.Z-x86_64-emulator.apk` | Эмулятор Android Studio на ПК |
| `qcanva-X.Y.Z.aab` | Google Play: содержит все ABI, Play сам раздаёт нужную часть |

APK разделены по ABI (`splits.abi` в `android/app/build.gradle`), потому что узел
хранения Q Space (`libqspace_ffi.so`, ~14 МБ на ABI) — основная часть размера: общий
APK весил ~37 МБ, APK под одну ABI — ~21 МБ (замер debug-сборки 17.10.2026).
Старых 32-битных телефонов (`armeabi-v7a`) в релизе нет: узел хранения под них не
собирается.

Release-сборка делит APK по ABI сама. Debug-сборка по умолчанию остаётся одним
`app-debug.apk` (его ставят `npx cap run android` и Android Studio); APK по ABI в
debug: `./gradlew :app:assembleDebug -PabiSplits=true` →
`app/build/outputs/apk/debug/app-arm64-v8a-debug.apk` и `app-x86_64-debug.apk`.

## Когда тегировать

Тег ставится на HEAD ветки `main` в момент, когда туда смержен релиз из `dev`,
который хотим отдать в Android-сборку. Тегировать нужно после мержа, а не до —
тег должен указывать на тот коммит `main`, который реально хотим собрать.

Перед тегом версия должна стоять в `package.json`: её показывает меню приложения и
веба (`DashboardSidebar.vue`). Сборка берёт версию из тега, поэтому без этого шага
релиз соберётся, но меню покажет старый номер — так вышли `v1.8.7`–`v1.9.0`. Теперь
workflow сверяет номер и останавливает сборку, если он не совпал с тегом.

```bash
# в ветке, которая пойдёт в dev и main
npm version X.Y.Z --no-git-tag-version   # правит package.json и package-lock.json

# после мержа в main
git fetch origin main
git tag -a vX.Y.Z origin/main -m "Краткое описание, что вошло"
git push origin vX.Y.Z
```

## Перевыпуск того же тега

Если в только что выпущенной версии нашлась ошибка и её исправили, тег можно
переставить на новый коммит `main` и собрать заново под тем же номером:

```bash
git fetch origin main
git tag -f -a vX.Y.Z origin/main -m "Краткое описание, что вошло"
git push --force origin refs/tags/vX.Y.Z
```

Сборка заменит прежний релиз на GitHub новым. Делать так стоит только пока сборку
никто не ставил: у тех, кто уже установил APK, под тем же номером окажется другой код.

## Версионирование

Строгого автоматического semver нет — версия выбирается вручную по смыслу:

- **minor** (`1.X.0`) — обычный случай: смержена одна фича или пачка связанных фич;
- **patch** (`1.X.Y`) — точечный фикс без нового функционала;
- **major** — пока не использовался, зарезервирован под breaking changes.

`versionCode` в собранном APK/AAB берётся из номера прогона workflow
(`github.run_number`), не из тега — совпадения версии с Google Play не требуется,
но перед реальной публикацией в Play Console его всё равно нужно сверить
(см. [`docs/google-play-release.md`](./google-play-release.md#перед-загрузкой-в-play-console)).
