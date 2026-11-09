"""API для сайта: отдаёт тональность и категории от обученной модели.

Запуск из папки ml/ (после обучения модели):
    uvicorn aci_ml.api:app --port 8000

Проверка: http://127.0.0.1:8000/docs — там можно отправить запрос из браузера.

Отзывы не сохраняются: модель отвечает и забывает текст.
"""

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import baseline

MODEL_PATH = Path(os.environ.get("ACI_MODEL", Path(__file__).parent.parent / "models" / "baseline.joblib"))
MAX_REVIEWS = 5000
MAX_TEXT = 5000

app = FastAPI(title="AI-Customer Insight API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    # Адреса сайта, которым можно обращаться к API (через запятую).
    allow_origins=os.environ.get("ACI_CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)

_model = None


def get_model():
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            raise HTTPException(503, "Модель не обучена: запустите python -m aci_ml.baseline")
        _model = baseline.load(MODEL_PATH)
    return _model


class Review(BaseModel):
    text: str = Field(max_length=MAX_TEXT)


class AnalyzeRequest(BaseModel):
    reviews: list[Review] = Field(max_length=MAX_REVIEWS)


class Result(BaseModel):
    sentiment: str
    categories: list[str]


class AnalyzeResponse(BaseModel):
    model: str
    results: list[Result]


@app.get("/health")
def health():
    return {"status": "ok", "model_ready": MODEL_PATH.exists()}


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest):
    model = get_model()
    results = baseline.predict(model, (r.text for r in request.reviews))
    return {"model": "tfidf-logreg", "results": results}
