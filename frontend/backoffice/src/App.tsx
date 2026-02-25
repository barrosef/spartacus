import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "./lib/firebase";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = () => signInWithPopup(auth, googleProvider);
  const logout = () => signOut(auth);

  if (loading) return <p>Carregando...</p>;

  if (!user) {
    return (
      <div>
        <h1>Spartacus Backoffice</h1>
        <button onClick={login}>Entrar com Google</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Spartacus Backoffice</h1>
      <p>Olá, {user.displayName}</p>
      <button onClick={logout}>Sair</button>
    </div>
  );
}
