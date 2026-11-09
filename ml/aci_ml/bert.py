"""Модель 2: дообучение нейросети rubert-tiny2.

rubert-tiny2 (cointegrated/rubert-tiny2) — маленький BERT для русского
языка: около 29 млн параметров, работает даже на процессоре. В отличие от
TF-IDF он учитывает порядок слов и контекст, поэтому лучше справляется
с отрицаниями («не сказать, что вкусно») и смешанными отзывами.

Обучаем две копии модели:
* тональность — классификация на 4 класса (positive / negative / neutral / both);
* категории — 4 независимых ответа «да/нет» (multi-label), порог 0.5.

После каждой эпохи модель проверяется на валидационной выборке, и в конце
остаются веса лучшей эпохи — так модель не переобучается.

Нужен GPU (Google Colab → Среда выполнения → T4 GPU). На процессоре
обучение тоже работает, но в десятки раз медленнее.
"""

import json
import math
import random
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import f1_score
from torch import nn
from transformers import (AutoModelForSequenceClassification, AutoTokenizer,
                          get_linear_schedule_with_warmup)

from .baseline import mentioned
from .schema import ASPECTS, SENTIMENTS

MODEL_NAME = "cointegrated/rubert-tiny2"


def pick_device():
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


@torch.no_grad()
def _logits(model, tokenizer, texts, max_length, device, batch_size=64):
    model.eval()
    parts = []
    for i in range(0, len(texts), batch_size):
        batch = tokenizer(texts[i:i + batch_size], padding=True, truncation=True,
                          max_length=max_length, return_tensors="pt").to(device)
        parts.append(model(**batch).logits.float().cpu())
    return torch.cat(parts)


class BertBundle:
    """Обученная модель: тональность + категории. Понимает baseline.predict/evaluate."""

    name = "rubert-tiny2"

    def __init__(self, tokenizer, sentiment_model, aspect_model,
                 max_length=256, threshold=0.5, device=None):
        self.tokenizer = tokenizer
        self.sentiment_model = sentiment_model
        self.aspect_model = aspect_model
        self.max_length = max_length
        self.threshold = threshold
        self.device = device or pick_device()
        self.history = {}
        for model in (sentiment_model, aspect_model):
            model.to(self.device).eval()

    def _run(self, model, texts):
        return _logits(model, self.tokenizer, texts, self.max_length, self.device)

    def raw_predict(self, texts):
        texts = list(texts)
        if not texts:
            return [], {a: [] for a in ASPECTS}
        id2label = self.sentiment_model.config.id2label
        sentiments = [id2label[int(i)] for i in self._run(self.sentiment_model, texts).argmax(-1)]
        probs = torch.sigmoid(self._run(self.aspect_model, texts))
        flags = {a: (probs[:, j] >= self.threshold).int().tolist() for j, a in enumerate(ASPECTS)}
        return sentiments, flags

    def save(self, folder):
        folder = Path(folder)
        self.tokenizer.save_pretrained(folder / "tokenizer")
        self.sentiment_model.save_pretrained(folder / "sentiment")
        self.aspect_model.save_pretrained(folder / "aspects")
        settings = {"max_length": self.max_length, "threshold": self.threshold,
                    "history": self.history}
        (folder / "settings.json").write_text(json.dumps(settings, ensure_ascii=False, indent=2),
                                              encoding="utf-8")


def load(folder, device=None):
    folder = Path(folder)
    settings = json.loads((folder / "settings.json").read_text(encoding="utf-8"))
    bundle = BertBundle(
        AutoTokenizer.from_pretrained(folder / "tokenizer"),
        AutoModelForSequenceClassification.from_pretrained(folder / "sentiment"),
        AutoModelForSequenceClassification.from_pretrained(folder / "aspects"),
        max_length=settings["max_length"], threshold=settings["threshold"], device=device,
    )
    bundle.history = settings.get("history", {})
    return bundle


