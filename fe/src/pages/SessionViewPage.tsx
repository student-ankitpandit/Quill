import { DevinSessionPage } from "./SessionDesignPage";

// Keep older dashboard imports on the same chat-enabled session screen.
export default function SessionViewPage({ id }: { id: string }) {
  return <DevinSessionPage sessionId={id} />;
}
