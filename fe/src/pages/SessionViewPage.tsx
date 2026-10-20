import { RightSplitViewPage } from "./RightSplitView";

// Keep older dashboard imports on the same chat-enabled session screen.
export default function SessionViewPage({ id }: { id: string }) {
  return <RightSplitViewPage sessionId={id} />;
}
