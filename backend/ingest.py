from pathlib import Path
import logging

from langchain_unstructured import UnstructuredLoader
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

from unstructured.cleaners.core import clean_extra_whitespace

# ---------- CONFIG ----------
PDF_DIR = Path("data")
VECTOR_DB_DIR = "vector_db"
LANGUAGES = ["es"]

# ---------- LOGGING ----------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_info_dict_from(chunk) -> dict:
    """Extrae texto y metadata de cada fragmento"""
    return {
        "page_content": chunk.page_content,
        "metadata": {
            "file_name": Path(chunk.metadata.get("source")).name,
            "page_number": chunk.metadata.get("page_number", None),
        },
    }

def get_chunks(pdf_dir: Path) -> list[dict]:
    """Itera sobre todos los PDFs del directorio y devuelve lista de chunks"""
    chunks_info = []

    for pdf_file in pdf_dir.glob("*.pdf"):
        logger.info(f"Procesando {pdf_file.name}")
        loader = UnstructuredLoader(
            pdf_file,
            languages=LANGUAGES,
            post_processors=[clean_extra_whitespace],
            chunking_strategy="by_title",
            max_characters=1000,
            overlap=150,
        )

        chunks = loader.load()
        for chunk in chunks:
            chunks_info.append(get_info_dict_from(chunk))

    return chunks_info


def ingest_pdfs():
    logger.info("Leyendo PDFs...")
    chunks_info = get_chunks(PDF_DIR)

    texts = [c["page_content"] for c in chunks_info]
    metadatas = [c["metadata"] for c in chunks_info]

    logger.info(f"{len(texts)} fragmentos creados")

    logger.info("Creando embeddings locales...")
    embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2"
    )

    logger.info("Guardando en Chroma...")
    Chroma.from_texts(
        texts=texts,
        embedding=embeddings,
        metadatas=metadatas,
        persist_directory=VECTOR_DB_DIR,
    )

    logger.info("Ingesta completada")


if __name__ == "__main__":
    ingest_pdfs()
