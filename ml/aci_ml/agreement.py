"""Согласие двух разметчиков на пилотных отзывах.

Критерий из установочного отчёта: на 50 пилотных отзывах разметчики
совпадают не менее чем в 80 % меток. Если меньше — уточняем инструкцию
(РАЗМЕТКА.md) по спорным случаям и размечаем заново.

Запуск из папки ml/:
    python -m aci_ml.agreement data/пилот_Буханцев.csv data/пилот_Жданов.csv
"""

import pandas as pd
from sklearn.metrics import cohen_kappa_score

from .dataset import DataError, load_dataset
from .schema import ASPECTS

LABELS = ("sentiment",) + ASPECTS
TARGET = 0.80


def compare(a, b):
    """Сравнивает две разметки одних и тех же отзывов (сопоставляет по тексту)."""
    if a["text"].duplicated().any() or b["text"].duplicated().any():
        raise DataError("в разметке есть одинаковые тексты — оставьте по одному")
    merged = a.merge(b, on="text", suffixes=("_1", "_2"))
    lost = len(a) + len(b) - 2 * len(merged)
    if lost:
        raise DataError(f"тексты в файлах не совпадают: {lost} строк без пары")

    per_label = {}
    for label in LABELS:
        x, y = merged[f"{label}_1"], merged[f"{label}_2"]
        per_label[label] = {
            "agreement": float((x == y).mean()),
            # Каппа Коэна учитывает совпадения «по случайности»: > 0.6 — хорошо.
            "kappa": float(cohen_kappa_score(x, y)) if len(set(x) | set(y)) > 1 else 1.0,
        }

    disagreements = []
    for _, row in merged.iterrows():
        for label in LABELS:
            if row[f"{label}_1"] != row[f"{label}_2"]:
                disagreements.append({
                    "text": row["text"], "метка": label,
                    "разметчик_1": row[f"{label}_1"], "разметчик_2": row[f"{label}_2"],
                })

    overall = sum(v["agreement"] for v in per_label.values()) / len(per_label)
    return {"n": len(merged), "overall": overall, "per_label": per_label,
            "disagreements": pd.DataFrame(disagreements)}


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Согласие двух разметчиков")
    parser.add_argument("first")
    parser.add_argument("second")
    parser.add_argument("--diff", default="расхождения.csv",
                        help="куда сохранить спорные отзывы для обсуждения")
    args = parser.parse_args()

    result = compare(load_dataset(args.first), load_dataset(args.second))
    print(f"Отзывов: {result['n']}")
    for label, v in result["per_label"].items():
        print(f"  {label:11} совпадение {v['agreement']:.0%}, каппа {v['kappa']:.2f}")
    verdict = "критерий выполнен" if result["overall"] >= TARGET else "нужно уточнить инструкцию"
    print(f"Итого совпадение меток: {result['overall']:.0%} (цель ≥ {TARGET:.0%}) — {verdict}")
    if len(result["disagreements"]):
        result["disagreements"].to_csv(args.diff, index=False, sep=";", encoding="utf-8-sig")
        print(f"Расхождения: {args.diff}")
