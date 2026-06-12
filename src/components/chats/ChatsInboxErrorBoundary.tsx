"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export default class ChatsInboxErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("chats_inbox_render_error", error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-6 text-center text-white">
        <div>
          <h1 className="text-2xl font-black">No se pudieron cargar los chats</h1>
          <p className="mt-3 text-sm font-semibold text-white/45">
            Recargá para intentar de nuevo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-white px-6 py-3 text-base font-black text-black"
        >
          Recargar
        </button>
      </main>
    );
  }
}
