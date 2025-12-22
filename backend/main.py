from fastapi import FastAPI, Depends, Path, HTTPException  # <-- añade Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os

from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate
from langchain_openai import ChatOpenAI  

from collections import defaultdict
from auth import get_current_user  
from typing import List, Dict, Any
from db import supabase, upsert_conversation
from pydantic import BaseModel
from typing import Optional

from fastapi import File, UploadFile
from langchain_community.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import UnstructuredExcelLoader

app = FastAPI(title="RAG Chatbot")

origins = [
    "http://localhost:5173",          # para desarrollo Vite
    "https://usuariobot.netlify.app",   # tu dominio en producción
]

# CORS para que el frontend en Netlify pueda conectarse
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Question(BaseModel):
    question: str
    conversation_id: Optional[str] = None  # nuevo campo

# 1. Embeddings (igual que en ingest.py)
embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

# 2. Cargar Chroma desde vector_db/
vectordb = Chroma(
    embedding_function=embeddings,
    persist_directory="./vector_db",
)

# 3. Retriever (top 5 documentos más similares)
retriever = vectordb.as_retriever(search_kwargs={"k": 10})

# 4. Prompt optimizado para español

prompt_template = """Actúa como un consultor experto en evaluación del impacto social, siguiendo las metodologías de la EVPA (European Venture Philanthropy Association), la guía AEF 2015 y el enfoque de la Cátedra de Impacto Social “Medir para Decidir”.

Responde SIEMPRE en español. Usa el siguiente contexto como fuente principal de información, citándolo explícitamente cuando sea relevante. Si la respuesta no aparece en el contexto, puedes complementar con tus conocimientos generales, pero deja claro cuándo estás razonando más allá de los documentos.

Si una pregunta requiere un dato muy específico que NO se pueda deducir del contexto ni de conocimiento general razonable, responde: 
"No aparece explícitamente en los documentos proporcionados; a partir de la experiencia y buenas prácticas, se puede razonar lo siguiente: …"

Contexto:
{context}

Pregunta: {question}

Respuesta:"""

PROMPT = PromptTemplate(
    template=prompt_template, input_variables=["context", "question"]
)

# 5. LLM de Hugging Face (Llama 3.2, gratis)
# Token de OpenRouter (gratis en openrouter.ai/keys)
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
llm = ChatOpenAI(
    model="mistralai/mistral-7b-instruct:free",  # Específicamente la versión gratis
    temperature=0.1,
    openai_api_key=OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1",
)

qa_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",
    retriever=retriever,
    chain_type_kwargs={"prompt": PROMPT},
    return_source_documents=True,
)

@app.post("/chat")
def chat(payload: Question, user = Depends(get_current_user)):
    user_id = user["sub"]

    # ==== 1) Recuperar historial del hilo (si existe) ====
    history = []
    if payload.conversation_id:
        try:
            row = (
                supabase.table("conversations")
                .select("messages")
                .eq("id", payload.conversation_id)
                .eq("user_id", user_id)
                .single()
                .execute()
            )
            history = row.data.get("messages") or []
        except Exception as e:
            print("Error cargando historial:", e)

    # nos quedamos con los últimos N mensajes para no hacer el prompt gigante
    last_messages = history[-6:]

    history_text = ""
    for m in last_messages:
        role = m.get("role")
        content = m.get("content", "")
        if not content:
            continue
        prefix = "Usuario:" if role == "user" else "Asistente:"
        history_text += f"{prefix} {content}\n"

    # ==== 2) Construir la query con historial + nueva pregunta ====
    if history_text:
        full_query = f"{history_text}\nUsuario: {payload.question}\nAsistente:"
    else:
        full_query = payload.question

    # ==== 3) Llamar al QA con la query enriquecida ====
    out = qa_chain({"query": full_query})
    answer = out["result"]
    docs = out.get("source_documents", [])

    # ==== 4) Construir fuentes como antes ====
    pages_by_file = defaultdict(set)
    for d in docs:
        meta = d.metadata or {}
        file_name = meta.get("file_name", meta.get("source", "Unknown"))
        page = meta.get("page_number")
        if page is not None:
            pages_by_file[file_name].add(page)

    sources = []
    for file_name, pages in pages_by_file.items():
        page_list = sorted(
            p for p in pages if isinstance(p, int) or str(p).isdigit()
        )
        page_str = ", ".join(str(p) for p in page_list)
        sources.append({"file": file_name, "pages": page_str})

    # ==== 5) Guardar los nuevos mensajes en Supabase ====
    messages_to_save = [
        {"role": "user", "content": payload.question},
        {"role": "assistant", "content": answer, "sources": sources},
    ]

    conversation_id: Optional[str] = payload.conversation_id

    try:
        conversation_id = upsert_conversation(
            user_id=user_id,
            messages=messages_to_save,
            conversation_id=conversation_id,
        )
    except Exception as e:
        print("Error guardando conversación:", e)

    return {
        "answer": answer,
        "sources": sources,
        "conversation_id": conversation_id,
    }


