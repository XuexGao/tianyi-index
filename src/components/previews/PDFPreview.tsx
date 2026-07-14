import { useRouter } from 'next/router'
import { getBaseUrl } from '../../utils/getBaseUrl'
import { resolveDrive, normalizeDrive } from '../../utils/driveResolver'
import { getStoredToken } from '../../utils/protectedRouteHandler'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer } from './Containers'

const PDFEmbedPreview: React.FC<{ file: any }> = ({ file }) => {
  const { asPath } = useRouter()
  const { apiBase, relPath, drive } = resolveDrive(asPath)
  const backendPath = relPath === '' ? '/' : relPath
  const hashedToken = getStoredToken(backendPath, normalizeDrive(drive))

  const pdfPath = encodeURIComponent(
    `${getBaseUrl()}${apiBase}/raw/?path=${backendPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`
  )
  const url = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${pdfPath}`

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
