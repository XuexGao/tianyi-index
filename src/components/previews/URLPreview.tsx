import { useRouter } from 'next/router'
import { resolveDrive } from '../../utils/driveResolver'
import { useTranslation } from 'next-i18next'

import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import { DownloadButton } from '../DownloadBtnGtoup'
import useFileContent from '../../utils/fetchOnMount'
import { DownloadBtnContainer, PreviewContainer } from './Containers'

const parseDotUrl = (content: string): string | undefined => {
  return content
    .split('\n')
    .find(line => line.startsWith('URL='))
    ?.split('=')[1]
}

/**
 * 安全打开 .url 文件中的链接：仅允许 http/https 协议。
 * 文件内容来自云盘，可能被构造为 javascript:/data: 等协议触发 XSS。
 */
const openSafeUrl = (raw: string | undefined) => {
  if (!raw) return
  try {
    const u = new URL(raw)
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      window.open(u.href)
    }
  } catch {
    // 非法 URL，忽略
  }
}

const TextPreview = ({ file }) => {
  const { asPath } = useRouter()
  const { apiBase, relPath } = resolveDrive(asPath)
  const backendPath = relPath === '' ? '/' : relPath
  const { t } = useTranslation()

  const { response: content, error, validating } = useFileContent(`${apiBase}/raw/?path=${backendPath}`, backendPath)
  if (error) {
    return (
      <PreviewContainer>
        <FourOhFour errorMsg={error} />
      </PreviewContainer>
    )
  }

  if (validating) {
    return (
      <PreviewContainer>
        <Loading loadingText={t('Loading file content...')} />
      </PreviewContainer>
    )
  }

  if (!content) {
    return (
      <PreviewContainer>
        <FourOhFour errorMsg={t('File is empty.')} />
      </PreviewContainer>
    )
  }

  return (
    <div>
      <PreviewContainer>
        <pre className="overflow-x-scroll p-0 text-sm md:p-3">{content}</pre>
      </PreviewContainer>
      <DownloadBtnContainer>
        <div className="flex justify-center">
          <DownloadButton
            onClickCallback={() => openSafeUrl(parseDotUrl(content))}
            btnColor="blue"
            btnText={t('Open URL')}
            btnIcon="external-link-alt"
            btnTitle={t('Open URL{{url}}', { url: ' ' + (parseDotUrl(content) ?? '') })}
          />
        </div>
      </DownloadBtnContainer>
    </div>
  )
}

export default TextPreview
