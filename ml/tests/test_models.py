import pandas as pd
import pytest
from fastapi.testclient import TestClient

from aci_ml import agreement, api, baseline
from aci_ml.schema import OTHER_NAME, SENTIMENTS


def toy_data():
    rows = [
        ("Официант вежливый и быстрый", "positive", "positive", "absence", "absence", "absence"),
        ("Официант грубый, ждали час", "negative", "negative", "absence", "absence", "absence"),
        ("Очень вкусная пицца", "positive", "absence", "positive", "absence", "absence"),
        ("Невкусный холодный суп", "negative", "absence", "negative", "absence", "absence"),
        ("Цены низкие, недорого", "positive", "absence", "absence", "positive", "absence"),
        ("Слишком дорого, цены высокие", "negative", "absence", "absence", "negative", "absence"),
        ("Уютный зал и приятная музыка", "positive", "absence", "absence", "absence", "positive"),
        ("Громкая музыка и грязный зал", "negative", "absence", "absence", "absence", "negative"),
        ("Заказали чай", "neutral", "absence", "neutral", "absence", "absence"),
        ("Были вечером", "neutral", "absence", "absence", "absence", "absence"),
    ]
    df = pd.DataFrame(rows, columns=["text", "sentiment", "service", "food", "price", "atmosphere"])
    df["source"] = "тест"
    return pd.concat([df] * 3, ignore_index=True)


@pytest.fixture(scope="module")
def model():
    return baseline.train(toy_data())


def test_predict_format(model):
    out = baseline.predict(model, ["Официант грубый", "Были вечером"])
    assert all(r["sentiment"] in SENTIMENTS for r in out)
    assert "Сервис" in out[0]["categories"]
    assert out[1]["categories"] == [OTHER_NAME]
    assert baseline.predict(model, []) == []


def test_evaluate_on_train_is_high(model):
    metrics = baseline.evaluate(model, toy_data())
    assert metrics["f1_sentiment"] > 0.9
    assert metrics["f1_categories"] > 0.9
    assert metrics["seconds_per_1000"] < 60
    assert "Тональность по классам" in baseline.format_report(metrics)


def test_single_class_column_does_not_crash():
    df = toy_data()
    df["price"] = "absence"
    out = baseline.predict(baseline.train(df), ["Дорого"])
    assert "Цена" not in out[0]["categories"]


def test_save_load(model, tmp_path):
    path = tmp_path / "m.joblib"
    baseline.save(model, path)
    assert baseline.predict(baseline.load(path), ["Вкусно"]) == baseline.predict(model, ["Вкусно"])


def test_agreement():
    a = toy_data().drop_duplicates("text").reset_index(drop=True)
    b = a.copy()
    b.loc[0, "sentiment"] = "neutral"
    result = agreement.compare(a, b)
    assert result["n"] == 10
    assert result["per_label"]["sentiment"]["agreement"] == 0.9
    assert result["overall"] == pytest.approx(0.98)
    assert len(result["disagreements"]) == 1


def test_api(model, tmp_path, monkeypatch):
    path = tmp_path / "m.joblib"
    baseline.save(model, path)
    monkeypatch.setattr(api, "MODEL_PATH", path)
    monkeypatch.setattr(api, "_model", None)
    client = TestClient(api.app)

    assert client.get("/health").json()["model_ready"] is True
    response = client.post("/api/analyze", json={"reviews": [{"text": "Официант грубый"}]})
    assert response.status_code == 200
    assert response.json()["results"][0]["sentiment"] in SENTIMENTS
    too_long = {"reviews": [{"text": "а" * 6000}]}
    assert client.post("/api/analyze", json=too_long).status_code == 422


def test_api_without_model(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "MODEL_PATH", tmp_path / "нет.joblib")
    monkeypatch.setattr(api, "_model", None)
    response = TestClient(api.app).post("/api/analyze", json={"reviews": [{"text": "Вкусно"}]})
    assert response.status_code == 503
