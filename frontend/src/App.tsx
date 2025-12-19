// // src/App.tsx
// import { useState } from "react";
// import { Input } from "@/components/ui/input";
// import { Button } from "@/components/ui/button";
// import { Card } from "@/components/ui/card";
// import { AuthForm } from "@/components/AuthForm";

// type Source = {
//   file: string;
//   pages: string;
// };

// type Message = {
//   role: "user" | "assistant";
//   content: string;
//   sources?: Source[];
// };

// const API_URL = "https://usuariobot-production.up.railway.app/chat";

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

//   // 🆕 conversation id
//   const [conversationId, setConversationId] = useState<string | null>(null);

//   const handleSend = async () => {
//     const question = input.trim();
//     if (!question || isLoading || !accessToken) return;

//     const userMsg: Message = { role: "user", content: question };
//     setMessages((prev) => [...prev, userMsg]);
//     setInput("");
//     setIsLoading(true);

//     try {
//       const res = await fetch(API_URL, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${accessToken}`,
//         },
//         body: JSON.stringify({
//           question,
//           conversation_id: conversationId, // 🆕
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

//       // 🆕 Guardamos conversation_id solo la primera vez
//       if (data.conversation_id && !conversationId) {
//         setConversationId(data.conversation_id);
//       }

//       const assistantMsg: Message = {
//         role: "assistant",
//         content: data.answer,
//         sources: data.sources ?? [],
//       };

//       setMessages((prev) => [...prev, assistantMsg]);
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

//   // 🔐 Pantalla de login
//   if (!accessToken) {
//     return <AuthForm onAuth={setAccessToken} />;
//   }

//   return (
//     <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
//       <Card className="w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden">
//         <div className="border-b px-4 py-3 font-semibold flex justify-between items-center">
//           <span>ImpactAI Bot</span>
//           <Button
//             variant="outline"
//             size="sm"
//             onClick={() => {
//               setAccessToken(null);
//               setMessages([]);
//               setConversationId(null); // 🆕 reset conversación
//             }}
//           >
//             Cerrar sesión
//           </Button>
//         </div>

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


// src/App.tsx
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AuthForm } from "@/components/AuthForm";

type Source = {
  file: string;
  pages: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

const API_URL = "https://usuariobot-production.up.railway.app/chat";

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

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isLoading || !accessToken) return;

    const userMsg: Message = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        throw new Error("Error en la API");
      }

      const data: { answer: string; sources?: Source[] } = await res.json();

      const assistantMsg: Message = {
        role: "assistant",
        content: data.answer,
        sources: data.sources ?? [],
      };

      setMessages((prev) => [...prev, assistantMsg]);
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

  // Si no hay token, mostramos pantalla de login/registro
  if (!accessToken) {
    return <AuthForm onAuth={setAccessToken} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <Card className="w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden">
        <div className="border-b px-4 py-3 font-semibold flex justify-between items-center">
          <span>ImpactAI Bot</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAccessToken(null);
              setMessages([]);
            }}
          >
            Cerrar sesión
          </Button>
        </div>

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



