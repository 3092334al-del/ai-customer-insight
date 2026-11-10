"""Чтение и проверка данных в едином формате (CSV) и из SemEval (XML)."""

from pathlib import Path

import pandas as pd

from .schema import ABSENCE, ASPECT_VALUES, ASPECTS, COLUMNS, SENTIMENTS
from .semeval import load_semeval

# Короткие обозначения, которые удобно печатать при разметке.
ALIASES = {
    "+": "positive",
    "-": "negative",
    "0": "neutral",
    "±": "both",
    "+-": "both",
    "": ABSENCE,
}


class DataError(ValueError):
    """Ошибка в файле разметки: текст объясняет, что и где исправить."""


def _read_csv(path):
    for encoding in ("utf-8-sig", "cp1251"):
        try:
            # sep=None сам определяет «;» (Excel) или «,».
            return pd.read_csv(path, sep=None, engine="python", dtype=str,
                               keep_default_na=False, encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise DataError(f"{path}: не удалось определить кодировку (нужна UTF-8 или Windows-1251)")


def _normalize(value):
    value = str(value).strip().lower()
    return ALIASES.get(value, value)


def validate(df, name="таблица"):
    """Приводит метки к стандартным значениям и проверяет их.

    Возвращает новую таблицу с колонками в порядке COLUMNS.
    """
    df = df.rename(columns=lambda c: str(c).strip().lower())
    missing = [c for c in ("text", "sentiment") + ASPECTS if c not in df.columns]
    if missing:
        raise DataError(f"{name}: нет колонок {', '.join(missing)}")

    df = df.copy()
    if "source" not in df.columns:
        df["source"] = Path(name).stem
    df["text"] = df["text"].astype(str).str.strip()
    df = df[df["text"] != ""]
    for column in ("sentiment",) + ASPECTS:
        df[column] = df[column].map(_normalize)

    problems = []
    for index, row in df.iterrows():
        line = index + 2  # +1 за заголовок, +1 за нумерацию с единицы
        if row["sentiment"] not in SENTIMENTS:
            problems.append(f"строка {line}: sentiment = «{row['sentiment']}»")
        for aspect in ASPECTS:
            if row[aspect] not in ASPECT_VALUES:
                problems.append(f"строка {line}: {aspect} = «{row[aspect]}»")
    if problems:
        shown = "\n  ".join(problems[:20])
        more = f"\n  … и ещё {len(problems) - 20}" if len(problems) > 20 else ""
        raise DataError(f"{name}: недопустимые метки\n  {shown}{more}")

    return df[list(COLUMNS)].reset_index(drop=True)


def load_dataset(path, level="sentence"):
    """Загружает .xml (SemEval-2016) или .csv (единый формат)."""
    path = Path(path)
    if path.suffix.lower() == ".xml":
        return pd.DataFrame(load_semeval(path, level=level), columns=list(COLUMNS))
    if path.suffix.lower() == ".csv":
        return validate(_read_csv(path), name=str(path))
    raise DataError(f"{path}: поддерживаются только .xml и .csv")


def save_csv(df, path):
    """Сохраняет в UTF-8 с BOM и «;», чтобы файл нормально открывался в Excel."""
    df.to_csv(path, index=False, sep=";", encoding="utf-8-sig")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Перевести корпус в единый формат CSV")
    parser.add_argument("source", help="XML SemEval-2016 или CSV")
    parser.add_argument("output", help="куда сохранить CSV")
    parser.add_argument("--level", choices=["sentence", "review"], default="sentence")
    args = parser.parse_args()

    data = load_dataset(args.source, level=args.level)
    save_csv(data, args.output)
    print(f"Сохранено строк: {len(data)} → {args.output}")
    print(data["sentiment"].value_counts().to_string())
