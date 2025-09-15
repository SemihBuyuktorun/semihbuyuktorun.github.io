// Basit durum makinesi: preloader -> intro (typewriter) -> cake
const preloader = document.getElementById('preloader');
const intro = document.getElementById('intro');
const typeEl = document.getElementById('typewriter');
const cakeScreen = document.getElementById('cake-screen');
const micHint = document.getElementById('mic-hint');
const micBtn = document.getElementById('mic-btn');
const debugEl = document.getElementById('debug');

// Kullanıcı ayarı: isim
const NAME = 'Aylin';
const MESSAGE = `Doğum Günün Kutlu olsun.\nİyiki Doğdun Arkadaşım 🧡`;

// Preloader kaldır
window.addEventListener('load', () => {
    setTimeout(() => preloader.classList.add('hide'), 500);
    // Typewriter başlat
    startTypewriter(MESSAGE, 55).then(() => {
        // 700ms bekle, sonra pasta ekranına geç
        setTimeout(() => switchToCake(), 700);
    });
});

function startTypewriter(text, speed = 60) {
    return new Promise(resolve => {
        let i = 0;
        typeEl.textContent = '';
        intro.classList.add('active');
        const interval = setInterval(() => {
            typeEl.textContent += text.charAt(i);
            i++;
            if (i >= text.length) {
                clearInterval(interval);
                resolve();
            }
        }, speed);
    });
}

function switchToCake() {
    intro.classList.remove('active');
    intro.setAttribute('aria-hidden', 'true');
    cakeScreen.classList.add('active');
    cakeScreen.removeAttribute('aria-hidden');
    // Kullanıcıya mikrofonu başlatması için butonu göster (iOS/izin/etkileşim gereksinimi için güvenli)
    micBtn.classList.remove('hidden');
    micHint.textContent = 'Mikrofonu başlatın, sonra üfleyin ✨';
    debugEl.classList.remove('hidden');
}

// Mumları yönet
const candles = Array.from(document.querySelectorAll('.candle'));
function extinguishCandles() {
    candles.forEach(c => {
        if (!c.classList.contains('out')) {
            c.classList.add('out');
            // puff animasyonu tetikle: smoke içindeki spanlara yeniden akış
            const spans = c.querySelectorAll('.smoke span');
            spans.forEach(s => {
                s.style.animation = 'none';
                // reflow
                void s.offsetWidth;
                s.style.animation = '';
            });
        }
    });
    micHint.textContent = 'Dileklerini tut 🎁';
    
    // Kutlama gösterisini başlat
    startCelebration();
    
    const wish = document.getElementById('wish');
    if(wish){
        wish.classList.remove('hidden');
        // Küçük gecikmeyle fade-in daha zarif görünür
        requestAnimationFrame(() => requestAnimationFrame(() => wish.classList.add('show')));
    }
}

// Kutlama gösterisi
function startCelebration() {
    const celebration = document.getElementById('celebration');
    if (celebration) {
        celebration.classList.remove('hidden');
        
            // 8 saniye sonra kutlama gösterisini gizle
        setTimeout(() => {
            celebration.classList.add('hidden');
            }, 8000);
    }
}

// Mikrofonla üfleme algılama
let audioStream;
let audioContext;
let analyser;
let timeData;
let freqData;
let isBlown = false;
let baseNoise = 0; // dinamik kalibrasyon
let calibrated = false;

async function initMic() {
    // Güvenli bağlam ve API desteği kontrolü
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia desteklenmiyor veya güvenli bağlam değil.');
    micHint.textContent = 'Mikrofon desteklenmiyor. Tarayıcı ayarlarından izin verin.';
        return;
    }
    try {
        // Not: getUserMedia mikrofon için HTTPS veya localhost gerektirir
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(audioStream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        timeData = new Uint8Array(analyser.fftSize);
        freqData = new Uint8Array(analyser.frequencyBinCount);
        // Önce 500ms ortam gürültüsünü kalibre et
        await calibrateNoise(600);
        // Timer'ı sıfırla ve başlat
        micStartTime = performance.now();
        hasShownInitialWarning = false;
        listenForBlow();
        micHint.textContent = 'Hazır! Mikrofona üfleyin ✨';
    } catch (err) {
        console.warn('Mikrofon erişimi alınamadı:', err);
    micHint.textContent = 'Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verin.';
    }
}

