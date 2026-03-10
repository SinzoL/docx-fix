/**
 * AI 对话面板组件
 *
 * 在检查报告页面右侧弹出的对话面板。
 * 用户可以针对检查结果提问，AI 基于报告上下文给出流式回答。
 * 支持多轮对话和 Markdown 渲染。
 */

import { useState, useRef, useEffect, useCallback } from "react";
import Markdown from "react-markdown";
import { Drawer, Input } from "tdesign-react";
import { fetchSSE } from "../services/sse";
import type { CheckReport } from "../types";
import { SvgIcon } from "./icons/SvgIcon";

interface AiChatPanelProps {
  /** 是否可见 */
  visible: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 检查报告上下文 */
  report: CheckReport;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

export default function AiChatPanel({
  visible,
  onClose,
  report,
}: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 关闭时取消进行中的请求
  useEffect(() => {
    if (!visible) {
      abortRef.current?.abort();
    }
  }, [visible]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    // 添加用户消息
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    // 添加空的 AI 消息占位
    const aiMsg: ChatMessage = { role: "assistant", content: "", streaming: true };
    setMessages([...newMessages, aiMsg]);

    // 取消之前的请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // 构建发送给后端的消息（不含 streaming 标记）
    const apiMessages = newMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    await fetchSSE("/api/ai/chat", {
      body: {
        session_id: report.session_id,
        messages: apiMessages,
        // 只在首次发送检查报告上下文（节省 token）
        check_report: messages.length === 0 ? report : undefined,
      },
      onToken: (token) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + token,
            };
          }
          return updated;
        });
      },
      onDone: () => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = { ...last, streaming: false };
          }
          return updated;
        });
        setIsLoading(false);
      },
      onError: (err) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: `AI 暂不可用：${err || "请稍后再试"}`,
              streaming: false,
            };
          }
          return updated;
        });
        setIsLoading(false);
      },
      signal: controller.signal,
    });
  }, [input, isLoading, messages, report]);

  const handleKeyDown = useCallback(
    (_value: string, context: { e: React.KeyboardEvent<HTMLDivElement> }) => {
      if (context.e.key === "Enter" && !context.e.shiftKey) {
        context.e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <Drawer
      visible={visible}
      onClose={onClose}
      header={<span className="flex items-center gap-2"><SvgIcon name="message-circle" size={18} /> AI 格式问答</span>}
      size="medium"
      footer={false}
    >
      <div className="flex flex-col h-full" style={{ height: "calc(100vh - 120px)" }}>
        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {/* 欢迎消息 */}
          {messages.length === 0 && (
            <div className="text-center py-8">
              <p className="text-4xl mb-3"><SvgIcon name="bot" size={48} /></p>
              <p className="text-gray-600 text-sm">
                我是你的文档格式助手，可以回答关于检查报告的问题。
              </p>
              <p className="text-gray-400 text-xs mt-2">
                试试问：为什么标题编号显示不正确？
              </p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {[
                  "这份报告的主要问题是什么？",
                  "如何修复字体不一致的问题？",
                  "行距应该设置为多少？",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setInput(q);
                    }}
                    className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 cursor-pointer transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 对话消息 */}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
                  msg.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none">
                    <Markdown>{msg.content || " "}</Markdown>
                    {msg.streaming && (
                      <span className="inline-block w-1.5 h-4 bg-blue-400 animate-pulse ml-0.5 align-text-bottom" />
                    )}
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 */}
        <div className="border-t border-gray-200 pt-3 mt-auto">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(val) => setInput(val as string)}
              onKeydown={handleKeyDown}
              placeholder={isLoading ? "AI 正在回答..." : "输入你的问题..."}
              disabled={isLoading}
              clearable
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
                !input.trim() || isLoading
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-blue-500 text-white hover:bg-blue-600 cursor-pointer"
              }`}
            >
              {isLoading ? "..." : "发送"}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            AI 基于检查报告上下文回答，仅供参考
          </p>
        </div>
      </div>
    </Drawer>
  );
}
