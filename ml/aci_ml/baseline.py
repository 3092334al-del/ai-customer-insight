"""Модель 1: TF-IDF + логистическая регрессия.

Две задачи:
* тональность отзыва — один классификатор на 4 класса
  (positive / negative / neutral / both);
* категории — по отдельному классификатору «упоминается / нет»
  на каждую из четырёх категорий (у отзыва их может быть несколько).

Признаки — словесные n-граммы (1–2 слова) и символьные n-граммы
(2–5 букв). Символьные помогают с падежами: «официант», «официанта»,
«официантом» дают общие куски, и модели не нужна лемматизация.

Запуск из папки ml/:
    python -m aci_ml.baseline --train data/raw/train.xml --test data/raw/test.xml
"""

import time

import joblib
from sklearn.dummy import DummyClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import FeatureUnion, make_pipeline

from .schema import ABSENCE, ASPECT_NAMES, ASPECTS, OTHER_NAME

# Цели из установочного отчёта.
TARGET_F1_SENTIMENT = 0.80
TARGET_F1_CATEGORIES = 0.75


def make_classifier():
    features = FeatureUnion([
        ("words", TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)),
        ("chars", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5),
                                  min_df=1, sublinear_tf=True)),
    ])
    model = LogisticRegression(max_iter=2000, class_weight="balanced")
    return make_pipeline(features, model)


def _fit(texts, labels):
    # Если в обучающих данных только один класс (например, о цене никто
    # не писал), регрессия не обучится — тогда всегда отвечаем этим классом.
    if len(set(labels)) < 2:
        return DummyClassifier(strategy="most_frequent").fit(texts, labels)
    return make_classifier().fit(texts, labels)


def mentioned(df, aspect):
    return (df[aspect] != ABSENCE).astype(int).tolist()


def train(df):
    texts = df["text"].tolist()
    return {
        "sentiment": _fit(texts, df["sentiment"].tolist()),
        "aspects": {a: _fit(texts, mentioned(df, a)) for a in ASPECTS},
        "trained_on": len(df),
    }


def predict(bundle, texts):
    """Возвращает для каждого текста тональность и список категорий (как на сайте)."""
    texts = list(texts)
    if not texts:
        return []
    sentiments = bundle["sentiment"].predict(texts)
    flags = {a: bundle["aspects"][a].predict(texts) for a in ASPECTS}
    result = []
    for i, sentiment in enumerate(sentiments):
        categories = [ASPECT_NAMES[a] for a in ASPECTS if flags[a][i] == 1]
        result.append({"sentiment": str(sentiment), "categories": categories or [OTHER_NAME]})
    return result


def evaluate(bundle, df):
    """F1-macro по тональности и по категориям + подробные отчёты."""
    texts = df["text"].tolist()
    true_sent = df["sentiment"].tolist()
    pred_sent = bundle["sentiment"].predict(texts)

    true_cat = [mentioned(df, a) for a in ASPECTS]
    pred_cat = [bundle["aspects"][a].predict(texts).tolist() for a in ASPECTS]
    per_aspect = {
        a: f1_score(t, p, zero_division=0) for a, t, p in zip(ASPECTS, true_cat, pred_cat)
    }

    start = time.perf_counter()
    predict(bundle, (texts * (1000 // max(len(texts), 1) + 1))[:1000])
    seconds_per_1000 = time.perf_counter() - start

    return {
        "n": len(df),
        "f1_sentiment": f1_score(true_sent, pred_sent, average="macro", zero_division=0),
        # Среднее F1 по четырём категориям — это и есть F1-macro для мультиметок.
        "f1_categories": sum(per_aspect.values()) / len(per_aspect),
        "f1_per_aspect": per_aspect,
        "seconds_per_1000": seconds_per_1000,
        "sentiment_report": classification_report(true_sent, pred_sent, zero_division=0),
    }


def split(df, test_size=0.2, seed=42):
    """Делит данные 80/20, по возможности сохраняя доли классов тональности."""
    try:
        return train_test_split(df, test_size=test_size, random_state=seed,
                                stratify=df["sentiment"])
    except ValueError:  # слишком мало примеров какого-то класса
        return train_test_split(df, test_size=test_size, random_state=seed)


def format_report(metrics):
    def mark(value, target):
        return "выполнено" if value >= target else "не выполнено"

    lines = [
        f"Проверочных примеров: {metrics['n']}",
        f"F1-macro, тональность: {metrics['f1_sentiment']:.3f} "
        f"(цель ≥ {TARGET_F1_SENTIMENT}) — {mark(metrics['f1_sentiment'], TARGET_F1_SENTIMENT)}",
        f"F1-macro, категории:   {metrics['f1_categories']:.3f} "
        f"(цель ≥ {TARGET_F1_CATEGORIES}) — {mark(metrics['f1_categories'], TARGET_F1_CATEGORIES)}",
    ]
    lines += [f"  {ASPECT_NAMES[a]}: {v:.3f}" for a, v in metrics["f1_per_aspect"].items()]
    lines += [
        f"1000 отзывов обрабатываются за {metrics['seconds_per_1000']:.2f} с (цель < 60 с)",
        "",
        "Тональность по классам:",
        metrics["sentiment_report"],
    ]
    return "\n".join(lines)


def save(bundle, path):
    joblib.dump(bundle, path)


def load(path):
    return joblib.load(path)


if __name__ == "__main__":
    import argparse
    from pathlib import Path

    import pandas as pd

    from .dataset import load_dataset

    parser = argparse.ArgumentParser(description="Обучить и проверить TF-IDF + LogReg")
    parser.add_argument("--train", nargs="+", required=True,
                        help="файлы для обучения (.xml SemEval или .csv единого формата)")
    parser.add_argument("--test", nargs="*", default=[],
                        help="файлы для проверки; без них отложим 20%% обучающих")
    parser.add_argument("--level", choices=["sentence", "review"], default="sentence")
    parser.add_argument("--out", default="models/baseline.joblib")
    args = parser.parse_args()

    def read(paths):
        return pd.concat([load_dataset(p, level=args.level) for p in paths], ignore_index=True)

    train_df = read(args.train)
    test_df = read(args.test) if args.test else None
    if test_df is None:
        train_df, test_df = split(train_df)

    model = train(train_df)
    print(f"Обучено на {len(train_df)} примерах.\n")
    print(format_report(evaluate(model, test_df)))

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    save(model, args.out)
    print(f"Модель сохранена: {args.out}")
