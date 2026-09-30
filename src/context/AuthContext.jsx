import { createContext, useContext, useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db, USERS_COLLECTION } from "../firebase";

const AuthContext = createContext(null);
const SESSION_KEY = "dhlex_session";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
    setReady(true);
  }, []);

  async function login(email, password) {
    const normalizedEmail = email.trim().toLowerCase();
    const usersRef = collection(db, USERS_COLLECTION);
    const q = query(usersRef, where("email", "==", normalizedEmail));
    const snap = await getDocs(q);

    if (snap.empty) {
      throw new Error("No account found for that email.");
    }

    const docSnap = snap.docs[0];
    const data = docSnap.data();

    if (String(data.password) !== String(password)) {
      throw new Error("Incorrect password.");
    }

    const sessionUser = {
      id: docSnap.id,
      email: data.email,
      name: data.name || normalizedEmail.split("@")[0],
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    setUser(sessionUser);
    return sessionUser;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
