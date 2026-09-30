import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD4RLn6hmQo34Zwg1HmPSijkN4zX1RRNpc",
  authDomain: "vilcarterp-7ae7f.firebaseapp.com",
  projectId: "vilcarterp-7ae7f",
  storageBucket: "vilcarterp-7ae7f.appspot.com",
  messagingSenderId: "89284880347",
  appId: "1:89284880347:web:4cfc9dd4cf791bd84469fe",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Collection names — matches what's already in your Firestore
export const USERS_COLLECTION = "dhlExpressUsers";
export const UPLOADS_COLLECTION = "salaryUploads";