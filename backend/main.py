from fastapi import FastAPI, Depends  # <-- añade Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from db import supabase

from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate
from langchain_openai import ChatOpenAI  

from collections import defaultdict
from auth import get_current_user  # <-- importa la dependencia

app = FastAPI(title="RAG Chatbot")

# CORS para que el frontend en Netlify pueda conectarse
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Cambiar por tu dominio Netlify luego
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
class Question(BaseModel):
    question: str

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
retriever = vectordb.as_retriever(search_kwargs={"k": 5})

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
from datetime import datetime
from collections import defaultdict

# @app.post("/chat")
# def chat(payload: Question, user = Depends(get_current_user)):
#     user_id = user["sub"]

#     # 1. Obtener o crear conversación
#     conversation = get_or_create_conversation(
#         supabase,
#         user_id,
#         payload.conversation_id
#     )

#     messages = conversation["messages"] or []

#     # 2. Ejecutar RAG (IGUAL que antes)
#     out = qa_chain({"query": payload.question})
#     answer = out["result"]
#     docs = out.get("source_documents", [])

#     # 3. Construir sources (IGUAL que antes)
#     pages_by_file = defaultdict(set)
#     for d in docs:
#         meta = d.metadata or {}
#         file_name = meta.get("file_name", meta.get("source", "Unknown"))
#         page = meta.get("page_number")
#         if page is not None:
#             pages_by_file[file_name].add(page)

#     sources = []
#     for file_name, pages in pages_by_file.items():
#         page_list = sorted(p for p in pages if isinstance(p, int))
#         sources.append({
#             "file": file_name,
#             "pages": ", ".join(str(p) for p in page_list),
#         })

#     now = datetime.utcnow().isoformat()

#     # 4. Añadir mensajes al historial
#     messages.extend([
#         {
#             "role": "user",
#             "content": payload.question,
#             "created_at": now
#         },
#         {
#             "role": "assistant",
#             "content": answer,
#             "sources": sources,
#             "created_at": now
#         }
#     ])

#     # 5. Guardar conversación
#     supabase.table("conversations") \
#         .update({"messages": messages}) \
#         .eq("id", conversation["id"]) \
#         .execute()

#     # 6. Respuesta al frontend
#     return {
#         "answer": answer,
#         "sources": sources,
#         "conversation_id": conversation["id"]
#     }

@app.post("/chat")
def chat(payload: Question, user = Depends(get_current_user)):
    # user es el payload del JWT de Supabase
    user_id = user["sub"]  # ID del usuario en Supabase

    out = qa_chain({"query": payload.question})
    answer = out["result"]
    docs = out.get("source_documents", [])

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
        sources.append(
            {
                "file": file_name,
                "pages": page_str,
            }
        )

    return {
        "answer": answer,
        "sources": sources,
        # opcionalmente, para debug:
        # "user_id": user_id,
    }


