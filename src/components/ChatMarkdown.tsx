import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
// import 'highlight.js/styles/github.css' // 可更换风格：atom-one-dark、vs、monokai 等
import 'highlight.js/styles/atom-one-dark.css' // 或其他主题
import './chat-markdown.css'
import { toast } from "sonner"

interface ChatMarkdownProps {
  content: string
}

const ChatMarkdown: React.FC<ChatMarkdownProps> = ({ content }) => {
  const handleCopy = (code: string) => {
    // 确保复制的是纯文本内容
    const textToCopy = typeof code === 'string' ? code : JSON.stringify(code, null, 2);
    navigator.clipboard.writeText(textToCopy).then(() => {
      toast.success("复制成功", {
        description: "代码已复制到剪贴板",
        duration: 2000,
      });
    }).catch(err => {
      console.error('复制失败:', err);
      toast.error("复制失败", {
        description: "请重试",
        duration: 2000,
      });
    });
  }
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        a: ({ node, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
        code: ({ node, inline, className, children, ...props }) => {
          const code = children ? String(children).replace(/\n$/, '') : '';
          return inline ? (
            <code className={className} {...props}>{children}</code>
          ) : (
            <pre className={className}>
              <button className="copy-btn" onClick={() => handleCopy(code)}>复制</button>
              <code {...props}>{children}</code>
            </pre>
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

export default ChatMarkdown
