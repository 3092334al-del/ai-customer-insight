from pathlib import Path

import pandas as pd
import pytest

from aci_ml.dataset import DataError, load_dataset, validate
from aci_ml.schema import ASPECTS, combine
from aci_ml.semeval import load_semeval, map_category

ML = Path(__file__).resolve().parent.parent
SAMPLE = Path(__file__).parent / "fixtures" / "semeval_ru_sample.xml"


def test_map_category():
    assert map_category("FOOD#QUALITY") == "food"
    assert map_category("DRINKS#STYLE_OPTIONS") == "food"
    assert map_category("FOOD#PRICES") == "price"
    assert map_category("RESTAURANT#PRICES") == "price"
    assert map_category("SERVICE#GENERAL") == "service"
    assert map_category("AMBIENCE#GENERAL") == "atmosphere"
    assert map_category("RESTAURANT#GENERAL") is None
    assert map_category("LOCATION#GENERAL") is None


def test_combine():
    assert combine([]) == "neutral"
    assert combine(["positive", "neutral"]) == "positive"
    assert combine(["positive", "negative"]) == "both"
    assert combine(["neutral"]) == "neutral"


def test_sentences():
    rows = load_semeval(SAMPLE)
    assert len(rows) == 7, "предложение с OutOfScope пропускается"
    by_text = {r["text"]: r for r in rows}

    steak = by_text["Стейк пережарен, а вино кислое."]
    assert (steak["sentiment"], steak["food"], steak["service"]) == ("negative", "negative", "absence")

    portions = by_text["Порции большие, но дороговато."]
    assert (portions["sentiment"], portions["food"], portions["price"]) == ("both", "positive", "negative")

    general = by_text["Хороший ресторан рядом с метро."]
    assert general["sentiment"] == "positive"
    assert all(general[a] == "absence" for a in ASPECTS)

    assert by_text["Заказали салат и чай."]["sentiment"] == "neutral"


def test_reviews():
    rows = load_semeval(SAMPLE, level="review")
    assert len(rows) == 2
    first = rows[0]
    assert first["sentiment"] == "both"
    assert (first["service"], first["food"], first["price"]) == ("positive", "negative", "positive")
    assert "после работы" not in first["text"]


def test_template_csv_is_valid():
    df = load_dataset(ML / "data" / "разметка_шаблон.csv")
    assert len(df) == 5
    assert df.loc[0, "price"] == "absence", "пустая ячейка — категория не упоминается"


def test_aliases_and_errors():
    raw = pd.DataFrame({
        "Text": ["Вкусно", "Плохо", "Ну такое"],
        "sentiment": ["+", "Negative ", "плохо"],
        "service": ["", "-", ""],
        "food": ["+", "", "±"],
        "price": ["", "", ""],
        "atmosphere": ["", "", "0"],
    })
    with pytest.raises(DataError, match="строка 4: sentiment"):
        validate(raw)
    ok = validate(raw.iloc[:2])
    assert ok["sentiment"].tolist() == ["positive", "negative"]
    assert ok["service"].tolist() == ["absence", "negative"]


def test_missing_columns():
    with pytest.raises(DataError, match="нет колонок"):
        validate(pd.DataFrame({"text": ["а"], "sentiment": ["+"]}))


def test_cp1251_csv(tmp_path):
    path = tmp_path / "excel.csv"
    path.write_bytes("text;sentiment;service;food;price;atmosphere\nВкусно;+;;+;;\n".encode("cp1251"))
    assert load_dataset(path).loc[0, "food"] == "positive"
