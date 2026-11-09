"""Единый формат размеченных отзывов.

Одна строка — один отзыв (или одно предложение отзыва):

    text | sentiment | service | food | price | atmosphere | source

* sentiment — общая тональность: positive / negative / neutral / both;
* service, food, price, atmosphere — тональность по категории, или absence,
  если категория в тексте не упоминается;
* source — откуда строка (semeval2016-ru, наша-разметка и т. п.).

Значения совпадают с разметкой SentiRuEval, поэтому свои отзывы
и открытый корпус можно смешивать в одной таблице.
"""

SENTIMENTS = ("positive", "negative", "neutral", "both")
ABSENCE = "absence"
ASPECT_VALUES = SENTIMENTS + (ABSENCE,)

# Порядок и русские названия — как на сайте (dist/analyzer.js).
ASPECTS = ("service", "food", "price", "atmosphere")
ASPECT_NAMES = {
    "service": "Сервис",
    "food": "Качество еды",
    "price": "Цена",
    "atmosphere": "Атмосфера",
}
OTHER_NAME = "Прочее"

COLUMNS = ("text", "sentiment") + ASPECTS + ("source",)


def combine(polarities):
    """Сводит несколько оценок в одну: позитив и негатив вместе дают both."""
    found = {p for p in polarities if p in SENTIMENTS}
    if "both" in found or {"positive", "negative"} <= found:
        return "both"
    if "positive" in found:
        return "positive"
    if "negative" in found:
        return "negative"
    return "neutral"
