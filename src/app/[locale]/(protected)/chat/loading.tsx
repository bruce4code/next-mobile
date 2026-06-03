export default function ChatLoading() {
  return (
    <div
      className="flex items-center justify-center h-full opacity-0"
      style={{ animation: 'appear 0.2s ease-out 0.2s forwards' }}
    >
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
