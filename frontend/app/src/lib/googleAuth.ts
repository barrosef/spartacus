import { useEffect, useState } from "react";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { auth } from "./firebase";

// Registra o handler de redirect para o Expo Go / builds
try {
  WebBrowser.maybeCompleteAuthSession();
} catch {
  // Ignora erros de inicialização do WebBrowser
}

// IDs de cliente OAuth — configure em .env:
//   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
//   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "";

export function useGoogleSignIn(onSuccess?: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: WEB_CLIENT_ID,
    androidClientId: ANDROID_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === "success") {
      const idToken = response.params?.id_token ?? response.authentication?.idToken;
      if (!idToken) {
        setError("Não foi possível obter o token do Google.");
        setLoading(false);
        return;
      }
      const credential = GoogleAuthProvider.credential(idToken);
      setLoading(true);
      signInWithCredential(auth, credential)
        .then(() => onSuccess?.())
        .catch(() => setError("Falha ao autenticar com Google."))
        .finally(() => setLoading(false));
    } else if (response?.type === "error") {
      setError("Login com Google cancelado ou falhou.");
      setLoading(false);
    }
  }, [response]);

  function signIn() {
    setError(null);
    setLoading(true);
    promptAsync().catch(() => {
      setError("Não foi possível abrir o login do Google.");
      setLoading(false);
    });
  }

  return { signIn, loading, error, ready: !!request };
}
