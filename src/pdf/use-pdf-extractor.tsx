import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import type { PdfPage } from '@/core/types';

import html from './extractor-html';

export type ExtractResult =
  | { ok: true; pages: PdfPage[] }
  | { ok: false; password: 'needed' | 'incorrect' }
  | { ok: false; error: string };

type Pending = { resolve: (r: ExtractResult) => void };

/**
 * Runs pdf.js inside a hidden, fully offline WebView (works in Expo Go).
 * Render `element` somewhere in the tree, then call `extract(base64, password?)`.
 */
export function usePdfExtractor() {
  const webview = useRef<WebView>(null);
  const [ready] = useState(createDeferred);
  const pending = useRef(new Map<string, Pending>());
  const seq = useRef(0);

  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const p of map.values()) p.resolve({ ok: false, error: 'Extractor closed' });
      map.clear();
    };
  }, []);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: { type: string; id?: string } & Record<string, unknown>;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      ready.resolve();
      return;
    }
    if (msg.type === 'result' && msg.id) {
      const { type: _t, id, ...result } = msg;
      pending.current.get(id)?.resolve(result as ExtractResult);
      pending.current.delete(id);
    }
  }, [ready]);

  const extract = useCallback(async (base64: string, password?: string): Promise<ExtractResult> => {
    await ready.promise;
    const id = String(++seq.current);
    return new Promise<ExtractResult>((resolve) => {
      pending.current.set(id, { resolve });
      webview.current?.postMessage(JSON.stringify({ type: 'extract', id, base64, password }));
    });
  }, [ready]);

  const element = (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webview}
        source={{ html }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
      />
    </View>
  );

  return { element, extract };
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
