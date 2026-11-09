"""Загрузчик русского корпуса ресторанных отзывов SemEval-2016 Task 5 (SE-ABSA16).

Это отзывы SentiRuEval-2015, переведённые организаторами в формат SemEval:

    <Reviews>
      <Review rid="...">
        <sentences>
          <sentence id="...">
            <text>Официант был очень вежлив.</text>
            <Opinions>
              <Opinion target="Официант" category="SERVICE#GENERAL"
                       polarity="positive" from="0" to="8"/>
            </Opinions>
          </sentence>
          ...

Категории SemEval (СУЩНОСТЬ#АТРИБУТ) сводятся к нашим четырём:
любые *#PRICES → цена; FOOD и DRINKS → качество еды; SERVICE → сервис;
AMBIENCE → атмосфера. RESTAURANT#GENERAL, RESTAURANT#MISCELLANEOUS и
LOCATION#GENERAL ни в одну категорию не попадают, но учитываются
в общей тональности.
"""

import xml.etree.ElementTree as ET

from .schema import ABSENCE, ASPECTS, combine

SOURCE = "semeval2016-ru"


def map_category(category):
    """'FOOD#QUALITY' → 'food'; None, если категории у нас нет."""
    entity, _, attribute = category.upper().partition("#")
    if attribute == "PRICES":
        return "price"
    return {
        "FOOD": "food",
        "DRINKS": "food",
        "SERVICE": "service",
        "AMBIENCE": "atmosphere",
    }.get(entity)


def _row(text, opinions):
    """opinions — список пар (категория SemEval, полярность)."""
    row = {"text": text, "sentiment": combine(p for _, p in opinions)}
    for aspect in ASPECTS:
        found = [p for c, p in opinions if map_category(c) == aspect]
        row[aspect] = combine(found) if found else ABSENCE
    row["source"] = SOURCE
    return row


def _opinions(sentence):
    return [
        (op.get("category", ""), op.get("polarity", "").lower())
        for op in sentence.iter("Opinion")
    ]


def load_semeval(path, level="sentence"):
    """Читает XML и возвращает список строк единого формата.

    level="sentence" — строка на каждое предложение (данных больше,
    так модель учится быстрее); level="review" — строка на весь отзыв
    (так сайт анализирует отзывы клиента).
    Предложения с OutOfScope="TRUE" пропускаются.
    """
    if level not in ("sentence", "review"):
        raise ValueError("level должен быть 'sentence' или 'review'")

    rows = []
    for review in ET.parse(path).getroot().iter("Review"):
        texts, review_opinions = [], []
        for sentence in review.iter("sentence"):
            if sentence.get("OutOfScope", "").upper() == "TRUE":
                continue
            text = (sentence.findtext("text") or "").strip()
            if not text:
                continue
            opinions = _opinions(sentence)
            if level == "sentence":
                rows.append(_row(text, opinions))
            else:
                texts.append(text)
                review_opinions.extend(opinions)
        if level == "review" and texts:
            rows.append(_row(" ".join(texts), review_opinions))
    return rows
