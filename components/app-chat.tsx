'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLanguage } from '@/app/providers'
import { Mic, Keyboard, Send, Clock, Play, TrendingUp, StopCircle, Loader2 } from 'lucide-react'

interface AppMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface AppChatProps {
  app: {
    id: string
    name: string
    descriptionEn?: string
    url: string
    messages?: AppMessage[]
  }
  onUpdate: () => void
}

export function AppChat({ app, onUpdate }: AppChatProps) {
  const { language } = useLanguage()
  const [messages, setMessages] = useState<AppMessage[]>(app.messages || [])
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice')
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [textInput, setTextInput] = useState('')
  const chatScrollRef = useRef<HTMLDivElement>(null)
  
  // Auto scroll to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [messages])

  const handleStartEvolution = async (query: string) => {
    if (!query.trim() || isProcessing) return
    
    setIsProcessing(true)
    
    // Optimistically add user message
    const userMsg: AppMessage = { role: 'user', content: query, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    
    try {
      const res = await fetch('/api/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: app.id,
          name: app.name,
          description: app.descriptionEn || '',
          vercelUrl: app.url,
          query: query // Assuming we update /api/evolution to accept a user query
        }),
      })
      
      if (res.ok) {
        // App is now evolving, add assistant message
        const assistantMsg: AppMessage = { 
          role: 'assistant', 
          content: 'I have started analyzing your request and initiating an evolution cycle. You will be notified when the changes are ready for approval.', 
          timestamp: Date.now() 
        }
        
        setMessages(prev => [...prev, assistantMsg])
        
        // Save these messages to the DB
        await fetch(`/api/apps/${app.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [...messages, userMsg, assistantMsg] })
        })
        
        onUpdate()
      }
    } catch (e) {
      console.error('Failed to trigger evolution', e)
    } finally {
      setIsProcessing(false)
      setTextInput('')
      setInputMode('voice')
    }
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      
      {/* Chat History */}
      <div 
        ref={chatScrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide pt-6 pb-24"
      >
        {messages.map((msg, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div 
              className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-[#E8601A] text-white rounded-2xl rounded-br-sm shadow-sm' 
                  : 'bg-white/60 dark:bg-black/40 backdrop-blur-md border border-[#E4E1DA] dark:border-white/10 text-[#1A1917] dark:text-[#F5F4F0] rounded-2xl rounded-bl-sm shadow-sm'
              }`}
            >
              {msg.content}
            </div>
            <div className={`text-[10px] mt-1.5 flex items-center gap-1 opacity-50 px-1 font-medium ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && <span className="font-bold mr-1 tracking-wider uppercase">MAYA</span>}
              <Clock className="w-2.5 h-2.5" />
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </motion.div>
        ))}
        
        {isProcessing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="bg-white/60 dark:bg-black/40 backdrop-blur-md border border-[#E4E1DA] dark:border-white/10 rounded-2xl rounded-bl-sm p-4 shadow-sm flex items-center gap-3">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[#E8601A] animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-[#E8601A] animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-[#E8601A] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Floating Input Area */}
      <div className="absolute bottom-4 left-4 right-4 bg-white dark:bg-[#1A1917] border border-[#E4E1DA] dark:border-white/10 rounded-3xl shadow-xl p-2 shrink-0 z-10 transition-all">
        <AnimatePresence mode="wait">
          {inputMode === 'voice' ? (
            <motion.div 
              key="voice"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center justify-between px-2"
            >
              <button 
                onClick={() => window.location.href = `/app/${app.id}/evolution`}
                className="p-2.5 text-[#6B6560] dark:text-[#9E9890] hover:text-[#E8601A] hover:bg-[#F5F4F0] dark:hover:bg-white/5 rounded-full transition-all"
                title="Evolution Log"
              >
                <TrendingUp className="w-5 h-5" />
              </button>

              <div className="flex flex-col items-center">
                <button
                  onClick={() => {
                    if (!isRecording) {
                      setIsRecording(true)
                      setTimeout(() => {
                        setIsRecording(false)
                        handleStartEvolution("Make the header red and add a contact button")
                      }, 3000)
                    } else {
                      setIsRecording(false)
                    }
                  }}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                    isRecording 
                      ? 'bg-red-500 hover:bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-pulse' 
                      : 'bg-[#1A1917] dark:bg-white text-white dark:text-[#1A1917] hover:scale-105 shadow-md'
                  }`}
                >
                  {isRecording ? <StopCircle className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5" />}
                </button>
              </div>

              <button 
                onClick={() => setInputMode('text')}
                className="p-2.5 text-[#6B6560] dark:text-[#9E9890] hover:text-[#E8601A] hover:bg-[#F5F4F0] dark:hover:bg-white/5 rounded-full transition-all"
                title="Type message"
              >
                <Keyboard className="w-5 h-5" />
              </button>
            </motion.div>
          ) : (
            <motion.div 
              key="text"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center gap-2"
            >
              <button 
                onClick={() => setInputMode('voice')}
                className="p-2 text-[#6B6560] dark:text-[#9E9890] hover:text-[#E8601A] transition-colors rounded-full hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
              >
                <Mic className="w-5 h-5" />
              </button>
              
              <input 
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStartEvolution(textInput)}
                placeholder={language === 'hi' ? 'क्या बदलाव करें?' : 'Ask Maya...'}
                className="flex-1 bg-transparent border-none outline-none text-sm text-[#1A1917] dark:text-white placeholder:text-[#9E9890]"
                disabled={isProcessing}
                autoFocus
              />
              
              <button 
                onClick={() => handleStartEvolution(textInput)}
                disabled={!textInput.trim() || isProcessing}
                className={`p-2 rounded-full transition-all shrink-0 ${
                  textInput.trim() && !isProcessing
                    ? 'bg-[#1A1917] dark:bg-white text-white dark:text-[#1A1917] hover:bg-[#E8601A] dark:hover:bg-[#E8601A] dark:hover:text-white' 
                    : 'bg-black/5 dark:bg-white/10 text-[#9E9890] cursor-not-allowed'
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
