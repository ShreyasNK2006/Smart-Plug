// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';

// TODO: Replace with your Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyBkkzbB19VG6jCX51iUPoURNx5_QAXl_4U",
  authDomain: "smart-plug-3a975.firebaseapp.com",
  projectId: "smart-plug-3a975",
  storageBucket: "smart-plug-3a975.firebasestorage.app",
  messagingSenderId: "503574573431",
  appId: "1:503574573431:web:21dd65ca88a01195073172"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);
const auth = getAuth(app);

export { messaging, getToken, onMessage, auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut };
