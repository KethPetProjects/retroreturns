export function ErrorState({ message }: { message: string }) {
  return (
    <div className="card border-loss-500/40 bg-loss-500/10 p-4 text-sm text-loss-400">
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1 text-loss-400/90">{message}</p>
    </div>
  );
}
