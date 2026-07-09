import { FC, CSSProperties, ReactNode, useState, useEffect, useRef } from 'react'
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

  // === 加载过渡动画状态机 ===
  // loading：毛玻璃容器 + Loading 文字（py-16，原来一半），测 loading 高度作为过渡起点
  // measuring：数据到了，渲染内容（opacity 0 不可见但占位），测内容真实高度
  // expanding：max-height 从 loading 高度 → 内容高度平滑过渡，Loading 淡出，内容淡入
  // done：过渡完成，正常显示
  //
  // 关键：maxH 始终是数字（不用 null/none），否则 max-height: none ↔ 数字之间无法 CSS 过渡。
  // loading 和 measuring 各测一次高度，保证"加载框比内容大"和"比内容小"两种情况都有动画。
  const [phase, setPhase] = useState<'loading' | 'measuring' | 'expanding' | 'done'>('loading')
  const [maxH, setMaxH] = useState<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const transitionedRef = useRef(false)

  // 新一次加载（validating 变 true）时回到 loading，maxH 归零触发重新测量
  useEffect(() => {
    if (validating) {
      transitionedRef.current = false
      setPhase('loading')
      setMaxH(0)
    }
  }, [validating])

  // loading 阶段：测量容器（此时只有 Loading 文字撑开）的实际高度，作为过渡起点
  useEffect(() => {
    if (phase === 'loading' && containerRef.current) {
      const measure = () => {
        if (containerRef.current && containerRef.current.scrollHeight > 0) {
          setMaxH(containerRef.current.scrollHeight)
        }
      }
      // 双 rAF：第一帧 React 提交 DOM，第二帧布局完成，测量才准确
      requestAnimationFrame(() => requestAnimationFrame(measure))
    }
  }, [phase])

  // 数据加载完成 → measuring：渲染内容层（opacity 0），下一帧测内容真实高度
  useEffect(() => {
    if (!validating && !transitionedRef.current) {
      transitionedRef.current = true
      setPhase('measuring')
    }
  }, [validating])

  // measuring 阶段：内容已渲染但不可见，测量容器此时（含内容）的实际高度，然后进入 expanding
  useEffect(() => {
    if (phase === 'measuring') {
      const measure = () => {
        if (containerRef.current) {
          setMaxH(containerRef.current.scrollHeight)
          setPhase('expanding')
        }
      }
      requestAnimationFrame(() => requestAnimationFrame(measure))
    }
  }, [phase])

  // expanding → done：等过渡动画完成后收尾
  useEffect(() => {
    if (phase === 'expanding') {
      const t = setTimeout(() => setPhase('done'), 900)
      return () => clearTimeout(t)
    }
  }, [phase])

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
  // opacity：loading=0 不可见；measuring=0 不可见（占位测高度）；expanding/done=1 淡入可见
  const markdownContent = (
    <div
      className="markdown-body"
      style={{
        opacity: phase === 'loading' || phase === 'measuring' ? 0 : 1,
        transition: 'opacity 0.5s ease',
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
