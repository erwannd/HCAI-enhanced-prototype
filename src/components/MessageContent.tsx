import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'

type MessageContentProps = {
  content: string
}

export function MessageContent({ content }: MessageContentProps) {
  const segments = content.split(/(\$\$[\s\S]+?\$\$)/g).filter(Boolean)

  return (
    <div className="message__body">
      {segments.map((segment, index) => {
        if (segment.startsWith('$$') && segment.endsWith('$$')) {
          return <BlockMath key={`${segment}-${index}`} math={segment.slice(2, -2).trim()} />
        }

        return (
          <ReactMarkdown key={`${segment}-${index}`} remarkPlugins={[remarkGfm]}>
            {segment}
          </ReactMarkdown>
        )
      })}
    </div>
  )
}
