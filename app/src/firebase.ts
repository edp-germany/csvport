import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyAkXf7QMTLpTR6GODC9LZ1MnbfQPs1k_C8",
  authDomain: "csvport.firebaseapp.com",
  projectId: "csvport",
  storageBucket: "csvport.firebasestorage.app",
  messagingSenderId: "85428194463",
  appId: "1:85428194463:web:862a91602c99b98486a6aa"
};

export const firebaseApp = initializeApp(firebaseConfig);
