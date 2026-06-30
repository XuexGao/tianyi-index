import config from '../../config/site.config'

const Footer = () => {
  if (!config.footer) return null
  return (
    <div
      className="od-footer w-full border-t border-gray-900/10 p-4 text-center text-xs font-medium text-gray-400 dark:border-gray-500/30"
      dangerouslySetInnerHTML={{ __html: config.footer }}
    />
  )
}

export default Footer
