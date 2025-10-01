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

const extractText = (node: React.ReactNode): string => {
  if (node === null || node === undefined) {
    return ''
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map(extractText).join('')
  }

  if (React.isValidElement(node)) {
    return extractText(node.props.children)
  }

  return ''
}

const ChatMarkdown: React.FC<ChatMarkdownProps> = ({ content }) => {
  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
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
        p: ({ children, ...props }) => {
          const childArray = React.Children.toArray(children).filter(child => child !== '\n')

          if (
            childArray.length === 1 &&
            React.isValidElement(childArray[0]) &&
            childArray[0].type === 'pre'
          ) {
            return <>{childArray[0]}</>
          }

          return <p {...props}>{children}</p>
        },
        a: ({ node, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
        code: ({ node, inline, className, children, ...props }) => {
          const rawCode = extractText(children)
          const code = rawCode.replace(/\n$/, '')
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
