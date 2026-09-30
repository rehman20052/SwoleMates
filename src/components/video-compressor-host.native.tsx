import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import WebView from "react-native-webview";

import { bindCompressor, COMPRESSOR_HTML, handleCompressorMessage, markCompressorReset } from "@/lib/device-compress";

export function VideoCompressorHost() {
  const webview = useRef<WebView>(null);

  useEffect(() => {
    bindCompressor((code) => webview.current?.injectJavaScript(code));
    return () => {
      bindCompressor(null);
      markCompressorReset();
    };
  }, []);

  return (
    <View pointerEvents="none" collapsable={false} style={styles.hidden}>
      <WebView
        ref={webview}
        source={{ html: COMPRESSOR_HTML, baseUrl: "https://cdn.jsdelivr.net/" }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        allowFileAccess
        setSupportMultipleWindows={false}
        onMessage={(event) => handleCompressorMessage(event.nativeEvent.data)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    height: 2,
    left: 0,
    opacity: 0,
    position: "absolute",
    top: 0,
    width: 2,
  },
});
