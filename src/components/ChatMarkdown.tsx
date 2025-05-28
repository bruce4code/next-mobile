import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
// import 'highlight.js/styles/github.css' // 可更换风格：atom-one-dark、vs、monokai 等
import 'highlight.js/styles/atom-one-dark.css' // 或其他主题
import './chat-markdown.css'

interface ChatMarkdownProps {
  content: string
}

const ChatMarkdown: React.FC<ChatMarkdownProps> = ({ content }) => {
  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      alert('复制成功！')
    })
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