def _fit(model, tokenizer, texts, targets, loss_fn, score_fn, *,
         epochs, lr, batch_size, max_length, device, log, title):
    """Обычный цикл обучения PyTorch: батч → потери → шаг оптимизатора."""
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    steps = epochs * math.ceil(len(texts) / batch_size)
    # Первые 10 % шагов скорость обучения плавно растёт, потом линейно падает до нуля.
    scheduler = get_linear_schedule_with_warmup(optimizer, int(0.1 * steps), steps)

    history, best_score, best_state = [], -1.0, None
    for epoch in range(1, epochs + 1):
        model.train()
        order = torch.randperm(len(texts)).tolist()
        total = 0.0
        for start in range(0, len(order), batch_size):
            idx = order[start:start + batch_size]
            batch = tokenizer([texts[i] for i in idx], padding=True, truncation=True,
                              max_length=max_length, return_tensors="pt").to(device)
            loss = loss_fn(model(**batch).logits, targets[idx].to(device))
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()
            total += loss.item() * len(idx)

        record = {"epoch": epoch, "loss": round(total / len(texts), 4)}
        if score_fn is not None:
            record["val_f1"] = round(score_fn(model), 4)
            if record["val_f1"] > best_score:
                best_score = record["val_f1"]
                best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        history.append(record)
        log(f"{title}, эпоха {epoch}/{epochs}: " + ", ".join(f"{k}={v}" for k, v in record.items()
                                                          if k != "epoch"))

    if best_state is not None:
        model.load_state_dict(best_state)
        log(f"{title}: оставлены веса лучшей эпохи (val F1 = {best_score:.3f})")
    model.eval()
    return history


def train(df, val_df=None, *, model_name=MODEL_NAME, epochs=5, lr=5e-5, batch_size=32,
          max_length=256, seed=42, device=None, log=print):
    """Дообучает две модели. val_df — для выбора лучшей эпохи (не путать с тестом!)."""
    set_seed(seed)
    device = device or pick_device()
    log(f"Устройство: {device}")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    texts = df["text"].tolist()
    common = dict(epochs=epochs, lr=lr, batch_size=batch_size, max_length=max_length,
                  device=device, log=log)

    def val_logits(model):
        return _logits(model, tokenizer, val_df["text"].tolist(), max_length, device)

    # --- Тональность ---
    label2id = {s: i for i, s in enumerate(SENTIMENTS)}
    y = torch.tensor([label2id[s] for s in df["sentiment"]])
    counts = np.bincount(y.numpy(), minlength=len(SENTIMENTS))
    # Редкие классы весят больше — как class_weight="balanced" в модели 1.
    weights = torch.tensor(len(y) / (len(SENTIMENTS) * np.maximum(counts, 1)), dtype=torch.float32)
    sentiment_model = AutoModelForSequenceClassification.from_pretrained(
        model_name, num_labels=len(SENTIMENTS),
        id2label=dict(enumerate(SENTIMENTS)), label2id=label2id)

    def sentiment_score(model):
        pred = [SENTIMENTS[i] for i in val_logits(model).argmax(-1).tolist()]
        return f1_score(val_df["sentiment"], pred, average="macro", zero_division=0)

    history = {"sentiment": _fit(
        sentiment_model, tokenizer, texts, y, nn.CrossEntropyLoss(weight=weights.to(device)),
        sentiment_score if val_df is not None else None, title="Тональность", **common)}

    # --- Категории ---
    Y = torch.tensor(list(zip(*[mentioned(df, a) for a in ASPECTS])), dtype=torch.float32)
    aspect_model = AutoModelForSequenceClassification.from_pretrained(
        model_name, num_labels=len(ASPECTS), problem_type="multi_label_classification",
        id2label=dict(enumerate(ASPECTS)), label2id={a: i for i, a in enumerate(ASPECTS)})

    def aspect_score(model):
        true = np.array(list(zip(*[mentioned(val_df, a) for a in ASPECTS])))
        pred = (torch.sigmoid(val_logits(model)) >= 0.5).int().numpy()
        return f1_score(true, pred, average="macro", zero_division=0)

    # Каждая категория упоминается в меньшинстве отзывов. Без веса модели выгоднее
    # всегда отвечать «нет», поэтому редкое «да» весит больше (но не больше чем в 10 раз).
    positives = Y.sum(0)
    pos_weight = ((len(Y) - positives) / positives.clamp(min=1)).clamp(1, 10)

    history["aspects"] = _fit(
        aspect_model, tokenizer, texts, Y, nn.BCEWithLogitsLoss(pos_weight=pos_weight.to(device)),
        aspect_score if val_df is not None else None, title="Категории", **common)

    bundle = BertBundle(tokenizer, sentiment_model, aspect_model,
                        max_length=max_length, device=device)
    bundle.history = history
    return bundle
