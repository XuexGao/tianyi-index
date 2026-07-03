import type { OdFileObject } from '../../types'

import { FC } from 'react'
import { useRouter } from 'next/router'
import { resolveDrive } from '../../utils/driveResolver'

import { PreviewContainer, DownloadBtnContainer } from './Containers'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { getStoredToken } from '../../utils/protectedRouteHandler'

const ImagePreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { asPath } = useRouter()
  const { apiBase, relPath, drive } = resolveDrive(asPath)
  const backendPath = relPath === '' ? '/' : relPath
  const hashedToken = getStoredToken(backendPath, drive)

  return (
    <>
      <PreviewContainer>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="mx-auto"
          src={`${apiBase}/raw/?path=${backendPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`}
          alt={file.name}
          width={file.image?.width}
          height={file.image?.height}
        />
      </PreviewContainer>
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </>
  )
}

export default ImagePreview
