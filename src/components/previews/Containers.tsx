export function PreviewContainer({ children }): JSX.Element {
  return (
    <div className="rounded-2xl p-3 shadow-sm"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}
    >
      {children}
    </div>
  )
}

export function DownloadBtnContainer({ children }): JSX.Element {
  return (
    <div
      className="sticky bottom-0 left-0 right-0 z-10 p-2"
    >
      {/* 内层卡片：有圆角、毛玻璃、与页面边缘留出间距 */}
      <div
        className="rounded-2xl border border-gray-900/10 p-2 shadow-sm dark:border-gray-500/30"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.55)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
