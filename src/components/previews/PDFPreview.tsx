import { useRouter } from 'next/router'
import type { OdFileObject } from '../../types'
import { getBaseUrl } from '../../utils/getBaseUrl'
import { resolveDrive, normalizeDrive } from '../../utils/driveResolver'
import { getStoredToken } from '../../utils/protectedRouteHandler'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer } from './Containers'

// PDF 查看器地址可配置：默认使用 mozilla 官方托管版本，
// 生产环境如需自托管或换源，通过 NEXT_PUBLIC_PDF_VIEWER_URL 配置
const PDF_VIEWER_URL = process.env.NEXT_PUBLIC_PDF_VIEWER_URL || 'https://mozilla.github.io/pdf.js/web/viewer.html'

const PDFEmbedPreview: React.FC<{ file: OdFileObject }> = ({ file }) => {
  const { asPath } = useRouter()
  const { apiBase, relPath, drive } = resolveDrive(asPath)
  const backendPath = relPath === '' ? '/' : relPath
  const hashedToken = getStoredToken(backendPath, normalizeDrive(drive))

  const pdfPath = encodeURIComponent(
    `${getBaseUrl()}${apiBase}/raw/?path=${backendPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`
  )
  const url = `${PDF_VIEWER_URL}?file=${pdfPath}`

  return (
    <div>
      <div className="w-full overflow-hidden rounded" style={{ height: '90vh' }}>
        <iframe src={url} frameBorder="0" width="100%" height="100%"></iframe>
      </div>
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </div>
  )
}

export default PDFEmbedPreview
