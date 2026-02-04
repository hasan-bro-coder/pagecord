"use client";

import React, { useState } from "react";
import { auth, db, googleProvider } from "@/lib/firebase";
import { signInWithPopup } from "firebase/auth";
import { 
  doc, setDoc, getDoc, query, collection, where, getDocs 
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chrome, UserPlus, LogIn } from "lucide-react";

export default function AuthPage() {
  const [isLoginView, setIsLoginView] = useState(true); // Toggle state
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // --- SIGNUP FLOW (With Username Check) ---
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (username.length < 3) {
      setError("Username must be at least 3 characters.");
      setIsLoading(false);
      return;
    }

    try {
      // 1. Check uniqueness
      const q = query(collection(db, "users"), where("username", "==", username.toLowerCase()));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        setError("Username is already taken.");
        setIsLoading(false);
        return;
      }

      // 2. Auth
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // 3. Create profile
      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        username: username.toLowerCase(),
        createdAt: new Date(),
      });

      router.push("/me");
    } catch (err: any) {
      setError("Signup failed. Ensure you chose a Google account." + err);
      setIsLoading(false);
    }
  };

  // --- LOGIN FLOW (Direct Google Popup) ---
  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Check if they actually have a profile
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        setError("No account found with this Google email. Please Sign Up first.");
        setIsLoading(false);
        return;
      }

      router.push("/me");
    } catch (err) {
      setError("Login failed. " + err);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4">
      <div className="w-full max-w-sm space-y-8 p-8 bg-zinc-900 rounded-2xl border border-white/10 shadow-2xl transition-all">
        
        <div className="text-center">
          <p className="text-white text-xl mt-2">
            {isLoginView ? "Login" : "Signup"}
          </p>
        </div>

        {isLoginView ? (
          /* LOGIN VIEW */
          <div className="space-y-4">
            <Button 
              onClick={handleLogin}
              className="w-full bg-white text-black hover:bg-zinc-200 font-bold py-6"
              disabled={isLoading}
            >
              <Chrome className="mr-2 h-5 w-5" />
              Sign in with Google
            </Button>
            {error && <p className="text-red-500 text-xs text-center italic">{error}</p>}
          </div>
        ) : (
          /* SIGNUP VIEW */
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Input
                placeholder="pick_a_username"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                className="bg-black border-zinc-800 text-white"
                required
              />
              {error && <p className="text-red-500 text-xs italic">{error}</p>}
            </div>
            <Button type="submit" className="w-full bg-white text-black hover:bg-zinc-200 py-6 font-bold" disabled={isLoading}>
              {isLoading ? "Validating..." : (<><Chrome className="mr-2 h-5 w-5"/>Register with Google</>)}
            </Button>
          </form>
        )}

        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-zinc-800"></span></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-zinc-900 px-2 text-zinc-500">Or</span></div>
        </div>

        <button 
          onClick={() => { setIsLoginView(!isLoginView); setError(""); }}
          className="w-full text-zinc-400 hover:text-white text-sm transition-colors flex items-center justify-center gap-2"
        >
          {isLoginView ? (
            <><UserPlus className="w-4 h-4"/> Create an account? Sign up</>
          ) : (
            <><LogIn className="w-4 h-4"/> Already have an account? Log in</>
          )}
        </button>
      </div>
    </div>
  );
}