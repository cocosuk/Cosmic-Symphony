import React, { useState, useEffect, useRef } from 'react';
import { julian, sidereal, sexa } from 'astronomia';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, onAuthStateChanged, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { ref, push, set, get, child, remove } from 'firebase/database';
import { db, auth } from './firebase'; 
import { StopCircle } from 'lucide-react';
import ChatSupport from './ChatSupport';

import { 
  Music, Star, Sparkles, Loader2, Download, Pause, Play, 
  LocateFixed, User, X, LogIn, History, LogOut, Mail, Lock 
} from 'lucide-react';

declare global {
  interface Window {
    A: any;
    aladin: any;
    webkitAudioContext: any;
  }
}

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [starData, setStarData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Новые состояния для аутентификации
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [generationHistory, setGenerationHistory] = useState<Array<{
  id: string;
  date: string;
  starsCount: number;
  regionKey: string;
  stars: any[]; // 👈 Добавили массив звёзд
  }>>([]);

    
  const aladinDiv = useRef<HTMLDivElement>(null);
  const aladinInstance = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number>(0);
  const starsRef = useRef<any[]>([]);
  const regionKeyRef = useRef<string | null>(null);
  const [isAudioReady, setIsAudioReady] = useState(false);

  const activeOscillatorsRef = useRef<OscillatorNode[]>([]);
  const [musicStyle, setMusicStyle] = useState<'ambient' | 'classical' | 'spacewave' | 'experimental'>('ambient');


    useEffect(() => {
      // Установка персистентности
      setPersistence(auth, browserLocalPersistence)
        .then(() => {
          // Подписка на авторизацию
          const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setIsLoggedIn(!!user);

            if (user) {
              const snapshot = await get(ref(db, `users/${user.uid}/generations`));
              if (snapshot.exists()) {
                const data = snapshot.val();
                const historyArray = Object.entries(data).map(([id, value]: any) => ({
                  id,
                  ...value
                }));
                setGenerationHistory(historyArray.reverse());
              }
            }
          });

          return () => unsubscribe();
        })
        .catch((error) => {
          console.error('Persistence error:', error);
        });

      // Инициализация Aladin
      if (aladinDiv.current && window.A && !aladinInstance.current) {
        aladinInstance.current = window.A.aladin(aladinDiv.current, {
          target: '0 0',
          fov: 1.0,
          survey: 'P/DSS2/color',
          showReticle: true,
          reticleColor: '#aa00ff',
          showTarget: false,      // ⛔ скрыть целевую координату
          showMousePosition: true, // ✅ оставить только курсор
          showZoomControl: true,   // если нужно
        });
      }

      return () => {
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }
        cancelAnimationFrame(animationFrameRef.current);
      };
    }, []);

  // Нормализация координат
  const normalizeRA = (ra: number) => ((ra % 360) + 360) % 360;
  const normalizeDec = (dec: number) => Math.max(-90, Math.min(90, dec));

  const getCacheKey = (ra1: number, dec1: number, ra2: number, dec2: number) => {
  const rounded = (n: number) => n.toFixed(2);
  return `stars_${rounded(ra1)}_${rounded(dec1)}_${rounded(ra2)}_${rounded(dec2)}`;
};
  const getRegionKey = (ra1: number, dec1: number, ra2: number, dec2: number) => {
  const round = (n: number) => n.toFixed(2);
  return `region_${round(ra1)}_${round(dec1)}_${round(ra2)}_${round(dec2)}`;
};


  // Получение небесных координат по земным координатам и времени
  const getCelestialCoordinates = (lat: number, lng: number, date = new Date()) => {
    // Вычисляем Юлианскую дату вручную
    const jd = date.getTime() / 86400000 + 2440587.5; // UNIX timestamp → JD

    const gst = sidereal.mean(jd); // Гринвичское звёздное время
    const lst = (gst + lng / 15) % 24; // Местное звёздное время (в часах)

    const ra = (lst * 15 + 360) % 360; // RA в градусах
    const dec = lat; // Примерное приближение — широта = declination

    return {
      ra,
      dec
    };
  };



  // Определение местоположения пользователя
  const handleLocateMe = () => {
    setIsLoading(true);
    setError(null);
    
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });
          
          const { ra, dec } = getCelestialCoordinates(latitude, longitude);
          
          // Центрируем карту на текущей позиции
          if (aladinInstance.current) {
            aladinInstance.current.gotoRaDec(ra, dec);
            aladinInstance.current.setFov(5); // Устанавливаем поле зрения 30 градусов
            
            // Можно сразу запустить генерацию музыки
            await handleGenerateMusic();
          }
        } catch (error) {
          console.error('Error in geolocation:', error);
          setError('Failed to determine your position');
        } finally {
          setIsLoading(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        setError('Unable to retrieve your location. Please ensure you have granted location permissions.');
        setIsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Остановка всей музыки и очистка
  const stopAllAudio = () => {
    activeOscillatorsRef.current.forEach(osc => {
      try {
        osc.stop(); // ⛔ Прерываем проигрывание
      } catch (e) {}
    });
    activeOscillatorsRef.current = [];

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsPlaying(false);
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
    }
  };

  // Запрос к Gaia API через прокси
  const executeQuery = async (query: string) => {
    const gaiaUrl = new URL('https://gea.esac.esa.int/tap-server/tap/sync');
    gaiaUrl.searchParams.set('request', 'doQuery');
    gaiaUrl.searchParams.set('lang', 'adql');
    gaiaUrl.searchParams.set('format', 'json');
    gaiaUrl.searchParams.set('query', query);

    try {
      const proxyResponse = await fetch('http://localhost:3000/proxy?url=' + encodeURIComponent(gaiaUrl.toString()));
      if (!proxyResponse.ok) {
        throw new Error(`Proxy server error: ${proxyResponse.status}`);
      }
      const data = await proxyResponse.json();
      if (data.error) {
        throw new Error(data.error);
      }
      return data.data || [];
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch data');
      return [];
    }
  };

  // Получение звезд в заданной области
  const getStarsInArea = async (ra1: number, dec1: number, ra2: number, dec2: number) => {
  const cacheKey = getCacheKey(ra1, dec1, ra2, dec2);
  const cached = localStorage.getItem(cacheKey);

  if (cached) {
    try {
      const stars = JSON.parse(cached);
      console.log('[CACHE] Loaded stars from localStorage');
      return stars;
    } catch (e) {
      console.warn('[CACHE] Failed to parse cached data', e);
    }
  }

  // Если нет кэша — делаем запрос
  const query = `
    SELECT TOP 150 ra, dec, phot_g_mean_mag, bp_rp
    FROM gaiadr3.gaia_source
    WHERE (
      (ra BETWEEN ${ra1} AND ${ra2} AND dec BETWEEN ${dec1} AND ${dec2})
      OR
      (ra BETWEEN ${ra1} AND 360 AND dec BETWEEN ${dec1} AND ${dec2})
      OR
      (ra BETWEEN 0 AND ${ra2} AND dec BETWEEN ${dec1} AND ${dec2})
    )
    AND phot_g_mean_mag < 15
    ORDER BY phot_g_mean_mag ASC
  `;

  const stars = await executeQuery(query);
  if (stars.length > 0) {
    localStorage.setItem(cacheKey, JSON.stringify(stars));
    console.log('[CACHE] Saved stars to localStorage');
  }

  return stars;
};

const saveGenerationToDB = async (stars: any[], regionKey: string) => {
  const user = auth.currentUser;
  if (!user) return;

  const userRef = ref(db, `users/${user.uid}/generations`);
  const snapshot = await get(userRef);
  const existing = snapshot.exists() ? snapshot.val() : {};

  // Проверка на дубликат по ключу области неба
  const alreadyExists = Object.values(existing).some((entry: any) => entry.regionKey === regionKey);
  if (alreadyExists) {
    console.log('[DB] Duplicate region, skipping save');
    return;
  }

  const newRef = push(userRef);
  await set(newRef, {
    date: new Date().toISOString(),
    starsCount: stars.length,
    stars,
    regionKey
  });
};

  // Генерация музыки из данных звезд
  const generateMusicFromStars = async (stars: any[]) => {
    const style = musicStyle;
    stopAllAudio(); // Останавливаем предыдущую музыку
    setAudioUrl(null);
    setIsAudioReady(false);
    setIsLoading(true); 
    audioChunksRef.current = []; // Очищаем предыдущие записи
    starsRef.current = stars;

    if (!stars.length) {
      setError('No stars found in selected area');
      return null;
    }

    try {
      // Создаём новый аудиоконтекст
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Начинаем запись сразу
      const dest = audioContext.createMediaStreamDestination();
      const mediaRecorder = new MediaRecorder(dest.stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(audioBlob);

        setAudioUrl(url); // ← для повторного воспроизведения
        setIsAudioReady(true);
        setIsPlaying(false);
        setIsLoading(false); 

        const regionKey = regionKeyRef.current;
        if (regionKey && starsRef.current.length > 0) {
          saveGenerationToDB(starsRef.current, regionKey);
        }
      };

      mediaRecorder.start();
      // Пока ничего не устанавливаем — дождёмся нормального файла
      setAudioUrl(null); // или очистка, если была предыдущая мелодия
      setIsAudioReady(false);


      // Создаём эффекты
      const reverb = audioContext.createConvolver();
      const delay = audioContext.createDelay(3.0);
      delay.delayTime.value = 0.8;
      const gainMaster = audioContext.createGain();
      gainMaster.gain.value = 0.6;

      // Подключаем эффекты
      delay.connect(gainMaster);
      reverb.connect(gainMaster);
      gainMaster.connect(audioContext.destination);
      gainMaster.connect(dest);

      // Создаём ноты
      const now = audioContext.currentTime;
      const sortedStars = [...stars].sort((a, b) => a[0] - b[0]);

      sortedStars.forEach((star, index) => {
        const [ra, dec, mag, bp_rp] = star;
        
        const time = now + index * (style === 'classical' ? 0.25 : style === 'ambient' ? 0.5 : 0.15);

        // Частота
        let frequency = 80 + (dec + 90) * 2.5;
        if (style === 'classical') {
          const note = [0, 2, 4, 5, 7, 9, 11][index % 7];
          frequency = 220 * Math.pow(2, note / 12);
        } else if (style === 'spacewave') {
          frequency *= 1.5 + Math.sin(index) * 0.2;
        } else if (style === 'experimental') {
          frequency *= Math.random() * 2;
        }

        // Длительность и громкость
        let duration = 1;
        let volume = 0.3;
        if (style === 'ambient') {
          duration = 3 + Math.random() * 2;
          volume = 0.1 + Math.random() * 0.2;
        } else if (style === 'classical') {
          duration = 0.6 + (1 - mag / 15) * 1.5;
          volume = 0.3 + (1 - mag / 15) * 0.4;
        } else if (style === 'spacewave') {
          duration = 1.2;
          volume = 0.2 + Math.random() * 0.4;
        } else if (style === 'experimental') {
          duration = 0.3 + Math.random() * 3;
          volume = Math.random();
        }

        // Панорама
        const pan = (ra / 360) * 2 - 1;

        // Инструмент
        let instrumentType: OscillatorType = 'sine';
        if (style === 'classical') {
          instrumentType = 'triangle';
        } else if (style === 'ambient') {
          instrumentType = 'sine';
        } else if (style === 'spacewave') {
          instrumentType = 'square';
        } else if (style === 'experimental') {
          instrumentType = ['sine', 'triangle', 'square', 'sawtooth'][index % 4] as OscillatorType;
        }

        
        // Создаём осциллятор
        const oscillator = audioContext.createOscillator();
        oscillator.type = instrumentType;
        oscillator.frequency.value = frequency;
        
        // Панорамирование
        const panner = audioContext.createStereoPanner();
        panner.pan.value = pan;
        
        // Огибающая амплитуды
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(0.001, time);
        gainNode.gain.exponentialRampToValueAtTime(volume, time + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
        
        // Подключение
        oscillator.connect(panner);
        panner.connect(gainNode);
        gainNode.connect(delay);
        gainNode.connect(reverb);
        
        oscillator.start(time);
        oscillator.stop(time + duration);

        activeOscillatorsRef.current.push(oscillator);
      });

      // Останавливаем запись после завершения всех нот
      setTimeout(() => {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
      }, sortedStars.length * 150 + 3000);

      return audioContext;
    } catch (error) {
      console.error('Audio generation error:', error);
      setError('Failed to generate audio');
      return null;
    }
  };

  // Обработчик генерации музыки
  const handleGenerateMusic = async () => {
  if (!isLoggedIn) {
    setIsAuthModalOpen(true);
    return;
  }

  if (!aladinInstance.current) return;

  setIsLoading(true);
  setError(null);

  try {
    const center = aladinInstance.current.getRaDec();
    const fov = aladinInstance.current.getFov()[0];

    const ra1 = normalizeRA(center[0] - fov / 2);
    const ra2 = normalizeRA(center[0] + fov / 2);
    const dec1 = normalizeDec(center[1] - fov / 2);
    const dec2 = normalizeDec(center[1] + fov / 2);

    const stars = await getStarsInArea(ra1, dec1, ra2, dec2);
    setStarData(stars);
    const context = await generateMusicFromStars(stars);

    // Генерация regionKey
    const regionKey = getRegionKey(ra1, dec1, ra2, dec2);
    regionKeyRef.current = regionKey;

    // Сохраняем в Firebase (если музыка сгенерирована)
    if (context) {
      await saveGenerationToDB(stars, regionKey);
    }

    // Обновляем локальную историю
    setGenerationHistory(prev => [{
      id: `${Date.now()}`,
      date: new Date().toISOString(),
      starsCount: stars.length,
      regionKey,
      stars
    }, ...prev.filter(h => h.regionKey !== regionKey)].slice(0, 10));

  } catch (error) {
    console.error('Error generating music:', error);
    setError(error instanceof Error ? error.message : 'Failed to generate music');
  } finally {
    setIsLoading(false);
  }
};

    


  useEffect(() => {
  const fetchHistory = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const snapshot = await get(ref(db, `users/${user.uid}/generations`));
    if (snapshot.exists()) {
      const data = snapshot.val();
      const historyArray = Object.entries(data).map(([id, value]: any) => ({
        id,
        ...value
      }));
      setGenerationHistory(historyArray.reverse()); // последние в начало
    }
  };

  if (isLoggedIn) fetchHistory();
}, [isLoggedIn]);


  // Управление воспроизведением
  const togglePlayPause = () => {
    const audio = audioElementRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }

    setIsPlaying(!isPlaying);
  };

    const handlePlayFromHistory = async (stars: any[]) => {
      stopAllAudio();
      await generateMusicFromStars(stars); // воспроизводим в реальном времени
    };



  // Скачивание аудио
  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `stellar-symphony-${new Date().toISOString().slice(0, 10)}.wav`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 100);
  };

  // Визуализация аудио
  useEffect(() => {
    if (!audioElementRef.current || !starData.length) return;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaElementSource(audioElementRef.current);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    analyser.fftSize = 256;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const canvas = document.createElement('canvas');
    const container = document.querySelector('.audio-visualization-container');
    if (container) {
      container.innerHTML = '';
      container.appendChild(canvas);
      
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      const ctx = canvas.getContext('2d');

      const draw = () => {
        animationFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Рисуем визуализацию
          const barWidth = (canvas.width / bufferLength) * 2.5;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height;
            const hue = (i / bufferLength) * 360;
            
            ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.7)`;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
          }
        }
      };

      draw();
    }

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [audioUrl, starData]);

  // Функции аутентификации
  const handleLogin = async (email: string, password: string) => {
  try {
    const persistenceType = rememberMe
      ? browserLocalPersistence
      : browserSessionPersistence;

    await setPersistence(auth, persistenceType);

    if (authMode === 'login') {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
    }
    
    if (authMode === 'register') {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const nameInput = (document.querySelector('input[name="name"]') as HTMLInputElement)?.value;

      if (nameInput) {
        await updateProfile(userCredential.user, {
          displayName: nameInput,
        });
      }
    }

    setIsLoggedIn(true);
    setIsAuthModalOpen(false);
  } catch (error: any) {
    console.error('Auth error:', error.message);
    setError(error.message);
  }
};


  const handleLogout = () => {
      signOut(auth)
      .then(() => setIsLoggedIn(false))
      .catch((error) => console.error('Logout error:', error));
      setIsSidebarOpen(false);
    };

    const handleDeleteHistoryItem = async (itemId: string) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      await remove(ref(db, `users/${user.uid}/generations/${itemId}`));
      setGenerationHistory(prev => prev.filter(item => item.id !== itemId));
    } catch (err) {
      console.error('Failed to delete history item:', err);
      setError('Не удалось удалить запись');
    }
  };

  const handleSaveDisplayName = async () => {
    if (!auth.currentUser) return;

    try {
      await updateProfile(auth.currentUser, {
        displayName: nameInput.trim() || "Без имени"
      });

      setIsEditingName(false);
    } catch (err) {
      console.error("Ошибка при обновлении имени:", err);
    }
  };

  const [rememberMe, setRememberMe] = useState(true);
  const [savedEmail, setSavedEmail] = useState('');
  const [savedPassword, setSavedPassword] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(auth.currentUser?.displayName || '');

  useEffect(() => {
    const email = localStorage.getItem('rememberedEmail');
    const password = localStorage.getItem('rememberedPassword');
    if (email) setSavedEmail(email);
    if (password) setSavedPassword(password);
  }, []);


  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0B1026] to-[#2B0548] text-white">
      {/* Navigation с кнопкой входа/профиля */}
      <nav className="bg-black/20 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Music className="h-8 w-8 text-purple-400" />
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                Cosmic Symphony
              </h1>
            </div>
            
            {isLoggedIn ? (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <User className="h-5 w-5" />
              </button>
            ) : (
              <button 
                onClick={() => setIsAuthModalOpen(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg"
              >
                Войти
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Модальное окно авторизации */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B1026] rounded-xl border border-white/10 w-full max-w-md relative">
            <button onClick={() => setIsAuthModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
              <X size={24} />
            </button>
            
            <div className="p-6">
              <div className="flex items-center gap-2 mb-6">
                <LogIn className="text-purple-400" size={24} />
                <h3 className="text-xl font-bold">{authMode === 'login' ? 'Вход' : 'Регистрация'}</h3>
              </div>
              
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const email = (e.currentTarget.elements.namedItem('email') as HTMLInputElement)?.value;
                  const password = (e.currentTarget.elements.namedItem('password') as HTMLInputElement)?.value;

                  if (rememberMe) {
                    localStorage.setItem('rememberedEmail', email);
                    localStorage.setItem('rememberedPassword', password);
                  } else {
                    localStorage.removeItem('rememberedEmail');
                    localStorage.removeItem('rememberedPassword');
                  }

                  handleLogin(email, password);
                }}
                className="space-y-4"
              >
                {authMode === 'register' && (
                  <div className="space-y-1">
                    <label className="text-sm text-gray-300">Имя</label>
                    <div className="flex items-center gap-2 bg-[#070B1C] rounded-lg px-3 py-2 border border-white/10">
                      <User size={18} className="text-gray-400" />
                      <input
                        type="text"
                        name="name"
                        className="bg-transparent w-full focus:outline-none"
                        placeholder="Ваше имя"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-sm text-gray-300">Email</label>
                  <div className="flex items-center gap-2 bg-[#070B1C] rounded-lg px-3 py-2 border border-white/10">
                    <Mail size={18} className="text-gray-400" />
                    <input
                      type="email"
                      name="email"
                      defaultValue={savedEmail}
                      className="bg-transparent w-full focus:outline-none"
                      placeholder="email@example.com"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm text-gray-300">Пароль</label>
                  <div className="flex items-center gap-2 bg-[#070B1C] rounded-lg px-3 py-2 border border-white/10">
                    <Lock size={18} className="text-gray-400" />
                    <input
                      type="password"
                      name="password"
                      defaultValue={savedPassword}
                      className="bg-transparent w-full focus:outline-none"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={() => setRememberMe(!rememberMe)}
                    className="accent-purple-600"
                    id="rememberMe"
                  />
                  <label htmlFor="rememberMe" className="text-sm text-gray-300">
                    Запомнить меня
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700 rounded-lg py-2 px-4 transition-colors"
                >
                  {authMode === 'login' ? 'Войти' : 'Зарегистрироваться'}
                </button>
              </form>

              
              <div className="mt-4 text-center text-sm text-gray-400">
                {authMode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}{' '}
                <button
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                  className="text-purple-400 hover:underline"
                >
                  {authMode === 'login' ? 'Создать' : 'Войти'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Сайдбар пользователя */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
          <div className="w-full max-w-xs bg-[#0B1026] border-l border-white/10 h-full flex flex-col">
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
              <h3 className="font-bold">Мой профиль</h3>
              <button onClick={() => setIsSidebarOpen(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="bg-purple-500/20 p-3 rounded-full">
                <User size={20} className="text-purple-400" />
              </div>
              <div className="flex flex-col">
                {isEditingName ? (
                  <>
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      className="bg-[#1B1E33] px-2 py-1 rounded-md text-sm text-white outline-none border border-white/10"
                    />
                    <div className="flex gap-1 mt-1">
                      <button
                        onClick={handleSaveDisplayName}
                        className="text-xs text-green-400 hover:underline"
                      >
                        Сохранить
                      </button>
                      <button
                        onClick={() => setIsEditingName(false)}
                        className="text-xs text-gray-400 hover:underline"
                      >
                        Отмена
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-white font-semibold text-sm">
                      {auth.currentUser?.displayName || "Имя не указано"}
                    </p>
                    <button
                      onClick={() => {
                        setIsEditingName(true);
                        setNameInput(auth.currentUser?.displayName || '');
                      }}
                      className="text-xs text-blue-400 hover:underline"
                    >
                      ✏ Изменить имя
                    </button>
                  </>
                )}

                <p className="text-xs text-gray-400 mt-1">
                  {auth.currentUser?.email || "Без почты"}
                </p>
              </div>
            </div>


            <div className="flex-1 overflow-y-auto p-4">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <History size={18} /> История генераций
            </h4>
            <div className="space-y-2">
              {generationHistory.map(item => (
                <div key={item.id} className="bg-[#070B1C] p-3 rounded-lg">
                  <p className="text-sm font-medium">{new Date(item.date).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">{item.starsCount} звёзд</p>

                  <div className="flex gap-2 mt-2 text-xs">
                  <button
                    onClick={() => handlePlayFromHistory(item.stars)}
                    className="text-purple-400 hover:underline"
                  >
                    ▶ Восстановить
                  </button>

                  <button
                    onClick={() => {
                      const json = JSON.stringify(item, null, 2);
                      const blob = new Blob([json], { type: 'application/json' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = `cosmic-entry-${item.id}.json`;
                      a.click();
                    }}
                    className="text-blue-400 hover:underline"
                  >
                    ⬇ JSON
                  </button>

                  <button
                    onClick={() => handleDeleteHistoryItem(item.id)}
                    className="text-red-400 hover:underline"
                  >
                    🗑 Удалить
                  </button>
                </div>
                </div>
              ))}

              {generationHistory.length === 0 && (
                <p className="text-gray-400 text-center py-4">Нет истории генераций</p>
              )}
            </div>
          </div>

            
            <div className="p-4 border-t border-white/10">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
              >
                <LogOut size={18} /> Выйти
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            Transform the Cosmos into
            <span className="block text-purple-400">Beautiful Music</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Experience the universe in a new way as we convert stellar data into unique musical compositions.
            Select a region of stars to begin your cosmic symphony.
          </p>
        </div>

        {/* Interactive Star Map */}
        <div className="bg-black/30 backdrop-blur-md rounded-2xl p-6 mb-12 border border-white/10">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-400" />
              Stellar Region Selection
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleLocateMe}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LocateFixed className="h-4 w-4" />
                )}
                Find Stars Above Me
              </button>
              <button
                onClick={handleGenerateMusic}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate Music
              </button>
            </div>
            <div className="flex gap-2 mb-4">
              {['ambient', 'classical', 'spacewave', 'experimental'].map((style) => (
                <button
                  key={style}
                  onClick={() => setMusicStyle(style as any)}
                  className={`px-3 py-1 rounded-md text-sm border transition ${
                    musicStyle === style
                      ? 'bg-purple-600 text-white border-purple-400'
                      : 'bg-transparent text-gray-400 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="relative mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200">
              <button
                onClick={() => setError(null)}
                className="absolute top-2 right-2 text-red-200 hover:text-white"
                aria-label="Закрыть"
              >
                <X size={16} />
              </button>
              <div className="pr-6">
                {error}
              </div>
            </div>
          )}


          {/* Aladin Lite Container */}
          <div 
            ref={aladinDiv} 
            className="aspect-video bg-[#070B1C] rounded-lg overflow-hidden relative"
            style={{ minHeight: '400px' }}
          />
        </div>

        {/* Data Visualization */}
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-black/30 backdrop-blur-md rounded-2xl p-6 border border-white/10">
            <h3 className="text-xl font-semibold mb-4">Stellar Properties</h3>
            <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
              {starData.map((star, index) => {
                const [ra, dec, mag, bp_rp] = star;
                const color = bp_rp !== null ? 
                  `hsl(${30 + (bp_rp || 0) * 30}, 80%, 60%)` : 
                  'var(--gray-400)';
                
                return (
                  <div key={index} className="bg-[#070B1C] rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <p className="text-sm">
                        <span className="font-mono">RA:</span> {ra.toFixed(4)}° | 
                        <span className="font-mono"> Dec:</span> {dec.toFixed(4)}°
                      </p>
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: color }}
                      />
                    </div>
                    <p className="text-xs mt-1 text-gray-400">
                      <span className="font-mono">Mag:</span> {mag.toFixed(2)} | 
                      <span className="font-mono"> B-R:</span> {bp_rp !== null ? bp_rp.toFixed(2) : 'N/A'}
                    </p>
                  </div>
                );
              })}
              {starData.length === 0 && (
                <p className="text-gray-400 text-center py-8">Select a region to view stellar data</p>
              )}
            </div>
          </div>

          <div className="bg-black/30 backdrop-blur-md rounded-2xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Cosmic Symphony</h3>
              <div className="flex gap-2">
                {isLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Генерация симфонии...
                  </div>
                )}
                  <button
                    onClick={stopAllAudio}
                    className="px-3 py-1 bg-red-600/30 hover:bg-red-600/50 rounded-lg flex items-center gap-1 text-sm border border-red-400/30 transition-colors"
                  >
                    <StopCircle className="h-3 w-3" />
                    Остановить
                  </button>

                {isAudioReady && (
                  <>
                    <button 
                      onClick={togglePlayPause}
                      className="px-3 py-1 bg-purple-600/30 hover:bg-purple-600/50 rounded-lg flex items-center gap-1 text-sm border border-purple-400/30 transition-colors"
                    >
                      {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      {isPlaying ? 'Stop' : 'Play'}
                    </button>

                    <button 
                      onClick={handleDownload}
                      className="px-3 py-1 bg-green-600/30 hover:bg-green-600/50 rounded-lg flex items-center gap-1 text-sm border border-green-400/30 transition-colors"
                    >
                      <Download className="h-3 w-3" />
                      Скачать
                    </button>
                  </>
                )}
              </div>
            </div>
            
            <div className="h-80 bg-[#070B1C] rounded-lg flex items-center justify-center relative overflow-hidden">
              {starData.length > 0 ? (
                <>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="audio-visualization-container w-full h-full"></div>
                  </div>
                  
                  {/* Визуализация звезд */}
                  {starsRef.current.map((star, index) => {
                    const [ra, dec, mag, bp_rp] = star;
                    const left = `${(index / starsRef.current.length) * 100}%`;
                    const top = `${((dec + 90) / 180) * 100}%`;
                    const size = `${6 + (1 - mag / 15) * 14}px`;
                    const hue = bp_rp !== null ? 30 + (bp_rp * 30) : 200;
                    const opacity = 0.5 + (1 - mag / 15) * 0.5;
                    
                    return (
                      <div 
                        key={index}
                        className="absolute rounded-full border border-white/10 transform -translate-x-1/2 -translate-y-1/2 animate-pulse"
                        style={{
                          left,
                          top,
                          width: size,
                          height: size,
                          opacity,
                          background: `hsla(${hue}, 80%, 60%, ${opacity})`,
                          boxShadow: `0 0 ${size} rgba(255, 255, 255, 0.1)`,
                          animationDelay: `${index * 0.03}s`,
                          animationDuration: `${1.5 + (1 - mag / 15) * 3}s`
                        }}
                      />
                    );
                  })}
                  
                  {/* Скрытый аудиоэлемент */}
                  {audioUrl && (
                    <audio
                    key={audioUrl} // 🔥 вот это важно!
                    ref={audioElementRef}
                    src={audioUrl || undefined}
                    onEnded={() => setIsPlaying(false)}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    hidden
                  />
                  )}
                </>
              ) : (
                <p className="text-gray-400">Select a region to generate music</p>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-black/20 backdrop-blur-lg border-t border-white/10 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-gray-400">
            Experience the harmony of the cosmos • {new Date().getFullYear()}
          </p>
        </div>
      </footer>
      {isLoggedIn && auth.currentUser?.email && (
        <ChatSupport email={auth.currentUser.email} />
      )}

    </div>
  );
}

export default App;