from fastapi import FastAPI
from pydantic import BaseModel
import pickle

from rag.answer import answer_with_RAG
from embeddings import embedding_model  # donde crees tu Ollama/OpenRouter embeddings

app = FastAPI(title="RAG Backend")

# ---- Cargar vectorstore UNA vez al arrancar ----
with open("vectorstore.pkl", "rb") as f:
    vectorstore = pickle.load(f)


class ChatRequest(BaseModel):
    question: str
    top_k: int = 5


class ChatResponse(BaseModel):
    answer: str


@app.get("/")
def healthcheck():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    answer = answer_with_RAG(
        query=req.question,
        vectorstore=vectorstore,
        embedding_model=embedding_model,
        top_k=req.top_k,
        with_context=True
    )

    return {"answer": answer}
