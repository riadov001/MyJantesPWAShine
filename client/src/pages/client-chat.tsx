import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { 
  MessageCircle, 
  Send, 
  ArrowLeft,
  Plus,
  Shield,
  Headphones,
  Bot,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { User, ChatConversation, ChatMessage, ChatParticipant, ChatAttachment } from "@shared/schema";

type ConversationWithDetails = ChatConversation & {
  participants: (ChatParticipant & { user: User })[];
  unreadCount: number;
  lastMessage?: ChatMessage & { sender: User; attachmentCount: number };
};

type MessageWithDetails = ChatMessage & {
  sender: User;
  attachments: ChatAttachment[];
};

export default function ClientChat() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messageInput, setMessageInput] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [isMobileView, setIsMobileView] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [newConvSubject, setNewConvSubject] = useState("");

  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<ConversationWithDetails[]>({
    queryKey: ["/api/chat/conversations"],
    enabled: isAuthenticated,
    refetchInterval: 15000,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<MessageWithDetails[]>({
    queryKey: ["/api/chat/conversations", selectedConversation, "messages"],
    enabled: !!selectedConversation,
    refetchInterval: 5000,
  });

  const { data: chatUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/chat/users"],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { conversationId: string; content: string }) => {
      return apiRequest("POST", `/api/chat/conversations/${data.conversationId}/messages`, { content: data.content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", selectedConversation, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      setMessageInput("");
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible d'envoyer le message.", variant: "destructive" });
    },
  });

  const createConversationMutation = useMutation({
    mutationFn: async (data: { title: string; participantIds: string[]; type: string }) => {
      const res = await apiRequest("POST", "/api/chat/conversations", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      setSelectedConversation(data.id);
      setShowNewConversation(false);
      setNewConvSubject("");
      toast({ title: "Discussion cr\u00e9\u00e9e", description: "Vous pouvez maintenant envoyer un message." });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message || "Impossible de cr\u00e9er la discussion.", variant: "destructive" });
    },
  });

  const handleSendMessage = useCallback(() => {
    const content = messageInput.trim();
    if (!selectedConversation || !content) return;
    sendMessageMutation.mutate({ conversationId: selectedConversation, content });
  }, [messageInput, selectedConversation, sendMessageMutation]);

  const handleCreateConversation = () => {
    if (!newConvSubject.trim()) {
      toast({ title: "Sujet requis", description: "Veuillez indiquer un sujet.", variant: "destructive" });
      return;
    }
    const admins = chatUsers.filter((u: any) => u.role === "admin" || u.role === "superadmin");
    if (admins.length === 0) {
      toast({ title: "Aucun administrateur", description: "Aucun administrateur disponible pour le moment.", variant: "destructive" });
      return;
    }
    createConversationMutation.mutate({
      title: newConvSubject.trim(),
      participantIds: admins.map((a: any) => a.id),
      type: "client_admin",
    });
  };

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getParticipantName = (participant: ChatParticipant & { user: User }) => {
    return `${participant.user.firstName || ""} ${participant.user.lastName || ""}`.trim() || participant.user.email;
  };

  const getConversationIcon = (conv: ConversationWithDetails) => {
    const hasAdmin = conv.participants.some(p => p.user.role === "admin" || p.user.role === "superadmin");
    if (hasAdmin) return <Shield className="h-5 w-5" />;
    return <MessageCircle className="h-5 w-5" />;
  };

  const currentConversation = conversations.find(c => c.id === selectedConversation);

  if (authLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const renderConversationList = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Messages</h2>
            <p className="text-sm text-muted-foreground">
              {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
              {totalUnread > 0 && ` - ${totalUnread} non lu${totalUnread !== 1 ? "s" : ""}`}
            </p>
          </div>
          <Button size="icon" onClick={() => setShowNewConversation(true)} data-testid="button-new-conversation">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        {conversationsLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Aucune discussion</p>
            <p className="text-sm mt-1">Contactez l'administration pour d\u00e9marrer</p>
            <Button 
              className="mt-4" 
              onClick={() => setShowNewConversation(true)}
              data-testid="button-start-first-conversation"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle discussion
            </Button>
          </div>
        ) : (
          <div className="p-2">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConversation(conv.id)}
                className={`w-full text-left p-3 rounded-md mb-1 transition-colors hover-elevate ${
                  selectedConversation === conv.id 
                    ? "bg-muted" 
                    : ""
                }`}
                data-testid={`conversation-${conv.id}`}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-muted">
                      {getConversationIcon(conv)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium truncate text-sm">{conv.title}</p>
                      {conv.unreadCount > 0 && (
                        <Badge className="h-5 min-w-[20px] p-0 flex items-center justify-center text-xs shrink-0">
                          {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                        </Badge>
                      )}
                    </div>
                    {conv.lastMessage && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {conv.lastMessage.sender.firstName || conv.lastMessage.sender.email}: {conv.lastMessage.content || ""}
                      </p>
                    )}
                    {conv.lastMessage && (
                      <span className="text-xs text-muted-foreground/70">
                        {format(new Date(conv.lastMessage.createdAt!), "dd/MM HH:mm", { locale: fr })}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  const renderMessageThread = () => {
    if (!currentConversation) {
      return (
        <div className="flex flex-col h-full">
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium">S\u00e9lectionnez une discussion</h3>
              <p className="text-sm mt-1">Choisissez une conversation ou cr\u00e9ez-en une nouvelle</p>
            </div>
          </div>
        </div>
      );
    }

    const otherParticipants = currentConversation.participants.filter(p => p.userId !== user?.id);

    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b flex items-center gap-3">
          {isMobileView && (
            <Button variant="ghost" size="icon" onClick={() => setSelectedConversation(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{currentConversation.title}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {otherParticipants.map(p => getParticipantName(p)).join(", ")}
            </p>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          {messagesLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p className="text-sm">Aucun message pour l'instant. \u00c9crivez le premier !</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => {
                const isOwn = msg.senderId === user?.id;
                const senderName = `${msg.sender.firstName || ""} ${msg.sender.lastName || ""}`.trim() || msg.sender.email;
                const isAdmin = msg.sender.role === "admin" || msg.sender.role === "superadmin";
                return (
                  <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                    <div className={`flex gap-2 max-w-[80%] ${isOwn ? "flex-row-reverse" : ""}`}>
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={msg.sender.profileImageUrl || undefined} />
                        <AvatarFallback className="text-xs">{getInitials(senderName)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className={`flex items-center gap-2 mb-1 ${isOwn ? "justify-end" : ""} flex-wrap`}>
                          <span className="text-xs font-medium">{senderName}</span>
                          {isAdmin && !isOwn && (
                            <Badge variant="secondary" className="text-[10px] py-0 px-1">
                              <Shield className="h-2.5 w-2.5 mr-0.5" />
                              Admin
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {msg.createdAt && format(new Date(msg.createdAt), "HH:mm", { locale: fr })}
                          </span>
                        </div>
                        <div className={`rounded-lg p-3 ${isOwn ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        <form 
          onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
          className="p-4 border-t flex gap-2"
        >
          <Input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="\u00c9crivez votre message..."
            className="flex-1"
            data-testid="input-message"
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!messageInput.trim() || sendMessageMutation.isPending}
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto h-[calc(100vh-80px)]">
      <Card className="h-full overflow-hidden">
        <div className="flex h-full">
          {isMobileView ? (
            selectedConversation ? renderMessageThread() : renderConversationList()
          ) : (
            <>
              <div className="w-80 border-r shrink-0 h-full flex flex-col">
                {renderConversationList()}
              </div>
              <div className="flex-1 h-full flex flex-col min-w-0">
                {renderMessageThread()}
              </div>
            </>
          )}
        </div>
      </Card>

      <Dialog open={showNewConversation} onOpenChange={setShowNewConversation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle discussion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Envoyez un message \u00e0 l'administration de votre garage. Un responsable vous r\u00e9pondra dans les meilleurs d\u00e9lais.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Sujet</label>
              <Input
                placeholder="Ex: Question sur mon devis, R\u00e9clamation..."
                value={newConvSubject}
                onChange={(e) => setNewConvSubject(e.target.value)}
                data-testid="input-conversation-subject"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewConversation(false)}>
              Annuler
            </Button>
            <Button 
              onClick={handleCreateConversation} 
              disabled={createConversationMutation.isPending || !newConvSubject.trim()}
              data-testid="button-create-conversation"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              D\u00e9marrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
