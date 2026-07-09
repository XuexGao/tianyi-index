import { FC, CSSProperties, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import { useTranslation } from 'next-i18next'
import { LightAsync as SyntaxHighlighter } from 'react-syntax-highlighter'
import { tomorrowNight } from 'react-syntax-highlighter/dist/cjs/styles/hljs'

import 'katex/dist/katex.min.css'

import useFileContent from '../../utils/fetchOnMount'
import { useExpandTransition } from '../../utils/useExpandTransition'
import { useRouter } from 'next/router'
import { getApiBase } from '../../utils/driveResolver'
import FourOhFour from '../FourOhFour'
import { LoadingIcon } from '../Loading'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'

const MarkdownPreview: FC<{
  file: any
  path: string
  standalone?: boolean
}> = ({ file, path, standalone = true }) => {
  // The parent folder of the markdown file, which is also the relative image folder
  const parentPath = standalone ? path.substring(0, path.lastIndexOf('/')) : path
  const apiBase = getApiBase(useRouter().asPath)

  const { response: content, error, validating } = useFileContent(`${apiBase}/raw/?path=${parentPath}/${file.name}`, path)
  const { t } = useTranslation()

  // 加载展开过渡动画（loading → measuring → expanding → done）
  const { ref: containerRef, phase, maxH } = useExpandTransition(validating)

  // Check if the image is relative path instead of a absolute url
  const isUrlAbsolute = (url: string | string[]) => url.indexOf('://') > 0 || url.indexOf('//') === 0
  // Custom renderer:
  const customRenderer = {
    // img: to render images in markdown with relative file paths
    img: ({
      alt,
      src,
      title,
      width,
      height,
      style,
    }: {
      alt?: string
      src?: string
      title?: string
      width?: string | number
      height?: string | number
      style?: CSSProperties
    }) => {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt}
          src={isUrlAbsolute(src as string) ? src : `${apiBase}/?path=${parentPath}/${src}&raw=true`}
          title={title}
          width={width}
          height={height}
          style={style}
        />
      )
    },
    // code: to render code blocks with react-syntax-highlighter
    code({
      className,
      children,
      inline,
      ...props
    }: {
      className?: string | undefined
      children: ReactNode
      inline?: boolean
    }) {
      if (inline) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        )
      }

      const match = /language-(\w+)/.exec(className || '')
      return (
        <SyntaxHighlighter language={match ? match[1] : 'language-text'} style={tomorrowNight} PreTag="div" {...props}>
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      )
    },
  }

  if (error) {
    return (
      <PreviewContainer>
        <FourOhFour errorMsg={error} />
      </PreviewContainer>
    )
  }

  // markdown 内容渲染（measuring/expanding/done 共用）
  // opacity + scale：loading/measuring=0 不可见；expanding/done=1 淡入+缩放进入
  const markdownContent = (
    <div
      className="markdown-body"
      style={{
        opacity: phase === 'loading' || phase === 'measuring' ? 0 : 1,
        transform: phase === 'loading' || phase === 'measuring' ? 'scale(0.96)' : 'scale(1)',
        transformOrigin: 'top center',
        transition: 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Using rehypeRaw to render HTML inside Markdown is potentially dangerous, use under safe environments. (#18) */}
      <ReactMarkdown
        // @ts-ignore
        remarkPlugins={[remarkGfm, remarkMath]}
        // The type error is introduced by caniuse-lite upgrade.
        // Since type errors occur often in remark toolchain and the use is so common,
        // ignoring it shouleld be safe enough.
        // @ts-ignore
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={customRenderer}
      >
        {content}
      </ReactMarkdown>
    </div>
  )

  return (
    <div>
      {/* 毛玻璃容器：四个阶段共用，保证视觉连续。
          - loading/measuring/expanding：max-height 受控，平滑过渡
          - done：max-height 保持内容高度，不限制溢出 */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-2xl p-3 shadow-sm"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.45)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          maxHeight: `${maxH}px`,
          transition: 'max-height 0.9s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Loading 层：loading 占位撑开容器；measuring/expanding 时绝对定位淡出，给内容让出流式高度
            文字颜色用 text-gray-700 dark:text-gray-200，与文件列表保持一致 */}
        {phase !== 'done' && (
          <div
            className={`flex items-center justify-center py-16 text-sm text-gray-700 dark:text-gray-200 ${
              phase === 'measuring' || phase === 'expanding' ? 'absolute inset-0' : ''
            }`}
            style={{
              opacity: phase === 'loading' ? 1 : 0,
              transition: 'opacity 0.4s ease',
            }}
          >
            <LoadingIcon className="mr-3 h-5 w-5 animate-spin" />
            <span>{t('Loading file content...')}</span>
          </div>
        )}
        {/* 内容层：measuring 开始渲染（测高度），expanding 淡入，done 正常显示 */}
        {phase !== 'loading' && markdownContent}
      </div>
      {standalone && (
        <DownloadBtnContainer>
          <DownloadButtonGroup />
        </DownloadBtnContainer>
      )}
    </div>
  )
}

export default MarkdownPreview
