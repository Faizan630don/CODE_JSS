import { motion } from 'framer-motion'

export function ScreenFlash({ active }) {
  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-[99] bg-[#00ff44]"
      initial={{ opacity: 0 }}
      animate={{ opacity: active ? 0.12 : 0 }}
      transition={{ 
        duration: active ? 0.05 : 0.25, 
        ease: "easeOut"
      }}
    />
  )
}
