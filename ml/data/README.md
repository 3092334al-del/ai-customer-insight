# Данные

| Папка / файл | Что там | В git |
|---|---|---|
| `raw/` | скачанные корпуса (SemEval-2016, русские рестораны) | нет |
| `разметка_шаблон.csv` | шаблон для своей разметки с примерами | да |
| `*.csv` | наша разметка в едином формате | да, если в текстах нет личных данных |

## Открытый корпус

Русские ресторанные отзывы SentiRuEval-2015 вошли в SemEval-2016 Task 5 (Aspect Based Sentiment Analysis, домен Restaurants, язык Russian) в формате XML SE-ABSA16: около 300 отзывов, 4000 предложений.

* **Пробный файл** (5 отзывов, 60 предложений) скачивается напрямую — на нём удобно проверить, что всё запускается: http://alt.qcri.org/semeval2016/task5/data/uploads/trial-data/restaurants_trial_russian.xml
* **Обучающие и тестовые данные** (Subtask 1) выложены на META-SHARE; ссылки — на странице https://alt.qcri.org/semeval2016/task5/index.php?id=data-and-tools (Russian → Restaurants). Для тестовых данных нужен файл с разметкой «Gold annotations», а не «Test Phase A».

Обучающий и тестовый файлы положите в `raw/`, например `raw/train.xml` и `raw/test.xml`.

Перевести в единый формат CSV (чтобы посмотреть глазами):

```bash
python -m aci_ml.dataset data/raw/train.xml data/semeval_train.csv
```

Лицензия корпуса — для исследовательских целей; в отчёте укажите источник.