function getRMS() {
    analyser.getByteTimeDomainData(timeData);
    let sum = 0;
    // Diferansiyel RMS: DC ve yavaş değişimleri azaltır (üflemenin keskin komponentleri öne çıkar)
    let prev = (timeData[0] - 128) / 128;
    for (let i = 1; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128; // -1..1
        const d = v - prev;
        sum += d * d;
        prev = v;
    }
    return Math.sqrt(sum / (timeData.length - 1)) * 140; // skala artırıldı
}

function calibrateNoise(durationMs = 500) {
    calibrated = false;
    return new Promise(resolve => {
        const start = performance.now();
        let acc = 0; let n = 0; let peak = 0;
        const step = () => {
            const rms = getRMS();
            acc += rms; n++; if (rms > peak) peak = rms;
            if (performance.now() - start < durationMs) {
                requestAnimationFrame(step);
            } else {
                baseNoise = Math.max(1.5, acc / Math.max(1, n)); // diferansiyel RMS için alt sınır (biraz daha düşük)
                // ortama göre esnek eşik
                calibrated = true;
                resolve();
            }
        };
        step();
    });
}

let BLOW_HOLD_MS = 60; // daha hızlı tepki (%65 düşürüldü)
let aboveSince = 0;
let lastWarn = 0;
let hasShownInitialWarning = false; // Bir kerelik uyarı flag'i
let micStartTime = 0; // Mikrofon başlama zamanı

function listenForBlow() {
    const blowWarning = document.getElementById('blow-warning');
    const now = performance.now();
    const rms = getRMS();
    // Gürültüye göre marj (%65 düşürüldü): sessizde 1.6, gürültüde 2.8'e kadar
    const margin = Math.max(1.6, Math.min(2.8, 1.25 + (baseNoise / 60)));
    const dynamicThreshold = Math.min(35, baseNoise + margin);

    // Ek: üflemede yüksek frekans içeriği artar; 2kHz-6kHz bandına basit bir bakış
    analyser.getByteFrequencyData(freqData);
    const len = freqData.length;
    const sampleRate = audioContext?.sampleRate || 44100; // gerçek sampleRate kullan
    const binHz = (sampleRate / 2) / len;
    const from = Math.floor(2000 / binHz);
    const to = Math.min(len - 1, Math.floor(6000 / binHz));
    let hfSum = 0; let hfN = 0;
    for (let i = from; i <= to; i++) { hfSum += freqData[i]; hfN++; }
    const hfAvg = hfN ? (hfSum / hfN) : 0; // 0..255

    // görsel olarak hafif kıs: çok yüksekte dim kaldır
    candles.forEach(c => c.classList.toggle('dim', rms < dynamicThreshold));

    // Gürültü seviyesine göre HF eşiği (%65 düşürüldü): daha kolay tetikleme için
    const hfThreshold = Math.max(9.5, Math.min(16.5, 13 + (baseNoise - 15) * 0.25));
    // RMS ve yüksek frekans birlikte sağlanmalı
    const blowDetected = (rms > dynamicThreshold) && (hfAvg > hfThreshold);
    debugEl.textContent = `RMS: ${rms.toFixed(1)} (Eşik: ${dynamicThreshold.toFixed(1)}) | HF: ${hfAvg.toFixed(0)} (Eşik: ${hfThreshold.toFixed(0)}) | Algılandı: ${blowDetected ? 'EVET' : 'HAYIR'}`;

    // Bir kerelik uyarı göster (mikrofon başladıktan 3 saniye sonra)
    if (!hasShownInitialWarning && blowWarning && !isBlown && (now - micStartTime) > 3000) {
        hasShownInitialWarning = true;
        blowWarning.classList.add('show');
        setTimeout(() => blowWarning.classList.remove('show'), 2000);
    }

    if (blowDetected) {
        if (blowWarning) blowWarning.classList.remove('show');
        if (aboveSince === 0) aboveSince = now;
        if (now - aboveSince > BLOW_HOLD_MS && !isBlown) {
            isBlown = true;
            extinguishCandles();
            stopMic();
            return;
        }
    } else {
        aboveSince = 0;
        // Yeterince güçlü üfleme yoksa uyarı göster - daha kolay koşul (%65 düşürüldü)
        if (blowWarning && !isBlown && (rms > (baseNoise + 0.35) || hfAvg > 5.2)) {
            // Biraz ses var ama yeterli değil - sadece her 1.2 saniyede bir göster
            if (now - lastWarn > 1200) {
                blowWarning.classList.add('show');
                lastWarn = now;
                setTimeout(() => blowWarning.classList.remove('show'), 1500);
            }
        }
    }

    requestAnimationFrame(listenForBlow);
}

