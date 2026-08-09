import React, { useState, useRef } from 'react';
import {
  StyleSheet, View, ActivityIndicator, Text,
  TouchableOpacity, BackHandler, StatusBar, Platform, RefreshControl, ScrollView
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

// ── Тохиргоо ───────────────────────────────────────────
// Tailscale IP: ямар ч төхөөрөмжөөс холбогдож болно (Tailscale сүлжээнд байрлах)
const SERVER_IP   = process.env.EXPO_PUBLIC_SERVER_IP || '100.107.239.48';
const SERVER_PORT = process.env.EXPO_PUBLIC_SERVER_PORT || '5173';
const TARGET_URL  = `http://${SERVER_IP}:${SERVER_PORT}`;

export default function App() {
  const webRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [canGoBack, setCanGoBack] = useState(false);

  // Android back button → WebView-д "буцах" гэж ажиллана
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBack = () => {
      if (canGoBack && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [canGoBack]);

  const reload = () => {
    setError(null);
    setLoading(true);
    webRef.current?.reload();
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        {error ? (
          <ErrorView url={TARGET_URL} message={error} onRetry={reload} />
        ) : (
          <>
            <WebView
              ref={webRef}
              source={{ uri: TARGET_URL }}
              style={styles.webview}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onError={(e) => {
                setError(e.nativeEvent?.description || 'Холбогдож чадсангүй');
                setLoading(false);
              }}
              onHttpError={(e) => {
                const code = e.nativeEvent?.statusCode;
                if (code && code >= 500) {
                  setError(`Сервер алдаа (HTTP ${code})`);
                  setLoading(false);
                }
              }}
              onNavigationStateChange={(nav) => setCanGoBack(nav.canGoBack)}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              thirdPartyCookiesEnabled
              mixedContentMode="always"
              allowsBackForwardNavigationGestures
              setBuiltInZoomControls={false}
              scalesPageToFit={Platform.OS === 'android'}
              pullToRefreshEnabled
              cacheEnabled
              sharedCookiesEnabled
              userAgent={Platform.OS === 'ios'
                ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LaundryPOS/1.0'
                : undefined}
            />
            {loading && (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingText}>Уншиж байна...</Text>
              </View>
            )}
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function ErrorView({ url, message, onRetry }) {
  return (
    <ScrollView
      contentContainerStyle={styles.errorBox}
      refreshControl={<RefreshControl refreshing={false} onRefresh={onRetry} />}
    >
      <Text style={styles.errorEmoji}>🔌</Text>
      <Text style={styles.errorTitle}>Серверт холбогдож чадсангүй</Text>
      <Text style={styles.errorMsg}>{message}</Text>
      <Text style={styles.errorUrl}>{url}</Text>
      <Text style={styles.errorHint}>
        • Tailscale идэвхтэй эсэхийг шалгана уу{'\n'}
        • Сервер (Run.bat) ажиллаж байна уу{'\n'}
        • Гар утас болон компьютер нэг Tailscale сүлжээнд байна уу
      </Text>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryBtnText}>Дахин оролдох</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  webview:   { flex: 1, backgroundColor: '#ffffff' },
  loadingOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingText: { color: '#6b7280', fontSize: 14, marginTop: 12 },
  errorBox: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    padding: 24, backgroundColor: '#ffffff',
  },
  errorEmoji: { fontSize: 56, marginBottom: 16 },
  errorTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
  errorMsg:   { fontSize: 14, color: '#ef4444', marginBottom: 8, textAlign: 'center' },
  errorUrl:   { fontSize: 12, color: '#6b7280', fontFamily: 'monospace', marginBottom: 16 },
  errorHint:  { fontSize: 13, color: '#6b7280', lineHeight: 20, marginBottom: 24, textAlign: 'left' },
  retryBtn:   { backgroundColor: '#3b82f6', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
});
