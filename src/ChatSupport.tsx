import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';

type Message = {
  from: string;
  message: string;
};

const ChatSupport = ({ email }: { email: string }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:3000');
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'auth', email }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages((prev) => [...prev, data]);
    };

    return () => socket.close();
  }, [email]);

  useEffect(() => {
    if (isOpen && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'chat', message: input }));
      setMessages((prev) => [...prev, { from: email, message: input }]);
      setInput('');
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-purple-600 hover:bg-purple-700 rounded-full p-4 shadow-lg text-white"
        >
          <MessageCircle size={24} />
        </button>
      ) : (
        <div className="bg-[#0B1026] text-white rounded-2xl shadow-xl w-80 h-96 flex flex-col overflow-hidden border border-white/10">
          <div className="bg-purple-700 px-4 py-2 flex justify-between items-center">
            <h3 className="font-bold text-sm">Чат поддержки</h3>
            <button onClick={() => setIsOpen(false)} className="text-white hover:text-gray-200">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 p-3 overflow-y-auto text-sm space-y-2 bg-[#0D132E]">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`px-3 py-1.5 rounded-lg max-w-[90%] whitespace-pre-wrap ${
                  m.from === email
                    ? 'bg-purple-600 ml-auto text-right'
                    : 'bg-gray-700 mr-auto text-left'
                }`}
              >
                <div className="text-xs opacity-60 mb-1">{m.from === email ? 'Вы' : m.from}</div>
                {m.message}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={sendMessage} className="border-t border-white/10 p-2 bg-[#0B1026]">
            <input
              type="text"
              className="w-full bg-transparent px-3 py-2 text-sm rounded-lg border border-white/10 focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Напишите сообщение..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </form>
        </div>
      )}
    </div>
  );
};

export default ChatSupport;