function stopMic() {
    try {
        if (audioStream) { audioStream.getTracks().forEach(t => t.stop()); }
        if (audioContext) { audioContext.close(); }
    } catch (e) { /* no-op */ }
}

// Klavye fallback kaldırıldı.

// Pasta ekranına geçildikten sonra mikrofonu hazırlamayı dene
// Otomatik başlatmayı kaldırdık; buton ile başlatılacak.

// Kullanıcı etkileşimi ile mikrofonu başlat (iOS/Safari politikası)
micBtn?.addEventListener('click', async () => {
    micBtn.disabled = true;
    micBtn.textContent = 'Başlatılıyor…';
    await initMic();
    micBtn.classList.add('hidden');
});


// Modern slider fonksiyonu
const sliderContainer = document.querySelector('.slider-container');
const sliderItems = document.querySelectorAll('.slider-item');
const sliderBtnPrev = document.querySelector('.slider-btn-prev');
const sliderBtnNext = document.querySelector('.slider-btn-next');
let sliderIndex = 0;

function updateSlider() {
    sliderItems.forEach((item, i) => {
        item.style.transform = `translateX(${-sliderIndex * 100}%)`;
    });
    // Butonları her zaman göster, sadece opacity ile kontrol et
    if (sliderBtnPrev) {
        sliderBtnPrev.style.display = 'block';
        sliderBtnPrev.style.opacity = sliderIndex === 0 ? '0.3' : '1';
        sliderBtnPrev.style.pointerEvents = sliderIndex === 0 ? 'none' : 'auto';
    }
    if (sliderBtnNext) {
        sliderBtnNext.style.display = 'block';
        sliderBtnNext.style.opacity = sliderIndex === sliderItems.length - 1 ? '0.3' : '1';
        sliderBtnNext.style.pointerEvents = sliderIndex === sliderItems.length - 1 ? 'none' : 'auto';
    }
}

sliderBtnPrev?.addEventListener('click', () => {
    if (sliderIndex > 0) sliderIndex--;
    updateSlider();
});
sliderBtnNext?.addEventListener('click', () => {
    if (sliderIndex < sliderItems.length - 1) sliderIndex++;
    updateSlider();
});

// Slider ilk açılışta güncellensin
if (sliderContainer && sliderItems.length > 0) {
    updateSlider();
    
    // Dokunmatik gezinme özelliği ekle
    let startX = 0;
    let currentX = 0;
    let isDragging = false;

    sliderContainer.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
    }, { passive: true });

    sliderContainer.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
    }, { passive: true });

    sliderContainer.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        
        const diffX = startX - currentX;
        const threshold = 50; // Minimum kaydırma mesafesi
        
        if (Math.abs(diffX) > threshold) {
            if (diffX > 0 && sliderIndex < sliderItems.length - 1) {
                // Sağa kaydırma - sonraki resim
                sliderIndex++;
                updateSlider();
            } else if (diffX < 0 && sliderIndex > 0) {
                // Sola kaydırma - önceki resim
                sliderIndex--;
                updateSlider();
            }
        }
    }, { passive: true });

    // Fare ile de çalışsın (masaüstü için)
    let mouseStartX = 0;
    let isMouseDragging = false;

    sliderContainer.addEventListener('mousedown', (e) => {
        mouseStartX = e.clientX;
        isMouseDragging = true;
        e.preventDefault();
    });

    sliderContainer.addEventListener('mousemove', (e) => {
        if (!isMouseDragging) return;
        e.preventDefault();
    });

    sliderContainer.addEventListener('mouseup', (e) => {
        if (!isMouseDragging) return;
        isMouseDragging = false;
        
        const diffX = mouseStartX - e.clientX;
        const threshold = 50;
        
        if (Math.abs(diffX) > threshold) {
            if (diffX > 0 && sliderIndex < sliderItems.length - 1) {
                sliderIndex++;
                updateSlider();
            } else if (diffX < 0 && sliderIndex > 0) {
                sliderIndex--;
                updateSlider();
            }
        }
    });

    // Drag'i iptal et
    sliderContainer.addEventListener('mouseleave', () => {
        isMouseDragging = false;
    });
}

