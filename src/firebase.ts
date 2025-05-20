import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';


const firebaseConfig = {
  apiKey: "AIzaSyAqFpiSBweLDRHxO9-UFCcUgdIOkZuHKjI",
  authDomain: "cosmic-symphony-99931.firebaseapp.com",
  projectId: "cosmic-symphony-99931",
  storageBucket: "cosmic-symphony-99931.firebasestorage.app",
  messagingSenderId: "973903329699",
  appId: "1:973903329699:web:0dabca4a1e135d43f08216",
  databaseURL: "https://cosmic-symphony-99931-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);