// src/App.tsx
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AuthForm } from "@/components/AuthForm";
import { supabase } from "@/lib/supabaseClient";

type Source = {
  file: string;
  pages: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

type ConversationSummary = {
  id: string;
  title: string | null;
  created_at: string;
};

type Conversation = {
  id: string;
  title: string | null;
  created_at: string;
  messages: Message[];
};

const API_BASE = "https://usuariobot-production.up.railway.app";

function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const inner = part.slice(2, -2);
      return <strong key={idx}>{inner}</strong>;
    }
    return <span key={idx}>{part}</span>;
  });
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTimeoutId, setStatusTimeoutId] = useState<number | null>(null);

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || null;
      if (token) {
        setAccessToken(token);
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token || null;
      setAccessToken(token);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadConversations = async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/conversations`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) return;
      const data: { conversations?: ConversationSummary[] } = await res.json();
      setConversations(data.conversations ?? []);
    } catch (e) {
      console.error("Error cargando conversaciones", e);
    }
  };

  const loadConversationById = async (id: string) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_BASE}/conversations/${id}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) return;
      const data: { conversation?: Conversation } = await res.json();
      if (data.conversation?.messages) {
        setMessages(data.conversation.messages);
        setCurrentConversationId(id);
      }
    } catch (e) {
      console.error("Error cargando conversación", e);
    }
  };

  useEffect(() => {
    if (accessToken) {
      loadConversations(accessToken);
    } else {
      setConversations([]);
      setMessages([]);
      setCurrentConversationId(null);
    }
  }, [accessToken]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isLoading || !accessToken) return;

    const userMsg: Message = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          question,
          conversation_id: currentConversationId,
        }),
      });

      if (!res.ok) {
        throw new Error("Error en la API");
      }

      const data: {
        answer: string;
        sources?: Source[];
        conversation_id?: string;
      } = await res.json();

      const assistantMsg: Message = {
        role: "assistant",
        content: data.answer,
        sources: data.sources ?? [],
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (data.conversation_id) {
        setCurrentConversationId(data.conversation_id);
      }

      await loadConversations(accessToken);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Ha ocurrido un error llamando a la API.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRename = async (id: string) => {
    if (!accessToken) return;
    const newTitle = editingTitle.trim();
    if (!newTitle) {
      setEditingId(null);
      return;
    }
    try {
      await fetch(`${API_BASE}/conversations/${id}/title`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ title: newTitle }),
      });

      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
      );
    } catch (e) {
      console.error("Error renombrando conversación", e);
    } finally {
      setEditingId(null);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    if (!accessToken) return;
    try {
      await fetch(`${API_BASE}/conversations/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      setConversations((prev) => prev.filter((c) => c.id !== id));

      if (currentConversationId === id) {
        setCurrentConversationId(null);
        setMessages([]);
      }
    } catch (e) {
      console.error("Error eliminando conversación", e);
    }
  };

  const setAutoClearingStatus = (message: string) => {
    if (statusTimeoutId) {
      clearTimeout(statusTimeoutId);
    }
    setStatusMessage(message);
    const id = window.setTimeout(() => setStatusMessage(null), 5000);
    setStatusTimeoutId(id);
  };

  const handleUploadPdf = async (file: File) => {
    if (!accessToken) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setAutoClearingStatus(`Subiendo "${file.name}"...`);
      const res = await fetch(`${API_BASE}/upload-pdf`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (!res.ok) {
        console.error("Error subiendo PDF");
        setAutoClearingStatus("Error al subir el PDF.");
        return;
      }

      const data = await res.json();
      setAutoClearingStatus(
        `PDF "${file.name}" subido correctamente. Se han indexado ${data.chunks_added} fragmentos.`
      );
    } catch (e) {
      console.error("Error llamando a /upload-pdf", e);
      setAutoClearingStatus("Error al subir el PDF.");
    }
  };

  const handleUploadExcel = async (file: File) => {
    if (!accessToken) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setAutoClearingStatus(`Subiendo Excel "${file.name}"...`);
      const res = await fetch(`${API_BASE}/upload-excel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();          // NUEVO
        console.error("upload-excel error:", res.status, text);
        setAutoClearingStatus("Error al subir el Excel.");
        return;
      }

      const data = await res.json();
      setAutoClearingStatus(
        `Excel "${file.name}" subido correctamente. Se han indexado ${data.chunks_added} fragmentos.`
      );
    } catch (e) {
      console.error("Error llamando a /upload-excel", e);
      setAutoClearingStatus("Error al subir el Excel.");
    }
  };

  if (!accessToken) {
    return <AuthForm onAuth={setAccessToken} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex p-4 gap-4">
      {/* Columna de historial */}
      <Card className="w-64 h-[80vh] flex flex-col overflow-hidden">
        <div className="border-b px-3 py-2 font-semibold text-sm flex justify-between items-center">
          <span>Historial</span>
          <Button
            variant="outline"
            size="xs"
            onClick={() => accessToken && loadConversations(accessToken)}
          >
            Recargar
          </Button>
        </div>
        <div className="flex-1 p-3 space-y-2 text-sm overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aún no hay conversaciones.
            </p>
          ) : (
            conversations.map((c) => {
              const isEditing = editingId === c.id;
              return (
                <div key={c.id} className="space-y-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => loadConversationById(c.id)}
                      className={`flex-1 text-left cursor-pointer rounded px-2 py-1 hover:bg-muted ${
                        currentConversationId === c.id ? "bg-muted" : ""
                      }`}
                    >
                      <div className="font-medium truncate">
                        {isEditing ? (
                          <Input
                            autoFocus
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRename(c.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            onBlur={() => handleRename(c.id)}
                            className="h-6 text-xs"
                          />
                        ) : (
                          c.title || "Sin título"
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleString()}
                      </div>
                    </button>
                    {!isEditing && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-xs"
                          onClick={() => {
                            setEditingId(c.id);
                            setEditingTitle(c.title || "");
                          }}
                        >
                          ✏️
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-xs text-red-600"
                          onClick={() => handleDeleteConversation(c.id)}
                        >
                          🗑️
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Card del chat */}
      <Card className="flex-1 h-[80vh] flex flex-col overflow-hidden">
        <div className="border-b px-4 py-3 font-semibold flex justify-between items-center">
          <span>ImpactAI Bot</span>
          <div className="flex gap-2 items-center">
            <label className="text-xs cursor-pointer border rounded px-2 py-1 hover:bg-muted">
              Subir PDF
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleUploadPdf(file);
                    e.target.value = "";
                  }
                }}
              />
            </label>

            <label className="text-xs cursor-pointer border rounded px-2 py-1 hover:bg-muted">
              Subir Excel
              <input
                type="file"
                accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleUploadExcel(file);
                    e.target.value = "";
                  }
                }}
              />
            </label>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCurrentConversationId(null);
                setMessages([]);
              }}
            >
              Nuevo hilo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAccessToken(null);
                setMessages([]);
                setCurrentConversationId(null);
              }}
            >
              Cerrar sesión
            </Button>
          </div>
        </div>

        {statusMessage && (
          <div className="px-4 py-2 text-xs text-emerald-800 bg-emerald-50 border-b border-emerald-200">
            {statusMessage}
          </div>
        )}

        <div className="flex-1 px-4 py-3 overflow-y-auto">
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`rounded-lg px-3 py-2 max-w-[80%] text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {m.role === "assistant" ? (
                    (() => {
                      const lines = m.content
                        .split("\n")
                        .filter((l) => l.trim() !== "");
                      const bulletLines = lines.filter((l) =>
                        /^\s*-\s+/.test(l)
                      );
                      const otherLines = lines.filter(
                        (l) => !/^\s*-\s+/.test(l)
                      );

                      return (
                        <div className="space-y-2">
                          {otherLines.map((line, idx) => (
                            <p key={`p-${idx}`}>{renderBold(line)}</p>
                          ))}

                          {bulletLines.length > 0 && (
                            <ul className="list-disc list-inside space-y-1">
                              {bulletLines.map((line, idx) => (
                                <li key={`li-${idx}`}>
                                  {renderBold(
                                    line.replace(/^\s*-\s+/, "")
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <p>{m.content}</p>
                  )}

                  {m.role === "assistant" &&
                    m.sources &&
                    m.sources.length > 0 && (
                      <div className="mt-2 text-xs opacity-80">
                        Fuentes:
                        <ul className="list-disc list-inside">
                          {m.sources.map((s, j) => (
                            <li key={j}>
                              {s.file} (pág. {s.pages})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t px-4 py-3 flex gap-2">
          <Input
            className="flex-1"
            placeholder="Escribe tu pregunta sobre los PDFs..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <Button
            className="shrink-0"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? "Enviando..." : "Enviar"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default App;


// // src/App.tsx
// import { useEffect, useState } from "react";
// import { Input } from "@/components/ui/input";
// import { Button } from "@/components/ui/button";
// import { Card } from "@/components/ui/card";
// import { AuthForm } from "@/components/AuthForm";
// import { supabase } from "@/lib/supabaseClient";

// type Source = {
//   file: string;
//   pages: string;
// };

// type Message = {
//   role: "user" | "assistant";
//   content: string;
//   sources?: Source[];
// };

// type ConversationSummary = {
//   id: string;
//   title: string | null;
//   created_at: string;
// };

// type Conversation = {
//   id: string;
//   title: string | null;
//   created_at: string;
//   messages: Message[];
// };

// const API_BASE = "https://usuariobot-production.up.railway.app";

// function renderBold(text: string) {
//   const parts = text.split(/(\*\*[^*]+\*\*)/g);
//   return parts.map((part, idx) => {
//     if (part.startsWith("**") && part.endsWith("**")) {
//       const inner = part.slice(2, -2);
//       return <strong key={idx}>{inner}</strong>;
//     }
//     return <span key={idx}>{part}</span>;
//   });
// }

// function App() {
//   const [messages, setMessages] = useState<Message[]>([]);
//   const [input, setInput] = useState("");
//   const [isLoading, setIsLoading] = useState(false);
//   const [accessToken, setAccessToken] = useState<string | null>(null);
//   const [conversations, setConversations] = useState<ConversationSummary[]>([]);
//   const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
//   const [editingId, setEditingId] = useState<string | null>(null);
//   const [editingTitle, setEditingTitle] = useState("");
//   const [statusMessage, setStatusMessage] = useState<string | null>(null); // NUEVO

//   useEffect(() => {
//     const loadSession = async () => {
//       const { data } = await supabase.auth.getSession();
//       const token = data.session?.access_token || null;
//       if (token) {
//         setAccessToken(token);
//       }
//     };

//     loadSession();

//     const {
//       data: { subscription },
//     } = supabase.auth.onAuthStateChange((_event, session) => {
//       const token = session?.access_token || null;
//       setAccessToken(token);
//     });

//     return () => {
//       subscription.unsubscribe();
//     };
//   }, []);

//   const loadConversations = async (token: string) => {
//     try {
//       const res = await fetch(`${API_BASE}/conversations`, {
//         headers: {
//           Authorization: `Bearer ${token}`,
//         },
//       });
//       if (!res.ok) return;
//       const data: { conversations?: ConversationSummary[] } = await res.json();
//       setConversations(data.conversations ?? []);
//     } catch (e) {
//       console.error("Error cargando conversaciones", e);
//     }
//   };

//   const loadConversationById = async (id: string) => {
//     if (!accessToken) return;
//     try {
//       const res = await fetch(`${API_BASE}/conversations/${id}`, {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//         },
//       });
//       if (!res.ok) return;
//       const data: { conversation?: Conversation } = await res.json();
//       if (data.conversation?.messages) {
//         setMessages(data.conversation.messages);
//         setCurrentConversationId(id);
//       }
//     } catch (e) {
//       console.error("Error cargando conversación", e);
//     }
//   };

//   useEffect(() => {
//     if (accessToken) {
//       loadConversations(accessToken);
//     } else {
//       setConversations([]);
//       setMessages([]);
//       setCurrentConversationId(null);
//     }
//   }, [accessToken]);

//   const handleSend = async () => {
//     const question = input.trim();
//     if (!question || isLoading || !accessToken) return;

//     const userMsg: Message = { role: "user", content: question };
//     setMessages((prev) => [...prev, userMsg]);
//     setInput("");
//     setIsLoading(true);

//     try {
//       const res = await fetch(`${API_BASE}/chat`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${accessToken}`,
//         },
//         body: JSON.stringify({
//           question,
//           conversation_id: currentConversationId,
//         }),
//       });

//       if (!res.ok) {
//         throw new Error("Error en la API");
//       }

//       const data: {
//         answer: string;
//         sources?: Source[];
//         conversation_id?: string;
//       } = await res.json();

//       const assistantMsg: Message = {
//         role: "assistant",
//         content: data.answer,
//         sources: data.sources ?? [],
//       };

//       setMessages((prev) => [...prev, assistantMsg]);

//       if (data.conversation_id) {
//         setCurrentConversationId(data.conversation_id);
//       }

//       await loadConversations(accessToken);
//     } catch {
//       setMessages((prev) => [
//         ...prev,
//         {
//           role: "assistant",
//           content: "Ha ocurrido un error llamando a la API.",
//         },
//       ]);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
//     if (e.key === "Enter" && !e.shiftKey) {
//       e.preventDefault();
//       handleSend();
//     }
//   };

//   const handleRename = async (id: string) => {
//     if (!accessToken) return;
//     const newTitle = editingTitle.trim();
//     if (!newTitle) {
//       setEditingId(null);
//       return;
//     }
//     try {
//       await fetch(`${API_BASE}/conversations/${id}/title`, {
//         method: "PUT",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${accessToken}`,
//         },
//         body: JSON.stringify({ title: newTitle }),
//       });

//       setConversations((prev) =>
//         prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
//       );
//     } catch (e) {
//       console.error("Error renombrando conversación", e);
//     } finally {
//       setEditingId(null);
//     }
//   };

//   const handleDeleteConversation = async (id: string) => {
//     if (!accessToken) return;
//     try {
//       await fetch(`${API_BASE}/conversations/${id}`, {
//         method: "DELETE",
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//         },
//       });

//       setConversations((prev) => prev.filter((c) => c.id !== id));

//       if (currentConversationId === id) {
//         setCurrentConversationId(null);
//         setMessages([]);
//       }
//     } catch (e) {
//       console.error("Error eliminando conversación", e);
//     }
//   };

//   const handleUploadPdf = async (file: File) => {
//     if (!accessToken) return;

//     const formData = new FormData();
//     formData.append("file", file);

//     try {
//       setStatusMessage(`Subiendo "${file.name}"...`);
//       const res = await fetch(`${API_BASE}/upload-pdf`, {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//         },
//         body: formData,
//       });

//       if (!res.ok) {
//         console.error("Error subiendo PDF");
//         setStatusMessage("Error al subir el PDF.");
//         return;
//       }

//       const data = await res.json();
//       setStatusMessage(
//         `PDF "${file.name}" subido correctamente. Se han indexado ${data.chunks_added} fragmentos.`
//       );
//       setTimeout(() => setStatusMessage(null), 5000);
//     } catch (e) {
//       console.error("Error llamando a /upload-pdf", e);
//       setStatusMessage("Error al subir el PDF.");
//     }
//   };

//   if (!accessToken) {
//     return <AuthForm onAuth={setAccessToken} />;
//   }

//   return (
//     <div className="min-h-screen bg-background text-foreground flex p-4 gap-4">
//       {/* Columna de historial */}
//       <Card className="w-64 h-[80vh] flex flex-col overflow-hidden">
//         <div className="border-b px-3 py-2 font-semibold text-sm flex justify-between items-center">
//           <span>Historial</span>
//           <Button
//             variant="outline"
//             size="xs"
//             onClick={() => accessToken && loadConversations(accessToken)}
//           >
//             Recargar
//           </Button>
//         </div>
//         <div className="flex-1 p-3 space-y-2 text-sm overflow-y-auto">
//           {conversations.length === 0 ? (
//             <p className="text-xs text-muted-foreground">
//               Aún no hay conversaciones.
//             </p>
//           ) : (
//             conversations.map((c) => {
//               const isEditing = editingId === c.id;
//               return (
//                 <div key={c.id} className="space-y-1">
//                   <div className="flex items-center gap-1">
//                     <button
//                       type="button"
//                       onClick={() => loadConversationById(c.id)}
//                       className={`flex-1 text-left cursor-pointer rounded px-2 py-1 hover:bg-muted ${
//                         currentConversationId === c.id ? "bg-muted" : ""
//                       }`}
//                     >
//                       <div className="font-medium truncate">
//                         {isEditing ? (
//                           <Input
//                             autoFocus
//                             value={editingTitle}
//                             onChange={(e) => setEditingTitle(e.target.value)}
//                             onKeyDown={(e) => {
//                               if (e.key === "Enter") handleRename(c.id);
//                               if (e.key === "Escape") setEditingId(null);
//                             }}
//                             onBlur={() => handleRename(c.id)}
//                             className="h-6 text-xs"
//                           />
//                         ) : (
//                           c.title || "Sin título"
//                         )}
//                       </div>
//                       <div className="text-[10px] text-muted-foreground">
//                         {new Date(c.created_at).toLocaleString()}
//                       </div>
//                     </button>
//                     {!isEditing && (
//                       <>
//                         <Button
//                           variant="ghost"
//                           size="icon"
//                           className="h-6 w-6 text-xs"
//                           onClick={() => {
//                             setEditingId(c.id);
//                             setEditingTitle(c.title || "");
//                           }}
//                         >
//                           ✏️
//                         </Button>
//                         <Button
//                           variant="ghost"
//                           size="icon"
//                           className="h-6 w-6 text-xs text-red-600"
//                           onClick={() => handleDeleteConversation(c.id)}
//                         >
//                           🗑️
//                         </Button>
//                       </>
//                     )}
//                   </div>
//                 </div>
//               );
//             })
//           )}
//         </div>
//       </Card>

//       {/* Card del chat */}
//       <Card className="flex-1 h-[80vh] flex flex-col overflow-hidden">
//         <div className="border-b px-4 py-3 font-semibold flex justify-between items-center">
//           <span>ImpactAI Bot</span>
//           <div className="flex gap-2 items-center">
//             <label className="text-xs cursor-pointer border rounded px-2 py-1 hover:bg-muted">
//               Subir PDF
//               <input
//                 type="file"
//                 accept="application/pdf"
//                 className="hidden"
//                 onChange={(e) => {
//                   const file = e.target.files?.[0];
//                   if (file) {
//                     handleUploadPdf(file);
//                     e.target.value = "";
//                   }
//                 }}
//               />
//             </label>
//             <Button
//               variant="outline"
//               size="sm"
//               onClick={() => {
//                 setCurrentConversationId(null);
//                 setMessages([]);
//               }}
//             >
//               Nuevo hilo
//             </Button>
//             <Button
//               variant="outline"
//               size="sm"
//               onClick={() => {
//                 setAccessToken(null);
//                 setMessages([]);
//                 setCurrentConversationId(null);
//               }}
//             >
//               Cerrar sesión
//             </Button>
//           </div>
//         </div>

//         {statusMessage && (
//           <div className="px-4 py-2 text-xs text-emerald-800 bg-emerald-50 border-b border-emerald-200">
//             {statusMessage}
//           </div>
//         )}

//         <div className="flex-1 px-4 py-3 overflow-y-auto">
//           <div className="space-y-4">
//             {messages.map((m, i) => (
//               <div
//                 key={i}
//                 className={`flex ${
//                   m.role === "user" ? "justify-end" : "justify-start"
//                 }`}
//               >
//                 <div
//                   className={`rounded-lg px-3 py-2 max-w-[80%] text-sm ${
//                     m.role === "user"
//                       ? "bg-primary text-primary-foreground"
//                       : "bg-muted"
//                   }`}
//                 >
//                   {m.role === "assistant" ? (
//                     (() => {
//                       const lines = m.content
//                         .split("\n")
//                         .filter((l) => l.trim() !== "");
//                       const bulletLines = lines.filter((l) =>
//                         /^\s*-\s+/.test(l)
//                       );
//                       const otherLines = lines.filter(
//                         (l) => !/^\s*-\s+/.test(l)
//                       );

//                       return (
//                         <div className="space-y-2">
//                           {otherLines.map((line, idx) => (
//                             <p key={`p-${idx}`}>{renderBold(line)}</p>
//                           ))}

//                           {bulletLines.length > 0 && (
//                             <ul className="list-disc list-inside space-y-1">
//                               {bulletLines.map((line, idx) => (
//                                 <li key={`li-${idx}`}>
//                                   {renderBold(
//                                     line.replace(/^\s*-\s+/, "")
//                                   )}
//                                 </li>
//                               ))}
//                             </ul>
//                           )}
//                         </div>
//                       );
//                     })()
//                   ) : (
//                     <p>{m.content}</p>
//                   )}

//                   {m.role === "assistant" &&
//                     m.sources &&
//                     m.sources.length > 0 && (
//                       <div className="mt-2 text-xs opacity-80">
//                         Fuentes:
//                         <ul className="list-disc list-inside">
//                           {m.sources.map((s, j) => (
//                             <li key={j}>
//                               {s.file} (pág. {s.pages})
//                             </li>
//                           ))}
//                         </ul>
//                       </div>
//                     )}
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>

//         <div className="border-t px-4 py-3 flex gap-2">
//           <Input
//             className="flex-1"
//             placeholder="Escribe tu pregunta sobre los PDFs..."
//             value={input}
//             onChange={(e) => setInput(e.target.value)}
//             onKeyDown={handleKeyDown}
//             disabled={isLoading}
//           />
//           <Button
//             className="shrink-0"
//             onClick={handleSend}
//             disabled={isLoading || !input.trim()}
//           >
//             {isLoading ? "Enviando..." : "Enviar"}
//           </Button>
//         </div>
//       </Card>
//     </div>
//   );
// }

// export default App;



