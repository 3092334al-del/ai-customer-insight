"""Тесты модели 2 на крошечном BERT, собранном прямо в тесте (без интернета).

Проверяют механику — обучение, выбор лучшей эпохи, сохранение, API, —
а не качество: настоящий rubert-tiny2 обучается в ноутбуке 02.
"""

import re

import pytest

torch = pytest.importorskip("torch")
transformers = pytest.importorskip("transformers")

from fastapi.testclient import TestClient  # noqa: E402

from aci_ml import api, baseline, bert  # noqa: E402
from aci_ml.schema import ASPECTS, SENTIMENTS  # noqa: E402

from .test_models import toy_data  # noqa: E402


@pytest.fixture(scope="module")
def tiny_model_dir(tmp_path_factory):
    folder = tmp_path_factory.mktemp("tiny-bert")
    words = sorted({w for t in toy_data()["text"] for w in re.findall(r"\w+|[^\w\s]", t.lower())})
    vocab = ["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"] + words
    (folder / "vocab.txt").write_text("\n".join(vocab), encoding="utf-8")
    tokenizer = transformers.BertTokenizerFast(str(folder / "vocab.txt"), do_lower_case=True,
                                               strip_accents=False)
    config = transformers.BertConfig(vocab_size=len(vocab), hidden_size=32, num_hidden_layers=1,
                                     num_attention_heads=2, intermediate_size=64,
                                     max_position_embeddings=64)
    transformers.BertModel(config).save_pretrained(folder)
    tokenizer.save_pretrained(folder)
    return folder


@pytest.fixture(scope="module")
def trained(tiny_model_dir):
    df = toy_data()
    return bert.train(df, val_df=df.drop_duplicates("text"), model_name=str(tiny_model_dir),
                      epochs=15, lr=3e-3, batch_size=8, max_length=32, device="cpu",
                      log=lambda *_: None)


def test_training_learns(trained):
    for task in ("sentiment", "aspects"):
        history = trained.history[task]
        assert len(history) == 15
        assert history[-1]["loss"] < history[0]["loss"], f"{task}: потери не снижаются"
    metrics = baseline.evaluate(trained, toy_data())
    assert metrics["f1_sentiment"] > 0.5
    assert metrics["f1_categories"] > 0.5


def test_predict_format(trained):
    out = baseline.predict(trained, ["Официант грубый", "Совсем новое слово"])
    assert len(out) == 2
    assert all(r["sentiment"] in SENTIMENTS for r in out)
    assert all(r["categories"] for r in out)
    sentiments, flags = trained.raw_predict([])
    assert sentiments == [] and set(flags) == set(ASPECTS)


def test_save_load_and_api(trained, tmp_path, monkeypatch):
    folder = tmp_path / "rubert_tiny2"
    trained.save(folder)
    loaded = bert.load(folder, device="cpu")
    texts = toy_data()["text"].tolist()[:10]
    assert baseline.predict(loaded, texts) == baseline.predict(trained, texts)
    assert loaded.history == trained.history

    monkeypatch.setattr(api, "MODEL_PATH", folder)
    monkeypatch.setattr(api, "_model", None)
    response = TestClient(api.app).post("/api/analyze", json={"reviews": [{"text": "Вкусно"}]})
    assert response.status_code == 200
    assert response.json()["model"] == "rubert-tiny2"