// Modern slideshow fonksiyonu
const slideshowTrack = document.querySelector('.slideshow-track');
const slides = document.querySelectorAll('.slide');
const slideshowBtnPrev = document.querySelector('.slideshow-btn-prev');
const slideshowBtnNext = document.querySelector('.slideshow-btn-next');
let slideIndex = 0;

function updateSlideshow() {
    slideshowTrack.style.transform = `translateX(${-slideIndex * 100}%)`;
    // Slideshow butonları için de aynı mantığı uygula
    if (slideshowBtnPrev) {
        slideshowBtnPrev.style.display = 'block';
        slideshowBtnPrev.style.opacity = slideIndex === 0 ? '0.3' : '1';
        slideshowBtnPrev.style.pointerEvents = slideIndex === 0 ? 'none' : 'auto';
    }
    if (slideshowBtnNext) {
        slideshowBtnNext.style.display = 'block';
        slideshowBtnNext.style.opacity = slideIndex === slides.length - 1 ? '0.3' : '1';
        slideshowBtnNext.style.pointerEvents = slideIndex === slides.length - 1 ? 'none' : 'auto';
    }
}

slideshowBtnPrev?.addEventListener('click', () => {
    if (slideIndex > 0) slideIndex--;
    updateSlideshow();
});
slideshowBtnNext?.addEventListener('click', () => {
    if (slideIndex < slides.length - 1) slideIndex++;
    updateSlideshow();
});

// Slideshow ilk açılışta güncellensin
if (slideshowTrack && slides.length > 0) {
    updateSlideshow();
    
    // Slideshow için de dokunmatik gezinme ekle
    let slideStartX = 0;
    let slideCurrentX = 0;
    let isSlideDragging = false;

    slideshowTrack.addEventListener('touchstart', (e) => {
        slideStartX = e.touches[0].clientX;
        isSlideDragging = true;
    }, { passive: true });

    slideshowTrack.addEventListener('touchmove', (e) => {
        if (!isSlideDragging) return;
        slideCurrentX = e.touches[0].clientX;
    }, { passive: true });

    slideshowTrack.addEventListener('touchend', (e) => {
        if (!isSlideDragging) return;
        isSlideDragging = false;
        
        const diffX = slideStartX - slideCurrentX;
        const threshold = 50;
        
        if (Math.abs(diffX) > threshold) {
            if (diffX > 0 && slideIndex < slides.length - 1) {
                slideIndex++;
                updateSlideshow();
            } else if (diffX < 0 && slideIndex > 0) {
                slideIndex--;
                updateSlideshow();
            }
        }
    }, { passive: true });

    // Slideshow için fare desteği
    let slideMouseStartX = 0;
    let isSlideMouseDragging = false;

    slideshowTrack.addEventListener('mousedown', (e) => {
        slideMouseStartX = e.clientX;
        isSlideMouseDragging = true;
        e.preventDefault();
    });

    slideshowTrack.addEventListener('mousemove', (e) => {
        if (!isSlideMouseDragging) return;
        e.preventDefault();
    });

    slideshowTrack.addEventListener('mouseup', (e) => {
        if (!isSlideMouseDragging) return;
        isSlideMouseDragging = false;
        
        const diffX = slideMouseStartX - e.clientX;
        const threshold = 50;
        
        if (Math.abs(diffX) > threshold) {
            if (diffX > 0 && slideIndex < slides.length - 1) {
                slideIndex++;
                updateSlideshow();
            } else if (diffX < 0 && slideIndex > 0) {
                slideIndex--;
                updateSlideshow();
            }
        }
    });

    slideshowTrack.addEventListener('mouseleave', () => {
        isSlideMouseDragging = false;
    });
}
