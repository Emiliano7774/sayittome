import { initializeApp } from "firebase/app";

import {
  getAuth,
} from "firebase/auth";

import {
  getFirestore,
} from "firebase/firestore";

import {
  getStorage,
} from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk",
  authDomain: "sayittome-app.firebaseapp.com",
  projectId: "sayittome-app",
  storageBucket: "sayittome-app.firebasestorage.app",
  messagingSenderId: "676263895580",
  appId: "1:676263895580:web:2c7ffa7827c2a4799f35d9",
};

const app =
  initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db =
  getFirestore(app);

export const storage =
  getStorage(app);

export default app;
