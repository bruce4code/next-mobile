export default function ProtectedLoading() {
  return (
    <div
      className="flex items-center justify-center h-full bg-background/60 backdrop-blur-sm transition-all duration-300 opacity-0 scale-95"
      style={{ animation: 'appear 0.25s ease-out 0.2s forwards' }}
    >
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