# @app.post("/chat")
# def chat(payload: Question, user = Depends(get_current_user)):
#     user_id = user["sub"]

#     out = qa_chain({"query": payload.question})
#     answer = out["result"]
#     docs = out.get("source_documents", [])

#     pages_by_file = defaultdict(set)
#     for d in docs:
#         meta = d.metadata or {}
#         file_name = meta.get("file_name", meta.get("source", "Unknown"))
#         page = meta.get("page_number")
#         if page is not None:
#             pages_by_file[file_name].add(page)

#     sources = []
#     for file_name, pages in pages_by_file.items():
#         page_list = sorted(
#             p for p in pages if isinstance(p, int) or str(p).isdigit()
#         )
#         page_str = ", ".join(str(p) for p in page_list)
#         sources.append({"file": file_name, "pages": page_str})

#     messages_to_save = [
#         {"role": "user", "content": payload.question},
#         {"role": "assistant", "content": answer, "sources": sources},
#     ]

#     # usar el conversation_id que venga (o None si es nuevo hilo)
#     conversation_id: Optional[str] = payload.conversation_id

#     try:
#         conversation_id = upsert_conversation(
#             user_id=user_id,
#             messages=messages_to_save,
#             conversation_id=conversation_id,
#         )
#     except Exception as e:
#         print("Error guardando conversación:", e)

#     return {
#         "answer": answer,
#         "sources": sources,
#         "conversation_id": conversation_id,  # devolvemos el id al frontend
#     }


@app.get("/conversations")
def list_conversations(user = Depends(get_current_user)):
    user_id = user["sub"]

    result = (
        supabase.table("conversations")
        .select("id, title, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )

    # result.data ya respeta RLS: solo tus filas
    return {"conversations": result.data}

@app.get("/conversations/{conversation_id}")
def get_conversation(
    conversation_id: str = Path(...),
    user = Depends(get_current_user),
):
    user_id = user["sub"]

    result = (
        supabase.table("conversations")
        .select("id, title, messages, created_at")
        .eq("user_id", user_id)
        .eq("id", conversation_id)
        .single()
        .execute()
    )

    return {"conversation": result.data}

class RenamePayload(BaseModel):
  title: str

@app.put("/conversations/{conversation_id}/title")
def rename_conversation(
    conversation_id: str,
    payload: RenamePayload,
    user = Depends(get_current_user),
):
    user_id = user["sub"]
    from db import supabase

    (
        supabase.table("conversations")
        .update({"title": payload.title})
        .eq("id", conversation_id)
        .eq("user_id", user_id)
        .execute()
    )

    return {"ok": True}

@app.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, user = Depends(get_current_user)):
    user_id = user["sub"]
    from db import supabase

    res = (
        supabase.table("conversations")
        .delete()
        .eq("id", conversation_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not res.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {"ok": True}

@app.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...), user = Depends(get_current_user)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Solo se admiten PDFs")

    # 1) Guardar el PDF en disco
    os.makedirs("pdf_uploads", exist_ok=True)
    file_path = os.path.join("pdf_uploads", file.filename)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    # 2) Cargar y trocear el PDF
    loader = PyPDFLoader(file_path)
    docs = loader.load()

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=150,
    )
    split_docs = splitter.split_documents(docs)

    # 3) Normalizar metadata para que /chat pueda construir las fuentes
    for d in split_docs:
        meta = d.metadata or {}

        # nombre de archivo amigable
        source_path = meta.get("source", file_path)
        meta.setdefault("file_name", os.path.basename(source_path))

        # page_number a partir de page (PyPDFLoader usa 'page')
        if "page_number" not in meta and "page" in meta:
            meta["page_number"] = meta["page"]

        d.metadata = meta

    # 4) Añadir a tu Chroma existente
    vectordb.add_documents(split_docs)

    return {"ok": True, "chunks_added": len(split_docs)}


@app.post("/upload-excel")
async def upload_excel(
    file: UploadFile = File(...),
    user = Depends(get_current_user),
):
    if file.content_type not in (
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ):
        raise HTTPException(status_code=400, detail=f"Tipo no soportado: {file.content_type}")

    os.makedirs("excel_uploads", exist_ok=True)
    file_path = os.path.join("excel_uploads", file.filename)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    try:
        loader = UnstructuredExcelLoader(file_path, mode="elements")
        docs = loader.load()
    except Exception as e:
        print("Error cargando Excel:", e)
        raise HTTPException(status_code=500, detail=f"Error cargando Excel: {e}")

    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
    split_docs = splitter.split_documents(docs)

    for d in split_docs:
        meta = d.metadata or {}
        meta.setdefault("file_name", os.path.basename(meta.get("source", file_path)))
        meta.setdefault("page_number", 1)
        d.metadata = meta

    vectordb.add_documents(split_docs)

    return {"ok": True, "chunks_added": len(split_docs)}

























