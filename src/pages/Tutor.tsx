import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, MessageCircle, Loader, AlertCircle, Menu, X, Pencil, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { storage } from '@/lib/storage';
import { ChatMessage as ChatMessageType, ChatSession } from '@/lib/types';
import ReactMarkdown from 'react-markdown';

export default function Tutor() {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [showChatsSidebar, setShowChatsSidebar] = useState(false);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Helper to create a new chat session
  const createNewChatSession = () => {
    const id = Date.now().toString();
    const newSession: ChatSession = {
      id,
      name: 'Untitled Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const updatedChats = [newSession, ...chats];
    storage.saveChats(updatedChats);
    storage.setCurrentChatId(id);
    setChats(updatedChats);
    setCurrentChatId(id);
    setMessages([]);
    return newSession;
  };

  // Load or create chat session on mount
  useEffect(() => {
    let loadedChats = storage.getChats();
    let chatId = storage.getCurrentChatId();
    let session: ChatSession | undefined;
    if (chatId) {
      session = loadedChats.find(c => c.id === chatId);
    }
    if (!session) {
      session = createNewChatSession();
      loadedChats = storage.getChats();
      chatId = session.id;
    }
    setChats(loadedChats);
    setCurrentChatId(chatId);
    setMessages(session.messages);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Select a chat session
  const selectChat = (id: string) => {
    const session = chats.find(c => c.id === id);
    if (session) {
      setCurrentChatId(id);
      setMessages(session.messages);
      storage.setCurrentChatId(id);
    }
    setShowChatsSidebar(false);
  };

  // Start renaming a chat
  const startRenaming = (id: string, currentName: string) => {
    setRenamingChatId(id);
    setRenameValue(currentName);
  };

  // Save chat name
  const saveRename = (id: string) => {
    const updatedChats = chats.map(chat =>
      chat.id === id ? { ...chat, name: renameValue, updatedAt: new Date() } : chat
    );
    setChats(updatedChats);
    storage.saveChats(updatedChats);
    setRenamingChatId(null);
    setRenameValue('');
  };

  // Delete a chat
  const deleteChat = (id: string) => {
    if (!window.confirm('Are you sure you want to delete this chat?')) return;
    const updatedChats = chats.filter(chat => chat.id !== id);
    setChats(updatedChats);
    storage.saveChats(updatedChats);
    // If the deleted chat was current, switch to next or create new
    if (currentChatId === id) {
      if (updatedChats.length > 0) {
        const nextChat = updatedChats[0];
        setCurrentChatId(nextChat.id);
        setMessages(nextChat.messages);
        storage.setCurrentChatId(nextChat.id);
      } else {
        const newSession = createNewChatSession();
        setCurrentChatId(newSession.id);
        setMessages([]);
        storage.setCurrentChatId(newSession.id);
      }
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading || !currentChatId) return;
    const userMessage: ChatMessageType = {
      id: Date.now().toString(),
      content: inputMessage,
      sender: 'user',
      timestamp: new Date()
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputMessage('');
    setIsLoading(true);
    let tutorMessageId = (Date.now() + 1).toString();
    let tutorMessage: ChatMessageType = {
      id: tutorMessageId,
      content: '',
      sender: 'tutor',
      timestamp: new Date()
    };
    setMessages([...updatedMessages, tutorMessage]);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: inputMessage }),
      });
      if (!response.ok || !response.body) {
        throw new Error('Failed to get response from tutor');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let fullText = '';
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value);
          fullText += chunk;
          tutorMessage = {
            ...tutorMessage,
            content: fullText
          };
          setMessages([...updatedMessages, { ...tutorMessage }]);
        }
      }
      // Save to current chat session
      const chats = storage.getChats();
      const idx = chats.findIndex(c => c.id === currentChatId);
      if (idx !== -1) {
        chats[idx] = {
          ...chats[idx],
          messages: [...updatedMessages, { ...tutorMessage }],
          updatedAt: new Date(),
        };
        storage.saveChats(chats);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const fallbackMessage: ChatMessageType = {
        id: (Date.now() + 1).toString(),
        content: isOnline 
          ? `I'm sorry, but I'm having trouble connecting to the tutoring service right now. Please make sure the local server is running on ${apiUrl}. In the meantime, try reviewing your flashcards or working on coding challenges!`
          : "I'm currently offline, but I'd love to help when you're back online! In the meantime, you can practice with flashcards and coding challenges that work offline.",
        sender: 'tutor',
        timestamp: new Date()
      };
      const finalMessages = [...updatedMessages, fallbackMessage];
      setMessages(finalMessages);
      // Save to current chat session
      const chats = storage.getChats();
      const idx = chats.findIndex(c => c.id === currentChatId);
      if (idx !== -1) {
        chats[idx] = {
          ...chats[idx],
          messages: finalMessages,
          updatedAt: new Date(),
        };
        storage.saveChats(chats);
      }
    }
    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewThread = (messageContent: string) => {
    setInputMessage(`I have a follow-up question about: "${messageContent.substring(0, 50)}..."`);
  };

  const suggestedQuestions = [
    "What's the difference between a list and a tuple in Python?",
    "How do I optimize my code for better performance?",
    "Can you explain object-oriented programming concepts?",
    "What are some common Python design patterns?",
    "How do I handle errors and exceptions properly?"
  ];

  return (
    <div className="max-w-5xl mx-auto h-[calc(100vh-12rem)] flex animate-fade-in">
      {/* Collapsible Chats Sidebar */}
      {sidebarCollapsed ? (
        <div className="flex flex-col items-center justify-center w-10 bg-white dark:bg-zinc-900 border-r shadow-lg">
          <Button variant="ghost" size="icon" className="mt-4" onClick={() => setSidebarCollapsed(false)}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      ) : (
        <div className="w-80 bg-white dark:bg-zinc-900 shadow-lg h-full flex flex-col border-r transition-all">
          <div className="flex items-center justify-between p-4 border-b">
            <span className="font-bold text-lg">Chats</span>
            <div className="flex items-center gap-2">
              <Button className="gap-2" variant="outline" onClick={createNewChatSession}>
                <Plus className="w-4 h-4" /> New Chat
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(true)}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {chats.length === 0 && <div className="p-4 text-muted-foreground">No chats yet.</div>}
            {chats.map(chat => (
              <div key={chat.id}
                className={`flex items-center px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${chat.id === currentChatId ? 'bg-primary/10 border-l-4 border-primary' : ''}`}
                onClick={() => selectChat(chat.id)}>
                <div className="flex-1">
                  {renamingChatId === chat.id ? (
                    <form onSubmit={e => { e.preventDefault(); saveRename(chat.id); }}>
                      <input
                        className="w-full bg-transparent border-b border-primary focus:outline-none"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        autoFocus
                        onBlur={() => saveRename(chat.id)}
                      />
                    </form>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`font-medium truncate ${chat.id === currentChatId ? 'text-primary' : ''}`}>{chat.name}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5 p-0" onClick={e => { e.stopPropagation(); startRenaming(chat.id, chat.name); }}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5 p-0 text-destructive" onClick={e => { e.stopPropagation(); deleteChat(chat.id); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {new Date(chat.updatedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="text-center space-y-4 mb-6 relative">
          <h1 className="text-4xl font-bold flex items-center justify-center gap-3">
            <Bot className="w-10 h-10 text-primary" />
            AI Programming Tutor
          </h1>
          <p className="text-lg text-muted-foreground">
            Ask questions about programming concepts, debugging, or best practices
          </p>
          {!isOnline && (
            <div className="bg-warning/20 text-warning px-4 py-2 rounded-lg inline-block">
              <AlertCircle className="w-4 h-4 inline mr-2" />
              You're offline - Limited tutoring available
            </div>
          )}
        </div>

        {/* Chat Container */}
        <Card className="flex-1 flex flex-col bg-gradient-card shadow-card">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3">
              <MessageCircle className="w-5 h-5 text-primary" />
              Chat with your AI Tutor
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0">
            {/* Messages */}
            <ScrollArea className="flex-1 px-6" ref={scrollRef}>
              <div className="space-y-4 pb-4">
                {messages.length === 0 && (
                  <div className="text-center py-8 space-y-6">
                    <div className="text-6xl">🤖</div>
                    <div>
                      <h3 className="text-xl font-semibold mb-2">Welcome to your AI Programming Tutor!</h3>
                      <p className="text-muted-foreground mb-6">
                        I'm here to help you learn programming. Ask me anything!
                      </p>
                      
                      <div className="space-y-3">
                        <h4 className="font-medium">Try asking:</h4>
                        <div className="grid gap-2">
                          {suggestedQuestions.map((question, index) => (
                            <Button
                              key={index}
                              variant="outline"
                              className="text-left justify-start h-auto p-3 text-sm"
                              onClick={() => setInputMessage(question)}
                            >
                              {question}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {message.sender === 'tutor' && (
                      <div className="w-8 h-8 bg-gradient-primary rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                    )}
                    
                    <div className={`max-w-[80%] ${message.sender === 'user' ? 'order-2' : ''}`}>
                      <div
                        className={`p-4 rounded-2xl ${
                          message.sender === 'user'
                            ? 'bg-gradient-primary text-primary-foreground ml-auto'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">{message.sender === 'tutor' ? <ReactMarkdown>{message.content}</ReactMarkdown> : message.content}</p>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                        {message.sender === 'tutor' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => startNewThread(message.content)}
                          >
                            Ask follow-up
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {message.sender === 'user' && (
                      <div className="w-8 h-8 bg-gradient-success rounded-full flex items-center justify-center flex-shrink-0 mt-1 order-3">
                        <User className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 bg-gradient-primary rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="bg-muted p-4 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <Loader className="w-4 h-4 animate-spin" />
                        <span>Tutor is thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            {/* Input Area */}
            <div className="border-t p-6">
              <div className="flex gap-3">
                <Textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask your programming question here... (Press Enter to send)"
                  className="flex-1 min-h-[60px] max-h-32 resize-none"
                  disabled={isLoading}
                />
                <Button 
                  onClick={sendMessage} 
                  disabled={!inputMessage.trim() || isLoading}
                  className="self-end"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="mt-3 text-xs text-muted-foreground text-center">
                💡 Tip: Be specific about your programming language and the problem you're facing for better help!
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}